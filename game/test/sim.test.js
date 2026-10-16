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
  assert.equal(fmtLeft(2 * H - 15 * 1000), '2h 0m');
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

// ---- audit round 1, UI pass ----
import { cleanName } from '../src/sim.js';
test('H2 a wiped save stays wiped even if the page-hide handler saves afterwards', () => {
  const store = withStore();
  const { s } = fresh(); found(s); s.save();
  assert.ok(store.has('badlands.sandbox.v2'));
  s.reset(); s.save();
  assert.equal(store.has('badlands.sandbox.v2'), false);
  delete globalThis.localStorage;
});

test('H3 every name the founding screen accepts is a name the engine accepts', () => {
  const { s } = fresh();
  for (const raw of ['a !', 'AB', '  x y  ', 'Tester one', '!!ab!!', 'ab  cd', 'a'.repeat(30), 'é', '']) {
    const name = cleanName(raw);
    if (name.length < 2 || s.byName(name)) continue;           // the screen refuses these before the map step
    const { s: t } = fresh();
    assert.doesNotThrow(() => { for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (t.canFound(x, y)) { t.claim(raw, 'bruiser', 1, x, y); return; } }, `claim(${JSON.stringify(raw)})`);
  }
  assert.equal(cleanName('toasty !'), 'TOASTY');
  assert.equal(cleanName('a !'), 'A');
});

// ---- audit round 2, rules pass ----
test('R2-M1 after a rejected save the new game still saves and reloads', () => {
  const store = withStore();
  store.set('badlands.sandbox.v2', JSON.stringify({ v: 2, clock: 1000 * H, speed: 60, log: [], notes: [], nations: [{ name: 'X' }] }));
  const s = new Sim(previewWorld());
  assert.ok(!store.has('badlands.sandbox.v2'), 'the bad save is dropped');
  found(s); s.train(0, 3);
  assert.ok(store.has('badlands.sandbox.v2'), 'the new game is saved');
  assert.equal(new Sim(previewWorld()).player.name, 'TESTERS');
  delete globalThis.localStorage;
});

test('R2-M2 a huge war pool cannot hang the buyback; saved numbers are capped', () => {
  const { s } = fresh(); const p = found(s);
  p.pot = 1e300; const t0 = Date.now(); s.settlePot(p);
  assert.ok(Date.now() - t0 < 500 && Number.isFinite(p.pot));
  const store = withStore();
  const big = fresh().s; big.nations[0].pool = 1e300; big.save();
  assert.equal(new Sim(previewWorld()).player, null);                      // the tampered save is rejected, not loaded
  assert.ok(store.size === 0 || JSON.parse(store.get('badlands.sandbox.v2') || '{"nations":[{"pool":0}]}').nations.every((n) => n.pool < 1e13));
  delete globalThis.localStorage;
});

test('R2-M3 a raid order with holes or odd entries is refused before anything changes', () => {
  const { s } = fresh(); const p = found(s);
  const d = s.nations.find((n) => !n.isPlayer); d.protectedUntil = 0; p.protectedUntil = 0; p.units = [50, 50, 50, 0];
  p.plots = d.plots.map(([x, y]) => [x + 1, y]);
  const sparse = [10, , 0]; assert.throws(() => s.raid(p, d, sparse));
  assert.throws(() => s.raid(p, d, [10, undefined, 0])); assert.throws(() => s.raid(p, d, [10, '5', 0]));
  assert.deepEqual(p.units, [50, 50, 50, 0]); assert.equal(p.nextRaidAt, 0);
});

