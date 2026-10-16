import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, R, pushOut, clearLine, WALLS, MAP } from './game.js';

const run = (m, seconds) => { for (let i = 0; i < seconds * 30; i++) m.step(1 / 30); };

test('bots alone play whole matches: rounds end, scores reach two, the match restarts', () => {
  const m = new Match({ teams: [{ name: 'A' }, { name: 'B' }], perSide: 6, bots: true });
  let matches = 0, rounds = new Set();
  for (let i = 0; i < 30 * 900; i++) { m.step(1 / 30); rounds.add(m.round); if (m.events.some((e) => e.type === 'match')) matches++; }
  assert.ok(matches >= 2, `matches finished: ${matches}`);
  assert.ok(rounds.size >= 3, `rounds seen: ${rounds.size}`);
  for (const p of m.players.values()) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); assert.ok(p.x >= 0 && p.x <= MAP.w && p.y >= 0 && p.y <= MAP.h); }
});

test('a human takes a bot seat, teams stay within the seats, a full side refuses', () => {
  const m = new Match({ teams: [{ name: 'A' }, { name: 'B' }], perSide: 3, bots: true });
  m.fillBots();
  assert.equal(m.count(0), 3); assert.equal(m.count(1), 3);
  const a = m.addPlayer('s1', { name: 'Ann', team: 0, loadout: { weapon: 'rifle', armor: 'heavy', boots: 'runner' } });
  assert.equal(a.team, 0); assert.equal(m.count(0), 3, 'a bot made room');
  m.addPlayer('s2', { name: 'Bob', team: 0 }); m.addPlayer('s3', { name: 'Cy', team: 0 });
  assert.equal(m.humans(0), 3);
  const d = m.addPlayer('s4', { name: 'Di', team: 0 });
  assert.equal(d.team, 1, 'the full side sends them to the other');
});

test('a human cannot shoot teammates, walls stop bullets, damage kills in four hits', () => {
  const m = new Match({ teams: [{ name: 'A' }, { name: 'B' }], perSide: 2, bots: false });
  const a = m.addPlayer('a', { name: 'A', team: 0 }), b = m.addPlayer('b', { name: 'B', team: 1 }), c = m.addPlayer('c', { name: 'C', team: 0 });
  m.phase = 'live'; m.timer = 60;
  a.x = 200; a.y = 200; b.x = 400; b.y = 200; c.x = 300; c.y = 200; a.aim = 0;
  // c stands between a and b but is a teammate: the bullet passes through c and hits b
  a.input = { dx: 0, dy: 0, aim: 0, fire: true };
  for (let i = 0; i < 30 * 3; i++) m.step(1 / 30);
  assert.ok(c.hp === R.HP, 'teammate untouched');
  assert.ok(b.hp < R.HP || !b.alive, 'enemy was hit');
});

test('pushOut keeps circles out of walls and clearLine sees walls', () => {
  const [wx, wy, ww, wh] = WALLS[4];
  const [x, y] = pushOut(wx + ww / 2, wy + wh / 2);
  assert.ok(!(x > wx && x < wx + ww && y > wy && y < wy + wh));
  assert.equal(clearLine(100, 500, 1500, 500), false);
  assert.equal(clearLine(60, 60, 200, 60), true);
});
