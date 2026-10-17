// Token Arena, in real 3D: two token teams, best of three rounds, bots in the empty seats.
// The rules (movement, shots, bots, rounds) are the match server's own file; this file draws them and reads the player's input.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Match, MAPS, R, floorAt } from '../../server/game.js';
import { REWARD } from '../../server/items.js';
import { PX_PER_M, FOV, SIM_STEP, LOOK_TOUCH, TEAM_COLORS, DEFAULT_TEAM_NAMES, STORE_KEY } from './config.js';
import { freshProfile, sanitize, award, teamNames } from './profile.ts';
import { Ui } from './ui.ts';
import * as sfx from './audio.ts';
import { loadAssets } from './assets.js';
import { buildWorld } from './world.js';
import { Unit, UNIT_H, GUN_OFFSET } from './units.js';
import { ViewModel } from './view.js';

const qs = new URLSearchParams(location.search);
const dbg = qs.get('dbg') || '';
// graphics level: 3 high, 2 mid, 1 low, 0 minimum. 'auto' starts high (mid on phones) and steps down by itself when the frame rate is poor.
const LEVELS = { high: 3, mid: 2, low: 1, min: 0 };
let gfxMode = qs.get('q') || (() => { try { return localStorage.getItem('vyre.arena.gfx') || 'auto'; } catch { return 'auto'; } })();
if (gfxMode !== 'auto' && !(gfxMode in LEVELS)) gfxMode = 'auto';
let level = gfxMode === 'auto' ? (matchMedia('(pointer: coarse)').matches ? 2 : 3) : LEVELS[gfxMode];
const quality = level >= 3 ? 'high' : level === 2 ? 'mid' : 'low';
const names = teamNames(location.search, DEFAULT_TEAM_NAMES);
const hex = (h) => parseInt(h.slice(1), 16);
const teams = [{ name: names[0], color: hex(TEAM_COLORS[0]) }, { name: names[1], color: hex(TEAM_COLORS[1]) }];
let profile; try { profile = sanitize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch { profile = freshProfile(); }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch { /* storage may be blocked */ } };

// ---- renderer ----
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: level >= 1, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = level >= 2; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 700); camera.rotation.order = 'YXZ';
const bootmsg = document.getElementById('bootmsg');
const A = await loadAssets((d, n) => { bootmsg.textContent = `loading ${d}/${n}`; });
const vm = new ViewModel(A);
const boomLight = new THREE.PointLight(0xffa040, 0, 26, 1.6); scene.add(boomLight);   // one light for every blast: adding lights mid-match would recompile the scene
// each map has its own sky, light and props; the sky also lights the soldiers and weapons
let worldH = null, curMapId = null, mapDims = { w: 64, h: 40 }, ready = false;
async function setMap(id, say) {
  if (curMapId === id && worldH) return;
  if (worldH) worldH.dispose();
  worldH = null; curMapId = id;
  worldH = await buildWorld(scene, renderer, MAPS[id], A, TEAM_COLORS, quality, say);
  mapDims = { w: MAPS[id].wM, h: MAPS[id].hM };
  vm.scene.environment = scene.environment; vm.scene.environmentIntensity = 0.7;
  if (ready) applyWorld();
}
await setMap('cargo', (d, n) => { bootmsg.textContent = `building the map ${d}/${n}`; });
ready = true;

const DPR = [0.75, 1, 1.25, 1.75], SHADOW = [0, 0, 1024, 2048];
let composer = null, bloomPass = null;
function makeComposer(samples) {
  const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples }));
  c.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 0.94); c.addPass(bloomPass);
  c.addPass(new OutputPass());
  return c;
}
function resize() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR[level]));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
}
/** shadows and extra lights of the map that is up, for the current level */
function applyWorld() {
  const sun = worldH?.sun;
  if (sun && SHADOW[level]) {
    if (sun.shadow.mapSize.x !== SHADOW[level]) { sun.castShadow = true; sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(SHADOW[level], SHADOW[level]); }
    sun.castShadow = level >= 2;
  } else if (sun) sun.castShadow = false;
  for (const lt of worldH?.lights ?? []) lt.visible = level >= 2;
}
/** one level of detail: resolution, shadows, glow, extra lights */
function applyLevel(l) {
  level = Math.max(0, Math.min(3, l));
  renderer.shadowMap.enabled = level >= 2;
  if (level >= 2) { if (composer) composer.dispose?.(); composer = makeComposer(level >= 3 ? 4 : 0); } else if (composer) { composer.dispose?.(); composer = null; }
  applyWorld();
  resize();
}
// the frame-rate watch: a poor average over a few seconds steps one level down, then waits before judging again
let fpsAcc = 0, fpsN = 0, fpsHold = 4;
function watchFps(dt) {
  if (gfxMode !== 'auto' || !playing || level <= 0) return;
  if (fpsHold > 0) { fpsHold -= dt; return; }
  fpsAcc += dt; fpsN++;
  if (fpsN >= 90) {
    const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0;
    if (avg > 1 / 38) { applyLevel(level - 1); fpsHold = 4; }
  }
}
addEventListener('resize', resize); applyLevel(level);

