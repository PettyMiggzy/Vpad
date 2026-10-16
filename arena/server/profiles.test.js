import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.ARENA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-'));
const { getProfile, buy, equip, loadoutFor, award, validPid } = await import('./profiles.js');
const { statsOf, Match } = await import('./game.js');
const { START_COINS, WEAPONS, ARMOR } = await import('./items.js');
const pid = (n) => `abcdef0123456789abcdef01234567${String(n).padStart(2, '0')}`;

test('a new profile has the free items and the starting coins; bad ids get nothing', () => {
  const p = getProfile(pid(1));
  assert.equal(p.coins, START_COINS); assert.deepEqual(p.loadout, { weapon: 'pistol', armor: 'none', boots: 'standard', camo: 'woodland' });
  assert.equal(getProfile('../etc/passwd'), null); assert.equal(validPid('x'), false);
});
test('buying costs coins once, cannot overspend, and equips what you buy', () => {
  assert.equal(buy(pid(2), 'smg').coins, START_COINS - WEAPONS.smg.cost);
  assert.equal(getProfile(pid(2)).loadout.weapon, 'smg');
  assert.ok(buy(pid(2), 'smg').error, 'no second purchase');
  const p = getProfile(pid(3)); p.coins = 100;
  assert.ok(buy(pid(3), 'sniper').error, 'not enough coins'); assert.equal(p.coins, 100); assert.ok(!p.owned.includes('sniper'));
  assert.ok(buy(pid(3), 'nonsense').error);
});
test('equip only what is owned; a match only gets owned gear', () => {
  assert.ok(equip(pid(4), 'sniper').error);
  getProfile(pid(5)).loadout.weapon = 'sniper';      // a tampered profile naming gear it does not own
  assert.equal(loadoutFor(pid(5)).weapon, 'pistol');
  assert.equal(loadoutFor('bad id').weapon, 'pistol');
});
test('coins can be awarded and never negative or fractional', () => {
  const before = getProfile(pid(6)).coins; award(pid(6), 25.9); award(pid(6), -500); award('bad', 10);
  assert.equal(getProfile(pid(6)).coins, before + 25);
});
test('armour and boots change health and speed; unknown gear falls back to the free items', () => {
  const s = statsOf({ weapon: 'rifle', armor: 'heavy', boots: 'runner' });
  assert.equal(s.hpMax, ARMOR.heavy.hp); assert.ok(Math.abs(s.speedMul - 0.9 * 1.16) < 1e-9);
  assert.equal(statsOf({ weapon: 'nuke', armor: 'x' }).weapon, 'pistol'); assert.equal(statsOf().hpMax, 100);
});
test('weapons differ in play: a shotgun fires six pellets, a sniper one hard bullet', () => {
  const m = new Match({ teams: [{ name: 'A' }, { name: 'B' }], perSide: 2, bots: false });
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon: 'shotgun' } }), b = m.addPlayer('b', { name: 'B', team: 1, loadout: { weapon: 'sniper' } });
  m.phase = 'live'; m.timer = 60; a.x = 100; a.y = 500; b.x = 1500; b.y = 100;
  a.input = { dx: 0, dy: 0, aim: 0, fire: true }; b.input = { dx: 0, dy: 0, aim: 3, fire: true };
  m.step(1 / 30);
  assert.equal(m.bullets.filter((x) => x.owner === 'a').length, 6); assert.equal(m.bullets.filter((x) => x.owner === 'b').length, 1);
  assert.equal(m.bullets.find((x) => x.owner === 'b').dmg, WEAPONS.sniper.dmg);
});
