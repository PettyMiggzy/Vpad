// Voice chat in the browser. The sound goes straight from speaker to listener (WebRTC, one connection per pair, a copy of the voice for each
// listener); the match server only says who may hear whom and carries the connection setup (arena/server/voice.js has the rules).
//   team channel : the speaker's team hears them at full volume wherever they are
//   near channel : anyone within 30 metres hears them, of either team, louder when closer and from the direction they stand in
// Listening needs no permission. The microphone is asked for the first time somebody holds the talk key or button.
import { isLoud, tuneOpus } from './voicecore.js';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
export const NEAR_RANGE = 30, NEAR_FULL = 3;

/** the connection servers: Google's public STUN by default; a TURN relay (for players behind strict networks) can be given as ?turn=<json> or the build setting VITE_TURN */
function iceServers() {
  let extra = [];
  try {
    const raw = new URLSearchParams(location.search).get('turn') || import.meta.env?.VITE_TURN;
    if (raw) { const j = JSON.parse(raw); extra = Array.isArray(j) ? j : [j]; }
  } catch { /* a bad setting is ignored */ }
  return [...STUN, ...extra];
}

export class Voice {
  /** send(msg) puts a message to the server; pos(id) gives a player's place { x, y, z } in metres, or null */
  constructor({ send, pos, onChange = () => {} }) {
    this.send = send; this.pos = pos; this.onChange = onChange;
    this.mode = 'team'; this.armed = false; this.talking = false; this.denied = false; this.muted = false; this.volume = 1;
    this.out = new Map();          // listener id -> { pc }
    this.inc = new Map();          // speaker id -> { pc, nodes, speaking, last }
    this.peers = new Set();        // who the server lets this player speak to
    this.allowed = new Map();      // who the server lets this player hear -> their channel
    this.waiting = [];             // offers that came before the server said who may speak
    this.stream = null; this.track = null; this.ctx = null; this.master = null;
    this.ice = iceServers();
    this.timers = new Set();
  }

