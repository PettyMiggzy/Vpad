import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, R, H, fmtLeft, fmtCoin } from '../src/sim.js';
import { previewWorld } from '../src/data.js';

const fresh = () => { const w = previewWorld(); const s = new Sim(w); return { w, s }; };
const found = (s) => {
  for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (s.canFound(x, y) && s.kind(x, y) === 0) return s.claim('TESTERS', 'bruiser', 0xffffff, x, y);
  throw new Error('no free plot');
};

test('founding gives play money, protection and a plot', () => {
  const { s } = fresh(); const p = found(s);
  assert.equal(p.coin, R.START_COIN); assert.equal(p.usdc, R.START_USDC);
  assert.ok(s.protectedLeft(p) >= R.COOLDOWN - 1);
  assert.throws(() => s.claim('OTHER', 'sniper', 1, 0, 0), /already/);
});

test('training takes an hour, burns coin, and is limited by the coin holding', () => {
  const { s } = fresh(); const p = found(s);
  const slots = Math.floor(p.coin / s.slot());
  assert.throws(() => s.train(0, slots + 1), /holding too small/);
  s.train(0, 10);
  assert.equal(p.coin, R.START_COIN - 10 * s.unitCost());
  assert.throws(() => s.collect(), /nothing is ready/);
  s.clock += R.TRAIN_TIME + 1;
  assert.equal(s.collect(), 10); assert.equal(p.units[0], 10);
});

test('speed-up costs play USDC and saves whole hours; a shield is capped at 72 hours', () => {
  const { s } = fresh(); const p = found(s);
  s.train(1, 5);
  const usdc = p.usdc; s.speedUp(1);
  assert.equal(p.usdc, usdc - R.SPEEDUP_PER_HOUR);
  assert.equal(s.readyJobs().length, 1);
  s.buyShield(24); s.buyShield(24);
  assert.throws(() => s.buyShield(24), /72/);
});

test('building burns coin and tops out at level 5', () => {
  const { s } = fresh(); const p = found(s);
  p.coin = R.SUPPLY * 10;
  for (let i = 0; i < 5; i++) s.build(true);
  assert.equal(p.wall, 5);
  assert.throws(() => s.build(true), /top level/);
});

test('a raid follows the contract: protection, cooldown, losses and loot', () => {
  const { s } = fresh(); const p = found(s);
  const d = s.nations.find((n) => !n.isPlayer);
  p.units = [100, 100, 100, 0]; d.units = [1, 1, 1, 0]; d.wall = 0; d.tower = 0; d.pool = 100;
  p.plots = d.plots.map(([x, y]) => [x + 1, y]); // next to the target for the test
  d.protectedUntil = s.now + H;
  assert.throws(() => s.raid(p, d, [100, 0, 0]), /protected/);          // a protected target cannot be raided
  p.protectedUntil = 0; d.protectedUntil = 0;
  const r = s.raid(p, d, [100, 100, 100]);
  assert.equal(r.result.success, true);
  assert.deepEqual(p.units.slice(0, 3), [90, 90, 90]);                  // the winner loses 10% of what it sent
  assert.equal(d.pool, 80); assert.equal(r.loot, 20);                   // 20% of the loser's war pool
  assert.ok(s.protectedLeft(d) > 0);
  assert.throws(() => s.raid(p, d, [10, 0, 0]), /cooling down/);        // 24 h cooldown for the attacker
});

test('a failed raid costs half of what was sent and gains nothing', () => {
  const { s } = fresh(); const p = found(s);
  const d = s.nations.find((n) => !n.isPlayer);
  p.units = [10, 0, 0, 0]; d.units = [50, 50, 50, 50]; d.pool = 100; p.protectedUntil = 0; d.protectedUntil = 0;
  p.plots = d.plots.map(([x, y]) => [x + 1, y]);
  const r = s.raid(p, d, [10, 0, 0]);
  assert.equal(r.result.success, false); assert.equal(p.units[0], 5); assert.equal(d.pool, 100); assert.equal(r.loot, 0);
});

test('save and load keep the game', () => {
  const store = new Map(); globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const { s } = fresh(); found(s); s.train(2, 3); s.save();
  const again = new Sim(previewWorld());
  assert.equal(again.player.name, 'TESTERS'); assert.equal(again.player.jobs.length, 1);
  delete globalThis.localStorage;
});

test('30 days of game time with computer nations: no errors, raids happen, armies stay bounded', () => {
  const { s } = fresh(); const p = found(s);
  p.units = [40, 40, 40, 10]; p.protectedUntil = 0;
  let raids = 0;
  for (let i = 0; i < 30 * 24 / 3; i++) { s.clock += 3 * H; s.aiAt = s.clock - 3 * H; s.tick(); }
  raids = s.log.filter((e) => e.kind === 'raid').length;
  assert.ok(raids > 0, 'expected some raids');
  for (const n of s.nations) assert.ok(n.units.every((u) => u >= 0 && Number.isFinite(u)), `${n.name} units sane`);
  assert.ok(s.nations.every((n) => n.pool >= 0));
});

// ---- audit round 1 findings: each of these failed on the old engine ----
const withStore = () => { const store = new Map(); globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }; return store; };

