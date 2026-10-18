// Writes catalog.json for the website's armory from the game's own rules files, so the page can never disagree with the game.
// Usage: node tools/make-catalog.mjs
import fs from 'node:fs';
import { WEAPONS, MODS, ARMOR, HELMETS, BOOTS, KITS, CAMO, MELEE, GRENADE } from '../../arena/server/items.js';
import { UNLOCK, MASTERY, MAX_LEVEL, CLASS_COUNT } from '../../arena/server/progress.js';
import { FEEL, falloff } from '../../arena/server/gunfeel.js';

const PX = 50;   // the rules count 50 units to the metre
const ttk = (id, w, m) => {
  const d = m * PX; if (d > w.range) return null;
  const f = falloff(id, d), per = w.dmg * f * (w.pellets > 1 ? w.pellets * 0.8 : 1);
  const shots = Math.ceil(100 / per), gap = w.burst ? (w.gap * (w.burst - 1) + w.burstGap) / w.burst : w.gap;
  return { shots, seconds: +((shots - 1) * gap).toFixed(2) };
};
const weapons = Object.entries(WEAPONS).map(([id, w]) => ({
  id, name: w.name, cost: w.cost, unlock: UNLOCK[id] ?? 1, blurb: w.blurb,
  damage: w.dmg, pellets: w.pellets, burst: w.burst ?? 0,
  rpm: Math.round(60 / (w.burst ? (w.gap * (w.burst - 1) + w.burstGap) / w.burst : w.gap)),
  magazine: w.mag, reload: w.reload, rangeM: Math.round(w.range / PX), aimSeconds: FEEL[id].ads.t, zoom: FEEL[id].ads.zoom,
  moveWhileAiming: FEEL[id].ads.move, speed: w.move ?? 1,
  ttk: { 10: ttk(id, w, 10), 30: ttk(id, w, 30), 60: ttk(id, w, 60), 120: ttk(id, w, 120) },
}));
const rows = (T) => Object.entries(T).map(([id, v]) => ({ id, name: v.name, cost: v.cost, unlock: UNLOCK[id] ?? 1, blurb: v.blurb, ...Object.fromEntries(Object.entries(v).filter(([k]) => !['slot', 'name', 'cost', 'blurb', 'tint'].includes(k))) }));
const out = {
  weapons, mods: rows(MODS), armor: rows(ARMOR), helmets: rows(HELMETS), boots: rows(BOOTS), grenades: rows(KITS),
  camo: Object.entries(CAMO).map(([id, v]) => ({ id, name: v.name, cost: v.cost, blurb: v.blurb, tint: '#' + v.tint.toString(16).padStart(6, '0'), unlock: id === 'obsidian' ? 20 : 1 })),
  knife: { name: MELEE.name, damage: MELEE.dmg, backstab: MELEE.back }, grenade: { fuse: GRENADE.fuse, radiusM: GRENADE.radius / PX, damage: GRENADE.dmg },
  mastery: MASTERY, maxLevel: MAX_LEVEL, classes: CLASS_COUNT,
};
fs.writeFileSync(new URL('../catalog.json', import.meta.url), JSON.stringify(out));
console.log('catalog.json:', weapons.length, 'weapons,', out.mods.length, 'mods');