test('R2-L1 a tampered save that passes the basic shape is still refused', () => {
  const mk = () => { const { s } = fresh(); found(s); return JSON.parse(JSON.stringify({ v: 2, clock: s.clock, speed: s.speed, log: [], notes: [], faucetAt: {}, nations: s.nations, playerName: s.playerName, aiAt: s.aiAt, rules: s.rulesPrint, seed: s.seedPrint() })); };
  const cases = {
    aiAt: (x) => { x.aiAt = 'x'; }, faucetAt: (x) => { x.faucetAt = 'oops'; }, usdc: (x) => { delete x.nations.find((n) => n.isPlayer).usdc; },
    trained: (x) => { delete x.nations.find((n) => n.isPlayer).trained; }, emblem: (x) => { x.nations[0].emblem = 'dragon'; },
    colour: (x) => { x.nations[0].color = -5; }, offWorld: (x) => { x.nations[0].plots = [[9999, 9999]]; },
    duplicate: (x) => { x.nations[1].plots = [x.nations[0].plots[0].slice()]; }, sameName: (x) => { x.nations[1].name = x.nations[0].name; },
    hugeUnits: (x) => { x.nations[0].units = [1e15, 0, 0, 0]; }, rules: (x) => { x.rules = 'other'; },
  };
  { const store = withStore(); store.set('badlands.sandbox.v2', JSON.stringify(mk())); assert.equal(new Sim(previewWorld()).player?.name, 'TESTERS', 'the untouched save loads'); delete globalThis.localStorage; }
  for (const [name, f] of Object.entries(cases)) {
    const store = withStore(); const x = mk(); f(x); store.set('badlands.sandbox.v2', JSON.stringify(x));
    const s = new Sim(previewWorld());
    assert.equal(s.player, null, `${name}: refused`);
    delete globalThis.localStorage;
  }
  const store = withStore(); const x = mk(); store.set('badlands.sandbox.v2', JSON.stringify({ ...x, log: [null, 5, { kind: 'info', text: 'ok', t: 1 }] }));
  const s2 = new Sim(previewWorld()); assert.equal(s2.player.name, 'TESTERS'); assert.equal(s2.log.length, 1);  // junk log entries are filtered, the rest kept
  delete globalThis.localStorage;
});

test('R2-L2 a wall clock that steps back does not stall saving or the faucet', () => {
  const store = withStore();
  const { s } = fresh(); const p = found(s);
  s.lastSave = Date.now() + 3600 * 1000; s.lastReal = Date.now() - 100; s.tick();
  assert.ok(s.lastSave <= Date.now() + 10, 'future lastSave is reset');
  s.faucetAt.usdc = Date.now() + 3600 * 1000; assert.doesNotThrow(() => s.faucet('usdc'));
  delete globalThis.localStorage;
});

test('R2-L4 formatting rounds before choosing the unit', () => {
  assert.equal(fmtCoin(999_500_000), '1.00B'); assert.equal(fmtCoin(999_949_999), '1.00B'); assert.equal(fmtCoin(99_950_000), '100M');
  assert.equal(fmtLeft(H - 1), '1h 0m'); assert.equal(fmtLeft(H - 30000), '1h 0m'); assert.equal(fmtLeft(H), '1h 0m');
});

// ---- audit round 3, rules pass ----
test('R3-M1 training orders are capped in play, and a legit save at the cap reloads', () => {
  const store = withStore();
  const { s } = fresh(); const p = found(s); p.coin = 1e12; p.usdc = 0;
  let n = 0; for (; n < 700; n++) { try { s.train(0, 1); } catch (e) { assert.match(e.message, /collect|orders|too many/i); break; } }
  assert.ok(n < 500, `refused at ${n}`);
  s.save();
  assert.equal(new Sim(previewWorld()).player?.name, 'TESTERS', 'the save at the cap loads');
  delete globalThis.localStorage;
});

test('R3-L1/L2 a colour or burn the loader would refuse is never produced', () => {
  const { s } = fresh();
  for (const c of [1.5, -1, 0x1000000, NaN]) assert.throws(() => s.claim('BADCOL', 'bruiser', c, 0, 0), /colour|bad/);
  const { s: t } = fresh(); const p = found(t); p.burned = 1e12 - 5; p.coin = 1e12; t.train(0, 5);
  assert.ok(p.burned <= 1e12);
});

