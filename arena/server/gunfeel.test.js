import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, R } from './game.js';
import { WEAPONS } from './items.js';
import { FEEL, Recoil, spreadFor, falloff, sideAt } from './gunfeel.js';

const teams = [{ name: 'A', color: 1 }, { name: 'B', color: 2 }];
const duel = (weapon, dist, opts = {}) => {
  const m = new Match({ teams, perSide: 1, bots: false, map: 'cargo' });
  const a = m.addPlayer('a', { name: 'a', team: 0, loadout: { weapon } }), b = m.addPlayer('b', { name: 'b', team: 1 });
  m.startRound();
  m.phase = 'live'; m.timer = 100;
  m.map = { ...m.map, solids: [], ramps: [] };           // an empty field, so only the gun is under test
  Object.assign(a, { x: 200, y: 150, z: 0, aim: 0, pitch: 0 });
  Object.assign(b, { x: 200 + dist, y: 150, z: 0, hp: 100000, hpMax: 100000 });
  a.weapon = weapon; a.ammo = 1000; a.magSize = 1000; Object.assign(a, opts);
  return [m, a, b];
};

test('recoil is a fixed pattern: the same spray lifts and drifts the same way every time, up to a cap', () => {
  const run = () => { const r = new Recoil(), out = []; for (let i = 0; i < 40; i++) { r.shot('rifle'); out.push([r.p, r.y]); r.step(0.1, 'rifle'); } return out; };
  assert.deepEqual(run(), run());
  const r = new Recoil(); for (let i = 0; i < 100; i++) r.shot('rifle');
  assert.ok(r.p <= FEEL.rifle.max + 1e-9, 'the lift is capped');
  assert.ok(Math.abs(r.y) <= FEEL.rifle.max * 0.6 + 1e-9, 'the drift is capped');
  let up = 0; const q = new Recoil(); for (let i = 0; i < 6; i++) { const before = q.p; q.shot('rifle'); if (q.p > before) up++; }
  assert.equal(up, 6, 'each of the first shots lifts the aim');
  assert.ok(new Set(Array.from({ length: 10 }, (_, i) => sideAt(i).toFixed(3))).size > 5, 'the sideways wander is not one value');
});

test('the aim settles after the trigger is let go, and the spray starts over', () => {
  const r = new Recoil(); for (let i = 0; i < 8; i++) { r.shot('rifle'); r.step(0.05, 'rifle'); }
  const raised = r.p; assert.ok(raised > 0.05);
  r.step(FEEL.rifle.hold - 0.06, 'rifle'); assert.ok(r.p > raised * 0.9, 'it does not settle while the spray is still fresh');
  for (let i = 0; i < 60; i++) r.step(0.05, 'rifle');
  assert.equal(r.p, 0); assert.equal(r.n, 0); assert.equal(r.bloom, 0);
});

test('spread: the sights tighten it, moving and jumping widen it, a long spray widens it, a sniper rifle is wild from the hip', () => {
  const base = WEAPONS.rifle.spread;
  const hip = spreadFor('rifle', base, {}), ads = spreadFor('rifle', base, { ads: 1 });
  assert.ok(ads < hip * 0.4, 'sights tighten');
  assert.ok(spreadFor('rifle', base, { move: 1 }) > hip * 1.5, 'moving widens');
  assert.ok(spreadFor('rifle', base, { air: true }) > spreadFor('rifle', base, { move: 1 }), 'jumping is worst');
  assert.ok(spreadFor('rifle', base, { bloom: 0.8 }) > hip * 1.7, 'a long spray widens');
  const s = WEAPONS.sniper.spread;
  assert.ok(spreadFor('sniper', s, {}) > spreadFor('sniper', s, { ads: 1 }) * 10, 'a sniper rifle from the hip is far less accurate');
  assert.equal(spreadFor('shotgun', WEAPONS.shotgun.spread, { bloom: 0 }), WEAPONS.shotgun.spread * FEEL.shotgun.hip);
});

test('damage falls with distance (not for a sniper rifle) and a shotgun is nothing at long range', () => {
  for (const id of Object.keys(WEAPONS)) {
    assert.equal(falloff(id, 0), 1);
    assert.ok(falloff(id, 1e6) <= 1 && falloff(id, 1e6) > 0);
    let last = 1; for (let d = 0; d <= 3500; d += 100) { const v = falloff(id, d); assert.ok(v <= last + 1e-12, `${id} rises at ${d}`); last = v; }
  }
  assert.equal(falloff('sniper', 3000), 1);
  assert.ok(falloff('shotgun', 700) <= 0.25 + 1e-9 && falloff('rifle', 800) === 1 && falloff('rifle', 2200) < 0.71);
});

