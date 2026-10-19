// Voice chat rules: who may hear whom, and the setup messages that carry the connections between players. The sound itself never touches the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audience, plan, readVoice, VOICE } from './voice.js';

process.env.ARENA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-voice-'));
const { MatchRoom, listen, close } = await import('./index.js');
const M = 50;
const mk = (id, team, xm, ym, o = {}) => ({ id, team, x: xm * M, y: ym * M, alive: true, bot: false, ...o });
const crowd = (...ps) => new Map(ps.map((p) => [p.id, p]));

test('team channel: only your own team hears you, wherever they are; the enemy next to you does not', () => {
  const ps = crowd(mk('a', 0, 10, 10), mk('mate', 0, 150, 90), mk('foe', 1, 11, 10), mk('bot', 0, 10, 11, { bot: true }));
  assert.deepEqual([...audience(ps.get('a'), 'team', ps)], ['mate']);
});

test('near channel: anyone within 30 metres hears you, of either team, and nobody farther', () => {
  const ps = crowd(mk('a', 0, 100, 50), mk('mate', 0, 120, 50), mk('foe', 1, 125, 50), mk('far', 0, 140, 50), mk('farfoe', 1, 131, 50));
  assert.deepEqual([...audience(ps.get('a'), 'near', ps)].sort(), ['foe', 'mate']);
});

test('a listener already connected stays connected out to 36 metres, so the edge does not flicker; a new one needs 30', () => {
  const ps = crowd(mk('a', 0, 100, 50), mk('p', 1, 134, 50));
  assert.equal(audience(ps.get('a'), 'near', ps).size, 0);
  assert.equal(audience(ps.get('a'), 'near', ps, new Set(['p'])).size, 1);
  ps.get('p').x = 138 * M; assert.equal(audience(ps.get('a'), 'near', ps, new Set(['p'])).size, 0);
});

test('the fallen: heard only by fallen team-mates; they hear living team-mates on the team channel, never a living enemy or a nearby voice', () => {
  const ps = crowd(mk('dead', 0, 10, 10, { alive: false }), mk('deadmate', 0, 90, 90, { alive: false }), mk('livemate', 0, 11, 10), mk('foe', 1, 12, 10), mk('deadfoe', 1, 12, 11, { alive: false }));
  assert.deepEqual([...audience(ps.get('dead'), 'team', ps)], ['deadmate'], 'a fallen soldier is heard by fallen team-mates only');
  assert.deepEqual([...audience(ps.get('dead'), 'near', ps)], ['deadmate']);
  assert.deepEqual([...audience(ps.get('livemate'), 'team', ps)].sort(), ['dead', 'deadmate']);
  assert.deepEqual([...audience(ps.get('livemate'), 'near', ps)], ['foe'], 'a nearby voice reaches the living near them, not the fallen');
});

test('a speaker sends to at most twelve listeners, the nearest first; bots and strangers to the rules are never in the audience', () => {
  const list = [mk('a', 0, 100, 50)]; for (let i = 0; i < 20; i++) list.push(mk('m' + i, 0, 100 + i, 50));
  const ps = crowd(...list);
  const aud = [...audience(ps.get('a'), 'team', ps)];
  assert.equal(aud.length, VOICE.max); assert.deepEqual(aud, Array.from({ length: VOICE.max }, (_, i) => 'm' + i));
  assert.equal(audience(ps.get('a'), 'shout', ps).size, 0, 'only the two channels exist');
  assert.equal(audience(mk('b', 0, 1, 1, { bot: true }), 'team', ps).size, 0);
  assert.equal(audience(null, 'team', ps).size, 0);
});

