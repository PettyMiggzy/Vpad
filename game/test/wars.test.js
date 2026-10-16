import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyWars } from '../src/wars.js';
test('R4-M2 a chain with many raids gives one war per pair and a bounded set', () => {
  const wars = []; for (let i = 0; i < 30; i++) for (const [a, b] of [['A', 'B'], ['B', 'A'], ['C', 'D'], ['E', 'F']]) wars.push({ a, b, success: i % 2 === 0, n: i });
  const t = tidyWars(wars);
  assert.equal(t.length, 3);
  assert.ok(t.every((w) => w.n === 29), 'the latest raid per pair is kept');
  const many = []; for (let i = 0; i < 40; i++) many.push({ a: 'N' + i, b: 'M' + i });
  assert.equal(tidyWars(many).length, 6);
  assert.deepEqual(tidyWars(undefined), []);
});
