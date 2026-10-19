// What the loadout screen shows about a gun and its gear: eight bars from the rules' own numbers (no DOM, so tests can run it).
import { WEAPONS } from '../../server/items.js';
import { statsOf } from '../../server/game.js';

const PER_METRE = 50;                                    // world units per metre (a sniper's 12,000 is 240 m)
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rows = Object.keys(WEAPONS);

/** the figures of a loadout, before they are scaled to bars */
export function figures(loadout) {
  const s = statsOf(loadout), w = WEAPONS[s.weapon];
  const gap = (w.burst ? (w.gap * (w.burst - 1) + w.burstGap) / w.burst : w.gap) * s.gapMul;      // seconds per shot, a burst averaged
  const dmg = w.dmg * s.dmgMul;
  return {
    dmg, pellets: w.pellets, perShot: dmg * w.pellets, rate: 1 / gap,
    range: (w.range * s.rangeMul) / PER_METRE, spread: w.spread * s.spreadMul,
    mag: s.magSize, hp: s.hpMax, speed: s.speedMul * (w.move ?? 1), reload: s.reloadTime,
  };
}

// the best any gun does with no attachments is the full bar, so a gun with attachments can run past it and is held at the end
const base = (weapon) => figures({ weapon });
const best = (k, f) => Math.max(...rows.map((id) => f(base(id)[k])));
const MAX = { perShot: best('perShot', (v) => v), rate: best('rate', (v) => v), range: best('range', (v) => v), mag: best('mag', (v) => v) };
const SPREAD_LO = Math.min(...rows.map((id) => base(id).spread)), SPREAD_HI = Math.max(...rows.map((id) => base(id).spread));

/** eight bars, each { key, name, value (0 to 1), text }: damage per shot, fire rate, range, accuracy, magazine, reload, health, speed */
export function bars(loadout) {
  const f = figures(loadout);
  const acc = 1 - Math.log(Math.max(f.spread, SPREAD_LO) / SPREAD_LO) / Math.log(SPREAD_HI / SPREAD_LO);
  return [
    { key: 'dmg', name: 'Damage', value: clamp01(f.perShot / MAX.perShot), text: f.pellets > 1 ? `${Math.round(f.dmg)} x ${f.pellets}` : String(Math.round(f.dmg)) },
    { key: 'rate', name: 'Fire rate', value: clamp01(f.rate / MAX.rate), text: `${f.rate.toFixed(1)} /s` },
    { key: 'range', name: 'Range', value: clamp01(f.range / MAX.range), text: `${Math.round(f.range)} m` },
    { key: 'acc', name: 'Accuracy', value: clamp01(acc), text: acc > 0.85 ? 'pin-point' : acc > 0.6 ? 'tight' : acc > 0.35 ? 'average' : 'loose' },
    { key: 'mag', name: 'Magazine', value: clamp01(f.mag / MAX.mag), text: String(f.mag) },
    { key: 'reload', name: 'Reload', value: clamp01(1 - (f.reload - 1.2) / 3.4), text: `${f.reload.toFixed(1)} s` },
    { key: 'hp', name: 'Health', value: clamp01((f.hp - 60) / 160), text: String(f.hp) },
    { key: 'speed', name: 'Speed', value: clamp01((f.speed - 0.7) / 0.6), text: `${Math.round(f.speed * 100)}%` },
  ];
}

/** the same bars for a loadout with one slot changed, each carrying the old value so the screen can draw the gain or loss */
export function compare(loadout, slot, id) {
  const now = bars(loadout), then = bars({ ...loadout, [slot]: id });
  return then.map((b, i) => ({ ...b, was: now[i].value, wasText: now[i].text, change: Math.abs(b.value - now[i].value) < 0.005 ? 0 : b.value > now[i].value ? 1 : -1 }));
}

export const WEAPON_PICTURES = rows;
