// The play-test's screens: founding a nation, the money and clock strip, the game log, the nations ranking, the menu (speed, feedback,
// new game) and the raid planner. Plain DOM over the game, so it works the same on a phone. All of it reads and drives `Sim` (sim.js).
import { R, H, UNIT, COLORS, SPEEDS, fmtLeft, fmtCoin, cleanName } from './sim.js';
import { LAND, COAST, PASS } from './terrain.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EMBLEMS = [['bruiser', 'Bruiser', 'beats tricksters'], ['sniper', 'Sniper', 'beats bruisers'], ['trickster', 'Trickster', 'beats snipers'], ['defender', 'Defender', 'holds the line']];
export const gameClock = (sim) => { const h = Math.max(0, (sim.now - 1000 * H) / H); return `D${Math.floor(h / 24) + 1} · ${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };

/** start the battle scene from anywhere: every other running scene is stopped first, so two scenes can never run at once */
export function openBattle(data) {
  const g = window.__game;
  clearToasts();
  for (const sc of g.scene.getScenes(true)) if (sc.scene.key !== 'battle') g.scene.stop(sc.scene.key);
  g.scene.start('battle', data);
}
export function clearToasts() { document.querySelectorAll('.toasts .toast').forEach((t) => t.remove()); }

export function toast(text, action) {
  const box = document.querySelector('.toasts') || (() => { const d = document.createElement('div'); d.className = 'toasts'; document.body.appendChild(d); return d; })();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').addEventListener('click', () => { action.run(); t.remove(); });
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 5500);
  setTimeout(() => t.remove(), 6200);
  while (box.children.length > 3) box.firstChild.remove();
}

// ---------------------------------------------------------------- the strip and rail on the map
export function mountHud(scene) {
  const sim = scene.sim;
  const ui = document.getElementById('ui');
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="sbx-bar">
      <span class="chip"><i>coin</i><b data-coin>0</b></span><span class="chip"><i>USDC</i><b data-usdc>0</b></span>
      <span class="chip clk"><b data-clock></b><button data-speed></button></span><span class="chip warn" data-nosave hidden><b>⚠ not saving</b></span></div>
    <div class="sbx-rail">
      <button data-base><b>🏰</b><span>Base</span><em data-ready hidden></em></button><button data-log><b>📜</b><span>Log</span></button>
      <button data-rank><b>🏆</b><span>Nations</span></button><button data-menu><b>⚙</b><span>Menu</span></button></div>`;
  ui.append(...wrap.children);
  const q = (s) => ui.querySelector(s);
  const refresh = () => {
    const p = sim.player;
    q('[data-coin]').textContent = p ? fmtCoin(p.coin) : '-';
    q('[data-usdc]').textContent = p ? `$${Math.floor(p.usdc)}` : '-';
    q('[data-clock]').textContent = gameClock(sim);
    q('[data-speed]').textContent = `${sim.speed}×`;
    const ready = sim.readyJobs().reduce((t, j) => t + j.count, 0);
    const r = q('[data-ready]'); r.hidden = !ready; r.textContent = ready;
    q('[data-base]').disabled = !p;
    q('[data-nosave]').hidden = !sim.saveFailed;
  };
  q('[data-speed]').addEventListener('click', () => { sim.setSpeed(SPEEDS[(SPEEDS.indexOf(sim.speed) + 1) % SPEEDS.length]); refresh(); });
  q('[data-base]').addEventListener('click', () => { if (sim.player) scene.scene.start('base', { nation: sim.player }); });
  q('[data-log]').addEventListener('click', () => openLog(scene));
  q('[data-rank]').addEventListener('click', () => openNations(scene));
  q('[data-menu]').addEventListener('click', () => openMenu(scene));
  refresh();
  return { refresh };
}

export function openLog(scene) {
  const sim = scene.sim;
  const rows = sim.log.slice(-25).reverse().map((e) => `<div class="logrow ${esc(e.kind)}"><span>${esc(e.text)}</span>${e.report ? '<button class="btn small" data-replay="' + sim.log.indexOf(e) + '">Watch</button>' : ''}<small>${gameAgo(sim, e.t)}</small></div>`).join('');
  scene.sheet.open(`<h2>Game log</h2><div class="sub">what happened, newest first</div><div class="loglist">${rows || '<div class="note">Nothing yet.</div>'}</div><div class="row"><button class="btn" data-close>Close</button></div>`, {
    replay: (b) => { const e = sim.log[Number(b.dataset.replay)]; if (e && e.report) openBattle({ report: e.report, back: 'map' }); },
  });
}
const gameAgo = (sim, t) => { const d = sim.now - t; return d < 90 * 60000 ? `${Math.max(1, Math.round(d / 60000))} min ago` : d < 48 * H ? `${Math.round(d / H)} h ago` : `${Math.round(d / (24 * H))} days ago`; };

