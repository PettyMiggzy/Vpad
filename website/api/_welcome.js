// The group welcome for @warheadzsbot. Telegram posts each update to /api/telegram; this decides what to send.
// Pure logic: the caller passes the environment and a fetch, so tests run without Telegram.
const crypto = require('node:crypto');
const hype = require('./_hype');
const { makeTidy, _reset: resetTidy } = require('./_tidy');
const { ce, row, button, sendRich, visibleLength } = require('./_style');

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
    `${ce('coin')} <b>WELCOME TO THE SQUAD</b> ${ce('coin')}\n\n` +
    `<a href="tg://user?id=${Number(user.id)}">${name}</a>, you just landed in the home of two things:\n\n` +
    `${ce('rifle')} <b>WARHEADZ</b>: the launchpad\n` +
    '<blockquote>Spin up a token and watch it trade. Testnet for now.</blockquote>\n' +
    `${ce('ape')} <b>VYRE BAD LANDS</b>: the free first-person shooter\n` +
    '<blockquote>Pick a team, grab a loadout, drop in from your phone or browser. Play money only.</blockquote>\n\n' +
    '<b>Kill streaks pay out</b>\n' +
    `<blockquote>${ce('ammo')} 4 kills: bottomless ammo\n${ce('crate')} 7 kills: supply crate\n${ce('sniper')} 10 kills: Juggernaut\n${ce('barrel')} 12 kills: barrage</blockquote>\n\n` +
    `${row('frog', 'bulldog', 'ape', 'raccoon')} <i>Say hi and drop your best streak.</i>`;
  const keyboard = {
    inline_keyboard: [
      [button('Play Vyre Bad Lands', LINKS.play, 'success', 'sniper')],
      [button('WARHEADZ', LINKS.pad, 'primary', 'coin'), button('Website', LINKS.site)],
      [button('Bad Lands stickers', LINKS.stickersBadLands, undefined, 'frog'), button('WARHEADZ stickers', LINKS.stickersWarheadz, undefined, 'ape')],
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

async function sendWelcome(fetchFn, env, chatId, user) {
  const track = env._tidy?.tracker('welcome');
  const { text, keyboard } = welcomeFor(user);
  const token = env.TELEGRAM_BOT_TOKEN;
  if (env.WELCOME_VIDEO_URL && visibleLength(text) <= 1024) {
    if (await sendRich(fetchFn, token, 'sendVideo', { chat_id: chatId, video: env.WELCOME_VIDEO_URL, caption: text, parse_mode: 'HTML', reply_markup: keyboard, supports_streaming: true }, track)) return true;
  }
  return sendRich(fetchFn, token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } }, track);
}

/**
 * Handles one update. Returns { status, sent } and never throws: Telegram retries anything that is not a 200, and a retry storm helps nobody.
 * env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WELCOME_CHAT_ID, WELCOME_OWNER_IDS (comma list), WELCOME_VIDEO_URL (optional), WELCOME and HYPE (each set to "off" to stop that part), BOT_USERNAME (default warheadzsbot)
 */
async function handleUpdate(headers, update, env, fetchFn, now, rng) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return { status: 503, sent: false };
  if (!sameSecret(headers['x-telegram-bot-api-secret-token'], env.TELEGRAM_WEBHOOK_SECRET)) return { status: 401, sent: false };
  if (!update || typeof update !== 'object') return { status: 200, sent: false };
  const owners = new Set(String(env.WELCOME_OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
  try {
    // somebody joined the welcome group
    const cm = update.chat_member;
    if (cm && String(cm.chat?.id) === String(env.WELCOME_CHAT_ID) && !isJoin(cm)) return { status: 200, sent: false, why: `not a join (${cm.old_chat_member?.status} to ${cm.new_chat_member?.status})` };
    if (cm && String(cm.chat?.id) === String(env.WELCOME_CHAT_ID)) {
      if (String(env.WELCOME || '').toLowerCase() === 'off') return { status: 200, sent: false, why: 'welcome switched off' };
      const user = cm.new_chat_member.user;
      if (!firstTime(`${user.id}:${cm.date}`, now)) return { status: 200, sent: false, why: 'already answered' };
      if (!allow(now)) return { status: 200, sent: false, why: 'too many welcomes in a minute' };
      await env._tidy?.removeKind(cm.chat.id, 'welcome');           // the last welcome goes when a new one comes
      const sent = await sendWelcome(fetchFn, env, cm.chat.id, user);
      if (sent) await hype.milestone(fetchFn, env, cm.chat.id);
      return { status: 200, sent, why: sent ? 'welcomed' : 'telegram refused the welcome' };
    }
    // the owner asks for a preview, in a private chat with the bot or in the group
    const m = update.message;
    if (m && typeof m.text === 'string' && /^\/testwelcome(@\w+)?(\s|$)/.test(m.text) && m.from && owners.has(String(m.from.id))) {
      const here = m.chat && (m.chat.type === 'private' || String(m.chat.id) === String(env.WELCOME_CHAT_ID));
      if (here) return { status: 200, sent: await sendWelcome(fetchFn, env, m.chat.id, m.from) };
    }
    if (m) return { status: 200, sent: await hype.onMessage(m, env, fetchFn, now, rng) };
  } catch { /* a failed send is not worth a retry storm */ }
  return { status: 200, sent: false };
}

/** the public entry: handles the update, then tidies up (see _tidy.js). TIDY_MINUTES (default 10) is how long the bot's posts stay; 0 keeps them. */
async function handle(headers, update, env, fetchFn = fetch, now = Date.now(), rng = Math.random) {
  const ok = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && sameSecret(headers['x-telegram-bot-api-secret-token'], env.TELEGRAM_WEBHOOK_SECRET);
  const tidy = ok ? makeTidy(env, fetchFn, now) : null;
  let r;
  try { r = await handleUpdate(headers, update, tidy ? { ...env, _tidy: tidy } : env, fetchFn, now, rng); }
  finally { if (tidy) await tidy.finish(); }
  return tidy ? { ...r, tidy: { ...tidy.stats } } : r;
}

module.exports = { handle, welcomeFor, isJoin, LINKS, _reset: () => { recent.length = 0; seen.clear(); hype._reset(); resetTidy(); } };
