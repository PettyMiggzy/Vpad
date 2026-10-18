// Lag compensation and the slim snapshots. Each case fails if a shot is judged only where people are now,
// or if every snapshot still carries every soldier at full precision.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ARENA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-lag-'));
const { MatchRoom } = await import('./room.js');
const { raySolids, R } = await import('./game.js');

const STEP = 1 / 30;
const PAD_MS = 100;
const CAP_MS = 250;
const SX = 400, SY = 240, TX = 900, Y0 = 240, DY = 12;
const STILL = { dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, nade: false, reload: false, sprint: false, jump: false, melee: false, swap: false };

const rewindSec = (rttMs) => Math.min(CAP_MS, Math.max(0, rttMs) + PAD_MS) / 1000;
const yAt = (i) => Y0 + (i - 1) * DY;

function lerpAt(samples, t, key) {
  if (t <= samples[0].t) return samples[0][key];
  const last = samples[samples.length - 1];
  if (t >= last.t) return last[key];
  let lo = 0, hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const u = (t - a.t) / (b.t - a.t || 1);
  return a[key] + (b[key] - a[key]) * u;
}

let n = 0;
const fake = () => ({
  sessionId: `L${++n}`,
  sent: [],
  left: null,
  send(type, msg) { this.sent.push([type, msg]); },
  leave(code, reason) { this.left = { code, reason }; },
});

async function harness() {
  const room = new MatchRoom();
  const handlers = {};
  const snaps = [];
  room.onMessage = (type, fn) => { handlers[type] = fn; };
  room.broadcast = (type, msg) => { if (type === 'snap') snaps.push(msg); };
  room.setSimulationInterval = (fn) => { room._sim = fn; };
  await room.onCreate({ names: ['BLUE', 'RED'], map: 'cargo', perSide: 1, mode: 'practice', difficulty: 1, objective: 'elim' });
  // an empty floor of the same size: these cases are about time, not about the layout of any one map
  room.match.map = { ...room.match.map, solids: [], ramps: [] };
  return {
    room, handlers, snaps,
    async join(team, name) {
      const c = fake();
      await room.onJoin(c, { name, team });
      return c;
    },
    stop() {
      if (room._simulationInterval) clearInterval(room._simulationInterval);
      try { room.onDispose?.(); } catch { /* not attached to the matchmaker */ }
    },
  };
}

function park(p, x, y) {
  p.x = x; p.y = y; p.z = 0; p.vz = 0; p.air = false; p.alive = true; p.hp = p.hpMax;
  p.input = { ...STILL, aim: p.aim, pitch: 0 };
}

/** walk a straight line into the history, one sample a tick, and remember where each sample was */
function track(h, shooter, target, ticks) {
  const m = h.room.match;
  m.phase = 'live'; m.timer = 90;
  const samples = [];
  for (let i = 1; i <= ticks; i++) {
    park(shooter, SX, SY);
    park(target, TX, yAt(i));
    h.room._sim();
    samples.push({ t: i * STEP, x: TX, y: yAt(i) });
  }
  return samples;
}

function setRtt(room, id, ms) {
  if (room.rtt) room.rtt.set(id, ms);
}

function shootAt(h, client, shooter, x, y) {
  shooter.spreadMul = 0; shooter.cd = 0; shooter.ammo = 12; shooter.rl = 0;
  shooter.rc.p = 0; shooter.rc.y = 0; shooter.rc.n = 0; shooter.rc.bloom = 0; // the kick of an earlier shot must not move this one
  shooter.meleeCd = 0; shooter.swapT = 0; shooter.alive = true; shooter.hp = shooter.hpMax;
  const aim = Math.atan2(y - SY, x - SX);
  park(shooter, SX, SY);
  h.handlers.input(client, { ...STILL, aim, pitch: 0, fire: true });
  h.room._sim();
}

async function pair() {
  const h = await harness();
  const a = await h.join(0, 'Ann');
  const b = await h.join(1, 'Bob');
  const shooter = h.room.match.players.get(a.sessionId);
  const target = h.room.match.players.get(b.sessionId);
  shooter.spreadMul = 0;
  target.spreadMul = 0;
  return { h, a, shooter, target };
}