test('plan: listeners learn who they may hear before the speaker is told who to connect to, and only changes are sent', () => {
  const ps = crowd(mk('a', 0, 10, 10), mk('b', 0, 20, 10), mk('c', 1, 22, 10));
  const st = new Map([['a', { on: true, mode: 'team', aud: new Set(), fromKey: '' }], ['b', { on: false, mode: 'near', aud: new Set(), fromKey: '' }], ['c', { on: false, mode: 'near', aud: new Set(), fromKey: '' }]]);
  const first = plan(ps, st);
  const kinds = first.map((m) => `${m.to}:${m.msg.t}`);
  assert.deepEqual(kinds.filter((k) => k.endsWith('from')).length, 3);
  assert.ok(kinds.indexOf('b:from') < kinds.indexOf('a:peers'), 'the listener hears first');
  const fromB = first.find((m) => m.to === 'b' && m.msg.t === 'from').msg.list;
  assert.deepEqual(fromB, [{ id: 'a', mode: 'team' }]);
  assert.deepEqual(first.find((m) => m.to === 'a' && m.msg.t === 'peers').msg.to, ['b']);
  assert.deepEqual(plan(ps, st), [], 'nothing changed: nothing is sent');
  st.get('a').mode = 'near';                                              // now c (an enemy within range) hears and b still does
  const second = plan(ps, st);
  assert.deepEqual(second.find((m) => m.to === 'a' && m.msg.t === 'peers').msg.to.sort(), ['b', 'c']);
  assert.deepEqual(second.find((m) => m.to === 'c' && m.msg.t === 'from').msg.list, [{ id: 'a', mode: 'near' }]);
  st.get('a').on = false;
  assert.deepEqual(plan(ps, st).filter((m) => m.msg.t === 'peers').map((m) => m.msg.to), [[]], 'switching the microphone off ends every connection');
});

test('setup messages: only the two shapes, with sensible sizes', () => {
  assert.deepEqual(readVoice({ t: 'mode', on: true, mode: 'team' }), { t: 'mode', on: true, mode: 'team' });
  for (const bad of [null, [], 5, 'x', {}, { t: 'mode', on: 1, mode: 'team' }, { t: 'mode', on: true, mode: 'all' }, { t: 'sig', to: '', k: 'offer', d: {} }, { t: 'sig', to: 'x', k: 'hello', d: {} }, { t: 'sig', to: 'x'.repeat(65), k: 'offer', d: {} }, { t: 'sig', to: 'x', k: 'offer', d: 'y'.repeat(VOICE.sigBytes + 10) }])
    assert.equal(readVoice(bad), null, JSON.stringify(bad)?.slice(0, 60));
  assert.equal(readVoice({ t: 'sig', to: 'abc', k: 'ice', d: { candidate: 'x' } }).k, 'ice');
});

// ---- the room: who may reach whom ----
let n = 0;
const fake = () => ({ sessionId: `v${++n}`, sent: [], send(type, msg) { this.sent.push([type, msg]); }, leave() {} });
async function harness(options = {}) {
  const room = new MatchRoom(); const handlers = {};
  room.onMessage = (type, fn) => { handlers[type] = fn; };
  room.broadcast = () => {}; room.setSimulationInterval = () => {};
  await room.onCreate({ names: ['BLUE', 'RED'], map: 'cargo', perSide: 4, mode: 'practice', difficulty: 1, objective: 'elim', bots: false, ...options });
  const join = async (o) => { const c = fake(); await room.onJoin(c, { name: 'P', ...o }); return c; };
  return { room, handlers, join, stop() { try { room.onDispose?.(); } catch { /* not attached */ } } };
}
const voiceMsgs = (c, t) => c.sent.filter(([ty, m]) => ty === 'v' && m.t === t).map(([, m]) => m);
const say = (h, c, m) => h.handlers.v(c, m);

