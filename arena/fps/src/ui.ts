// The page around the 3D view: the menu with the loadout shop, the scoreboard, health, kill feed, banners, name tags and the touch controls.
// All of it is ordinary HTML laid over the canvas, so it stays sharp and works with a thumb.
import { CATALOG, SLOTS } from './sim/items.js';
import { buy, equip, type Profile } from './profile.js';
import { SEATS, DEFAULT_SEATS } from './config.js';
import { HELD, HELD_SIZE } from './art.js';

type Item = { slot: string; name: string; cost: number; blurb: string };
const items = CATALOG as unknown as Record<string, Item>;
const TAB_NAMES: Record<string, string> = { weapon: 'Weapon', armor: 'Armour', boots: 'Boots', camo: 'Camo' };

export interface PlayChoice { name: string; team: 0 | 1; seats: number }
export interface UiOptions {
  teamNames: [string, string];
  teamColors: readonly [string, string];
  profile: Profile;
  save: () => void;
  onPlay: (c: PlayChoice) => void;
  onResume: () => void;
}

const CSS = `
:root { --lime: #b6ff00; --bg: #050805; --panel: rgba(10,16,8,.92); --line: rgba(182,255,0,.28); --text: #eef6e4; --muted: #9aa98e; }
.vy, .vy * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.vy [hidden] { display: none !important; }
#vy-hud { position: fixed; inset: 0; pointer-events: none; z-index: 3; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text); user-select: none; -webkit-user-select: none; }
#vy-hud .bar { position: absolute; left: 50%; top: calc(8px + env(safe-area-inset-top)); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 7px 14px; font-weight: 800; white-space: nowrap; }
#vy-hud .t { display: flex; flex-direction: column; align-items: center; min-width: 74px; font-size: 12px; letter-spacing: .06em; }
#vy-hud .t b { font-size: 20px; line-height: 1; } #vy-hud .t small { color: var(--muted); font-weight: 600; }
#vy-hud .mid { display: flex; flex-direction: column; align-items: center; font-size: 11px; color: var(--muted); } #vy-hud .mid b { color: #fff; font-size: 18px; }
#vy-hud .pips { display: flex; gap: 4px; margin-top: 3px; } #vy-hud .pips i { width: 9px; height: 9px; border-radius: 50%; border: 2px solid currentColor; } #vy-hud .pips i.on { background: currentColor; }
#vy-banner { position: absolute; left: 0; right: 0; top: 24%; text-align: center; font-size: clamp(28px, 7vw, 60px); font-weight: 900; letter-spacing: .05em; text-shadow: 0 4px 18px #000; opacity: 0; transition: opacity .25s; }
#vy-banner.on { opacity: 1; } #vy-banner small { display: block; font-size: .32em; letter-spacing: .12em; color: var(--muted); margin-top: 6px; font-weight: 700; }
#vy-cross { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; transform: translate(-50%, -50%); }
#vy-cross::before, #vy-cross::after { content: ''; position: absolute; background: #fff; box-shadow: 0 0 3px #000; }
#vy-cross::before { left: 12px; top: 0; width: 2px; height: 26px; -webkit-mask: linear-gradient(#000 0 8px, transparent 8px 18px, #000 18px); mask: linear-gradient(#000 0 8px, transparent 8px 18px, #000 18px); }
#vy-cross::after { top: 12px; left: 0; height: 2px; width: 26px; -webkit-mask: linear-gradient(90deg, #000 0 8px, transparent 8px 18px, #000 18px); mask: linear-gradient(90deg, #000 0 8px, transparent 8px 18px, #000 18px); }
#vy-hitm { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; transform: translate(-50%, -50%) rotate(45deg); opacity: 0; transition: opacity .12s; border: 2px solid var(--lime); }
#vy-hitm.on { opacity: 1; transition: none; }
#vy-hurt { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255,40,20,0) 50%, rgba(255,40,20,.6) 100%); opacity: 0; transition: opacity .35s; }
#vy-hurt.on { opacity: 1; transition: none; }
#vy-held { position: absolute; right: calc(-1vw); bottom: -3vh; width: min(58vw, 78vh); transform-origin: 80% 100%; will-change: transform; }
#vy-held img { display: block; width: 100%; height: auto; filter: drop-shadow(0 6px 10px rgba(0,0,0,.55)); }
#vy-held i { position: absolute; top: 0; width: 17%; aspect-ratio: 1; transform: translate(-50%, -45%); border-radius: 50%; background: radial-gradient(circle, #fff 0 18%, #ffe27a 34%, rgba(255,150,40,.0) 70%); opacity: 0; }
#vy-held i.on { opacity: 1; }
#vy-me { position: absolute; left: calc(14px + env(safe-area-inset-left)); bottom: calc(14px + env(safe-area-inset-bottom)); width: min(260px, 46vw); }
#vy-me .hp { height: 14px; border-radius: 7px; background: rgba(0,0,0,.6); border: 1px solid var(--line); overflow: hidden; } #vy-me .hp i { display: block; height: 100%; width: 100%; background: var(--lime); transition: width .12s; }
#vy-me b { font-size: 26px; text-shadow: 0 2px 8px #000; } #vy-me small { color: var(--muted); font-size: 11px; display: block; }
#vy-gun { position: absolute; right: calc(14px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom)); text-align: right; font-weight: 800; text-shadow: 0 2px 8px #000; }
#vy-gun small { display: block; color: var(--muted); font-size: 11px; font-weight: 600; }
#vy-feed { position: absolute; right: 10px; top: calc(66px + env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: flex-end; gap: 3px; font-size: 12px; font-weight: 700; }
#vy-feed span { background: rgba(0,0,0,.55); border-radius: 8px; padding: 2px 8px; }
.vy-tag { position: absolute; transform: translate(-50%, -100%); font-size: 11px; font-weight: 800; text-shadow: 0 1px 4px #000; white-space: nowrap; }
.vy-tag i { display: block; height: 3px; border-radius: 2px; background: currentColor; margin: 2px auto 0; width: 34px; }
#vy-touch { position: absolute; inset: 0; pointer-events: none; }
#vy-touch .stick { position: absolute; width: 110px; height: 110px; margin: -55px 0 0 -55px; border-radius: 50%; border: 2px solid rgba(182,255,0,.4); background: rgba(182,255,0,.08); } #vy-touch .stick i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(182,255,0,.55); }
#vy-fire { position: absolute; right: calc(22px + env(safe-area-inset-right)); bottom: calc(86px + env(safe-area-inset-bottom)); width: 86px; height: 86px; border-radius: 50%; background: rgba(255,60,40,.35); border: 2px solid rgba(255,120,100,.8); color: #fff; font-weight: 900; display: grid; place-items: center; pointer-events: auto; touch-action: none; letter-spacing: .06em; }
#vy-fire.on { background: rgba(255,60,40,.7); }
#vy-pause { position: fixed; inset: 0; z-index: 4; display: grid; place-items: center; background: rgba(5,8,5,.72); color: #fff; font: 800 22px system-ui, sans-serif; letter-spacing: .06em; text-align: center; cursor: pointer; }
#vy-pause small { display: block; color: var(--muted); font-size: 13px; font-weight: 600; margin-top: 8px; letter-spacing: .02em; }
#vy-menu { position: fixed; inset: 0; background: radial-gradient(ellipse at 50% 15%, rgba(27,42,16,.9), rgba(5,8,5,.94) 70%); display: grid; place-items: center; padding: 14px; overflow-y: auto; z-index: 5; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text); }
#vy-menu .card { width: min(560px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 20px; }
#vy-menu h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: .06em; color: var(--lime); } #vy-menu .sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; line-height: 1.4; }
#vy-menu label { display: block; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 14px 0 6px; }
#vy-menu input, #vy-menu select { width: 100%; background: #0d160a; color: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px; font-size: 16px; }
#vy-menu .teams { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } #vy-menu .team { border: 2px solid var(--line); border-radius: 14px; padding: 12px; text-align: center; font-weight: 900; cursor: pointer; background: #0d160a; } #vy-menu .team.on { border-color: var(--c); box-shadow: 0 0 18px var(--c); } #vy-menu .team small { display: block; color: var(--muted); font-weight: 600; margin-top: 3px; }
#vy-menu .tabs { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; } #vy-menu .tab { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: #0d160a; font-weight: 800; font-size: 13px; cursor: pointer; } #vy-menu .tab.on { background: var(--lime); color: #071000; border-color: var(--lime); }
#vy-menu .items { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; } #vy-menu .it { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--line); background: #0d160a; border-radius: 12px; padding: 8px 10px; } #vy-menu .it b { display: block; font-size: 14px; } #vy-menu .it small { color: var(--muted); font-size: 11px; }
#vy-menu .it button { border: 0; border-radius: 9px; padding: 8px 12px; font-weight: 900; font-size: 13px; cursor: pointer; background: var(--lime); color: #071000; min-width: 78px; } #vy-menu .it button.eq { background: transparent; color: var(--lime); border: 1px solid var(--lime); } #vy-menu .it button:disabled { opacity: .45; }
#vy-menu button.go { width: 100%; margin-top: 18px; background: var(--lime); color: #071000; border: 0; border-radius: 14px; padding: 15px; font-size: 18px; font-weight: 900; letter-spacing: .04em; cursor: pointer; }
#vy-menu .err { color: #ff8a70; font-size: 13px; margin-top: 8px; min-height: 18px; } #vy-menu .note { font-size: 11px; color: var(--muted); margin-top: 12px; line-height: 1.45; }
`;