// ---- the match ----
function newMatch(perSide, map = 'cargo') { const mt = new Match({ teams, perSide, bots: true, map }); mt.startRound(); return mt; }
let match = newMatch(6), me = null, playing = false, locked = false, lockFailed = false, fire = false, wasAlive = false;
const keys = new Set();
const look = { yaw: 0, pitch: 0 };       // yaw is the rules engine's own aim angle: it turns right as it grows
const units = new Map();
const tracers = [], bits = [];
let walkPhase = 0, hudT = 0, spectate = null, nadeQueued = false, zoom = false, eyeY = 1.6, shake = 0, boomT = 0;
const nadeMeshes = new Map(), fx = [];

const ui = new Ui({ teamNames: names, teamColors: TEAM_COLORS, profile, save, onPlay: (c) => start(c), onResume: () => requestLock() });

async function start(c) {
  sfx.unlock();
  if (c.gfx && (c.gfx === 'auto' || c.gfx in LEVELS)) { gfxMode = c.gfx; try { localStorage.setItem('vyre.arena.gfx', gfxMode); } catch { /* storage may be blocked */ } if (gfxMode !== 'auto' && LEVELS[gfxMode] !== level) applyLevel(LEVELS[gfxMode]); }
  ui.banner('LOADING MAP', MAPS[c.map]?.name || '', 0);
  await setMap(MAPS[c.map] ? c.map : 'cargo', (d, n) => ui.banner('LOADING MAP', `${d}/${n}`, 0));
  ui.hideBanner(); sfx.ambience(curMapId);
  for (const [id, u] of units) { u.dispose(); ui.dropTag(id); }
  units.clear();
  match = new Match({ teams, perSide: c.seats, bots: true, map: curMapId });
  me = match.addPlayer('me', { name: c.name, team: c.team, loadout: { ...profile.loadout } });
  match.startRound();
  playing = true; spectate = null; wasAlive = false; eyeY = 1.6;
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
const turn = (dx, dy) => { vm.turned(dx, dy); look.yaw += dx * 0.0022; look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch + dy * 0.0022)); };
addEventListener('mousemove', (e) => { if (!playing) return; if (locked) turn(e.movementX, e.movementY); else if (lockFailed && (e.buttons & 1)) turn(e.movementX, e.movementY); });
addEventListener('mousedown', (e) => { if (!playing || !(locked || lockFailed) || ui.menuOpen()) return; if (e.button === 0) fire = true; if (e.button === 2) zoom = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) fire = false; if (e.button === 2) zoom = false; });
addEventListener('keydown', (e) => { keys.add(e.code); if ((e.code === 'KeyG' || e.code === 'KeyQ') && playing && !e.repeat) nadeQueued = true; if (playing && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
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
  me.input = { dx: fx * fwd + rx * str, dy: fz * fwd + rz * str, aim: look.yaw, pitch: -look.pitch, fire: fire || ui.fireTouch, nade: nadeQueued || ui.nadeTouch, reload: keys.has('KeyR') || ui.reloadTouch };
  ui.nadeTouch = false;
}

// ---- events from the rules engine ----
const teamTag = (t) => `<b style="color:${TEAM_COLORS[t]}">${names[t]}</b>`;
const firedNow = new Set();
const eyeOf = () => (me && me.alive ? { x: me.x / PX_PER_M, y: me.z + R.EYE, z: me.y / PX_PER_M } : { x: mapDims.w / 2, y: 1.6, z: mapDims.h / 2 });
const surfaceAt = (x, z, zz) => {
  const th = curMapId;
  if (zz > 0.3) return th === 'dust' ? 'concrete' : 'metal';
  return th === 'dust' ? 'sand' : th === 'refinery' && x > 26 && x < 38 ? 'metal' : 'concrete';
};
const distToSeg = (px, py, pz, ax, ay, az, bx, by, bz) => {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t), pz - (az + dz * t));
};
function onEvents(evs) {
  for (const e of evs) {
    if (e.type === 'shot') {
      const sh = match.players.get(e.by), own = !!(me && e.by === me.id), eye = eyeOf();
      sfx.shot(sh?.weapon ?? 'pistol', e.x / PX_PER_M, e.y / PX_PER_M, own);
      tracer(e, sh); firedNow.add(e.by);
      if (own) vm.fire();
      // a bullet that flew past your head, or hit the wall beside you
      if (me && me.alive && !own && sh && sh.team !== me.team && !e.hit && distToSeg(eye.x, eye.y, eye.z, e.x / PX_PER_M, e.z, e.y / PX_PER_M, e.ex / PX_PER_M, e.ez, e.ey / PX_PER_M) < 2.2) sfx.whiz();
      if (!e.hit) {
        const ix = e.ex / PX_PER_M, iz = e.ey / PX_PER_M;
        sfx.impact(e.ez < 0.15 ? (curMapId === 'dust' ? 'dirt' : 'concrete') : curMapId === 'dust' ? 'concrete' : (e.x + e.y) % 3 < 1.6 ? 'metal' : 'concrete', ix, iz);
      }
    } else if (e.type === 'hit') {
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); sfx.hurtMe(); }
      if (me && e.by === me.id) { ui.flash('vy-hitm'); sfx.hitMarker(); }
      sfx.impact('flesh', e.x / PX_PER_M, e.y / PX_PER_M);
      units.get(e.victim)?.hit();
      burst(e.x / PX_PER_M, e.z ?? 1.2, e.y / PX_PER_M, 0xff3a2a, e.nade ? 0 : 7);
    } else if (e.type === 'kill') {
      const a = match.players.get(e.by), v = match.players.get(e.victim);
      if (a && v) ui.feed(`<span style="color:${TEAM_COLORS[a.team]}">${a.name}</span> ${e.nade ? '&#9679;' : e.head ? '&#9678;' : '&#9656;'} <span style="color:${TEAM_COLORS[v.team]}">${v.name}</span>`);
      if (me && e.by === me.id && e.victim !== me.id) { sfx.kill(); award(profile, REWARD.kill); save(); }
      if (v) sfx.dieAt(v.x / PX_PER_M, v.y / PX_PER_M, !!(me && e.victim === me.id));
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); ui.banner('ELIMINATED', 'spectating a team-mate', 2200); }
    } else if (e.type === 'nade') {
      const th = match.players.get(e.by);
      sfx.throwNade(e.x / PX_PER_M, e.y / PX_PER_M, !!(me && e.by === me.id)); if (me && e.by === me.id) vm.throwNade();
      units.get(e.by)?.act('throw');
      void th;
    } else if (e.type === 'reload') {
      const p = match.players.get(e.by); if (!p) continue;
      sfx.reload(p.weapon, p.x / PX_PER_M, p.y / PX_PER_M, !!(me && e.by === me.id));
      if (me && e.by === me.id) vm.startReload(p.reloadTime); else units.get(e.by)?.act('reload');
    } else if (e.type === 'dry') {
      const p = match.players.get(e.by); if (p) sfx.dry(p.x / PX_PER_M, p.y / PX_PER_M, !!(me && e.by === me.id));
    } else if (e.type === 'boom') {
      explosion(e.x / PX_PER_M, e.z, e.y / PX_PER_M);
    } else if (e.type === 'round') { ui.banner(`ROUND ${e.n}`, 'get ready', 2400); sfx.chime(); }
    else if (e.type === 'roundEnd') { const w = e.winner; ui.banner(w === 0 || w === 1 ? `${teamTag(w)} TAKES THE ROUND` : 'DRAW', '', 3000); if (me && w === me.team) { award(profile, REWARD.round); save(); } }
    else if (e.type === 'match') { ui.banner(`${teamTag(e.winner)} WINS THE MATCH`, 'new match starting', 6000); if (me && e.winner === me.team) { award(profile, REWARD.match); save(); } }
  }
}
const tracerMat = TEAM_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), toneMapped: false, transparent: true }));
const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function tracer(e, sh) {
  _a.set(e.x / PX_PER_M, e.z - 0.3, e.y / PX_PER_M); _b.set(e.ex / PX_PER_M, e.ez, e.ey / PX_PER_M);
  const len = _a.distanceTo(_b);
  if (len < 0.6) return;
  const s0 = Math.min(1.1, len * 0.1), L = len - s0;
  _a.lerp(_b, s0 / len);
  const mesh = new THREE.Mesh(tracerGeo, tracerMat[sh ? sh.team : 0]);
  mesh.scale.z = L; mesh.position.copy(_a).lerp(_b, 0.5); mesh.lookAt(_b);
  scene.add(mesh); tracers.push({ mesh, life: 0.07 });
  if (!e.hit) burst(_b.x, _b.y, _b.z, 0xffc060, 5);
}
const bitGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
function burst(x, y, z, color, n, speed = 3) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false }));
    mesh.position.set(x, y, z); scene.add(mesh);
    bits.push({ mesh, vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed + 0.5, vz: (Math.random() - 0.5) * speed, life: 0.45 + Math.random() * 0.3 });
  }
}
// a grenade burst: a fireball, a flash of light, smoke, sparks, and a shake if you are near
const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a30).multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
const smokeGeo = new THREE.SphereGeometry(1, 10, 8), fireGeo = new THREE.SphereGeometry(1, 14, 10);
function explosion(x, y, z) {
  const eye = eyeOf(), dist = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
  sfx.boom(x, z);
  shake = Math.max(shake, Math.min(1, 7 / (1 + dist * dist * 0.12)));
  boomT = 0.35; boomLight.position.set(x, y + 0.6, z);
  const f = new THREE.Mesh(fireGeo, fireMat.clone()); f.position.set(x, y + 0.3, z); scene.add(f); fx.push({ mesh: f, t: 0, life: 0.28, kind: 'fire', r: 2.2 });
  for (let i = 0; i < 7; i++) {
    const sm = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.17, 0.16), transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
    sm.position.set(x + (Math.random() - 0.5) * 1.2, y + 0.3 + Math.random() * 0.6, z + (Math.random() - 0.5) * 1.2); scene.add(sm);
    fx.push({ mesh: sm, t: 0, life: 1.6 + Math.random() * 0.8, kind: 'smoke', r: 0.7 + Math.random() * 0.8, vy: 0.9 + Math.random() * 0.8 });
  }
  burst(x, y + 0.3, z, 0xffb050, 26, 9); burst(x, y + 0.2, z, 0x6a5a48, 10, 6);
}
function syncNades(dt, t) {
  const live = new Set();
  for (const n of match.nades) {
    live.add(n.id);
    let o = nadeMeshes.get(n.id);
    if (!o) {
      o = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3a4630, roughness: 0.5, metalness: 0.5 })); body.scale.y = 1.2; body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.3 })); cap.position.y = 0.07;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2010).multiplyScalar(3), toneMapped: false })); lamp.position.set(0.05, 0.01, 0);
      o.add(body, cap, lamp); scene.add(o); nadeMeshes.set(n.id, o);
    }
    o.position.set(n.x / PX_PER_M, n.z + 0.06, n.y / PX_PER_M); o.rotation.x += dt * 9; o.rotation.z += dt * 6;
    o.children[2].visible = Math.sin(t * 30) > -0.2;
  }
  for (const [id, o] of nadeMeshes) if (!live.has(id)) { scene.remove(o); o.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } }); nadeMeshes.delete(id); }
}

