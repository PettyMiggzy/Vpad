// Reach and the scope-and-action mods on the big maps (200 m is 10,000 px).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, statsOf } from './game.js';
import { WEAPONS, CATALOG } from './items.js';

const T = [{ name: 'A' }, { name: 'B' }];
/** two soldiers on an empty floor `dist` px apart; the shooter has the named weapon up and aimed down the sights */
function face(weapon, dist, gear = {}) {
  const m = new Match({ teams: T, perSide: 1, bots: false, map: 'cargo' });
  m.map = { ...m.map, solids: [], ramps: [] };
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon, ...gear } }), b = m.addPlayer('b', { name: 'B', team: 1 });
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
  assert.equal(statsOf({ weapon: 'sniper', grip: 'bolt' }).gapMul, 0.8);
  assert.equal(statsOf({ weapon: 'sniper', grip: 'nogrip' }).gapMul, 1);
  assert.equal(statsOf({ weapon: 'sniper', optic: 'scope' }).zoomMul, 0.65);
  assert.equal(statsOf({ weapon: 'sniper', optic: 'steady' }).steady, 1);
  const [m, a] = face('sniper', 3000, { grip: 'bolt' }); fire(m, a);
  assert.ok(Math.abs(a.cd - (WEAPONS.sniper.gap * 0.8 - 1 / 60)) < 0.02, `cooldown ${a.cd}`);
  const [m2, a2] = face('sniper', 3000, { optic: 'steady' });
  const r = m2.roster().find((x) => x.id === 'a'); assert.equal(r.steady, 1); assert.equal(r.zoomMul, 1);
  assert.ok(CATALOG.bolt.cost > 0 && CATALOG.scope.cost > 0 && CATALOG.steady.cost > 0);
});

test('every class has a range where it is the best choice: SMG and shotguns beat the rifle close up, the rifle beats them far off', async () => {
  const { falloff } = await import('./gunfeel.js');
  const ttk = (id, m) => { const w = WEAPONS[id], d = m * 50; if (d > w.range) return Infinity; const per = w.dmg * (w.pellets > 1 ? w.pellets * 0.8 : 1) * falloff(id, d); return (Math.ceil(100 / per) - 1) * w.gap; };
  for (const id of ['smg', 'shotgun', 'autosg']) assert.ok(ttk(id, 4) < ttk('rifle', 4), `${id} should beat the rifle at 4 m (${ttk(id, 4)} vs ${ttk('rifle', 4)})`);
  for (const id of ['smg', 'shotgun', 'autosg', 'pistol']) assert.ok(ttk('rifle', 40) < ttk(id, 40), `the rifle should beat ${id} at 40 m`);
  assert.ok(ttk('dmr', 100) < Infinity && ttk('sniper', 200) < Infinity && ttk('rifle', 200) === Infinity);
});

// ---- attachments: four slots that stack ----
test('the four attachment slots stack: every effect multiplies with the others, and an item in the wrong slot does nothing', () => {
  const s = statsOf({ weapon: 'rifle', optic: 'reddot', muzzle: 'comp', grip: 'fore', ammo: 'hollow' });
  assert.ok(Math.abs(s.spreadMul - 0.9) < 1e-9); assert.ok(Math.abs(s.recoilMul - 0.7 * 0.75) < 1e-9);
  assert.ok(Math.abs(s.dmgMul - 1.12) < 1e-9); assert.ok(Math.abs(s.magMul - 0.8) < 1e-9);
  const both = statsOf({ weapon: 'rifle', muzzle: 'suppressor', ammo: 'hollow' });
  assert.ok(Math.abs(both.dmgMul - 0.94 * 1.12) < 1e-9); assert.equal(both.quiet, 1);
  const wrong = statsOf({ weapon: 'rifle', optic: 'barrel', muzzle: 'scope', grip: 'extmag', ammo: 'comp' });
  assert.deepEqual(wrong.attach, { optic: 'noptic', muzzle: 'nomuzzle', grip: 'nogrip', ammo: 'stdammo' });
  assert.equal(wrong.dmgMul, 1); assert.equal(wrong.recoilMul, 1); assert.equal(wrong.pierce, 0);
});