  /** the audio side starts when the first sound could play (a click has happened by then) */
  ensureAudio() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.ctx.destination);
  }

  status() { return { mode: this.mode, armed: this.armed, talking: this.talking, denied: this.denied, muted: this.muted, speakers: [...this.inc].filter(([, v]) => v.speaking).map(([id]) => id), hearing: [...this.allowed.keys()] }; }
  speaking(id) { return !!this.inc.get(id)?.speaking; }
  changed() { try { this.onChange(this.status()); } catch { /* a listener must not break the voice */ } }

  /** the microphone: asked for once; false when the player says no or has none */
  async enableMic() {
    if (this.track) return true;
    if (this.denied || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
      this.track = this.stream.getAudioTracks()[0]; this.track.enabled = false;
      return true;
    } catch { this.denied = true; this.changed(); return false; }
  }

  /** the talk key or button, held (true) and let go (false) */
  async talk(down) {
    if (down) {
      this.ensureAudio(); void this.ctx?.resume();
      if (!this.armed) {
        if (!(await this.enableMic())) return;
        this.armed = true; this.send({ t: 'mode', on: true, mode: this.mode });
        this.connectAll();
      }
      this.talking = true; if (this.track) this.track.enabled = true;
    } else {
      this.talking = false; if (this.track) this.track.enabled = false;
    }
    this.changed();
  }

  /** team channel or near channel */
  setMode(mode) {
    if (mode !== 'team' && mode !== 'near') return;
    this.mode = mode;
    if (this.armed) this.send({ t: 'mode', on: true, mode });
    this.changed();
  }
  toggleMode() { this.setMode(this.mode === 'team' ? 'near' : 'team'); }

  setMuted(m) { this.muted = !!m; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; this.changed(); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1.5, v)); if (this.master && !this.muted) this.master.gain.value = this.volume; }

  // ---- messages from the server ----
  handle(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'peers' && Array.isArray(m.to)) {
      this.peers = new Set(m.to.filter((x) => typeof x === 'string'));
      for (const id of [...this.out.keys()]) if (!this.peers.has(id)) this.closeOut(id);
      this.connectAll();
    } else if (m.t === 'from' && Array.isArray(m.list)) {
      this.allowed = new Map(m.list.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x.mode === 'near' ? 'near' : 'team']));
      for (const id of [...this.inc.keys()]) if (!this.allowed.has(id)) this.closeIn(id);
      for (const [id, v] of this.inc) this.setGains(v, this.allowed.get(id));
      const waiting = this.waiting.splice(0);
      for (const w of waiting) void this.handle(w);
      this.changed();
    } else if (m.t === 'sig' && typeof m.from === 'string') {
      void this.signal(m);
    }
  }

  // ---- speaking: one connection to each listener ----
  connectAll() {
    if (!this.armed || !this.track) return;
    for (const id of this.peers) if (!this.out.has(id)) void this.connectTo(id);
  }
  async connectTo(id) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const entry = { pc };
    this.out.set(id, entry);
    pc.addTransceiver(this.track, { direction: 'sendonly', streams: [this.stream] });
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'sig', to: id, k: 'ice', d: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState) && this.out.get(id) === entry) {
        this.closeOut(id);
        const t = setTimeout(() => { this.timers.delete(t); this.connectAll(); }, 3000); this.timers.add(t);       // try again while they are still on the list
      }
    };
    try {
      const offer = await pc.createOffer();
      offer.sdp = tuneOpus(offer.sdp);
      await pc.setLocalDescription(offer);
      this.send({ t: 'sig', to: id, k: 'offer', d: { type: offer.type, sdp: offer.sdp } });
    } catch { this.closeOut(id); }
  }
  closeOut(id) { const e = this.out.get(id); this.out.delete(id); try { e?.pc.close(); } catch { /* already closed */ } }

  // ---- listening ----
  async signal(m) {
    const { from, k, d } = m;
    if (k === 'offer') {
      if (!this.allowed.has(from)) { if (this.waiting.length < 20) this.waiting.push(m); return; }
      this.closeIn(from);
      this.ensureAudio();
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      const entry = { pc, speaking: false, last: 0, queue: [], ready: false };
      this.inc.set(from, entry);
      pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'sig', to: from, k: 'ice', d: e.candidate.toJSON() }); };
      pc.ontrack = (e) => this.attach(from, entry, e.streams[0] || new MediaStream([e.track]));
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && this.inc.get(from) === entry) this.closeIn(from); };
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: String(d.sdp) });
        entry.ready = true; for (const c of entry.queue.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* a late candidate */ } }
        const answer = await pc.createAnswer(); answer.sdp = tuneOpus(answer.sdp);
        await pc.setLocalDescription(answer);
        this.send({ t: 'sig', to: from, k: 'answer', d: { type: answer.type, sdp: answer.sdp } });
      } catch { this.closeIn(from); }
    } else if (k === 'answer') {
      const e = this.out.get(from);
      if (e) { try { await e.pc.setRemoteDescription({ type: 'answer', sdp: String(d.sdp) }); } catch { /* a stray answer */ } }
    } else if (k === 'ice') {
      const e = this.out.get(from) || this.inc.get(from);
      if (!e || !d) return;
      if (e.pc && (e.ready === false)) { e.queue.push(d); return; }
      try { await e.pc.addIceCandidate(d); } catch { /* a late candidate */ }
    }
  }

  attach(id, entry, stream) {
    if (!this.ctx) return;
    // Chrome only feeds a remote stream into Web Audio when an (silent) audio element holds it too
    const el = new Audio(); el.srcObject = stream; el.muted = true; void el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser(); analyser.fftSize = 256;
    const teamGain = this.ctx.createGain(), nearGain = this.ctx.createGain();
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.refDistance = NEAR_FULL; panner.maxDistance = NEAR_RANGE; panner.rolloffFactor = 1;
    src.connect(analyser); src.connect(teamGain); teamGain.connect(this.master); src.connect(panner); panner.connect(nearGain); nearGain.connect(this.master);
    entry.nodes = { el, src, analyser, teamGain, nearGain, panner, buf: new Uint8Array(analyser.fftSize) };
    this.setGains(entry, this.allowed.get(id));
  }
  setGains(entry, mode) {
    const n = entry.nodes; if (!n) return;
    n.teamGain.gain.value = mode === 'team' ? 1 : 0;
    n.nearGain.gain.value = mode === 'near' ? 1 : 0;
  }
  closeIn(id) {
    const e = this.inc.get(id); this.inc.delete(id); if (!e) return;
    try { e.pc.close(); } catch { /* already closed */ }
    const n = e.nodes; if (n) { try { n.src.disconnect(); n.panner.disconnect(); n.teamGain.disconnect(); n.nearGain.disconnect(); n.el.srcObject = null; } catch { /* already gone */ } }
    this.changed();
  }

  /** every frame: where the listener stands and faces, where each voice comes from, and who is talking */
  tick(listener, dir, now) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' && now - (this.lastResume ?? -1e9) > 1500) { this.lastResume = now; void this.ctx.resume(); }       // a browser may keep sound off until the page has been touched
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = listener.x; L.positionY.value = listener.y; L.positionZ.value = listener.z;
      L.forwardX.value = dir.x; L.forwardY.value = dir.y; L.forwardZ.value = dir.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    let moved = false;
    for (const [id, e] of this.inc) {
      const n = e.nodes; if (!n) continue;
      const p = this.pos(id);
      if (p && n.panner.positionX) { n.panner.positionX.value = p.x; n.panner.positionY.value = p.y; n.panner.positionZ.value = p.z; e.pos = p; }
      n.analyser.getByteTimeDomainData(n.buf);
      const loud = isLoud(n.buf);
      if (loud) e.last = now;
      const speaking = now - e.last < 350;
      if (speaking !== e.speaking) { e.speaking = speaking; moved = true; }
    }
    if (moved) this.changed();
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    for (const id of [...this.out.keys()]) this.closeOut(id);
    for (const id of [...this.inc.keys()]) this.closeIn(id);
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
    try { void this.ctx?.close(); } catch { /* already closed */ }
    this.armed = false; this.talking = false;
  }
}
