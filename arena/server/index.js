// The arena's match server (Colyseus): one room per fixture (token A against token B). It runs the rules in game.js, takes each
// player's input (move, aim, fire) and sends everyone the same snapshot 20 times a second. Nothing the client says can move money or
// decide a result: the server is the only authority, and a finished match is reported to the rules engine by the server alone.
import { Server, Room } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { Match, cleanName } from './game.js';
import { CATALOG, REWARD } from './items.js';
import { getProfile, view, buy, equip, loadoutFor, award, grantXp, classOp, validPid } from './profiles.js';
import { XP } from './progress.js';

const TICK = 1000 / 30;     // the simulation steps 30 times a second
const SEND_EVERY = 2;       // and a snapshot goes out every second step: 15 a second

class MatchRoom extends Room {
  maxClients = 64;
  autoDispose = true;

  onCreate(options = {}) {
    const names = Array.isArray(options.names) ? options.names.map(cleanName) : [];
    const colors = Array.isArray(options.colors) ? options.colors : [];
    const teams = [
      { name: names[0] || 'BLUE', color: Number.isInteger(colors[0]) ? colors[0] : 0x2f7bff },
      { name: names[1] || 'RED', color: Number.isInteger(colors[1]) ? colors[1] : 0xff3b30 },
    ];
    const perSide = Math.max(1, Math.min(32, Number(options.perSide) || 8));
    this.maxClients = perSide * 2;
    this.match = new Match({ teams, perSide, bots: options.bots !== false, map: typeof options.map === 'string' ? options.map : 'cargo', mode: options.mode });
    this.pids = new Map();   // session id to profile id
    this.tick = 0;
    this.onMessage('input', (client, m) => {
      const p = this.match.players.get(client.sessionId);
      if (!p || !m || typeof m !== 'object') return;
      p.input = { dx: Number(m.dx) || 0, dy: Number(m.dy) || 0, aim: Number.isFinite(m.aim) ? m.aim : p.aim, pitch: Number.isFinite(m.pitch) ? m.pitch : 0, fire: !!m.fire, nade: !!m.nade, reload: !!m.reload };
    });
    this.setSimulationInterval(() => {
      const before = this.match.phase;
      this.match.step(TICK / 1000);
      this.tick += 1;
      for (const e of this.match.events) this.reward(e);
      if (this.match.events.some((e) => e.type === 'match')) this.reportResult();
      if (this.match.rv !== this.lastRv) { this.lastRv = this.match.rv; this.broadcast('roster', this.match.roster()); }
      if (this.tick % SEND_EVERY === 0 || this.match.phase !== before) this.broadcast('snap', this.match.snapshot());
    }, TICK);
  }

  onJoin(client, options = {}) {
    const pid = validPid(options.pid) ? options.pid : null;
    if (pid) this.pids.set(client.sessionId, pid);
    const p = this.match.addPlayer(client.sessionId, { ...options, loadout: pid ? loadoutFor(pid) : undefined });
    if (!p) { client.leave(4001, 'that match is full'); return; }
    client.send('hello', { id: p.id, team: p.team, teams: this.match.teams, perSide: this.match.perSide, roster: this.match.roster() });
    this.broadcast('roster', this.match.roster());
  }

  onLeave(client) {
    this.match.removePlayer(client.sessionId); this.pids.delete(client.sessionId);
    this.broadcast('roster', this.match.roster());
  }

  /** coins for kills, round wins and match wins go to the profiles of the humans who earned them (bots earn nothing) */
  reward(e) {
    const m = this.match;
    if (e.type === 'kill') { const pid = this.pids.get(e.by); if (pid && e.by !== e.victim) { award(pid, REWARD.kill); grantXp(pid, XP.kill + (e.head ? XP.head : 0) + (e.melee ? XP.melee : 0) + (e.nade ? XP.nade : 0), e.nade || e.melee ? null : e.weapon); } }
    const team = e.type === 'roundEnd' ? e.winner : e.type === 'match' ? e.winner : null;
    if ((e.type === 'roundEnd' || e.type === 'match') && (team === 0 || team === 1)) {
      for (const [sid, pid] of this.pids) if (m.players.get(sid)?.team === team) { award(pid, e.type === 'match' ? REWARD.match : REWARD.round); grantXp(pid, e.type === 'match' ? XP.match : XP.round); }
    }
  }

  /** the one place a result leaves the server: to the rules engine, from the server only (not wired yet: it is logged) */
  reportResult() {
    const m = this.match;
    console.log('MATCH RESULT', JSON.stringify({ winner: m.teams[m.winner]?.name, score: m.score, rounds: m.round }));
  }
}

const port = Number(process.env.PORT) || 2567;
// the shop's small web API: look at a profile, buy an item, equip an item (the server keeps the coins and what is owned)
const api = (app) => {
  app.use('/api', (req, res, next) => {
    res.set({ 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use('/api', express.json({ limit: '2kb' }));
  const send = (res, r) => res.status(r.error ? 400 : 200).json(r);
  app.get('/api/profile', (req, res) => { const p = getProfile(String(req.query.pid || '')); if (!p) return res.status(400).json({ error: 'bad id' }); res.json({ ...view(p), catalog: CATALOG }); });
  app.post('/api/buy', (req, res) => send(res, buy(String(req.body?.pid || ''), String(req.body?.item || ''))));
  app.post('/api/class', (req, res) => send(res, classOp(String(req.body?.pid || ''), String(req.body?.op || ''), Number(req.body?.i), req.body?.name)));
  app.post('/api/equip', (req, res) => send(res, equip(String(req.body?.pid || ''), String(req.body?.item || ''))));
};
const server = new Server({ transport: new WebSocketTransport(), express: api });
server.define('match', MatchRoom);
server.listen(port).then(() => console.log(`arena server on :${port}`));
