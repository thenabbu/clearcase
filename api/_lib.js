/* ClearCase shared server helpers — Vercel serverless (Node runtime).
   No database: identity lives in a signed cookie, case data lives in Cloudinary. */
const crypto = require('crypto');

const CLOUD = 'ydyp2esm';
const FOLDER = 'clearcase_cases';

function creds() {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!key || !secret) throw new Error('server env missing Cloudinary credentials');
  return { key, secret };
}

/* Cloudinary signs sha1 of sorted k=v joined by '&', then the secret appended.
   api_key / file / signature / resource_type are NOT part of the signed set. */
function cloudinarySign(params, secret) {
  const toSign = Object.keys(params)
    .filter((k) => ['api_key', 'file', 'signature', 'resource_type'].indexOf(k) === -1)
    .sort()
    .map((k) => k + '=' + params[k])
    .join('&');
  return crypto.createHash('sha1').update(toSign + secret).digest('hex');
}

function basicAuth({ key, secret }) {
  return 'Basic ' + Buffer.from(key + ':' + secret).toString('base64');
}

/* ---------- session cookie: base64(payload).hmac ---------- */
const COOKIE = 'cc_session';
const MAX_AGE = 60 * 60 * 12; // 12 h — a shift, not a permanent login

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.CLOUDINARY_API_SECRET;
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return body + '.' + mac;
}

function readSession(req) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!part) return null;
  const token = part.slice(COOKIE.length + 1);
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!s.exp || s.exp < Date.now()) return null;
    return s;
  } catch (e) {
    return null;
  }
}

function setSession(res, payload) {
  const token = signSession(Object.assign({}, payload, { exp: Date.now() + MAX_AGE * 1000 }));
  res.setHeader('Set-Cookie', COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + MAX_AGE + (process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (process.env.VERCEL ? '; Secure' : ''));
}

/* ---------- demo accounts (prefilled, no signup flow) ---------- */
const DEMO = {
  worker: { username: 'asha', role: 'worker', name: 'Asha Devi', sub: 'ASHA worker · PHC Baraut', initials: 'AD' },
  doctor: { username: 'rao', role: 'doctor', name: 'Dr. Meera Rao', sub: 'Reviewing physician · District Hospital', initials: 'MR' }
};

/* ---------- Cloudinary Admin: list cases ---------- */
function parseCase(res) {
  const ctx = res.context || {};
  const cu = ctx.custom || ctx; // shape differs across API versions
  const pid = res.public_id || '';
  /* focus lives in the context we wrote at upload (Admin listing has no quality_analysis) */
  const focus = cu.focus && isFinite(Number(cu.focus)) ? Number(cu.focus) : null;
  return {
    id: pid.split('/').pop(),
    public_id: pid,
    created_at: res.created_at,
    bytes: res.bytes || 0,
    width: res.width || 0,
    height: res.height || 0,
    format: res.format || '',
    level: cu.level || 'green',
    signs: cu.signs || 'none',
    guardian: cu.guardian === '1',
    patient: cu.patient || '',
    age: cu.age || '',
    village: cu.village || '',
    complaint: cu.complaint || '',
    notes: cu.notes || '',
    focus: focus,
    review: cu.review || 'pending', // pending | accepted | escalated
    fixture: cu.fixture === '1',      // seeded sample case, not a real patient
    tags: res.tags || []
  };
}

async function listCases(c, { review } = {}) {
  const url =
    'https://api.cloudinary.com/v1_1/' + CLOUD + '/resources/image' +
    '?type=upload&prefix=' + encodeURIComponent(FOLDER + '/') +
    '&max_results=100&sort_by=created_at%3Adesc&context=true&tags=true';
  const r = await fetch(url, { headers: { Authorization: basicAuth(c) } });
  if (!r.ok) throw new Error('admin list HTTP ' + r.status);
  const j = await r.json();
  let cases = (j.resources || []).map(parseCase);
  if (review) cases = cases.filter((x) => x.review === review);
  return cases;
}

async function destroyCase(publicId, c) {
  if (!publicId.startsWith(FOLDER + '/')) throw new Error('public_id outside case folder');
  const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'upload' };
  params.signature = cloudinarySign(params, c.secret);
  params.api_key = c.key;
  const body = new URLSearchParams(params);
  const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/destroy', { method: 'POST', body });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('destroy failed: ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
  return j;
}

/* Update the review state of a case by rewriting its Cloudinary context.
   Cloudinary's context update is additive on keys given; we resend all keys. */
async function setReview(publicId, review, c, extra) {
  if (!publicId.startsWith(FOLDER + '/')) throw new Error('public_id outside case folder');
  const existing = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUD + '/resources/image/upload?public_ids[]=' + encodeURIComponent(publicId) + '&context=true',
    { headers: { Authorization: basicAuth(c) } }
  ).then((r) => r.json());
  const res = (existing.resources || [])[0];
  if (!res) throw new Error('case not found');
  const cu = Object.assign({}, (res.context && (res.context.custom || res.context)) || {});
  cu.review = review;
  if (extra && extra.note) cu.clinicNote = String(extra.note).slice(0, 200);
  const ctx = Object.keys(cu).map((k) => k + '=' + String(cu[k]).replace(/[|=&]/g, ' ')).join('|');
  const params = {
    public_id: publicId,
    type: 'upload',
    context: ctx,
    timestamp: String(Math.floor(Date.now() / 1000))
  };
  params.signature = cloudinarySign(params, c.secret);
  params.api_key = c.key;
  const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/explicit', {
    method: 'POST',
    body: new URLSearchParams(params)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('context update failed: ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
  return j;
}

module.exports = {
  CLOUD, FOLDER, DEMO,
  creds, cloudinarySign, basicAuth,
  signSession, readSession, setSession, clearSession,
  listCases, destroyCase, setReview, parseCase
};
