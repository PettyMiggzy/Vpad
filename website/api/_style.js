// How the bot's posts look: the animated custom emoji from our own emoji set (WARHEADZ Squad and the coin), coloured buttons with icons,
// and quote blocks. If Telegram refuses the rich version for any reason, the same words go out plain (see sendRich).

/** custom emoji ids: set warheadz_squad_by_warheadzsbot (t.me/addemoji/warheadz_squad_by_warheadzsbot) and the coin from warheadz_coin_by_warheadzsbot */
const IDS = {
  coin: '5091867077266901042', frog: '5093852047942355363', bulldog: '5096347209192966323', ape: '5094130288808691834', raccoon: '5093901212432992202',
  medkit: '5093691648093718633', crate: '5094101765930880236', ammo: '5093673463202189679', barrel: '5093986424584145268',
  sniper: '5093863833332615409', rifle: '5093791480313546426', smg: '5094092222513547612', lmg: '5095857990943115304',
};
const FALLBACK = { coin: '🪙', frog: '🐸', bulldog: '🐶', ape: '🐵', raccoon: '🦝', medkit: '🩹', crate: '📦', ammo: '🎯', barrel: '🛢', sniper: '🔫', rifle: '🪖', smg: '💥', lmg: '🔥' };

/** an animated emoji inside HTML text (shows its plain emoji where custom ones are not allowed) */
const ce = (name) => `<tg-emoji emoji-id="${IDS[name]}">${FALLBACK[name]}</tg-emoji>`;
const row = (...names) => names.map(ce).join(' ');

/** a link button: style is "primary" (blue), "success" (green) or "danger" (red); icon is the name of one of our emoji */
const button = (text, url, style, icon) => ({ text, url, ...(style ? { style } : {}), ...(icon ? { icon_custom_emoji_id: IDS[icon] } : {}) });

const stripEmoji = (html) => String(html).replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, '$1');
const plainKeyboard = (kb) => kb && { inline_keyboard: kb.inline_keyboard.map((r) => r.map(({ style, icon_custom_emoji_id, ...rest }) => rest)) };
/** the same message without custom emoji, colours or icons */
function plainBody(body) {
  const out = { ...body };
  for (const k of ['text', 'caption']) if (typeof out[k] === 'string') out[k] = stripEmoji(out[k]);
  if (out.reply_markup) out.reply_markup = plainKeyboard(out.reply_markup);
  return out;
}
/** length of a text as Telegram counts it for a caption (tags and custom emoji wrappers do not count) */
const visibleLength = (html) => stripEmoji(html).replace(/<[^>]+>/g, '').replace(/&amp;|&lt;|&gt;|&quot;/g, 'x').length;

/** sends the rich version; when Telegram says no, the plain one. Returns true when either went out. track(chat_id, message_id) is told which message it was. */
async function sendRich(fetchFn, token, method, body, track) {
  const go = async (b) => {
    const r = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    if (j.ok && typeof track === 'function' && j.result && j.result.message_id) { try { track(b.chat_id, j.result.message_id); } catch { /* bookkeeping must not stop a post */ } }
    return !!j.ok;
  };
  if (await go(body)) return true;
  const plain = plainBody(body);
  return JSON.stringify(plain) === JSON.stringify(body) ? false : go(plain);
}

module.exports = { IDS, ce, row, button, sendRich, plainBody, stripEmoji, visibleLength };
