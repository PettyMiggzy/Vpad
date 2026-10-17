// One match room. The rules stay in game.js; this file only checks what a client is allowed to say and how often the
// result of those rules is sent out. A client never supplies a loadout, a position, or another player's id.
import { Room } from 'colyseus';
import { Match, cleanName, cleanColor } from './game.js';
import { REWARD } from './items.js';
import { loadoutFor, award, grantXp, validPid } from './profiles.js';
import { XP } from './progress.js';

export const MAP_IDS = ['cargo', 'dust', 'refinery'];
export const MAX_ROOMS = 32;
export const INPUT_RATE = 60;
export const SIM_HZ = 30;
const STEP = 1 / SIM_HZ;
const PITCH = 1.4;
const NUM_KEYS = ['dx', 'dy', 'aim', 'pitch'];
const BOOL_KEYS = ['fire', 'nade', 'reload', 'sprint', 'jump', 'melee', 'swap'];
const INPUT_KEYS = [...NUM_KEYS, ...BOOL_KEYS];

export const liveRooms = new Set();
const seated = new Map(); // profile id -> session id, so one id cannot sit in two places

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** turn whatever the client asked for into the only options a match will accept */
export function roomOptions(options = {}) {
  const names = Array.isArray(options.names) ? options.names.slice(0, 2).map(cleanName) : [];
  const map = MAP_IDS.includes(options.map) ? options.map : 'cargo';
  let perSide = Number(options.perSide);
  if (!Number.isFinite(perSide)) perSide = 8;
  perSide = clamp(Math.round(perSide), 1, 32);
  const mode = options.mode === 'challenge' ? 'challenge' : 'practice';
  let difficulty = Number(options.difficulty);
  if (!Number.isFinite(difficulty)) difficulty = 1;
  else difficulty = clamp(Math.round(difficulty), 0, 2);
  const objective = options.objective === 'zone' ? 'zone' : 'elim';
  const colors = Array.isArray(options.colors) ? options.colors : [];
  const teams = [
    { name: names[0] || 'BLUE', color: Number.isInteger(colors[0]) ? cleanColor(colors[0]) : 0x2f7bff },
    { name: names[1] || 'RED', color: Number.isInteger(colors[1]) ? cleanColor(colors[1]) : 0xff3b30 },
  ];
  return { teams, map, perSide, mode, difficulty, objective, bots: true };
}

function wrapAim(a) {
  const t = Math.PI * 2;
  let x = a % t;
  if (x > Math.PI) x -= t;
  if (x < -Math.PI) x += t;
  return x;
}

/** a plain input object with every field in range, or null when the message is not one */
export function readInput(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const proto = Object.getPrototypeOf(m);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(m);
  if (keys.length > INPUT_KEYS.length) return null;
  for (const k of keys) {
    if (!INPUT_KEYS.includes(k)) return null;
    const v = m[k];
    if (NUM_KEYS.includes(k)) { if (typeof v !== 'number' || !Number.isFinite(v)) return null; }
    else if (typeof v !== 'boolean') return null;
  }
  const num = (k) => (typeof m[k] === 'number' ? m[k] : null);
  const aim = num('aim'), pitch = num('pitch');
  return {
    dx: clamp(num('dx') ?? 0, -1, 1),
    dy: clamp(num('dy') ?? 0, -1, 1),
    aim: aim === null ? null : wrapAim(aim),
    pitch: pitch === null ? null : clamp(pitch, -PITCH, PITCH),
    fire: m.fire === true, nade: m.nade === true, reload: m.reload === true, sprint: m.sprint === true,
    jump: m.jump === true, melee: m.melee === true, swap: m.swap === true,
  };
}

function allowInput(client, now) {
  const q = client._in || (client._in = []);
  const cut = now - 1000;
  let i = 0;
  while (i < q.length && q[i] <= cut) i += 1;
  if (i) q.splice(0, i);
  if (q.length >= INPUT_RATE) return false;
  q.push(now);
  return true;
}

function zeroInput(p) {
  const i = p.input;
  i.dx = 0; i.dy = 0; i.fire = false; i.nade = false; i.reload = false;
  i.sprint = false; i.jump = false; i.melee = false; i.swap = false;
}

export function openSeats(match) {
  return match.perSide * 2 - match.humans(0) - match.humans(1);
}

export function roomSummary(room) {
  const m = room.match;
  return { id: room.roomId || null, names: m.teams.map((t) => t.name), map: m.map.id, mode: m.mode, seats: openSeats(m) };
}

export class MatchRoom extends Room {
  maxClients = 64;
  autoDispose = true;

  async onCreate(options = {}) {
    if (liveRooms.size >= MAX_ROOMS) throw new Error('the server is full');
    const opt = roomOptions(options);
    this.maxClients = opt.perSide * 2;
    this.match = new Match(opt);
    this.pids = new Map();
    this.lockedLoadout = new Map(); // the gear a profile brought in; buying during the match cannot change it
    this.tick = 0;
    this.reported = false;
    this.pending = [];
    this.lastRv = this.match.rv;
    liveRooms.add(this);
    if (this._listing) {
      try {
        await this.setMetadata({
          a: opt.teams[0].name, b: opt.teams[1].name, map: opt.map, mode: opt.mode,
          objective: opt.objective, perSide: opt.perSide, difficulty: opt.difficulty,
        });
      } catch { /* the listing is filled in by the matchmaker when this room was not opened through it */ }
    }
    this.onMessage('input', (client, m) => this.takeInput(client, m));
    // the rules step 30 times a second; a snapshot goes out on 20 of those steps, and the steps in between keep their events
    this.setSimulationInterval(() => this.tickMatch(), 1000 / SIM_HZ);
  }

