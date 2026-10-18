// Token Arena, in real 3D: two token teams, best of three rounds, bots in the empty seats.
// The rules (movement, shots, bots, rounds) are the match server's own file; this file draws them and reads the player's input.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { makeGradePass, applyGrade } from './post.js';
import { Match, MAPS, R, floorAt, clearLine } from '../../server/game.js';
import { REWARD, WEAPONS } from '../../server/items.js';
import { PX_PER_M, FOV, SIM_STEP, LOOK_TOUCH, TEAM_COLORS, DEFAULT_TEAM_NAMES, STORE_KEY } from './config.js';
import { freshProfile, sanitize, award, teamNames, gainXp, level as playerLevel } from './profile.ts';
import { XP } from '../../server/progress.js';
import { feelOf, spreadFor } from '../../server/gunfeel.js';
import { Ui } from './ui.ts';
import * as sfx from './audio.ts';
import { loadAssets, loadGun } from './assets.js';
import { buildWorld } from './world.js';
import { Unit, UNIT_H, GUN_OFFSET } from './units.js';
import { ViewModel } from './view.js';
import { connect } from './net.js';
import { NetMatch } from './netmatch.js';
import { serverUrl, reachable, playerId, pullProfile, mirrorShop, diagnose } from './online.js';

const qs = new URLSearchParams(location.search);
const dbg = qs.get('dbg') || '';
// graphics level: 3 high, 2 mid, 1 low, 0 minimum. 'auto' starts high (mid on phones) and steps down by itself when the frame rate is poor.
const LEVELS = { ultra: 4, high: 3, mid: 2, low: 1, min: 0 };
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

