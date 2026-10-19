// The numbers behind aiming help, kept apart from the page so tests can run them: how fast the view turns, how it slows over a target,
// and when the crosshair counts as being on someone. The server never sees any of this: it only gets the angles the player ends up with.

/** how wide, in radians, the catch cone around an enemy is: wider close up, narrow far away */
export const coneLimit = (d) => 0.05 + 0.22 * Math.min(1, 600 / Math.max(d, 150));

/**
 * the factor the view's turning speed is multiplied by while an enemy is near the crosshair.
 * err: angle from the crosshair to the enemy (radians), lim: that enemy's catch cone, strength: 0 for no slowdown to 1 for a stop at the centre.
 * Outside the inner half of the cone it is 1; at the centre it is 1 - strength; it falls smoothly between, so there is no edge to feel.
 */
export function frictionFor(err, lim, strength) {
  const inner = lim * 0.5, e = Math.abs(err);
  if (!(strength > 0) || e >= inner) return 1;
  const k = 1 - e / inner;                      // 0 at the edge of the inner cone, 1 at the centre
  return 1 - Math.min(0.9, strength) * k * k * (3 - 2 * k);     // smoothstep
}

/** the turning speed for a zoomed view: the narrower the field of view, the slower a given drag turns, so a zoomed shot is as easy to place as an open one */
export const zoomScale = (fov, baseFov) => Math.max(0.15, Math.min(1, fov / baseFov));

/** the player's own look speed setting kept to what the menu offers (a slider from 40% to 250%) */
export const cleanLook = (v) => { if (v === null || v === undefined || v === '') return 1; const n = Number(v); return Number.isFinite(n) ? Math.max(0.4, Math.min(2.5, n)) : 1; };

/** is the crosshair on the body? half the body's width (0.35 m) seen from distance d (metres) is the angle that counts */
export const onBody = (err, d) => Math.abs(err) <= Math.atan2(0.35, Math.max(d, 1));

/** how hard a hit knocks the view: 0.25 for a graze to 1 for the heaviest (a missing damage figure counts as a middling hit) */
export const flinchAmount = (dmg) => Math.max(0.25, Math.min(1, (Number.isFinite(dmg) ? dmg : 30) / 45));
