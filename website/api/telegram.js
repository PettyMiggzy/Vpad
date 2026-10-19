// Telegram's webhook for @warheadzsbot: welcomes people who join the group and keeps it hyped. Settings are Vercel environment variables (see _welcome.js).
const { handle } = require('./_welcome');

/** one short line per update for the runtime log: what kind it was and what was done, nothing personal beyond ids */
function summary(u, r) {
  const k = u && typeof u === 'object' ? Object.keys(u).find((x) => x !== 'update_id') : null;
  const m = u && (u.message || u.chat_member);
  const cmd = u && u.message && typeof u.message.text === 'string' && u.message.text.startsWith('/') ? u.message.text.split(/\s/)[0].slice(0, 30) : undefined;
  return JSON.stringify({ kind: k, chat: m && m.chat && m.chat.id, cmd, status: r.status, sent: r.sent, why: r.why, tidy: r.tidy });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }
  const r = await handle(req.headers, req.body, process.env);
  console.log('telegram', summary(req.body, r));
  res.status(r.status).json({ ok: r.status === 200, sent: r.sent });
};