const DPR = [0.75, 1, 1.25, 1.75, 2], SHADOW = [0, 0, 1024, 2048, 4096];
let composer = null, bloomPass = null, gradePass = null, gtaoPass = null;
function makeComposer(samples, ultra) {
  const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples }));
  c.addPass(new RenderPass(scene, camera));
  gtaoPass = null;
  if (ultra) {
    // ambient occlusion: the soft darkening where things meet (under crates, in corners, at the feet of a wall)
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    gtaoPass = new GTAOPass(scene, camera, w, h);
    gtaoPass.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    gtaoPass.blendIntensity = 0.95;
    c.addPass(gtaoPass);
  }
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 0.94); c.addPass(bloomPass);
  gradePass = makeGradePass(); c.addPass(gradePass);
  if (worldH?.theme?.grade) applyGrade(gradePass, worldH.theme.grade, level < 3);
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
  if (gradePass && worldH?.theme?.grade) applyGrade(gradePass, worldH.theme.grade, level < 3);
}
/** one level of detail: resolution, shadows, glow, extra lights */
function applyLevel(l) {
  level = Math.max(0, Math.min(4, l));
  renderer.shadowMap.enabled = level >= 2;
  if (level >= 2) { if (composer) composer.dispose?.(); composer = makeComposer(level >= 3 ? 4 : 0, level >= 4); } else if (composer) { composer.dispose?.(); composer = null; }
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
let walkPhase = 0, hudT = 0, spectate = null, nadeQueued = false, meleeQueued = false, swapQueued = false, hintsOn = false, zoneFx = null, zoom = false, eyeY = 1.6, shake = 0, boomT = 0;
const nadeMeshes = new Map(), fx = [];
const sway = { y: 0, p: 0 };                 // the scope's wobble (radians): part of where the shot goes, so the player has to follow it
let breath = 1, winded = false;                // the share of held breath left, and whether it ran out
let deathCam = null, showScore = false, specYaw = 0, specPitch = 0, scoreT = 0;
let autoFire = false;
let streak = 0, multi = { n: 0, t: 0 }, beatT = 0, lastShot = new Map(), mapBg = null, mapBgId = '';

// the board of this device: practice results (ranked results arrive with challenge matches on the hosted server)
const LB_KEY = 'vyre.arena.lb.v1';
let lb; try { lb = JSON.parse(localStorage.getItem(LB_KEY) || 'null'); } catch { lb = null; }
if (!lb || typeof lb !== 'object' || !lb.teams || !lb.players) lb = { teams: {}, players: {} };
const saveLb = () => { try { localStorage.setItem(LB_KEY, JSON.stringify(lb)); } catch { /* storage may be blocked */ } };
function recordMatch(winner) {
  if (!me || match.mode !== 'practice') return;
  const w = lb.teams[names[winner]] ??= { w: 0, l: 0 }, l = lb.teams[names[1 - winner]] ??= { w: 0, l: 0 };
  w.w += 1; l.l += 1;
  const pl = lb.players[me.name] ??= { kills: 0, deaths: 0, matches: 0, wins: 0 };
  pl.kills += me.kills; pl.deaths += me.deaths; pl.matches += 1; if (me.team === winner) pl.wins += 1;
  saveLb(); ui.renderBoard();
}
let paused = false;
// a hosted game: when a match server answers, every match (practice too) runs on it and the shop lives on it; otherwise the page plays alone against bots
const srv = serverUrl() && (await reachable(serverUrl())) ? serverUrl() : '';
const pid = srv ? playerId() : '';
let netH = null, netInfo = null;
if (srv) await pullProfile(srv, pid, profile);
let shopQ = Promise.resolve();
const onShop = (op, a, b) => { if (srv) shopQ = shopQ.then(() => mirrorShop(srv, pid, profile, op, a, b)).then(() => { save(); if (ui.menuOpen()) ui.renderShop(); }); };
const ui = new Ui({ teamNames: [...names], teamColors: TEAM_COLORS, profile, save, onPlay: (c) => start(c), onResume: () => { paused = false; ui.showPause(false); requestLock(); }, onLeave: () => leave(), challengeLive: !!srv, onShop, leaders: () => lb, onPause: () => { paused = true; ui.showPause(true); }, onScore: () => { showScore = !showScore; } });

async function start(c) {
  sfx.unlock();
  if (ui.touch) { try { void document.documentElement.requestFullscreen?.(); void screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not allowed here */ } }
  if (c.gfx && (c.gfx === 'auto' || c.gfx in LEVELS)) { gfxMode = c.gfx; try { localStorage.setItem('vyre.arena.gfx', gfxMode); } catch { /* storage may be blocked */ } if (gfxMode !== 'auto' && LEVELS[gfxMode] !== level) applyLevel(LEVELS[gfxMode]); }
  ui.banner('LOADING MAP', MAPS[c.map]?.name || '', 0);
  await setMap(MAPS[c.map] ? c.map : 'cargo', (d, n) => ui.banner('LOADING MAP', `${d}/${n}`, 0));
  await Promise.all([loadGun(A, profile.loadout.weapon || 'pistol'), loadGun(A, 'pistol')]);   // the first-person models of the guns this player carries
  ui.hideBanner(); sfx.ambience(curMapId);
  for (const [id, u] of units) { u.dispose(); ui.dropTag(id); }
  units.clear();
  if (Array.isArray(c.names)) { names[0] = c.names[0]; names[1] = c.names[1]; teams[0].name = names[0]; teams[1].name = names[1]; ui.setTeams(names); }
  if (typeof c.blood === 'boolean') { bloodOn = c.blood; try { localStorage.setItem('vyre.arena.blood', bloodOn ? '1' : '0'); } catch { /* storage may be blocked */ } }
  clearBlood();
  const got = srv ? await startOnline(c) : false;
  if (srv && got === false) return;
  if (!srv || got === 'full') {
    if (got === 'full') { ui.banner('SERVER BUSY', 'playing this practice match on your own device', 2600); }
    match = new Match({ teams, perSide: c.seats, bots: true, map: curMapId, mode: 'practice', difficulty: c.difficulty ?? 1, objective: c.objective ?? 'elim', minutes: c.minutes ?? 5 });
    me = match.addPlayer('me', { name: c.name, team: c.team, loadout: { ...profile.loadout } });
    match.startRound();
  }
  if (ui.showTips()) paused = true;
  buildZone(); hintsOn = !ui.touch; ui.hints(hintsOn); if (hintsOn) setTimeout(() => { if (hintsOn && playing) { hintsOn = false; ui.hints(false); } }, 25000);
  void keepAwake(true);
  playing = true; spectate = null; wasAlive = false; eyeY = 1.6; deathCam = null; paused = false; showScore = false;
  ui.showMenu(false); requestLock();
  if (got !== 'full') ui.banner('ROUND 1', 'get ready', 2600);
}
/** joins a room on the match server and waits for the first picture of the match; false (with the menu back up) when it cannot */
async function startOnline(c) {
  const back = (msg) => { ui.hideBanner(); ui.showMenu(true); ui.error(msg); return false; };
  ui.banner('CONNECTING', 'to the match server', 0);
  let h = null, why = '';
  for (let attempt = 0; attempt < 2 && !h; attempt++) {
    try {
      h = await connect(srv, { pid, name: c.name, team: c.team, names: [...names], map: curMapId, perSide: c.seats, mode: c.mode, difficulty: c.difficulty ?? 1, objective: c.objective ?? 'elim', minutes: c.minutes ?? 5, solo: c.mode === 'practice' ? pid : 'shared' });
    } catch (err) { why = String(err?.message || err).slice(0, 90); if (attempt === 0) await new Promise((r) => setTimeout(r, 1500)); }
  }
  // a full server must not shut a practice player out: the same rules run in the page, so the match is played here instead
  if (!h && c.mode === 'practice' && /full/i.test(why)) { ui.hideBanner(); return 'full'; }
  if (!h) return back(`Could not join a match (${why || 'no reason given'}). ${await diagnose(srv)}.`);
  const hello = await new Promise((res) => { const t = setTimeout(() => res(null), 8000); h.onHello((m) => { clearTimeout(t); res(m); }); });
  if (!hello) { void h.leave(); return back('The server did not answer. Try again.'); }
  if (Array.isArray(hello.teams)) { names[0] = hello.teams[0].name; names[1] = hello.teams[1].name; teams[0].name = names[0]; teams[1].name = names[1]; ui.setTeams(names); }
  const nm = new NetMatch(hello, teams);
  h.onRoster((list) => nm.setRoster(list));
  h.onEvent((e) => nm.push(e));
  h.onSnapshot((snap) => nm.apply(snap));
  h.onClose((code) => { if (netH !== h) return; leave(); ui.error(code === 4002 ? 'You are already in a match in another window.' : 'The connection to the match server was lost.'); });
  for (let i = 0; i < 160 && !nm.ready; i++) await new Promise((r) => setTimeout(r, 50));
  const mine = nm.players.get(h.myId);
  if (!nm.ready || !mine) { void h.leave(); return back('The match did not start. Try again.'); }
  netH = h; netInfo = { sent: 0, key: '', edge: { nade: 0, melee: 0, swap: 0 } };
  match = nm; me = mine;
  return true;
}
function leave() {
  clearBlood();
  void keepAwake(false);
  if (netH) { const h = netH; netH = null; void h.leave(); if (srv) void syncProfile(); }
  playing = false; paused = false; fire = false; zoom = false;
  try { document.exitPointerLock?.(); } catch { /* not locked */ }
  for (const [id, u] of units) { u.dispose(); ui.dropTag(id); }
  units.clear(); me = null; deathCam = null; spectate = null; disposeZone(); ui.hints(false); hintsOn = false;
  match = newMatch(6, curMapId || 'cargo');
  ui.showMenu(true);
}
/** spectating: the next living team-mate (or, with none left, the next living player) */
function cycleSpec(dir = 1) {
  if (!me || me.alive) return;
  const all = [...match.players.values()].filter((p) => p.alive);
  const list = all.filter((p) => p.team === me.team).length ? all.filter((p) => p.team === me.team) : all;
  if (!list.length) { spectate = null; return; }
  const i = list.findIndex((p) => p.id === spectate);
  spectate = list[(i + dir + list.length * 2) % list.length].id;
  const t = match.players.get(spectate); if (t) { specYaw = t.aim; specPitch = t.pitch ?? 0; }
}
function requestLock() {
  sfx.unlock();
  if (ui.touch) return;
  if (dbg.includes('nolock')) { lockFailed = true; return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; ui.showPause(false); }); } catch { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (playing && !ui.touch && !lockFailed) { paused = !locked; ui.showPause(!locked); } });
