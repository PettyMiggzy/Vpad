import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, R, MAPS, floorAt, pushOut, tryMove, raySolids, rayCircle, clearLine, navPath, statsOf } from './game.js';
import { STEP } from './maps.js';
import { GRENADE, WEAPONS } from './items.js';

const T = [{ name: 'A' }, { name: 'B' }];
const run = (m, seconds) => { for (let i = 0; i < seconds * 60; i++) m.step(1 / 60); };
const empty = (id = 'cargo', per = 3) => new Match({ teams: T, perSide: per, bots: false, map: id });
/** a quiet live round with the named players placed where the test wants them */
function setup(id, spots) {
  const m = empty(id, 4); const out = {};
  for (const [name, team, x, y, z] of spots) { const p = m.addPlayer(name, { name, team }); Object.assign(p, { x, y, z: z ?? floorAt(m.map, x, y), aim: 0, pitch: 0 }); out[name] = p; }
  m.phase = 'live'; m.timer = 60;
  return [m, out];
}

for (const id of Object.keys(MAPS)) {
  test(`map ${id}: solids inside the map, spawns free, ramps clear of solids`, () => {
    const mp = MAPS[id];
    for (const s of mp.solids) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= mp.w && s.y + s.h <= mp.h, `${s.kind} inside the map`);
    for (const t of [0, 1]) for (const [x, y] of mp.spawns[t]) { const [px, py] = pushOut(mp, x, y, 0); assert.ok(Math.hypot(px - x, py - y) < 3, `spawn ${x},${y} is free`); assert.equal(floorAt(mp, x, y), 0); }
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (const r of mp.ramps) for (const s of mp.solids) assert.ok(!(hit(r, s) && s.kind !== 'rail' && s.top > 0.3 && !s.walk) && !(hit(r, s) && s.walk && !s.kind), `ramp ${r.x},${r.y} clear of ${s.kind}`);
    for (const r of mp.ramps) for (const s of mp.solids) if (hit(r, s) && s.walk) {
      // a ramp may touch its own deck only by its edge: never run inside it
      const ix = Math.min(r.x + r.w, s.x + s.w) - Math.max(r.x, s.x), iy = Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y);
      assert.ok(Math.min(ix, iy) <= 1, `ramp ${r.x},${r.y} inside deck ${s.kind}`);
    }
    // two solids never overlap, except a rail on a deck
    for (let i = 0; i < mp.solids.length; i++) for (let j = i + 1; j < mp.solids.length; j++) {
      const a = mp.solids[i], b = mp.solids[j];
      if (!hit(a, b)) continue;
      const onDeck = (u, v) => u.walk && v.top > u.top;      // cover standing on a deck
      assert.ok(a.kind === 'rail' || b.kind === 'rail' || a.kind === 'wall' || b.kind === 'wall' || onDeck(a, b) || onDeck(b, a), `${a.kind} overlaps ${b.kind} at ${a.x},${a.y}`);
    }
  });
  test(`map ${id}: every deck is reachable on foot from both spawns (and a path stays within a step)`, () => {
    const mp = MAPS[id];
    for (const s of mp.solids.filter((q) => q.walk && q.top >= 4)) {
      for (const t of [0, 1]) {
        const [sx, sy] = mp.spawns[t][0];
        const path = navPath(mp, sx, sy, 0, s.x + s.w / 2, s.y + s.h / 2, s.top);
        assert.ok(path.length > 0, `team ${t} finds a way to the ${s.kind} at ${s.x},${s.y}`);
        const last = path[path.length - 1];
        assert.ok(Math.abs(floorAt(mp, last[0], last[1]) - s.top) < 0.3, 'the path ends on the deck');
      }
    }
  });
  test(`map ${id}: bots alone play whole matches, fight, and stay on the map`, () => {
    const m = new Match({ teams: T, perSide: 8, bots: true, map: id });
    m.startRound();
    let matches = 0, kills = 0, bad = false;
    for (let i = 0; i < 60 * 600; i++) {
      m.step(1 / 60);
      for (const e of m.events) { if (e.type === 'match') matches++; if (e.type === 'kill') kills++; }
      if (i % 300 === 0) for (const p of m.players.values()) if (![p.x, p.y, p.z].every(Number.isFinite) || p.x < 0 || p.x > m.map.w || p.y < 0 || p.y > m.map.h) bad = true;
    }
    assert.ok(matches >= 1, `matches finished: ${matches}`); assert.ok(kills > 20, `kills ${kills}`); assert.ok(!bad);
  });
}