test('in the rules: a far hit does less than a near one, a leg hit does less than a body hit, and the hit says where', () => {
  const dmgAt = (weapon, dist, pitch = 0) => {
    const [m, a, b] = duel(weapon, dist, { ads: 1, spreadMul: 0, input: { fire: true, ads: true, aim: 0, pitch } });
    a.rc.p = 0; m.step(1 / 60);
    const hit = m.events.find((e) => e.type === 'hit');
    return hit ? { dmg: 100000 - b.hp, zone: hit.zone } : null;
  };
  // the rifle aimed true at the chest (pitch lifts to chest height on a level field)
  const chest = (d) => Math.atan2(1.0 + 0 - R.EYE, d / 50);
  const near = dmgAt('rifle', 400, chest(400)), far = dmgAt('rifle', 2000, chest(2000));
  assert.ok(near && far, 'both shots hit with the sights up');
  assert.equal(near.zone, 'body');
  assert.ok(far.dmg < near.dmg, `far ${far.dmg} should be less than near ${near.dmg}`);
  const leg = dmgAt('rifle', 400, Math.atan2(0.4 - R.EYE, 400 / 50));
  assert.ok(leg && leg.zone === 'legs' && leg.dmg < near.dmg, 'a leg hit is worth less');
  const head = dmgAt('rifle', 400, Math.atan2(R.HEAD + 0.06 - R.EYE, 400 / 50));
  assert.ok(head && head.zone === 'head' && head.dmg > near.dmg * 1.5, 'a head hit is worth more');
});

test('the sights are raised over the weapon time, slow you down, and cannot be raised while sprinting or reloading', () => {
  const [m, a] = duel('rifle', 3000, { input: { ads: true, aim: 0, pitch: 0 } });
  for (let i = 0; i < 6; i++) m.step(1 / 60);
  assert.ok(a.ads > 0 && a.ads < 1, 'still rising after a tenth of a second');
  for (let i = 0; i < 60; i++) m.step(1 / 60);
  assert.equal(a.ads, 1);
  const x0 = a.x; a.input = { ads: true, dx: 1, dy: 0, aim: 0, pitch: 0 }; for (let i = 0; i < 30; i++) m.step(1 / 60);
  const slow = a.x - x0;
  a.ads = 0; const x1 = a.x; a.input = { dx: 1, dy: 0, aim: 0, pitch: 0 }; for (let i = 0; i < 30; i++) m.step(1 / 60);
  assert.ok(slow < (a.x - x1) * 0.9, `aimed ${slow} vs free ${a.x - x1}`);
  a.ads = 0; a.input = { ads: true, sprint: true, dx: 1, dy: 0, aim: 0, pitch: 0 }; for (let i = 0; i < 30; i++) m.step(1 / 60);
  assert.equal(a.ads, 0, 'no sights while sprinting');
  a.input = { ads: true, aim: 0, pitch: 0 }; a.rl = 1; m.step(1 / 60);
  assert.equal(a.ads, 0, 'no sights while reloading');
});

test('a spray climbs: the fifth shot goes higher than the first, and aiming down the sights climbs less', () => {
  const climb = (ads) => {
    const [m, a] = duel('rifle', 4000, { ads: ads ? 1 : 0, spreadMul: 0, input: { fire: true, ads: !!ads, aim: 0, pitch: 0 } });
    const ez = []; for (let i = 0; i < 400 && ez.length < 6; i++) { m.step(1 / 60); for (const e of m.events) if (e.type === 'shot') ez.push(e.ez); }
    return ez[5] - ez[0];
  };
  assert.ok(climb(false) > 0.5, 'a hip spray climbs well above the first shot');
  assert.ok(climb(true) < climb(false), 'the sights climb less');
});

test('a moving gunner is less accurate than a still one (many shots)', () => {
  const miss = (dx) => {
    const [m, a] = duel('rifle', 1500, { input: { fire: true, dx, aim: 0, pitch: Math.atan2(1.0 - R.EYE, 30) } });
    let hits = 0, shots = 0;
    for (let i = 0; i < 600; i++) { a.x = 200; a.rc.p = 0; a.rc.y = 0; a.rc.bloom = 0; a.ammo = 100; m.step(1 / 30); for (const e of m.events) if (e.type === 'shot') { shots++; hits += e.hit; } }
    return hits / shots;
  };
  assert.ok(miss(0) > miss(1), 'standing hits more often');
});

test('the page and the server compute the same recoil from the same shots', () => {
  const server = duel('rifle', 3000, { input: { fire: true, aim: 0, pitch: 0 } })[1];
  const [m, a] = [null, server];
  void m; void a;
  const mirror = new Recoil();
  const [mm, aa] = duel('smg', 3000, { input: { fire: true, aim: 0, pitch: 0 } });
  for (let i = 0; i < 90; i++) { mm.step(1 / 30); for (const e of mm.events) if (e.type === 'shot') mirror.shot('smg', aa.ads, 1); mirror.step(1 / 30, 'smg'); }
  assert.ok(Math.abs(mirror.p - aa.rc.p) < 0.03 && Math.abs(mirror.y - aa.rc.y) < 0.03, `page ${mirror.p.toFixed(3)} server ${aa.rc.p.toFixed(3)}`);
});

test('computer players are not thrown by recoil', () => {
  const m = new Match({ teams, perSide: 2, bots: true, map: 'cargo' }); m.startRound();
  const bot = [...m.players.values()].find((p) => p.bot);
  const before = bot.rc.p; bot.weapon = 'lmg'; bot.ammo = 50;
  for (let i = 0; i < 5; i++) { bot.rc.shot('lmg', 1, 0.25); }
  assert.ok(bot.rc.p - before <= FEEL.lmg.kick * 0.25 * 5 + 1e-9);
});
