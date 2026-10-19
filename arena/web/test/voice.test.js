import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoud, tuneOpus } from '../src/voicecore.js';

// a browser stand-in: a connection that records what it is asked to do
const made = [];
class FakePC {
  constructor(cfg) { this.cfg = cfg; this.closed = false; this.sent = []; this.candidates = []; this.connectionState = 'new'; made.push(this); }
  addTransceiver(track, o) { this.sent.push({ track, o }); }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n' }; }
  async setLocalDescription(d) { this.local = d; }
  async setRemoteDescription(d) { this.remote = d; }
  async addIceCandidate(c) { this.candidates.push(c); }
  close() { this.closed = true; }
}
globalThis.RTCPeerConnection = FakePC;
globalThis.location = { search: '' };
const track = { enabled: true, stop() { this.stopped = true; } };
let asked = 0, deny = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { async getUserMedia() { asked++; if (deny) throw new Error('no'); return { getAudioTracks: () => [track], getTracks: () => [track] }; } } } });
const { Voice } = await import('../src/voice.js');
const mk = () => { const sent = []; made.length = 0; const v = new Voice({ send: (m) => sent.push(m), pos: () => null }); return { v, sent }; };
const tick = () => new Promise((r) => setTimeout(r, 5));

test('sound that is loud enough counts as talking; silence does not', () => {
  assert.equal(isLoud(new Uint8Array(256).fill(128)), false);
  assert.equal(isLoud(Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 190 : 66))), true);
  assert.equal(isLoud(Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 129 : 127))), false, 'a hiss is not a voice');
});

test('opus is kept to a small voice stream, and nothing is added twice', () => {
  const out = tuneOpus('a=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n');
  assert.match(out, /maxaveragebitrate=24000/); assert.match(out, /usedtx=1/); assert.equal((out.match(/useinbandfec/g) || []).length, 1);
  assert.equal(tuneOpus(out), out, 'running it again changes nothing');
  assert.equal(tuneOpus('a=rtpmap:0 PCMU/8000\r\n'), 'a=rtpmap:0 PCMU/8000\r\n');
});

test('the microphone is asked for only when somebody first talks; saying no is remembered and no channel is armed', async () => {
  const { v, sent } = mk(); asked = 0; deny = true;
  assert.equal(asked, 0, 'listening asks for nothing');
  await v.talk(true);
  assert.equal(asked, 1); assert.equal(v.denied, true); assert.equal(v.armed, false); assert.deepEqual(sent, [], 'nothing is announced to the server');
  await v.talk(true); assert.equal(asked, 1, 'it does not ask again');
  deny = false;
  const b = mk(); asked = 0; track.enabled = true;
  await b.v.talk(true);
  assert.equal(asked, 1); assert.equal(b.v.armed, true); assert.equal(track.enabled, true, 'talking while held');
  assert.deepEqual(b.sent, [{ t: 'mode', on: true, mode: 'team' }]);
  await b.v.talk(false); assert.equal(track.enabled, false, 'silent when the key is let go');
  await b.v.talk(true); await b.v.talk(false); assert.equal(asked, 1);
  b.v.dispose();
});

test('the channel: team or near, announced when armed, and the same message each time it changes', async () => {
  const { v, sent } = mk(); deny = false;
  v.setMode('near'); assert.deepEqual(sent, [], 'not armed yet: nothing to tell the server');
  await v.talk(true);
  assert.deepEqual(sent.at(-1), { t: 'mode', on: true, mode: 'near' });
  v.toggleMode(); assert.deepEqual(sent.at(-1), { t: 'mode', on: true, mode: 'team' });
  v.setMode('shout'); assert.equal(v.mode, 'team');
  v.dispose();
});

test('speaking: one connection per listener the server names, an offer sent for each, and a connection closed when the listener is dropped', async () => {
  const { v, sent } = mk(); deny = false;
  v.handle({ t: 'peers', to: ['b', 'c'] });
  assert.equal(made.length, 0, 'no microphone yet, no connections');
  await v.talk(true); await tick();
  assert.equal(made.length, 2);
  const offers = sent.filter((m) => m.t === 'sig' && m.k === 'offer');
  assert.deepEqual(offers.map((m) => m.to).sort(), ['b', 'c']);
  assert.ok(offers.every((m) => /maxaveragebitrate=24000/.test(m.d.sdp)));
  assert.ok(made.every((pc) => pc.sent[0].o.direction === 'sendonly'));
  v.handle({ t: 'peers', to: ['c'] });
  assert.equal(made.find((pc) => pc === v.out.get('c')?.pc)?.closed, false);
  assert.equal(made.filter((pc) => pc.closed).length, 1, 'b was dropped');
  v.handle({ t: 'peers', to: ['c', 'c', 5, null] }); assert.equal(v.out.size, 1);
  v.dispose(); assert.ok(made.every((pc) => pc.closed));
});

test('listening: an offer is answered only from somebody the server says may speak to you; one that came early waits for that word', async () => {
  const { v, sent } = mk();
  v.handle({ t: 'sig', from: 'x', k: 'offer', d: { sdp: 'v=0' } }); await tick();
  assert.equal(made.length, 0, 'a stranger gets no answer'); assert.equal(sent.length, 0);
  v.handle({ t: 'from', list: [{ id: 'x', mode: 'team' }] }); await tick();
  assert.equal(made.length, 1, 'the early offer is taken once x is allowed');
  assert.deepEqual(sent.at(-1).k, 'answer'); assert.equal(sent.at(-1).to, 'x');
  assert.equal(made[0].remote.sdp, 'v=0');
  v.handle({ t: 'sig', from: 'y', k: 'offer', d: { sdp: 'v=0' } }); await tick();
  assert.equal(made.length, 1, 'y was never allowed');
  v.handle({ t: 'from', list: [] }); await tick();
  assert.equal(made[0].closed, true, 'when x may no longer speak to you, the connection closes');
  assert.equal(v.inc.size, 0);
  v.dispose();
});

test('candidates are held until the offer is set, then added; junk messages do nothing', async () => {
  const { v } = mk();
  v.handle({ t: 'from', list: [{ id: 'x', mode: 'near' }] });
  const p = v.signal({ from: 'x', k: 'offer', d: { sdp: 'v=0' } });
  v.handle({ t: 'sig', from: 'x', k: 'ice', d: { candidate: 'c1' } });
  await p; await tick();
  v.handle({ t: 'sig', from: 'x', k: 'ice', d: { candidate: 'c2' } }); await tick();
  assert.deepEqual(made[0].candidates.map((c) => c.candidate), ['c1', 'c2']);
  for (const bad of [null, 5, 'x', {}, { t: 'peers' }, { t: 'from', list: 'no' }, { t: 'sig' }, { t: 'sig', from: 7 }]) assert.doesNotThrow(() => v.handle(bad));
  assert.equal(v.allowed.size, 1);
  v.dispose();
});

test('mute and volume: muting silences everything and is reported; the player list shows who hears whom', () => {
  const { v } = mk(); let seen = 0; v.onChange = () => { seen++; };
  v.setMuted(true); assert.equal(v.status().muted, true); assert.ok(seen > 0);
  v.setVolume(9); assert.equal(v.volume, 1.5); v.setVolume(-3); assert.equal(v.volume, 0);
  v.handle({ t: 'from', list: [{ id: 'a', mode: 'near' }, { id: 'b', mode: 'weird' }] });
  assert.deepEqual([...v.allowed], [['a', 'near'], ['b', 'team']], 'an unknown channel is treated as the team channel, never as open');
  v.dispose();
});
