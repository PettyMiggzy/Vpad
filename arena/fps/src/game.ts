// Token Arena, first person: two token teams, best of three rounds, bots fill the empty seats.
// The rules (movement, shots, bots, rounds) are the match server's own file, run here in the page; this file draws them in 3D and reads the player's input.
import { Game, forward, right } from '../engine/webgpu.js';
import { GAME_OPTIONS, PX_PER_M, EYE_H, FOV, SIM_STEP, FPS_LOOK_TOUCH, TEAM_COLORS, DEFAULT_TEAM_NAMES, DEFAULT_SEATS, STORE_KEY } from './config.js';
import { Match, MAP, type Player, type SimEvent } from './sim/index.js';
import { WEAPONS, REWARD } from './sim/items.js';
import { freshProfile, sanitize, award, teamNames, type Profile } from './profile.js';
import { buildArena, makeSoldier, destroySoldier, weaponName, SOLDIER_H, type Soldier } from './arena.js';
import { UNIT } from './art.js';
const TEAM_ART = ['lime', 'pink'] as const;
import * as sfx from './audio.js';
import { Ui, type PlayChoice } from './ui.js';

const dbg = new URLSearchParams(location.search).get('dbg') || '';
const names = teamNames(location.search, DEFAULT_TEAM_NAMES);
const intColor = (h: string) => parseInt(h.slice(1), 16);
const teams = [{ name: names[0], color: intColor(TEAM_COLORS[0]) }, { name: names[1], color: intColor(TEAM_COLORS[1]) }];

let profile: Profile;
try { profile = sanitize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch { profile = freshProfile(); }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch { /* storage may be blocked */ } };

const game = await Game.create({ ...GAME_OPTIONS });
const world = await game.world3d({
  fov: FOV,
  ...(dbg.includes('low') ? { msaa: false, blobShadows: false } : {}),
  fog: dbg.includes('nofog') ? null : { color: '#070b07', near: 26, far: 80 },
  ...(dbg.includes('deflight') ? {} : { light: { x: -0.5, y: -1, z: -0.35, ambient: 0.7, sky: '#e4ecff', ground: '#8a9a78' } }),
});
try { world.sky({ time: dbg.match(/t(\d+)/)?.[1] ? Number(dbg.match(/t(\d+)/)![1]) : 18 }); world.setAmbient(0.9, '#d6cbff', '#6f6280'); } catch { /* the sky is decoration */ }
buildArena(world, TEAM_COLORS);
const frames: Record<string, number> = {};
for (const [k, url] of Object.entries(UNIT)) frames[k] = await game.assets.loadFrames(url);
// The look rig is ours (the WebGL2 fallback world has no built-in one): yaw turns right as it grows, pitch grows as the view turns down.
const look = {
  yaw: 0, pitch: 0,
  turn(dx: number, dy: number) {
    this.yaw += dx * 0.0022; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.0022));
  },
};
function aimAt(x: number, y: number, z: number, yaw: number, pitch: number) {
  const f = forward(yaw), c = Math.cos(pitch);
  world.camera.x = x; world.camera.y = y; world.camera.z = z;
  world.camera.lookAt(x + f.x * c, y - Math.sin(pitch), z + f.z * c);
}
const canvas = (document.querySelector('#game canvas') || document.querySelector('canvas')) as HTMLCanvasElement;

// ---- the match ----
const W = MAP.w / PX_PER_M, H = MAP.h / PX_PER_M;
let match = newMatch(6);
let me: Player | null = null;                       // the player's seat in the match, null while the menu is up
let playing = false, locked = false, lockFailed = false;
let fire = false, wasAlive = false;
const keys = new Set<string>();
const soldiers = new Map<string, Soldier>();
const tracers: { box: ReturnType<typeof world.box>; life: number }[] = [];
const sparks: { box: ReturnType<typeof world.box>; life: number }[] = [];
let heldKey = '', camYaw = 0;
let recoil = 0, flashT = 0, walkPhase = 0, spectate: string | null = null, hudT = 0;

function newMatch(perSide: number) {
  const mt = new Match({ teams, perSide, bots: true });
  mt.startRound();
  return mt;
}

const ui = new Ui({
  teamNames: names, teamColors: TEAM_COLORS, profile, save,
  onPlay: (c) => start(c),
  onResume: () => requestLock(),
});

