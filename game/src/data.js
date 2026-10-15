// PREVIEW DATA. The terrain is the real map (the contract's function, checked against it); the nations, their plots, armies and
// wars below are made up so the screens can be seen working before the game is wired to the chain. Nothing here is on chain.
import { makeTerrain, LAND, COAST, PASS } from './terrain.js';

export const PREVIEW_SEED = 29; // a seed whose map has water, mountains, plenty of land, coast and passes
export const RADIUS = 12;
export const terrain = makeTerrain(PREVIEW_SEED);

const NAMES = [
  ['TOASTY', 0xffc145, 'trickster'],
  ['SPUDS', 0x46d39a, 'bruiser'],
  ['KRILL', 0x4cc9f0, 'sniper'],
  ['WOBBLE', 0xff6f91, 'defender'],
  ['GLORP', 0xa78bfa, 'bruiser'],
  ['NIMBLE', 0xff8a4c, 'trickster'],
];

const key = (x, y) => `${x},${y}`;
const buildable = (x, y) => {
  const t = terrain(x, y);
  return t === LAND || t === COAST || t === PASS;
};

// a small deterministic generator so the preview looks the same every time
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function previewWorld() {
  const rand = rng(11);
  const taken = new Map();
  const nations = [];
  const land = [];
  for (let y = -RADIUS; y <= RADIUS; y++) for (let x = -RADIUS; x <= RADIUS; x++) if (buildable(x, y)) land.push([x, y]);
  for (const [name, color, emblem] of NAMES) {
    // a capital far from the others
    let best = null, bestD = -1;
    for (let i = 0; i < 60; i++) {
      const [x, y] = land[Math.floor(rand() * land.length)];
      if (taken.has(key(x, y))) continue;
      const d = Math.min(99, ...nations.map((n) => Math.abs(n.plots[0][0] - x) + Math.abs(n.plots[0][1] - y)));
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    const plots = [best];
    taken.set(key(...best), name);
    const size = 3 + Math.floor(rand() * 4);
    for (let tries = 0; plots.length < size && tries < 200; tries++) {
      const [px, py] = plots[Math.floor(rand() * plots.length)];
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
      const [x, y] = [px + dx, py + dy];
      if (Math.abs(x) > RADIUS || Math.abs(y) > RADIUS || !buildable(x, y) || taken.has(key(x, y))) continue;
      plots.push([x, y]);
      taken.set(key(x, y), name);
    }
    nations.push({
      name, color, emblem, plots,
      holders: 2000 + Math.floor(rand() * 8000),
      units: [Math.floor(rand() * 90), Math.floor(rand() * 90), Math.floor(rand() * 90), Math.floor(rand() * 60)],
      wall: Math.floor(rand() * 4), tower: Math.floor(rand() * 3),
      pool: Math.round(rand() * 900 + 100),
    });
  }
  // wars (made up): nations whose land is within a few plots of each other fight, at the midpoint of their nearest plots
  const wars = [];
  for (let i = 0; i < nations.length; i++) {
    for (let j = i + 1; j < nations.length; j++) {
      let best = null;
      for (const a of nations[i].plots) for (const b of nations[j].plots) {
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (!best || d < best.d) best = { d, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      }
      if (best) wars.push({ a: nations[i].name, b: nations[j].name, at: best.at, d: best.d });
    }
  }
  wars.sort((x, y) => x.d - y.d);
  wars.length = Math.min(wars.length, 3); // the three closest pairs are at war
  return { nations, wars, owner: (x, y) => taken.get(key(x, y)) };
}
