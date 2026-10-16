import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, R, H } from '../src/sim.js';
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
