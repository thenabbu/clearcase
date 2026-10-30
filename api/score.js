/* POST /api/score — records the measured focus score into the asset's context.
   The widget knows the score only after the upload finishes, and the signature has
   already been spent by then, so this is a second, tiny signed call.

   This matters because Cloudinary's Admin listing does not return quality_analysis
   per resource; without this write the doctor's queue could not show the score that
   the gate acted on. */
const { CLOUD, creds, cloudinarySign, readSession, FOLDER } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const session = readSession(req);
  if (!session) { res.status(401).json({ error: 'not signed in' }); return; }

  const b = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const pid = typeof b.public_id === 'string' ? b.public_id : '';
  if (!pid.startsWith(FOLDER + '/')) { res.status(400).json({ error: 'public_id must be inside ' + FOLDER }); return; }

  const focus = typeof b.focus === 'number' && isFinite(b.focus) ? b.focus.toFixed(3) : '';
  const bytes = typeof b.bytes === 'number' && isFinite(b.bytes) ? String(Math.round(b.bytes)) : '';

  let c;
  try { c = creds(); } catch (e) { res.status(500).json({ error: String(e.message) }); return; }

  try {
    /* read the context we signed at upload time, then append the measurements */
    const cur = await fetch(
      'https://api.cloudinary.com/v1_1/' + CLOUD + '/resources/image/upload?public_ids[]=' + encodeURIComponent(pid) + '&context=true',
      { headers: { Authorization: 'Basic ' + Buffer.from(c.key + ':' + c.secret).toString('base64') } }
    ).then((r) => r.json());

    const found = (cur.resources || [])[0];
    if (!found) { res.status(404).json({ error: 'asset not found' }); return; }

    const ctx = Object.assign({}, (found.context && (found.context.custom || found.context)) || {});
    if (focus) ctx.focus = focus;
    if (bytes) ctx.upload_bytes = bytes;

    const ctxStr = Object.keys(ctx)
      .map((k) => k + '=' + String(ctx[k]).replace(/[|=&]/g, ' '))
      .join('|');

    const params = {
      public_id: pid,
      type: 'upload',
      context: ctxStr,
      timestamp: String(Math.floor(Date.now() / 1000))
    };
    params.signature = cloudinarySign(params, c.secret);
    params.api_key = c.key;

    const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/explicit', {
      method: 'POST',
      body: new URLSearchParams(params)
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);

    res.status(200).json({ updated: pid, focus: ctx.focus || null });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