function start(c: PlayChoice) {
  sfx.unlock();
  for (const [id, s] of soldiers) { destroySoldier(s); ui.dropTag(id); }
  soldiers.clear();
  match = new Match({ teams, perSide: c.seats, bots: true });
  me = match.addPlayer('me', { name: c.name, team: c.team, loadout: { ...profile.loadout } });
  match.startRound();
  playing = true; spectate = null; wasAlive = false;
  if (!dbg.includes('keepmenu')) ui.showMenu(false);
  requestLock();
  ui.banner(`ROUND 1`, 'get ready', 2600);
}

function requestLock() {
  if (dbg.includes('nolock')) { lockFailed = true; return; }
  sfx.unlock();
  if (ui.touch) return;
  try {
    const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (r && typeof r.catch === 'function') r.catch(() => { lockFailed = true; ui.showPause(false); });
  } catch { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (playing && !ui.touch && !lockFailed) ui.showPause(!locked);
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; locked = false; ui.showPause(false); });
addEventListener('mousemove', (e) => {
  if (!playing) return;
  if (locked) look.turn(e.movementX, e.movementY);
  else if (lockFailed && e.buttons & 1) look.turn(e.movementX, e.movementY);   // no pointer lock here: drag to look
});
addEventListener('mousedown', (e) => { if (e.button === 0 && playing && (locked || lockFailed) && !ui.menuOpen()) fire = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) fire = false; });
addEventListener('keydown', (e) => { keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && playing) e.preventDefault(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); fire = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', () => { if (playing && !locked && !ui.touch && !lockFailed && !ui.menuOpen()) requestLock(); });

// ---- player input into the rules engine ----
function readInput() {
  if (!me || !me.alive) return;
  const f = forward(look.yaw), r = right(look.yaw);
  let fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - ui.move.y;
  let str = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + ui.move.x;
  const len = Math.hypot(fwd, str); if (len > 1) { fwd /= len; str /= len; }
  me.input = { dx: f.x * fwd + r.x * str, dy: f.z * fwd + r.z * str, aim: look.yaw + Math.PI / 2, fire: fire || ui.fireTouch };
}

// ---- events from the rules engine ----
const teamTag = (t: number) => `<b style="color:${TEAM_COLORS[t]}">${names[t]}</b>`;
function onEvents(evs: SimEvent[]) {
  for (const e of evs) {
    if (e.type === 'shot') {
      const shooter = match.players.get(e.by);
      const eye = me?.alive ? { x: me.x / PX_PER_M, z: me.y / PX_PER_M } : { x: W / 2, z: H / 2 };
      sfx.shot(shooter?.weapon ?? 'pistol', Math.hypot(e.x / PX_PER_M - eye.x, e.y / PX_PER_M - eye.z));
      tracer(e);
      if (me && e.by === me.id) { recoil = 1; flashT = 0.05; }
    } else if (e.type === 'hit') {
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); sfx.hurt(); }
      if (me && e.by === me.id) { ui.flash('vy-hitm'); sfx.hitMarker(); }
    } else if (e.type === 'kill') {
      const a = match.players.get(e.by), v = match.players.get(e.victim);
      if (a && v) ui.feed(`<span style="color:${TEAM_COLORS[a.team]}">${a.name}</span> &#9656; <span style="color:${TEAM_COLORS[v.team]}">${v.name}</span>`);
      if (me && e.by === me.id) { sfx.kill(); award(profile, REWARD.kill); save(); }
      if (me && e.victim === me.id) { ui.flash('vy-hurt'); sfx.hurt(); ui.banner('ELIMINATED', 'spectating a team-mate', 2200); }
    } else if (e.type === 'round') {
      ui.banner(`ROUND ${e.n}`, 'get ready', 2400); sfx.chime();
    } else if (e.type === 'roundEnd') {
      const w = e.winner;
      ui.banner(w === 0 || w === 1 ? `${teamTag(w)} TAKES THE ROUND` : 'DRAW', '', 3000);
      if (me && w === me.team) { award(profile, REWARD.round); save(); }
    } else if (e.type === 'match') {
      ui.banner(`${teamTag(e.winner)} WINS THE MATCH`, 'new match starting', 6000);
      if (me && e.winner === me.team) { award(profile, REWARD.match); save(); }
    }
  }
}