test('R3-L3 notes are limited and a failed save is reported, not hidden', () => {
  const { s } = fresh(); found(s);
  assert.equal(s.addNote('x'.repeat(5000), 'D1').text.length, 1000);
  for (let i = 0; i < 80; i++) s.addNote('n' + i, 'D1');
  assert.ok(s.notes.length <= 50);
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.equal(s.save(), false);
  delete globalThis.localStorage;
});

test('R3-L6 a minute is never printed as 60 seconds', () => { assert.equal(fmtLeft(59500), '1m'); assert.equal(fmtLeft(59000), '59s'); });

// ---- audit round 4 lows ----
test('R4-L1 the coin and USDC faucets never push a balance past what the loader accepts', () => {
  const store = withStore(); const { s } = fresh(); const p = found(s);
  p.coin = 1e12 - 5e7; s.faucet('coin'); s.faucetAt.coin = 0; s.faucet('coin');
  p.usdc = 1e12 - 5; s.faucetAt.usdc = 0; s.faucet('usdc');
  assert.ok(p.coin <= 1e12 && p.usdc <= 1e12);
  s.save(); assert.equal(new Sim(previewWorld()).player?.name, 'TESTERS');
  delete globalThis.localStorage;
});
test('R4-L2 a rejected save is kept aside, not destroyed', () => {
  const store = withStore();
  const junk = JSON.stringify({ v: 2, clock: 5, nations: [{ name: 'X' }] });
  store.set('badlands.sandbox.v2', junk);
  const s = new Sim(previewWorld());
  assert.ok(!store.has('badlands.sandbox.v2'));
  assert.equal(store.get('badlands.sandbox.v2.rejected'), junk);
  assert.equal(s.rejectedSave, true);
  delete globalThis.localStorage;
});
test('R4-L3 a failed save is flagged and clears again once saving works', () => {
  const { s } = fresh(); found(s);
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  s.save(); assert.equal(s.saveFailed, true);
  const store = withStore(); s.save(); assert.equal(s.saveFailed, false);
  delete globalThis.localStorage;
});

test('R5-M1 a second tab with an old copy cannot overwrite newer progress', () => {
  const store = withStore();
  const { s: a } = fresh(); found(a); a.save();
  const b = new Sim(previewWorld());                // the second tab loads the save
  a.train(0, 50);                                   // the first tab plays on
  assert.equal(b.save(), false); assert.equal(b.stale, true);
  b.save();
  assert.equal(new Sim(previewWorld()).player.jobs.length, 1);
  delete globalThis.localStorage;
});
test('R5-M1 a wipe in one tab is not undone by a stale tab', () => {
  const store = withStore();
  const { s: a } = fresh(); found(a); a.save();
  const b = new Sim(previewWorld());
  a.reset(); b.save();
  assert.equal(new Sim(previewWorld()).player, null);
  delete globalThis.localStorage;
});
test('R5-L3 an old turn clock cannot make every tick run catch-up turns', () => {
  const store = withStore();
  const { s: a } = fresh(); found(a); a.aiAt = a.clock - 1e12; a.save();
  const b = new Sim(previewWorld());
  assert.ok(b.clock - b.aiAt <= 8 * 3 * 3600_000);
  delete globalThis.localStorage;
});
test('R5-L4 a save that is not valid JSON is kept aside too', () => {
  const store = withStore(); store.set('badlands.sandbox.v2', 'not json');
  const s = new Sim(previewWorld());
  assert.equal(store.get('badlands.sandbox.v2.rejected'), 'not json'); assert.equal(s.rejectedSave, true);
  delete globalThis.localStorage;
});
test('R5-L1 a save with markup in a nation name is refused', () => {
  const store = withStore();
  const { s: a } = fresh(); found(a); a.save();
  const raw = JSON.parse(store.get('badlands.sandbox.v2')); raw.nations[0].name = '<svg onload=x()>'.slice(0, 16);
  store.set('badlands.sandbox.v2', JSON.stringify(raw));
  const b = new Sim(previewWorld()); assert.ok(b.nations.every((n) => /^[A-Za-z0-9 ]+$/.test(n.name))); assert.equal(b.rejectedSave, true);
  delete globalThis.localStorage;
});

