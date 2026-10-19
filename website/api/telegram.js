// Telegram's webhook for @warheadzsbot: welcomes people who join the group. Settings are Vercel environment variables (see _welcome.js).
const { handle } = require('./_welcome');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }
  const r = await handle(req.headers, req.body, process.env);
  res.status(r.status).json({ ok: r.status === 200, sent: r.sent });
};
