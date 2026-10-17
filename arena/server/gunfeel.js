// How a gun behaves in the hands, shared by the match server (which decides where every shot goes) and the page (which shows the kick).
// Nothing here is random: the recoil of a spray is the same pattern every time, so it can be learned and pulled against, and the page
// can replay exactly what the server does. The random part of a shot is only the spread, and that stays on the server.
//
// Per weapon:
//   kick, side   how far each shot lifts the aim (radians) and how far it wanders sideways (as a share of kick)
//   max          the most the aim can be lifted by a long spray
//   hold, rec    seconds after the last shot before the aim settles, and how fast it settles (per second)
//   bloom, bloomMax, bloomRec   spread grows by `bloom` a shot up to `bloomMax` times the base, and shrinks back at `bloomRec` a second
//   move, air    extra spread when moving at full speed, and when in the air (times the base)
//   hip          spread multiplier from the hip (1 = the weapon's base spread), aimed down the sights it is `adsSpread`
//   ads          { t seconds to raise the sights, spread multiplier, move speed multiplier, recoil multiplier, field of view }
//   fall         [distance where damage starts to drop, distance where it stops dropping, damage left] in the rules' units (50 to the metre)
//   leg          damage multiplier for a hit below the hips
export const FEEL = {
  pistol:  { kick: 0.028, side: 0.5, max: 0.16, hold: 0.18, rec: 9, bloom: 0.35, bloomMax: 1.2, bloomRec: 2.5, move: 0.8, air: 1.6, hip: 1, ads: { t: 0.12, spread: 0.5, move: 0.9, recoil: 0.8, zoom: 62 }, fall: [500, 1300, 0.65], leg: 0.85 },
  smg:     { kick: 0.014, side: 0.9, max: 0.22, hold: 0.12, rec: 7, bloom: 0.12, bloomMax: 1.0, bloomRec: 2.2, move: 0.5, air: 1.4, hip: 1, ads: { t: 0.14, spread: 0.55, move: 0.9, recoil: 0.85, zoom: 60 }, fall: [300, 1100, 0.5], leg: 0.85 },
  rifle:   { kick: 0.020, side: 0.7, max: 0.32, hold: 0.22, rec: 6, bloom: 0.10, bloomMax: 0.9, bloomRec: 2.0, move: 1.0, air: 1.8, hip: 1.3, ads: { t: 0.18, spread: 0.35, move: 0.82, recoil: 0.7, zoom: 52 }, fall: [900, 2200, 0.7], leg: 0.85 },
  shotgun: { kick: 0.09, side: 0.3, max: 0.18, hold: 0.5, rec: 5, bloom: 0, bloomMax: 0, bloomRec: 1, move: 0.6, air: 1.3, hip: 1, ads: { t: 0.2, spread: 0.6, move: 0.85, recoil: 0.9, zoom: 60 }, fall: [150, 600, 0.25], leg: 0.85 },
  sniper:  { kick: 0.11, side: 0.2, max: 0.2, hold: 0.6, rec: 4, bloom: 0.5, bloomMax: 0.8, bloomRec: 1.5, move: 4, air: 6, hip: 14, ads: { t: 0.28, spread: 1, move: 0.7, recoil: 0.8, zoom: 24 }, fall: null, leg: 0.9 },
  revolver: { kick: 0.07, side: 0.3, max: 0.2, hold: 0.35, rec: 6, bloom: 0.3, bloomMax: 0.8, bloomRec: 2, move: 1.2, air: 2, hip: 3, ads: { t: 0.15, spread: 1, move: 0.9, recoil: 0.8, zoom: 58 }, fall: [700, 1700, 0.7], leg: 0.85 },
  burst:   { kick: 0.016, side: 0.6, max: 0.26, hold: 0.2, rec: 7, bloom: 0.07, bloomMax: 0.7, bloomRec: 2.4, move: 0.9, air: 1.7, hip: 1.4, ads: { t: 0.17, spread: 0.4, move: 0.84, recoil: 0.7, zoom: 52 }, fall: [800, 2100, 0.7], leg: 0.85 },
  lmg:     { kick: 0.017, side: 1.0, max: 0.36, hold: 0.25, rec: 5, bloom: 0.08, bloomMax: 1.1, bloomRec: 1.8, move: 1.3, air: 2, hip: 1.4, ads: { t: 0.3, spread: 0.45, move: 0.72, recoil: 0.65, zoom: 52 }, fall: [700, 2100, 0.65], leg: 0.85 },
  autosg:  { kick: 0.06, side: 0.4, max: 0.2, hold: 0.35, rec: 6, bloom: 0, bloomMax: 0, bloomRec: 1, move: 0.7, air: 1.3, hip: 1, ads: { t: 0.2, spread: 0.65, move: 0.85, recoil: 0.9, zoom: 60 }, fall: [150, 550, 0.25], leg: 0.85 },
  dmr:     { kick: 0.06, side: 0.4, max: 0.22, hold: 0.4, rec: 5, bloom: 0.25, bloomMax: 0.8, bloomRec: 1.8, move: 2, air: 3, hip: 5, ads: { t: 0.22, spread: 1, move: 0.78, recoil: 0.75, zoom: 38 }, fall: [1800, 3000, 0.85], leg: 0.9 },
};
export const feelOf = (weapon) => FEEL[weapon] || FEEL.pistol;