import { losses } from '../src/combat.js';
test('R6-M1 the battle scene\'s loss numbers are exactly what the engine deducts', () => {
  let ran = 0;
  for (let trial = 0; trial < 60; trial++) {
    const { s } = fresh(); const p = found(s);
    p.protectedUntil = 0; p.nextRaidAt = 0;
    const foe = s.nations.find((n) => !n.isPlayer && s.approach(p, n) && s.approach(p, n).k <= 6) || s.nations.find((n) => !n.isPlayer);
    if (!s.approach(p, foe) || s.approach(p, foe).k > 6) continue;
    foe.protectedUntil = 0; foe.nextRaidAt = 0;
    p.units = [1 + trial * 7 % 40, 1 + trial * 3 % 25, 1 + trial * 11 % 30, 0];
    foe.units = [trial * 5 % 90, trial * 13 % 60, trial * 7 % 40, trial * 3 % 70];
    const send = [p.units[0], p.units[1], p.units[2]]; if (send.reduce((t, v) => t + v, 0) < 10) continue;
    const a0 = p.units.slice(), d0 = foe.units.slice();
    let rep; try { rep = s.raid(p, foe, send); } catch (_) { continue; }
    const mine = a0.slice(0, 3).reduce((t, v, i) => t + v - p.units[i], 0), theirs = d0.reduce((t, v, i) => t + v - foe.units[i], 0);
    const l = losses(send, d0, rep.result.success);
    assert.equal(l.L, mine); assert.equal(l.R, theirs); ran++;
  }
  assert.ok(ran >= 10, `ran ${ran} raids`);
});

test('R7-M1 a tampered raid report is dropped on load: only its replay is lost', () => {
  const store = withStore();
  const { s: a } = fresh(); found(a); a.logEvent({ kind: 'raid', a: 'X', b: 'Y', success: true, report: { result: { attack: 1, defense: 1, success: true }, send: [1, 1, 1], loot: 0, a: { name: 'A', color: 1, emblem: 'bruiser', units: [1, 1, 1, 0], wall: 0, tower: 0 }, b: { name: 'B', color: 2, emblem: 'sniper', units: [1, 1, 1, 1], wall: 0, tower: 0 } } });
  a.logEvent({ kind: 'raid', a: 'X', b: 'Y', report: { result: { attack: 1, defense: 1, success: true }, send: [1, 1, 1], a: { name: '<b>x</b>', color: 'red', emblem: 'bruiser', units: [10, -5, 0, 0], wall: 0, tower: 0 }, b: {} } });
  a.logEvent({ kind: 'raid', a: 'X', b: 'Y', report: {} });
  a.save();
  const b = new Sim(previewWorld());
  const raids = b.log.filter((e) => e.kind === 'raid');
  assert.equal(raids.length, 3); assert.ok(raids[0].report); assert.equal(raids[1].report, undefined); assert.equal(raids[2].report, undefined);
  delete globalThis.localStorage;
});
test('R7 a future turn clock and finished orders cannot freeze the AI or training', () => {
  const store = withStore();
  const { s: a } = fresh(); const p = found(a); a.aiAt = a.clock + 1e9; a.save();
  const b = new Sim(previewWorld()); assert.ok(b.aiAt <= b.clock);
  const q = b.player; q.jobs = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, unit: 0, count: 1, readyAt: 0, collected: true }));
  b.train(0, 3); b.clock += 3 * 3600_000; assert.equal(b.collect(), 3);
  delete globalThis.localStorage;
});
test('R7 computer nations keep raiding each other over a month', () => {
  let raids = 0;
  for (let seed = 0; seed < 12; seed++) {
    const { s } = fresh();
    for (let day = 0; day < 30; day++) { s.clock += 24 * 3600_000; for (let i = 0; i < 8; i++) s.aiTurn(); }
    raids += s.log.filter((e) => e.kind === 'raid').length;
  }
  assert.ok(raids >= 40, `only ${raids} raids in 12 months`);
});
