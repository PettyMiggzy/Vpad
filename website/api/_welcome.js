// The group welcome for @warheadzsbot. Telegram posts each update to /api/telegram; this decides what to send.
// Pure logic: the caller passes the environment and a fetch, so tests run without Telegram.
const crypto = require('node:crypto');

const LINKS = {
  play: 'https://play.vyrebadlands.com',
  site: 'https://vyrebadlands.com',
  pad: 'https://pad.vyrebadlands.com',
  stickersBadLands: 'https://t.me/addstickers/vyre_bad_lands_by_warheadzsbot',
  stickersWarheadz: 'https://t.me/addstickers/warheadz_by_warheadzsbot',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** the welcome as Telegram HTML plus its buttons, for one person */
function welcomeFor(user) {
  const name = esc(user.first_name || user.username || 'friend').slice(0, 60);
  const text =
    `Welcome <a href="tg://user?id=${Number(user.id)}">${name}</a>! 💥\n\n` +
    'You just landed in the home of two things:\n\n' +
    '🚀 <b>WARHEADZ</b>: the launchpad. Spin up a token and watch it trade (testnet for now).\n' +
    '🔫 <b>Vyre Bad Lands</b>: our free first-person shooter. Pick a team, grab a loadout, jump in from your phone or browser. Play money only.\n\n' +
    'Kill streaks pay out: bottomless ammo at 4, supply crates at 7, Juggernaut at 10. Go get them.\n\n' +
    'Say hi and drop your best streak.';
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔫 Play Vyre Bad Lands', url: LINKS.play }],
      [{ text: '🚀 WARHEADZ', url: LINKS.pad }, { text: 'Website', url: LINKS.site }],
      [{ text: 'Bad Lands stickers', url: LINKS.stickersBadLands }, { text: 'WARHEADZ stickers', url: LINKS.stickersWarheadz }],
    ],
  };
  return { text, keyboard };
}

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const JOINED = new Set(['member', 'restricted']);
const GONE = new Set(['left', 'kicked']);
/** a real arrival: they were outside (or never there) and are now in; a restricted person counts only while still a member */
function isJoin(cm) {
  const o = cm?.old_chat_member, n = cm?.new_chat_member;
  if (!o || !n || !n.user || n.user.is_bot) return false;
  const was = GONE.has(o.status) || (o.status === 'restricted' && o.is_member === false);
  const now = n.status === 'member' || (n.status === 'restricted' && n.is_member === true);
  return was && now;
}

// the last welcomes sent by this instance (a raid of joins must not turn the group into a wall of text), and the joins already answered
const recent = [];
const seen = new Map();
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 6;
function allow(now) {
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
  if (recent.length >= MAX_PER_WINDOW) return false;
  recent.push(now);
  return true;
}
function firstTime(key, now) {
  for (const [k, t] of seen) if (now - t > 10 * 60_000) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

async function call(fetchFn, token, method, body) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return j;
}

async function sendWelcome(fetchFn, env, chatId, user) {
  const { text, keyboard } = welcomeFor(user);
  const token = env.TELEGRAM_BOT_TOKEN;
  if (env.WELCOME_VIDEO_URL) {
    const r = await call(fetchFn, token, 'sendVideo', { chat_id: chatId, video: env.WELCOME_VIDEO_URL, caption: text.slice(0, 1024), parse_mode: 'HTML', reply_markup: keyboard, supports_streaming: true });
    if (r.ok) return true;
  }
  const r = await call(fetchFn, token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } });
  return !!r.ok;
}

/**
 * Handles one update. Returns { status, sent } and never throws: Telegram retries anything that is not a 200, and a retry storm helps nobody.
 * env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WELCOME_CHAT_ID, WELCOME_OWNER_IDS (comma list), WELCOME_VIDEO_URL (optional), WELCOME (set to "off" to stop)
 */
async function handle(headers, update, env, fetchFn = fetch, now = Date.now()) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return { status: 503, sent: false };
  if (!sameSecret(headers['x-telegram-bot-api-secret-token'], env.TELEGRAM_WEBHOOK_SECRET)) return { status: 401, sent: false };
  if (!update || typeof update !== 'object') return { status: 200, sent: false };
  const owners = new Set(String(env.WELCOME_OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
  try {
    // somebody joined the welcome group
    const cm = update.chat_member;
    if (cm && String(cm.chat?.id) === String(env.WELCOME_CHAT_ID) && isJoin(cm)) {
      if (String(env.WELCOME || '').toLowerCase() === 'off') return { status: 200, sent: false };
      const user = cm.new_chat_member.user;
      if (!firstTime(`${user.id}:${cm.date}`, now) || !allow(now)) return { status: 200, sent: false };
      return { status: 200, sent: await sendWelcome(fetchFn, env, cm.chat.id, user) };
    }
    // the owner asks for a preview, in a private chat with the bot or in the group
    const m = update.message;
    if (m && typeof m.text === 'string' && /^\/testwelcome(@\w+)?(\s|$)/.test(m.text) && m.from && owners.has(String(m.from.id))) {
      const here = m.chat && (m.chat.type === 'private' || String(m.chat.id) === String(env.WELCOME_CHAT_ID));
      if (here) return { status: 200, sent: await sendWelcome(fetchFn, env, m.chat.id, m.from) };
    }
  } catch { /* a failed send is not worth a retry storm */ }
  return { status: 200, sent: false };
}

module.exports = { handle, welcomeFor, isJoin, LINKS, _reset: () => { recent.length = 0; seen.clear(); } };
