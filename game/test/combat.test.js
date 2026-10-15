import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powers } from '../src/combat.js';

// the numbers WarheadzLands's own tests pin (engine/test/game.lands.test.js)
test('snipers beat bruisers: 15000 against 10000', () => {
  const r = powers([0, 100, 0], [100, 0, 0, 0]);
  assert.deepEqual([r.attack, r.defense, r.success], [15000, 10000, true]);
});

test('tricksters do not beat bruisers: 5000 against 10000', () => {
  const r = powers([0, 0, 100], [100, 0, 0, 0]);
  assert.deepEqual([r.attack, r.defense, r.success], [5000, 10000, false]);
});

test('a mountain pass defends 20% stronger: 15000 against 12000', () => {
  const r = powers([0, 100, 0], [100, 0, 0, 0], 0, 0, true);
  assert.deepEqual([r.attack, r.defense], [15000, 12000]);
});

test('after the first raid the home army is 90: 15000 against 9000', () => {
  const r = powers([0, 100, 0], [90, 0, 0, 0]);
  assert.deepEqual([r.attack, r.defense], [15000, 9000]);
});

test('walls and towers add 10% each, defenders count 150', () => {
  const r = powers([10, 0, 0], [0, 0, 0, 10], 2, 1);
  assert.equal(r.defense, Math.trunc((10 * 150 * (10000 + 3000)) / 10000));
});

test('trading activity adds up to 20% to each side: 5500 against 12000 (the contract test)', () => {
  const r = powers([0, 0, 100], [100, 0, 0, 0], 0, 0, false, 1000, 2000);
  assert.deepEqual([r.attack, r.defense, r.success], [5500, 12000, false]);
});
