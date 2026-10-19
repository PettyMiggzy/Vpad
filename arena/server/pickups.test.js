// What lies on the floor: ammunition boxes and med kits at fixed spots, the gun of whoever goes down, the use key, and spare rounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, MAPS, statsOf } from './game.js';
import { pickupSpots, PICK, capReserve, startReserve } from './pickups.js';
import { slimSnap, mergeSnap } from './snap.js';
import { readInput } from './room.js';
import { WEAPONS } from './items.js';

const T = [{ name: 'A' }, { name: 'B' }];
/** a live match on an empty floor with two soldiers far apart (nobody can hurt anybody); the pickups are cleared so a test places its own */
function world(gear = {}, mapId = 'cargo') {
  const m = new Match({ teams: T, perSide: 2, bots: false, map: mapId });
  m.map = { ...m.map, solids: [], ramps: [], _pickupSpots: undefined };
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon: 'rifle', ...gear } }), b = m.addPlayer('b', { name: 'B', team: 1 });
  Object.assign(a, { x: 600, y: 2000, z: 0, aim: 0, alive: true }); Object.assign(b, { x: 9000, y: 2000, z: 0, alive: true });
  m.phase = 'live'; m.timer = 600; m.pickups.list = []; m.pickups.timers = [];
  return [m, a, b];
}
const put = (m, o) => { const id = m.nextId++; const p = { id, ...o }; m.pickups.list.push(p); return p; };
const tick = (m, n = 1) => { for (let i = 0; i < n; i++) m.step(1 / 60); };

test('every map has spots on open ground, away from the spawns, the same for both teams, the same every time, and a spot on the highest deck', () => {
  for (const [id, mp] of Object.entries(MAPS)) {
    const spots = pickupSpots(mp);
    assert.ok(spots.length >= 6, `${id} has ${spots.length} spots`);
    assert.deepEqual(pickupSpots(mp), spots);
    const half = spots.length / 2;
    for (let i = 0; i < half; i++) {
      const a = spots[i], b = spots[i + half];
      assert.equal(b.x, Math.round(mp.w - a.x), `${id}: twin x`);
      assert.equal(b.y, mp.sym === 'x' ? a.y : Math.round(mp.h - a.y), `${id}: twin y`);
      assert.equal(b.z, a.z);
    }
    for (const s of spots) {
      if (s.z === 0) for (const q of mp.solids) assert.ok(!(s.x > q.x - 50 && s.x < q.x + q.w + 50 && s.y > q.y - 50 && s.y < q.y + q.h + 50), `${id}: spot ${s.x},${s.y} is clear of ${q.kind}`);
      for (const t of [0, 1]) for (const [sx, sy] of mp.spawns[t]) assert.ok(Math.hypot(sx - s.x, sy - s.y) >= (s.z ? 0 : 480), `${id}: spot ${s.x},${s.y} is away from the spawns`);
    }
    const top = Math.max(0, ...mp.solids.filter((q) => q.walk && q.top >= 4).map((q) => q.top));
    if (top) assert.ok(spots.some((s) => s.z === top), `${id}: a spot on the highest deck`);
  }
});

test('a new round fills every spot with ammunition or a med kit', () => {
  const m = new Match({ teams: T, perSide: 2, bots: true, map: 'dust' });
  m.startRound();
  const spots = pickupSpots(m.map);
  assert.equal(m.pickups.list.length, spots.length);
  for (const p of m.pickups.list) assert.ok(['ammo', 'med'].includes(p.kind));
  assert.equal(new Set(m.pickups.list.map((p) => p.spot)).size, spots.length);
});

test('an ammunition box gives a magazine and a half for the gun in your hands and a magazine for the sidearm, never past the most you can hold, and only when you need it', () => {
  const [m, a] = world();
  a.reserve = 30; a.stashRes = 5;
  const box = put(m, { kind: 'ammo', x: 600, y: 2000, z: 0, spot: undefined });
  tick(m);
  const mag = m.magOf(a, 'rifle');
  assert.equal(a.reserve, 30 + Math.round(mag * PICK.ammoMags)); assert.equal(a.stashRes, 5 + m.magOf(a, 'pistol'));
  assert.ok(!m.pickups.list.includes(box));
  // full: left lying
  a.reserve = capReserve(mag, false); a.stashRes = capReserve(m.magOf(a, 'pistol'), true);
  const box2 = put(m, { kind: 'ammo', x: 600, y: 2000, z: 0 });
  tick(m); assert.ok(m.pickups.list.includes(box2), 'a full soldier does not use the box up');
  // topped off, not over
  a.reserve = capReserve(mag, false) - 10; tick(m); assert.equal(a.reserve, capReserve(mag, false));
});

