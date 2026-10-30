/* Auth: POST /api/auth { role: 'worker'|'doctor', demo?: true } -> sets session cookie
         DELETE /api/auth -> clears it
         GET    /api/auth -> who am I
   Demo login is the only login: one click, prefilled identity, no signup. */
const { DEMO, readSession, setSession, clearSession } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const s = readSession(req);
    if (!s) { res.status(200).json({ user: null }); return; }
    res.status(200).json({ user: { username: s.username, role: s.role, name: s.name, sub: s.sub, initials: s.initials } });
    return;
  }

  if (req.method === 'DELETE') {
    clearSession(res);
    res.status(200).json({ user: null });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'GET, POST or DELETE only' }); return; }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const role = body.role === 'doctor' ? 'doctor' : body.role === 'worker' ? 'worker' : '';
  if (!role) { res.status(400).json({ error: "role must be 'worker' or 'doctor'" }); return; }

  const acct = DEMO[role];
  setSession(res, acct);
  res.status(200).json({ user: { username: acct.username, role: acct.role, name: acct.name, sub: acct.sub, initials: acct.initials } });
};