test('a malformed or foreign save never stops the game booting: it is discarded', () => {
  const store = withStore();
  for (const bad of ['{"v":2}', '{"v":2,"clock":5,"log":[]}', 'not json', '{"v":2,"clock":1000,"speed":60,"log":[],"notes":[],"nations":[{"name":"A"}]}',
    JSON.stringify({ v: 2, clock: NaN, speed: 60, log: [], notes: [], nations: [] })]) {
    store.set('badlands.sandbox.v2', bad);
    const s = new Sim(previewWorld());
    assert.ok(s.nations.length >= 5 && s.nations.every((n) => Array.isArray(n.plots) && n.units.length === 4), `booted from ${bad.slice(0, 30)}`);
    assert.equal(s.player, null);
  }
  delete globalThis.localStorage;
});

test('hours must be whole positive numbers: no free USDC from negative shields or speed-ups', () => {
  const { s } = fresh(); const p = found(s); s.train(1, 5);
  for (const h of [-10, 0, 1.5, NaN, Infinity]) { assert.throws(() => s.buyShield(h)); assert.throws(() => s.speedUp(h)); }
  assert.equal(p.usdc, R.START_USDC); assert.equal(p.pool, 0);
});

test('a raid order must be three whole numbers within the army', () => {
  const { s } = fresh(); const p = found(s);
  const d = s.nations.find((n) => !n.isPlayer); d.protectedUntil = 0; p.protectedUntil = 0;
  p.plots = d.plots.map(([x, y]) => [x + 1, y]); p.units = [0, 100, 0, 0];
  for (const bad of [[-90, 100, 0], [5, 5, NaN], [5], [1.5, 0, 0], [0, 0, 0], [0, 101, 0], null, 'abc']) assert.throws(() => s.raid(p, d, bad), undefined, JSON.stringify(bad));
  assert.deepEqual(p.units, [0, 100, 0, 0]);
});

test('train, claim and expand reject bad inputs before changing anything', () => {
  const { s } = fresh(); const p = found(s);
  const coin = p.coin;
  for (const u of [1.5, null, '1', NaN, 4, -1]) assert.throws(() => s.train(u, 2));
  for (const c of [1.5, NaN, 0, -3]) assert.throws(() => s.train(0, c));
  assert.equal(p.coin, coin); assert.equal(p.jobs.length, 0); assert.equal(p.trained, 0);
  const [x, y] = p.plots[0];
  for (const [a, b] of [[x + 0.5, y + 0.5], [String(x + 1), String(y)], [NaN, 0], [x + 1.5, y]]) assert.throws(() => s.expand(a, b));
  const { s: s2 } = fresh();
  assert.throws(() => s2.claim('X1', 'bruiser', 1, NaN, NaN)); assert.throws(() => s2.claim('X1', 'bruiser', 1, 0.5, 0));
});

test('land follows the contract: a commander only, price doubles per plot, coin is burned', () => {
  const { s } = fresh(); const p = found(s);
  p.usdc = 1e6; p.coin = 1e9;
  const open = (from) => { for (const [px, py] of p.plots) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.canExpand(px + dx, py + dy) && (from === undefined || s.kind(px + dx, py + dy) === from)) return [px + dx, py + dy]; return null; };
  p.coin = 1; assert.throws(() => s.expand(...open(0)), /commander/); p.coin = 1e9;
  const u0 = p.usdc, c0 = p.coin; const a = open(0); s.expand(...a);
  assert.equal(u0 - p.usdc, R.PLAIN_PLOT);                                    // second plot: the base price
  assert.equal(c0 - p.coin, (R.SUPPLY * R.BUILD_COST_BPS * 1) / 10000);       // 0.1% of supply times the plots owned (1)
  const u1 = p.usdc, c1 = p.coin; s.expand(...open(0));
  assert.equal(u1 - p.usdc, R.PLAIN_PLOT * 2);                                // third plot: doubled
  assert.equal(c1 - p.coin, (R.SUPPLY * R.BUILD_COST_BPS * 2) / 10000);
});

test('the clock only moves forward and speed only takes the listed values; faucet is whitelisted', () => {
  const { s } = fresh(); const p = found(s);
  const c = s.clock; s.lastReal = Date.now() + 3600 * 1000; s.tick(); assert.ok(s.clock >= c, 'no rewind');
  for (const v of [NaN, -5, 7, Infinity, '60']) s.setSpeed(v);
  assert.ok([1, 60, 600].includes(s.speed));
  const u = p.usdc; s.faucet('usdc'); assert.throws(() => s.faucet('a')); assert.throws(() => s.faucet('b')); assert.equal(p.usdc, u + R.USDC_FAUCET);
});

test('names are cleaned before they are checked; times and coin format sanely; rankings use the contract strength', () => {
  const { s } = fresh();
  assert.throws(() => s.claim('!!  !!', 'bruiser', 1, 0, 0), /name/);
  assert.equal(fmtLeft(2 * H - 15 * 1000), '1h 59m');
  assert.equal(fmtCoin(999_500), '1.0M'); assert.equal(fmtCoin(999_999_999), '1.00B');
  const n = { units: [0, 0, 0, 10] }; assert.equal(s.strength(n), 1500);
});

test('the clock is saved while time passes, not only on actions', () => {
  const store = withStore();
  const { s } = fresh(); found(s);
  const before = JSON.parse(store.get('badlands.sandbox.v2')).clock;
  s.lastReal = Date.now() - 4000; s.clock += 50 * 60 * 1000; s.lastSave = 0; s.tick();
  assert.ok(JSON.parse(store.get('badlands.sandbox.v2')).clock > before);
  delete globalThis.localStorage;
});

test('a buyback burns the pot in steps of the threshold, as the contract does', () => {
  const { s } = fresh(); const p = found(s);
  p.pot = 180; s.settlePot(p);
  assert.equal(p.pot, 30);
});
