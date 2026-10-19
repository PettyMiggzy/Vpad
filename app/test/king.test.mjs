// King of the Bad Lands (src/lib/king.ts): the most different wallets buying in the last six hours, one wallet carrying a fifth at most.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KING_WINDOW, KING_MIN_BUYERS, breadthScore, rankByScore } from '../src/lib/king.ts';

const L = (n) => ({ pool: `pool${n}`, token: `token${n}` });
const S = (rows) => new Map(Object.entries(rows).map(([k, v]) => [`pool${k}`, v]));
const B = (...v) => new Map(v.map((x, i) => [`0xw${i}`, BigInt(x)]));

test('the window is six hours and three buyers are the least', () => { assert.equal(KING_WINDOW, 21_600); assert.equal(KING_MIN_BUYERS, 3); });

test('one wallet buying a lot (trading with itself) scores far less than the same money from five wallets', () => {
  assert.equal(breadthScore(B(1000)), 0n, 'one buyer is not ranked');
  assert.equal(breadthScore(B(990, 5, 5)), 25n, 'a whale and two dust wallets: the whale counts three times the median buyer, not what it bought');
  assert.equal(breadthScore(B(200, 200, 200, 200, 200)), 1000n, 'five equal wallets count in full');
});

test('fewer than three different buyers is never ranked, whatever they bought', () => {
  assert.equal(breadthScore(B(10 ** 9, 10 ** 9)), 0n);
  assert.equal(breadthScore(new Map()), 0n);
  assert.equal(breadthScore(B(1, 1, 1)) > 0n, true);
});

test('wallets that bought nothing (or less than nothing) are not buyers', () => {
  assert.equal(breadthScore(B(500, 500, 0, 0)), 0n);
  assert.equal(breadthScore(new Map([['a', -5n], ['b', 100n], ['c', 100n]])), 0n);
});

test('real-sized wallets count in full, and a big wallet with dust beside it scores almost nothing', () => {
  const whales = breadthScore(B(4000, 3000, 3000)); // 10,000 bought by three wallets: each counts up to a fifth of the total, 2,000
  const crowd = breadthScore(B(300, 300, 300, 300, 300, 300, 300, 300)); // 2,400 bought by eight
  assert.equal(whales, 6000n); assert.equal(crowd, 2400n);
  // (real money from three real-sized wallets still wins: breadth limits what one wallet can do alone, it does not ignore money)
  assert.equal(breadthScore(B(10_000, 10, 10)), 50n, 'but a big wallet with two dust wallets beside it scores almost nothing');
  assert.equal(breadthScore(B(10_000, 10, 10)) < breadthScore(B(100, 100, 100, 100, 100, 100)), true);
  assert.equal(breadthScore(B(200, 200, 200, 200, 200)), 1000n);
  assert.equal(breadthScore(B(100, 100, 100, 100, 100, 100)), 600n);
});

test('the highest score is king and the next ones follow; a tie goes to the launch that traded last', () => {
  const r = rankByScore([L(1), L(2), L(3), L(4)], S({ 1: { kingScore: 50n }, 2: { kingScore: 900n, lastTradeBlock: 5n }, 3: { kingScore: 900n, lastTradeBlock: 9n }, 4: { kingScore: 400n } }));
  assert.deepEqual(r.map((x) => x.pool), ['pool3', 'pool2', 'pool4', 'pool1']);
});

test('a launch with no score, no figures, or an undatable window is not ranked, so nobody is king when nobody is buying', () => {
  assert.deepEqual(rankByScore([L(1), L(2), L(3)], S({ 1: { kingScore: 0n }, 2: { kingScore: null }, 3: undefined })), []);
});

test('the old measures do not decide it, and the list given is not reordered', () => {
  const list = [L(1), L(2)];
  const r = rankByScore(list, S({ 1: { kingScore: 0n, lastTradeBlock: 10_000n, graduated: true, volume24: 10n ** 24n }, 2: { kingScore: 5n } }));
  assert.deepEqual(r.map((x) => x.pool), ['pool2']);
  assert.deepEqual(list.map((x) => x.pool), ['pool1', 'pool2']);
});
