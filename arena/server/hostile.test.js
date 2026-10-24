// Cheats and bad room options, exercised against the match room. Each case here failed on the unchecked server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ARENA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-hostile-'));
const { listen, close, MatchRoom } = await import('./index.js');
const { buy, equip, grantXp } = await import('./profiles.js');
const { xpForLevel } = await import('./progress.js');

const port = await listen(0);
test.after(async () => { await close(); });

let n = 0;
const fake = () => ({
  sessionId: `s${++n}`,
  sent: [],
  left: null,
  send(type, msg) { this.sent.push([type, msg]); },
  leave(code, reason) { this.left = { code, reason }; },
});

async function harness(options = {}) {
  const room = new MatchRoom();
  const handlers = {};
  const snaps = [];
  room.onMessage = (type, fn) => { handlers[type] = fn; };
  room.broadcast = (type, msg) => { if (type === 'snap') snaps.push(msg); };
  room.setSimulationInterval = (fn) => { room._sim = fn; };
  await room.onCreate({ names: ['BLUE', 'RED'], map: 'cargo', perSide: 4, mode: 'practice', difficulty: 1, objective: 'elim', ...options });
  return {
    room, handlers, snaps,
    async join(opts = {}) {
      const c = fake();
      await room.onJoin(c, { name: 'Player', team: 0, ...opts });
      return c;
    },
    stop() {
      if (room._simulationInterval) clearInterval(room._simulationInterval);
      try { room.onDispose?.(); } catch { /* not attached to the matchmaker */ }
    },
  };
}

const still = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, nade: false, reload: false, sprint: false, jump: false, melee: false, swap: false };

async function livePair(options) {
  const h = await harness({ perSide: 1, bots: false, ...options });
  const a = await h.join({ name: 'Ann', team: 0 });
  const b = await h.join({ name: 'Bob', team: 1 });
  h.room.match.phase = 'live';
  h.room.match.timer = 90;
  return { h, a, b };
}

test('room options are clamped: map, seats, mode, difficulty, objective, and bots stay on', async () => {
  const h = await harness({ map: 'moon', perSide: 0, mode: 'ranked', difficulty: 9, objective: 'zone', bots: false, names: ['<FROG>', 'x'.repeat(40)] });
  assert.equal(h.room.match.map.id, 'cargo');
  assert.equal(h.room.match.perSide, 1);
  assert.equal(h.room.match.mode, 'practice');
  assert.equal(h.room.match.difficulty, 2);
  assert.equal(h.room.match.objective, 'zone');
  assert.equal(h.room.match.useBots, true);
  assert.equal(h.room.match.teams[0].name, 'FROG');
  assert.equal(h.room.match.teams[1].name, 'x'.repeat(12));
  const low = await harness({ difficulty: -5, perSide: 1.6 });
  assert.equal(low.room.match.difficulty, 0);
  assert.equal(low.room.match.perSide, 2);
  const wide = await harness({ perSide: 100 });
  assert.equal(wide.room.match.perSide, 32);
  assert.equal(wide.room.maxClients, 64, 'the room seats at most 32 a side');
  assert.equal(h.room.maxClients, 2, 'and a one-a-side room seats two');
  h.stop(); low.stop(); wide.stop();
});

test('jump, sprint, melee and swap reach the rules', async () => {
  const { h, a } = await livePair();
  const p = h.room.match.players.get(a.sessionId);
  p.x = 100; p.y = 200; p.z = 0; p.air = false; p.vz = 0;
  h.handlers.input(a, { ...still, jump: true });
  h.room._sim();
  assert.ok(p.z > 0.05, `jump height ${p.z}`);

  const moved = (sprint) => {
    p.x = 100; p.y = 200; p.z = 0; p.air = false; p.vz = 0; p.alive = true;
    h.room.match.phase = 'live'; h.room.match.timer = 90;
    h.handlers.input(a, { ...still, dx: 1, sprint });
    const x0 = p.x;
    for (let i = 0; i < 20; i++) h.room._sim();
    return p.x - x0;
  };
  const walk = moved(false);
  const sprint = moved(true);
  assert.ok(sprint > walk * 1.2, `sprint ${sprint} walk ${walk}`);

  p.meleeCd = 0; p.alive = true;
  h.room.match.phase = 'live'; h.room.match.timer = 90;
  h.handlers.input(a, { ...still, melee: true });
  h.room._sim();
  assert.ok(p.meleeCd > 0, 'melee was ignored');
  h.stop();

  const pid = 'aabbccddeeff00112233445566778899';
  const h2 = await harness({ perSide: 1, bots: false });
  const gun = await h2.join({ name: 'Gun', team: 0, pid });
  await h2.join({ name: 'Other', team: 1 });
  const g = h2.room.match.players.get(gun.sessionId);
  assert.equal(g.weapon, 'rifle');
  h2.room.match.phase = 'live'; h2.room.match.timer = 90;
  h2.handlers.input(gun, { ...still, swap: true });
  h2.room._sim();
  assert.equal(g.weapon, 'pistol');
  h2.stop();
});

