/* POST /api/sign — mints a Cloudinary upload signature.
   Session-gated: only a signed-in field worker may upload.
   The API secret never leaves the server; the client may only obtain signatures
   for exactly the params enumerated here. */
const { creds, cloudinarySign, readSession, FOLDER } = require('./_lib');

/* Cloudinary context values are pipe-delimited k=v pairs. Values must not contain
   '|', '=' or '&' — they would break signature parity and the metadata itself. */
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[|=&]/g, ' ').trim().slice(0, max || 120);
}

module.exports = (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const session = readSession(req);
  if (!session || session.role !== 'worker') {
    res.status(401).json({ error: 'sign in as a field worker to upload' });
    return;
  }

  let c;
  try { c = creds(); } catch (e) { res.status(500).json({ error: String(e.message) }); return; }

  const b = typeof req.body === 'object' && req.body !== null ? req.body : {};

  const level = ['red', 'yellow', 'green'].indexOf(b.level) === -1 ? 'green' : b.level;
  const signs = clean(b.signs, 120) || 'none';
  const guardian = b.guardian ? '1' : '0';
  /* focus is the score the widget measured before calling us; carrying it in the context
     is what makes it readable from the Admin listing (the API does not return
     quality_analysis per resource) */
  const focus = typeof b.focus === 'number' && isFinite(b.focus) ? b.focus.toFixed(3) : '';

  /* Case metadata rides the upload as Cloudinary context, so the board can be
     listed server-side with no database of our own. */
  const context = [
    'level=' + level,
    'signs=' + signs,
    'guardian=' + guardian,
    'patient=' + (clean(b.patient, 60) || 'Unnamed'),
    'age=' + (clean(b.age, 20) || '—'),
    'village=' + (clean(b.village, 60) || '—'),
    'complaint=' + (clean(b.complaint, 140) || '—'),
    'notes=' + (clean(b.notes, 180) || '—'),
    'focus=' + (focus || ''),
    'review=pending'
  ].join('|');

  /* source=uw is injected by the Upload Widget itself and IS part of the string to sign
     (verified against a live 'Invalid Signature' echo). Signing it is mandatory —
     omitting it was what silently broke every upload from the widget. */
  const params = {
    folder: FOLDER,
    quality_analysis: 'true',      // focus score — the blur gate
    source: 'uw',
    tags: 'field,' + level,
    context: context,
    timestamp: String(Math.floor(Date.now() / 1000))
  };
  params.signature = cloudinarySign(params, c.secret);

  res.status(200).json({
    signature: params.signature,
    timestamp: params.timestamp,
    apiKey: c.key,
    folder: params.folder,
    tags: params.tags,
    context: params.context
  });
};
