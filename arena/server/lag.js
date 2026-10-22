// Where a soldier was over the last second, and the moment a shot should be judged.
// The shooter sees other people a little late: one round trip, plus the tenth of a second the picture is drawn behind,
// and never further back than a quarter of a second. Only enemy positions move back. The walls stay as they are now.
export const VIEW_PAD_MS = 100;
export const VIEW_CAP_MS = 250;
const KEEP = 1;

export function rewindMs(rttMs) {
  const rtt = Number.isFinite(rttMs) ? Math.max(0, rttMs) : 0;
  return Math.min(VIEW_CAP_MS, rtt + VIEW_PAD_MS);
}

export class History {
  constructor() { this.tracks = new Map(); }

  note(p, t) {
    let list = this.tracks.get(p.id);
    if (!list) this.tracks.set(p.id, list = []);
    const row = { t, x: p.x, y: p.y, z: p.z, alive: p.alive ? 1 : 0, crouch: p.crouch || 0 };
    const last = list[list.length - 1];
    if (last && last.t === t) list[list.length - 1] = row;
    else list.push(row);
    const cut = t - KEEP;
    while (list.length > 2 && list[1].t < cut) list.shift();
  }

  record(match, t) {
    for (const p of match.players.values()) this.note(p, t);
  }

  sample(id, t) {
    const list = this.tracks.get(id);
    if (!list || !list.length) return null;
    if (t <= list[0].t) return { ...list[0] };
    const last = list[list.length - 1];
    if (t >= last.t) return { ...last };
    let lo = 0, hi = list.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = list[lo], b = list[hi];
    if (!a.alive || !b.alive) return { ...(b.alive ? b : a) };
    const u = (t - a.t) / (b.t - a.t || 1);
    return {
      t, alive: 1,
      x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u,
      crouch: (a.crouch || 0) + ((b.crouch || 0) - (a.crouch || 0)) * u,
    };
  }

  /** put enemies where the shooter saw them, run the shot, then put them back */
  rewind(match, shooter, t, orig, w) {
    const saved = [];
    for (const q of match.players.values()) {
      if (q === shooter || !q.alive || q.team === shooter.team) continue;
      const s = this.sample(q.id, t);
      if (!s || !s.alive) continue;
      saved.push([q, q.x, q.y, q.z, q.crouch || 0]);
      q.x = s.x; q.y = s.y; q.z = s.z; q.crouch = s.crouch || 0;
    }
    try { return orig(shooter, w); }
    finally { for (const [q, x, y, z, crouch] of saved) { q.x = x; q.y = y; q.z = z; q.crouch = crouch; } }
  }
}
