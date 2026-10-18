// Reach and the scope-and-action mods on the big maps (200 m is 10,000 px).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, statsOf } from './game.js';
import { WEAPONS, MODS } from './items.js';

const T = [{ name: 'A' }, { name: 'B' }];
/** two soldiers on an empty floor `dist` px apart; the shooter has the named weapon up and aimed down the sights */
function face(weapon, dist, mod = 'nomod') {
  const m = new Match({ teams: T, perSide: 1, bots: false, map: 'cargo' });
  m.map = { ...m.map, solids: [], ramps: [] };
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon, mod } }), b = m.addPlayer('b', { name: 'B', team: 1 });
  Object.assign(a, { x: 300, y: 2000, z: 0, aim: 0, pitch: 0, ads: 1, spreadMul: 0 });
  Object.assign(b, { x: 300 + dist, y: 2000, z: 0, hp: 1000, hpMax: 1000 });
  m.phase = 'live'; m.timer = 60;
  return [m, a, b];
}
const fire = (m, a) => { a.rc.p = 0; a.rc.y = 0; a.rc.bloom = 0; a.input.fire = true; a.ammo = 10; a.cd = 0; m.step(1 / 60); a.input.fire = false; };

test('a sniper rifle still hits at 180 m, and a marksman rifle at 130 m', () => {
  for (const [w, d] of [['sniper', 9000], ['dmr', 6500]]) {
    const [m, a, b] = face(w, d); fire(m, a);
    assert.ok(b.hp < 1000, `${w} missed at ${d / 50} m`);
  }
});

test('an assault rifle reaches 80 m but not 120 m; a pistol reaches 40 m but not 60 m; a shotgun does not reach 30 m', () => {
  for (const [w, d, hit] of [['rifle', 4000, true], ['rifle', 6000, false], ['pistol', 2000, true], ['pistol', 3000, false], ['shotgun', 1500, false]]) {
    const [m, a, b] = face(w, d); fire(m, a);
    assert.equal(b.hp < 1000, hit, `${w} at ${d / 50} m should ${hit ? '' : 'not '}hit`);
  }
});

test('every gun reaches farther than its own falloff starts, so the falloff is the thing that works at range', () => {
  for (const [id, w] of Object.entries(WEAPONS)) assert.ok(w.range >= 700, id);
  assert.ok(WEAPONS.sniper.range > WEAPONS.dmr.range && WEAPONS.dmr.range > WEAPONS.rifle.range && WEAPONS.rifle.range > WEAPONS.pistol.range);
});

test('fast action shortens the time between shots by a fifth; long scope and steady scope are carried to the page', () => {
  assert.equal(statsOf({ weapon: 'sniper', mod: 'bolt' }).gapMul, 0.8);
  assert.equal(statsOf({ weapon: 'sniper', mod: 'nomod' }).gapMul, 1);
  assert.equal(statsOf({ weapon: 'sniper', mod: 'scope' }).zoomMul, 0.65);
  assert.equal(statsOf({ weapon: 'sniper', mod: 'steady' }).steady, 1);
  const [m, a] = face('sniper', 3000, 'bolt'); fire(m, a);
  assert.ok(Math.abs(a.cd - (WEAPONS.sniper.gap * 0.8 - 1 / 60)) < 0.02, `cooldown ${a.cd}`);
  const [m2, a2] = face('sniper', 3000, 'steady');
  const r = m2.roster().find((x) => x.id === 'a'); assert.equal(r.steady, 1); assert.equal(r.zoomMul, 1);
  assert.ok(MODS.bolt.cost > 0 && MODS.scope.cost > 0 && MODS.steady.cost > 0);
});

test('every class has a range where it is the best choice: SMG and shotguns beat the rifle close up, the rifle beats them far off', async () => {
  const { falloff } = await import('./gunfeel.js');
  const ttk = (id, m) => { const w = WEAPONS[id], d = m * 50; if (d > w.range) return Infinity; const per = w.dmg * (w.pellets > 1 ? w.pellets * 0.8 : 1) * falloff(id, d); return (Math.ceil(100 / per) - 1) * w.gap; };
  for (const id of ['smg', 'shotgun', 'autosg']) assert.ok(ttk(id, 4) < ttk('rifle', 4), `${id} should beat the rifle at 4 m (${ttk(id, 4)} vs ${ttk('rifle', 4)})`);
  for (const id of ['smg', 'shotgun', 'autosg', 'pistol']) assert.ok(ttk('rifle', 40) < ttk(id, 40), `the rifle should beat ${id} at 40 m`);
  assert.ok(ttk('dmr', 100) < Infinity && ttk('sniper', 200) < Infinity && ttk('rifle', 200) === Infinity);
});
