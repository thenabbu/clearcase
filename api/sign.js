/* Vercel serverless function — signs Cloudinary uploads.
   The API secret never leaves the server; the client may only obtain signatures
   for exactly these params: folder + quality_analysis + timestamp. */
const crypto = require('crypto');

module.exports = (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const secret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  if (!secret || !apiKey) { res.status(500).json({ error: 'server env missing CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET' }); return; }

  const params = {
    folder: 'clearcase_cases',
    quality_analysis: 'true',
    timestamp: String(Math.floor(Date.now() / 1000))
  };
  // Optional case metadata (level/signs/guardian) rides with the upload as Cloudinary
  // context, so the board can be listed server-side without a second write.
  // Format is pipe-separated k=v pairs (upload API reference: "alt=My image|caption=…").
  // Signing hashes the value raw exactly as sent (verified against live 401
  // string-to-sign echoes); values must never contain '&' — the server would encode
  // it to %26 and break signature parity.
  const ctx = req.body && typeof req.body.context === 'string' ? req.body.context.slice(0, 400) : '';
  if (ctx && ctx.indexOf('&') === -1) params.context = ctx;
  const toSign = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
  const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');

  res.status(200).json({ signature, timestamp: params.timestamp, apiKey, folder: params.folder });
};