test('a human takes a bot seat, teams stay within the seats, a full side refuses', () => {
  const m = new Match({ teams: T, perSide: 3, bots: true });
  m.fillBots();
  assert.equal(m.count(0), 3); assert.equal(m.count(1), 3);
  const a = m.addPlayer('s1', { name: 'Ann', team: 0, loadout: { weapon: 'rifle', armor: 'heavy', boots: 'runner' } });
  assert.equal(a.team, 0); assert.equal(m.count(0), 3, 'a bot made room');
  m.addPlayer('s2', { name: 'Bob', team: 0 }); m.addPlayer('s3', { name: 'Cy', team: 0 });
  assert.equal(m.humans(0), 3);
  assert.equal(m.addPlayer('s4', { name: 'Di', team: 0 }).team, 1, 'the full side sends them to the other');
});

test('walking up a ramp takes you onto the deck; the side of the deck stops you; you cannot step off a high edge', () => {
  const mp = MAPS.cargo, r = mp.ramps[0];
  let [x, y, z] = [r.x + 5, r.y + r.h / 2, 0];
  for (let i = 0; i < 400; i++) [x, y, z] = tryMove(mp, x, y, z, x + 3, y);        // walk east along the ramp
  assert.ok(z > 4.2, `ended on the deck at ${z}`);
  // from the ground beside the deck you cannot walk onto it
  const deck = mp.solids.find((s) => s.walk && s.top > 4);
  let [gx, gy, gz] = [deck.x + deck.w / 2, deck.y + deck.h + 40, 0];
  for (let i = 0; i < 80; i++) [gx, gy, gz] = tryMove(mp, gx, gy, gz, gx, gy - 4);
  assert.equal(gz, 0, 'still on the ground');
  // on the deck, walking off the edge with no rail is refused when the drop is more than the limit
  [x, y, z] = [deck.x + 40, deck.y + deck.h / 2, deck.top];
  for (let i = 0; i < 80; i++) [x, y, z] = tryMove(mp, x, y, z, x - 4, y);
  assert.ok(z > 4, `did not fall off: ${z}`);
});

test('a shot lands at once: it stops at a wall, passes team-mates, headshots hit twice as hard, shotguns spread six rays', () => {
  const [m, p] = setup('cargo', [['a', 0, 200, 150], ['c', 0, 300, 150], ['b', 1, 500, 150]]);
  p.a.weapon = 'sniper'; p.a.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: true };
  m.step(1 / 60);
  assert.equal(p.c.hp, p.c.hpMax, 'team-mate untouched');
  assert.ok(p.b.hp < p.b.hpMax, 'enemy hit');
  assert.equal(p.b.hpMax - p.b.hp, 60, 'a body shot is the weapon damage');
  assert.ok(m.events.some((e) => e.type === 'shot' && e.hit === 1));
  // headshot: aim up so the ray crosses the target at head height
  p.b.hp = p.b.hpMax; p.a.cd = 0; p.a.input.pitch = Math.atan2(R.HEAD + 0.12 - R.EYE, 300 / 50);
  m.step(1 / 60);
  assert.ok(p.b.hpMax - p.b.hp >= 120 || !p.b.alive, 'a head shot is double');
  assert.ok(m.events.some((e) => (e.type === 'kill' || e.type === 'hit') && e.head === 1), 'and is marked as a head shot');
  // a shotgun fires six rays
  const [s, q] = setup('cargo', [['g', 0, 200, 150], ['h', 1, 1500, 900]]);
  q.g.weapon = 'shotgun'; q.g.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: true };
  s.step(1 / 60);
  assert.equal(s.events.filter((e) => e.type === 'shot').length, 6);
});