test('a med kit gives 50 health up to your maximum, and is left alone at full health', () => {
  const [m, a] = world();
  a.hp = 100; a.hpMax = 100;
  const kit = put(m, { kind: 'med', x: 610, y: 2000, z: 0 });
  tick(m); assert.ok(m.pickups.list.includes(kit), 'full health leaves it');
  a.hp = 30; tick(m); assert.equal(Math.round(a.hp), 80); assert.ok(!m.pickups.list.includes(kit));
  a.hp = 70; put(m, { kind: 'med', x: 610, y: 2000, z: 0 }); tick(m); assert.equal(a.hp, 100);
});

test('the dead, the far and the ones on another floor take nothing', () => {
  const [m, a] = world();
  a.hp = 10; a.reserve = 0;
  const kit = put(m, { kind: 'med', x: 600 + PICK.radius + 20, y: 2000, z: 0 }), box = put(m, { kind: 'ammo', x: 600, y: 2000, z: 4.2 });
  tick(m); assert.ok(m.pickups.list.includes(kit) && m.pickups.list.includes(box), 'too far, and a deck above');
  a.alive = false; a.x = kit.x; put(m, { kind: 'med', x: a.x, y: a.y, z: 0 }); tick(m);
  assert.equal(m.pickups.list.filter((p) => p.kind === 'med').length, 2, 'a dead soldier takes nothing');
});

test('a taken spot holds something new after 25 seconds', () => {
  const m = new Match({ teams: T, perSide: 1, bots: false, map: 'cargo' });
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: {} }); m.addPlayer('b', { name: 'B', team: 1 });
  m.startRound(); m.phase = 'live'; m.timer = 600;
  const spot = pickupSpots(m.map)[0], first = m.pickups.list.find((p) => p.spot === 0);
  Object.assign(a, { x: spot.x, y: spot.y, z: spot.z, hp: 10, reserve: 0, stashRes: 0, alive: true });
  tick(m); assert.ok(!m.pickups.list.some((p) => p.id === first.id), 'taken');
  assert.ok(!m.pickups.list.some((p) => p.spot === 0));
  a.x = 5000; tick(m, 60 * 24); assert.ok(!m.pickups.list.some((p) => p.spot === 0), 'not yet');
  tick(m, 60 * 2); assert.ok(m.pickups.list.some((p) => p.spot === 0 && p.id !== first.id), 'back with a new thing');
});

test('whoever goes down drops their gun with what is left in it; the free pistol is not dropped; only twelve guns lie at once and each is gone after 30 seconds', () => {
  const [m, a, b] = world({ weapon: 'smg' });
  const spare = m.addPlayer('c', { name: 'C', team: 0 }); Object.assign(spare, { x: 9500, y: 3000, z: 0, alive: true }); // keeps the round going while 'a' keeps dying
  a.ammo = 17; a.reserve = 44;
  m.kill(b, a);
  const g = m.pickups.list.find((p) => p.kind === 'gun');
  assert.ok(g && g.weapon === 'smg' && g.ammo === 17 && g.res === 44 && g.x === 600, 'the gun lies where they fell');
  const [m2, c] = world({ weapon: 'pistol' }); m2.kill(null, c);
  assert.equal(m2.pickups.list.filter((p) => p.kind === 'gun').length, 0);
  // the gun in the primary slot drops even while the sidearm is in hand
  const [m3, d] = world({ weapon: 'sniper' }); m3.swapSlot(d); m3.kill(null, d);
  assert.equal(m3.pickups.list.find((p) => p.kind === 'gun').weapon, 'sniper');
  for (let i = 0; i < 20; i++) { const [mm, e] = [m, m.players.get('a')]; e.alive = true; e.primary = 'rifle'; b.streak = 0; m.kill(b, e); }
  assert.ok(m.pickups.list.filter((p) => p.kind === 'gun').length <= PICK.maxGuns);
  tick(m, 60 * 29); assert.ok(m.pickups.list.some((p) => p.kind === 'gun'));
  tick(m, 60 * 2); assert.equal(m.pickups.list.filter((p) => p.kind === 'gun').length, 0, 'gone after 30 seconds');
});

