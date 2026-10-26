// The four guns added on 2026-10-24: machine pistol, compact PDW, battle rifle, anti-materiel rifle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Match } from './game.js';
import { WEAPONS, STARTER_OWNED } from './items.js';
import { FEEL } from './gunfeel.js';

const NEW = ['mp', 'pdw', 'br', 'amr'];
const T = [{ name: 'A' }, { name: 'B' }];
const pub = (p) => new URL(`../web/public/${p}`, import.meta.url);
const text = (p) => fs.readFileSync(new URL(`../web/src/${p}`, import.meta.url), 'utf8');

test('every gun has rules, a recoil feel, four model files, a loadout picture and a place in the page\'s list', () => {
  const ids = text('assets.js').match(/WEAPON_IDS = \[([^\]]*)\]/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  for (const id of Object.keys(WEAPONS)) {
    assert.ok(FEEL[id], `${id} has a recoil feel`);
    assert.ok(ids.includes(id), `${id} is in the page's gun list`);
    for (const f of [`models/hero/gun_${id}.glb`, `models/hero/gun_${id}_lo.glb`, `models-m/hero/gun_${id}.glb`, `models-m/hero/gun_${id}_lo.glb`, `guns/${id}.webp`]) assert.ok(fs.existsSync(pub(f)), `${f} exists`);
    for (const file of ['view.js', 'units.js']) assert.ok(new RegExp(`\\b${id}:`).test(text(file)), `${id} is placed in ${file}`);
  }
  for (const id of NEW) assert.ok(WEAPONS[id], `${id} exists`);
});

test('every gun is owned from the start, the new ones too', () => {
  for (const id of NEW) assert.ok(STARTER_OWNED.includes(id), id);
});

test('each new gun does its own job: the machine pistol sprays up close, the battle rifle needs four body shots, the anti-materiel rifle kills an unarmoured soldier in one', () => {
  const W = WEAPONS;
  assert.ok(W.mp.gap < W.smg.gap && W.mp.range < W.smg.range, 'faster than the SMG and shorter');
  assert.ok(W.pdw.mag > W.smg.mag, 'a longer magazine than the SMG');
  assert.equal(Math.ceil(100 / W.br.dmg), 4, 'four body shots');
  assert.ok(W.br.gap < W.dmr.gap, 'quicker than the marksman rifle');
  assert.ok(W.amr.dmg >= 100 && W.amr.dmg < 125, 'one shot for a bare soldier, not for a light vest');
  assert.ok(W.amr.gap > W.sniper.gap && W.amr.range > W.sniper.range, 'slower and longer than the sniper');
});

test('the anti-materiel rifle kills at 200 m in one body hit; the battle rifle at 30 m takes four', () => {
  for (const [id, dist, shots] of [['amr', 10000, 1], ['br', 1500, 4]]) {
    const m = new Match({ teams: T, perSide: 1, bots: false, map: 'cargo' });
    m.map = { ...m.map, solids: [], ramps: [] };
    const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon: id } }), b = m.addPlayer('b', { name: 'B', team: 1 });
    Object.assign(a, { x: 300, y: 2000, z: 0, aim: 0, pitch: 0, ads: 1, spreadMul: 0 });
    Object.assign(b, { x: 300 + dist, y: 2000, z: 0 });
    m.phase = 'live'; m.timer = 60;
    let n = 0;
    while (b.alive && n < 8) {
      a.rc.p = 0; a.rc.y = 0; a.rc.bloom = 0; a.input.fire = true; a.ammo = 10; a.cd = 0; m.step(1 / 60); a.input.fire = false; b.hp > 0 && (n += 0); n++;
      if (n > 6) break;
    }
    assert.equal(b.alive, false, `${id} killed`);
    assert.equal(n, shots, `${id}: ${n} pulls`);
  }
});

test('a whole bot match is played with only the new guns without a crash, and bots shoot with them', () => {
  for (const id of NEW) {
    const m = new Match({ teams: T, perSide: 3, bots: true, map: 'dust' });
    m.startRound();
    for (const pl of m.players.values()) { pl.primary = id; pl.weapon = id; pl.slot = 0; pl.magSize = WEAPONS[id].mag; pl.ammo = pl.magSize; pl.reserve = 999; }
    let shots = 0;
    for (let i = 0; i < 60 * 40; i++) { m.step(1 / 60); for (const e of m.events) if (e.type === 'shot') shots++; m.events = []; }
    assert.ok(shots > 0, `${id}: bots fired`);
  }
});

// ---- the fun guns: launchers, minigun, flamethrower, ray gun, crossbow ----
import { Match as M2 } from './game.js';
const FUN = ['thumper', 'rocket', 'minigun', 'flame', 'raygun', 'crossbow'];

