import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/game.js';
import { NetMatch } from '../src/netmatch.js';

const teams = [{ name: 'BLUE', color: 0x2f7bff }, { name: 'RED', color: 0xff3b30 }];
const setup = () => {
  const m = new Match({ teams, perSide: 3, bots: true, map: 'cargo', mode: 'practice' });
  m.addPlayer('p1', { name: 'Ana', team: 0, loadout: { weapon: 'rifle' } });
  m.startRound();
  for (let i = 0; i < 400; i++) m.step(1 / 30);
  return m;
};
const hello = (m) => ({ id: 'p1', team: 0, teams: m.teams, perSide: m.perSide, roster: m.roster(), map: m.map.id, mode: m.mode, objective: m.objective });

test('a snapshot becomes soldiers shaped like the local match', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  nm.apply(m.snapshot());
  assert.equal(nm.ready, true);
  assert.equal(nm.players.size, m.players.size);
  const me = nm.players.get('p1'), src = m.players.get('p1');
  for (const k of ['team', 'hp', 'alive', 'kills', 'deaths', 'grenades', 'ammo', 'weapon', 'hpMax', 'primary', 'name']) assert.equal(me[k], src[k], k);
  assert.ok(Math.abs(me.x - src.x) <= 1 && Math.abs(me.y - src.y) <= 1);
  assert.equal(me.magSize, src.magSize);
  assert.ok(Math.abs(me.reloadTime - src.reloadTime) < 1e-9);
  assert.equal(nm.phase, m.phase); assert.deepEqual(nm.score, m.score); assert.equal(nm.aliveCount(0), m.aliveCount(0));
});

test('soldiers keep their identity from one snapshot to the next, and leave with the roster', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  nm.apply(m.snapshot());
  const first = nm.players.get('p1'); first.input.fire = true;
  m.step(1 / 30); nm.apply(m.snapshot());
  assert.equal(nm.players.get('p1'), first);
  assert.equal(first.input.fire, true);
  const bot = [...m.players.keys()].find((id) => id !== 'p1');
  m.removePlayer(bot);
  nm.setRoster(m.roster()); nm.apply(m.snapshot());
  assert.equal(nm.players.has(bot), m.players.has(bot));
});

test('events queue up and are handed over once', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  nm.push({ type: 'round', n: 1 }); nm.push({ type: 'shot', by: 'p1' });
  assert.equal(nm.takeEvents().length, 2);
  assert.equal(nm.takeEvents().length, 0);
});

test('a reload shows its time running down', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  const snap = m.snapshot();
  const row = snap.p.find((r) => r[0] === 'p1'); row[13] = 1;
  nm.apply(snap, 1000); const a = nm.players.get('p1').rl;
  nm.apply(snap, 1500); const b = nm.players.get('p1').rl;
  assert.ok(a > 0 && b > 0 && b < a);
  row[13] = 0; nm.apply(snap, 1600);
  assert.equal(nm.players.get('p1').rl, 0);
});

test('your own recoil is replayed from your own shots: one pull of a shotgun counts once, the sights rise over time, the kick settles', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  nm.apply(m.snapshot());
  const me = nm.players.get('p1');
  me.weapon = 'shotgun';
  for (let i = 0; i < 6; i++) nm.push({ type: 'shot', by: 'p1' }, 1000);      // six pellets, one pull
  nm.push({ type: 'shot', by: 'bot' }, 1000);                                  // someone else's shot is not yours
  assert.equal(me.rc.n, 1);
  nm.push({ type: 'shot', by: 'p1' }, 1500);                                   // the next pull
  assert.equal(me.rc.n, 2); assert.ok(me.rc.p > 0, 'the shots lifted the aim');
  me.input.ads = true; me.sprinting = false; me.rl = 0; me.alive = true; me.weapon = 'rifle';
  nm.tick(0.05); assert.ok(me.ads > 0 && me.ads < 1);
  for (let i = 0; i < 20; i++) nm.tick(0.05); assert.equal(me.ads, 1);
  me.input.ads = false; for (let i = 0; i < 40; i++) nm.tick(0.05); assert.equal(me.ads, 0);
  for (let i = 0; i < 80; i++) nm.tick(0.05); assert.equal(me.rc.p, 0); assert.equal(me.rc.n, 0);
});

test('a deathmatch comes through the network match: the type, the time limit, overtime and kills as the score', () => {
  const m = new Match({ teams, perSide: 2, bots: true, map: 'cargo', mode: 'practice', objective: 'dm', minutes: 7 });
  m.addPlayer('p1', { name: 'Ana', team: 0, loadout: { weapon: 'rifle' } });
  m.startRound();
  for (let i = 0; i < 200; i++) m.step(1 / 30);
  const nm = new NetMatch({ ...hello(m), minutes: m.minutes }, teams);
  assert.equal(nm.objective, 'dm'); assert.equal(nm.minutes, 7);
  const foe = [...m.players.values()].find((p) => p.team === 1); foe.alive = true; m.kill(m.players.get('p1'), foe, {});
  nm.apply(m.snapshot());
  assert.deepEqual(nm.score, [1, 0]); assert.equal(nm.objective, 'dm'); assert.equal(nm.overtime, false);
  m.overtime = true; nm.apply(m.snapshot()); assert.equal(nm.overtime, true);
});

test('what lies on the floor comes with a full snapshot, then changes arrive as events; spare rounds are shown', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  nm.apply(m.snapshot());
  assert.equal(nm.pickups.list.length, m.pickups.list.length);
  const src = m.players.get('p1');
  assert.equal(nm.players.get('p1').reserve, src.reserve);
  assert.ok(nm.pickups.list.every((q) => ['ammo', 'med', 'gun'].includes(q.kind) && Number.isFinite(q.x) && Number.isFinite(q.y)));
  // a gun is dropped and taken again: the events keep the list right without a new full snapshot
  const n0 = nm.pickups.list.length;
  nm.push({ type: 'pk+', id: 9001, k: 'gun', x: 500, y: 600, z: 0, w: 'sniper' });
  nm.push({ type: 'pk+', id: 9001, k: 'gun', x: 500, y: 600, z: 0, w: 'sniper' });         // the same drop twice (an event and a full list can overlap)
  assert.equal(nm.pickups.list.length, n0 + 1);
  assert.equal(nm.pickups.list.at(-1).weapon, 'sniper');
  nm.push({ type: 'pk-', id: 9001, by: 'p1' });
  assert.equal(nm.pickups.list.length, n0);
  assert.deepEqual(nm.takeEvents().filter((e) => e.type === 'pk+' || e.type === 'pk-'), [], 'the page draws from the list, the events are not passed on');
  nm.push({ type: 'pickup', by: 'p1', kind: 'med', x: 1, y: 2 });
  assert.equal(nm.takeEvents().length, 1, 'the pickup itself (the sound and the feed line) is passed on');
});

test('bottomless ammunition travels with the snapshot', () => {
  const m = setup(), nm = new NetMatch(hello(m), teams);
  m.players.get('p1').endless = true;
  nm.apply(m.snapshot());
  assert.equal(nm.players.get('p1').endless, true);
  m.players.get('p1').endless = false; nm.apply(m.snapshot());
  assert.equal(nm.players.get('p1').endless, false);
});
