import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleHist, lerpAng } from '../src/replay.js';

const s = (t, x, aim = 0) => ({ t, x, y: 0, z: 0, aim, pitch: 0, alive: true, weapon: 'rifle', team: 0, name: 'A' });

test('a moment between two samples blends them, and a moment outside the record gives the nearest end', () => {
  const a = [s(10, 0), s(10.1, 100), s(10.2, 300)];
  assert.ok(Math.abs(sampleHist(a, 10.05).x - 50) < 1e-6);
  assert.ok(Math.abs(sampleHist(a, 10.15).x - 200) < 1e-6);
  assert.equal(sampleHist(a, 5).x, 0, 'before the record');
  assert.equal(sampleHist(a, 99).x, 300, 'after the record');
  assert.equal(sampleHist(a, 10.1).x, 100, 'exactly on a sample');
});

test('angles blend the short way round', () => {
  const a = [s(0, 0, 3.0), s(1, 0, -3.0)];
  const mid = sampleHist(a, 0.5).aim;
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.2, `went through ${mid}, not through zero`);
  assert.ok(Math.abs(lerpAng(0.1, 6.2832 + 0.3, 0.5) - 0.2) < 1e-3);
});

test('what a sample says (alive, gun, name) comes from the earlier one', () => {
  const a = [{ ...s(0, 0), alive: true, weapon: 'smg' }, { ...s(1, 10), alive: false, weapon: 'rifle' }];
  const m = sampleHist(a, 0.5);
  assert.equal(m.alive, true); assert.equal(m.weapon, 'smg');
  const low = [{ ...s(0, 0), crouch: 0 }, { ...s(1, 10), crouch: 1 }];
  assert.ok(Math.abs(sampleHist(low, 0.5).crouch - 0.5) < 1e-6);
});