test('a moving target is hit where the shooter still sees them', async () => {
  const { h, a, shooter, target } = await pair();
  try {
    const ticks = 18;
    const samples = track(h, shooter, target, ticks);
    setRtt(h.room, shooter.id, 0);
    const when = (ticks + 1) * STEP - rewindSec(0);
    const y = lerpAt(samples, when, 'y');
    const before = target.hp;
    park(target, TX, y + 40);
    shootAt(h, a, shooter, TX, y);
    assert.ok(target.hp < before, `shot at the position from ${PAD_MS}ms ago missed, hp ${target.hp}`);
    assert.ok(Math.abs(target.y - (y + 40)) < 1, 'the hit left the target standing where they used to be');
  } finally { h.stop(); }
});

test('the look-back never goes past a quarter of a second', async () => {
  const { h, a, shooter, target } = await pair();
  try {
    const ticks = 18;
    const samples = track(h, shooter, target, ticks);
    const rtt = 5000;
    setRtt(h.room, shooter.id, rtt);
    const shotAt = (ticks + 1) * STEP;
    const tooOld = lerpAt(samples, shotAt - 0.4, 'y');
    const capped = lerpAt(samples, shotAt + STEP - CAP_MS / 1000, 'y');
    assert.ok(Math.abs(capped - tooOld) > R.RADIUS + 3, 'the two positions are too close to tell apart');

    park(target, TX, capped + 50);
    const healthy = target.hp;
    shootAt(h, a, shooter, TX, tooOld);
    assert.equal(target.hp, healthy, 'a long round trip was allowed to hit a position older than the cap');

    park(target, TX, capped + 50);
    target.hp = target.hpMax;
    shootAt(h, a, shooter, TX, capped);
    assert.ok(target.hp < target.hpMax, `the position at the ${CAP_MS}ms cap was a miss, hp ${target.hp}`);
  } finally { h.stop(); }
});

test('a lagging client cannot shoot through a wall that is shut now', async () => {
  const { h, a, shooter, target } = await pair();
  const wall = { kind: 'shut', x: 620, y: 0, w: 30, h: 900, top: 4, walk: false };
  try {
    const ticks = 18;
    const samples = track(h, shooter, target, ticks);
    setRtt(h.room, shooter.id, 400);
    const when = (ticks + 1) * STEP - rewindSec(400);
    const y = lerpAt(samples, when, 'y');
    park(target, TX, y + 40);
    const open = target.hp;
    shootAt(h, a, shooter, TX, y);
    assert.ok(target.hp < open, 'the same shot in the open should land, so the wall check below is about the wall');

    h.room.match.map.solids.push(wall);
    const eye = (shooter.z || 0) + R.EYE;
    const dist = Math.hypot(TX - SX, y - SY);
    const blocked = raySolids(h.room.match.map, SX, SY, eye, (TX - SX) / dist, (y - SY) / dist, 0, dist);
    assert.ok(blocked < dist - 5, 'the shut wall does not stand on the shot');

    park(target, TX, y + 40);
    target.hp = target.hpMax;
    shootAt(h, a, shooter, TX, y);
    assert.equal(target.hp, target.hpMax, 'the shot went through a wall that is shut now');
  } finally {
    h.stop();
  }
});

test('snapshots quantise positions and leave out soldiers who have not moved', async () => {
  const h = await harness();
  try {
    const a = await h.join(0, 'Ann');
    const b = await h.join(1, 'Bob');
    const pa = h.room.match.players.get(a.sessionId);
    const pb = h.room.match.players.get(b.sessionId);
    h.room.match.phase = 'live'; h.room.match.timer = 90;
    park(pa, 401, 240); park(pb, 900, 240);
    h.snaps.length = 0;
    h.room._sim();
    h.room._sim();
    assert.ok(h.snaps.length >= 2, `snaps ${h.snaps.length}`);
    const first = h.snaps[0], second = h.snaps[1];
    assert.ok(first.p.length >= 2, 'the first snapshot has the soldiers');
    assert.ok(second.p.length < first.p.length, `unchanged soldiers were sent again (${second.p.length})`);
    const row = first.p.find((r) => r[0] === pa.id);
    assert.ok(row, 'shooter missing from the first snapshot');
    assert.equal(row[2] % 2, 0, `x was not quantised (${row[2]})`);
    assert.notEqual(row[2], 401);

    park(pa, 460, 240);
    h.snaps.length = 0;
    h.room._sim();
    h.room._sim();
    h.room._sim();
    const moved = h.snaps.flatMap((s) => s.p).find((r) => r[0] === pa.id);
    assert.ok(moved, 'a soldier who moved was left out');
    assert.equal(moved[2] % 2, 0);
  } finally { h.stop(); }
});
