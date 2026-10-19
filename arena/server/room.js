// One match room. The rules stay in game.js; this file only checks what a client is allowed to say and how often the
// result of those rules is sent out. A client never supplies a loadout, a position, or another player's id.
import { Room } from 'colyseus';
import { Match, cleanName, cleanColor } from './game.js';
import { MAP_IDS } from './maps.js';
import { REWARD } from './items.js';
import { loadoutFor, award, grantXp, validPid } from './profiles.js';
import { XP } from './progress.js';
import { History, rewindMs } from './lag.js';
import { slimSnap } from './snap.js';
import { plan, readVoice, VOICE } from './voice.js';

export { MAP_IDS };
export const MAX_ROOMS = Math.max(1, Number(process.env.MAX_ROOMS) || 12);
export const INPUT_RATE = 60;
export const SIM_HZ = 30;
const STEP = 1 / SIM_HZ;
const PITCH = 1.4;
const NUM_KEYS = ['dx', 'dy', 'aim', 'pitch'];
const BOOL_KEYS = ['fire', 'nade', 'reload', 'sprint', 'jump', 'melee', 'swap', 'use', 'ads'];
const INPUT_KEYS = [...NUM_KEYS, ...BOOL_KEYS];

export const liveRooms = new Set();
const seated = new Map(); // profile id -> session id, so one id cannot sit in two places

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** turn whatever the client asked for into the only options a match will accept */
export function roomOptions(options = {}) {
  const names = Array.isArray(options.names) ? options.names.slice(0, 2).map(cleanName) : [];
  let perSide = Number(options.perSide);
  if (!Number.isFinite(perSide)) perSide = 8;
  perSide = clamp(Math.round(perSide), 1, 32);
  let difficulty = Number(options.difficulty);
  if (!Number.isFinite(difficulty)) difficulty = 1;
  else difficulty = clamp(Math.round(difficulty), 0, 2);
  let objective = options.objective === 'zone' ? 'zone' : options.objective === 'dm' ? 'dm' : options.objective === 'train' ? 'train' : 'elim';
  let map = MAP_IDS.includes(options.map) ? options.map : 'cargo';
  if (map === 'training' || objective === 'train') { map = 'training'; objective = 'train'; }      // the training yard and its objective come together
  const mode = objective === 'train' ? 'train' : options.mode === 'challenge' ? 'challenge' : 'practice';
  const minutes = clamp(Math.round(Number(options.minutes)) || 5, 1, 30);
  const colors = Array.isArray(options.colors) ? options.colors : [];
  const teams = [
    { name: names[0] || 'BLUE', color: Number.isInteger(colors[0]) ? cleanColor(colors[0]) : 0x2f7bff },
    { name: names[1] || 'RED', color: Number.isInteger(colors[1]) ? cleanColor(colors[1]) : 0xff3b30 },
  ];
  return { teams, map, perSide, mode, difficulty, objective, minutes, bots: true, spar: objective === 'train' && options.spar === true };
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
    jump: m.jump === true, melee: m.melee === true, swap: m.swap === true, use: m.use === true, ads: m.ads === true,
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
  i.sprint = false; i.jump = false; i.melee = false; i.swap = false; i.use = false; i.ads = false;
}

export function openSeats(match) {
  return match.perSide * 2 - match.humans(0) - match.humans(1);
}

