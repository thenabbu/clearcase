/* /api/cases — the board backend, session-gated.
   GET    -> list cases (both roles see the board)
   PATCH  -> doctor sets a case to pending | accepted | escalated, optional note
   DELETE -> remove a case photo
   Credentials never reach the client. */
const { creds, readSession, listCases, destroyCase, setReview } = require('./_lib');

const REVIEWS = ['pending', 'accepted', 'escalated'];

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session) { res.status(401).json({ error: 'not signed in' }); return; }

  let c;
  try { c = creds(); } catch (e) { res.status(500).json({ error: String(e.message) }); return; }

  try {
    if (req.method === 'GET') {
      res.status(200).json(await listCases(c));
      return;
    }

    if (req.method === 'PATCH') {
      if (session.role !== 'doctor') { res.status(403).json({ error: 'only the reviewing doctor can update a case' }); return; }
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const pid = typeof body.public_id === 'string' ? body.public_id : '';
      const review = typeof body.review === 'string' ? body.review : '';
      if (!pid) { res.status(400).json({ error: 'public_id required' }); return; }
      if (REVIEWS.indexOf(review) === -1) { res.status(400).json({ error: 'review must be one of ' + REVIEWS.join(', ') }); return; }
      await setReview(pid, review, c, { note: body.note });
      res.status(200).json({ updated: pid, review: review });
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

    res.status(405).json({ error: 'GET, PATCH or DELETE only' });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