function tracer(e: SimEvent) {
  const x0 = e.x / PX_PER_M, z0 = e.y / PX_PER_M, x1 = e.ex / PX_PER_M, z1 = e.ey / PX_PER_M;
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const shooter = match.players.get(e.by);
  const col = shooter ? TEAM_COLORS[shooter.team] : '#ffe27a';
  // start a little in front of the muzzle so a tracer does not cover its own shooter's gun
  const s0 = Math.min(0.9, len * 0.1), a = Math.atan2(dz, dx);
  const L = len - s0, cx = x0 + (dx / len) * (s0 + L / 2), cz = z0 + (dz / len) * (s0 + L / 2);
  tracers.push({ box: world.box({ x: cx, y: 1.3, z: cz, w: 0.035, h: 0.035, d: L, yaw: a - Math.PI / 2, color: col, emissive: 1 } as never), life: 0.07 });
  if (!e.hit) sparks.push({ box: world.box({ x: x1, y: 1.1, z: z1, w: 0.22, h: 0.22, d: 0.22, color: '#ffd27a', emissive: 1 } as never), life: 0.12 });
}

// ---- soldiers ----
function syncSoldiers(dt: number) {
  const live = new Set<string>();
  const cr = right(camYaw);
  for (const p of match.players.values()) {
    live.add(p.id);
    const key = `${p.team}|${p.weapon}`;
    let s = soldiers.get(p.id);
    if (s && s.key !== key) { destroySoldier(s); soldiers.delete(p.id); s = undefined; }
    if (!s) { s = Object.assign(makeSoldier(world, frames, p.team, p.weapon), { key }); soldiers.set(p.id, s); }
    const gx = p.x / PX_PER_M, gz = p.y / PX_PER_M;
    if (p === me) { s.bb.y = -100; s.ring.y = -100; s.lx = gx; s.lz = gz; continue; }
    // the painted character always faces you; it turns to show the side its gun points to
    s.bb.flipX = Math.cos(p.aim) * cr.x + Math.sin(p.aim) * cr.z < 0;
    s.bb.x = gx; s.bb.z = gz; s.ring.x = gx; s.ring.z = gz;
    if (p.alive) {
      s.deadFor = -1;
      const speed = Math.hypot(gx - s.lx, gz - s.lz) / Math.max(dt, 1e-3);
      s.phase += Math.min(speed, 6) * dt * 2.6;
      const bob = Math.min(1, speed / 2);
      s.bb.y = Math.abs(Math.sin(s.phase)) * 0.07 * bob;
      s.bb.h = SOLDIER_H * (1 + Math.sin(s.phase * 2) * 0.012 * bob); s.bb.w = s.bb.h * s.aspect;
      s.ring.y = 0.02; s.bb.tint = undefined;
    } else {
      if (s.deadFor < 0) s.deadFor = 0;
      s.deadFor += dt;
      // a fallen soldier squashes flat and darkens, then goes
      const f = Math.min(1, s.deadFor / 0.25);
      s.bb.h = SOLDIER_H * (1 - 0.82 * f); s.bb.w = SOLDIER_H * s.aspect * (1 + 0.5 * f); s.bb.y = 0; s.bb.tint = '#6a4a4a';
      s.ring.y = s.deadFor > 4 ? -100 : 0.02;
      if (s.deadFor > 5) s.bb.y = -100;
    }
    s.lx = gx; s.lz = gz;
  }
  for (const [id, s] of soldiers) if (!live.has(id)) { destroySoldier(s); soldiers.delete(id); ui.dropTag(id); }
}

// ---- the frame ----
let acc = 0;
const cam = world.camera;
(window as unknown as { __arena: unknown }).__arena = { world, start, get match() { return match; }, get me() { return me; }, look, soldiers };