test('walls stop shots; you can shoot over low cover but not over a container; height is respected', () => {
  const mp = MAPS.cargo;
  const cont = mp.solids.find((s) => s.kind === 'container' && s.top === 2.7), low = mp.solids.find((s) => s.kind === 'sandbag');
  // flat ray across a container is blocked, a ray from a high point descending past its top is not
  const cy = cont.y + cont.h / 2, x0 = cont.x - 100;
  assert.ok(raySolids(mp, x0, cy, 1.6, 1, 0, 0, 5000) < 200, 'blocked by the container');
  assert.ok(raySolids(mp, x0, cy, 6.0, 1, 0, 0, 5000) > 4000, 'a ray passing above the container is free');
  const ly = low.y + low.h / 2;
  assert.ok(raySolids(mp, low.x - 100, ly, 1.6, 1, 0, 0, 250) === 250, 'standing eye height is above a sandbag wall');
  assert.ok(raySolids(mp, low.x - 100, ly, 0.9, 1, 0, 0, 250) < 150, 'below its top it is blocked');
  // line of sight from a deck to the ground uses the real heights
  const deck = mp.solids.find((s) => s.walk && s.top > 4);
  assert.ok(clearLine(mp, deck.x + 60, deck.y + 60, deck.top + 1.6, deck.x - 300, deck.y + 60, 1.3), 'a deck looks down over its open side onto the ground');
  assert.ok(!clearLine(mp, deck.x + 60, deck.y + 60, deck.top + 1.6, deck.x + deck.w + 300, deck.y + 60, 1.3), 'the rail on the far side stops a steep shot through it');
});

test('kills are counted once and a dead player is not hit again', () => {
  const [m, p] = setup('cargo', [['a', 0, 200, 150], ['b', 1, 400, 150]]);
  p.b.hp = 10; p.a.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: true };
  m.step(1 / 60);
  assert.equal(p.b.alive, false); assert.equal(p.a.kills, 1);
  assert.equal(m.events.filter((e) => e.type === 'kill').length, 1);
});

test('grenades: they fly, bounce, burst after the fuse, hurt enemies in range with a clear line, spare team-mates and those behind a wall', () => {
  const [m, p] = setup('cargo', [['a', 0, 300, 150], ['mate', 0, 520, 150], ['near', 1, 640, 150], ['far', 1, 1500, 150]]);
  const ev = [];
  p.a.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, nade: true };
  m.step(1 / 60); ev.push(...m.events);
  assert.equal(p.a.grenades, GRENADE.count - 1); assert.ok(m.events.some((e) => e.type === 'nade'));
  p.a.input.nade = false;
  for (let i = 0; i < 60 * 3; i++) { m.step(1 / 60); ev.push(...m.events); }
  assert.ok(ev.some((e) => e.type === 'boom'), 'it burst');
  assert.equal(m.nades.length, 0);
  assert.ok(p.near.hp < p.near.hpMax, 'an enemy in range is hurt');
  assert.equal(p.mate.hp, p.mate.hpMax, 'a team-mate is spared');
  assert.equal(p.far.hp, p.far.hpMax, 'out of range is untouched');
  // a wall between the burst and a player blocks it
  const mp = MAPS.cargo, c = mp.solids.find((s) => s.kind === 'container' && s.top === 2.7);
  const [m2, q] = setup('cargo', [['a', 0, 200, 150], ['v', 1, c.x + c.w / 2, c.y + c.h + 30]]);
  m2.nades.push({ x: c.x + c.w / 2, y: c.y - 30, z: 0.2, vx: 0, vy: 0, vz: 0, fuse: 0.01, owner: 'a', team: 0, id: 99, radius: GRENADE.radius, dmg: GRENADE.dmg });
  m2.step(1 / 60);
  assert.equal(q.v.hp, q.v.hpMax, 'behind a container the blast does nothing');
  assert.ok(rayCircle(0, 0, 1, 0, 100, 0, 10) === 90 && rayCircle(0, 0, 1, 0, 100, 30, 10) === Infinity);
  assert.ok(STEP > 0);
});

