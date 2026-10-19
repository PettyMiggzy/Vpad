// The training yard: a shared range where the team spawns on the west side and the red team is a row of target dummies. Nothing is scored, nothing ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, MAPS } from './game.js';
import { roomOptions, MatchRoom } from './room.js';

const T = [{ name: 'A' }, { name: 'B' }];
const yard = (o = {}) => new Match({ teams: T, perSide: 6, bots: true, map: 'training', ...o });
const live = (m) => { m.startRound(); for (let i = 0; i < 60 * 4; i++) m.step(1 / 60); return m; };

test('the training map and the training objective come together, on the server too, and no player asks the room for a score', () => {
  const m = yard({ objective: 'elim', mode: 'challenge' });
  assert.equal(m.objective, 'train'); assert.equal(m.mode, 'train'); assert.equal(m.map.id, 'training');
  const m2 = new Match({ teams: T, perSide: 4, bots: true, map: 'cargo', objective: 'train' });
  assert.equal(m2.map.id, 'training');
  for (const o of [roomOptions({ map: 'training' }), roomOptions({ map: 'cargo', objective: 'train', mode: 'challenge' })]) assert.deepEqual([o.map, o.objective, o.mode], ['training', 'train', 'train']);
  assert.equal(roomOptions({ map: 'cargo', objective: 'dm' }).mode, 'practice');
  assert.equal(roomOptions({ objective: 'train', spar: true }).spar, true); assert.equal(roomOptions({ objective: 'train', spar: 'yes' }).spar, false); assert.equal(roomOptions({ objective: 'dm', spar: true }).spar, false);
  const s = live(yard()).snapshot(); assert.equal(s.obj, 'train'); assert.equal(s.mode, 'train');
});

test('everyone who trains is on the first team, even when they ask for the other, up to the seats; the targets stand on their own stands', () => {
  const m = yard({ perSide: 3 });
  const ps = [0, 1, 1, 0].map((t, i) => m.addPlayer('p' + i, { name: 'P' + i, team: t }));
  assert.deepEqual(ps.map((p) => p && p.team), [0, 0, 0, null], 'three seats, then full');
  live(m);
  const dummies = [...m.players.values()].filter((p) => p.dummyAt !== undefined);
  assert.equal(dummies.length, MAPS.training.spawns[1].length);
  assert.ok(dummies.every((d) => d.team === 1 && d.bot && /^TARGET \d+$/.test(d.name)));
  for (const d of dummies) { const [sx, sy] = MAPS.training.spawns[1][d.dummyAt]; assert.ok(Math.hypot(d.x - sx, d.y - sy) < 1, `${d.name} stands on its stand`); }
  assert.equal(new Set(dummies.map((d) => d.dummyAt)).size, dummies.length);
});

test('the yard never ends: with every target and every soldier down for ten minutes, no round or match ends and no score moves', () => {
  const m = live(yard()); const me = m.addPlayer('me', { name: 'ME', team: 0 });
  let ended = 0, scoreMoved = false;
  for (let i = 0; i < 60 * 600; i++) {
    if (i % 120 === 0) for (const p of m.players.values()) if (p.alive) m.kill(p.team === 0 ? [...m.players.values()].find((q) => q.team === 1) : me, p);
    m.step(1 / 60);
    for (const e of m.events) if (e.type === 'match' || e.type === 'roundEnd') ended++;
    if (m.score[0] || m.score[1]) scoreMoved = true;
  }
  assert.equal(ended, 0); assert.ok(!scoreMoved); assert.equal(m.phase, 'live'); assert.equal(m.round, 1);
});

test('whoever goes down comes back: a soldier after a moment and a short cover, a target after three seconds on its own stand', () => {
  const m = live(yard()); const me = m.addPlayer('me', { name: 'ME', team: 0 });
  const d = [...m.players.values()].find((p) => p.dummyAt === 2), [sx, sy] = MAPS.training.spawns[1][2];
  d.x += 200; m.kill(me, d); m.kill(d, me);
  assert.ok(!d.alive && !me.alive);
  for (let i = 0; i < 60 * 1.4; i++) m.step(1 / 60); assert.ok(!me.alive, 'not yet');
  for (let i = 0; i < 60 * 0.3; i++) m.step(1 / 60); assert.ok(me.alive, 'a soldier is back after about a second and a half'); assert.ok(me.prot > 0, 'with a moment of cover');
  assert.ok(!d.alive, 'the target is still down');
  for (let i = 0; i < 60 * 1.5; i++) m.step(1 / 60);
  assert.ok(d.alive && Math.hypot(d.x - sx, d.y - sy) < 1, 'the target is back on its stand');
});