test('input is capped at about 60 messages a second', async () => {
  const h = await harness({ perSide: 1, bots: false });
  const c = await h.join({ name: 'Ann', team: 0 });
  const p = h.room.match.players.get(c.sessionId);
  for (let i = 1; i <= 100; i++) h.handlers.input(c, { ...still, aim: i / 100 });
  assert.equal(p.input.aim, 0.6);
  h.stop();
});

test('a huge or mistyped input is dropped, and aim is wrapped', async () => {
  const { h, a, b } = await livePair();
  const p = h.room.match.players.get(a.sessionId);
  const foe = h.room.match.players.get(b.sessionId);
  p.input.aim = 0;
  h.handlers.input(a, { dx: 'fast', aim: 0.4 });
  assert.equal(p.input.aim, 0, 'a string dx still applied the aim');

  p.x = 100; p.y = 200; p.z = 0;
  const x0 = p.x;
  h.handlers.input(a, { ...still, x: 3000, y: 3000, z: 9, dx: 1 });
  h.room._sim();
  assert.ok(Math.abs(p.x - x0) < 0.01, `moved to ${p.x}`);

  h.handlers.input(a, { ...still, aim: 0.33, pad: 'Z'.repeat(1500) });
  assert.notEqual(p.input.aim, 0.33);

  h.handlers.input(a, { ...still, aim: 1e9 });
  assert.ok(Math.abs(p.input.aim) <= Math.PI, p.input.aim);

  p.x = 200; p.y = 200; p.aim = 0; p.cd = 0; p.ammo = 12; p.alive = true;
  foe.x = 280; foe.y = 200; foe.alive = true; foe.team = 1;
  h.room.match.phase = 'live'; h.room.match.timer = 90;
  const ammo = p.ammo;
  h.handlers.input(a, { ...still, fire: 1, aim: 0 });
  h.room._sim();
  assert.equal(p.ammo, ammo, 'fire: 1 was treated as a trigger pull');
  h.stop();
});

test('dead and finished players cannot feed input', async () => {
  const { h, a } = await livePair();
  const p = h.room.match.players.get(a.sessionId);
  p.alive = false;
  p.input.aim = 0;
  p.input.fire = true;
  h.handlers.input(a, { ...still, aim: 1.25, dx: 1, fire: true });
  assert.equal(p.input.aim, 0);
  h.room._sim();
  assert.equal(p.input.fire, false, 'a held trigger survived death');

  p.alive = true;
  p.input.aim = 0;
  h.room.match.phase = 'finished';
  h.handlers.input(a, { ...still, aim: 0.8 });
  assert.equal(p.input.aim, 0);
  h.stop();
});

test('the same player id cannot sit twice, and can rejoin after leaving', async () => {
  const pid = 'abcdef0123456789abcdef0123456789';
  const h = await harness({ perSide: 2, bots: false });
  const a = await h.join({ pid, name: 'Ann', team: 0 });
  const b = await h.join({ pid, name: 'Bee', team: 1 });
  assert.ok(b.left, 'second connection with that id was seated');
  assert.equal([...h.room.match.players.values()].filter((p) => !p.bot).length, 1);
  h.room.onLeave(a);
  const c = await h.join({ pid, name: 'Ann', team: 1 });
  assert.equal(c.left, null);
  assert.equal(h.room.match.players.get(c.sessionId).team, 1);
  h.stop();
});

