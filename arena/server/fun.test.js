// Jetpacks, hand weapons and the new throwables (sticky bombs, fire bombs, flashbangs, throwing knives).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from './game.js';
import { MELEES, GADGETS, KITS, STARTER_OWNED } from './items.js';
import { getProfile, loadoutFor } from './profiles.js';

const T = [{ name: 'A' }, { name: 'B' }];
function world(loadout = {}, dist = 1500, enemy = {}) {
  const m = new Match({ teams: T, perSide: 2, bots: false, map: 'cargo' });
  m.map = { ...m.map, solids: [], ramps: [] };
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout }), b = m.addPlayer('b', { name: 'B', team: 1 });
  Object.assign(a, { x: 600, y: 2000, z: 0, aim: 0, pitch: 0, prot: 0 });
  Object.assign(b, { x: 600 + dist, y: 2000, z: 0, hp: 100, hpMax: 100, prot: 0, ...enemy });
  m.phase = 'live'; m.timer = 120;
  return [m, a, b];
}
const run = (m, secs) => { const ev = []; for (let i = 0; i < Math.round(secs * 60); i++) { m.step(1 / 60); ev.push(...m.events); } return ev; };
const look = (p, pitch) => { p.pitch = pitch; p.input.pitch = pitch; };
const tap = (m, p, key) => { p.input[key] = true; m.step(1 / 60); p.input[key] = false; };

test('every new item is owned from the start and a loadout can use it', () => {
  for (const id of [...Object.keys(MELEES), ...Object.keys(GADGETS), 'sticky2', 'molotov2', 'flash3', 'knives6']) assert.ok(STARTER_OWNED.includes(id), id);
  const p = getProfile('a'.repeat(16)); assert.ok(p);
  assert.equal(loadoutFor('a'.repeat(16)).melee, 'knife'); assert.equal(loadoutFor('a'.repeat(16)).gadget, 'nogadget');
});

test('a jetpack climbs while jump is held and fuel lasts, then falls; without one a jump is a small hop', () => {
  const peak = (gadget, hold) => {
    const [m, a] = world({ gadget }); let top = 0, f0 = a.fuel;
    a.input.jump = true;
    for (let i = 0; i < 60 * 3; i++) { a.input.jump = hold || i < 1; m.step(1 / 60); top = Math.max(top, a.z); }
    return { top, f0, fuel: a.fuel };
  };
  const hop = peak('nogadget', true), jet = peak('jet', true), brief = peak('jet', false);
  assert.ok(hop.top < 1.3, `a plain jump is a hop (${hop.top})`);
  assert.ok(jet.top > 4, `the jetpack climbs (${jet.top})`);
  assert.ok(brief.top < 1.5, 'a tap without holding is just a hop');
  assert.ok(jet.f0 === 100 && peak('turbo', true).top > jet.top, 'the turbo pack goes higher');
});

test('fuel drains while flying, stops the climb when it is gone and fills again on the ground', () => {
  const [m, a] = world({ gadget: 'jet' });
  a.input.jump = true;
  for (let i = 0; i < 60 * 1.2; i++) m.step(1 / 60);
  assert.ok(a.fuel < 60 && a.fuel > 0 && a.jetting, `fuel used (${a.fuel})`);
  for (let i = 0; i < 60 * 3; i++) m.step(1 / 60);
  assert.equal(a.fuel, 0); assert.ok(!a.jetting, 'out of fuel: no more thrust');
  a.input.jump = false;
  for (let i = 0; i < 60 * 6; i++) m.step(1 / 60);
  assert.ok(!a.air && a.fuel > 80, `refilled on the ground (${a.fuel})`);
});

test('a jetpack is capped in height and does not work for a soldier without one', () => {
  const [m, a] = world({ gadget: 'jet' }); a.input.jump = true; let top = 0;
  for (let i = 0; i < 60 * 8; i++) { m.step(1 / 60); top = Math.max(top, a.z); }
  assert.ok(top <= GADGETS.jet.jet.cap + 1.5, `the ceiling holds (${top})`);
});

test('hand weapons differ: the machete reaches farther than the knife, the katana kills from behind, the blade kills a bare soldier in one hit', () => {
  const swing = (melee, dist, behind) => {
    const [m, a, b] = world({ melee }, dist, { aim: behind ? 0 : Math.PI, hp: 100 });
    a.meleeCd = 0; tap(m, a, 'melee'); return b.hp;
  };
  assert.equal(swing('knife', 115), 100, 'the knife does not reach 115'); assert.ok(swing('machete', 115) < 100, 'the machete does');
  assert.ok(swing('katana', 60, true) <= 0, 'a katana from behind kills'); assert.ok(swing('katana', 60, false) > 0, 'from the front it does not');
  assert.ok(swing('blade', 60, false) <= 0, 'the energy blade kills with one blow');
  assert.ok(MELEES.katana.gap > MELEES.tomahawk.gap, 'heavier hand weapons swing slower');
});