test('magazines: a weapon empties, reloads for its time, and cannot fire meanwhile; a full one does not reload', () => {
  const [m, p] = setup('cargo', [['a', 0, 200, 150], ['b', 1, 2600, 1800]]);
  const a = p.a; a.weapon = 'pistol'; a.ammo = 2; a.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: true };
  let shots = 0; const ev = [];
  for (let i = 0; i < 30; i++) { m.step(1 / 60); ev.push(...m.events); }
  shots = ev.filter((e) => e.type === 'shot').length;
  assert.equal(shots, 2, 'two rounds, two shots');
  assert.equal(a.ammo, 0);
  assert.ok(ev.some((e) => e.type === 'reload' && e.by === 'a'), 'an empty magazine starts a reload by itself when the trigger is held');
  assert.ok(a.rl > 0, 'reloading');
  const before = ev.length; a.input.fire = true;
  for (let i = 0; i < 60; i++) { m.step(1 / 60); ev.push(...m.events); }
  assert.equal(ev.slice(before).filter((e) => e.type === 'shot').length, 0, 'no shots while reloading');
  for (let i = 0; i < 60 * 2; i++) { m.step(1 / 60); ev.push(...m.events); }
  assert.ok(a.ammo >= 0 && a.rl === 0, 'the reload finished');
  assert.ok(ev.some((e) => e.type === 'shot' && e.by === 'a') && ev.filter((e) => e.type === 'shot').length > 2, 'firing resumes with a full magazine');
  // a full magazine ignores a reload request
  const [m2, q] = setup('cargo', [['c', 0, 200, 150]]);
  q.c.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, reload: true };
  m2.step(1 / 60);
  assert.equal(q.c.rl, 0);
});

test('shop gear changes the fight: a helmet cuts head-shot damage, mods change the gun, kits change the grenades, nothing unknown sneaks in', () => {
  const s = statsOf({ weapon: 'rifle', mod: 'extmag', helmet: 'helmet2', grenade: 'heavy3', armor: 'elite' });
  assert.equal(s.magSize, 45); assert.equal(s.headMul, 1.25); assert.equal(s.nadeCount, 3); assert.equal(s.hpMax, 200);
  assert.ok(s.nadeRadius > 1 && s.nadeDmg > 1);
  assert.equal(statsOf({ weapon: 'rifle', mod: 'quickmag' }).reloadTime, WEAPONS.rifle.reload * 0.65);
  assert.ok(statsOf({ weapon: 'rifle', mod: 'grip' }).spreadMul < 1); assert.ok(statsOf({ weapon: 'rifle', mod: 'barrel' }).rangeMul > 1);
  const bad = statsOf({ weapon: 'rifle', mod: 'nuke', helmet: 'crown', grenade: 'x' });
  assert.equal(bad.mod, 'nomod'); assert.equal(bad.headMul, 2); assert.equal(bad.nadeCount, GRENADE.count);
  // the same sniper head shot: a bare head takes double, a heavy helmet far less
  const hs = (helmet) => {
    const [m, p] = setup('cargo', [['a', 0, 200, 150], ['b', 1, 500, 150]]);
    Object.assign(p.a, statsOf({ weapon: 'sniper' }), { weapon: 'sniper' }); Object.assign(p.b, statsOf({ weapon: 'pistol', helmet }), { hp: 1000 });
    p.a.ammo = 5; p.a.input = { dx: 0, dy: 0, aim: 0, pitch: Math.atan2(R.HEAD + 0.12 - R.EYE, 300 / 50), fire: true };
    m.step(1 / 60); return 1000 - p.b.hp;
  };
  assert.equal(hs('nohelm'), 120); assert.ok(hs('helmet2') < 80);
  // a heavy grenade reaches further than a plain one
  const reach = (kit) => {
    const [m, p] = setup('cargo', [['a', 0, 200, 150], ['v', 1, 1000, 1000]]);
    Object.assign(p.a, statsOf({ grenade: kit }));
    p.v.hp = 1000; p.a.x = 1000 - 345; p.a.y = 1000;
    m.nades.push({ x: p.a.x + 0, y: 1000, z: 0.2, vx: 0, vy: 0, vz: 0, fuse: 0.01, owner: 'a', team: 0, id: 7, radius: GRENADE.radius * p.a.nadeRadius, dmg: GRENADE.dmg * p.a.nadeDmg });
    m.step(1 / 60); return 1000 - p.v.hp;
  };
  assert.equal(reach('frag2'), 0); assert.ok(reach('heavy3') > 0, 'the bigger blast reaches 345 px');
});

