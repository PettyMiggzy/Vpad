// Kill-streak rewards: drone (3), bottomless ammunition until you go down (4), adrenaline (5), resupply (6), mortar shells (8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from './game.js';

const T = [{ name: 'A' }, { name: 'B' }];
/** a live match on an empty floor: the player 'a' on team 0, and `foes` soldiers of team 1 spread far from each other and from 'a' */
function world(foes = 4) {
  const m = new Match({ teams: T, perSide: foes + 1, bots: false, map: 'cargo' });
  m.map = { ...m.map, solids: [], ramps: [], _pickupSpots: undefined };
  const a = m.addPlayer('a', { name: 'A', team: 0, loadout: { weapon: 'rifle' } });
  Object.assign(a, { x: 600, y: 2000, z: 0, aim: 0, alive: true });
  const f = [];
  for (let i = 0; i < foes; i++) { const q = m.addPlayer('f' + i, { name: 'F' + i, team: 1 }); Object.assign(q, { x: 1600 + i * 900, y: 1200 + i * 700, z: 0, alive: true, hp: 100 }); f.push(q); }
  m.phase = 'live'; m.timer = 600; m.pickups.list = []; m.pickups.timers = [];
  return [m, a, f];
}
/** the player gets `n` kills in a row (each victim is raised again so the round goes on) */
function streakTo(m, a, f, n) {
  for (let i = 0; i < n; i++) { const v = f[i % f.length]; v.alive = true; v.hp = 100; m.kill(a, v); }
  for (const q of f) { q.alive = true; q.hp = 100; }
  m.phase = 'live';
}
const kinds = (m) => m.events.filter((e) => e.type === 'streak').map((e) => e.kind);

test('the fourth kill in a row gives bottomless spare ammunition, and only the fourth', () => {
  const [m, a, f] = world();
  streakTo(m, a, f, 3); assert.equal(a.endless, false);
  streakTo(m, a, f, 1); assert.equal(a.endless, true); assert.ok(kinds(m).includes('endless'));
  assert.equal(m.snapshot().p.find((r) => r[0] === 'a')[18], 1, 'it goes out with the snapshot');
});

test('with bottomless ammunition a reload fills the magazine and the spare count stays where it was, even at nothing', () => {
  const [m, a, f] = world();
  streakTo(m, a, f, 4);
  a.reserve = 0; a.stashRes = 0; a.ammo = 3;
  a.input.reload = true; for (let i = 0; i < 60 * 4; i++) m.step(1 / 60);
  assert.equal(a.ammo, a.magSize); assert.equal(a.reserve, 0);
  // and without it the same reload does nothing
  const [m2, b, f2] = world(); b.reserve = 0; b.ammo = 3; b.input.reload = true; for (let i = 0; i < 60 * 4; i++) m2.step(1 / 60);
  assert.equal(b.ammo, 3);
});

test('going down ends it, and so does a new round; the free pistol keeps it too while you hold it', () => {
  const [m, a, f] = world();
  streakTo(m, a, f, 4); assert.equal(a.endless, true);
  a.input.swap = true; m.step(1 / 60); a.input.swap = false; a.swapT = 0; a.reserve = 0; a.stashRes = 0; a.ammo = 1;
  a.input.reload = true; for (let i = 0; i < 60 * 3; i++) m.step(1 / 60); assert.ok(a.ammo > 1, 'the sidearm reloads from nothing too');
  m.kill(f[0], a); assert.equal(a.endless, false); assert.equal(a.streak, 0);
  const [m2, b, g] = world(); streakTo(m2, b, g, 4); m2.startRound(); assert.equal(b.endless, false);
});

test('the sixth kill restores health and grenades (never past one more than the loadout), the fifth is still the speed boost', () => {
  const [m, a, f] = world();
  streakTo(m, a, f, 5); assert.ok(a.boostT > 0);
  a.hp = 20; a.grenades = 0;
  streakTo(m, a, f, 1); assert.equal(a.hp, a.hpMax); assert.equal(a.grenades, 2); assert.ok(kinds(m).includes('resupply'));
  const [m2, b, g] = world(); streakTo(m2, b, g, 5); b.grenades = b.nadeCount + 2; streakTo(m2, b, g, 1);
  assert.ok(b.grenades <= b.nadeCount + 2);
});

test('the eighth kill drops a shell on each of the three nearest enemies; it lands after a warning and hurts them, not the shooter\'s team', () => {
  const [m, a, f] = world(4);
  const mate = m.addPlayer('mate', { name: 'M', team: 0 }); if (mate) Object.assign(mate, { x: f[0].x, y: f[0].y + 60, z: 0, alive: true, hp: 100 });
  streakTo(m, a, f, 7);
  const before = m.nades.length;
  m.events.length = 0; streakTo(m, a, f, 1);
  const shells = m.nades.slice(before);
  assert.equal(shells.length, 3); assert.ok(kinds(m).includes('mortar'));
  const near = f.slice(1).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 3);
  assert.equal(near.length, 3);
  for (const s of shells) assert.ok(near.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < 1), 'over one of the three nearest');
  for (const s of shells) assert.ok(s.z > 5, 'it starts above the ground');
  for (const q of f) { q.hp = 100; q.alive = true; }
  mate.hp = 100;
  for (let i = 0; i < 60 * 1; i++) m.step(1 / 60);
  assert.ok(near.every((q) => q.hp === 100), 'nobody is hurt before the shell lands and the fuse is out');
  const stay = near.map((q) => [q.x, q.y]); const hp0 = near.map((q) => q.hp);
  for (let i = 0; i < 60 * 3; i++) { near.forEach((q, k) => { q.x = stay[k][0]; q.y = stay[k][1]; }); m.step(1 / 60); }
  assert.ok(near.some((q) => !q.alive || q.hp < 100), 'a shell that lands on someone who stays hurts them');
  assert.equal(mate.hp, 100, 'the shooter\'s team is spared');
  assert.equal(m.nades.filter((n) => n.owner === 'a' && n.vz < 0 && n.z > 5).length, 0, 'the shells are gone');
});

