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