test('practice starts by itself against bots and never counts; a challenge waits for a human on each side, is one match, and counts', () => {
  const pr = new Match({ teams: T, perSide: 3, bots: true });
  run(pr, 8);
  assert.notEqual(pr.phase, 'lobby', 'practice began on its own'); assert.equal(pr.count(0), 3);
  const ch = new Match({ teams: T, perSide: 3, bots: true, mode: 'challenge' });
  ch.addPlayer('a', { name: 'A', team: 0 });
  run(ch, 30);
  assert.equal(ch.phase, 'lobby', 'no start with one team missing'); assert.equal(ch.count(1), 0, 'no bots yet');
  ch.addPlayer('b', { name: 'B', team: 1 });
  run(ch, 9); assert.equal(ch.phase, 'lobby', 'a countdown, not an instant start');
  run(ch, 4); assert.notEqual(ch.phase, 'lobby'); assert.equal(ch.count(0), 3); assert.equal(ch.count(1), 3, 'bots fill the rest once it starts');
  // finish it: team 0 wins two rounds
  const ev = [];
  for (let r = 0; r < 2; r++) { for (const p of ch.players.values()) if (p.team === 1) p.alive = false; ch.step(1 / 60); ev.push(...ch.events); if (r === 0) run(ch, 8); }
  assert.ok(ev.some((e) => e.type === 'match' && e.ranked === true && e.winner === 0), 'the result is marked as counting');
  run(ch, 30); assert.equal(ch.phase, 'finished', 'a challenge match does not restart');
});

test('deaths are counted for the one who died, by shot or by grenade', () => {
  const [m, p] = setup('cargo', [['a', 0, 200, 150], ['b', 1, 400, 150]]);
  p.b.hp = 5; p.a.input = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: true };
  m.step(1 / 60);
  assert.equal(p.b.deaths, 1); assert.equal(p.a.deaths, 0);
  assert.equal(m.snapshot().p.find((q) => q[0] === 'b')[14], 1, 'the snapshot carries it');
});

test('sprinting is faster, and you cannot fire or throw while you sprint; bot difficulty is clamped', () => {
  const run1 = (sprint) => { const [m, p] = setup('cargo', [['a', 0, 400, 1000]]); p.a.input = { dx: 1, dy: 0, aim: 0, pitch: 0, fire: false, sprint }; const x0 = p.a.x; for (let i = 0; i < 60; i++) m.step(1 / 60); return p.a.x - x0; };
  const walk = run1(false), fast = run1(true);
  assert.ok(fast > walk * 1.25 && fast < walk * 1.4, `sprint ${fast} vs walk ${walk}`);
  const [m, p] = setup('cargo', [['a', 0, 400, 1000], ['b', 1, 900, 1000]]);
  p.a.input = { dx: 1, dy: 0, aim: 0, pitch: 0, fire: true, nade: true, sprint: true };
  m.step(1 / 60);
  assert.ok(!m.events.some((e) => e.type === 'shot' || e.type === 'nade'), 'no shot and no throw while sprinting');
  p.a.input.sprint = false; m.step(1 / 60);
  assert.ok(m.events.some((e) => e.type === 'shot'), 'firing works again when you stop');
  assert.equal(new Match({ teams: T, difficulty: 9 }).difficulty, 1); assert.equal(new Match({ teams: T, difficulty: 2 }).difficulty, 2);
});
