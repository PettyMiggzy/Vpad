// Shared bits of the website: the header and footer, the live match numbers from the game server, small helpers.
const PLAY = 'https://play.vyrebadlands.com', PAD = 'https://pad.vyrebadlands.com', X = 'https://x.com/vyrebadlands';
const page = document.body.dataset.page || '';
const links = [['/', 'Home', 'home'], ['/matches/', 'Matches', 'matches'], ['/armory/', 'Armory', 'armory'], ['/hub/', 'War hub', 'hub'], [PAD, 'WARHEADZ pad', 'pad']];
document.querySelector('#site-header').innerHTML = `
<header class="nav"><div class="wrap">
  <a class="brand" href="/"><img src="/img/logo-badlands.webp" alt="Vyre Bad Lands" width="86" height="40"></a>
  <nav id="nav">${links.map(([h, t, k]) => `<a href="${h}" class="${k === page ? 'on' : ''}"${k === 'pad' ? ' rel="noopener"' : ''}>${t}</a>`).join('')}</nav>
  <span class="livepill off" id="livepill"><i></i><span id="livetext">checking</span></span>
  <a class="btn primary small" href="${PLAY}/" rel="noopener">PLAY NOW</a>
  <button class="burger" id="burger" aria-label="Menu">MENU</button>
</div></header>`;
document.querySelector('#site-footer').innerHTML = `
<footer><div class="wrap">
  <div class="cols">
    <div><img src="/img/logo-badlands.webp" alt="" width="120" height="55" style="margin-bottom:12px"><div style="max-width:300px">A first-person team shooter for token communities. Free to play, play money only for now.</div></div>
    <div><h4>Play</h4><a href="${PLAY}/">Play in your browser</a><a href="/matches/">Live and upcoming matches</a><a href="/armory/">Armory and loadouts</a><a href="/hub/">War hub</a><span class="soon">Android and iPhone apps: coming soon</span></div>
    <div><h4>Ecosystem</h4><a href="${PAD}" rel="noopener">WARHEADZ launchpad (testnet)</a><a href="${X}" rel="noopener">@vyrebadlands on X</a><a href="https://t.me/Vyrebadlands" rel="noopener">Telegram</a></div>
    <div><h4>Help</h4><a href="/support/">Support and controls</a><a href="/privacy/">Privacy policy</a><a href="/terms/">Terms of play</a></div>
  </div>
  <div class="legal">Vyre Bad Lands is a prototype. Everything in the game uses play money; nothing on this website or in the game moves real money. The war hub asks your wallet for a free signature to link your soldier and never for a payment. Paying with a wallet may come later and only after a legal review. The WARHEADZ launchpad runs on a test network. This is not financial advice, and no result or reward is promised to anyone.</div>
</div></footer>`;
document.getElementById('burger').onclick = () => document.getElementById('nav').classList.toggle('open');

const get = async (path, ms = 6000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(PLAY + path, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };
/** the running matches from the game server; null when it does not answer */
export async function liveStats() {
  try { return await get('/stats'); } catch { /* an older server has no /stats: fall back to the plain list */ }
  try { const rooms = await get('/rooms'); return { rooms: rooms.length, players: rooms.reduce((n, r) => n + (r.humans ?? 0), 0), bots: 0, matches: rooms.map((r) => ({ ...r, humans: r.humans ?? 0, bots: r.bots ?? 0, objective: r.objective ?? 'elim', score: r.score ?? [0, 0], phase: r.phase ?? 'live', timer: r.timer ?? 0 })), maxRooms: 12 }; } catch { return null; }
}
const pill = (s) => { const p = document.getElementById('livepill'); if (!p) return; p.classList.toggle('off', !s || !s.rooms); document.getElementById('livetext').textContent = !s ? 'server offline' : s.rooms ? `${s.rooms} live match${s.rooms === 1 ? '' : 'es'}` : 'no matches right now'; };
export const MAPS = { cargo: 'Cargo Yard', dust: 'Dust Town', refinery: 'Refinery', testsite: 'Test Site', training: 'Training Yard' };
export const TYPES = { elim: 'Elimination', zone: 'Hold the Zone', dm: 'Deathmatch' };
export const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export { PLAY, PAD, X };
let last = null;
export async function watchLive(cb, every = 5000) {
  const tick = async () => { last = await liveStats(); pill(last); document.querySelectorAll('[data-live="matches"]').forEach((e) => { e.textContent = last ? last.rooms : '–'; }); document.querySelectorAll('[data-live="players"]').forEach((e) => { e.textContent = last ? last.players : '–'; }); if (cb) cb(last); };
  await tick(); setInterval(tick, every);
}