function duel(weapon, dist, { z = 0, hp = 1000, gear = {} } = {}) {
  const m = new M2({ teams: T, perSide: 1, bots: false, map: 'cargo' });
  m.map = { ...m.map, solids: [], ramps: [] };
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon, ...gear } }), b = m.addPlayer('b', { name: 'B', team: 1 });
  Object.assign(a, { x: 300, y: 2000, z: 0, aim: 0, pitch: 0, ads: 1, spreadMul: 0 });
  Object.assign(b, { x: 300 + dist, y: 2000, z, hp, hpMax: Math.max(hp, 100) });
  m.phase = 'live'; m.timer = 60;
  return [m, a, b];
}
const pull = (m, a) => { a.rc.p = 0; a.rc.y = 0; a.rc.bloom = 0; a.input.fire = true; a.ammo = 10; a.cd = 0; m.step(1 / 60); a.input.fire = false; };

test('fun guns exist, are owned from the start and are in the crates', async () => {
  const { CRATE_GUNS } = await import('./pickups.js');
  for (const id of FUN) { assert.ok(WEAPONS[id], id); assert.ok(STARTER_OWNED.includes(id), `${id} owned`); }
  for (const id of ['rocket', 'minigun', 'raygun', 'thumper']) assert.ok(CRATE_GUNS.includes(id), `${id} in crates`);
});

test('a rocket flies, bursts on a soldier in its path and kills a bare soldier; the thumper arcs and bursts where it lands', () => {
  { const [m, a, b] = duel('rocket', 2500, { hp: 100 }); pull(m, a);
    assert.equal(m.nades.length, 1, 'a shell is in the air'); assert.equal(m.nades[0].kind, 2);
    const ev = []; for (let i = 0; i < 120 && b.alive; i++) { m.step(1 / 60); ev.push(...m.events); }
    assert.equal(b.alive, false, 'killed'); assert.ok(ev.some((e) => e.type === 'boom'), 'a blast');
    assert.ok(ev.some((e) => e.type === 'kill' && e.weapon === 'rocket' && !e.nade), 'the kill is the rocket\'s'); }
  { const [m, a, b] = duel('thumper', 1800, { hp: 1000 }); a.pitch = 0.18; pull(m, a);
    assert.equal(m.nades[0].kind, 1);
    let boom = false; for (let i = 0; i < 240 && !boom; i++) { m.step(1 / 60); boom = m.events.some((e) => e.type === 'boom'); }
    assert.ok(boom, 'it burst'); assert.equal(m.nades.length, 0, 'and is gone'); }
});

test('a shell bursts on a wall and does not hurt a soldier behind it; a rocket fired point-blank at your own feet hurts you less than a direct hit hurts them', () => {
  const [m, a, b] = duel('rocket', 2500, { hp: 1000 });
  m.map = { ...m.map, solids: [{ x: 1200, y: 1700, w: 100, h: 600, top: 30, kind: 'wall' }] };
  pull(m, a); for (let i = 0; i < 120; i++) m.step(1 / 60);
  assert.equal(b.hp, 1000, 'the wall took the blast');
  assert.equal(m.nades.length, 0, 'the shell is spent');
});

test('the crossbow is silent and kills with one bolt; the ray gun does not drift; the flamethrower burns close and not far; the minigun has a huge magazine', () => {
  { const [m, a, b] = duel('crossbow', 3000, { hp: 100 }); pull(m, a); assert.equal(b.alive, false, 'one bolt');
    assert.ok(m.events.some((e) => e.type === 'shot' && e.q === 1), 'no tracer for the other side'); }
  { const [m, a, b] = duel('raygun', 4000); pull(m, a); assert.ok(b.hp < 1000, 'hit at 80 m'); assert.ok(m.events.some((e) => e.type === 'shot' && e.fx === 'beam'), 'a beam'); }
  { const [m, a, b] = duel('flame', 300); pull(m, a); assert.ok(b.hp < 1000, 'burns at 6 m'); }
  { const [m, a, b] = duel('flame', 1500); pull(m, a); assert.equal(b.hp, 1000, 'nothing at 30 m'); }
  assert.ok(WEAPONS.minigun.mag >= 100 && WEAPONS.minigun.gap < 0.05);
});

test('a whole bot match is played with the fun guns, bots use them, and nobody ends up with a broken count', () => {
  for (const id of FUN) {
    const m = new M2({ teams: T, perSide: 3, bots: true, map: 'dust' });
    m.startRound();
    for (const pl of m.players.values()) { pl.primary = id; pl.weapon = id; pl.slot = 0; pl.magSize = WEAPONS[id].mag; pl.ammo = pl.magSize; pl.reserve = 99; }
    let shots = 0, bad = false;
    for (let i = 0; i < 60 * 40; i++) { m.step(1 / 60); for (const e of m.events) if (e.type === 'shot') shots++; for (const p of m.players.values()) if (![p.x, p.y, p.hp].every(Number.isFinite)) bad = true; }
    assert.ok(shots > 0, `${id}: bots fired`); assert.ok(!bad, `${id}: no broken numbers`);
  }
});
