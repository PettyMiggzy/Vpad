// Group hype for @warheadzsbot: member milestones, reactions on streak talk and screenshots, and a few commands anybody can use.
// Pure logic like _welcome.js: the caller passes the environment, a fetch and a random source.
const { ce, row, button, sendRich } = require('./_style');

const LINKS = {
  play: 'https://play.vyrebadlands.com',
  dust: 'https://play.vyrebadlands.com/?mode=challenge&type=dm&min=10&map=dust&a=BLUE&b=RED',
  cargo: 'https://play.vyrebadlands.com/?mode=challenge&type=elim&map=cargo&a=BLUE&b=RED',
  pad: 'https://pad.vyrebadlands.com',
  site: 'https://vyrebadlands.com',
  stickersBadLands: 'https://t.me/addstickers/vyre_bad_lands_by_warheadzsbot',
  stickersWarheadz: 'https://t.me/addstickers/warheadz_by_warheadzsbot',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LINES = [
  'Bottomless ammo kicks in at 4 kills. Don\'t miss. 🔥',
  'Supply crates drop at 7 kills. First one there takes the gun. 📦',
  'Ten kills and you\'re a Juggernaut. Who has done it? 💪',
  'The killcam doesn\'t lie. Post your best one. 🎬',
  'Four maps live: Cargo Yard, Dust Town, Refinery and Test Site. Pick your fight. 🗺️',
  'Phone or browser, the lobby is open. Tap Play and you\'re in. 🔫',
  'Drop your highest streak below. Let\'s see the numbers. 🏆',
  'Snipers: Dust Town and Cargo Yard have your name on them. 🎯',
  'WARHEADZ is where the tokens launch. Vyre Bad Lands is where we settle it. 💥',
  'Squad up. Two teams, one map, no mercy. ⚔️',
  'New here? Tap Play, pick a class, and you\'re in a match fast. ⚡',
  'Grab the sticker packs and flex in every chat. 🐸',
  'Twelve kills in a row calls a barrage on five of them. Dream big. 🚀',
  'Who\'s on the board tonight? Say it loud. 📣',
];

const KEYWORDS = /\b(streak|juggernaut|supply crate|killcam|headshot|clutch|ace|lfg|gg|warheadz|bad ?lands|let'?s go)\b/i;
const ICONS = ['coin', 'frog', 'bulldog', 'ape', 'raccoon', 'crate', 'sniper', 'rifle', 'smg', 'lmg', 'barrel', 'medkit'];
const REACTIONS = ['🔥', '💯', '🏆', '⚡', '🎉', '👏', '🤩'];

/** every 25 up to 100, every 50 up to 1,000, every 250 after that */
const isMilestone = (n) => n >= 25 && (n <= 100 ? n % 25 === 0 : n <= 1000 ? n % 50 === 0 : n % 250 === 0);

const COOLDOWN_MS = { hype: 20_000, play: 15_000, lfg: 60_000, stickers: 30_000 };
const last = new Map();
/** true when this chat may use the command now (and starts its pause) */
function ready(chatId, cmd, now) {
  const k = `${chatId}:${cmd}`;
  if (last.has(k) && now - last.get(k) < COOLDOWN_MS[cmd]) return false;
  last.set(k, now);
  if (last.size > 500) for (const [key, t] of last) if (now - t > 5 * 60_000) last.delete(key);
  return true;
}

const kb = {
  play: () => ({ inline_keyboard: [[button('Play Vyre Bad Lands', LINKS.play, 'success', 'sniper')], [button('WARHEADZ', LINKS.pad, 'primary', 'coin'), button('Website', LINKS.site)]] }),
  lfg: () => ({ inline_keyboard: [[button('Join the lobby', LINKS.play, 'success', 'sniper')], [button('Dust Town deathmatch', LINKS.dust, 'danger', 'rifle'), button('Cargo Yard elimination', LINKS.cargo, 'danger', 'smg')]] }),
  stickers: () => ({ inline_keyboard: [[button('Bad Lands stickers', LINKS.stickersBadLands, undefined, 'frog')], [button('WARHEADZ stickers', LINKS.stickersWarheadz, undefined, 'ape')]] }),
};

async function call(fetchFn, token, method, body) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
const sendHtml = (fetchFn, env, chat_id, text, reply_markup, extra = {}) =>
  sendRich(fetchFn, env.TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true }, ...extra }, env._tidy?.tracker('post'));

