// Things lying on the floor: ammunition boxes and med kits at fixed spots round the map (what a spot holds is drawn again each time it
// comes back), and the gun of anyone who goes down. Ammunition and med kits are taken by walking over them when you need them; a gun is
// taken with the use key and trades places with the one you carry. Everything here is the rules' own: the server decides, the page draws.
import { WEAPONS } from './items.js';

const M = 50;                         // pixels per metre (the rules count in pixels)
export const PICK = {
  radius: 38,                         // how close you must be to a box or kit to take it (a bit under a metre)
  gunRadius: 70,                      // and to a dropped gun
  respawn: 25,                        // seconds before a taken spot holds something new
  gunLife: 30,                        // seconds a dropped gun stays
  maxGuns: 12,                        // dropped guns on the floor at once: the oldest go first
  medHeal: 50,                        // health a med kit gives
  ammoMags: 1.5,                      // magazines of the gun in your hands an ammunition box gives (and a magazine for the sidearm)
  startMags: 4, sideMags: 3,          // spare magazines you carry when you come in
  capMags: 6, sideCap: 5,             // and the most you can hold
  ammoShare: 0.55,                    // chance that a spot comes back as ammunition (the rest are med kits)
};

/** spare rounds you start with and the most you may hold, for a gun with this magazine */
export const startReserve = (mag, side) => Math.round(mag * (side ? PICK.sideMags : PICK.startMags));
export const capReserve = (mag, side) => Math.round(mag * (side ? PICK.sideCap : PICK.capMags));

const hitsRect = (s, x, y, r) => x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r;

/**
 * Where boxes and kits lie on a map: spread over the ground of one half, away from the spawns and not against a wall, then turned or
 * mirrored for the other half the way the map itself is, plus one spot on the highest deck of each half. The same every time.
 */
export function pickupSpots(map) {
  if (map._pickupSpots) return map._pickupSpots;
  const half = [];
  const w = map.w, h = map.h, clear = 1.6 * M;
  const free = (x, y) => !map.solids.some((s) => hitsRect(s, x, y, clear)) && !(map.ramps || []).some((r) => hitsRect(r, x, y, M)) && x > clear && y > clear && x < w - clear && y < h - clear;
  const spawns = [...map.spawns[0], ...map.spawns[1]];
  const cands = [];
  for (let x = 6 * M; x < w / 2 - 2 * M; x += 3 * M) for (let y = 4 * M; y < h - 4 * M; y += 3 * M) {
    if (!free(x, y)) continue;
    if (spawns.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 10 * M)) continue;
    const near = map.solids.some((s) => s.top > 0.6 && hitsRect(s, x, y, 4.5 * M));      // lying beside cover rather than in the open
    cands.push({ x, y, near });
  }
  const want = Math.max(3, Math.round(((w / M) * (h / M)) / 2 / 1100));
  const mid = { x: w * 0.28, y: h / 2 };
  const pick = [];
  while (cands.length && pick.length < want) {
    let best = -1, bs = -1;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const d = pick.length ? Math.min(...pick.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) : 4000 - Math.hypot(c.x - mid.x, c.y - mid.y);
      const sc = d * (c.near ? 1.35 : 1);
      if (sc > bs) { bs = sc; best = i; }
    }
    pick.push(cands.splice(best, 1)[0]);
  }
  for (const c of pick) half.push({ x: Math.round(c.x), y: Math.round(c.y), z: 0 });
  // the highest deck on this half: a reason to climb
  const deck = map.solids.filter((s) => s.walk && s.top >= 4 && s.x + s.w / 2 < w / 2).sort((a, b) => b.top - a.top || a.x - b.x)[0];
  if (deck) half.push({ x: Math.round(deck.x + deck.w / 2), y: Math.round(deck.y + deck.h / 2), z: deck.top });
  const twin = (p) => (map.sym === 'x' ? { x: Math.round(w - p.x), y: p.y, z: p.z } : { x: Math.round(w - p.x), y: Math.round(h - p.y), z: p.z });
  map._pickupSpots = [...half, ...half.map(twin)].map((p, i) => ({ ...p, spot: i }));
  return map._pickupSpots;
}

export class Pickups {
  constructor(match) { this.m = match; this.list = []; this.timers = []; this.t = 0; }

  #add(o) { const p = { id: this.m.nextId++, ...o }; this.list.push(p); this.m.events.push({ type: 'pk+', ...this.wire(p) }); this.m.pkv++; return p; }
  #remove(p, by = null) { this.list = this.list.filter((q) => q !== p); this.m.events.push({ type: 'pk-', id: p.id, by }); this.m.pkv++; }
  /** the short form that goes over the wire */
  wire(p) { return { id: p.id, k: p.kind, x: Math.round(p.x), y: Math.round(p.y), z: +p.z.toFixed(2), ...(p.weapon ? { w: p.weapon } : {}) }; }

  /** a new round: every spot holds something, no dropped guns */
  reset() {
    this.list = []; this.timers = []; this.t = 0;
    for (const s of pickupSpots(this.m.map)) this.#fill(s);
    this.m.pkv++;
  }
  #fill(s) { const kind = Math.random() < PICK.ammoShare ? 'ammo' : 'med'; return this.#add({ kind, x: s.x, y: s.y, z: s.z, spot: s.spot }); }