export function roomSummary(room) {
  const m = room.match;
  const humans = m.humans(0) + m.humans(1);
  return { id: room.roomId || null, names: m.teams.map((t) => t.name), map: m.map.id, mode: m.mode, seats: openSeats(m), humans, bots: m.players.size - humans, phase: m.phase, round: m.round, objective: m.objective, minutes: m.minutes, timer: Math.max(0, Math.ceil(m.timer)), score: m.score.slice() };
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
    this.simTime = 0;
    this.shotTime = 0;
    this.reported = false;
    this.pending = [];
    this.lastRv = this.match.rv;
    this.lag = new History();
    this.rtt = new Map();
    this.snapState = null;
    const shoot = this.match.shoot.bind(this.match);
    // rewind inside shoot(), before the ray test, then put everyone back so the rest of the step sees the present
    this.match.shoot = (p, w) => this.lag.rewind(this.match, p, this.shotTime - rewindMs(this.rtt.get(p.id) || 0) / 1000, shoot, w);
    liveRooms.add(this);
    if (this._listing) {
      try {
        await this.setMetadata({
          a: opt.teams[0].name, b: opt.teams[1].name, map: opt.map, mode: opt.mode,
          objective: opt.objective, minutes: opt.minutes, perSide: opt.perSide, difficulty: opt.difficulty, spar: opt.spar,
          solo: typeof options.solo === 'string' ? options.solo.slice(0, 64) : undefined,   // a practice room is filtered by its player's id, so only that player is let in
        });
      } catch { /* the listing is filled in by the matchmaker when this room was not opened through it */ }
    }
    this.onMessage('input', (client, m) => this.takeInput(client, m));
    this.onMessage('probe', (client, n) => this.takeProbe(client, n));
    this.sessions = new Map();       // client id -> client, for the voice messages
    this.voice = new Map();          // client id -> { on, mode, aud, fromKey }: who speaks and in which channel (the voice itself never passes through here)
    this.onMessage('v', (client, m) => this.takeVoice(client, m));
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
      fire: inp.fire, nade: inp.nade, reload: inp.reload, sprint: inp.sprint, jump: inp.jump, melee: inp.melee, swap: inp.swap, use: inp.use, ads: inp.ads,
    };
  }

  /** a voice setup message: a channel change, or a connection offer, answer or candidate for another player */
  takeVoice(client, m, now = Date.now()) {
    const p = this.match.players.get(client.sessionId);
    if (!p || p.bot) return;
    const q = client._vq || (client._vq = []);
    while (q.length && q[0] <= now - 1000) q.shift();
    if (q.length >= VOICE.sigRate) return;
    q.push(now);
    const v = readVoice(m);
    if (!v) return;
    if (v.t === 'mode') {
      const st = this.voice.get(client.sessionId) || { on: false, mode: 'near', aud: new Set(), fromKey: '' };
      st.on = v.on; st.mode = v.mode; this.voice.set(client.sessionId, st);
      this.voiceTick();
      return;
    }
    // a setup message goes only between a speaker and a listener the rules allow: an offer from the speaker to a listener in their audience,
    // an answer or a candidate in either direction between such a pair
    const to = this.sessions.get(v.to);
    if (!to || to.sessionId === client.sessionId) return;
    const ok = (s, l) => this.voice.get(s)?.aud?.has(l);
    const allowed = v.k === 'offer' ? ok(client.sessionId, v.to) : ok(client.sessionId, v.to) || ok(v.to, client.sessionId);
    if (!allowed) return;
    try { to.send('v', { t: 'sig', from: client.sessionId, k: v.k, d: v.d }); } catch { /* the socket is gone */ }
  }

  /** a look at who may hear whom; changes go out as messages (listeners first) */
  voiceTick() {
    if (!this.voice.size) return;
    for (const id of [...this.voice.keys()]) if (!this.match.players.has(id)) this.voice.delete(id);
    for (const { to, msg } of plan(this.match.players, this.voice)) {
      const c = this.sessions.get(to);
      if (c) try { c.send('v', msg); } catch { /* the socket is gone */ }
    }
  }

  takeProbe(client, n) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n !== client._probe) return;
    const dt = Date.now() - client._probeAt;
    client._probe = 0;
    if (dt >= 0 && dt <= 4000) this.rtt.set(client.sessionId, dt);
  }

  tickMatch() {
    const before = this.match.phase;
    this.shotTime = this.simTime + STEP;
    this.match.step(STEP);
    this.simTime = this.shotTime;
    this.lag.record(this.match, this.simTime);
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
    if (this.tick % 60 === 0) this.probe();
    if (this.tick % 15 === 0) this.voiceTick();
    if (this.match.phase === 'finished' && !this.didLock) { this.didLock = true; this.lock().catch(() => {}); }
  }

  sendSnap() {
    const snap = this.match.snapshot();
    snap.ev = this.pending.slice();
    this.pending.length = 0;
    const slim = slimSnap(this.snapState, snap);
    this.snapState = slim.state;
    this.broadcast('snap', slim.snap);
  }

  /** a full picture for one client, without clearing the events the next broadcast still owes */
  picture() {
    const snap = this.match.snapshot();
    snap.ev = [];
    const slim = slimSnap(null, snap);
    return slim.snap;
  }

  probe() {
    if (!this.clients) return;
    for (const c of this.clients) {
      c._probe = (c._probeN = (c._probeN || 0) + 1);
      c._probeAt = Date.now();
      try { c.send('probe', c._probe); } catch { /* already gone */ }
    }
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
    this.sessions.set(client.sessionId, client);
    this.voice.set(client.sessionId, { on: false, mode: 'near', aud: new Set(), fromKey: '' });       // listening needs no permission: everyone is on the list
    this.lag.note(p, this.simTime);
    client.send('hello', {
      id: p.id, team: p.team, teams: this.match.teams, perSide: this.match.perSide, roster: this.match.roster(),
      map: this.match.map.id, mode: this.match.mode, objective: this.match.objective, minutes: this.match.minutes, difficulty: this.match.difficulty, spd: p.speedMul,
    });
    try { client.send('snap', this.picture()); } catch { /* the socket is not open */ }
    this.broadcast('roster', this.match.roster());
    this.lastRv = this.match.rv;
  }

  onLeave(client) {
    const pid = this.pids.get(client.sessionId);
    if (pid && seated.get(pid) === client.sessionId) seated.delete(pid);
    this.pids.delete(client.sessionId);
    this.voice?.delete(client.sessionId); this.sessions?.delete(client.sessionId);
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
    if (m.train) return;           // training pays nothing: targets that stand still are not a way to farm coins or experience
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
