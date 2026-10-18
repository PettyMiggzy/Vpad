// King of the Bad Lands (src/lib/king.ts): the most USDC traded in the last six hours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KING_WINDOW, rankByVolume } from '../src/lib/king.ts';

const L = (n) => ({ pool: `pool${n}`, token: `token${n}` });
const S = (rows) => new Map(Object.entries(rows).map(([k, v]) => [`pool${k}`, v]));

test('the window is six hours', () => assert.equal(KING_WINDOW, 21_600));

test('the most volume in the window is king, the next ones follow', () => {
  const r = rankByVolume([L(1), L(2), L(3), L(4)], S({ 1: { volume6h: 50n }, 2: { volume6h: 900n }, 3: { volume6h: 10n }, 4: { volume6h: 400n } }));
  assert.deepEqual(r.map((x) => x.pool), ['pool2', 'pool4', 'pool1', 'pool3']);
});

test('a launch with no trade in the window, no figures, or an undatable window is not ranked, so nobody is king when nobody trades', () => {
  const r = rankByVolume([L(1), L(2), L(3)], S({ 1: { volume6h: 0n }, 2: { volume6h: null }, 3: undefined }));
  assert.deepEqual(r, []);
});

test('a tie goes to the launch that traded last', () => {
  const r = rankByVolume([L(1), L(2)], S({ 1: { volume6h: 100n, lastTradeBlock: 500n }, 2: { volume6h: 100n, lastTradeBlock: 900n } }));
  assert.equal(r[0].pool, 'pool2');
});

test('the old measures do not decide it: a graduated launch with no recent volume loses to a small one that trades', () => {
  const r = rankByVolume([L(1), L(2)], S({ 1: { volume6h: 0n, lastTradeBlock: 10_000n, graduated: true, volume24: 10n ** 24n }, 2: { volume6h: 5n } }));
  assert.deepEqual(r.map((x) => x.pool), ['pool2']);
});

test('the list given is not reordered', () => {
  const list = [L(1), L(2)];
  rankByVolume(list, S({ 1: { volume6h: 1n }, 2: { volume6h: 2n } }));
  assert.deepEqual(list.map((x) => x.pool), ['pool1', 'pool2']);
});
