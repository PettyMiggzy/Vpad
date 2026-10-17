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
