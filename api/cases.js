/* Vercel serverless function — the board backend.
   GET    /api/cases -> list cases (Cloudinary Admin API, folder prefix, context metadata)
   DELETE /api/cases -> destroy a case photo (public_id must be inside the case folder)
   Credentials never reach the client. No auth: demo-grade, documented in the Notion doc. */
const crypto = require('crypto');

const CLOUD = 'ydyp2esm';
const FOLDER = 'clearcase_cases';

function creds() {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!key || !secret) throw new Error('server env missing Cloudinary credentials');
  return { key, secret };
}

async function listCases({ key, secret }) {
  const url = 'https://api.cloudinary.com/v1_1/' + CLOUD + '/resources/image'
    + '?type=upload&prefix=' + encodeURIComponent(FOLDER + '/')
    + '&max_results=100&sort_by=created_at%3Adesc&context=true';
  const r = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64') } });
  if (!r.ok) throw new Error('admin list HTTP ' + r.status);
  const j = await r.json();
  return (j.resources || []).map((res) => {
    const ctx = res.context || {};
    const cu = ctx.custom || ctx; // context shape differs across API versions
    const pid = res.public_id || '';
    return {
      id: pid.split('/').pop(),
      public_id: pid,
      created_at: res.created_at,
      bytes: res.bytes || 0,
      width: res.width || 0,
      height: res.height || 0,
      level: cu.level || 'green',
      signs: cu.signs || 'none',
      guardian: cu.guardian === '1'
    };
  });
}

async function destroyCase(publicId, { key, secret }) {
  if (!publicId.startsWith(FOLDER + '/')) throw new Error('public_id outside case folder');
  const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'upload' };
  // raw join, verified against the live 401 string-to-sign:
  // 'public_id=clearcase_cases/<id>&timestamp=…&type=upload' (a '/' must stay raw)
  const toSign = Object.keys(params).sort().map((k) => k + '=' + params[k]).join('&');
  const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');
  const body = new URLSearchParams(Object.assign({}, params, { api_key: key, signature: signature }));
  const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/destroy', { method: 'POST', body });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('destroy failed: ' + (j.error && j.error.message || 'HTTP ' + r.status));
  return j;
}

module.exports = async (req, res) => {
  try {
    const c = creds();
    if (req.method === 'GET') {
      const cases = await listCases(c);
      res.status(200).json(cases);
      return;
    }
    if (req.method === 'DELETE') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const pid = typeof body.public_id === 'string' ? body.public_id : '';
      if (!pid) { res.status(400).json({ error: 'public_id required' }); return; }
      await destroyCase(pid, c);
      res.status(200).json({ deleted: pid });
      return;
    }
    res.status(405).json({ error: 'GET or DELETE only' });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
};