test('the eighth kill with fewer enemies left drops fewer shells and never fails with none', () => {
  const [m, a, f] = world(1);
  streakTo(m, a, f, 7); const before = m.nades.length;
  f[0].alive = true; m.kill(a, f[0]);            // the only enemy is the victim: nobody left to aim at
  assert.equal(m.nades.length, before);
});

test('whole matches of bots: bottomless ammunition and shells come and go and nothing breaks', () => {
  for (const id of ['cargo', 'testsite']) {
    const m = new Match({ teams: T, perSide: 8, bots: true, map: id });
    m.startRound(); let got = new Set();
    for (let i = 0; i < 60 * 240; i++) { m.step(1 / 60); for (const e of m.events) if (e.type === 'streak') got.add(e.kind); for (const p of m.players.values()) assert.ok(p.ammo >= 0 && p.reserve >= 0 && Number.isFinite(p.hp)); }
    assert.ok(got.size >= 1, `${id}: ${[...got]}`);
  }
});

test('the seventh kill calls a supply crate: a warning at once, a premium gun lying there a few seconds later, for anyone to take, gone after 45 seconds', () => {
  const [m, a, f] = world();
  streakTo(m, a, f, 6); m.events.length = 0;
  streakTo(m, a, f, 1);
  const call = m.events.find((e) => e.type === 'crate');
  assert.ok(call && ['lmg', 'dmr', 'sniper', 'autosg', 'burst'].includes(call.w) && call.in > 3, 'the warning names the spot and the time');
  assert.ok(kinds(m).includes('crate'));
  assert.equal(m.pickups.list.filter((p) => p.crate).length, 0, 'nothing has landed yet');
  for (let i = 0; i < 60 * 2; i++) m.step(1 / 60); assert.equal(m.pickups.list.filter((p) => p.crate).length, 0, 'still falling');
  for (let i = 0; i < 60 * 2; i++) m.step(1 / 60);
  const c = m.pickups.list.find((p) => p.crate);
  assert.ok(c && c.weapon === call.w && Math.abs(c.x - call.x) <= 1 && Math.abs(c.y - call.y) <= 1, 'it landed where it was called');
  assert.equal(m.pickups.wire(c).c, 1, 'the page can tell a crate from a dropped gun');
  // the other team can take it too
  const thief = f[0]; Object.assign(thief, { x: c.x + 20, y: c.y, z: c.z, alive: true, hp: 100 }); thief.input.use = true; m.step(1 / 60);
  assert.equal(thief.primary, call.w); assert.equal(thief.ammo, thief.magSize); assert.ok(thief.reserve > 0);
  assert.ok(!m.pickups.list.some((p) => p.crate && p.weapon === call.w && p.x === c.x && p.id === c.id));
});

test('an untaken crate is gone after its time, and a new round clears a crate that has not landed', () => {
  const [m, a, f] = world();
  streakTo(m, a, f, 7); for (let i = 0; i < 60 * 4; i++) m.step(1 / 60);
  assert.equal(m.pickups.list.filter((p) => p.crate).length, 1);
  for (let i = 0; i < 60 * 46; i++) m.step(1 / 60); assert.equal(m.pickups.list.filter((p) => p.crate).length, 0);
  const [m2, b, g] = world(); streakTo(m2, b, g, 7); m2.startRound(); for (let i = 0; i < 60 * 5; i++) m2.step(1 / 60);
  assert.equal(m2.pickups.list.filter((p) => p.crate).length, 0);
});

test('a bot with nobody in sight heads for a landed crate and takes its gun', () => {
  const m = new Match({ teams: T, perSide: 1, bots: true, map: 'cargo' });
  m.map = { ...m.map, solids: [{ kind: 'wall', x: 3000, y: 0, w: 60, h: 4000, top: 5, walk: false }], ramps: [], _pickupSpots: undefined };
  m.startRound(); m.phase = 'live'; m.timer = 600; m.pickups.list = []; m.pickups.timers = [];
  const bot = [...m.players.values()].find((p) => p.bot && p.team === 0), foe = [...m.players.values()].find((p) => p.team === 1);
  Object.assign(bot, { x: 800, y: 2000, z: 0 }); Object.assign(foe, { x: 9000, y: 2000, z: 0 });
  m.pickups.drops.push({ t: 0.01, x: 800, y: 2600, z: 0, weapon: 'lmg' });
  for (let i = 0; i < 60 * 14 && bot.primary !== 'lmg'; i++) { foe.x = 9000; foe.y = 2000; foe.hp = foe.hpMax; m.step(1 / 60); }
  assert.equal(bot.primary, 'lmg');
});