export class Ui {
  private el: Record<string, HTMLElement> = {};
  private tab = 'weapon';
  private team: 0 | 1 = 0;
  private tags = new Map<string, HTMLElement>();
  private bannerTimer = 0;
  readonly touch: boolean;
  /** the move stick and the look finger are read by the main loop */
  move = { x: 0, y: 0 };
  lookDelta = { x: 0, y: 0 };
  fireTouch = false;

  constructor(private o: UiOptions) {
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement('div'); root.className = 'vy';
    const [a, b] = o.teamNames, [ca, cb] = o.teamColors;
    root.innerHTML = `
<div id="vy-hud" hidden>
  <div id="vy-hurt"></div>
  <div class="bar"><div class="t" style="color:${ca}"><b data-n="0">0</b><span>${a}</span><div class="pips" data-pips="0"></div></div><div class="mid"><span data-round>ROUND 1</span><b data-time>0</b><span data-alive></span></div><div class="t" style="color:${cb}"><b data-n="1">0</b><span>${b}</span><div class="pips" data-pips="1"></div></div></div>
  <div id="vy-feed"></div><div id="vy-banner"></div>
  <div id="vy-held" hidden><img alt=""><i></i></div>
  <div id="vy-cross"></div><div id="vy-hitm"></div>
  <div id="vy-me"><b data-hp>100</b><div class="hp"><i></i></div><small data-me></small></div>
  <div id="vy-gun"><span data-gun></span><small data-coins></small></div>
  <div id="vy-tags"></div>
  <div id="vy-touch" hidden><div class="stick" hidden><i></i></div><div id="vy-fire">FIRE</div></div>
</div>
<div id="vy-pause" hidden>PAUSED<small>${'ontouchstart' in window ? 'Tap to keep playing' : 'Click to keep playing. Esc frees the mouse.'}</small></div>
<div id="vy-menu">
  <div class="card">
    <h1>TOKEN ARENA</h1>
    <div class="sub">First-person team shooter. Two token teams, best of three rounds, bots fill the empty seats so a match is always on. Play money only: nothing here touches a wallet. Prototype.</div>
    <label>Your name</label><input id="vy-name" type="text" maxlength="12" placeholder="e.g. FROGGY" autocomplete="off" />
    <label>Your team (a token)</label>
    <div class="teams">
      <div class="team on" data-team="0" style="--c:${ca}">${a}<small>tap to join</small></div>
      <div class="team" data-team="1" style="--c:${cb}">${b}<small>tap to join</small></div>
    </div>
    <label>Loadout shop <span id="vy-coins" style="float:right;color:var(--lime);letter-spacing:0;font-size:14px;font-weight:800"></span></label>
    <div class="tabs" id="vy-tabs"></div>
    <div class="items" id="vy-items"></div>
    <label>Seats per side (humans and bots together)</label>
    <select id="vy-seats">${SEATS.map((n) => `<option${n === DEFAULT_SEATS ? ' selected' : ''}>${n}</option>`).join('')}</select>
    <button class="go" id="vy-go">PLAY</button>
    <div class="err" id="vy-err"></div>
    <div class="note">Earn coins from kills and wins, spend them in the shop. Move: WASD or the left thumb. Look: the mouse or drag with the right thumb. Fire: click or the FIRE button.</div>
  </div>
</div>`;
    document.body.appendChild(root);
    for (const id of ['vy-hud', 'vy-menu', 'vy-pause', 'vy-banner', 'vy-feed', 'vy-hitm', 'vy-hurt', 'vy-tags', 'vy-touch', 'vy-fire', 'vy-name', 'vy-seats', 'vy-err', 'vy-items', 'vy-tabs', 'vy-coins', 'vy-go']) this.el[id] = root.querySelector('#' + id) as HTMLElement;
    this.el.hud = this.el['vy-hud'];
    root.querySelectorAll<HTMLElement>('.team').forEach((t) => t.addEventListener('click', () => {
      this.team = t.dataset.team === '1' ? 1 : 0;
      root.querySelectorAll('.team').forEach((x) => x.classList.toggle('on', x === t));
    }));
    try { (this.el['vy-name'] as HTMLInputElement).value = localStorage.getItem('vyre.arena.name') || ''; } catch { /* storage may be blocked */ }
    this.el['vy-go'].addEventListener('click', () => {
      const name = (this.el['vy-name'] as HTMLInputElement).value.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 12) || 'Player';
      try { localStorage.setItem('vyre.arena.name', name); } catch { /* ignore */ }
      this.o.onPlay({ name, team: this.team, seats: Number((this.el['vy-seats'] as HTMLSelectElement).value) || DEFAULT_SEATS });
    });
    this.el['vy-pause'].addEventListener('click', () => this.o.onResume());
    this.renderShop();
    if (this.touch) this.wireTouch();
  }

  // ---- menu and shop ----
  renderShop(): void {
    const p = this.o.profile;
    this.el['vy-coins'].textContent = `${p.coins} coins`;
    this.el['vy-tabs'].innerHTML = (SLOTS as string[]).map((s) => `<div class="tab${s === this.tab ? ' on' : ''}" data-tab="${s}">${TAB_NAMES[s]}</div>`).join('');
    this.el['vy-tabs'].querySelectorAll<HTMLElement>('.tab').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.tab || 'weapon'; this.renderShop(); }));
    const rows = Object.entries(items).filter(([, it]) => it.slot === this.tab);
    this.el['vy-items'].innerHTML = rows.map(([id, it]) => {
      const owned = p.owned.includes(id), on = p.loadout[it.slot] === id;
      const btn = on ? '<button class="eq" disabled>Equipped</button>' : owned ? `<button class="eq" data-do="equip" data-id="${id}">Equip</button>` : `<button data-do="buy" data-id="${id}"${p.coins < it.cost ? ' disabled' : ''}>${it.cost} coins</button>`;
      return `<div class="it"><div><b>${it.name}</b><small>${it.blurb}</small></div>${btn}</div>`;
    }).join('');
    this.el['vy-items'].querySelectorAll<HTMLElement>('button[data-do]').forEach((b) => b.addEventListener('click', () => {
      const r = b.dataset.do === 'buy' ? buy(p, b.dataset.id || '') : equip(p, b.dataset.id || '');
      this.el['vy-err'].textContent = r.error || '';
      if (!r.error) this.o.save();
      this.renderShop();
    }));
  }
  showMenu(on: boolean): void { this.el['vy-menu'].hidden = !on; this.el.hud.hidden = on; if (on) this.renderShop(); }
  showPause(on: boolean): void { this.el['vy-pause'].hidden = !on; }
  menuOpen(): boolean { return !this.el['vy-menu'].hidden; }

  // ---- the gun in your hands ----
  setHeld(key: string | null): void {
    const w = this.q('#vy-held');
    if (!key || !HELD[`vm_${key}`]) { w.hidden = true; return; }
    const img = w.querySelector('img') as HTMLImageElement, tip = w.querySelector('i') as HTMLElement;
    img.src = HELD[`vm_${key}`]; tip.style.left = `${HELD_SIZE[`vm_${key}`][2] * 100}%`;
    w.hidden = false;
  }
  poseHeld(x: number, y: number, rotDeg: number, flash: boolean): void {
    const w = this.q('#vy-held');
    w.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rotDeg.toFixed(2)}deg)`;
    (w.querySelector('i') as HTMLElement).classList.toggle('on', flash);
  }

  // ---- in-match readouts ----
  private q<T extends HTMLElement = HTMLElement>(s: string): T { return this.el.hud.querySelector(s) as T; }
  setScore(score: number[], round: number, time: number, alive: number[], phase: string): void {
    this.q('[data-n="0"]').textContent = String(score[0]); this.q('[data-n="1"]').textContent = String(score[1]);
    for (const t of [0, 1]) this.q(`[data-pips="${t}"]`).innerHTML = [0, 1].map((i) => `<i class="${score[t] > i ? 'on' : ''}"></i>`).join('');
    this.q('[data-round]').textContent = `ROUND ${Math.max(1, round)}`;
    this.q('[data-time]').textContent = phase === 'live' || phase === 'countdown' ? String(time) : '-';
    this.q('[data-alive]').textContent = `${alive[0]} vs ${alive[1]} alive`;
  }
  setMe(hp: number, hpMax: number, text: string, gun: string, coins: number): void {
    this.q('[data-hp]').textContent = String(Math.max(0, Math.ceil(hp)));
    (this.q('#vy-me .hp i')).style.width = `${Math.max(0, Math.min(100, (hp / hpMax) * 100))}%`;
    this.q('[data-me]').textContent = text; this.q('[data-gun]').textContent = gun; this.q('[data-coins]').textContent = `${coins} coins`;
  }
  banner(title: string, sub = '', ms = 2200): void {
    const b = this.el['vy-banner']; b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; b.classList.add('on');
    clearTimeout(this.bannerTimer); if (ms > 0) this.bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
  }
  hideBanner(): void { this.el['vy-banner'].classList.remove('on'); }
  feed(html: string): void {
    const f = this.el['vy-feed'], s = document.createElement('span'); s.innerHTML = html; f.appendChild(s);
    while (f.children.length > 5) f.firstChild?.remove();
    window.setTimeout(() => s.remove(), 5000);
  }
  flash(id: 'vy-hitm' | 'vy-hurt'): void {
    const e = this.el[id]; e.classList.add('on'); window.setTimeout(() => e.classList.remove('on'), 90);
  }
  /** name tags over team-mates: x/y are screen pixels, null hides the tag */
  tag(id: string, text: string, color: string, hpFrac: number, x: number, y: number, show: boolean): void {
    let t = this.tags.get(id);
    if (!show) { if (t) t.style.display = 'none'; return; }
    if (!t) { t = document.createElement('div'); t.className = 'vy-tag'; this.el['vy-tags'].appendChild(t); this.tags.set(id, t); }
    t.style.display = 'block'; t.style.color = color; t.style.left = `${x}px`; t.style.top = `${y}px`;
    t.innerHTML = `${text}<i style="width:${Math.round(34 * Math.max(0, Math.min(1, hpFrac)))}px"></i>`;
  }
  dropTag(id: string): void { this.tags.get(id)?.remove(); this.tags.delete(id); }

  // ---- touch: a floating move stick on the left, look by dragging the right, a fire button ----
  private wireTouch(): void {
    const stick = this.el['vy-touch'].querySelector('.stick') as HTMLElement, knob = stick.firstElementChild as HTMLElement;
    this.el['vy-touch'].hidden = false;
    let mv: { id: number; x0: number; y0: number } | null = null, lk: { id: number; x: number; y: number } | null = null;
    const root = document.body;
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.el.hud.hidden || (e.target as HTMLElement).closest('#vy-fire,#vy-menu,#vy-pause')) return;
      if (e.clientX < innerWidth * 0.45 && !mv) { mv = { id: e.pointerId, x0: e.clientX, y0: e.clientY }; stick.hidden = false; stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`; }
      else if (!lk) lk = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    root.addEventListener('pointermove', (e) => {
      if (mv && e.pointerId === mv.id) {
        const dx = e.clientX - mv.x0, dy = e.clientY - mv.y0, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 50);
        this.move.x = (dx / d) * k; this.move.y = (dy / d) * k; knob.style.transform = `translate(${(dx / d) * Math.min(d, 50)}px, ${(dy / d) * Math.min(d, 50)}px)`;
      } else if (lk && e.pointerId === lk.id) { this.lookDelta.x += e.clientX - lk.x; this.lookDelta.y += e.clientY - lk.y; lk.x = e.clientX; lk.y = e.clientY; }
    });
    const end = (e: PointerEvent) => {
      if (mv && e.pointerId === mv.id) { mv = null; this.move.x = 0; this.move.y = 0; stick.hidden = true; knob.style.transform = ''; }
      if (lk && e.pointerId === lk.id) lk = null;
    };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
    const fire = this.el['vy-fire'];
    fire.addEventListener('pointerdown', (e) => { e.preventDefault(); this.fireTouch = true; fire.classList.add('on'); fire.setPointerCapture(e.pointerId); });
    const off = () => { this.fireTouch = false; fire.classList.remove('on'); };
    fire.addEventListener('pointerup', off); fire.addEventListener('pointercancel', off);
  }
}
