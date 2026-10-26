// Sound: recorded-style gun shots, reloads, footsteps, impacts, explosions and a loop of each map's ambience (generated sound files in public/sfx),
// placed in the stereo field and softened by distance, with a small delay for the speed of sound. A few short tones (hit tick, kill, round chime) stay synthetic.
let ac: AudioContext | null = null;
let master: GainNode | null = null;
const bufs = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;
const BASE = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL + 'sfx/';

const NAMES = [
  'pistol_a', 'pistol_b', 'smg_a', 'smg_b', 'rifle_a', 'rifle_b', 'shotgun_a', 'shotgun_b', 'sniper_a', 'sniper_b',
  'reload_pistol', 'reload_smg', 'reload_rifle', 'reload_sniper', 'shotgun_pump', 'shotgun_shell', 'empty_click', 'equip',
  'nade_throw', 'nade_bounce', 'boom_a', 'boom_b', 'impact_concrete', 'impact_metal', 'impact_dirt', 'impact_flesh', 'whiz',
  'step_concrete_a', 'step_concrete_b', 'step_sand_a', 'step_sand_b', 'step_metal_a', 'step_metal_b', 'hurt_a', 'hurt_b', 'death',
  'amb_cargo', 'amb_dust', 'amb_refinery', 'amb_testsite',
  'revolver_a', 'revolver_b', 'lmg_a', 'lmg_b', 'dmr_a', 'dmr_b', 'reload_revolver', 'reload_lmg', 'knife_swing', 'knife_hit', 'uav_ping', 'streak', 'jump_land', 'pickup_ammo', 'pickup_med', 'pickup_gun', 'crate_fall', 'crate_land',
];
// how loud each file plays (they are all normalised to the same peak, so the quiet ones are turned down by hand)
const GAIN: Record<string, number> = { pistol_a: 0.7, pistol_b: 0.7, smg_a: 0.6, smg_b: 0.6, rifle_a: 0.8, rifle_b: 0.8, shotgun_a: 1, shotgun_b: 1, sniper_a: 1, sniper_b: 1,
  reload_pistol: 0.5, reload_smg: 0.5, reload_rifle: 0.55, reload_sniper: 0.5, shotgun_pump: 0.6, shotgun_shell: 0.4, empty_click: 0.5, equip: 0.25, nade_throw: 0.5, nade_bounce: 0.45,
  boom_a: 1, boom_b: 1, impact_concrete: 0.5, impact_metal: 0.5, impact_dirt: 0.4, impact_flesh: 0.5, whiz: 0.6,
  step_concrete_a: 0.12, step_concrete_b: 0.3, step_sand_a: 0.3, step_sand_b: 0.15, step_metal_a: 0.15, step_metal_b: 0.2, hurt_a: 0.6, hurt_b: 0.6, death: 0.7,
  revolver_a: 0.9, revolver_b: 0.9, lmg_a: 0.8, lmg_b: 0.8, dmr_a: 0.9, dmr_b: 0.9, reload_revolver: 0.5, reload_lmg: 0.55, knife_swing: 0.5, knife_hit: 0.6, uav_ping: 0.5, streak: 0.5, crate_fall: 0.8, crate_land: 0.9, pickup_ammo: 0.7, pickup_med: 0.7, pickup_gun: 0.7, jump_land: 0.35 };
// which recorded set each weapon uses (the new ones share with the nearest kind where there is no file of their own)
const SHOT: Record<string, string> = { burst: 'smg', autosg: 'shotgun', mp: 'smg', pdw: 'smg', br: 'dmr', amr: 'sniper', thumper: 'shotgun', rocket: 'sniper', minigun: 'lmg', flame: 'smg', raygun: 'dmr', crossbow: 'revolver' };
const RELOAD: Record<string, string> = { burst: 'smg', dmr: 'rifle', autosg: 'shotgun', mp: 'pistol', pdw: 'smg', br: 'rifle', amr: 'sniper', thumper: 'shotgun', rocket: 'sniper', minigun: 'lmg', flame: 'smg', raygun: 'rifle', crossbow: 'pistol' };

