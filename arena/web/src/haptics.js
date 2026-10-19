import { telegramHaptics } from './tgapp.js';

// Buzz in the hand: a tick for each shot, a jolt when you are hit, a pulse for a kill. The native app uses the phone's own haptic engine
// (Capacitor's Haptics plugin, when the page runs inside the app); a browser on Android uses the Vibration API; an iPhone's browser has neither,
// so there it stays silent (Apple does not offer vibration to web pages).

/** how long a web vibration lasts for each kind of event (milliseconds); a number or a pattern */
export function patternFor(kind, arg) {
  switch (kind) {
    case 'shot': return Math.round(Math.max(5, Math.min(34, 5 + (arg ?? 10) * 0.5)));          // arg: the weapon's damage per shot, so a sniper thumps and an SMG ticks
    case 'hit': return Math.round(25 + 55 * Math.max(0.25, Math.min(1, arg ?? 0.6)));            // arg: 0.25 to 1, how hard
    case 'kill': return [18, 40, 18];
    case 'head': return [14, 30, 14, 30, 30];
    case 'boom': return Math.round(30 + 70 * Math.max(0, Math.min(1, arg ?? 0.5)));
    case 'tick': return 14;
    default: return 0;
  }
}

/** how close together two buzzes of a kind may come (milliseconds): shots are many, so they are spaced out */
const GAP = { shot: 70, hit: 90, kill: 200, head: 200, boom: 300, tick: 120 };

export class Haptics {
  /** enabled(): whether the player wants it; touch: true on a phone's browser (a computer does not buzz); win and nav are replaceable for tests */
  constructor({ enabled = () => true, touch = true, win = globalThis.window, nav = globalThis.navigator, now = () => Date.now() } = {}) {
    this.enabled = enabled; this.touch = touch; this.win = win; this.nav = nav; this.now = now; this.last = {};
  }
  /** the phone's own haptic engine: the app's plugin, or Telegram's when the page is a Mini App; null in a plain browser */
  native() { try { return (this.win?.Capacitor?.isNativePlatform?.() ? this.win.Capacitor.Plugins?.Haptics : null) ?? telegramHaptics(this.win) ?? null; } catch { return null; } }
  /** true when a buzz of this kind could reach the player's hand on this device */
  available() { return !!(this.native() || (this.touch && typeof this.nav?.vibrate === 'function')); }
  fire(kind, arg) {
    try {
      if (!this.enabled()) return false;
      const t = this.now();
      if (t - (this.last[kind] ?? -1e9) < (GAP[kind] ?? 80)) return false;
      const nat = this.native();
      if (nat) {
        this.last[kind] = t;
        if (kind === 'kill' || kind === 'head') nat.notification?.({ type: 'SUCCESS' });
        else nat.impact?.({ style: kind === 'shot' ? ((arg ?? 10) >= 30 ? 'MEDIUM' : 'LIGHT') : kind === 'hit' ? ((arg ?? 0.6) >= 0.6 ? 'HEAVY' : 'MEDIUM') : kind === 'boom' ? 'HEAVY' : 'LIGHT' });
        return true;
      }
      if (!this.touch || typeof this.nav?.vibrate !== 'function') return false;
      const p = patternFor(kind, arg); if (!p) return false;
      this.last[kind] = t;
      this.nav.vibrate(p);
      return true;
    } catch { return false; }
  }
}
