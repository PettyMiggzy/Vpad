// Token Arena, in real 3D: two token teams, best of three rounds, bots in the empty seats.
// The rules (movement, shots, bots, rounds) are the match server's own file; this file draws them and reads the player's input.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Match, MAP } from '../../server/game.js';
import { REWARD } from '../../server/items.js';
import { PX_PER_M, EYE_H, FOV, SIM_STEP, LOOK_TOUCH, TEAM_COLORS, DEFAULT_TEAM_NAMES, STORE_KEY } from './config.js';
import { freshProfile, sanitize, award, teamNames } from './profile.ts';
import { Ui } from './ui.ts';
import * as sfx from './audio.ts';
import { loadAssets } from './assets.js';
import { buildWorld, W, H } from './world.js';
import { Unit, UNIT_H } from './units.js';
import { ViewModel } from './view.js';

const qs = new URLSearchParams(location.search);
const dbg = qs.get('dbg') || '', quality = qs.get('q') || (matchMedia('(pointer: coarse)').matches ? 'mid' : 'high');
const names = teamNames(location.search, DEFAULT_TEAM_NAMES);
const hex = (h) => parseInt(h.slice(1), 16);
const teams = [{ name: names[0], color: hex(TEAM_COLORS[0]) }, { name: names[1], color: hex(TEAM_COLORS[1]) }];
let profile; try { profile = sanitize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch { profile = freshProfile(); }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch { /* storage may be blocked */ } };

// ---- renderer ----
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 600); camera.rotation.order = 'YXZ';
const bootmsg = document.getElementById('bootmsg');
const A = await loadAssets((d, n) => { bootmsg.textContent = `loading ${d}/${n}`; });
buildWorld(scene, A, TEAM_COLORS, quality);
const vm = new ViewModel(A);

let composer = null;
if (quality !== 'low') {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 0.94));
  composer.addPass(new OutputPass());
}
function resize() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}
addEventListener('resize', resize); resize();

// ---- the match ----
function newMatch(perSide) { const mt = new Match({ teams, perSide, bots: true }); mt.startRound(); return mt; }
let match = newMatch(6), me = null, playing = false, locked = false, lockFailed = false, fire = false, wasAlive = false;
const keys = new Set();
const look = { yaw: 0, pitch: 0 };       // yaw is the rules engine's own aim angle: it turns right as it grows
const units = new Map();
const tracers = [], bits = [];
let walkPhase = 0, hudT = 0, spectate = null;

const ui = new Ui({ teamNames: names, teamColors: TEAM_COLORS, profile, save, onPlay: (c) => start(c), onResume: () => requestLock() });

function start(c) {
  sfx.unlock();
  for (const [id, u] of units) { u.dispose(); ui.dropTag(id); }
  units.clear();
  match = new Match({ teams, perSide: c.seats, bots: true });
  me = match.addPlayer('me', { name: c.name, team: c.team, loadout: { ...profile.loadout } });
  match.startRound();
  playing = true; spectate = null; wasAlive = false;
  ui.showMenu(false); requestLock();
  ui.banner('ROUND 1', 'get ready', 2600);
}
function requestLock() {
  sfx.unlock();
  if (ui.touch) return;
  if (dbg.includes('nolock')) { lockFailed = true; return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; ui.showPause(false); }); } catch { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (playing && !ui.touch && !lockFailed) ui.showPause(!locked); });