test('a compensator and a foregrip cut the kick a shot adds, the way the page and the server both work it out', () => {
  const kick = (gear) => { const [m, a] = face('rifle', 3000, gear); a.rc.p = 0; a.rc.y = 0; a.input.fire = true; a.ammo = 10; a.cd = 0; m.step(1 / 60); return Math.abs(a.rc.p); };
  const plain = kick({}), comp = kick({ muzzle: 'comp' }), both = kick({ muzzle: 'comp', grip: 'fore' });
  assert.ok(plain > 0 && comp < plain * 0.75 && both < comp * 0.85, `kick ${plain} ${comp} ${both}`);
  assert.equal(statsOf({ weapon: 'rifle', muzzle: 'comp' }).recoilMul, 0.7);
});

test('armour-piercing rounds go through thin cover at 55% damage, and no round goes through a container, a wall or a house', () => {
  const run = (gear, kind) => {
    const [m, a, b] = face('rifle', 1500, gear);
    m.map = { ...m.map, solids: [{ kind, x: 650, y: 1990, w: 40, h: 40, top: 3, walk: false }], ramps: [] };
    fire(m, a); return 1000 - b.hp;
  };
  const base = WEAPONS.rifle.dmg;
  assert.equal(run({}, 'crate'), 0, 'a plain round stops in a crate');
  const through = run({ ammo: 'ap' }, 'crate');
  assert.ok(through > 0 && Math.abs(through - base * 0.55) < base * 0.25, `through a crate ${through}`);
  for (const k of ['sandbag', 'barrel', 'barrier', 'fence']) assert.ok(run({ ammo: 'ap' }, k) > 0, `through a ${k}`);
  for (const k of ['container', 'wall', 'house', 'tank']) assert.equal(run({ ammo: 'ap' }, k), 0, `a ${k} stops even armour-piercing rounds`);
  const [m, a, b] = face('rifle', 1500, { ammo: 'ap' }); m.map = { ...m.map, solids: [], ramps: [] }; fire(m, a);
  assert.ok(1000 - b.hp > base * 0.8, 'with nothing in the way the round does full damage');
});

test('a suppressed shot says so in its event, and a plain one does not', () => {
  const ev = (gear) => { const [m, a] = face('rifle', 3000, gear); fire(m, a); return m.events.find((e) => e.type === 'shot'); };
  assert.equal(ev({ muzzle: 'suppressor' }).q, 1); assert.equal(ev({}).q, undefined);
});

test('a profile saved with the one old mod slot moves over: the mod goes where it belongs and the free attachments are owned', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-mig-'));
  const pid = 'feedbeef0123456789abcdef01234567';
  const old = { coins: 500, owned: ['pistol', 'nomod', 'none', 'nohelm', 'standard', 'frag2', 'woodland', 'scope', 'extmag'], loadout: { weapon: 'pistol', mod: 'scope', armor: 'none', helmet: 'nohelm', boots: 'standard', grenade: 'frag2', camo: 'woodland' }, xp: 5000, weaponKills: {}, classes: [{ name: 'Sniper', loadout: { weapon: 'pistol', mod: 'extmag' } }], activeClass: 0 };
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ [pid]: old }));
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['-e', `process.env.ARENA_DATA=${JSON.stringify(dir)}; const { getProfile } = await import('./profiles.js'); const p = getProfile(${JSON.stringify(pid)}); console.log(JSON.stringify({ l: p.loadout, owned: p.owned, c0: p.classes[0].loadout }));`, '--input-type=module'], { cwd: import.meta.dirname, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.l.optic, 'scope'); assert.equal(out.l.mod, undefined); assert.equal(out.l.muzzle, 'nomuzzle');
  for (const id of ['noptic', 'nomuzzle', 'nogrip', 'stdammo', 'scope', 'extmag']) assert.ok(out.owned.includes(id), id);
  assert.ok(!out.owned.includes('nomod'));
  assert.equal(out.c0.ammo, 'extmag'); assert.equal(out.c0.mod, undefined);
});