document.addEventListener('pointerlockerror', () => { lockFailed = true; locked = false; ui.showPause(false); });
const turn = (dx, dy) => { vm.turned(dx, dy); look.yaw += dx * 0.0022; look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch + dy * 0.0022)); };
addEventListener('mousemove', (e) => { if (!playing) return; if (locked) turn(e.movementX, e.movementY); else if (lockFailed && (e.buttons & 1)) turn(e.movementX, e.movementY); });
addEventListener('mousedown', (e) => { if (!playing || !(locked || lockFailed) || ui.menuOpen()) return; if (e.button === 0) { fire = true; if (me && !me.alive) cycleSpec(1); } if (e.button === 2) { zoom = true; if (me && !me.alive) cycleSpec(-1); } });
addEventListener('mouseup', (e) => { if (e.button === 0) fire = false; if (e.button === 2) zoom = false; });
addEventListener('keydown', (e) => { keys.add(e.code); if (playing && e.code === 'Tab') { e.preventDefault(); showScore = true; } if (playing && me && !me.alive && (e.code === 'Space' || e.code === 'ArrowRight')) cycleSpec(1); if (playing && me && !me.alive && e.code === 'ArrowLeft') cycleSpec(-1); if (e.code === 'KeyG' && playing && !e.repeat) nadeQueued = true; if ((e.code === 'KeyF' || e.code === 'KeyV') && playing && !e.repeat) meleeQueued = true; if (playing && !e.repeat && me && me.alive && (e.code === 'KeyQ' || (e.code === 'Digit1' && me.slot === 1) || (e.code === 'Digit2' && me.slot === 0))) swapQueued = true; if (e.code === 'KeyH' && playing && !ui.touch) { hintsOn = !hintsOn; ui.hints(hintsOn); } if (playing && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Tab') showScore = false; });
addEventListener('blur', () => { keys.clear(); fire = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', () => { if (playing && !locked && !ui.touch && !lockFailed && !ui.menuOpen()) requestLock(); });

function readInput() {
  if (!me || !me.alive) return;
  const fx = Math.cos(look.yaw), fz = Math.sin(look.yaw), rx = -fz, rz = fx;   // forward, and right of it
  let fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - ui.move.y;
  let str = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + ui.move.x;
  const len = Math.hypot(fwd, str); if (len > 1) { fwd /= len; str /= len; }
  me.input = { dx: fx * fwd + rx * str, dy: fz * fwd + rz * str, aim: look.yaw + sway.y, pitch: -look.pitch + sway.p, fire: fire || ui.fireTouch || autoFire, nade: nadeQueued || ui.nadeTouch, reload: keys.has('KeyR') || ui.reloadTouch, jump: keys.has('Space') || ui.jumpTouch, melee: meleeQueued || ui.knifeTouch, swap: swapQueued || ui.swapTouch, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || ui.sprintTouch, ads: zoom || ui.zoomTouch };
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
      tracer(e, sh); firedNow.add(e.by); lastShot.set(e.by, performance.now());
      if (own) vm.fire();
      // a bullet that flew past your head, or hit the wall beside you
      if (me && me.alive && !own && sh && sh.team !== me.team && !e.hit && distToSeg(eye.x, eye.y, eye.z, e.x / PX_PER_M, e.z, e.y / PX_PER_M, e.ex / PX_PER_M, e.ez, e.ey / PX_PER_M) < 2.2) sfx.whiz();
      if (!e.hit) {
        const ix = e.ex / PX_PER_M, iz = e.ey / PX_PER_M;
        sfx.impact(e.ez < 0.15 ? (curMapId === 'dust' ? 'dirt' : 'concrete') : curMapId === 'dust' ? 'concrete' : (e.x + e.y) % 3 < 1.6 ? 'metal' : 'concrete', ix, iz);
      }
    } else if (e.type === 'hit') {
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); sfx.hurtMe(); buzz(45); const at = match.players.get(e.by); if (at && at.id !== me.id) ui.hitDir(Math.atan2(at.y - me.y, at.x - me.x) - look.yaw); }
      if (me && e.by === me.id) { ui.flash('vy-hitm'); sfx.hitMarker(); }
      sfx.impact('flesh', e.x / PX_PER_M, e.y / PX_PER_M);
      units.get(e.victim)?.hit();
      if (bloodOn) { const at = match.players.get(e.by); if (!e.nade) bloodHit(e.x / PX_PER_M, e.z ?? 1.2, e.y / PX_PER_M, at ? e.x - at.x : 0, at ? e.y - at.y : 0, !!e.head); }
      else burst(e.x / PX_PER_M, e.z ?? 1.2, e.y / PX_PER_M, 0xffd890, e.nade ? 0 : 5);
    } else if (e.type === 'kill') {
      const a = match.players.get(e.by), v = match.players.get(e.victim);
      if (a && v) ui.feed(`<span style="color:${TEAM_COLORS[a.team]}">${a.name}</span> ${e.melee ? '&#9876;' : e.nade ? '&#9679;' : e.head ? '&#9678;' : '&#9656;'} <span style="color:${TEAM_COLORS[v.team]}">${v.name}</span>`);
      if (me && e.by === me.id && e.victim !== me.id) {
        sfx.kill(); buzz(28); if (!netH) { award(profile, REWARD.kill); save(); }
        streak += 1; const now = performance.now() / 1000; multi = { n: now - multi.t < 4 ? multi.n + 1 : 1, t: now };
        const tags = []; if (e.melee) tags.push(e.back ? 'BACKSTAB' : 'KNIFE KILL');
        if (multi.n === 2) tags.push('DOUBLE KILL'); else if (multi.n === 3) tags.push('TRIPLE KILL'); else if (multi.n >= 4) tags.push('RAMPAGE');
        if (streak === 3) tags.push('KILLING SPREE'); else if (streak === 5) tags.push('UNSTOPPABLE'); else if (streak === 8) tags.push('LEGENDARY');
        if (!tags.length) tags.push(e.nade ? 'GRENADE KILL' : e.head ? 'HEADSHOT' : '');
        const before = playerLevel(profile); if (!netH) gainXp(profile, XP.kill + (e.head ? XP.head : 0) + (e.melee ? XP.melee : 0) + (e.nade ? XP.nade : 0), e.nade || e.melee ? null : (e.weapon ?? me.weapon)); if (!netH) save(); if (playerLevel(profile) > before) ui.banner('LEVEL UP', `You are level ${playerLevel(profile)}: new gear in the shop`, 3200);
        if (tags[0]) { ui.medal(tags.join('  +  '), e.head && !e.nade ? '#ff6a50' : '#ffd24a'); sfx.medal(); }
      }
      if (me && e.victim === me.id) { streak = 0; multi = { n: 0, t: 0 }; }
      if (v) sfx.dieAt(v.x / PX_PER_M, v.y / PX_PER_M, !!(me && e.victim === me.id));
      if (v && bloodOn) { bloodHit(v.x / PX_PER_M, v.z + 1.2, v.y / PX_PER_M, 0, 0, !!e.head); stain(v.x / PX_PER_M, v.y / PX_PER_M, 0.9 + Math.random() * 0.3, 26, (Math.random() * 3) | 0); }
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); deathCam = { t: 0, killer: e.by, yaw: look.yaw, pitch: look.pitch }; spectate = null; ui.banner('ELIMINATED', `${a && a.id !== me.id ? `by ${a.name}` : ''}${match.objective === 'dm' ? ` · back in ${R.RESPAWN} s` : ''}`.replace(/^ · /, ''), match.objective === 'dm' ? R.RESPAWN * 1000 - 400 : 2200); }
    } else if (e.type === 'melee') {
      const at = match.players.get(e.by), own = !!(me && e.by === me.id);
      sfx.play('knife_swing', { x: e.x / PX_PER_M, z: e.y / PX_PER_M, own, vol: 0.8 });
      if (e.hit) { const v = match.players.get(e.hit); if (v) sfx.play('knife_hit', { x: v.x / PX_PER_M, z: v.y / PX_PER_M, vol: 1 }); }
      if (own) vm.stab(); else units.get(e.by)?.act('melee');
      void at;
    } else if (e.type === 'jump') {
      units.get(e.by)?.act('jump');
    } else if (e.type === 'land') {
      const p = match.players.get(e.by); if (p) sfx.play('jump_land', { x: p.x / PX_PER_M, z: p.y / PX_PER_M, own: !!(me && e.by === me.id), vol: 0.7 });
    } else if (e.type === 'streak') {
      if (me && e.by === me.id) { ui.medal(e.kind === 'uav' ? 'DRONE ONLINE: ENEMIES ON THE MAP' : 'ADRENALINE: FASTER, QUICK RELOAD', '#7fe8ff'); sfx.play('streak', { own: true, vol: 0.7 }); }
      else if (e.kind === 'uav' && me && match.players.get(e.by)?.team === me.team) { sfx.play('uav_ping', { own: true, vol: 0.6 }); ui.banner('YOUR TEAM HAS A DRONE', 'enemies show on the map', 1800); }
      else if (e.kind === 'uav') { ui.banner('ENEMY DRONE OVERHEAD', 'they can see you on the map', 1800); }
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
    } else if (e.type === 'round') { ui.banner(match.objective === 'dm' ? 'DEATHMATCH' : `ROUND ${e.n}`, match.objective === 'dm' ? `${match.minutes} minutes: most kills wins, you come back after every kill` : 'get ready', 2400); sfx.chime(); }
    else if (e.type === 'roundEnd') { const w = e.winner; ui.banner(w === 0 || w === 1 ? `${teamTag(w)} TAKES THE ROUND` : 'DRAW', e.reason === 'zone' ? 'by holding the zone' : '', 3000); if (me && w === me.team && !netH) { award(profile, REWARD.round); gainXp(profile, XP.round); save(); } }
    else if (e.type === 'match') { recordMatch(e.winner); ui.banner(`${teamTag(e.winner)} WINS THE MATCH`, 'new match starting', 6000); if (me && !netH) { gainXp(profile, XP.play + (e.winner === me.team ? XP.match : 0)); if (e.winner === me.team) award(profile, REWARD.match); save(); } }
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
// ---- blood: a short spray where a hit lands, drops that stain the floor and fade, and a pool where someone falls. Kept clean: no gore, nothing lasting.
// The menu switch turns it off (sparks instead). ----
let bloodOn = true; try { bloodOn = localStorage.getItem('vyre.arena.blood') !== '0'; } catch { /* storage may be blocked */ }
const LIGHT_FX = matchMedia('(pointer: coarse)').matches;
const bloodGeo = new THREE.IcosahedronGeometry(0.02, 0);
const bloodMats = [0x4a0707, 0x5e0b0b, 0x3a0505].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
function splatTexture(seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  let s = seed * 7919 + 17; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blob = (x, y, rad, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); };
  blob(64, 64, 26 + r() * 8, 1);
  for (let i = 0; i < 5; i++) blob(64 + (r() - 0.5) * 30, 64 + (r() - 0.5) * 30, 10 + r() * 12, 0.95);
  for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = 30 + r() * 30; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 6, 0.9); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bloodTex = [1, 2, 3].map(splatTexture);
