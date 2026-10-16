import Phaser from 'phaser';
import { Client } from '@colyseus/sdk';
import { MAP, WALLS, R, pushOut } from '../../server/game.js';
import { CATALOG, SLOTS } from '../../server/items.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const $ = (s) => document.querySelector(s);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const TEAM_DEFAULTS = [{ name: 'FROG', color: 0xff6a3c }, { name: 'APE', color: 0x3cb4ff }];
const SERVER = new URLSearchParams(location.search).get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
const API = SERVER.replace(/^ws/, 'http') + '/api';
// the soldier art: one picture per weapon (the soldier holds it), where the body's centre sits in each picture
const SOLDIER = { pistol: 0.34, smg: 0.32, rifle: 0.30, shotgun: 0.26, sniper: 0.22 };

// a random id, made once and kept in this browser: it is what the server keeps your coins and gear under (a real version would use a wallet)
let PID = '';
try { PID = localStorage.getItem('arena.pid') || ''; } catch (_) { /* ignore */ }
if (!/^[a-f0-9-]{16,64}$/.test(PID)) { PID = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem('arena.pid', PID); } catch (_) { /* ignore */ } }

// ---------------------------------------------------------------- the menu: team, name and the loadout shop
const pick = { team: 0, tab: 'weapon' };
let prof = null;
const TAB_NAMES = { weapon: 'Weapons', armor: 'Armour', boots: 'Boots', camo: 'Camo' };
async function api(path, body) {
  const r = await fetch(`${API}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: PID, ...body }) } : undefined);
  return r.json();
}
async function loadProfile() {
  try { const r = await fetch(`${API}/profile?pid=${PID}`); prof = await r.json(); if (prof.error) prof = null; } catch (_) { prof = null; }
  renderShop();
}
function renderShop() {
  const coins = $('#coins'), items = $('#items'), tabs = $('#tabs'), prev = $('#prev');
  tabs.innerHTML = '';
  for (const t of SLOTS) { const d = document.createElement('div'); d.className = 'tab' + (t === pick.tab ? ' on' : ''); d.textContent = TAB_NAMES[t]; d.onclick = () => { pick.tab = t; renderShop(); }; tabs.appendChild(d); }
  if (!prof) { coins.textContent = ''; items.innerHTML = '<div class="it"><small>The shop could not be reached. You can still play with the free kit.</small></div>'; prev.innerHTML = ''; return; }
  coins.textContent = `${prof.coins.toLocaleString()} coins`;
  items.innerHTML = '';
  for (const [id, it] of Object.entries(CATALOG)) {
    if (it.slot !== pick.tab) continue;
    const owned = prof.owned.includes(id), on = prof.loadout[it.slot] === id;
    const d = document.createElement('div'); d.className = 'it';
    d.innerHTML = `<div><b>${it.name}</b><small>${it.blurb}${it.cost && !owned ? ` · ${it.cost} coins` : ''}</small></div>`;
    const btn = document.createElement('button');
    btn.textContent = on ? 'Equipped' : owned ? 'Equip' : 'Buy'; btn.className = on || owned ? 'eq' : ''; btn.disabled = on || (!owned && prof.coins < it.cost);
    btn.onclick = async () => { btn.disabled = true; const r = await api(owned ? '/equip' : '/buy', { item: id }); if (r.error) { $('#err').textContent = r.error; btn.disabled = false; } else { $('#err').textContent = ''; prof = { ...prof, ...r }; renderShop(); } };
    d.appendChild(btn); items.appendChild(d);
  }
  const w = prof.loadout.weapon, camo = CATALOG[prof.loadout.camo];
  prev.innerHTML = `<img src="/art/soldier_${w}.png" alt=""><div class="mult" style="background:${hex(camo.tint)}"></div><small>${CATALOG[w].name} · ${CATALOG[prof.loadout.armor].name}</small>`;
}
function buildMenu() {
  const teams = $('#teams');
  TEAM_DEFAULTS.forEach((t, i) => {
    const d = document.createElement('div'); d.className = 'team' + (i === pick.team ? ' on' : ''); d.style.setProperty('--c', hex(t.color));
    d.innerHTML = `<span style="color:${hex(t.color)}">$${t.name}</span><small>token team</small>`;
    d.onclick = () => { pick.team = i; [...teams.children].forEach((c, j) => c.classList.toggle('on', j === i)); };
    teams.appendChild(d);
  });
  try { $('#name').value = localStorage.getItem('arena.name') || ''; } catch (_) { /* ignore */ }
  loadProfile();
}
buildMenu();

$('#go').onclick = async () => {
  const name = $('#name').value.trim() || 'PLAYER';
  try { localStorage.setItem('arena.name', name); } catch (_) { /* ignore */ }
  $('#go').disabled = true; $('#err').textContent = 'Connecting…';
  try {
    const client = new Client(SERVER);
    const room = await client.joinOrCreate('match', { name, pid: PID, team: pick.team, perSide: Number($('#seats').value), names: TEAM_DEFAULTS.map((t) => t.name), colors: TEAM_DEFAULTS.map((t) => t.color) });
    $('#menu').hidden = true; $('#hud').hidden = false;
    startGame(room);
  } catch (e) {
    $('#go').disabled = false; $('#err').textContent = `Could not join: ${e?.message || e}. Is the match server running?`;
  }
};

// ---------------------------------------------------------------- the arena
function startGame(room) {
  const W = Math.round(innerWidth * DPR), H = Math.round(innerHeight * DPR);
  const st = { me: null, teams: TEAM_DEFAULTS, roster: new Map(), snaps: [], keys: {}, mouse: { x: 0, y: 0, down: false }, sticks: { move: null, aim: null }, pm: null, last: 0, phase: '', round: 0, labels: new Map(), sprites: new Map(), sparks: [], feed: [] };
  window.__arena = st;
  room.onMessage('hello', (m) => { st.me = m.id; st.teams = m.teams; for (const r of m.roster) st.roster.set(r.id, r); hud(); });
  room.onMessage('roster', (list) => { st.roster.clear(); for (const r of list) st.roster.set(r.id, r); });
  room.onMessage('snap', (s) => { s.at = performance.now(); st.snaps.push(s); if (st.snaps.length > 8) st.snaps.shift(); onSnap(s); });
  room.onLeave(() => { banner('Disconnected', 'reload to rejoin', true); });

  const nm = (id) => st.roster.get(id)?.name || 'Bot';
  const tc = (t) => st.teams[t]?.color ?? 0xffffff;
  const bannerTimer = { t: 0 };
  function banner(text, sub = '', hold = false) {
    const b = $('#banner'); b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; b.classList.add('on');
    clearTimeout(bannerTimer.t); if (!hold) bannerTimer.t = setTimeout(() => b.classList.remove('on'), 1700);
  }
  function hud() {
    for (const t of [0, 1]) { $(`[data-name="${t}"]`).textContent = '$' + (st.teams[t]?.name || ''); $(`[data-t="${t}"]`).style.color = hex(tc(t)); }
  }
  function onSnap(s) {
    for (const t of [0, 1]) { $(`[data-n="${t}"]`).textContent = s.al[t]; $(`[data-pips="${t}"]`).innerHTML = [0, 1].map((i) => `<i class="${i < s.sc[t] ? 'on' : ''}"></i>`).join(''); }
    $('[data-round]').textContent = `ROUND ${Math.max(1, s.r)}`; $('[data-time]').textContent = s.ph === 'live' || s.ph === 'countdown' ? s.tm : '';
    if (s.ph !== st.phase) {
      if (s.ph === 'countdown') banner(`ROUND ${s.r}`, `${st.teams[0].name} vs ${st.teams[1].name}`);
      else if (s.ph === 'live') banner('FIGHT!');
      else if (s.ph === 'roundover') banner(s.rw === -1 ? 'DRAW' : `$${st.teams[s.rw].name} TAKES THE ROUND`, `${s.sc[0]} : ${s.sc[1]}`);
      else if (s.ph === 'matchover') banner(`$${st.teams[s.w].name} WINS THE MATCH`, `${s.sc[0]} : ${s.sc[1]}`, true);
      else if (s.ph === 'lobby') banner('GET READY', 'bots fill the empty seats');
      if (s.ph !== 'matchover') { /* the banner of a finished match stays until the next round starts */ }
      st.phase = s.ph;
    }
    const me = s.p.find((p) => p[0] === st.me);
    if (me) {
      const live = s.ph === 'live' || s.ph === 'countdown';
      if (!st.pm || !live || !me[6]) st.pm = { x: me[2], y: me[3] };
      else { const ex = me[2] - st.pm.x, ey = me[3] - st.pm.y; if (Math.hypot(ex, ey) > 80) { st.pm.x = me[2]; st.pm.y = me[3]; } else { st.pm.x += ex * 0.2; st.pm.y += ey * 0.2; } }
      $('#me .hp i').style.width = `${Math.max(0, me[5]) / (st.roster.get(st.me)?.hpMax || 100) * 100}%`; $('[data-me]').textContent = me[6] ? `${nm(st.me)} · ${me[7]} kills` : 'You are out: watching your team';
    }
    for (const e of s.ev) {
      if (e.type === 'hit') st.sparks.push({ x: e.x, y: e.y, t: 0, r: 8 });
      if (e.type === 'kill') { st.sparks.push({ x: e.x, y: e.y, t: 0, r: 22 }); feed(`${nm(e.by)} ▸ ${nm(e.victim)}`); }
    }
  }
  function feed(text) { const f = $('#feed'); const d = document.createElement('span'); d.textContent = text; f.appendChild(d); setTimeout(() => d.remove(), 4200); while (f.children.length > 5) f.firstChild.remove(); }

  // ---- input: keyboard and mouse on a computer, two thumb sticks on a phone
  addEventListener('keydown', (e) => { st.keys[e.code] = true; });
  addEventListener('keyup', (e) => { st.keys[e.code] = false; });
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const stickEl = (cls) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;width:120px;height:120px;border-radius:50%;border:2px solid rgba(182,255,0,.5);background:rgba(182,255,0,.08);display:none;pointer-events:none;z-index:4;'; const k = document.createElement('div'); k.style.cssText = 'position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(182,255,0,.55);'; d.appendChild(k); document.body.appendChild(d); return { d, k }; };
  const els = { move: stickEl(), aim: stickEl() };
  const canvasEl = () => document.querySelector('#game canvas');
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { st.mouse.down = true; return; }
    if (!$('#menu').hidden) return;
    const k = e.clientX < innerWidth / 2 ? 'move' : 'aim';
    if (st.sticks[k]) return;
    st.sticks[k] = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
    const el = els[k].d; el.style.display = 'block'; el.style.left = `${e.clientX - 60}px`; el.style.top = `${e.clientY - 60}px`;
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { st.mouse.x = e.clientX; st.mouse.y = e.clientY; return; }
    for (const k of ['move', 'aim']) {
      const s = st.sticks[k]; if (!s || s.id !== e.pointerId) continue;
      let dx = e.clientX - s.x0, dy = e.clientY - s.y0; const d = Math.hypot(dx, dy), max = 55;
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      s.dx = dx / max; s.dy = dy / max; els[k].k.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  });
  const end = (e) => {
    if (e.pointerType === 'mouse') { st.mouse.down = false; return; }
    for (const k of ['move', 'aim']) if (st.sticks[k]?.id === e.pointerId) { st.sticks[k] = null; els[k].d.style.display = 'none'; els[k].k.style.transform = ''; }
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);

  let aim = 0;
  function readInput(camera) {
    let dx = (st.keys.KeyD || st.keys.ArrowRight ? 1 : 0) - (st.keys.KeyA || st.keys.ArrowLeft ? 1 : 0);
    let dy = (st.keys.KeyS || st.keys.ArrowDown ? 1 : 0) - (st.keys.KeyW || st.keys.ArrowUp ? 1 : 0);
    let fire = st.mouse.down || !!st.keys.Space;
    if (st.sticks.move) { dx = st.sticks.move.dx; dy = st.sticks.move.dy; }
    if (st.sticks.aim) { const a = st.sticks.aim; if (Math.hypot(a.dx, a.dy) > 0.15) aim = Math.atan2(a.dy, a.dx); fire = Math.hypot(a.dx, a.dy) > 0.6; }
    else if (!coarse && st.pm) { const wx = camera.scrollX + (st.mouse.x * DPR) / camera.zoom, wy = camera.scrollY + (st.mouse.y * DPR) / camera.zoom; aim = Math.atan2(wy - st.pm.y, wx - st.pm.x); }
    return { dx, dy, aim, fire };
  }

  // ---- the scene
  class Arena extends Phaser.Scene {
    preload() { for (const w of Object.keys(SOLDIER)) this.load.image(`soldier_${w}`, `/art/soldier_${w}.png`); }
    create() {
      this.bg = this.add.graphics().setDepth(0); this.drawMap();
      this.dyn = this.add.graphics().setDepth(5);
      this.fx = this.add.graphics().setDepth(8);
      this.cameras.main.setBackgroundColor(0x050805); this.cameras.main.setBounds(0, 0, MAP.w, MAP.h);
      setInterval(() => { if (st.me && this.cameras?.main) room.send('input', this.input_); }, 33);
      this.input_ = { dx: 0, dy: 0, aim: 0, fire: false };
    }
    drawMap() {
      const g = this.bg;
      g.fillStyle(0x0b100a, 1).fillRect(0, 0, MAP.w, MAP.h);
      // a worn floor: a faint grid, scorch marks, and the two spawn areas in the team colours
      g.lineStyle(1, 0x1b2616, 0.8);
      for (let x = 0; x <= MAP.w; x += 80) g.lineBetween(x, 0, x, MAP.h);
      for (let y = 0; y <= MAP.h; y += 80) g.lineBetween(0, y, MAP.w, y);
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 70; i++) { g.fillStyle(0x151d11, 0.8).fillCircle(rnd() * MAP.w, rnd() * MAP.h, 10 + rnd() * 40); }
      for (let i = 0; i < 40; i++) { const x = rnd() * MAP.w, y = rnd() * MAP.h; g.lineStyle(2, 0x6a2a10, 0.55).lineBetween(x, y, x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 120); }
      g.fillStyle(tc(0), 0.10).fillRect(24, 24, 300, MAP.h - 48); g.fillStyle(tc(1), 0.10).fillRect(MAP.w - 324, 24, 300, MAP.h - 48);
      g.lineStyle(2, tc(0), 0.4).lineBetween(324, 24, 324, MAP.h - 24); g.lineStyle(2, tc(1), 0.4).lineBetween(MAP.w - 324, 24, MAP.w - 324, MAP.h - 24);
      for (const [x, y, w, h] of WALLS) {
        g.fillStyle(0x000000, 0.45).fillRect(x + 6, y + 8, w, h);
        g.fillStyle(0x2a3324, 1).fillRect(x, y, w, h);
        g.fillStyle(0x3a4630, 1).fillRect(x, y, w, Math.min(10, h));
        g.lineStyle(2, 0xb6ff00, 0.55).strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
    }
    update(time, delta) {
      const dt = Math.min(delta, 60) / 1000, cam = this.cameras.main, now = performance.now();
      // my own character moves at once on my own screen (the server confirms it)
      const inp = readInput(cam); this.input_ = inp;
      const cur = st.snaps[st.snaps.length - 1];
      if (st.pm && cur && (cur.ph === 'live' || cur.ph === 'countdown')) {
        const meRow = cur.p.find((p) => p[0] === st.me);
        if (meRow && meRow[6]) { const len = Math.hypot(inp.dx, inp.dy) || 1, k = len > 1 ? 1 / len : 1; [st.pm.x, st.pm.y] = pushOut(st.pm.x + inp.dx * k * R.SPEED * dt, st.pm.y + inp.dy * k * R.SPEED * dt); }
      }
      // others are drawn a moment in the past, between the two snapshots either side of that time
      const rt = now - 130; let a = null, b = null;
      for (let i = st.snaps.length - 1; i >= 0; i--) if (st.snaps[i].at <= rt) { a = st.snaps[i]; b = st.snaps[i + 1] || null; break; }
      if (!a) a = st.snaps[0];
      const pos = new Map();
      if (a) {
        const f = b ? Math.min(1, Math.max(0, (rt - a.at) / (b.at - a.at))) : 0;
        for (const r of a.p) {
          const q = b?.p.find((x) => x[0] === r[0]);
          pos.set(r[0], { team: r[1], x: q ? r[2] + (q[2] - r[2]) * f : r[2], y: q ? r[3] + (q[3] - r[3]) * f : r[3], aim: q ? lerpAng(r[4], q[4], f) : r[4], hp: q ? q[5] : r[5], alive: q ? q[6] : r[6], bot: r[8] });
        }
      }
      const mine = pos.get(st.me);
      if (mine && st.pm && mine.alive) { mine.x = st.pm.x; mine.y = st.pm.y; mine.aim = inp.aim; }
      // the camera follows me, or a living team-mate when I am out
      let focus = mine?.alive ? mine : [...pos.values()].find((p) => p.alive && p.team === (mine?.team ?? 0)) || mine;
      const portrait = this.scale.width < this.scale.height, z = Math.max(this.scale.width / (portrait ? 760 : 1400), this.scale.height / MAP.h);
      cam.setZoom(z);   // about 1400 px of arena across a wide screen, 760 across a tall one
      if (focus) cam.centerOn(focus.x, focus.y);
      this.drawPlayers(pos);
      this.drawBullets(cur, now);
    }
    drawPlayers(pos) {
      const g = this.dyn; g.clear();
      const seen = new Set();
      for (const [id, p] of pos) {
        const r = st.roster.get(id); if (!r) continue;
        seen.add(id);
        let lab = st.labels.get(id);
        if (!lab) { lab = this.add.text(0, 0, r.name, { fontFamily: 'system-ui', fontSize: '13px', fontStyle: '800', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(9); st.labels.set(id, lab); }
        lab.setPosition(p.x, p.y - 34).setVisible(!!p.alive).setColor(id === st.me ? '#b6ff00' : '#ffffff').setAlpha(p.bot ? 0.75 : 1);
        // the soldier: the picture for the weapon he carries, turned to face where he aims, tinted by his camo
        let sp = st.sprites.get(id);
        const weapon = SOLDIER[r.weapon] ? r.weapon : 'pistol';
        if (!sp || sp.weapon !== weapon) {
          sp?.img.destroy();
          const img = this.add.image(0, 0, `soldier_${weapon}`).setOrigin(SOLDIER[weapon], 0.5).setDepth(6);
          img.setScale(46 / img.height); sp = { img, weapon }; st.sprites.set(id, sp);
        }
        sp.img.setPosition(p.x, p.y).setRotation(p.aim).setTint(p.alive ? (CATALOG[r.camo]?.tint ?? 0xffffff) : 0x555555).setAlpha(p.alive ? 1 : 0.3);
        const rad = R.RADIUS + 2;
        g.fillStyle(0x000000, p.alive ? 0.35 : 0.1).fillEllipse(p.x + 3, p.y + 6, rad * 2.2, rad * 1.8);
        g.lineStyle(4, tc(p.team), p.alive ? 0.95 : 0.25).strokeCircle(p.x, p.y, rad + 3);
        if (!p.alive) continue;
        const max = r.hpMax || 100;
        g.fillStyle(0x000000, 0.6).fillRect(p.x - 18, p.y + 24, 36, 5); g.fillStyle(p.hp > max * 0.5 ? 0x7be04a : p.hp > max * 0.25 ? 0xffc23c : 0xff4a3c, 1).fillRect(p.x - 18, p.y + 24, 36 * Math.max(0, p.hp) / max, 5);
      }
      for (const [id, lab] of st.labels) if (!seen.has(id)) { lab.destroy(); st.labels.delete(id); }
      for (const [id, sp] of st.sprites) if (!seen.has(id)) { sp.img.destroy(); st.sprites.delete(id); }
    }
    drawBullets(cur, now) {
      const g = this.fx; g.clear();
      if (cur) for (const [x, y, team, vx, vy] of cur.b) {
        const t = (now - cur.at) / 1000, px = x + vx * t, py = y + vy * t;
        g.lineStyle(5, tc(team), 0.35).lineBetween(px - vx * 0.045, py - vy * 0.045, px, py);
        g.lineStyle(2, 0xffffff, 1).lineBetween(px - vx * 0.03, py - vy * 0.03, px, py);
      }
      st.sparks = st.sparks.filter((s) => (s.t += 1) < 14);
      for (const s of st.sparks) { g.lineStyle(3, 0xffe066, 1 - s.t / 14).strokeCircle(s.x, s.y, s.r * (0.4 + s.t / 14)); }
    }
  }
  const lerpAng = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };

  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#050805',
    scale: { mode: Phaser.Scale.NONE, width: W, height: H, zoom: 1 / DPR },
    scene: Arena, render: { antialias: true }, input: { activePointers: 3, touch: { capture: true } }, disableContextMenu: true,
  });
  window.__game = game;
  addEventListener('resize', () => game.scale.resize(Math.round(innerWidth * DPR), Math.round(innerHeight * DPR)));
}
