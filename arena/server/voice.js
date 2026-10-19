// Voice chat rules. The voice itself travels between players' browsers (WebRTC, one connection per speaker and listener); this server decides
// who may hear whom and carries the setup messages, and nothing else. A speaker is heard by:
//   team  : the soldiers of their own team, anywhere on the map
//   near  : anybody, of any team, within NEAR metres (so a bunch of players in one place hear each other even without a team channel)
// A fallen soldier is heard only by fallen soldiers of the same team (no calling out where the enemy is from the next life's wait); the fallen
// hear their living team-mates' team channel.
// Nothing here looks at the audio.
const M = 50;                                    // pixels per metre in the rules
export const VOICE = {
  near: 30,                                      // metres: the farthest a nearby voice carries
  keep: 36,                                      // a listener already connected stays connected out to here, so walking along the edge does not flicker
  max: 12,                                       // the most listeners one speaker sends to (the browser sends one copy of the voice to each)
  sigBytes: 6000,                                // the largest setup message
  sigRate: 60,                                   // setup messages a client may send in one second
};
export const MODES = ['team', 'near'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / M;

/**
 * Who a speaker's voice goes to. `players` is the match's player map (id -> soldier), `prev` the listeners they already had.
 * Bots never listen. Returns a Set of ids, at most VOICE.max, nearest first.
 */
export function audience(speaker, mode, players, prev = new Set()) {
  if (!speaker || speaker.bot || !MODES.includes(mode)) return new Set();
  const out = [];
  for (const l of players.values()) {
    if (l === speaker || l.bot) continue;
    if (!speaker.alive || !l.alive) {
      // the fallen talk among themselves within a team, and hear their living team-mates' team channel; the living never hear the fallen
      if (!speaker.alive && l.alive) continue;
      if (l.team !== speaker.team || (speaker.alive && mode !== 'team')) continue;
      out.push([l.id, dist(speaker, l)]); continue;
    }
    if (mode === 'team') { if (l.team === speaker.team) out.push([l.id, dist(speaker, l)]); continue; }
    const d = dist(speaker, l), reach = prev.has(l.id) ? VOICE.keep : VOICE.near;
    if (d <= reach) out.push([l.id, d]);
  }
  out.sort((a, b) => a[1] - b[1]);
  return new Set(out.slice(0, VOICE.max).map(([id]) => id));
}

const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
export { same as sameSet };

/**
 * One look at everybody: `state` maps a client id to { on, mode, aud }. Returns what changed as messages:
 * { to, msg } where msg is { t: 'peers', to: [ids] } for a speaker (who they may connect to) or { t: 'from', list: [{ id, mode }] } for a listener (whose voice they may take).
 * The listener messages come first, so a listener knows an offer is allowed before it arrives.
 */
export function plan(players, state) {
  const speakers = new Map();
  for (const [id, v] of state) {
    const p = players.get(id);
    const next = p && v.on && !p.bot ? audience(p, v.mode, players, v.aud) : new Set();
    speakers.set(id, next);
  }
  const heard = new Map();                                        // listener id -> [{ id, mode }]
  for (const id of state.keys()) heard.set(id, []);
  for (const [sid, aud] of speakers) for (const lid of aud) if (heard.has(lid)) heard.get(lid).push({ id: sid, mode: state.get(sid).mode });
  const msgs = [];
  for (const [id, v] of state) {
    const list = heard.get(id).sort((a, b) => (a.id < b.id ? -1 : 1)), key = JSON.stringify(list);
    if (key !== v.fromKey) { v.fromKey = key; msgs.push({ to: id, msg: { t: 'from', list } }); }
  }
  for (const [id, v] of state) {
    const aud = speakers.get(id);
    if (!same(aud, v.aud || new Set())) { v.aud = aud; msgs.push({ to: id, msg: { t: 'peers', to: [...aud] } }); }
  }
  return msgs;
}

/** a setup message from a client, or null when it is not one */
export function readVoice(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (m.t === 'mode') {
    if (typeof m.on !== 'boolean' || !MODES.includes(m.mode)) return null;
    return { t: 'mode', on: m.on, mode: m.mode };
  }
  if (m.t === 'sig') {
    if (typeof m.to !== 'string' || m.to.length === 0 || m.to.length > 64) return null;
    if (!['offer', 'answer', 'ice'].includes(m.k)) return null;
    let size = 0; try { size = JSON.stringify(m.d ?? null).length; } catch { return null; }
    if (size > VOICE.sigBytes) return null;
    return { t: 'sig', to: m.to, k: m.k, d: m.d ?? null };
  }
  return null;
}
