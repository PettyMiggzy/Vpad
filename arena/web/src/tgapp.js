// The game as a Telegram Mini App: when the page is opened from inside Telegram it fills the screen, stays in landscape, stops a swipe from closing it,
// takes the player's name from their Telegram profile, and buzzes through Telegram's own haptics (which work on iPhones too).
// Outside Telegram none of this runs and nothing is loaded.
const SDK = 'https://telegram.org/js/telegram-web-app.js';

/** Telegram opens a Mini App with its launch data in the address after the #; a normal visit has none */
export const inTelegram = (hash = globalThis.location?.hash ?? '') => /[#&]tgWebAppData=|[#&]tgWebAppVersion=/.test(hash);

/** a Telegram first name cut down to what the game accepts as a name */
export const nameFrom = (user) => String(user?.first_name || user?.username || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/ +/g, ' ').trim().slice(0, 12);

/** the haptics Telegram gives a Mini App, shaped like the app's haptic plugin so one code path serves both */
export function telegramHaptics(win = globalThis.window) {
  const h = win?.Telegram?.WebApp?.HapticFeedback; if (!h) return null;
  const style = { LIGHT: 'light', MEDIUM: 'medium', HEAVY: 'heavy' };
  return { impact: ({ style: s } = {}) => h.impactOccurred(style[s] ?? 'medium'), notification: ({ type } = {}) => h.notificationOccurred(String(type || 'success').toLowerCase()) };
}

/** loads Telegram's script and sets the page up inside it; onReady(webApp) runs once it is there. Returns false when the page is not in Telegram. */
export function setupTelegram({ win = globalThis.window, doc = globalThis.document, hash = win?.location?.hash, onReady = () => {} } = {}) {
  if (!inTelegram(hash ?? '')) return false;
  const go = () => {
    const w = win.Telegram?.WebApp; if (!w) return;
    const call = (fn) => { try { fn(); } catch { /* an older Telegram lacks it */ } };
    call(() => w.ready()); call(() => w.expand());
    call(() => { if (w.isVersionAtLeast?.('8.0')) w.requestFullscreen?.(); });
    call(() => { if (w.isVersionAtLeast?.('8.0')) w.lockOrientation?.(); });
    call(() => { if (w.isVersionAtLeast?.('7.7')) w.disableVerticalSwipes?.(); });
    call(() => w.setHeaderColor?.('#050805')); call(() => w.setBackgroundColor?.('#050805'));
    onReady(w);
  };
  if (win.Telegram?.WebApp) { go(); return true; }
  const s = doc.createElement('script'); s.src = SDK; s.async = true; s.onload = go; doc.head.appendChild(s);
  return true;
}
