// The page's side of the match server. connect() joins a room and returns a small handle. Other soldiers are drawn a tenth of a
// second behind the snapshots, so a late packet has something to blend with. The local soldier is stepped with the same movement
// the server uses (tryMove, floorAt) and eased back when a snapshot disagrees.
import { tryMove, floorAt, MAPS, R } from '../../server/game.js';
import { WEAPONS } from '../../server/items.js';

export const INTERP_MS = 100;
export const SNAP_POS = 80;
export const SNAP_Z = 1.5;
const SEND_MS = 1000 / 60;
const STEP = 1 / 30;
const PITCH = 1.4;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const raf = (fn) => (globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(fn) : setTimeout(() => fn(performance.now()), 16));
const caf = (id) => (globalThis.cancelAnimationFrame ? globalThis.cancelAnimationFrame(id) : clearTimeout(id));

export function lerpAngle(a, b, u) {
  let d = b - a;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * u;
}

/** one step of the same movement the match runs: speed, sprint, jump, then the floor */
export function stepLocal(s, inp, dt, live) {
  let dx = clamp(Number(inp.dx) || 0, -1, 1);
  let dy = clamp(Number(inp.dy) || 0, -1, 1);
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  const w = WEAPONS[s.weapon] || WEAPONS.pistol;
  const sp = R.SPEED * (s.speedMul || 1) * (w.move ?? 1) * ((inp.sprint && len > 0.3) ? 1.32 : 1) * (s.boost ? 1.22 : 1);
  const [nx, ny] = tryMove(s.map, s.x, s.y, s.z, s.x + dx * sp * dt, s.y + dy * sp * dt);
  const f = floorAt(s.map, nx, ny);
  let z = s.z, vz = s.vz || 0, air = !!s.air;
  if (live && inp.jump && !air && z <= f + 0.03) { air = true; vz = R.JUMP; }
  if (air) {
    vz -= R.GRAV * dt;
    z += vz * dt;
    if (vz <= 0 && z <= f) { z = f; vz = 0; air = false; }
  } else z = f >= z ? f : Math.max(f, z - R.FALL * dt);
  return {
    ...s, x: nx, y: ny, z, vz, air,
    aim: Number.isFinite(inp.aim) ? inp.aim : s.aim,
    pitch: Number.isFinite(inp.pitch) ? clamp(inp.pitch, -PITCH, PITCH) : s.pitch,
  };
}

function advance(s, inp, dt, live) {
  let left = dt;
  let cur = s;
  while (left > 1e-6) {
    const h = Math.min(STEP, left);
    cur = stepLocal(cur, inp, h, live);
    left -= h;
  }
  return cur;
}

/** where a remote soldier was at time t, between the two snapshots around it */
export function sampleTrack(history, t) {
  if (!history.length) return null;
  if (t <= history[0].t) return history[0];
  const last = history[history.length - 1];
  if (t >= last.t) return last;
  let lo = 0, hi = history.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = history[lo], b = history[hi];
  const u = (t - a.t) / (b.t - a.t || 1);
  return {
    x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u,
    aim: lerpAngle(a.aim, b.aim, u), pitch: a.pitch + (b.pitch - a.pitch) * u,
  };
}

/** keep the picture where it was and let it catch the server; a long way off, just take the server */
export function reconcile(pred, next, offset) {
  if (!pred) return { pred: next, offset: { x: 0, y: 0, z: 0 }, snapped: true };
  const dist = Math.hypot(next.x - pred.x, next.y - pred.y);
  if (dist > SNAP_POS || Math.abs(next.z - pred.z) > SNAP_Z) return { pred: next, offset: { x: 0, y: 0, z: 0 }, snapped: true };
  return {
    pred: next,
    offset: { x: offset.x + pred.x - next.x, y: offset.y + pred.y - next.y, z: offset.z + pred.z - next.z },
    snapped: false,
  };
}

export function decayOffset(offset, dt) {
  const k = Math.exp(-dt * 10);
  return { x: offset.x * k, y: offset.y * k, z: offset.z * k };
}

function blankInput() {
  return { dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, nade: false, reload: false, sprint: false, jump: false, melee: false, swap: false };
}

function cleanInput(m) {
  const src = m && typeof m === 'object' ? m : {};
  const n = (k) => (typeof src[k] === 'number' && Number.isFinite(src[k]) ? src[k] : 0);
  let aim = n('aim');
  const turn = Math.PI * 2;
  aim %= turn;
  if (aim > Math.PI) aim -= turn;
  if (aim < -Math.PI) aim += turn;
  return {
    dx: clamp(n('dx'), -1, 1), dy: clamp(n('dy'), -1, 1), aim, pitch: clamp(n('pitch'), -PITCH, PITCH),
    fire: src.fire === true, nade: src.nade === true, reload: src.reload === true, sprint: src.sprint === true,
    jump: src.jump === true, melee: src.melee === true, swap: src.swap === true,
  };
}

/**
 * Join the match server at `url` (ws:// or wss://). opts: { pid, name, team, names, map, perSide, mode, difficulty, objective, colors, roomId }.
 * The handle is { send(input), onSnapshot(cb), onEvent(cb), onRoster(cb), leave() }.
 * onSnapshot receives the same shape as Match.snapshot(), with soldiers already placed for this frame.
 */
