import test from 'node:test';
import assert from 'node:assert/strict';
import { settleMatch, SETTLE } from './settle.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const CHEST = '0x3333333333333333333333333333333333333333';
const PAD = '0x4444444444444444444444444444444444444444';
const E18 = 10n ** 18n;
const quiet = () => {};

// a stand-in chain: who holds what, which tokens the pad knows, and what the contract was sent
function chain({ held = {}, pads = [A, B], reported = false, failTimes = 0, status = 'success', readFails = false } = {}) {
  const sent = [];
  let fails = failTimes;
  return {
    sent,
    chest: CHEST,
    async read({ functionName, args, address }) {
      if (readFails) throw new Error('rpc down');
      if (functionName === 'launchpad') return PAD;
      if (functionName === 'launches') return [pads.includes(args[0]) ? '0x5555555555555555555555555555555555555555' : '0x0000000000000000000000000000000000000000'];
      if (functionName === 'balanceOf') return held[`${address}:${args[0].toLowerCase()}`] ?? 0n;
      if (functionName === 'decimals') return 18;
      if (functionName === 'reported') return reported;
      throw new Error('unexpected read ' + functionName);
    },
    async send(call) { if (fails-- > 0) throw new Error('node refused'); sent.push(call); return '0xabc'; },
    async wait() { return { status }; },
  };
}

const pidsOf = (n, side) => Array.from({ length: n }, (_, i) => `p${side}${i}`);
const addrOf = (pid) => `0x${pid.slice(1, 2)}${pid.slice(2).padStart(39, '0')}`.toLowerCase();
const lookup = (pid) => addrOf(pid);
// every player on each side holds enough of their own team's token
function holders(a, b) {
  const held = {};
  for (const pid of pidsOf(a, 1)) held[`${A}:${addrOf(pid)}`] = SETTLE.MIN_HOLD * E18;
  for (const pid of pidsOf(b, 2)) held[`${B}:${addrOf(pid)}`] = SETTLE.MIN_HOLD * E18;
  return held;
}
const match = (over = {}) => ({ id: 'room1', tokens: [A, B], winner: 0, score: [2, 1], humans: [pidsOf(3, 1), pidsOf(3, 2)], ...over });
const run = (m, c, look = lookup) => settleMatch(m, c, quiet, look);

test('settles by itself: two pad tokens, enough different holders on each side, one report with the winner and the loser', async () => {
  const c = chain({ held: holders(3, 3) });
  const r = await run(match(), c);
  assert.equal(r.ok, true);
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].functionName, 'settleMatch');
  assert.equal(c.sent[0].args[1], A);
  assert.equal(c.sent[0].args[2], B);
  const again = await run(match({ winner: 1 }), chain({ held: holders(3, 3) }));
  assert.equal(again.ok, true);
});

test('the second team winning sends the report the other way round', async () => {
  const c = chain({ held: holders(3, 3) });
  await run(match({ winner: 1 }), c);
  assert.equal(c.sent[0].args[1], B);
  assert.equal(c.sent[0].args[2], A);
});

test('nothing is sent when settling is not set up', async () => {
  const r = await run(match(), null);
  assert.equal(r.ok, false);
});

test('nothing is sent when the teams are not two different tokens', async () => {
  for (const tokens of [[A, A], [A, 'RED'], ['BLUE', 'RED'], [A], null]) {
    const c = chain({ held: holders(3, 3) });
    assert.equal((await run(match({ tokens }), c)).ok, false);
    assert.equal(c.sent.length, 0);
  }
});

test('nothing is sent for a token the pad did not launch', async () => {
  const c = chain({ held: holders(3, 3), pads: [A] });
  assert.equal((await run(match(), c)).ok, false);
  assert.equal(c.sent.length, 0);
});

test('a side with too few different players cannot make a result', async () => {
  const c = chain({ held: holders(3, 2) });
  assert.equal((await run(match({ humans: [pidsOf(3, 1), pidsOf(2, 2)] }), c)).ok, false);
  assert.equal(c.sent.length, 0);
});

test('one wallet on two seats is one player, not two', async () => {
  const c = chain({ held: holders(3, 3) });
  const same = (pid) => (pid === 'p11' ? addrOf('p10') : addrOf(pid));
  assert.equal((await run(match(), c, same)).ok, false);
  assert.equal(c.sent.length, 0);
});

test('a player with no linked wallet blocks the result', async () => {
  const c = chain({ held: holders(3, 3) });
  assert.equal((await run(match(), c, (pid) => (pid === 'p21' ? null : addrOf(pid)))).ok, false);
  assert.equal(c.sent.length, 0);
});

test('a player who holds too little of the team\'s token blocks the result', async () => {
  const held = holders(3, 3);
  held[`${B}:${addrOf('p22')}`] = SETTLE.MIN_HOLD * E18 - 1n;
  const c = chain({ held });
  assert.equal((await run(match(), c)).ok, false);
  assert.equal(c.sent.length, 0);
});

test('holding the other team\'s token does not count', async () => {
  const held = {};
  for (const pid of pidsOf(3, 1)) held[`${B}:${addrOf(pid)}`] = SETTLE.MIN_HOLD * E18; // side one holds only the wrong token
  for (const pid of pidsOf(3, 2)) held[`${B}:${addrOf(pid)}`] = SETTLE.MIN_HOLD * E18;
  const c = chain({ held });
  assert.equal((await run(match(), c)).ok, false);
  assert.equal(c.sent.length, 0);
});

test('a match the contract already has is not sent again', async () => {
  const c = chain({ held: holders(3, 3), reported: true });
  assert.equal((await run(match(), c)).ok, false);
  assert.equal(c.sent.length, 0);
});

test('a refused transaction is tried again, and gives up after the last try', async () => {
  const slow = chain({ held: holders(3, 3), failTimes: SETTLE.TRIES - 1 });
  assert.equal((await run(match(), slow)).ok, true);
  const dead = chain({ held: holders(3, 3), failTimes: SETTLE.TRIES });
  assert.equal((await run(match(), dead)).ok, false);
  assert.equal(dead.sent.length, 0);
});

test('a transaction that mined and failed is not counted as settled', async () => {
  const c = chain({ held: holders(3, 3), status: 'reverted' });
  assert.equal((await run(match(), c)).ok, false);
});

test('a chain that cannot be read never throws into the game', async () => {
  const r = await run(match(), chain({ readFails: true }));
  assert.equal(r.ok, false);
});

import { roomOptions } from './room.js';

test('a challenge names its two tokens apart from the short team names; nothing else can carry them', () => {
  const ok = roomOptions({ mode: 'challenge', tokens: [A, B], names: ['AAA', 'BBB'] });
  assert.deepEqual(ok.tokens, [A, B]);
  assert.equal(ok.teams[0].name, 'AAA');
  assert.equal(roomOptions({ mode: 'practice', tokens: [A, B] }).tokens, null);
  assert.equal(roomOptions({ mode: 'challenge', tokens: [A, A] }).tokens, null);
  assert.equal(roomOptions({ mode: 'challenge', tokens: [A, '0x1234'] }).tokens, null);
  assert.equal(roomOptions({ mode: 'challenge', tokens: [A] }).tokens, null);
  assert.equal(roomOptions({ mode: 'challenge', names: [A, B] }).tokens, null);
  assert.equal(roomOptions({ mode: 'train', tokens: [A, B] }).tokens, null);
});