test('a practice match does not report a result; a challenge reports once', async () => {
  const count = async (mode) => {
    const h = await harness({ mode, perSide: 1, bots: false });
    await h.join({ name: 'Ann', team: 0 });
    const b = await h.join({ name: 'Bob', team: 1 });
    let n = 0;
    h.room.reportResult = () => { n += 1; };
    h.room.match.phase = 'live';
    h.room.match.timer = 30;
    h.room.match.score = [1, 0];
    h.room.match.players.get(b.sessionId).alive = false;
    h.room._sim();
    for (let i = 0; i < 5; i++) h.room._sim();
    h.stop();
    return n;
  };
  assert.equal(await count('practice'), 0);
  assert.equal(await count('challenge'), 1);
});

test('snapshots go out 20 times a sim-second and a skipped step still sends its events', async () => {
  const h = await harness({ perSide: 1, bots: false });
  const a = await h.join({ name: 'Ann', team: 0 });
  const b = await h.join({ name: 'Bob', team: 1 });
  h.room.match.phase = 'live';
  h.room.match.timer = 90;
  h.snaps.length = 0;
  for (let i = 0; i < 30; i++) h.room._sim();
  assert.equal(h.snaps.length, 20, `snaps ${h.snaps.length}`);

  h.snaps.length = 0;
  h.room._sim();
  h.room._sim();
  const p = h.room.match.players.get(a.sessionId);
  p.input.jump = true; p.air = false; p.vz = 0; p.z = 0; p.alive = true;
  h.room.match.players.get(b.sessionId).alive = true;
  h.room.match.phase = 'live'; h.room.match.timer = 90;
  h.room._sim();
  h.room._sim();
  assert.equal(h.snaps.length, 3, `event snaps ${h.snaps.length}`);
  assert.ok(h.snaps[h.snaps.length - 1].ev.some((e) => e.type === 'jump'), 'jump on the unsent step was dropped');
  h.stop();
});

test('GET /health and GET /rooms', async () => {
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const h = await harness({ names: ['FROG', 'APE'], map: 'dust', mode: 'challenge', perSide: 4, objective: 'elim' });
  await h.join({ name: 'Ann', team: 0 });
  const res = await fetch(`http://127.0.0.1:${port}/rooms`);
  assert.equal(res.status, 200);
  const list = await res.json();
  const row = list.find((x) => x.map === 'dust' && x.mode === 'challenge');
  assert.ok(row, JSON.stringify(list));
  assert.deepEqual(row.names, ['FROG', 'APE']);
  assert.equal(row.seats, 7);
  h.stop();
});

test('rejoining does not pick up a loadout bought during the match', async () => {
  const pid = '00112233445566778899aabbccddeeff';
  grantXp(pid, xpForLevel(3));
  const h = await harness({ perSide: 1, bots: false });
  const a = await h.join({ pid, name: 'Ann', team: 0 });
  assert.equal(h.room.match.players.get(a.sessionId).weapon, 'rifle');
  assert.ok(!equip(pid, 'sniper').error);
  h.room.onLeave(a);
  const b = await h.join({ pid, name: 'Ann', team: 0 });
  assert.equal(h.room.match.players.get(b.sessionId).weapon, 'rifle');
  h.stop();
});

test('the process refuses another room once it is full of them', async () => {
  const rooms = [];
  let refused = false;
  try {
    for (let i = 0; i < 40; i++) rooms.push(await harness({ names: [`R${i}`, 'Z'], perSide: 1 }));
  } catch {
    refused = true;
  }
  for (const h of rooms) h.stop();
  assert.equal(refused, true);
});

test('a practice room is private to its player; challenge rooms with the same teams are shared', async () => {
  const { Client } = await import('@colyseus/sdk');
  const client = new Client(`http://127.0.0.1:${port}`);
  const opts = (solo, pid) => ({ pid, name: 'x', names: ['AA', 'BB'], a: 'AA', b: 'BB', map: 'dust', perSide: 3, mode: 'practice', difficulty: 1, objective: 'elim', solo });
  const rooms = [];
  const join = async (solo, pid) => { const r = await client.joinOrCreate('match', opts(solo, pid)); r.onMessage('*', () => {}); rooms.push(r); return r; };
  const a = await join('a'.repeat(16), 'a'.repeat(16)), b = await join('b'.repeat(16), 'b'.repeat(16));
  const c = await join('shared', 'c'.repeat(16)), d = await join('shared', 'd'.repeat(16));
  assert.notEqual(a.roomId, b.roomId, 'two practice players landed in one room');
  assert.equal(c.roomId, d.roomId, 'two players with the same fixture did not meet');
  assert.ok(![a.roomId, b.roomId].includes(c.roomId));
  for (const r of rooms) await r.leave();
});