export async function connect(url, opts = {}) {
  const { Client } = await import('@colyseus/sdk');
  const names = Array.isArray(opts.names) ? opts.names : ['BLUE', 'RED'];
  const options = {
    pid: opts.pid, name: opts.name, team: opts.team, names, colors: opts.colors,
    a: opts.a ?? names[0], b: opts.b ?? names[1],
    map: opts.map ?? 'cargo', perSide: opts.perSide ?? 8, mode: opts.mode ?? 'practice',
    difficulty: opts.difficulty ?? 1, objective: opts.objective ?? 'elim',
  };
  const client = new Client(url);
  const room = opts.roomId ? await client.joinById(opts.roomId, options) : await client.joinOrCreate('match', options);

  let myId = null;
  let speedMul = 1;
  let latest = null;
  let pred = null;
  let offset = { x: 0, y: 0, z: 0 };
  let lastInput = blankInput();
  let lastSent = 0;
  let pendingSend = false;
  let snapCb = null, eventCb = null, rosterCb = null;
  const tracks = new Map();
  const log = [];
  let lastFrame = performance.now();
  let stopped = false;
  let rtt = 100;
  let nextPing = 0;
  const samplePing = () => {
    if (stopped) return;
    try { room.ping((ms) => { if (Number.isFinite(ms) && ms >= 0) rtt = ms; }); } catch { /* the socket is not open */ }
  };

  const inputAt = (t) => {
    let cur = lastInput;
    for (let i = log.length - 1; i >= 0; i--) if (log[i].t <= t) { cur = log[i].input; break; }
    return cur;
  };

  const fromRow = (row, map) => ({
    x: row[2], y: row[3], z: row[9], aim: row[4], pitch: row[10], weapon: row[15] || 'pistol',
    boost: row[16] === 1, alive: row[6] === 1, speedMul, map, vz: pred?.vz || 0, air: !!pred?.air,
  });

  const replay = (base, from, to, live) => {
    let s = base;
    let t = from;
    let active = inputAt(from);
    for (const mark of log) {
      if (mark.t <= from || mark.t > to) continue;
      const dt = (mark.t - t) / 1000;
      if (dt > 0 && s.alive) s = advance(s, active, dt, live);
      active = mark.input;
      t = mark.t;
    }
    const dt = (to - t) / 1000;
    if (dt > 0 && s.alive) s = advance(s, active, dt, live);
    return s;
  };

  const remember = (row, at) => {
    const list = tracks.get(row[0]) || [];
    list.push({ t: at, x: row[2], y: row[3], z: row[9], aim: row[4], pitch: row[10] });
    const cut = at - 400;
    while (list.length > 2 && list[0].t < cut) list.shift();
    tracks.set(row[0], list);
  };

  const place = (now) => {
    if (!latest) return null;
    const when = now - INTERP_MS;
    const p = latest.p.map((row) => {
      const out = row.slice();
      if (row[0] === myId && pred) {
        out[2] = Math.round(pred.x + offset.x);
        out[3] = Math.round(pred.y + offset.y);
        out[9] = +((pred.z + offset.z).toFixed(2));
        out[4] = +lastInput.aim.toFixed(2);
        out[10] = +lastInput.pitch.toFixed(2);
        return out;
      }
      const s = sampleTrack(tracks.get(row[0]) || [], when);
      if (!s) return out;
      out[2] = Math.round(s.x); out[3] = Math.round(s.y); out[9] = +s.z.toFixed(2);
      out[4] = +s.aim.toFixed(2); out[10] = +s.pitch.toFixed(2);
      return out;
    });
    return { ...latest, p, ev: [] };
  };

  room.onMessage('hello', (m) => {
    myId = m.id;
    if (Number.isFinite(m.spd)) speedMul = m.spd;
    if (m.roster && rosterCb) rosterCb(m.roster);
  });
  room.onMessage('roster', (list) => { if (rosterCb) rosterCb(list); });
  room.onMessage('snap', (s) => {
    const at = performance.now();
    latest = s;
    const map = MAPS[s.map] || MAPS.cargo;
    for (const row of s.p) remember(row, at);
    for (const e of s.ev || []) if (eventCb) eventCb(e);
    const me = s.p.find((row) => row[0] === myId);
    if (!me) return;
    const oneWay = Math.min(200, rtt / 2);
    const base = fromRow(me, map);
    const floor = floorAt(map, base.x, base.y);
    if (!pred || Math.abs(base.z - floor) < 0.08) { base.vz = 0; base.air = false; }
    const next = me[6] === 1 ? replay(base, at - oneWay, at, s.ph === 'live') : base;
    const fix = reconcile(pred, next, offset);
    pred = fix.pred;
    offset = fix.offset;
  });

  const frame = (now) => {
    if (stopped) return;
    loopId = raf(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (pred && latest && (latest.ph === 'live' || latest.ph === 'countdown')) {
      const me = latest.p.find((row) => row[0] === myId);
      if (me && me[6] === 1) {
        pred.weapon = me[15] || pred.weapon;
        pred.boost = me[16] === 1;
        pred = stepLocal(pred, lastInput, dt, latest.ph === 'live');
      }
    }
    offset = decayOffset(offset, dt);
    if (now >= nextPing) { nextPing = now + 2000; samplePing(); }
    if (pendingSend && now - lastSent >= SEND_MS) {
      pendingSend = false;
      lastSent = now;
      room.send('input', lastInput);
    }
    if (latest && snapCb) snapCb(place(now));
    const cut = now - 1000;
    while (log.length && log[0].t < cut) log.shift();
  };
  let loopId = raf(frame);

  return {
    send(input) {
      lastInput = cleanInput(input);
      log.push({ t: performance.now(), input: lastInput });
      pendingSend = true;
    },
    onSnapshot(cb) { snapCb = cb; },
    onEvent(cb) { eventCb = cb; },
    onRoster(cb) { rosterCb = cb; },
    leave() {
      stopped = true;
      caf(loopId);
      return room.leave();
    },
  };
}
