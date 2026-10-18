// The three maps. Plain data, read by the rules engine (collision, line of sight, bots) and by the page (which places the models).
// Everything is written in metres on the left half of the map and mirrored (or turned half a circle) for the other team, so both sides get the same ground.
// A solid is a box standing on the floor up to `top` metres. If `walk` is true its top is a floor you can stand on (a roof or a deck), reached by a ramp.
// A ramp is a sloped floor: `axis` is the direction it rises ('x+', 'x-', 'y+', 'y-'), `from` and `to` the floor height at its two ends.
const M = 50;                                    // pixels in the rules engine per metre
export const STEP = 0.55;                        // the highest step a soldier climbs without a ramp
const px = (v) => Math.round(v * M);

function builder(id, name, wM, hM, sym, theme = id, roundSeconds = 0) {
  const map = { id, name, w: px(wM), h: px(hM), wM, hM, solids: [], ramps: [], spawns: [[], []], theme, sym, roundSeconds };
  const flipAxis = (a, mode) => (mode === 'x' ? { 'x+': 'x-', 'x-': 'x+', 'y+': 'y+', 'y-': 'y-' }[a] : { 'x+': 'x-', 'x-': 'x+', 'y+': 'y-', 'y-': 'y+' }[a]);
  const add = (kind, x, z, w, d, top, o = {}) => map.solids.push({ kind, x: px(x), y: px(z), w: px(w), h: px(d), top, walk: !!o.walk, v: o.v ?? 0 });
  const ramp = (x, z, w, d, axis, from, to) => map.ramps.push({ x: px(x), y: px(z), w: px(w), h: px(d), axis, from, to });
  const api = {
    // a piece on the left half; the mirrored piece for the right half is added when `both` is true
    box(kind, x, z, w, d, top, o = {}) { add(kind, x, z, w, d, top, o); if (o.both !== false) add(kind, sym === 'x' ? wM - x - w : wM - x - w, sym === 'x' ? z : hM - z - d, w, d, top, o); },
    one(kind, x, z, w, d, top, o = {}) { add(kind, x, z, w, d, top, o); },
    ramp(x, z, w, d, axis, from, to, both = true) { ramp(x, z, w, d, axis, from, to); if (both) ramp(sym === 'x' ? wM - x - w : wM - x - w, sym === 'x' ? z : hM - z - d, w, d, flipAxis(axis, sym), from, to); },
    rampOne(x, z, w, d, axis, from, to) { ramp(x, z, w, d, axis, from, to); },
    // a deck you can stand on, with a low wall round its edges except on the side(s) named in `open`
    deck(kind, x, z, w, d, elev, open = [], o = {}) {
      api.box(kind, x, z, w, d, elev, { walk: true, v: o.v, both: o.both });
      const t = 0.3, rh = elev + 1.15;
      const rails = { n: [x, z, w, t], s: [x, z + d - t, w, t], w: [x, z, t, d], e: [x + w - t, z, t, d] };
      for (const side of ['n', 's', 'w', 'e']) if (!open.includes(side)) { const r = rails[side]; api.box('rail', r[0], r[1], r[2], r[3], rh, { both: o.both }); }
    },
    zone(x, z, r, elev) { map.zone = { x: px(x), y: px(z), r: px(r), z: elev }; },
    spawns(team, list) { map.spawns[team].push(...list.map(([x, z]) => [px(x), px(z)])); },
    done() {
      // perimeter wall
      add('wall', 0, 0, wM, 0.8, 5); add('wall', 0, hM - 0.8, wM, 0.8, 5); add('wall', 0, 0, 0.8, hM, 5); add('wall', wM - 0.8, 0, 0.8, hM, 5);
      return map;
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------- CARGO YARD (dusk, containers)
function cargoSmall() {
  const b = builder('cargo_s', 'Cargo Yard (small)', 64, 40, 'x', 'cargo');
  // spawn cover
  b.box('crate', 6, 8, 1.6, 1.6, 1.3); b.box('crate', 6, 30.4, 1.6, 1.6, 1.3); b.box('crate', 6, 18.2, 1.6, 1.6, 1.3);
  b.box('barrel', 10, 11.2, 0.9, 0.9, 1.1); b.box('barrel', 10, 28.2, 0.9, 0.9, 1.1); b.box('barrel', 11.1, 11.7, 0.9, 0.9, 1.1); b.box('barrel', 11.1, 27.7, 0.9, 0.9, 1.1);
  // lane walls: single containers
  b.box('container', 14, 9.5, 12, 2.4, 2.7, { v: 0 }); b.box('container', 14, 28.1, 12, 2.4, 2.7, { v: 1 });
  b.box('container', 19.5, 15.5, 2.4, 9, 2.7, { v: 2 });
  b.box('container', 8, 13, 5, 2.4, 2.7, { v: 3 }); b.box('container', 8, 24.6, 5, 2.4, 2.7, { v: 1 });
  b.box('barrier', 24, 20, 3, 0.7, 1.1); b.box('sandbag', 28, 9, 3.5, 0.9, 1.1); b.box('sandbag', 28, 30.1, 3.5, 0.9, 1.1);
  // the middle: two double-stacked rows with a corridor between them, cover in the corridor
  b.one('container', 26, 14.2, 12, 2.4, 5.4, { v: 2 }); b.one('container', 26, 23.4, 12, 2.4, 5.4, { v: 0 });
  b.one('crate', 29.5, 18.4, 2, 2, 1.6); b.one('barrel', 33, 19.5, 0.9, 0.9, 1.1); b.one('barrel', 33, 20.7, 0.9, 0.9, 1.1);
  // sniper decks: four, one in each corner of the middle ground, each reached by a long ramp from the spawn side
  b.deck('container', 18, 2, 8.5, 5.5, 4.4, ['w'], { v: 1 });
  b.ramp(8, 3.2, 10, 3.1, 'x+', 0, 4.4);
  b.deck('container', 18, 32.5, 8.5, 5.5, 4.4, ['w'], { v: 3 });
  b.ramp(8, 33.7, 10, 3.1, 'x+', 0, 4.4);
  b.spawns(0, [[3, 8], [3, 12], [3, 16], [3, 20], [3, 24], [3, 28], [3, 32], [5, 10], [5, 14], [5, 18], [5, 22], [5, 26], [5, 30]]);
  b.spawns(1, [[61, 32], [61, 28], [61, 24], [61, 20], [61, 16], [61, 12], [61, 8], [59, 30], [59, 26], [59, 22], [59, 18], [59, 14], [59, 10]]);
  b.zone(32, 20, 3.3, 0);
  return b.done();
}

// ---------------------------------------------------------------------------------------------- DUST TOWN (desert noon, rooftops)
function dustSmall() {
  const b = builder('dust_s', 'Dust Town (small)', 64, 40, 'rot', 'dust');
  b.box('sandbag', 5, 7.4, 3.5, 0.9, 1.1); b.box('sandbag', 6.4, 18.5, 0.9, 3.5, 1.1);
  b.box('crate', 6.5, 4, 1.6, 1.6, 1.3); b.box('barrel', 7.9, 6.0, 0.9, 0.9, 1.1);
  // a house in each corner of the middle ground, its roof reached by the long ramp along its wall
  b.deck('house', 9, 4, 9, 8, 4.2, ['s', 'e'], { v: 0 });
  b.ramp(9, 12.3, 9, 2, 'x+', 0, 4.1);
  b.deck('house', 9, 28, 9, 8, 4.2, ['n', 'e'], { v: 1 });
  b.ramp(9, 25.8, 9, 2, 'x+', 0, 4.1);
  b.box('hut', 22, 17, 5, 5, 3.0, { v: 0 });
  b.box('stall', 20, 9, 2.6, 1.4, 2.1); b.box('stall', 20, 29.6, 2.6, 1.4, 2.1);
  b.box('sandbag', 27, 12, 4, 0.9, 1.1); b.box('sandbag', 27, 27.1, 4, 0.9, 1.1);
  b.box('car', 15, 17, 4.6, 2.2, 1.6);
  b.box('rock', 27, 9, 2.4, 2.4, 2.2);
  // the plaza and one tall tower deck on each flank, the long ramp starting at opposite ends so neither team has the better one
  b.one('fountain', 30, 18, 4, 4, 1.4);
  b.one('stall', 36, 14, 2.6, 1.4, 2.1); b.one('stall', 25.4, 24.6, 2.6, 1.4, 2.1);
  b.deck('tower', 33, 3.2, 6, 5, 6.2, ['w'], { v: 0 });
  b.ramp(21, 4.6, 12, 2.6, 'x+', 0, 6.2);
  b.spawns(0, [[3, 8], [3, 12], [3, 16], [3, 20], [3, 24], [3, 28], [3, 32], [5, 10], [5, 14], [5, 18], [5, 22], [5, 26], [5, 30]]);
  b.spawns(1, [[61, 32], [61, 28], [61, 24], [61, 20], [61, 16], [61, 12], [61, 8], [59, 30], [59, 26], [59, 22], [59, 18], [59, 14], [59, 10]]);
  b.zone(32, 20, 4.2, 0);
  return b.done();
}

// ---------------------------------------------------------------------------------------------- REFINERY (night, tanks and catwalks)
function refinerySmall() {
  const b = builder('refinery_s', 'Refinery (small)', 64, 40, 'x', 'refinery');
  b.box('crate', 6, 8, 1.6, 1.6, 1.3); b.box('crate', 6, 30.4, 1.6, 1.6, 1.3); b.box('generator', 9, 18, 3.4, 2.2, 2.0);
  b.box('barrel', 10, 12, 0.9, 0.9, 1.1); b.box('barrel', 10, 27, 0.9, 0.9, 1.1);
  // two storage tanks per side leave a 6 m lane down the middle and a wide lane along each edge
  b.box('tank', 14, 9, 8, 8, 9); b.box('tank', 14, 23, 8, 8, 9);
  b.box('pipes', 24, 9, 7, 1.6, 1.9); b.box('pipes', 24, 30.2, 7, 1.6, 1.9);
  b.box('barrier', 24, 22.6, 3, 0.8, 1.1); b.box('shed', 24, 26.2, 4, 3, 2.7); b.box('tank_h', 23.5, 12.4, 4.5, 2.4, 2.4);
  // the catwalk across the middle, five metres up; a long ramp from each team's side of the middle lane, low rails along both edges
  b.one('catwalk', 28, 14, 8, 12, 5.0, { walk: true });
  b.ramp(18, 18.6, 10, 2.8, 'x+', 0, 5.0);
  b.one('rail', 28, 14, 8, 0.3, 6.15); b.one('rail', 28, 25.7, 8, 0.3, 6.15);
  b.one('crate', 29.5, 16, 1.6, 1.6, 6.3); b.one('crate', 33, 22.4, 1.6, 1.6, 6.3);
  // side lookouts near each spawn, with a ramp up from the spawn side
  b.deck('scaffold', 22, 1.4, 5, 4.4, 4.2, ['w'], { v: 0 });
  b.ramp(13.6, 1.6, 8.4, 2.8, 'x+', 0, 4.2);
  b.deck('scaffold', 22, 34.2, 5, 4.4, 4.2, ['w'], { v: 1 });
  b.ramp(13.6, 35.6, 8.4, 2.8, 'x+', 0, 4.2);
  b.spawns(0, [[3, 8], [3, 12], [3, 16], [3, 20], [3, 24], [3, 28], [3, 32], [5, 10], [5, 14], [5, 18], [5, 22], [5, 26], [5, 30]]);
  b.spawns(1, [[61, 32], [61, 28], [61, 24], [61, 20], [61, 16], [61, 12], [61, 8], [59, 30], [59, 26], [59, 22], [59, 18], [59, 14], [59, 10]]);
  b.zone(32, 20, 3.2, 5.0);
  return b.done();
}

// ================================================================================================ THE BIG MAPS
// About 200 by 110 metres, built for long shots: open lanes along both edges with cover to run between, tall towers on the flanks reached by
// long ramps, a closer-quarters middle, and a team end at each side. Each is mirrored left to right (or turned half a circle), so both teams
// get the same ground. `both: false` is not used: every piece has its twin.

/** a spawn field: rows of spawn points for each team, the far team's mirrored or turned the same way as the map */
function spawnField(b, wM, hM, sym, xs, zs) {
  const a = [], c = [];
  for (const x of xs) for (const z of zs) { a.push([x, z]); c.push(sym === 'x' ? [wM - x, z] : [wM - x, hM - z]); }
  b.spawns(0, a); b.spawns(1, c);
}

/** a walkable deck with low rails except on the sides named in `open`, and its north-south twin (the open sides n and s swap) */
function deckBoth(b, H, kind, x, z, w, d, elev, open, v = 0) {
  b.deck(kind, x, z, w, d, elev, open, { v });
  b.deck(kind, x, H - z - d, w, d, elev, open.map((s) => ({ n: 's', s: 'n' }[s] ?? s)), { v: v + 1 });
}

// ---------------------------------------------------------------------------------------------- CARGO YARD (dusk, containers)
function cargoBig() {
  const W = 200, H = 110, b = builder('cargo', 'Cargo Yard', W, H, 'x', 'cargo', 180);
  const both = (kind, x, z, w, d, top, o = {}) => { b.box(kind, x, z, w, d, top, o); b.box(kind, x, H - z - d, w, d, top, { ...o, v: (o.v ?? 0) + 1 }); };   // the north piece and its twin in the south
  // the spawn yard: a few crates and barrels to hide behind
  both('crate', 10, 16, 1.6, 1.6, 1.3); both('crate', 10, 38, 1.6, 1.6, 1.3); both('barrel', 14, 15, 0.9, 0.9, 1.1); both('barrel', 14, 39, 0.9, 0.9, 1.1);
  // the gate: containers across the yard's mouth with wide openings between them
  both('container', 24, 28, 2.4, 12, 2.7, { v: 2 }); both('container', 24, 46, 2.4, 6, 2.7, { v: 0 });
  // two towers a team's length from the middle: four containers high, a long ramp from the spawn side, open on the side facing the field
  deckBoth(b, H, 'container', 32, 4, 9, 7, 10.8, ['w'], 1);
  b.ramp(8, 5.3, 24, 3.4, 'x+', 0, 10.8); b.ramp(8, H - 5.3 - 3.4, 24, 3.4, 'x+', 0, 10.8);
  // cover along the two edge lanes, staggered so a runner can always get from one to the next
  both('container', 48, 12, 8, 2.4, 2.7, { v: 0 }); both('container', 62, 20, 2.4, 8, 5.4, { v: 1 }); both('container', 78, 7, 8, 2.4, 2.7, { v: 2 }); both('container', 90, 17, 8, 2.4, 2.7, { v: 3 });
  both('barrier', 56, 5, 3, 0.7, 1.1); both('sandbag', 70, 14, 3.5, 0.9, 1.1); both('barrel', 84, 22, 0.9, 0.9, 1.1);
  // an overwatch stack on each side of the field: a double-height deck with a ramp from the west
  deckBoth(b, H, 'container', 60, 32, 8, 6, 8.1, ['w'], 2);
  b.ramp(38, 34.4, 22, 3.2, 'x+', 0, 8.1); b.ramp(38, H - 34.4 - 3.2, 22, 3.2, 'x+', 0, 8.1);
  // the middle field: low cover to cross between the towers and the canyon
  both('barrier', 36, 26, 3, 0.7, 1.1); both('sandbag', 44, 42, 3.5, 0.9, 1.1); both('crate', 72, 34, 2, 2, 1.6); both('barrel', 82, 30, 0.9, 0.9, 1.1); both('barrel', 83.2, 30.4, 0.9, 0.9, 1.1);
  both('barrier', 30, 48, 3, 0.7, 1.1); both('crate', 50, 52, 2, 2, 1.6);
  b.box('container', 70, 45, 2.4, 9, 2.7, { v: 2 }); b.box('container', 70, 56, 2.4, 9, 2.7, { v: 0 }); both('container', 46, 24, 2.4, 7, 2.7, { v: 1 }); both('sandbag', 76, 24, 3.5, 0.9, 1.1);
  // the canyon in the middle: two long double rows with a corridor between them and crates in it
  b.one('container', 84, 38, 32, 2.4, 5.4, { v: 2 }); b.one('container', 84, H - 38 - 2.4, 32, 2.4, 5.4, { v: 0 });
  b.one('crate', 97, 50, 2, 2, 1.6); b.one('crate', 101, 58, 2, 2, 1.6); b.one('barrel', 94, 56, 0.9, 0.9, 1.1); b.one('barrel', 106, 52, 0.9, 0.9, 1.1);
  spawnField(b, W, H, 'x', [4, 7], [12, 24, 36, 48, 62, 74, 86, 98]);
  b.zone(100, 55, 5, 0);
  return b.done();
}

// ---------------------------------------------------------------------------------------------- DUST TOWN (desert noon, rooftops)
function dustBig() {
  const W = 220, H = 110, b = builder('dust', 'Dust Town', W, H, 'rot', 'dust', 180);
  // a rotated map: every piece below has its twin turned half a circle, so only one set is written
  b.box('sandbag', 7, 20, 3.5, 0.9, 1.1); b.box('sandbag', 7, 52, 0.9, 3.5, 1.1); b.box('sandbag', 7, 82, 3.5, 0.9, 1.1);
  b.box('crate', 11, 10, 1.6, 1.6, 1.3); b.box('barrel', 13, 12, 0.9, 0.9, 1.1); b.box('crate', 11, 94, 1.6, 1.6, 1.3); b.box('barrel', 13, 41, 0.9, 0.9, 1.1);
  // the big tower on the north flank, a long ramp up from the spawn side (its twin stands on the south flank for the other team)
  b.deck('tower', 52, 4, 7, 6, 10.2, ['w'], { v: 0 });
  b.ramp(28, 5.4, 24, 3.2, 'x+', 0, 10.2);
  // houses with flat roofs you can walk on, each with a ramp up its west wall
  b.deck('house', 30, 28, 10, 9, 4.2, ['w', 'n'], { v: 1 }); b.ramp(10, 31, 20, 2.6, 'x+', 0, 4.2);
  b.deck('house', 70, 20, 11, 9, 4.2, ['w', 'n'], { v: 0 }); b.ramp(50, 23, 20, 2.6, 'x+', 0, 4.2);
  b.deck('house', 62, 70, 10, 9, 4.2, ['w', 's'], { v: 1 }); b.ramp(42, 73, 20, 2.6, 'x+', 0, 4.2);
  // low walls and huts along the streets, rocks on the flanks, stalls and wrecks to run between
  b.box('wall', 44, 40, 14, 0.8, 2.6); b.box('wall', 80, 48, 0.8, 12, 2.6); b.box('wall', 40, 60, 12, 0.8, 2.6);
  b.box('hut', 24, 52, 5, 5, 3.0, { v: 0 }); b.box('hut', 58, 46, 5, 5, 3.0, { v: 1 }); b.box('hut', 84, 12, 5, 5, 3.0, { v: 0 });
  b.box('stall', 36, 17, 2.6, 1.4, 2.1); b.box('stall', 54, 36, 2.6, 1.4, 2.1); b.box('stall', 48, 82, 2.6, 1.4, 2.1); b.box('stall', 76, 60, 2.6, 1.4, 2.1);
  b.box('car', 20, 66, 4.6, 2.2, 1.6); b.box('car', 66, 38, 4.6, 2.2, 1.6); b.box('car', 90, 30, 4.6, 2.2, 1.6);
  b.box('rock', 36, 13, 2.6, 2.6, 2.2); b.box('rock', 88, 78, 2.6, 2.6, 2.2); b.box('rock', 20, 100, 2.4, 2.4, 2.0); b.box('rock', 74, 90, 2.4, 2.4, 2.0);
  b.box('sandbag', 94, 38, 4, 0.9, 1.1); b.box('sandbag', 94, 70, 4, 0.9, 1.1); b.box('barrel', 100, 24, 0.9, 0.9, 1.1); b.box('crate', 98, 84, 1.6, 1.6, 1.3);
  // the plaza in the middle of town
  b.one('fountain', 108, 53, 4, 4, 1.4); b.one('stall', 100, 46, 2.6, 1.4, 2.1); b.one('stall', 116.4, 62.6, 2.6, 1.4, 2.1); b.one('hut', 104, 70, 5, 5, 3.0, { v: 1 }); b.one('hut', 111, 35, 5, 5, 3.0, { v: 0 });
  spawnField(b, W, H, 'rot', [4, 7], [12, 24, 36, 48, 62, 74, 86, 98]);
  b.zone(110, 55, 4.5, 0);
  return b.done();
}

// ---------------------------------------------------------------------------------------------- REFINERY (night, tanks and catwalks)
function refineryBig() {
  const W = 200, H = 120, b = builder('refinery', 'Refinery', W, H, 'x', 'refinery', 180);
  const both = (kind, x, z, w, d, top, o = {}) => { b.box(kind, x, z, w, d, top, o); b.box(kind, x, H - z - d, w, d, top, { ...o, v: (o.v ?? 0) + 1 }); };
  both('crate', 10, 18, 1.6, 1.6, 1.3); both('crate', 10, 44, 1.6, 1.6, 1.3); both('barrel', 14, 17, 0.9, 0.9, 1.1); both('barrel', 14, 45, 0.9, 0.9, 1.1); b.box('generator', 11, 58, 3.4, 2.2, 2.0);
  // two watchtowers per team: steel decks ten metres up, a long ramp up from the spawn side
  deckBoth(b, H, 'scaffold', 34, 4, 6, 6, 9.6, ['w'], 0);
  b.ramp(10, 5.4, 24, 3.2, 'x+', 0, 9.6); b.ramp(10, H - 5.4 - 3.2, 24, 3.2, 'x+', 0, 9.6);
  // the tank farm: tall tanks standing in two rows with lanes between, pipe racks and sheds to duck behind
  both('tank', 26, 22, 9, 9, 9); both('tank', 48, 30, 9, 9, 9); both('tank', 70, 16, 9, 9, 9); both('tank', 78, 38, 8, 8, 8);
  both('pipes', 38, 14, 12, 1.6, 1.9); both('pipes', 58, 46, 14, 1.6, 1.9); both('pipes', 86, 8, 10, 1.6, 1.9);
  both('tank_h', 40, 40, 5, 2.4, 2.4); both('shed', 60, 12, 4, 3, 2.7); both('shed', 66, 30, 4, 3, 2.7); both('generator', 84, 24, 3.4, 2.2, 2.0);
  both('barrier', 20, 34, 3, 0.8, 1.1); both('barrier', 52, 20, 3, 0.8, 1.1); both('barrier', 90, 32, 3, 0.8, 1.1); both('crate', 36, 28, 1.6, 1.6, 1.3); both('barrel', 74, 28, 0.9, 0.9, 1.1);
  // the catwalk in the middle, five metres up, a ramp onto it from each team's side and low rails along its edges; the zone sits on it
  b.one('catwalk', 86, 44, 28, 32, 5.0, { walk: true });
  b.ramp(62, 58.4, 24, 3.2, 'x+', 0, 5.0);
  b.one('rail', 86, 44, 28, 0.3, 6.15); b.one('rail', 86, 75.7, 28, 0.3, 6.15);
  b.one('crate', 90, 48, 1.6, 1.6, 6.3); b.one('crate', 108, 70, 1.6, 1.6, 6.3); b.one('generator', 97, 58, 3.4, 2.2, 7.0);
  spawnField(b, W, H, 'x', [4, 7], [14, 26, 38, 50, 66, 78, 90, 102]);
  b.zone(100, 60, 5, 5.0);
  return b.done();
}

export const MAPS = { cargo: cargoBig(), dust: dustBig(), refinery: refineryBig() };
/** the old 64 by 40 metre layouts: not offered to players, kept because the rules' tests rely on their exact positions */
export const LEGACY = { cargo: cargoSmall(), dust: dustSmall(), refinery: refinerySmall() };
export const MAP_IDS = Object.keys(MAPS);
