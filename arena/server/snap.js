// Snapshots stay in the same shape the page already reads. Positions are snapped to a short grid, and a soldier
// whose whole row is unchanged is left out. A snapshot with full: 1 is the whole list again (the first one, a
// change of who is in the match, and about once a second).
export const POS_Q = 2;
export const Z_Q = 0.05;
const FULL_EVERY = 20;

export function quantRow(row) {
  const q = row.slice();
  q[2] = Math.round(row[2] / POS_Q) * POS_Q;
  q[3] = Math.round(row[3] / POS_Q) * POS_Q;
  q[9] = Math.round(Math.round(row[9] / Z_Q) * Z_Q * 1000) / 1000;
  return q;
}

function rowKey(q) { return q.join('\0'); }

export function slimSnap(state, snap) {
  const rows = snap.p.map(quantRow);
  const ids = rows.map((r) => r[0]).join(',');
  const full = !state || state.ids !== ids || state.since >= FULL_EVERY;
  const keys = new Map();
  const p = [];
  for (const q of rows) {
    const k = rowKey(q);
    keys.set(q[0], k);
    if (full || state.keys.get(q[0]) !== k) p.push(q);
  }
  const out = { ...snap, p };
  if (full) out.full = 1; else delete out.pk;      // what lies on the floor is sent whole with a full snapshot; between those the events carry the changes
  return { snap: out, state: { keys, ids, since: full ? 0 : state.since + 1 } };
}

/** fold a delta into the last full picture. A full snapshot replaces the list. */
export function mergeSnap(prev, snap) {
  if (!snap) return prev || null;
  if (!prev || snap.full || !Array.isArray(prev.p)) return { ...snap, p: (snap.p || []).map((r) => r.slice()) };
  const by = new Map();
  for (const row of prev.p) by.set(row[0], row);
  for (const row of snap.p || []) by.set(row[0], row.slice());
  return { ...snap, p: [...by.values()] };
}