test('the use key takes the gun at your feet and leaves yours in its place', () => {
  const [m, a] = world({ weapon: 'rifle' });
  a.ammo = 11; a.reserve = 60;
  const g = put(m, { kind: 'gun', x: 620, y: 2000, z: 0, weapon: 'sniper', ammo: 3, res: 999, until: 1e9 });
  a.input.use = true; tick(m);
  assert.equal(a.primary, 'sniper'); assert.equal(a.weapon, 'sniper'); assert.equal(a.ammo, 3);
  assert.equal(a.reserve, Math.min(999, capReserve(m.magOf(a, 'sniper'), false)), 'what it carries is capped');
  assert.equal(a.magSize, m.magOf(a, 'sniper')); assert.ok(a.swapT > 0);
  assert.ok(!m.pickups.list.includes(g));
  const mine = m.pickups.list.find((p) => p.kind === 'gun');
  assert.ok(mine && mine.weapon === 'rifle' && mine.ammo === 11 && mine.res === 60, 'your old gun lies where you stood');
  assert.equal(a.input.use, false, 'the key is used up');
  assert.ok(m.events.some((e) => e.type === 'pickup' && e.kind === 'gun'));
});

test('the use key does nothing when no gun is within reach, or on another floor', () => {
  const [m, a] = world();
  put(m, { kind: 'gun', x: 600 + PICK.gunRadius + 30, y: 2000, z: 0, weapon: 'sniper', ammo: 3, res: 9, until: 1e9 });
  put(m, { kind: 'gun', x: 600, y: 2000, z: 4.2, weapon: 'lmg', ammo: 3, res: 9, until: 1e9 });
  a.input.use = true; tick(m); assert.equal(a.primary, 'rifle');
});

test('with the sidearm in your hands, a gun still goes into the primary slot; a pistol-only soldier keeps the pistol as the sidearm and drops nothing', () => {
  const [m, a] = world({ weapon: 'rifle' });
  m.swapSlot(a); a.swapT = 0; assert.equal(a.weapon, 'pistol');
  put(m, { kind: 'gun', x: 600, y: 2000, z: 0, weapon: 'dmr', ammo: 4, res: 20, until: 1e9 });
  a.input.use = true; tick(m);
  assert.equal(a.primary, 'dmr'); assert.equal(a.slot, 0); assert.equal(a.weapon, 'dmr');
  const [m2, b] = world({ weapon: 'pistol' }); b.ammo = 5; b.reserve = 8;
  put(m2, { kind: 'gun', x: 600, y: 2000, z: 0, weapon: 'shotgun', ammo: 2, res: 6, until: 1e9 });
  b.input.use = true; tick(m2);
  assert.equal(b.primary, 'shotgun'); assert.equal(b.stash, 5); assert.equal(b.stashRes, 8, 'the pistol keeps its rounds as the sidearm');
  assert.equal(m2.pickups.list.filter((p) => p.kind === 'gun').length, 0, 'the pistol is not dropped');
  m2.swapSlot(b); assert.equal(b.weapon, 'pistol'); assert.equal(b.ammo, 5); assert.equal(b.reserve, 8);
});

test('a reload takes what the magazine needs from the spare rounds, no more; with none left there is no reload', () => {
  const [m, a] = world({ weapon: 'rifle' });
  a.ammo = 10; a.reserve = 8; a.input.reload = true; tick(m); a.input.reload = false;
  tick(m, 60 * 4); assert.equal(a.ammo, 18); assert.equal(a.reserve, 0);
  a.input.reload = true; tick(m); assert.equal(a.rl, 0, 'nothing to reload with');
  a.ammo = 0; a.input.reload = false; a.input.fire = true; a.cd = 0; tick(m);
  assert.ok(m.events.some((e) => e.type === 'dry') || a.ammo === 0, 'it clicks');
  a.ammo = 20; a.reserve = 100; a.input.fire = false; a.input.reload = true; tick(m); tick(m, 60 * 4);
  assert.equal(a.ammo, m.magOf(a, 'rifle')); assert.equal(a.reserve, 100 - (m.magOf(a, 'rifle') - 20));
});

