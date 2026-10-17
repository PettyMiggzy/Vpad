// The arena's match server (Colyseus): one room per fixture (token A against token B). It runs the rules in game.js, takes each
// player's input and sends everyone the same snapshot 20 times a second. Nothing the client says can move money or decide a
// result: the server is the only authority, and a finished challenge is reported by the server alone. Play coins only.
import { pathToFileURL } from 'node:url';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { CATALOG } from './items.js';
import { getProfile, view, buy, equip, classOp } from './profiles.js';
import { MatchRoom, liveRooms, roomSummary } from './room.js';

export { MatchRoom };

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const open = (req) => req.path === '/health' || req.path === '/rooms' || req.path.startsWith('/api');

// the shop's small web API, plus a health check and the list of open matches
const api = (app) => {
  app.use((req, res, next) => {
    if (open(req)) res.set(cors);
    if (req.method === 'OPTIONS' && open(req)) return res.sendStatus(204);
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/rooms', (_req, res) => res.json([...liveRooms].map(roomSummary)));
  app.use('/api', express.json({ limit: '2kb' }));
  const send = (res, r) => res.status(r.error ? 400 : 200).json(r);
  app.get('/api/profile', (req, res) => { const p = getProfile(String(req.query.pid || '')); if (!p) return res.status(400).json({ error: 'bad id' }); res.json({ ...view(p), catalog: CATALOG }); });
  app.post('/api/buy', (req, res) => send(res, buy(String(req.body?.pid || ''), String(req.body?.item || ''))));
  app.post('/api/class', (req, res) => send(res, classOp(String(req.body?.pid || ''), String(req.body?.op || ''), Number(req.body?.i), req.body?.name)));
  app.post('/api/equip', (req, res) => send(res, equip(String(req.body?.pid || ''), String(req.body?.item || ''))));
};

const transport = new WebSocketTransport({ maxPayload: 4096 });
const server = new Server({ transport, express: api });
// a and b are the two team names; clients that send the same fixture share a room, and a different map or mode does not
server.define('match', MatchRoom).filterBy(['a', 'b', 'map', 'mode', 'objective', 'perSide', 'difficulty']);

export function listen(port = Number(process.env.PORT) || 2567) {
  return server.listen(port).then(() => {
    const addr = transport.server?.address?.();
    const got = addr && typeof addr === 'object' ? addr.port : port;
    console.log(`arena server on :${got}`);
    return got;
  });
}

export function close() {
  return server.gracefullyShutdown(false);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) listen();