export function unlock(): void {
  try {
    if (!ac) {
      ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ac.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') void ac.resume();
    if (!loading) loading = loadAll();
  } catch { ac = null; }
}

async function loadAll(): Promise<void> {
  if (!ac) return;
  const ctx = ac;
  await Promise.all(NAMES.map(async (n) => {
    try {
      const r = await fetch(`${BASE}${n}.mp3`); if (!r.ok) return;
      bufs.set(n, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch { /* a missing file only means that sound stays quiet */ }
  }));
}

// ---- the listener: where the player is and which way they face (the rules engine's yaw: forward is (cos, sin) over x and z) ----
const L = { x: 0, z: 0, fx: 1, fz: 0 };
export function setListener(x: number, z: number, yaw: number): void { L.x = x; L.z = z; L.fx = Math.cos(yaw); L.fz = Math.sin(yaw); }

let voices = 0;
interface Opt { vol?: number; rate?: number; x?: number; z?: number; own?: boolean; maxDur?: number; delayCap?: number }
/** plays a named sound; with x and z it is placed in the world, else it is heard in the head */
export function play(name: string, o: Opt = {}): void {
  // the sound's loudness, pan, delay and muffling from where it happened relative to the listener
  let vol = (GAIN[name] ?? 0.5) * (o.vol ?? 1), pan = 0, delay = 0, cut = 20000;
  if (o.x !== undefined && o.z !== undefined && !o.own) {
    const dx = o.x - L.x, dz = o.z - L.z, d = Math.hypot(dx, dz);
    vol *= 1 / (1 + Math.max(0, d - 3) / 14) ** 1.3;
    pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * -L.fz + dz * L.fx) / d)) * Math.min(1, d / 6) * 0.9 : 0;
    delay = Math.min(o.delayCap ?? 0.5, d / 340);
    cut = Math.max(1400, 20000 / (1 + d / 18));
    if (vol < 0.01) return;
  }
  // the film tools collect every sound with its frame, so the sound track of a recorded clip can be mixed from the same files
  const rec = (globalThis as { __sfxlog?: unknown[][] }).__sfxlog;
  if (rec) rec.push([(globalThis as { __frame?: number }).__frame ?? 0, name, +vol.toFixed(3), +pan.toFixed(2), +delay.toFixed(3), o.rate ?? 1, o.maxDur ?? 0, cut]);
  if (!ac || !master) return;
  const buf = bufs.get(name); if (!buf || voices > 28) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = (o.rate ?? 1) * (0.96 + Math.random() * 0.08);
  const g = ac.createGain(); g.gain.value = vol;
  let node: AudioNode = src;
  if (cut < 19000) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; node.connect(f); node = f; }
  node.connect(g); node = g;
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; node.connect(p); node = p; }
  node.connect(master);
  voices++; src.onended = () => { voices--; };
  if (o.maxDur) src.start(t, 0, o.maxDur); else src.start(t);
}
const pick = (a: string, b: string) => (Math.random() < 0.5 ? a : b);

export function shot(weapon: string, x: number, z: number, own: boolean, quiet = false): void { const k = SHOT[weapon] ?? weapon; play(pick(`${k}_a`, `${k}_b`), { x, z, own, vol: (own ? 0.9 : 1) * (quiet ? 0.3 : 1) }); }
export function reload(weapon: string, x: number, z: number, own: boolean): void {
  const k = RELOAD[weapon] ?? weapon;
  if (k === 'shotgun') { play('shotgun_shell', { x, z, own }); setTimeout(() => play('shotgun_pump', { x, z, own }), 1100); } else play(`reload_${k}`, { x, z, own });
}
export function dry(x: number, z: number, own: boolean): void { play('empty_click', { x, z, own }); }
/** something taken from the floor: ammunition, a med kit or a gun (heard where it was taken, loudest for your own) */
export function pickup(kind: string, x: number, z: number, own: boolean): void { play(`pickup_${kind === 'med' ? 'med' : kind === 'gun' ? 'gun' : 'ammo'}`, { x, z, own }); }
export function equip(): void { play('equip', { own: true }); }
export function throwNade(x: number, z: number, own: boolean): void { play('nade_throw', { x, z, own }); }
export function boom(x: number, z: number): void { play(pick('boom_a', 'boom_b'), { x, z, vol: 1.2, delayCap: 1.2 }); }
export function impact(kind: 'concrete' | 'metal' | 'dirt' | 'flesh', x: number, z: number): void { play(`impact_${kind}`, { x, z, maxDur: 0.9 }); }
export function whiz(): void { play('whiz', { own: true }); }
export function step(surface: 'concrete' | 'sand' | 'metal', x: number, z: number, own: boolean): void { play(pick(`step_${surface}_a`, `step_${surface}_b`), { x, z, own, vol: own ? 0.7 : 1, maxDur: 0.45 }); }
export function hurtMe(): void { play(pick('hurt_a', 'hurt_b'), { own: true }); }
export function dieAt(x: number, z: number, own: boolean): void { play('death', { x, z, own }); }

// ---- the ambience of the map you are on, looped and quiet ----
let amb: { src: AudioBufferSourceNode; g: GainNode } | null = null;
export function ambience(map: string): void {
  if (!ac || !master) return;
  const go = () => {
    if (amb) { try { amb.src.stop(); } catch { /* already stopped */ } amb = null; }
    const buf = bufs.get(`amb_${map}`); if (!buf || !ac || !master) return;
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ac.createGain(); g.gain.value = 0.0; g.gain.linearRampToValueAtTime(0.22, ac.currentTime + 2);
    src.connect(g); g.connect(master); src.start(); amb = { src, g };
  };
  if (bufs.has(`amb_${map}`)) go(); else void (loading ?? Promise.resolve()).then(go);
}

// ---- short synthetic tones for the interface ----
function tone(freq: number, len: number, vol: number, slide = 0): void {
  if (!ac || !master || vol <= 0.001) return;
  const t = ac.currentTime, g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); g.connect(master);
  const o = ac.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + len);
  o.connect(g); o.start(t); o.stop(t + len);
}
/** one heartbeat, played while health is low */
export function heartbeat(): void { tone(70, 0.12, 0.35, -25); setTimeout(() => tone(60, 0.14, 0.25, -20), 170); }
export function medal(): void { tone(700, 0.1, 0.12, 500); setTimeout(() => tone(1000, 0.16, 0.12, 400), 90); }
export function hitMarker(): void { tone(1500, 0.05, 0.12, -500); }
export function kill(): void { tone(900, 0.14, 0.14, 600); }
export function chime(): void { tone(520, 0.25, 0.12, 260); }

/** how many sound files are decoded and ready (a check for the page's own tests) */
export function loadedCount(): number { return bufs.size; }