export function openNations(scene) {
  const sim = scene.sim;
  const rows = sim.nations.slice().sort((a, b) => sim.strength(b) - sim.strength(a)).map((n, i) => `
    <div class="nrow ${n.isPlayer ? 'me' : ''}" data-nation="${esc(n.name)}"><b>${i + 1}</b><span class="dot" style="background:${hex(n.color)}"></span><span class="nm">${esc(n.name)}${n.isPlayer ? ' (you)' : ''}</span>
      <small>${sim.strength(n).toLocaleString()} power · ${n.plots.length} plot${n.plots.length > 1 ? 's' : ''}${sim.protectedLeft(n) ? ' · 🛡' : ''}</small></div>`).join('');
  scene.sheet.open(`<h2>Nations</h2><div class="sub">ranked by army strength · tap one to find it on the map</div><div class="loglist">${rows}</div><div class="row"><button class="btn" data-close>Close</button></div>`, {
    nation: (b) => { const n = sim.byName(b.dataset.nation); if (n) { scene.sheet.close(); scene.cameras.main.pan(scene.px(n.plots[0][0]) + 28, scene.px(n.plots[0][1]) + 28, 600, 'Sine.easeInOut'); } },
  });
  // rows are divs, not buttons: route their taps through the sheet's handler
  document.querySelectorAll('.nrow').forEach((r) => r.addEventListener('click', () => { const n = sim.byName(r.dataset.nation); if (n) { scene.sheet.close(); scene.cameras.main.pan(scene.px(n.plots[0][0]) + 28, scene.px(n.plots[0][1]) + 28, 600, 'Sine.easeInOut'); } }));
}

export function openMenu(scene) {
  const sim = scene.sim;
  scene.sheet.open(`
    <h2>Menu</h2><div class="sub">play test · play money · saved in this browser only</div>
    <label class="lbl">Game speed</label>
    <div class="row seg">${SPEEDS.map((s) => `<button class="btn ${s === sim.speed ? 'primary' : ''}" data-spd="${s}">${s}×<br><small>${s === 1 ? 'real time, while open' : s === 60 ? '1 h = 1 min' : '1 h = 6 s'}</small></button>`).join('')}</div>
    <label class="lbl" style="margin-top:14px">Tell the team what you think</label>
    <textarea data-note placeholder="What was confusing, broken, boring or fun? It is saved here; Copy gives you everything to paste to the team.">${esc(scene.noteDraft || '')}</textarea>
    <div class="row"><button class="btn" data-addnote>Save note</button><button class="btn" data-copy>Copy all notes (${sim.notes.length})</button></div>
    <div class="row" style="margin-top:10px"><button class="btn danger" data-wipe>New game (wipes this save)</button><button class="btn" data-close>Close</button></div>
    <div class="note">Rules are the real game's: 1 h training, 24 h cooldowns, shields up to 72 h, a raid takes 20% of the loser's war pool, a win costs the winner 10% of what it sent, the loser's home army 30%; a failed raid costs half of what was sent. Coin and USDC here are free play money; raids reach ${R.REACH} tiles; the other nations are computer-run.</div>`, {
    spd: (b) => { scene.noteDraft = document.querySelector('[data-note]')?.value || ''; sim.setSpeed(Number(b.dataset.spd)); scene.sbx?.refresh(); openMenu(scene); },
    addnote: () => { const t = document.querySelector('[data-note]').value.trim(); if (!t) { toast('Write a note first'); return; } sim.addNote(t, gameClock(sim)); scene.noteDraft = ''; toast(sim.save() ? 'Note saved' : 'Could not save: this browser is out of storage or blocks it. Copy your notes now.'); openMenu(scene); },
    copy: async () => { const txt = sim.notes.map((n) => `[${n.day}] ${n.text}`).join('\n') || '(no notes)'; try { await navigator.clipboard.writeText(txt); toast('Notes copied'); } catch (_) { window.prompt('Copy this', txt); } },
    wipe: () => { if (window.confirm('Wipe this save and start a new game?')) { sim.reset(); window.location.reload(); } },
  });
}

