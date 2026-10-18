// The page's side of a hosted game: where the match server is, who this player is, and the shop calls that keep the profile on the server.
// With no server (or one that does not answer) the page plays offline against bots, exactly as before.
const PID_KEY = 'vyre.arena.pid';

/** the server address: ?server=URL, else the build's VITE_SERVER ('auto' means the same address the page came from); '' is offline */
export function serverUrl() {
  const q = new URLSearchParams(location.search);
  if (q.has('offline')) return '';
  let v = q.get('server') ?? import.meta.env.VITE_SERVER ?? '';
  if (v === 'auto') v = location.origin;
  v = String(v).trim().replace(/\/+$/, '');
  return /^(https?|wss?):\/\/[^\s/]+(:\d+)?$/.test(v) ? v : '';
}

const httpBase = (url) => url.replace(/^ws/, 'http');

/** the random id this browser plays under; the server keeps the coins, level and gear against it */
export function playerId() {
  try {
    const old = localStorage.getItem(PID_KEY);
    if (old && /^[a-f0-9-]{16,64}$/.test(old)) return old;
  } catch { /* storage may be blocked */ }
  const b = crypto.getRandomValues(new Uint8Array(16));
  const id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(PID_KEY, id); } catch { /* the id lasts for this visit only */ }
  return id;
}

async function call(url, path, init, ms = 5000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(httpBase(url) + path, { ...init, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return j;
  } finally { clearTimeout(timer); }
}

/** true when the server answers its health check */
export async function reachable(url) {
  try { const j = await call(url, '/health', {}, 2500); return j.ok === true; } catch { return false; }
}

const FIELDS = ['coins', 'owned', 'loadout', 'xp', 'weaponKills', 'classes', 'activeClass'];
/** replace what the page holds with the server's copy (in place: the menu keeps its reference) */
export function adopt(profile, from) {
  if (!from || from.error) return false;
  for (const k of FIELDS) if (from[k] !== undefined) profile[k] = from[k];
  return true;
}

export async function pullProfile(url, pid, profile) {
  try { return adopt(profile, await call(url, `/api/profile?pid=${encodeURIComponent(pid)}`, {})); } catch { return false; }
}

const post = (url, path, body) => call(url, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** the shop and class actions the menu took locally, repeated on the server (whose answer wins) */
export async function mirrorShop(url, pid, profile, op, a, b) {
  try {
    let r;
    if (op === 'buy') r = await post(url, '/api/buy', { pid, item: a });
    else if (op === 'equip') r = await post(url, '/api/equip', { pid, item: a });
    else r = await post(url, '/api/class', { pid, op: op.replace('class-', ''), i: a, name: b });
    return adopt(profile, r);
  } catch { return false; }
}

/** a short line saying which part of the way to the match server is broken, shown when joining fails */
export async function diagnose(url) {
  const out = [];
  out.push(`server ${(await reachable(url)) ? 'answers' : 'does not answer'}`);
  const ws = await new Promise((res) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; res(v); } };
    try {
      const w = new WebSocket(url.replace(/^http/, 'ws') + '/diagprobe/diagprobe2');
      w.onopen = () => { fin('connects'); try { w.close(); } catch { /* closed */ } };
      w.onerror = () => fin('is blocked');
      setTimeout(() => fin('timed out'), 4000);
    } catch (e) { fin(`failed (${e?.message || e})`); }
  });
  out.push(`live link ${ws}`);
  return out.join(', ');
}

/** a short code that links this player to a wallet on the website's war hub (the page shows it; the website checks the wallet's signature) */
export async function askLinkCode(url, pid) {
  try { return await post(url, '/api/link/code', { pid }); } catch { return { error: 'the server did not answer' }; }
}
