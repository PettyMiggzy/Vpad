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

test('a new profile owns every gun, starts with the assault rifle and the starting coins; bad ids get nothing', () => {
  const p = getProfile(pid(1));
  for (const id of Object.keys(WEAPONS)) assert.ok(p.owned.includes(id), `owns the ${id}`);
  assert.equal(p.coins, START_COINS); assert.deepEqual(p.loadout, { weapon: 'rifle', optic: 'noptic', muzzle: 'nomuzzle', grip: 'nogrip', ammo: 'stdammo', armor: 'none', helmet: 'nohelm', boots: 'standard', grenade: 'frag2', camo: 'woodland' });
  assert.equal(getProfile('../etc/passwd'), null); assert.equal(validPid('x'), false);
});
test('buying an upgrade costs coins once, cannot overspend, and equips what you buy; guns are never for sale', async () => {
  const { grantXp: gx, } = await import('./profiles.js'); const { xpForLevel: xl } = await import('./progress.js'); gx(pid(2), xl(2));
  const { AMMO } = await import('./items.js');
  assert.equal(buy(pid(2), 'extmag').coins, START_COINS - AMMO.extmag.cost);
  assert.equal(getProfile(pid(2)).loadout.ammo, 'extmag');
  assert.ok(buy(pid(2), 'extmag').error, 'no second purchase');
  assert.match(buy(pid(2), 'smg').error, /already own/, 'a gun is owned from the start');
  const p = getProfile(pid(3)); p.coins = 100; gx(pid(3), xl(2));
  assert.ok(buy(pid(3), 'extmag').error, 'not enough coins'); assert.equal(p.coins, 100); assert.ok(!p.owned.includes('extmag'));
  assert.ok(buy(pid(3), 'nonsense').error);
});
test('any gun can be equipped at once; other gear only when owned, and a match only gets owned gear', () => {
  assert.ok(!equip(pid(4), 'sniper').error); assert.equal(getProfile(pid(4)).loadout.weapon, 'sniper');
  assert.ok(equip(pid(4), 'extmag').error, 'an attachment that is not owned');
  getProfile(pid(5)).loadout.ammo = 'extmag';        // a tampered profile naming gear it does not own
  assert.equal(loadoutFor(pid(5)).ammo, 'stdammo');
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
  const shots = m.events.filter((e) => e.type === 'shot');
  assert.equal(shots.filter((x) => x.by === 'a').length, 6); assert.equal(shots.filter((x) => x.by === 'b').length, 1);
  assert.equal(WEAPONS.sniper.pellets, 1); assert.ok(WEAPONS.sniper.dmg > WEAPONS.shotgun.dmg * 3);
});

const { levelOf, xpForLevel, lockedReason, masteryOf, MASTERY, freshClasses } = await import('./progress.js');
const { classOp, grantXp } = await import('./profiles.js');
test('levels climb with experience and gate the shop; a locked item cannot be bought or equipped', () => {
  assert.equal(levelOf(0), 1); assert.equal(levelOf(xpForLevel(5)), 5); assert.equal(levelOf(xpForLevel(5) - 1), 4); assert.equal(levelOf(1e9), 30);
  const p = getProfile(pid(10)); p.coins = 5000;
  assert.match(buy(pid(10), 'suppressor').error, /level 9/, 'the suppressor waits for level 9');
  assert.match(buy(pid(10), 'extmag').error, /level 2/);
  grantXp(pid(10), xpForLevel(9));
  assert.ok(!buy(pid(10), 'suppressor').error, 'bought once unlocked'); assert.equal(getProfile(pid(10)).loadout.muzzle, 'suppressor');
  const q = getProfile(pid(11)); q.owned.push('suppressor'); q.loadout.muzzle = 'suppressor';       // a tampered profile naming gear above its level
  assert.equal(loadoutFor(pid(11)).muzzle, 'nomuzzle', 'a match gets the free muzzle');
  grantXp(pid(12), xpForLevel(2));
  assert.equal(buy(pid(12), 'light').coins, START_COINS - ARMOR.light.cost, 'the light vest is armour (it once clashed with the light boots)');
});
test('earned items: gold needs a mastered weapon, obsidian needs level 20', () => {
  const p = getProfile(pid(13));
  assert.match(lockedReason(p, 'gold'), /150 kills/); assert.match(lockedReason(p, 'obsidian'), /level 20/);
  p.weaponKills = { rifle: MASTERY[2] }; assert.equal(lockedReason(p, 'gold'), null);
  grantXp(pid(13), xpForLevel(20)); assert.equal(lockedReason(p, 'obsidian'), null);
  assert.equal(masteryOf(0), 0); assert.equal(masteryOf(20), 1); assert.equal(masteryOf(150), 3);
});
test('five classes: save the loadout, switch between them, rename; what is no longer allowed falls back to free gear', () => {
  const p = getProfile(pid(14)); p.coins = 5000;
  assert.equal(p.classes.length, 5);
  assert.deepEqual(p.classes.map((c) => c.loadout.weapon), ['rifle', 'smg', 'shotgun', 'sniper', 'lmg'], 'each class starts with a different gun');
  grantXp(pid(14), xpForLevel(5)); equip(pid(14), 'smg'); buy(pid(14), 'extmag'); buy(pid(14), 'light');
  assert.ok(!classOp(pid(14), 'save', 0).error); assert.equal(p.classes[0].loadout.weapon, 'smg');
  equip(pid(14), 'pistol'); equip(pid(14), 'stdammo');
  assert.ok(!classOp(pid(14), 'save', 1).error);
  classOp(pid(14), 'select', 0); assert.equal(p.loadout.weapon, 'smg'); assert.equal(p.loadout.ammo, 'extmag'); assert.equal(p.activeClass, 0);
  classOp(pid(14), 'select', 1); assert.equal(p.loadout.weapon, 'pistol');
  assert.equal(classOp(pid(14), 'rename', 2, 'Sniper <b>').classes[2].name, 'Sniper b');
  assert.ok(classOp(pid(14), 'select', 9).error); assert.ok(classOp(pid(14), 'rename', 0, '   ').error);
  p.classes[3].loadout.weapon = 'nuke';               // a class naming a weapon that does not exist
  classOp(pid(14), 'select', 3); assert.equal(p.loadout.weapon, 'pistol');
});