// ---------------------------------------------------------------- founding a nation
export function openOnboarding(scene) {
  const sim = scene.sim;
  const root = document.createElement('div');
  root.className = 'modal';
  const free = COLORS.filter((c) => !sim.nations.some((n) => n.color === c));
  const palette = free.length >= 3 ? free : COLORS;
  let emblem = 'bruiser', color = palette[0];
  root.innerHTML = `
    <div class="card big">
      <img class="ttl" src="art/title/badlands.png" alt="Vyre Bad Lands" />
      <p class="lead">Found a nation, train an army, build defenses and raid your neighbours. This is a play test with play money: nothing here touches a wallet or a chain.</p>
      <label class="lbl">Nation name</label>
      <input data-name maxlength="12" placeholder="e.g. WARHEADZ" autocomplete="off" />
      <label class="lbl">Your champion</label>
      <div class="picks">${EMBLEMS.map(([k, n, d]) => `<button data-em="${k}" class="${k === emblem ? 'on' : ''}"><img src="art/trim/${k}.png" alt=""/><b>${n}</b><small>${d}</small></button>`).join('')}</div>
      <label class="lbl">Colour</label>
      <div class="swatches">${palette.map((c) => `<button data-col="${c}" class="${c === color ? 'on' : ''}" style="background:${hex(c)}"></button>`).join('')}</div>
      <div class="err" data-err></div>
      <button class="btn primary" data-next>Choose my land →</button>
    </div>`;
  document.body.appendChild(root);
  root.querySelectorAll('[data-em]').forEach((b) => b.addEventListener('click', () => { emblem = b.dataset.em; root.querySelectorAll('[data-em]').forEach((x) => x.classList.toggle('on', x === b)); }));
  root.querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => { color = Number(b.dataset.col); root.querySelectorAll('[data-col]').forEach((x) => x.classList.toggle('on', x === b)); }));
  root.querySelector('[data-name]').addEventListener('keydown', (e) => { if (e.key === 'Enter') root.querySelector('[data-next]').click(); });
  root.querySelector('[data-next]').addEventListener('click', () => {
    const name = cleanName(root.querySelector('[data-name]').value);
    const err = root.querySelector('[data-err]');
    if (name.length < 2) { err.textContent = 'Give your nation a name (2 to 12 letters or numbers).'; return; }
    if (sim.byName(name)) { err.textContent = 'That name is taken by another nation.'; return; }
    root.remove();
    startPicking(scene, name, emblem, color);
  });
}