const lerp = (a, b, t) => a + (b - a) * t;

/** the sideways wander of the n-th shot of a spray: a fixed pattern between -1 and 1 (the same every time) */
export const sideAt = (n) => Math.sin(n * 0.9) * 0.6 + Math.sin(n * 0.37 + 1) * 0.4;

/** the lift and drift the aim has taken from firing, and how it settles; one per soldier */
export class Recoil {
  constructor() { this.p = 0; this.y = 0; this.n = 0; this.t = 99; this.bloom = 0; }
  /** one round fired. `ads` is how far the sights are up (0 to 1); `mul` scales the kick (computer players do not fight it) */
  shot(weapon, ads = 0, mul = 1) {
    const f = feelOf(weapon), k = f.kick * lerp(1, f.ads.recoil, ads) * mul, i = this.n;
    this.p = Math.min(f.max, this.p + k * (i < 3 ? 1 : 0.8));
    const wide = f.max * 0.6;
    this.y = Math.max(-wide, Math.min(wide, this.y + k * f.side * sideAt(i)));
    this.n = i + 1; this.t = 0;
    this.bloom = Math.min(f.bloomMax, this.bloom + f.bloom);
  }
  /** time passes; once the trigger has been let go for `hold` seconds the aim settles and the spray starts over */
  step(dt, weapon) {
    const f = feelOf(weapon);
    this.t += dt;
    if (this.t <= f.hold) return;
    const k = Math.exp(-f.rec * dt);
    this.p *= k; this.y *= k;
    this.bloom = Math.max(0, this.bloom - f.bloomRec * dt);
    if (Math.abs(this.p) < 1e-4 && Math.abs(this.y) < 1e-4) { this.p = 0; this.y = 0; this.n = 0; }
  }
}

/** the spread of the next shot, in radians either side of the aim: base spread, widened by moving, jumping and a long spray, narrowed by the sights */
export function spreadFor(weapon, base, st) {
  const f = feelOf(weapon);
  const stance = lerp(f.hip, f.ads.spread, st.ads ?? 0);
  const motion = 1 + f.move * Math.min(1, st.move ?? 0) + (st.air ? f.air : 0);
  return base * stance * motion * (1 + (st.bloom ?? 0));
}

/** what share of its damage a bullet still has after flying `d` */
export function falloff(weapon, d) {
  const f = feelOf(weapon).fall;
  if (!f) return 1;
  if (d <= f[0]) return 1;
  if (d >= f[1]) return f[2];
  return lerp(1, f[2], (d - f[0]) / (f[1] - f[0]));
}