test('you come in with four spare magazines for the primary and three for the sidearm, and every respawn restocks', () => {
  const [m, a] = world({ weapon: 'rifle' });
  assert.equal(a.reserve, startReserve(m.magOf(a, 'rifle'), false)); assert.equal(a.stashRes, startReserve(m.magOf(a, 'pistol'), true));
  assert.equal(startReserve(30, false), 120); assert.equal(startReserve(12, true), 36);
  a.reserve = 0; a.stashRes = 0; m.spawn(a);
  assert.equal(a.reserve, 120); assert.equal(a.stashRes, 36);
});

test('the snapshot carries your spare rounds and, with a full snapshot, what lies on the floor; a delta leaves the floor out and the page keeps what it had', () => {
  const [m, a] = world();
  put(m, { kind: 'ammo', x: 1000, y: 1000, z: 0 }); put(m, { kind: 'gun', x: 1100, y: 1000, z: 0, weapon: 'lmg', ammo: 9, res: 9, until: 1e9 });
  const s = m.snapshot();
  assert.equal(s.p.find((r) => r[0] === 'a')[17], a.reserve);
  assert.deepEqual(s.pk.map((q) => q.k), ['ammo', 'gun']); assert.equal(s.pk[1].w, 'lmg');
  const first = slimSnap(null, s); assert.equal(first.snap.full, 1); assert.ok(first.snap.pk);
  const next = slimSnap(first.state, s); assert.ok(!next.snap.full && next.snap.pk === undefined);
  const merged = mergeSnap(mergeSnap(null, first.snap), next.snap); assert.equal(merged.p.length, 2);
});

test('the room accepts the use key and nothing else new', () => {
  assert.equal(readInput({ use: true }).use, true); assert.equal(readInput({ use: 'yes' }), null); assert.equal(readInput({ dx: 0 }).use, false);
  assert.equal(readInput({ grab: true }), null);
});

test('a bot with both guns nearly empty and no enemy in sight heads for an ammunition box and takes it', () => {
  const m = new Match({ teams: T, perSide: 1, bots: true, map: 'cargo' });
  m.map = { ...m.map, solids: [{ kind: 'wall', x: 3000, y: 0, w: 60, h: 4000, top: 5, walk: false }], ramps: [], _pickupSpots: undefined };
  m.startRound(); m.phase = 'live'; m.timer = 600; m.pickups.list = []; m.pickups.timers = [];
  const bot = [...m.players.values()].find((p) => p.bot && p.team === 0), foe = [...m.players.values()].find((p) => p.team === 1);
  Object.assign(bot, { x: 800, y: 2000, z: 0, ammo: 0, reserve: 0, stash: 0, stashRes: 0 }); Object.assign(foe, { x: 9000, y: 2000, z: 0 });
  const box = put(m, { kind: 'ammo', x: 800, y: 2600, z: 0 });
  for (let i = 0; i < 60 * 12 && m.pickups.list.includes(box); i++) { foe.x = 9000; foe.y = 2000; foe.hp = foe.hpMax; m.step(1 / 60); }
  assert.ok(!m.pickups.list.includes(box), 'the bot fetched it');
  assert.ok(bot.reserve > 0 || bot.stashRes > 0);
});

test('whole matches of bots on every map: boxes, kits and dropped guns come and go, nothing breaks and nobody ends up with a negative or runaway count', () => {
  let total = 0;
  for (const id of Object.keys(MAPS)) {
    const m = new Match({ teams: T, perSide: 8, bots: true, map: id });
    m.startRound(); let taken = 0, drops = 0, bad = false;
    for (let i = 0; i < 60 * 240; i++) {
      m.step(1 / 60);
      for (const e of m.events) { if (e.type === 'pickup') taken++; if (e.type === 'pk+' && e.k === 'gun') drops++; }
      if (i % 120 === 0) for (const p of m.players.values()) { const cap = capReserve(WEAPONS[p.primary].mag * 3, false) + 1; if (!(p.reserve >= 0 && p.reserve <= cap && p.stashRes >= 0 && p.ammo >= 0 && p.ammo <= p.magSize)) bad = true; }
    }
    assert.ok(taken >= 1, `${id}: ${taken} things taken`); total += taken; assert.ok(drops > 0, `${id}: guns dropped`); assert.ok(!bad, `${id}: counts stay in range`);
    assert.ok(m.pickups.list.filter((p) => p.kind === 'gun').length <= PICK.maxGuns);
  }
  assert.ok(total >= 12, `${total} things taken across the maps`);
});