const pick = (arr, rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** a milestone post when the group has just reached one */
async function milestone(fetchFn, env, chatId) {
  if (String(env.HYPE || '').toLowerCase() === 'off') return false;
  const r = await call(fetchFn, env.TELEGRAM_BOT_TOKEN, 'getChatMemberCount', { chat_id: chatId });
  const n = Number(r.result);
  if (!r.ok || !isMilestone(n)) return false;
  return sendHtml(fetchFn, env, chatId, `${row('coin', 'coin', 'coin')} <b>${n} IN THE SQUAD</b> ${row('coin', 'coin', 'coin')}\n<blockquote>The group keeps growing. Spawn in, pick a loadout and push your streak.</blockquote>`, kb.play());
}

/**
 * A message in the welcome group or the bot's private chat: commands anybody can use, and reactions on streak talk and screenshots.
 * Returns true when it did something.
 */
async function onMessage(m, env, fetchFn, now, rng) {
  if (!m || !m.chat || !m.from || m.from.is_bot) return false;
  if (String(env.HYPE || '').toLowerCase() === 'off') return false;
  const inGroup = String(m.chat.id) === String(env.WELCOME_CHAT_ID), isPrivate = m.chat.type === 'private';
  if (!inGroup && !isPrivate) return false;
  const text = typeof m.text === 'string' ? m.text : typeof m.caption === 'string' ? m.caption : '';
  const botName = String(env.BOT_USERNAME || 'warheadzsbot').toLowerCase();
  const c = /^\/(hype|play|lfg|stickers)(?:@(\w+))?(?:\s+([\s\S]*))?$/i.exec(text);
  if (c) {
    if (c[2] && c[2].toLowerCase() !== botName) return false;
    const cmd = c[1].toLowerCase();
    if (!ready(m.chat.id, cmd, now)) return false;
    if (cmd === 'hype') return sendHtml(fetchFn, env, m.chat.id, `${ce(pick(ICONS, rng))} <b>HYPE</b>\n<blockquote>${esc(pick(LINES, rng))}</blockquote>`, kb.play());
    if (cmd === 'play') return sendHtml(fetchFn, env, m.chat.id, `${row('sniper', 'rifle', 'smg')} <b>VYRE BAD LANDS IS OPEN</b>\n<blockquote>Free, in your browser, phone or computer. Play money only.</blockquote>`, kb.play());
    if (cmd === 'stickers') return sendHtml(fetchFn, env, m.chat.id, `${row('frog', 'bulldog', 'ape', 'raccoon')}\n<b>Two sticker packs</b>, both made for this group.`, kb.stickers());
    if (cmd === 'lfg') {
      const who = `<a href="tg://user?id=${Number(m.from.id)}">${esc(m.from.first_name || m.from.username || 'Someone').slice(0, 40)}</a>`;
      const note = (c[3] || '').trim().slice(0, 120);
      return sendHtml(fetchFn, env, m.chat.id, `${ce('rifle')} ${who} <b>is looking for a match!</b>${note ? `\n<blockquote>${esc(note)}</blockquote>` : ''}\nJump into the lobby and squad up.`, kb.lfg());
    }
  }
  // reactions: a little fire on streak talk and on screenshots and clips, never on every message
  if (inGroup && !c && m.message_id) {
    const media = !!(m.photo || m.video || m.animation);
    const hit = media ? rng() < 0.5 : KEYWORDS.test(text) && rng() < 0.4;
    if (hit) return !!(await call(fetchFn, env.TELEGRAM_BOT_TOKEN, 'setMessageReaction', { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: pick(REACTIONS, rng) }] })).ok;
  }
  return false;
}

module.exports = { onMessage, milestone, isMilestone, LINES, LINKS, KEYWORDS, _reset: () => last.clear() };
