import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/game.js';
import { stepLocal, sampleTrack, lerpAngle, reconcile, decayOffset, INTERP_MS } from '../src/net.js';

test('a predicted soldier follows the rules through a sprint and a jump', () => {
  const m = new Match({ teams: [{ name: 'A' }, { name: 'B' }], perSide: 1, bots: false, map: 'cargo' });
  const a = m.addPlayer('a', { name: 'A', team: 0 });
  m.addPlayer('b', { name: 'B', team: 1 });
  m.phase = 'live'; m.timer = 30;
  a.x = 100; a.y = 200; a.z = 0; a.air = false; a.vz = 0;
  const input = { dx: 1, dy: 0.2, aim: 0.4, pitch: -0.3, fire: false, nade: false, reload: false, sprint: true, jump: true, melee: false, swap: false };
  a.input = { ...input };
  let s = { x: a.x, y: a.y, z: a.z, vz: 0, air: false, aim: a.aim, pitch: a.pitch, weapon: a.weapon, speedMul: a.speedMul, boost: false, map: m.map };
  for (let i = 0; i < 45; i++) {
    m.step(1 / 30);
    s = stepLocal(s, input, 1 / 30, true);
    assert.ok(Math.abs(s.x - a.x) < 1e-4, `x ${s.x} vs ${a.x} at ${i}`);
    assert.ok(Math.abs(s.y - a.y) < 1e-4, `y ${s.y} vs ${a.y} at ${i}`);
    assert.ok(Math.abs(s.z - a.z) < 1e-4, `z ${s.z} vs ${a.z} at ${i}`);
  }
});

test('a predicted crouch and slide stay with the server', () => {
  const m = new Match({ teams: [{ name: 'A' }, { name: 'B' }], perSide: 1, bots: false, map: 'cargo' });
  const a = m.addPlayer('a', { name: 'A', team: 0 });
  m.addPlayer('b', { name: 'B', team: 1 });
  m.phase = 'live'; m.timer = 30;
  a.x = 200; a.y = 150; a.z = 0; a.air = false; a.vz = 0;
  const input = { dx: 1, dy: 0, aim: 0, pitch: 0, fire: false, nade: false, reload: false, sprint: true, jump: false, melee: false, swap: false, use: false, ads: false, crouch: false };
  a.input = { ...input };
  let s = { x: a.x, y: a.y, z: a.z, vz: 0, air: false, aim: a.aim, pitch: a.pitch, weapon: a.weapon, speedMul: a.speedMul, boost: false, map: m.map, crouch: 0, slideT: 0, slideCd: 0, crouchHeld: false, slideX: 1, slideY: 0 };
  const check = (i) => {
    assert.ok(Math.abs(s.x - a.x) < 1e-4, `x ${s.x} vs ${a.x} at ${i}`);
    assert.ok(Math.abs(s.y - a.y) < 1e-4, `y at ${i}`);
    assert.ok(Math.abs(s.z - a.z) < 1e-4, `z at ${i}`);
    assert.ok(Math.abs((s.crouch || 0) - (a.crouch || 0)) < 1e-4, `crouch at ${i}`);
    assert.ok(Math.abs((s.slideT || 0) - (a.slideT || 0)) < 1e-4, `slide at ${i}`);
  };
  for (let i = 0; i < 8; i++) { m.step(1 / 30); s = stepLocal(s, input, 1 / 30, true); check(i); }
  input.crouch = true; a.input = { ...input };
  for (let i = 0; i < 25; i++) { m.step(1 / 30); s = stepLocal(s, input, 1 / 30, true); check(`c${i}`); }
});

test('other soldiers are sampled between snapshots, a tenth of a second back', () => {
  assert.equal(INTERP_MS, 100);
  const track = [
    { t: 0, x: 0, y: 0, z: 0, aim: 0, pitch: 0 },
    { t: 100, x: 100, y: 40, z: 2, aim: 0.4, pitch: 0.2 },
  ];
  const s = sampleTrack(track, 1000 - INTERP_MS);
  assert.equal(s.x, 100, 'with nothing newer, the latest sample is used');
  const mid = sampleTrack(track, 50);
  assert.equal(mid.x, 50);
  assert.equal(mid.y, 20);
  assert.equal(mid.z, 1);
  const around = sampleTrack([
    { t: 0, x: 0, y: 0, z: 0, aim: 3, pitch: 0 },
    { t: 100, x: 0, y: 0, z: 0, aim: -3, pitch: 0 },
  ], 50);
  assert.ok(Math.abs(around.aim) > 2.5, `aim took the long way: ${around.aim}`);
  assert.ok(Math.abs(lerpAngle(0, Math.PI / 2, 0.5) - Math.PI / 4) < 1e-9);
});

test('a small server correction keeps the picture still, then eases over; a teleport snaps', () => {
  const pred = { x: 0, y: 0, z: 0 };
  const c = reconcile(pred, { x: 10, y: 0, z: 0.2 }, { x: 0, y: 0, z: 0 });
  assert.equal(c.snapped, false);
  assert.equal(c.pred.x + c.offset.x, pred.x);
  assert.equal(c.pred.z + c.offset.z, pred.z);
  let offset = c.offset;
  for (let i = 0; i < 40; i++) offset = decayOffset(offset, 1 / 30);
  assert.ok(Math.abs(offset.x) < 1, `offset left ${offset.x}`);
  const far = reconcile(pred, { x: 400, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  assert.equal(far.snapped, true);
  assert.equal(far.offset.x, 0);
  assert.equal(far.pred.x, 400);
});