test('room: a team-mate may be sent an offer once the speaker is on the team channel; an enemy, a stranger or an unarmed speaker may not', async () => {
  const h = await harness();
  const a = await h.join({ team: 0 }), b = await h.join({ team: 0 }), e = await h.join({ team: 1 });
  h.room.match.phase = 'live';
  for (const c of [a, b, e]) { const p = h.room.match.players.get(c.sessionId); p.alive = true; p.x = 500; p.y = 500 + 1000 * (c === e ? 0.2 : 0); }
  // before the speaker is on, nothing is relayed
  say(h, a, { t: 'sig', to: b.sessionId, k: 'offer', d: { sdp: 'x' } });
  assert.equal(voiceMsgs(b, 'sig').length, 0, 'an unarmed speaker cannot send an offer');
  say(h, a, { t: 'mode', on: true, mode: 'team' });
  assert.deepEqual(voiceMsgs(a, 'peers').at(-1).to, [b.sessionId], 'the speaker is told who to connect to');
  assert.deepEqual(voiceMsgs(b, 'from').at(-1).list, [{ id: a.sessionId, mode: 'team' }], 'the listener is told who may speak to them');
  assert.deepEqual(voiceMsgs(e, 'from').at(-1).list, [], 'the enemy hears nobody on the team channel');
  say(h, a, { t: 'sig', to: b.sessionId, k: 'offer', d: { sdp: 'x' } });
  assert.deepEqual(voiceMsgs(b, 'sig').at(-1), { t: 'sig', from: a.sessionId, k: 'offer', d: { sdp: 'x' } }, 'the offer arrives with the sender named by the server');
  say(h, a, { t: 'sig', to: e.sessionId, k: 'offer', d: { sdp: 'x' } });
  assert.equal(voiceMsgs(e, 'sig').length, 0, 'no offer reaches an enemy');
  say(h, e, { t: 'sig', to: a.sessionId, k: 'offer', d: { sdp: 'evil' } });
  assert.equal(voiceMsgs(a, 'sig').length, 0, 'and an enemy cannot start a connection to the speaker either');
  say(h, e, { t: 'sig', to: a.sessionId, k: 'answer', d: { sdp: 'evil' } }); say(h, e, { t: 'sig', to: a.sessionId, k: 'ice', d: {} });
  assert.equal(voiceMsgs(a, 'sig').length, 0, 'nor answer or send candidates');
  say(h, b, { t: 'sig', to: a.sessionId, k: 'answer', d: { sdp: 'y' } }); say(h, b, { t: 'sig', to: a.sessionId, k: 'ice', d: { c: 1 } });
  assert.deepEqual(voiceMsgs(a, 'sig').map((m) => m.k), ['answer', 'ice'], 'the listener may answer');
  say(h, a, { t: 'sig', to: 'nobody', k: 'ice', d: {} }); say(h, a, { t: 'sig', to: a.sessionId, k: 'ice', d: {} });
  h.stop();
});

test('room: on the near channel an enemy close by hears, and stops hearing when they are far; leaving or going quiet ends it', async () => {
  const h = await harness();
  const a = await h.join({ team: 0 }), e = await h.join({ team: 1 });
  h.room.match.phase = 'live';
  const pa = h.room.match.players.get(a.sessionId), pe = h.room.match.players.get(e.sessionId);
  pa.alive = pe.alive = true; pa.x = 1000; pa.y = 1000; pe.x = 1000 + 20 * M; pe.y = 1000;
  say(h, a, { t: 'mode', on: true, mode: 'near' });
  assert.deepEqual(voiceMsgs(a, 'peers').at(-1).to, [e.sessionId]);
  assert.deepEqual(voiceMsgs(e, 'from').at(-1).list, [{ id: a.sessionId, mode: 'near' }]);
  pe.x = 1000 + 60 * M; h.room.voiceTick();
  assert.deepEqual(voiceMsgs(a, 'peers').at(-1).to, [], 'out of range');
  assert.deepEqual(voiceMsgs(e, 'from').at(-1).list, []);
  pe.x = 1000 + 20 * M; h.room.voiceTick(); assert.equal(voiceMsgs(a, 'peers').at(-1).to.length, 1);
  say(h, a, { t: 'mode', on: false, mode: 'near' }); assert.deepEqual(voiceMsgs(a, 'peers').at(-1).to, []);
  say(h, a, { t: 'mode', on: true, mode: 'near' });
  h.room.onLeave(a); h.room.voiceTick();
  assert.deepEqual(voiceMsgs(e, 'from').at(-1).list, [], 'a speaker who left is no longer heard');
  h.stop();
});