// ---- soldiers ----
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.3);
function syncUnits(dt, t) {
  camera.updateMatrixWorld(); pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
  const live = new Set();
  for (const p of match.players.values()) {
    live.add(p.id);
    const key = `${p.team}|${p.weapon}`;
    let u = units.get(p.id);
    if (u && u.key !== key) { u.dispose(); units.delete(p.id); u = undefined; }
    if (!u) { u = new Unit(A, p.team, p.weapon, TEAM_COLORS[p.team]); u.key = key; u.lx = p.x / PX_PER_M; u.lz = p.y / PX_PER_M; u.px = u.lx; u.pz = u.lz; scene.add(u.root); units.set(p.id, u); }
    const gx = p.x / PX_PER_M, gz = p.y / PX_PER_M;
    const speed = Math.hypot(gx - u.lx, gz - u.lz) / Math.max(dt, 1e-3);
    u.lx = gx; u.lz = gz;
    u.root.position.set(gx, p.z, gz); u.root.rotation.y = Math.PI / 2 - p.aim;
    // footsteps are heard whether or not the soldier is in view: one every couple of metres walked, on the surface underfoot
    if (p.alive && speed > 0.6 && speed < 9) {
      u.stepD = (u.stepD ?? 0) + speed * dt;
      if (u.stepD > (speed > 4 ? 2.1 : 1.5)) { u.stepD = 0; sfx.step(surfaceAt(gx, gz, p.z), gx, gz, p === me); }
    }
    // soldiers out of view are not drawn or animated; far ones are animated at half rate
    sph.center.set(gx, p.z + 1, gz);
    const dist = Math.hypot(gx - camera.position.x, gz - camera.position.z);
    u.root.visible = (p !== me || !p.alive) && (frustum.intersectsSphere(sph) || dist < 3);
    u.skip = !u.skip;
    if (!u.root.visible || (dist > 40 && u.skip)) { u.pend = (u.pend ?? 0) + dt; continue; }
    const udt = dt + (u.pend ?? 0); u.pend = 0;
    const vx = (gx - u.px) / Math.max(udt, 1e-3), vz = (gz - u.pz) / Math.max(udt, 1e-3);
    u.px = gx; u.pz = gz;
    u.update(udt, Math.min(speed, 7), firedNow.has(p.id), p.alive, t, (vx * Math.cos(p.aim) + vz * Math.sin(p.aim)) < -0.5);
  }
  firedNow.clear();
  for (const [id, u] of units) if (!live.has(id)) { u.dispose(); units.delete(id); ui.dropTag(id); }
}