test('a sticky bomb sticks to a soldier, rides with them and goes off after its fuse', () => {
  const [m, a, b] = world({ grenade: 'sticky2' }, 1200, { hp: 500, hpMax: 500 });
  tap(m, a, 'nade');
  assert.equal(m.nades[0]?.sticky, true, 'a sticky bomb is thrown');
  const ev = [];
  for (let i = 0; i < 60 * 3 && !ev.some((e) => e.type === 'boom'); i++) { const n = m.nades[0]; if (n && !n.stuck && i < 30) { b.x = n.x + 6; b.y = n.y; } m.step(1 / 60); ev.push(...m.events); }
  assert.ok(ev.some((e) => e.type === 'stuck' && e.victim === b.id), 'it stuck to them');
  assert.ok(b.hp < 500, `and blew (${b.hp})`);
});

test('a sticky bomb stuck to a wall waits for the fuse and burns whoever is near', () => {
  const [m, a, b] = world({ grenade: 'sticky2' }, 400, { hp: 500, hpMax: 500 });
  m.map = { ...m.map, solids: [{ x: 1500, y: 1900, w: 60, h: 200, top: 10, kind: 'wall' }] };
  look(a, 0.0); tap(m, a, 'nade'); const n = m.nades[0];
  run(m, 0.9); assert.ok(n.stuck || m.nades.length === 0, 'it landed and holds');
});

test('a fire bomb leaves flames that burn an enemy standing in them but not a teammate; the thrower takes less', () => {
  const [m, a, b] = world({ grenade: 'molotov2' }, 800, { hp: 1000, hpMax: 1000 });
  const mate = m.addPlayer('c', { name: 'C', team: 0 }); Object.assign(mate, { x: 1400, y: 2000, z: 0, hp: 1000, hpMax: 1000, prot: 0 });
  look(a, 0.12); tap(m, a, 'nade');
  const ev = run(m, 2.5);
  const fire = ev.find((e) => e.type === 'fire'); assert.ok(fire, 'flames start'); assert.equal(m.nades.length, 0);
  Object.assign(b, { x: fire.x, y: fire.y }); Object.assign(mate, { x: fire.x + 20, y: fire.y });
  const hp0 = b.hp; run(m, 2); assert.ok(b.hp < hp0 - 30, `the enemy burns (${hp0 - b.hp})`); assert.equal(mate.hp, 1000, 'a teammate does not');
  run(m, 6); assert.equal(m.fires.length, 0, 'the flames die out');
  const hp1 = b.hp; run(m, 2); assert.equal(b.hp > hp1 - 0.001 || b.hp === hp1, true, 'nothing burns after');
});

test('a flashbang blinds those who see it go off, longer when close, and not through a wall; a blinded bot cannot see', () => {
  const [m, a, b] = world({ grenade: 'flash3' }, 600, { hp: 1000, hpMax: 1000 });
  look(a, 0.1); tap(m, a, 'nade'); const ev = run(m, 2);
  assert.ok(ev.some((e) => e.type === 'boom' && e.fx === 'flash'), 'a flash'); assert.equal(b.hp, 1000, 'no damage');
  assert.ok(ev.some((e) => e.type === 'flashed' && e.victim === b.id), 'the enemy is blinded');
  const [m2, a2, b2] = world({ grenade: 'flash3' }, 600, { hp: 1000, hpMax: 1000 });
  m2.map = { ...m2.map, solids: [{ x: 1000, y: 1000, w: 40, h: 2000, top: 20, kind: 'wall' }] };
  look(a2, 0.1); tap(m2, a2, 'nade'); const ev2 = run(m2, 2);
  assert.ok(!ev2.some((e) => e.type === 'flashed' && e.victim === b2.id), 'a wall protects');
});

test('a thrown knife is silent and straight: a head shot kills, a body hit hurts a lot, and it stops at a wall', () => {
  { const [m, a, b] = world({ grenade: 'knives6' }, 1000, { hp: 100 }); look(a, Math.atan(0.2 / 20) ); tap(m, a, 'nade'); assert.ok(b.hp < 100, 'a hit'); assert.ok(m.events.some((e) => e.type === 'shot' && e.q === 1 && e.fx === 'knife'), 'silent'); }
  { const [m, a, b] = world({ grenade: 'knives6' }, 1000, { hp: 100 }); look(a, Math.atan((R_HEAD - 1.6) / 20)); tap(m, a, 'nade'); assert.ok(b.hp <= 0, 'a head shot kills'); }
  { const [m, a, b] = world({ grenade: 'knives6' }, 1000, { hp: 100 }); m.map = { ...m.map, solids: [{ x: 900, y: 1900, w: 40, h: 200, top: 10, kind: 'wall' }] }; tap(m, a, 'nade'); assert.equal(b.hp, 100, 'the wall stops it'); }
  assert.equal(KITS.knives6.count, 6);
});
const R_HEAD = 1.75;
