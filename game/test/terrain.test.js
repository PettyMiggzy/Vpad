import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeTerrain } from '../src/terrain.js';

const fx = JSON.parse(readFileSync(new URL('./terrain-fixture.json', import.meta.url)));

test('the front end computes every plot of the map exactly as the contract does', () => {
  const terrain = makeTerrain(fx.seed);
  let n = 0;
  for (let yi = 0; yi < fx.rows.length; yi++) {
    for (let xi = 0; xi < fx.rows[yi].length; xi++) {
      const x = xi - fx.radius, y = yi - fx.radius;
      assert.equal(terrain(x, y), fx.rows[yi][xi], `plot ${x},${y}`);
      n++;
    }
  }
  assert.equal(n, 625);
});

test('the map has every kind of plot', () => {
  const kinds = new Set(fx.rows.flat());
  for (const k of Object.values(fx.kinds)) assert.ok(kinds.has(k), `kind ${k}`);
});
