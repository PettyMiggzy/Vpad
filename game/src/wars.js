/** one war per pair of nations (the latest raid between them), and only the newest few: a chain that has seen thousands of raids must still give a readable map */
export function tidyWars(wars, max = 6) {
  const byPair = new Map();
  for (const w of wars || []) { const k = JSON.stringify([w.a, w.b].sort()); byPair.delete(k); byPair.set(k, w); }   // a later raid replaces the earlier one and counts as newest
  return max > 0 ? [...byPair.values()].slice(-max) : [];
}