test('targets stand still and never fire; in spar mode the same targets fight back as easy bots', () => {
  const calm = live(yard({ difficulty: 0 })); const me = calm.addPlayer('me', { name: 'ME', team: 0 });
  const d = [...calm.players.values()].find((p) => p.dummyAt === 0); me.x = d.x - 700; me.y = d.y; me.z = 0; me.hp = 1e9;
  const at = [...calm.players.values()].filter((p) => p.dummyAt !== undefined).map((p) => [p.x, p.y]);
  let shots = 0; for (let i = 0; i < 60 * 90; i++) { calm.step(1 / 60); for (const e of calm.events) if (e.type === 'shot' && e.by !== 'me') shots++; me.hp = 1e9; }
  assert.equal(shots, 0, 'no target fires'); assert.deepEqual([...calm.players.values()].filter((p) => p.dummyAt !== undefined).map((p) => [p.x, p.y]), at, 'and none of them moves');
  const hot = live(yard({ difficulty: 0, spar: true })); const you = hot.addPlayer('you', { name: 'YOU', team: 0 });
  let fired = 0; for (let i = 0; i < 60 * 90; i++) { hot.step(1 / 60); for (const e of hot.events) if (e.type === 'shot' && e.by !== 'you') fired++; you.hp = 1e9; }
  assert.ok(fired > 0, `sparring targets shoot (${fired})`);
});

test('training pays nothing: no coins or experience for kills in the yard', () => {
  const touched = [];
  const room = { match: { train: true }, pids: { get() { touched.push('pids'); } }, };
  MatchRoom.prototype.reward.call(room, { type: 'kill', by: 'x', victim: 'y', head: true });
  MatchRoom.prototype.reward.call(room, { type: 'match', winner: 0 });
  assert.deepEqual(touched, [], 'the room does not even look up the player');
  const real = { match: { train: false }, pids: { get() { touched.push('pids'); return null; }, entries() { return []; }, [Symbol.iterator]() { return [][Symbol.iterator](); } } };
  MatchRoom.prototype.reward.call(real, { type: 'kill', by: 'x', victim: 'y' });
  assert.deepEqual(touched, ['pids'], 'a real match still looks it up');
});

test('the yard is a place worth training in: lanes out to 90 metres, a tower, an obstacle course, a house with rooms, targets in all of them', () => {
  const mp = MAPS.training, M = 50;
  assert.ok(mp.solids.some((s) => s.kind === 'tower' && s.top >= 8), 'a sniper tower');
  assert.ok(mp.solids.filter((s) => s.kind === 'wall').length >= 12, 'walls of a house');
  const far = Math.max(...mp.spawns[1].map(([x]) => x - Math.max(...mp.spawns[0].map(([sx]) => sx))));
  assert.ok(far / M >= 90, `the farthest target is ${(far / M).toFixed(0)} m from the spawn`);
  const inHouse = mp.spawns[1].filter(([x, y]) => x / M > 72 && x / M < 104 && y / M > 6 && y / M < 24).length;
  assert.ok(inHouse >= 5, `${inHouse} targets in the house`);
  assert.ok(mp.spawns[0].length >= 24 && mp.spawns[1].length >= 15);
});

test('two soldiers and sparring targets for five minutes: nobody leaves the yard, nothing breaks', () => {
  const m = live(yard({ difficulty: 1, spar: true })); const a = m.addPlayer('a', { name: 'A', team: 0 }), b = m.addPlayer('b', { name: 'B', team: 0 });
  let bad = false;
  for (let i = 0; i < 60 * 300; i++) {
    a.input.fire = (i % 90) < 30; a.input.dx = Math.sin(i / 200); b.input.dy = Math.cos(i / 150);
    m.step(1 / 60);
    if (i % 300 === 0) for (const p of m.players.values()) if (![p.x, p.y, p.z, p.hp].every(Number.isFinite) || p.x < 0 || p.x > m.map.w || p.y < 0 || p.y > m.map.h) bad = true;
  }
  assert.ok(!bad); assert.equal(m.phase, 'live');
});