game.run((_d, rawDt, t) => {
  const dt = Math.min(rawDt, 0.1);
  if (ui.touch && (ui.lookDelta.x || ui.lookDelta.y)) { look.turn(ui.lookDelta.x * FPS_LOOK_TOUCH, ui.lookDelta.y * FPS_LOOK_TOUCH); ui.lookDelta.x = 0; ui.lookDelta.y = 0; }

  const held = playing && (ui.touch || locked || lockFailed);
  if (held || !playing) {
    acc += dt;
    for (let n = 0; acc >= SIM_STEP && n < 6; n++, acc -= SIM_STEP) {
      readInput();
      match.step(SIM_STEP);
      onEvents(match.events);
    }
    if (acc > SIM_STEP * 6) acc = 0;
  }

  // face the way the spawn points the moment you come back to life
  const meP = me as Player, alive = !!(me && me.alive);
  if (alive && !wasAlive) { look.yaw = meP.aim - Math.PI / 2; look.pitch = 0; spectate = null; }
  wasAlive = alive;

  syncSoldiers(dt);

  // camera
  let eyeX = 0, eyeY = EYE_H, eyeZ = 0, camMode: 'self' | 'spec' | 'orbit' = 'orbit', specYaw = 0;
  if (playing && alive) {
    camMode = 'self';
    const moving = Math.hypot(meP.input?.dx ?? 0, meP.input?.dy ?? 0) > 0.1;
    walkPhase += moving ? dt * 9 : 0;
    eyeX = meP.x / PX_PER_M; eyeZ = meP.y / PX_PER_M; eyeY = EYE_H + (moving ? Math.sin(walkPhase) * 0.035 : 0);
    aimAt(eyeX, eyeY, eyeZ, look.yaw, look.pitch);
  } else if (playing) {
    camMode = 'spec';
    let tgt = spectate ? match.players.get(spectate) : null;
    if (!tgt || !tgt.alive) {
      tgt = [...match.players.values()].find((p) => p.alive && p.team === me?.team) || [...match.players.values()].find((p) => p.alive) || null;
      spectate = tgt ? tgt.id : null;
    }
    if (tgt) { eyeX = tgt.x / PX_PER_M; eyeZ = tgt.y / PX_PER_M; specYaw = tgt.aim - Math.PI / 2; }
    else { eyeX = W / 2; eyeZ = H / 2; eyeY = 12; }
    aimAt(eyeX, eyeY, eyeZ, specYaw, 0);
  } else {
    const a = t * 0.12;
    cam.x = W / 2 + Math.cos(a) * 21; cam.y = 9 + Math.sin(a * 0.7) * 2; cam.z = H / 2 + Math.sin(a) * 15;
    cam.lookAt(W / 2, 1, H / 2);
  }

  camYaw = Math.atan2(-(cam.tx - cam.x), cam.tz - cam.z);

  // the gun in your hands: a painted overlay that bobs and kicks (the page draws it, not the 3D world)
  if (playing && alive) {
    const key = `${meP.weapon}_${TEAM_ART[meP.team]}`;
    if (key !== heldKey) { ui.setHeld(key); heldKey = key; }
    recoil = Math.max(0, recoil - dt * 9); flashT = Math.max(0, flashT - dt);
    const moving = Math.hypot(meP.input?.dx ?? 0, meP.input?.dy ?? 0) > 0.1;
    ui.poseHeld(moving ? Math.sin(walkPhase) * 9 : 0, (moving ? Math.abs(Math.cos(walkPhase)) * 7 : 0) + recoil * 22, -recoil * 3, flashT > 0);
  } else { ui.setHeld(null); heldKey = ''; }

  // short-lived effects
  for (const list of [tracers, sparks]) for (let i = list.length - 1; i >= 0; i--) { list[i].life -= dt; if (list[i].life <= 0) { list[i].box.kill(); list.splice(i, 1); } }

  // the page: scoreboard, health, name tags
  hudT -= dt;
  if (playing) {
    if (hudT <= 0) {
      hudT = 0.1;
      ui.setScore(match.score, match.round, Math.max(0, Math.ceil(match.timer)), [match.aliveCount(0), match.aliveCount(1)], match.phase);
      if (me) { const q = me as Player; ui.setMe(q.alive ? q.hp : 0, q.hpMax, `${q.name} | ${q.kills} kills`, weaponName(q.weapon), profile.coins); }
    }
    for (const p of match.players.values()) {
      if (p === me) continue;
      const mate = me && p.team === me.team && p.alive;
      let sx = 0, sy = 0, show = false;
      if (mate) { const pr = world.project(p.x / PX_PER_M, 2.15, p.y / PX_PER_M); if (pr && pr.visible) { sx = pr.x; sy = pr.y; show = true; } }
      ui.tag(p.id, p.name, TEAM_COLORS[p.team], p.hp / p.hpMax, sx, sy, show);
    }
  }
});
