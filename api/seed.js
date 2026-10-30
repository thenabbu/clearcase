/* POST /api/seed — populates the board with real Cloudinary assets.
   Idempotent: assets live at fixed public_ids inside a demo/ subfolder, so
   re-running overwrites rather than duplicating. Guarded by SEED_TOKEN.
   Not linked from the UI: run it once, then the board simply has data. */
const crypto = require('crypto');
const { CLOUD, FOLDER, creds, cloudinarySign } = require('./_lib');

const DEMO_FOLDER = FOLDER + '/demo';

/* Each seed case: a public sample image (Cloudinary's own demo cloud) plus the
   clinical metadata a field worker would have captured. Focus is computed live
   by quality_analysis at upload, exactly like a real case. */
const SEEDS = [
  {
    id: 'demo-red-wound',
    src: 'https://res.cloudinary.com/demo/image/upload/samples/chair.jpg',
    level: 'red', signs: 'r0,r4', guardian: '1',
    patient: 'Baby of Suman', age: '11 mo', village: 'Baraut Khurd',
    complaint: 'Not drinking since yesterday, fever',
    notes: 'Mother reports two convulsions this morning. Child lethargic.'
  },
  {
    id: 'demo-yellow-rash',
    src: 'https://res.cloudinary.com/demo/image/upload/samples/dessert-on-a-plate.jpg',
    level: 'yellow', signs: 'y1,y2', guardian: '0',
    patient: 'Ramesh Yadav', age: '34 y', village: 'Sarurpur Kalan',
    complaint: 'Widespread rash on arms, 3 days',
    notes: 'Some dehydration signs. Advised ORS, review in 48 h.'
  },
  {
    id: 'demo-green-check',
    src: 'https://res.cloudinary.com/demo/image/upload/samples/coffee.jpg',
    level: 'green', signs: 'none', guardian: '0',
    patient: 'Kavita Singh', age: '27 y', village: 'Baraut Khurd',
    complaint: 'Routine post-natal check',
    notes: 'No danger signs. Routine follow-up scheduled.'
  },
  {
    id: 'demo-red-resp',
    src: 'https://res.cloudinary.com/demo/image/upload/samples/chair-and-coffee-table.jpg',
    level: 'red', signs: 'r5,r6', guardian: '1',
    patient: 'Aarav (child)', age: '2 y', village: 'Binauli',
    complaint: 'Noisy breathing when calm',
    notes: 'Stridor audible. Referred immediately to district hospital.'
  },
  {
    id: 'demo-yellow-face',
    src: 'https://res.cloudinary.com/demo/image/upload/samples/man-portrait.jpg',
    level: 'yellow', signs: 'y0', guardian: '0',
    patient: 'Mohd Irfan', age: '41 y', village: 'Sarurpur Kalan',
    complaint: 'Chest indrawing, cough 5 days',
    notes: 'Fast breathing noted on video call. Review in 24 h.'
  }
];

async function uploadSeed(seed, c) {
  const params = {
    public_id: DEMO_FOLDER + '/' + seed.id,
    // no `folder` param: public_id already carries the full path, and sending both
    // makes Cloudinary prepend the folder a second time
    quality_analysis: 'true',
    overwrite: 'true',
    unique_filename: 'false',
    tags: 'demo,seed',
    context: [
      'level=' + seed.level,
      'signs=' + seed.signs,
      'guardian=' + seed.guardian,
      'patient=' + seed.patient,
      'age=' + seed.age,
      'village=' + seed.village,
      'complaint=' + seed.complaint,
      'notes=' + seed.notes,
      'review=pending',
      'fixture=1'
    ].join('|'),
    timestamp: String(Math.floor(Date.now() / 1000)),
    api_key: c.key,
    file: seed.src
  };
  params.signature = cloudinarySign(params, c.secret);
  const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/upload', {
    method: 'POST',
    body: new URLSearchParams(params)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(seed.id + ': ' + ((j.error && j.error.message) || 'HTTP ' + r.status));

  /* write the measured score back into the context so the listing can show it */
  const focus = j.quality_analysis && j.quality_analysis.focus;
  if (focus != null) {
    const ctx2 = params.context + '|focus=' + Number(focus).toFixed(3);
    const p2 = { public_id: params.public_id, type: 'upload', context: ctx2,
                 timestamp: String(Math.floor(Date.now() / 1000)) };
    p2.signature = cloudinarySign(p2, c.secret);
    p2.api_key = c.key;
    await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/explicit',
      { method: 'POST', body: new URLSearchParams(p2) });
  }
  return { id: seed.id, bytes: j.bytes, focus: focus };
}

module.exports = async (req, res) => {
  const token = req.query && req.query.token;
  const expected = process.env.SEED_TOKEN;
  if (!expected) { res.status(503).json({ error: 'SEED_TOKEN not configured' }); return; }
  if (!token || token.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    res.status(403).json({ error: 'bad seed token' });
    return;
  }
  try {
    const c = creds();
    const done = [];
    for (const seed of SEEDS) done.push(await uploadSeed(seed, c));
    res.status(200).json({ seeded: done.length, cases: done });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
