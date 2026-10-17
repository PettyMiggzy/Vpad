// The three maps. Plain data, read by the rules engine (collision, line of sight, bots) and by the page (which places the models).
// Everything is written in metres on the left half of the map and mirrored (or turned half a circle) for the other team, so both sides get the same ground.
// A solid is a box standing on the floor up to `top` metres. If `walk` is true its top is a floor you can stand on (a roof or a deck), reached by a ramp.
// A ramp is a sloped floor: `axis` is the direction it rises ('x+', 'x-', 'y+', 'y-'), `from` and `to` the floor height at its two ends.
const M = 50;                                    // pixels in the rules engine per metre
export const STEP = 0.55;                        // the highest step a soldier climbs without a ramp
const px = (v) => Math.round(v * M);

function builder(id, name, wM, hM, sym) {
  const map = { id, name, w: px(wM), h: px(hM), wM, hM, solids: [], ramps: [], spawns: [[], []], theme: id, sym };
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
function cargo() {
  const b = builder('cargo', 'Cargo Yard', 64, 40, 'x');
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
  return b.done();
}

// ---------------------------------------------------------------------------------------------- DUST TOWN (desert noon, rooftops)
function dust() {
  const b = builder('dust', 'Dust Town', 64, 40, 'rot');
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
  return b.done();
}

// ---------------------------------------------------------------------------------------------- REFINERY (night, tanks and catwalks)
function refinery() {
  const b = builder('refinery', 'Refinery', 64, 40, 'x');
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
  return b.done();
}

export const MAPS = { cargo: cargo(), dust: dust(), refinery: refinery() };
export const MAP_IDS = Object.keys(MAPS);