test('room: setup messages are rate limited, size limited and shape checked; bots and the unseated cannot use them', async () => {
  const h = await harness({ bots: true, perSide: 3 });
  const a = await h.join({ team: 0 }), b = await h.join({ team: 0 });
  h.room.match.phase = 'live';
  say(h, a, { t: 'mode', on: true, mode: 'team' });
  let got = 0; const before = voiceMsgs(b, 'sig').length;
  for (let i = 0; i < 200; i++) h.room.takeVoice(a, { t: 'sig', to: b.sessionId, k: 'ice', d: { i } }, 5000);
  got = voiceMsgs(b, 'sig').length - before;
  assert.equal(got, VOICE.sigRate - 1, 'one second allows sixty messages, the first one was the channel change');
  const c = await h.join({ team: 0 });
  say(h, c, { t: 'mode', on: true, mode: 'team' });
  const base = voiceMsgs(b, 'sig').length;
  h.room.takeVoice(c, { t: 'sig', to: b.sessionId, k: 'ice', d: 'x'.repeat(VOICE.sigBytes + 1) });
  h.room.takeVoice(c, { t: 'junk' }); h.room.takeVoice(c, 'text'); h.room.takeVoice(c, null); h.room.takeVoice(c, { t: 'sig', to: b.sessionId, k: 'ice', d: { big: 'x'.repeat(8000) } });
  assert.equal(voiceMsgs(b, 'sig').length - base, 0, 'oversized and malformed messages go nowhere');
  h.room.takeVoice(c, { t: 'sig', to: b.sessionId, k: 'ice', d: { ok: 1 } });
  assert.equal(voiceMsgs(b, 'sig').length - base, 1, 'a proper one still does');
  h.room.match.fillBots();
  const bot = [...h.room.match.players.values()].find((p) => p.bot);
  assert.ok(bot, 'there is a bot to try');
  assert.doesNotThrow(() => h.room.takeVoice({ sessionId: bot.id }, { t: 'mode', on: true, mode: 'team' }));
  assert.doesNotThrow(() => h.room.takeVoice({ sessionId: 'ghost' }, { t: 'mode', on: true, mode: 'team' }));
  assert.ok(!h.room.voice.get(bot.id), 'a bot is never on the voice list');
  h.stop();
});

test('through real sockets: two players in the training yard, a team-channel speaker, and an offer that fits in a message', async () => {
  const { Client } = await import('@colyseus/sdk');
  const port = await listen(0);
  const client = new Client(`http://127.0.0.1:${port}`);
  const opts = { names: ['VA', 'VB'], a: 'VA', b: 'VB', map: 'training', mode: 'train', objective: 'train', perSide: 16, minutes: 5, difficulty: 1, solo: 'shared' };
  const got = [[], []];
  const join = async (i, pid) => { const r = await client.joinOrCreate('match', { ...opts, pid, name: 'p' + i }); r.onMessage('v', (m) => got[i].push(m)); r.onMessage('*', () => {}); return r; };
  const r0 = await join(0, 'a'.repeat(16)), r1 = await join(1, 'b'.repeat(16));
  assert.equal(r0.roomId, r1.roomId, 'both landed in the same training room');
  r0.send('v', { t: 'mode', on: true, mode: 'team' });
  for (let i = 0; i < 40 && !got[1].some((m) => m.t === 'from' && m.list.length); i++) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(got[1].filter((m) => m.t === 'from').at(-1).list, [{ id: r0.sessionId, mode: 'team' }]);
  assert.deepEqual(got[0].filter((m) => m.t === 'peers').at(-1).to, [r1.sessionId]);
  const sdp = 'v=0\r\n' + 'a=candidate:1 1 udp 2122260223 192.168.0.10 54321 typ host generation 0\r\n'.repeat(40);       // a long, real-sized offer
  r0.send('v', { t: 'sig', to: r1.sessionId, k: 'offer', d: { type: 'offer', sdp } });
  for (let i = 0; i < 40 && !got[1].some((m) => m.t === 'sig'); i++) await new Promise((r) => setTimeout(r, 50));
  const sig = got[1].find((m) => m.t === 'sig');
  assert.ok(sig && sig.from === r0.sessionId && sig.d.sdp === sdp, 'the whole offer arrived');
  await r0.leave(); await r1.leave();
});

test.after(async () => { await close(); });