// ---- the frame ----
function draw() {
  if (composer) composer.render(); else renderer.render(scene, camera);
  renderer.autoClear = false; renderer.clearDepth(); renderer.render(vm.scene, vm.cam); renderer.autoClear = true;
}
let acc = 0, last = performance.now(), fov = FOV;
window.__arena = { sfx, snap: () => { draw(); return canvas.toDataURL('image/jpeg', 0.92); }, draw, vm, GUN_OFFSET, start, setMap, get match() { return match; }, get me() { return me; }, get world() { return worldH; }, look, units, scene, camera, renderer, A, ui };
const v3 = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 0.1), t = now / 1000;
  const sniping = me && me.alive && me.weapon === 'sniper';
  const wantFov = zoom && playing ? (sniping ? 24 : 55) : FOV;
  fov += (wantFov - fov) * Math.min(1, dt * 14);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const sens = fov / FOV;
  if (ui.touch && (ui.lookDelta.x || ui.lookDelta.y)) { turn(ui.lookDelta.x * LOOK_TOUCH * sens, ui.lookDelta.y * LOOK_TOUCH * sens); ui.lookDelta.x = 0; ui.lookDelta.y = 0; }
  if ((playing && (ui.touch || locked || lockFailed)) || !playing) {
    acc += dt;
    for (let n = 0; acc >= SIM_STEP && n < 6; n++, acc -= SIM_STEP) { readInput(); match.step(SIM_STEP); nadeQueued = false; onEvents(match.events); }
    if (acc > SIM_STEP * 6) acc = 0;
  }
  const alive = !!(me && me.alive);
  if (alive && !wasAlive) { look.yaw = me.aim; look.pitch = 0; spectate = null; eyeY = me.z + R.EYE; }
  wasAlive = alive;
  watchFps(raw); syncUnits(dt, t); syncNades(dt, t);
  if (playing && me) sfx.setListener(camera.position.x, camera.position.z, alive ? look.yaw : (spectate ? (match.players.get(spectate)?.aim ?? 0) : 0));

  // camera
  camera.rotation.order = 'YXZ';
  const place = (x, y, z, yaw, pitch) => { camera.position.set(x, y, z); camera.rotation.set(-pitch, -yaw - Math.PI / 2, 0); };
  if (playing && alive) {
    const moving = Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1;
    walkPhase += moving ? dt * 9 : 0;
    eyeY += (me.z + R.EYE - eyeY) * Math.min(1, dt * 22);
    place(me.x / PX_PER_M, eyeY + (moving ? Math.sin(walkPhase) * 0.03 : 0), me.y / PX_PER_M, look.yaw, look.pitch);
    if (vm.set(me.weapon, me.team, TEAM_COLORS[me.team])) sfx.equip();
    vm.reloading = me.rl > 0 ? 1 - me.rl / me.reloadTime : -1;
  } else if (playing) {
    let tgt = spectate ? match.players.get(spectate) : null;
    if (!tgt || !tgt.alive) { tgt = [...match.players.values()].find((p) => p.alive && p.team === me?.team) || [...match.players.values()].find((p) => p.alive) || null; spectate = tgt ? tgt.id : null; }
    if (tgt) place(tgt.x / PX_PER_M, tgt.z + R.EYE, tgt.y / PX_PER_M, tgt.aim, tgt.pitch ?? 0); else place(mapDims.w / 2, 14, mapDims.h / 2, 0, 1.2);
  } else {
    const a = t * 0.08, cx = mapDims.w / 2, cz = mapDims.h / 2;
    camera.position.set(cx + Math.cos(a) * 30, 9 + Math.sin(a * 0.7) * 1.5, cz + Math.sin(a) * 20);
    camera.lookAt(cx, 2, cz);
  }
  if (shake > 0.002) { camera.rotation.x += (Math.random() - 0.5) * 0.05 * shake; camera.rotation.z += (Math.random() - 0.5) * 0.05 * shake; shake *= Math.pow(0.002, dt); }
  vm.update(dt, alive && Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1, walkPhase, camera.aspect, !(playing && alive) || (zoom && sniping));
  for (const u of units.values()) u.mark.lookAt(camera.position);

  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; if (tracers[i].life <= 0) { scene.remove(tracers[i].mesh); tracers.splice(i, 1); } }
  const fl = (x, z) => floorAt(match.map, x * PX_PER_M, z * PX_PER_M) + 0.02;
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]; b.life -= dt; b.vy -= 9 * dt; b.mesh.position.x += b.vx * dt; b.mesh.position.y = Math.max(fl(b.mesh.position.x, b.mesh.position.z), b.mesh.position.y + b.vy * dt); b.mesh.position.z += b.vz * dt;
    if (b.life <= 0) { scene.remove(b.mesh); b.mesh.material.dispose(); bits.splice(i, 1); }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); fx.splice(i, 1); continue; }
    if (f.kind === 'fire') { f.mesh.scale.setScalar(0.3 + f.r * Math.sqrt(k)); f.mesh.material.opacity = 0.9 * (1 - k); }
    else { f.mesh.scale.setScalar(f.r * (0.6 + k * 2.4)); f.mesh.position.y += f.vy * dt; f.mesh.material.opacity = 0.55 * (1 - k) * Math.min(1, f.t * 6); }
  }
  boomT = Math.max(0, boomT - dt); boomLight.intensity = boomT > 0 ? 90 * (boomT / 0.35) : 0;

  draw();

  hudT -= dt;
  if (playing) {
    if (hudT <= 0) {
      hudT = 0.1;
      ui.setScore(match.score, match.round, Math.max(0, Math.ceil(match.timer)), [match.aliveCount(0), match.aliveCount(1)], match.phase);
      if (me) ui.setMe(me.alive ? me.hp : 0, me.hpMax, `${me.name} | ${me.kills} kills`, me.weapon, profile.coins, me.grenades ?? 0, me.ammo, me.magSize, me.rl > 0);
    }
    const w = host.clientWidth, h = host.clientHeight;
    for (const p of match.players.values()) {
      if (p === me) continue;
      const mate = me && p.team === me.team && p.alive;
      let sx = 0, sy = 0, show = false;
      if (mate) { v3.set(p.x / PX_PER_M, p.z + UNIT_H + 0.75, p.y / PX_PER_M).project(camera); if (v3.z < 1 && Math.abs(v3.x) < 1.1) { sx = (v3.x * 0.5 + 0.5) * w; sy = (-v3.y * 0.5 + 0.5) * h; show = true; } }
      ui.tag(p.id, p.name, TEAM_COLORS[p.team], p.hp / p.hpMax, sx, sy, show);
    }
  }
}
document.getElementById('boot').remove();
requestAnimationFrame(frame);