const stainGeo = new THREE.PlaneGeometry(1, 1);
const stainPool = []; let stainAt = 0;
const drops = [], stains = [];
function stain(x, z, size, life, kind = 0) {
  let s = stainPool[stainAt]; stainAt = (stainAt + 1) % 40;
  if (!s) { s = new THREE.Mesh(stainGeo, new THREE.MeshStandardMaterial({ map: bloodTex[0], color: 0x4a0707, transparent: true, depthWrite: false, roughness: 0.16, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); s.rotation.x = -Math.PI / 2; stainPool.push(s); }
  const i = stains.findIndex((q) => q.mesh === s); if (i >= 0) stains.splice(i, 1);
  s.material.map = bloodTex[kind % 3]; s.material.opacity = 0.9; s.material.needsUpdate = true;
  s.position.set(x, floorAt(match.map, x * PX_PER_M, z * PX_PER_M) + 0.012, z); s.rotation.z = Math.random() * 6.28; s.scale.setScalar(size * 0.4); scene.add(s);
  stains.push({ mesh: s, t: 0, life, size });
}
/** a hit: drops thrown along the bullet's way on, and a faint red mist */
function bloodHit(x, y, z, dx, dz, head) {
  const n = (LIGHT_FX ? 5 : 9) + (head ? (LIGHT_FX ? 4 : 8) : 0), len = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < n && drops.length < 140; i++) {
    const m = new THREE.Mesh(bloodGeo, bloodMats[i % 3]); m.position.set(x, y, z); m.scale.setScalar(0.7 + Math.random() * 1.1); scene.add(m);
    const sp = 1.2 + Math.random() * 2.6;
    drops.push({ m, vx: (dx / len) * sp + (Math.random() - 0.5) * 1.6, vy: Math.random() * 1.6 + 0.2, vz: (dz / len) * sp + (Math.random() - 0.5) * 1.6, life: 0.7 });
  }
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x5a0a0a, transparent: true, depthWrite: false, opacity: 0.5 }));
  mist.position.set(x, y, z); scene.add(mist); fx.push({ mesh: mist, t: 0, life: 0.3, kind: 'smoke', r: head ? 0.9 : 0.55, vy: 0.25 });
}
function updateBlood(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.life -= dt; d.vy -= 9.5 * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
    const f = floorAt(match.map, d.m.position.x * PX_PER_M, d.m.position.z * PX_PER_M);
    if (d.m.position.y <= f + 0.02 || d.life <= 0) { if (d.m.position.y <= f + 0.05 && Math.random() < 0.45) stain(d.m.position.x, d.m.position.z, 0.14 + Math.random() * 0.22, 16 + Math.random() * 8, (Math.random() * 3) | 0); scene.remove(d.m); drops.splice(i, 1); }
  }
  for (let i = stains.length - 1; i >= 0; i--) {
    const s = stains[i]; s.t += dt; const k = Math.min(1, s.t / 0.5);
    s.mesh.scale.setScalar(s.size * (0.4 + 0.6 * (1 - (1 - k) ** 2)));
    const left = s.life - s.t; s.mesh.material.opacity = 0.9 * Math.max(0, Math.min(1, left / 5));
    if (left <= 0) { scene.remove(s.mesh); stains.splice(i, 1); }
  }
}
function clearBlood() { for (const d of drops) scene.remove(d.m); drops.length = 0; for (const s of stains) scene.remove(s.mesh); stains.length = 0; }
const bitGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
function burst(x, y, z, color, n, speed = 3) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false }));
    mesh.position.set(x, y, z); scene.add(mesh);
    bits.push({ mesh, vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed + 0.5, vz: (Math.random() - 0.5) * speed, life: 0.45 + Math.random() * 0.3 });
  }
}
// a grenade burst: a fireball and flash, drifting smoke and sparks (soft sprites, not solids), plus a shake if you are near
const glowTex = (inner, outer) => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const fireTex = glowTex('rgba(255,245,200,1)', 'rgba(255,140,30,0.75)'), smokeTex = glowTex('rgba(90,86,80,0.8)', 'rgba(60,58,55,0.45)');
function explosion(x, y, z) {
  const eye = eyeOf(), dist = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
  sfx.boom(x, z);
  shake = Math.max(shake, Math.min(1, 7 / (1 + dist * dist * 0.12)));
  boomT = 0.35; boomLight.position.set(x, y + 0.6, z);
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.1, 0.7) }));
    sp.position.set(x + (Math.random() - 0.5) * 0.8, y + 0.4 + i * 0.25, z + (Math.random() - 0.5) * 0.8); scene.add(sp);
    fx.push({ mesh: sp, t: 0, life: 0.3 + i * 0.06, kind: 'fire', r: 3.2 - i * 0.4 });
  }
  for (let i = 0; i < 9; i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    sm.position.set(x + (Math.random() - 0.5) * 1.6, y + 0.3 + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.6); scene.add(sm);
    fx.push({ mesh: sm, t: 0, life: 1.8 + Math.random() * 1.0, kind: 'smoke', r: 1.6 + Math.random() * 1.2, vy: 0.6 + Math.random() * 0.6 });
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
    u.root.visible = (p !== me || !p.alive) && p.id !== spectate && (frustum.intersectsSphere(sph) || dist < 3);
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

// ---- Hold the Zone: a glowing circle on the floor (on the catwalk in the Refinery) that shows who holds it ----
function disposeZone() {
  if (!zoneFx) return;
  scene.remove(zoneFx.g); zoneFx.g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); zoneFx = null;
}
function buildZone() {
  disposeZone();
  const zn = match.map.zone; if (match.objective !== 'zone' || !zn) return;
  const r = zn.r / PX_PER_M, g = new THREE.Group(); g.position.set(zn.x / PX_PER_M, zn.z + 0.05, zn.y / PX_PER_M);
  const mat = (a) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: a, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 56), mat(0.16)); disc.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 72), mat(0.9)); ring.rotation.x = Math.PI / 2;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 4.5, 56, 1, true), mat(0.1)); wall.position.y = 2.25;
  g.add(disc, ring, wall); scene.add(g); zoneFx = { g, mats: [disc.material, ring.material, wall.material], base: [0.16, 0.9, 0.1] };
}
function zoneColor() { const [a, b] = match.zoneIn; return a && b ? 0xffd24a : a ? hex(TEAM_COLORS[0]) : b ? hex(TEAM_COLORS[1]) : 0xffffff; }
function updateZone(t) {
  if (!zoneFx) return;
  const c = new THREE.Color(zoneColor()).multiplyScalar(1.6), pulse = 0.85 + Math.sin(t * 3) * 0.15;
  zoneFx.mats.forEach((m, i) => { m.color.copy(c); m.opacity = zoneFx.base[i] * pulse; });
}
// ---- easy aim for phones: lines the view up with an enemy near the crosshair and fires when you are on target ----
function assist(dt) {
  autoFire = false;
  if (!ui.touch || !ui.easy || !me || !me.alive || match.phase !== 'live' || paused) return;
  const w = WEAPONS[me.weapon], eyeZ = me.z + R.EYE, held = fire || ui.fireTouch;
  let best = null, bestA = 9;
  for (const p of match.players.values()) {
    if (!p.alive || p.team === me.team) continue;
    const dx = p.x - me.x, dy = p.y - me.y, d = Math.hypot(dx, dy);
    if (d > w.range * 0.95) continue;
    const rc = me.rc || NO_RC;
    let a = Math.atan2(dy, dx) - look.yaw - rc.y; a = Math.atan2(Math.sin(a), Math.cos(a));
    const lim = 0.05 + 0.22 * Math.min(1, 600 / Math.max(d, 150));          // a wider catch cone up close
    if (Math.abs(a) > lim || Math.abs(a) >= bestA) continue;
    if (!clearLine(match.map, me.x, me.y, eyeZ, p.x, p.y, p.z + 1.35)) continue;
    best = { p, a, d }; bestA = Math.abs(a);
  }
  if (!best) return;
  const pull = Math.min(1, dt * (held ? 8 : 3.5));
  look.yaw += best.a * pull;
  look.pitch += ((-Math.atan2(best.p.z + 1.35 - eyeZ, best.d / PX_PER_M) + (me.rc || NO_RC).p) - look.pitch) * pull;
  if (Math.abs(best.a) < 0.05) autoFire = true;
}
// ---- the minimap: the map's own solids, your team, and any enemy that fired in the last second and a half ----
function drawMinimap() {
  const cv = ui.mapCanvas, g = cv.getContext('2d'), W = cv.width, H = cv.height, m = match.map, sx = W / m.w, sy = H / m.h;
  if (mapBgId !== m.id || !mapBg) {
    mapBg = document.createElement('canvas'); mapBg.width = W; mapBg.height = H; const b = mapBg.getContext('2d');
    b.fillStyle = 'rgba(6,10,6,0.88)'; b.fillRect(0, 0, W, H);
    for (const r of m.ramps) { b.fillStyle = 'rgba(130,160,100,0.35)'; b.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy); }
    for (const q of m.solids) { if (q.kind === 'wall' || q.kind === 'rail') continue; const h = Math.min(1, q.top / 6); b.fillStyle = q.walk ? `rgba(130,170,90,${0.3 + 0.3 * h})` : `rgba(175,180,175,${0.3 + 0.4 * h})`; b.fillRect(q.x * sx, q.y * sy, q.w * sx, q.h * sy); }
    mapBgId = m.id;
  }
  g.clearRect(0, 0, W, H); g.drawImage(mapBg, 0, 0);
  const now = performance.now();
  if (match.objective === 'zone' && m.zone) { g.strokeStyle = '#' + zoneColor().toString(16).padStart(6, '0'); g.lineWidth = 4; g.beginPath(); g.arc(m.zone.x * sx, m.zone.y * sy, m.zone.r * sx, 0, 7); g.stroke(); }
  const drone = me && match.uav[me.team] > 0;
  for (const p of match.players.values()) {
    if (!p.alive || p === me) continue;
    const mine = me && p.team === me.team, shot = now - (lastShot.get(p.id) ?? -1e9) < 1500;
    if (!mine && !shot && !drone) continue;
    g.fillStyle = TEAM_COLORS[p.team]; g.beginPath(); g.arc(p.x * sx, p.y * sy, shot && !mine ? 7 : 5, 0, 7); g.fill();
    if (shot && !mine) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  }
  if (me && me.alive) {
    g.save(); g.translate(me.x * sx, me.y * sy); g.rotate(look.yaw); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 5.5); g.lineTo(-6, -5.5); g.closePath(); g.fill(); g.restore();
  }
}
// ---- a hosted match: what the player is doing goes to the server, only when it changes (and every tenth of a second so nothing sticks) ----
function sendInput(now, idle = false) {
  if (!me || !netInfo) return;
  if (idle || !me.alive) me.input = { dx: 0, dy: 0, aim: look.yaw, pitch: -look.pitch, fire: false, nade: false, reload: false, jump: false, melee: false, swap: false, sprint: false, ads: false };
  else readInput();
  const inp = me.input, ed = netInfo.edge;
  // a throw, a stab or a swap is a moment, not a state: keep it up for a little over a server step so a busy frame cannot lose it
  for (const k of ['nade', 'melee', 'swap']) { if (inp[k]) ed[k] = now + 120; inp[k] = now < ed[k]; }
  nadeQueued = false; meleeQueued = false; swapQueued = false; ui.swapTouch = false;
  me.sprinting = !!inp.sprint && Math.hypot(inp.dx, inp.dy) > 0.3;
  const key = [inp.dx.toFixed(2), inp.dy.toFixed(2), inp.aim.toFixed(2), inp.pitch.toFixed(2), +inp.fire, +inp.nade, +inp.reload, +inp.jump, +inp.melee, +inp.swap, +inp.sprint, +!!inp.ads].join();
  if (key !== netInfo.key || now - netInfo.sent > 100) { netInfo.key = key; netInfo.sent = now; netH.send(inp); }
}
let lobbyUp = false;
function lobbyBanner() {
  const wait = match.phase === 'lobby' && match.mode === 'challenge';
  if (wait && !lobbyUp) { lobbyUp = true; ui.banner('WAITING FOR THE OTHER TEAM', 'a challenge starts when a player is on each side', 0); }
  else if (!wait && lobbyUp) { lobbyUp = false; ui.hideBanner(); }
}
// the shop on the server is the truth: coins and experience earned in a match are added there, so look again while playing
async function syncProfile() {
  const before = playerLevel(profile);
  if (!(await pullProfile(srv, pid, profile))) return;
  save();
  if (playing && playerLevel(profile) > before) ui.banner('LEVEL UP', `You are level ${playerLevel(profile)}: new gear in the shop`, 3200);
  if (ui.menuOpen()) ui.renderShop();
}
setInterval(() => { if (srv && playing && netH) void syncProfile(); }, 6000);
// ---- scoped breathing: through a sniper scope the view wobbles; Shift holds your breath for a few seconds to steady it, then you are winded and must wait ----
function updateSway(dt, t, scoped) {
  if (!scoped) { sway.y = sway.p = 0; breath = Math.min(1, breath + dt * 0.4); if (breath >= 1) winded = false; return; }
  const moving = Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1;
  const holding = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !winded && breath > 0 && !ui.touch;
  if (holding) { breath = Math.max(0, breath - dt / (me?.steady ? 5.2 : 3.2)); if (breath <= 0) winded = true; } else { breath = Math.min(1, breath + dt * (winded ? 0.28 : 0.45)); if (winded && breath >= 0.6) winded = false; }
  const A = 0.0042 * (me?.steady ? 0.6 : 1) * (ui.touch ? 0.55 : 1) * (moving ? 3 : 1) * (holding ? 0.08 : winded ? 1.6 : 1);
  sway.y = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.63 + 1) * 0.4) * A;
  sway.p = (Math.sin(t * 1.3 + 2) * 0.5 + Math.sin(t * 0.5) * 0.3 + Math.sin(t * 1.1) * 0.3) * A;
}
// ---- the frame ----
function draw() {
  if (composer) composer.render(); else renderer.render(scene, camera);
  renderer.autoClear = false; renderer.clearDepth(); renderer.render(vm.scene, vm.cam); renderer.autoClear = true;
}
let acc = 0, last = performance.now(), fov = FOV;
const NO_RC = { p: 0, y: 0, bloom: 0 };
window.__arena = { bloodHit, stain, get net() { return netH; }, get netInfo() { return netInfo; }, sfx, snap: () => { draw(); return canvas.toDataURL('image/jpeg', 0.92); }, draw, vm, GUN_OFFSET, start, setMap, get match() { return match; }, get me() { return me; }, get world() { return worldH; }, look, units, scene, camera, renderer, A, ui };
const v3 = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 0.1), t = now / 1000;
  const sniping = me && me.alive && me.weapon === 'sniper';
  const scoped = !!sniping && (me.ads ?? 0) > 0.85;
  updateSway(dt, now / 1000, scoped);
  const zoomNow = zoom || ui.zoomTouch;
  const wantFov = zoomNow && playing && me ? feelOf(me.weapon).ads.zoom * (me.zoomMul ?? 1) : FOV + (me && me.alive && me.sprinting ? 7 : 0);
  fov += (wantFov - fov) * Math.min(1, dt * 14);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const sens = fov / FOV;
  if (ui.touch && (ui.lookDelta.x || ui.lookDelta.y)) { turn(ui.lookDelta.x * LOOK_TOUCH * sens, ui.lookDelta.y * LOOK_TOUCH * sens); ui.lookDelta.x = 0; ui.lookDelta.y = 0; }
  if ((playing && !paused && (ui.touch || locked || lockFailed)) || !playing) {
    if (netH) { assist(dt); sendInput(now); }
    else {
      acc += dt; assist(dt);
      for (let n = 0; acc >= SIM_STEP && n < 6; n++, acc -= SIM_STEP) { readInput(); match.step(SIM_STEP); nadeQueued = false; meleeQueued = false; swapQueued = false; ui.swapTouch = false; onEvents(match.events); }
      if (acc > SIM_STEP * 6) acc = 0;
    }
  } else if (netH) sendInput(now, true);
  if (netH) { match.tick(dt); onEvents(match.takeEvents()); lobbyBanner(); }
  const alive = !!(me && me.alive);
  if (alive && !wasAlive) { look.yaw = me.aim; look.pitch = 0; spectate = null; deathCam = null; eyeY = me.z + R.EYE; ui.spec(null); }
  wasAlive = alive;
  watchFps(raw); syncUnits(dt, t); syncNades(dt, t);
  if (playing && me) sfx.setListener(camera.position.x, camera.position.z, alive ? look.yaw : (spectate ? (match.players.get(spectate)?.aim ?? 0) : 0));

  // camera
  camera.rotation.order = 'YXZ';
  const place = (x, y, z, yaw, pitch) => { camera.position.set(x, y, z); camera.rotation.set(-pitch, -yaw - Math.PI / 2, 0); };
  if (playing && alive) {
    const moving = Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1;
    walkPhase += moving ? dt * (me.sprinting ? 13 : 9) : 0;
    eyeY += (me.z + R.EYE - eyeY) * Math.min(1, dt * 22);
    const rc = me.rc || NO_RC;
    place(me.x / PX_PER_M, eyeY + (moving ? Math.sin(walkPhase) * 0.03 * (1 - 0.7 * (me.ads ?? 0)) : 0), me.y / PX_PER_M, look.yaw + rc.y + sway.y, look.pitch - rc.p - sway.p);
    vm.ads = me.ads ?? 0;
    if (vm.set(me.weapon, me.team, TEAM_COLORS[me.team])) sfx.equip();
    vm.reloading = me.rl > 0 ? 1 - me.rl / me.reloadTime : -1; vm.sprinting = !!me.sprinting;
    if (me.hp / me.hpMax < 0.3 && match.phase === 'live') { beatT -= dt; if (beatT <= 0) { sfx.heartbeat(); beatT = 0.5 + (me.hp / me.hpMax) * 2; } } else beatT = 0;
  } else if (playing && me) {
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const killer = deathCam ? match.players.get(deathCam.killer) : null;
    if (deathCam && deathCam.t < 2.2 && match.phase !== 'matchover') {
      // the death cam: you drop to the floor where you fell and turn to look at who got you
      deathCam.t += dt;
      const fall = Math.min(1, deathCam.t / 0.45), ey = me.z + R.EYE - (R.EYE - 0.32) * (1 - (1 - fall) ** 2);
      let ty = deathCam.yaw, tp = 0.25;
      if (killer && killer.id !== me.id) { ty = Math.atan2(killer.y - me.y, killer.x - me.x); tp = Math.atan2(-(killer.z + 1.3 - ey), Math.hypot(killer.x - me.x, killer.y - me.y) / PX_PER_M); }
      deathCam.yaw += wrapA(ty - deathCam.yaw) * (1 - Math.exp(-5 * dt)); deathCam.pitch += (tp - deathCam.pitch) * (1 - Math.exp(-5 * dt));
      place(me.x / PX_PER_M, ey, me.y / PX_PER_M, deathCam.yaw, deathCam.pitch);
      ui.spec(killer && killer.id !== me.id ? `Eliminated by ${killer.name}` : 'Eliminated', '');
    } else {
      // spectating: through a living team-mate's eyes, turned smoothly (a bot's aim jitters, a camera must not)
      let tgt = spectate ? match.players.get(spectate) : null;
      if (!tgt || !tgt.alive) { spectate = null; cycleSpec(1); tgt = spectate ? match.players.get(spectate) : null; }
      if (tgt) {
        specYaw += wrapA(tgt.aim - specYaw) * (1 - Math.exp(-9 * dt)); specPitch += ((tgt.pitch ?? 0) - specPitch) * (1 - Math.exp(-9 * dt));
        place(tgt.x / PX_PER_M, tgt.z + R.EYE, tgt.y / PX_PER_M, specYaw, -specPitch);
        ui.spec(`Spectating ${tgt.name}`, ui.touch ? '' : 'click or Space: next &middot; right click: previous');
      } else { place(mapDims.w / 2, 16, mapDims.h / 2, 0, 1.2); ui.spec(null); }
    }
  } else {
    const a = t * 0.08, cx = mapDims.w / 2, cz = mapDims.h / 2;
    camera.position.set(cx + Math.cos(a) * 30, 9 + Math.sin(a * 0.7) * 1.5, cz + Math.sin(a) * 20);
    camera.lookAt(cx, 2, cz);
  }
  if (shake > 0.002) { camera.rotation.x += (Math.random() - 0.5) * 0.05 * shake; camera.rotation.z += (Math.random() - 0.5) * 0.05 * shake; shake *= Math.pow(0.002, dt); }
  vm.update(dt, alive && Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) > 0.1, walkPhase, camera.aspect, !(playing && alive) || scoped);
  ui.scope(playing && alive && scoped, breath, winded);
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
    if (f.kind === 'fire') { f.mesh.scale.setScalar(0.4 + f.r * Math.sqrt(k)); f.mesh.material.opacity = 1 - k * k; }
    else { f.mesh.scale.setScalar(f.r * (0.7 + k * 1.6)); f.mesh.position.y += f.vy * dt; f.mesh.material.opacity = 0.6 * (1 - k) * Math.min(1, f.t * 5); }
  }
  updateBlood(dt);
  boomT = Math.max(0, boomT - dt); boomLight.intensity = boomT > 0 ? 90 * (boomT / 0.35) : 0;

  updateZone(t);
  if (gradePass) gradePass.uniforms.time.value = t;
  worldH?.follow?.(t, camera.position);
  draw();

  hudT -= dt;
  if (playing) {
    if (hudT <= 0) {
      hudT = 0.1;
      ui.setScore(match.score, match.round, Math.max(0, Math.ceil(match.timer)), [match.aliveCount(0), match.aliveCount(1)], match.phase, match.objective === 'dm', !!match.overtime);
      const ended = match.phase === 'matchover' || match.phase === 'finished';
      ui.scoreboard(showScore || ended, [...match.players.values()].map((p) => ({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, bot: p.bot, me: p === me, alive: p.alive })), names, match.score,
        ended && match.winner !== null ? `${names[match.winner]} wins the match${match.mode === 'practice' ? ' &middot; practice, not counted on the ranked board' : ''}` : '');
      document.getElementById('vy-cross').style.display = me && me.alive ? '' : 'none';
      if (me && me.alive) { const w = WEAPONS[me.weapon] || WEAPONS.pistol, mv = Math.min(1, Math.hypot(me.input?.dx ?? 0, me.input?.dy ?? 0) * (me.sprinting ? 1.32 : 1)); const sp = spreadFor(me.weapon, w.spread, { ads: me.ads ?? 0, move: mv, air: !!me.air, bloom: me.rc?.bloom ?? 0 }) * (w.pellets > 1 ? 1 : 1); ui.cross(Math.tan(sp) * (host.clientHeight / 2) / Math.tan(camera.fov * Math.PI / 360), me.ads ?? 0); }
      ui.lowHealth(me && me.alive ? me.hp / me.hpMax : 1); drawMinimap();
      ui.setZone(match.objective === 'zone' && !!match.map.zone, match.zoneP[0], match.zoneP[1], match.zoneIn[0], match.zoneIn[1], TEAM_COLORS);
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
// ---- phones: keep the screen awake while playing, buzz on a hit, pause when the app is switched away, recover from a lost graphics context ----
let wake = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { wake = null; }
}
const buzz = (ms) => { if (ui.touch) try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (playing && ui.touch && !paused) { paused = true; ui.showPause(true); } void keepAwake(false); }
  else if (playing) void keepAwake(true);
});
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ui.banner('GRAPHICS RESET', 'tap the screen to reload', 0); addEventListener('pointerdown', () => location.reload(), { once: true }); });
canvas.addEventListener('webglcontextrestored', () => location.reload());
document.getElementById('boot').remove();
requestAnimationFrame(frame);