document.addEventListener('pointerlockerror', () => { lockFailed = true; locked = false; ui.showPause(false); });
const turn = (dx, dy) => { look.yaw += dx * 0.0022; look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch + dy * 0.0022)); };
addEventListener('mousemove', (e) => { if (!playing) return; if (locked) turn(e.movementX, e.movementY); else if (lockFailed && (e.buttons & 1)) turn(e.movementX, e.movementY); });
addEventListener('mousedown', (e) => { if (e.button === 0 && playing && (locked || lockFailed) && !ui.menuOpen()) fire = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) fire = false; });
addEventListener('keydown', (e) => { keys.add(e.code); if (playing && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); fire = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', () => { if (playing && !locked && !ui.touch && !lockFailed && !ui.menuOpen()) requestLock(); });

function readInput() {
  if (!me || !me.alive) return;
  const fx = Math.cos(look.yaw), fz = Math.sin(look.yaw), rx = -fz, rz = fx;   // forward, and right of it
  let fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - ui.move.y;
  let str = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + ui.move.x;
  const len = Math.hypot(fwd, str); if (len > 1) { fwd /= len; str /= len; }
  me.input = { dx: fx * fwd + rx * str, dy: fz * fwd + rz * str, aim: look.yaw, fire: fire || ui.fireTouch };
}

// ---- events from the rules engine ----
const teamTag = (t) => `<b style="color:${TEAM_COLORS[t]}">${names[t]}</b>`;
const firedNow = new Set();
function onEvents(evs) {
  for (const e of evs) {
    if (e.type === 'shot') {
      const sh = match.players.get(e.by);
      const eye = me && me.alive ? { x: me.x / PX_PER_M, z: me.y / PX_PER_M } : { x: W / 2, z: H / 2 };
      sfx.shot(sh?.weapon ?? 'pistol', Math.hypot(e.x / PX_PER_M - eye.x, e.y / PX_PER_M - eye.z));
      tracer(e, sh); firedNow.add(e.by);
      if (me && e.by === me.id) vm.fire();
    } else if (e.type === 'hit') {
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); sfx.hurt(); }
      if (me && e.by === me.id) { ui.flash('vy-hitm'); sfx.hitMarker(); }
      burst(e.x / PX_PER_M, 1.2, e.y / PX_PER_M, 0xff3a2a, 7);
    } else if (e.type === 'kill') {
      const a = match.players.get(e.by), v = match.players.get(e.victim);
      if (a && v) ui.feed(`<span style="color:${TEAM_COLORS[a.team]}">${a.name}</span> &#9656; <span style="color:${TEAM_COLORS[v.team]}">${v.name}</span>`);
      if (me && e.by === me.id) { sfx.kill(); award(profile, REWARD.kill); save(); }
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); sfx.hurt(); ui.banner('ELIMINATED', 'spectating a team-mate', 2200); }
    } else if (e.type === 'round') { ui.banner(`ROUND ${e.n}`, 'get ready', 2400); sfx.chime(); }
    else if (e.type === 'roundEnd') { const w = e.winner; ui.banner(w === 0 || w === 1 ? `${teamTag(w)} TAKES THE ROUND` : 'DRAW', '', 3000); if (me && w === me.team) { award(profile, REWARD.round); save(); } }
    else if (e.type === 'match') { ui.banner(`${teamTag(e.winner)} WINS THE MATCH`, 'new match starting', 6000); if (me && e.winner === me.team) { award(profile, REWARD.match); save(); } }
  }
}
const tracerMat = TEAM_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), toneMapped: false, transparent: true }));
const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
function tracer(e, sh) {
  const x0 = e.x / PX_PER_M, z0 = e.y / PX_PER_M, x1 = e.ex / PX_PER_M, z1 = e.ey / PX_PER_M;
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.6) return;
  const s0 = Math.min(1.1, len * 0.1), L = len - s0;
  const mesh = new THREE.Mesh(tracerGeo, tracerMat[sh ? sh.team : 0]);
  mesh.scale.z = L; mesh.position.set(x0 + (dx / len) * (s0 + L / 2), 1.3, z0 + (dz / len) * (s0 + L / 2));
  mesh.rotation.y = Math.atan2(dx, dz); scene.add(mesh); tracers.push({ mesh, life: 0.07 });
  if (!e.hit) burst(x1, 1.1, z1, 0xffc060, 5);
}
const bitGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
function burst(x, y, z, color, n) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false }));
    mesh.position.set(x, y, z); scene.add(mesh);
    bits.push({ mesh, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 0.5, vz: (Math.random() - 0.5) * 3, life: 0.45 });
  }
}

// ---- soldiers ----
function syncUnits(dt, t) {
  const live = new Set();
  for (const p of match.players.values()) {
    live.add(p.id);
    const key = `${p.team}|${p.weapon}`;
    let u = units.get(p.id);
    if (u && u.key !== key) { u.dispose(); units.delete(p.id); u = undefined; }
    if (!u) { u = new Unit(A, p.team, p.weapon, TEAM_COLORS[p.team]); u.key = key; u.lx = p.x / PX_PER_M; u.lz = p.y / PX_PER_M; scene.add(u.root); units.set(p.id, u); }
    const gx = p.x / PX_PER_M, gz = p.y / PX_PER_M;
    const speed = Math.hypot(gx - u.lx, gz - u.lz) / Math.max(dt, 1e-3);
    u.lx = gx; u.lz = gz;
    u.root.position.set(gx, 0, gz); u.root.rotation.y = Math.PI / 2 - p.aim;
    u.root.visible = p !== me || !p.alive ? true : false;
    u.update(dt, Math.min(speed, 7), firedNow.has(p.id), p.alive, t);
  }
  firedNow.clear();
  for (const [id, u] of units) if (!live.has(id)) { u.dispose(); units.delete(id); ui.dropTag(id); }
}