function startPicking(scene, name, emblem, color) {
  const sim = scene.sim;
  scene.pick = { name, emblem, color };
  const spots = [];
  for (let y = -sim.radius; y <= sim.radius; y++) for (let x = -sim.radius; x <= sim.radius; x++) if (sim.canFound(x, y)) spots.push([x, y]);
  const g = scene.add.graphics().setDepth(9650);
  const TILE = 56;
  for (const [x, y] of spots) {
    const k = sim.kind(x, y);
    const col = k === COAST ? 0xb6ff00 : k === PASS ? 0xffd24a : 0xffffff;
    g.fillStyle(col, 0.22).fillRect(scene.px(x) + 3, scene.px(y) + 3, TILE - 6, TILE - 6).lineStyle(2, col, 0.9).strokeRect(scene.px(x) + 3, scene.px(y) + 3, TILE - 6, TILE - 6);
  }
  scene.tweens.add({ targets: g, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
  scene.pickGfx = g;
  document.getElementById('ui').insertAdjacentHTML('beforeend', `<div class="pickbanner"><b>Pick your land</b><span>Tap a highlighted plot. Lime = coast, gold = mountain pass (premium, $${R.PREMIUM_PLOT}); white = open ground (free). You start protected for 24 hours.</span></div>`);
  const first = spots.find(([x, y]) => sim.kind(x, y) === LAND) || spots[0];
  if (first) scene.cameras.main.centerOn(scene.px(first[0]) + 28, scene.px(first[1]) + 28);
}

export function confirmClaim(scene, x, y) {
  const sim = scene.sim, p = scene.pick;
  if (!sim.canFound(x, y)) { toast('That plot is not open: pick a highlighted one.'); return; }
  const k = sim.kind(x, y), prem = k !== LAND;
  scene.sheet.open(`<h2>Claim this land?</h2><div class="sub">${k === COAST ? 'Coast plot (premium)' : k === PASS ? 'Mountain pass (premium, +20% defense)' : 'Open ground'} at ${x}, ${y}</div>
    <div class="note" style="margin-top:0">${prem ? `This costs $${R.PREMIUM_PLOT} of your $${R.START_USDC} play USDC.` : 'This plot is free.'} You also get ${fmtCoin(R.START_COIN)} play coin and 24 hours of protection.</div>
    <div class="row"><button class="btn primary" data-go>Found ${esc(p.name)}</button><button class="btn" data-close>Choose again</button></div>`, {
    go: () => {
      try { sim.claim(p.name, p.emblem, p.color, x, y); } catch (e) { toast(e.message); return; }
      scene.pick = null; document.querySelector('.pickbanner')?.remove();
      scene.scene.restart();
    },
  });
}

// ---------------------------------------------------------------- the raid planner
/** HTML for planning a raid of `a` (the player) on `d`; bind it with bindPlanner */
export function plannerHtml(sim, a, d) {
  const sl = [0, 1, 2].map((i) => `<label class="slide"><span>${UNIT[i]} <b data-n="${i}">${a.units[i]}</b> / <em data-m="${i}">${a.units[i]}</em></span><input type="range" min="0" max="${a.units[i]}" value="${a.units[i]}" data-send="${i}" ${a.units[i] ? '' : 'disabled'} /></label>`).join('');
  const total = d.units[0] + d.units[1] + d.units[2] + d.units[3];
  return `<div class="planner">
    <div class="foe"><b style="color:${hex(d.color)}">${esc(d.name)}</b> <small>${total} units (${d.units.map((u, i) => `${u} ${UNIT[i].toLowerCase()}`).join(', ')}) · wall ${d.wall} · tower ${d.tower}</small></div>
    ${sl}
    <div class="fight" data-plan></div>
    <div class="why" data-why></div>
    ${a.protectedUntil > sim.clock ? '<div class="why">• Launching a raid ends your own shield.</div>' : ''}
    <button class="btn danger" data-launch>Launch the raid</button></div>`;
}

let activePlanner = null;
/** re-evaluates the open raid planner (cooldowns and protection end with the clock, not only when a slider moves) */
export function refreshPlanner() {
  const a = activePlanner;
  if (!a) return;
  // the planner lives in a sheet whose contents get replaced: it is gone as soon as its sliders are
  if (!a.root.isConnected || !a.root.querySelector('[data-send="0"]') || !a.root.querySelector('[data-plan]')) { activePlanner = null; return; }
  try { a.calc(); } catch (_) { activePlanner = null; }
}
export function dropPlanner() { activePlanner = null; }

export function bindPlanner(root, sim, a, d, onReport) {
  const send = () => [0, 1, 2].map((i) => Number(root.querySelector(`[data-send="${i}"]`).value));
  const calc = () => {
    [0, 1, 2].forEach((i) => {   // the army can change while the planner is open (a raid on you): the slider follows it
      const el = root.querySelector(`[data-send="${i}"]`);
      el.max = a.units[i]; if (Number(el.value) > a.units[i]) el.value = a.units[i];
      root.querySelector(`[data-m="${i}"]`).textContent = a.units[i];
    });
    const s = send();
    [0, 1, 2].forEach((i) => { root.querySelector(`[data-n="${i}"]`).textContent = s[i]; });
    const pl = sim.plan(a, d, s);
    const t = Math.max(1, pl.attack + pl.defense);
    root.querySelector('[data-plan]').innerHTML = `<div class="bar"><i style="width:${Math.round((pl.attack / t) * 100)}%"></i></div><div class="vs"><span>attack <b>${pl.attack.toLocaleString()}</b></span><span>defense <b>${pl.defense.toLocaleString()}</b>${pl.onPass ? ' <small>(+20% pass)</small>' : ''}</span></div><div class="${pl.success ? 'win' : 'lose'}">${pl.success ? 'WOULD SUCCEED' : 'WOULD FAIL'}</div>`;
    root.querySelector('[data-why]').innerHTML = pl.why.map((w) => `<div>• ${esc(w)}</div>`).join('');
    root.querySelector('[data-launch]').disabled = pl.why.length > 0;
  };
  root.querySelectorAll('[data-send]').forEach((el) => el.addEventListener('input', calc));
  root.querySelector('[data-launch]').addEventListener('click', () => {
    try { onReport(sim.raid(a, d, send())); } catch (e) { toast(e.message); }
  });
  activePlanner = { root, calc };
  calc();
}
