// The arena's match server (Colyseus): one room per fixture (token A against token B). It runs the rules in game.js, takes each
// player's input (move, aim, fire) and sends everyone the same snapshot 20 times a second. Nothing the client says can move money or
// decide a result: the server is the only authority, and a finished match is reported to the rules engine by the server alone.
import { Server, Room } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Match, cleanName } from './game.js';

const TICK = 1000 / 30;     // the simulation steps 30 times a second
const SEND_EVERY = 2;       // and a snapshot goes out every second step: 15 a second

class MatchRoom extends Room {
  maxClients = 64;
  autoDispose = true;

  onCreate(options = {}) {
    const names = Array.isArray(options.names) ? options.names.map(cleanName) : [];
    const colors = Array.isArray(options.colors) ? options.colors : [];
    const teams = [
      { name: names[0] || 'TEAM RED', color: Number.isInteger(colors[0]) ? colors[0] : 0xff5a3c },
      { name: names[1] || 'TEAM BLUE', color: Number.isInteger(colors[1]) ? colors[1] : 0x3cb4ff },
    ];
    const perSide = Math.max(1, Math.min(32, Number(options.perSide) || 8));
    this.maxClients = perSide * 2;
    this.match = new Match({ teams, perSide, bots: options.bots !== false });
    this.tick = 0;
    this.onMessage('input', (client, m) => {
      const p = this.match.players.get(client.sessionId);
      if (!p || !m || typeof m !== 'object') return;
      p.input = { dx: Number(m.dx) || 0, dy: Number(m.dy) || 0, aim: Number.isFinite(m.aim) ? m.aim : p.aim, fire: !!m.fire };
    });
    this.setSimulationInterval(() => {
      const before = this.match.phase;
      this.match.step(TICK / 1000);
      this.tick += 1;
      if (this.match.events.some((e) => e.type === 'match')) this.reportResult();
      if (this.match.rv !== this.lastRv) { this.lastRv = this.match.rv; this.broadcast('roster', this.match.roster()); }
      if (this.tick % SEND_EVERY === 0 || this.match.phase !== before) this.broadcast('snap', this.match.snapshot());
    }, TICK);
  }

  onJoin(client, options = {}) {
    const p = this.match.addPlayer(client.sessionId, options);
    if (!p) { client.leave(4001, 'that match is full'); return; }
    client.send('hello', { id: p.id, team: p.team, teams: this.match.teams, perSide: this.match.perSide, roster: this.match.roster() });
    this.broadcast('roster', this.match.roster());
  }

  onLeave(client) {
    this.match.removePlayer(client.sessionId);
    this.broadcast('roster', this.match.roster());
  }

  /** the one place a result leaves the server: to the rules engine, from the server only (not wired yet: it is logged) */
  reportResult() {
    const m = this.match;
    console.log('MATCH RESULT', JSON.stringify({ winner: m.teams[m.winner]?.name, score: m.score, rounds: m.round }));
  }
}

const port = Number(process.env.PORT) || 2567;
const server = new Server({ transport: new WebSocketTransport() });
server.define('match', MatchRoom);
server.listen(port).then(() => console.log(`arena server on :${port}`));