// ---- the frame ----
let acc = 0, last = performance.now();
window.__arena = { start, get match() { return match; }, get me() { return me; }, look, units, scene, camera, renderer, A };
const v3 = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 0.1), t = now / 1000;
  if (ui.touch && (ui.lookDelta.x || ui.lookDelta.y)) { turn(ui.lookDelta.x * LOOK_TOUCH, ui.lookDelta.y * LOOK_TOUCH); ui.lookDelta.x = 0; ui.lookDelta.y = 0; }
  if ((playing && (ui.touch || locked || lockFailed)) || !playing) {
    acc += dt;
    for (let n = 0; acc >= SIM_STEP && n < 6; n++, acc -= SIM_STEP) { readInput(); match.step(SIM_STEP); onEvents(match.events); }
    if (acc > SIM_STEP * 6) acc = 0;
  }
  const alive = !!(me && me.alive);
  if (alive && !wasAlive) { look.yaw = me.aim; look.pitch = 0; spectate = null; }
  wasAlive = alive;
  syncUnits(dt, t);

  // camera
  camera.rotation.order = 'YXZ';
  const place = (x, y, z, yaw, pitch) => { camera.position.set(x, y, z); camera.rotation.set(-pitch, -yaw - Math.PI / 2, 0); };
  let eye = null;
  if (playing && alive) {
    const moving = Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1;
    walkPhase += moving ? dt * 9 : 0;
    eye = { x: me.x / PX_PER_M, y: EYE_H + (moving ? Math.sin(walkPhase) * 0.03 : 0), z: me.y / PX_PER_M };
    place(eye.x, eye.y, eye.z, look.yaw, look.pitch);
    vm.set(me.weapon, TEAM_COLORS[me.team], hex(TEAM_COLORS[me.team]));
  } else if (playing) {
    let tgt = spectate ? match.players.get(spectate) : null;
    if (!tgt || !tgt.alive) { tgt = [...match.players.values()].find((p) => p.alive && p.team === me?.team) || [...match.players.values()].find((p) => p.alive) || null; spectate = tgt ? tgt.id : null; }
    if (tgt) place(tgt.x / PX_PER_M, EYE_H, tgt.y / PX_PER_M, tgt.aim, 0); else place(W / 2, 12, H / 2, 0, 1.2);
  } else {
    const a = t * 0.1;
    camera.position.set(W / 2 + Math.cos(a) * 20, 8.5 + Math.sin(a * 0.7) * 1.5, H / 2 + Math.sin(a) * 15);
    camera.lookAt(W / 2, 1.2, H / 2);
  }
  vm.update(dt, alive && Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1, walkPhase, camera.aspect, !(playing && alive));
  for (const u of units.values()) u.mark.lookAt(camera.position);

  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; if (tracers[i].life <= 0) { scene.remove(tracers[i].mesh); tracers.splice(i, 1); } }
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]; b.life -= dt; b.vy -= 9 * dt; b.mesh.position.x += b.vx * dt; b.mesh.position.y = Math.max(0.02, b.mesh.position.y + b.vy * dt); b.mesh.position.z += b.vz * dt;
    if (b.life <= 0) { scene.remove(b.mesh); b.mesh.material.dispose(); bits.splice(i, 1); }
  }

  if (composer) composer.render(); else renderer.render(scene, camera);
  renderer.autoClear = false; renderer.clearDepth(); renderer.render(vm.scene, vm.cam); renderer.autoClear = true;

  hudT -= dt;
  if (playing) {
    if (hudT <= 0) {
      hudT = 0.1;
      ui.setScore(match.score, match.round, Math.max(0, Math.ceil(match.timer)), [match.aliveCount(0), match.aliveCount(1)], match.phase);
      if (me) ui.setMe(me.alive ? me.hp : 0, me.hpMax, `${me.name} | ${me.kills} kills`, me.weapon, profile.coins);
    }
    const w = host.clientWidth, h = host.clientHeight;
    for (const p of match.players.values()) {
      if (p === me) continue;
      const mate = me && p.team === me.team && p.alive;
      let sx = 0, sy = 0, show = false;
      if (mate) { v3.set(p.x / PX_PER_M, UNIT_H + 0.75, p.y / PX_PER_M).project(camera); if (v3.z < 1 && Math.abs(v3.x) < 1.1) { sx = (v3.x * 0.5 + 0.5) * w; sy = (-v3.y * 0.5 + 0.5) * h; show = true; } }
      ui.tag(p.id, p.name, TEAM_COLORS[p.team], p.hp / p.hpMax, sx, sy, show);
    }
  }
}
document.getElementById('boot').remove();
requestAnimationFrame(frame);