  takeInput(client, m, now = Date.now()) {
    const p = this.match.players.get(client.sessionId);
    if (!p || p.bot || !p.alive || this.match.phase === 'finished') return;
    if (!allowInput(client, now)) return;
    const inp = readInput(m);
    if (!inp) return;
    p.input = {
      dx: inp.dx, dy: inp.dy,
      aim: inp.aim === null ? p.input.aim : inp.aim,
      pitch: inp.pitch === null ? p.input.pitch : inp.pitch,
      fire: inp.fire, nade: inp.nade, reload: inp.reload, sprint: inp.sprint, jump: inp.jump, melee: inp.melee, swap: inp.swap,
    };
  }

  tickMatch() {
    const before = this.match.phase;
    this.match.step(STEP);
    for (const p of this.match.players.values()) if (!p.bot && !p.alive) zeroInput(p);
    for (const e of this.match.events) {
      this.pending.push(e);
      this.reward(e);
      if (e.type === 'match' && this.match.mode === 'challenge' && !this.reported) {
        this.reported = true;
        this.reportResult();
      }
    }
    this.tick += 1;
    if (this.match.rv !== this.lastRv) {
      this.lastRv = this.match.rv;
      this.broadcast('roster', this.match.roster());
    }
    if (this.tick % 3 !== 0 || this.match.phase !== before) this.sendSnap();
    if (this.match.phase === 'finished' && !this.didLock) { this.didLock = true; this.lock().catch(() => {}); }
  }

  sendSnap() {
    const snap = this.match.snapshot();
    snap.ev = this.pending.slice();
    this.pending.length = 0;
    this.broadcast('snap', snap);
  }

  onJoin(client, options = {}) {
    const pid = validPid(options.pid) ? options.pid : null;
    if (pid && seated.has(pid)) { client.leave(4002, 'that player is already in a match'); return; }
    const team = options.team === 0 || options.team === 1 ? options.team : undefined;
    let loadout;
    if (pid) {
      if (!this.lockedLoadout.has(pid)) this.lockedLoadout.set(pid, loadoutFor(pid));
      loadout = this.lockedLoadout.get(pid);
    }
    const p = this.match.addPlayer(client.sessionId, { name: options.name, team, loadout });
    if (!p) { client.leave(4001, 'that match is full'); return; }
    if (pid) { seated.set(pid, client.sessionId); this.pids.set(client.sessionId, pid); }
    client.send('hello', {
      id: p.id, team: p.team, teams: this.match.teams, perSide: this.match.perSide, roster: this.match.roster(),
      map: this.match.map.id, mode: this.match.mode, objective: this.match.objective, difficulty: this.match.difficulty, spd: p.speedMul,
    });
    this.broadcast('roster', this.match.roster());
    this.lastRv = this.match.rv;
  }

  onLeave(client) {
    const pid = this.pids.get(client.sessionId);
    if (pid && seated.get(pid) === client.sessionId) seated.delete(pid);
    this.pids.delete(client.sessionId);
    if (this.match?.players.has(client.sessionId)) {
      this.match.removePlayer(client.sessionId);
      this.broadcast('roster', this.match.roster());
      this.lastRv = this.match.rv;
    }
  }

  onDispose() {
    liveRooms.delete(this);
    for (const [sid, pid] of this.pids || []) if (seated.get(pid) === sid) seated.delete(pid);
    this.pids?.clear();
  }

  /** coins and experience for the humans who earned them; a bot never has a profile */
  reward(e) {
    const m = this.match;
    if (e.type === 'kill') {
      const pid = this.pids.get(e.by);
      if (pid && e.by !== e.victim) {
        award(pid, REWARD.kill);
        grantXp(pid, XP.kill + (e.head ? XP.head : 0) + (e.melee ? XP.melee : 0) + (e.nade ? XP.nade : 0), e.nade || e.melee ? null : e.weapon);
      }
    }
    const team = e.type === 'roundEnd' ? e.winner : e.type === 'match' ? e.winner : null;
    if ((e.type === 'roundEnd' || e.type === 'match') && (team === 0 || team === 1)) {
      for (const [sid, pid] of this.pids) if (m.players.get(sid)?.team === team) {
        award(pid, e.type === 'match' ? REWARD.match : REWARD.round);
        grantXp(pid, e.type === 'match' ? XP.match : XP.round);
      }
    }
  }

  /** the one place a result leaves the server: logged until a rules engine is connected. Practice never calls this. */
  reportResult() {
    const m = this.match;
    console.log('MATCH RESULT', JSON.stringify({ winner: m.teams[m.winner]?.name, score: m.score, rounds: m.round }));
  }
}