  /** a soldier who goes down drops the gun in their hands' primary slot (the free pistol is not worth a drop) */
  dropGun(p) {
    if (!p || p.primary === 'pistol' || !WEAPONS[p.primary]) return;
    const inHand = p.slot === 0;
    this.#dropAt(p.x, p.y, p.z, p.primary, inHand ? p.ammo : p.stash, inHand ? p.reserve : p.stashRes);
  }
  #dropAt(x, y, z, weapon, ammo, res) {
    const guns = this.list.filter((q) => q.kind === 'gun');
    if (guns.length >= PICK.maxGuns) this.#remove(guns[0]);
    this.#add({ kind: 'gun', x, y, z, weapon, ammo: Math.max(0, ammo | 0), res: Math.max(0, res | 0), until: this.t + PICK.gunLife });
  }

  step(dt) {
    this.t += dt;
    for (const p of this.list.slice()) if (p.kind === 'gun' && p.until <= this.t) this.#remove(p);
    for (const q of this.timers.slice()) { q.t -= dt; if (q.t <= 0) { this.timers.splice(this.timers.indexOf(q), 1); this.#fill(q.spot); } }
    for (const pl of this.m.players.values()) {
      if (!pl.alive) continue;
      for (const p of this.list.slice()) {
        if (p.kind === 'gun' || Math.hypot(p.x - pl.x, p.y - pl.y) > PICK.radius || Math.abs(p.z - pl.z) > 1.4) continue;
        if (p.kind === 'med' ? this.#takeMed(pl) : this.#takeAmmo(pl)) {
          this.#remove(p, pl.id);
          this.m.events.push({ type: 'pickup', by: pl.id, kind: p.kind, x: p.x, y: p.y });
          if (p.spot !== undefined) this.timers.push({ t: PICK.respawn, spot: pickupSpots(this.m.map)[p.spot] });
        }
      }
    }
  }
  #takeMed(pl) { if (pl.hp >= pl.hpMax) return false; pl.hp = Math.min(pl.hpMax, pl.hp + PICK.medHeal); return true; }
  #takeAmmo(pl) {
    // the primary's and the sidearm's spare rounds: which of the two you hold in your hands decides where each is kept
    const prim = pl.slot === 0, onlyPistol = pl.primary === 'pistol';
    const gain = (mag, mags) => Math.round(mag * mags);
    const pMag = this.m.magOf(pl, pl.primary), sMag = this.m.magOf(pl, 'pistol');
    let took = false;
    const give = (get, set, cap, add) => { const have = get(); if (have >= cap) return; set(Math.min(cap, have + add)); took = true; };
    if (onlyPistol) give(() => pl.reserve, (v) => { pl.reserve = v; }, capReserve(pMag, true), gain(pMag, PICK.ammoMags));
    else if (prim) {
      give(() => pl.reserve, (v) => { pl.reserve = v; }, capReserve(pMag, false), gain(pMag, PICK.ammoMags));
      give(() => pl.stashRes, (v) => { pl.stashRes = v; }, capReserve(sMag, true), gain(sMag, 1));
    } else {
      give(() => pl.stashRes, (v) => { pl.stashRes = v; }, capReserve(pMag, false), gain(pMag, PICK.ammoMags));
      give(() => pl.reserve, (v) => { pl.reserve = v; }, capReserve(sMag, true), gain(sMag, 1));
    }
    return took;
  }

  /** the nearest dropped gun within reach, or null */
  gunNear(pl) {
    let best = null, bd = PICK.gunRadius;
    for (const p of this.list) { if (p.kind !== 'gun') continue; const d = Math.hypot(p.x - pl.x, p.y - pl.y); if (d < bd && Math.abs(p.z - pl.z) < 1.4) { best = p; bd = d; } }
    return best;
  }

  /** the use key: take the gun at your feet and leave the one you carry in its place */
  use(pl) {
    const g = this.gunNear(pl);
    if (!g || pl.swapT > 0) return false;
    const m = this.m;
    if (pl.slot === 1) m.toPrimary(pl);                       // the primary comes into your hands first
    const old = { weapon: pl.primary, ammo: pl.ammo, res: pl.reserve };
    this.#remove(g, pl.id);
    pl.primary = g.weapon; pl.weapon = g.weapon; pl.magSize = m.magOf(pl, g.weapon); pl.reloadTime = m.reloadOf(pl, g.weapon);
    pl.ammo = Math.min(g.ammo, pl.magSize); pl.reserve = Math.min(g.res, capReserve(pl.magSize, false));
    pl.rl = 0; pl.burstLeft = 0; pl.swapT = 0.38; pl.cd = Math.max(pl.cd, 0.2);
    if (old.weapon === 'pistol') { pl.stash = old.ammo; pl.stashRes = old.res; }                // the pistol you came with becomes your sidearm, as it was
    else this.#dropAt(pl.x, pl.y, pl.z, old.weapon, old.ammo, old.res);
    m.events.push({ type: 'pickup', by: pl.id, kind: 'gun', weapon: g.weapon, x: g.x, y: g.y });
    m.events.push({ type: 'swap', by: pl.id, weapon: g.weapon });
    return true;
  }
}

/** the nearest box or kit of this kind within reach of a soldier, or null (what the bots head for when they are short) */
export function nearestFor(match, pl, kind, maxDist) {
  let best = null, bd = maxDist;
  for (const q of match.pickups.list) { if (q.kind !== kind) continue; const d = Math.hypot(q.x - pl.x, q.y - pl.y); if (d < bd) { best = q; bd = d; } }
  return best;
}
