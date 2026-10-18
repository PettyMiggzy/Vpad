// Deathmatch: one timed match, everyone comes back after going down, the team with more kills when the clock ends wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, R } from './game.js';
import { roomOptions } from './room.js';

const T = [{ name: 'A' }, { name: 'B' }];
const run = (m, seconds) => { for (let i = 0; i < seconds * 60; i++) m.step(1 / 60); };
const flat = (m) => { m.map = { ...m.map, solids: [], ramps: [] }; return m; };
/** two humans facing each other on an empty floor, the match already live, no computer players */
function duel(minutes = 2) {
  const m = flat(new Match({ teams: T, perSide: 1, bots: false, map: 'cargo', objective: 'dm', minutes }));
  const a = m.addPlayer('a', { name: 'A', team: 0 }), b = m.addPlayer('b', { name: 'B', team: 1 });
  Object.assign(a, { x: 400, y: 400, z: 0, aim: 0, pitch: 0 }); Object.assign(b, { x: 700, y: 400, z: 0, aim: Math.PI, pitch: 0 });
  m.phase = 'countdown'; m.timer = 0.01; m.round = 1; run(m, 0.1);
  return [m, a, b];
}
const shootDown = (m, a, b) => { b.hp = 1; m.shoot(a, { ...{ dmg: 100, pellets: 1, spread: 0, gap: 0.1 }, ...a }); };
const frag = (m, killer, victim) => { victim.alive = true; victim.hp = 1; m.kill(killer, victim, {}); };

test('the clock is the time the creator asked for, and options are kept inside 1 to 30 minutes', () => {
  const [m] = duel(7);
  assert.equal(m.phase, 'live'); assert.ok(Math.abs(m.timer - 420) < 1, `timer ${m.timer}`);
  assert.equal(roomOptions({ objective: 'dm', minutes: 99 }).minutes, 30);
  assert.equal(roomOptions({ objective: 'dm', minutes: -3 }).minutes, 1);
  assert.equal(roomOptions({ objective: 'dm', minutes: 'x' }).minutes, 5);
  assert.equal(roomOptions({ objective: 'dm' }).objective, 'dm');
  assert.equal(roomOptions({ objective: 'nonsense' }).objective, 'elim');
});

test('a kill scores for the killer\'s team, a self-kill and a teammate do not, and the fallen come back after the respawn time with full health', () => {
  const [m, a, b] = duel();
  frag(m, a, b);
  assert.deepEqual(m.score, [1, 0]); assert.equal(b.alive, false);
  run(m, R.RESPAWN - 0.5); assert.equal(b.alive, false, 'back too early');
  run(m, 1); assert.equal(b.alive, true, 'did not come back'); assert.equal(b.hp, b.hpMax);
  frag(m, b, b); assert.deepEqual(m.score, [1, 0], 'a self-kill scored');
  assert.equal(m.phase, 'live', 'the match went on');
});

test('someone who has just come back cannot be hurt until they act or the cover runs out, and taking a shot ends it', () => {
  const [m, a, b] = duel();
  frag(m, a, b); run(m, R.RESPAWN + 0.2);
  assert.ok(b.prot > 0, 'no cover on return');
  const hp = b.hp; Object.assign(a, { x: 400, y: 400, aim: 0, pitch: 0, alive: true, hp: a.hpMax }); Object.assign(b, { x: 700, y: 400 });
  a.input.fire = true; a.cd = 0; a.ammo = 10; run(m, 0.5);
  assert.equal(b.hp, hp, 'a shot hurt someone under cover');
  b.input.fire = true; b.aim = Math.PI; b.cd = 0; b.ammo = 10; run(m, 0.2); assert.equal(b.prot, 0, 'firing kept the cover');
  run(m, R.PROTECT + 1); assert.equal(b.prot, 0);
});

test('at the end the team with more kills wins the match; the result is reported once', () => {
  const [m, a, b] = duel(1);
  frag(m, a, b); run(m, R.RESPAWN + 0.5); frag(m, a, b); frag(m, b, a);
  const ev = []; m.timer = 0.05;
  for (let i = 0; i < 20; i++) { m.step(1 / 60); ev.push(...m.events.filter((e) => e.type === 'match')); }
  assert.equal(m.phase, 'matchover'); assert.equal(m.winner, 0);
  assert.equal(ev.length, 1); assert.equal(ev[0].winner, 0);
});

test('a tie plays on after time, and the next kill ends it', () => {
  const [m, a, b] = duel(1);
  frag(m, a, b); frag(m, b, a); m.timer = 0.05; run(m, 0.5);
  assert.equal(m.phase, 'live', 'a tie ended the match'); assert.equal(m.overtime, true);
  const snap = m.snapshot(); assert.equal(snap.ot, 1); assert.equal(snap.obj, 'dm'); assert.equal(snap.mn, 1);
  frag(m, b, a); assert.equal(m.phase, 'matchover'); assert.equal(m.winner, 1);
});

test('kills after the end do not move the score', () => {
  const [m, a, b] = duel(1);
  frag(m, a, b); m.timer = 0.05; run(m, 0.5); assert.equal(m.phase, 'matchover');
  frag(m, b, a); assert.deepEqual(m.score, [1, 0]);
});

test('a respawn goes to the spawn point farthest from the enemies still standing', () => {
  const m = flat(new Match({ teams: T, perSide: 1, bots: false, map: 'cargo', objective: 'dm' }));
  const a = m.addPlayer('a', { name: 'A', team: 0 }), b = m.addPlayer('b', { name: 'B', team: 1 });
  m.phase = 'live'; m.timer = 100;
  const list = m.map.spawns[0];
  Object.assign(b, { x: list[0][0] + 20, y: list[0][1] + 20, alive: true });
  a.alive = false; m.spawn(a);
  const d = (c) => Math.hypot(b.x - c[0], b.y - c[1]);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= Math.max(...list.map(d)) - 30, 'came back right next to an enemy');
});

test('computer players alone play a whole deathmatch: they respawn, score, and the match ends with a winner', () => {
  const m = new Match({ teams: T, perSide: 6, bots: true, map: 'dust', objective: 'dm', minutes: 2 });
  m.startRound(); let ended = null, bad = false, respawned = 0, wasDead = new Set();
  for (let i = 0; i < 60 * 200; i++) {
    m.step(1 / 60);
    for (const e of m.events) if (e.type === 'match' && !ended) ended = e;
    for (const p of m.players.values()) {
      if (!p.alive) wasDead.add(p.id); else if (wasDead.delete(p.id)) respawned++;
      if (![p.x, p.y, p.z, p.hp].every(Number.isFinite)) bad = true;
    }
    if (ended) break;
  }
  assert.ok(!bad); assert.ok(ended, 'no result'); assert.ok(respawned > 5, `respawns ${respawned}`);
  assert.equal(m.score[ended.winner] > m.score[1 - ended.winner] || m.overtime === false, true);
});
