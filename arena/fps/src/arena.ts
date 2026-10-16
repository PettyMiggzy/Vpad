// The 3D side: the map built from the rules engine's own wall list, soldiers made of boxes (team colours, camo, a gun per weapon),
// and the gun held in front of you. Metres in here, pixels in the rules engine: PX_PER_M converts.
import type { Game } from '../engine/webgpu.js';
import { PX_PER_M, WALL_H, TEAM_COLORS } from './config.js';
import { UNIT_SIZE } from './art.js';
import { SKYLINE_ASPECT as SKY_ASPECT } from './art2.js';
import { MAP, WALLS } from './sim/index.js';
import { CATALOG } from './sim/items.js';

export type World = Awaited<ReturnType<Game['world3d']>>;
export type GroupH = ReturnType<World['group']>;
type Box = ReturnType<World['box']>;

const m = (px: number) => px / PX_PER_M;

/** floor, walls, crates and the neon trim: lime on the middle walls, each team's colour round its own end; lamps, a lit skyline behind */
export function buildArena(world: World, colors: readonly [string, string], tex: Record<string, number>, sky: number): void {
  const W = m(MAP.w), H = m(MAP.h);
  world.box({ x: W / 2, y: -0.25, z: H / 2, w: W + 60, h: 0.5, d: H + 60, texture: tex.t_floor, tile: { x: (W + 60) / 5, y: (H + 60) / 5 }, rough: 0.9, emissive: 0.18 });
  const base = (x0: number, c: string) => {
    world.box({ x: x0, y: 0.012, z: H / 2, w: 5.4, h: 0.024, d: H - 1.6, texture: tex.t_pad, tile: { x: 2, y: 8 }, color: c, emissive: 0.5 });
    world.box({ x: x0, y: 0.04, z: 1.2, w: 5.4, h: 0.06, d: 0.12, color: c, emissive: 1.4 });
    world.box({ x: x0, y: 0.04, z: H - 1.2, w: 5.4, h: 0.06, d: 0.12, color: c, emissive: 1.4 });
    // lamps over the base
    for (const z of [3, H / 2, H - 3]) {
      world.cylinder({ x: x0 + (x0 < W / 2 ? 2.4 : -2.4), y: 2.2, z, w: 0.14, h: 4.4, d: 0.14, color: '#20262c' });
      world.sphere({ x: x0 + (x0 < W / 2 ? 2.4 : -2.4), y: 4.5, z, w: 0.4, h: 0.4, d: 0.4, color: c, emissive: 2 });
      world.light({ type: 'point', x: x0 + (x0 < W / 2 ? 2.2 : -2.2), y: 4.2, z, color: c, intensity: 12, radius: 13 } as never);
    }
  };
  base(3.4, colors[0]); base(W - 3.4, colors[1]);
  // a few white lamps over the middle so the lanes read
  for (const [lx, lz] of [[W / 2, 3], [W / 2, H - 3], [W / 2, H / 2], [W * 0.3, H / 2], [W * 0.7, H / 2]]) world.light({ type: 'point', x: lx, y: 5, z: lz, color: '#ffe2b0', intensity: 9, radius: 14 } as never);
  WALLS.forEach(([wx, wy, ww, wh], i) => {
    const w = m(ww), d = m(wh), cx = m(wx) + w / 2, cz = m(wy) + d / 2;
    const frame = i < 4, crate = !frame && Math.min(w, d) <= 1.3 && Math.max(w, d) <= 1.5;
    const h = frame ? WALL_H + 0.6 : crate ? 1.4 : WALL_H;
    const t = frame ? tex.t_metal : crate ? tex.t_crate : tex.t_wall;
    const rep = crate ? 1 : Math.max(1, Math.max(w, d) / (frame ? 6 : 3.2));
    world.box({ x: cx, y: h / 2, z: cz, w, h, d, texture: t, tile: rep, rough: 0.85, emissive: 0.1 });
    if (frame) return;
    const left = cx < W * 0.34, right = cx > W * 0.66;
    const trim = left ? colors[0] : right ? colors[1] : '#b6ff00';
    world.box({ x: cx, y: h + 0.04, z: cz, w: w + 0.06, h: 0.08, d: d + 0.06, color: trim, emissive: 1.4 });
  });
  world.box({ x: W / 2, y: WALL_H + 0.62, z: 0.5, w: W, h: 0.06, d: 0.1, color: '#b6ff00', emissive: 1.2 });
  world.box({ x: W / 2, y: WALL_H + 0.62, z: H - 0.5, w: W, h: 0.06, d: 0.1, color: '#b6ff00', emissive: 1.2 });
  // a lit city on the horizon: flat skyline cut-outs in a ring that always face you
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 68;
    world.billboard({ frame: sky, x: W / 2 + Math.cos(a) * r, y: -1, z: H / 2 + Math.sin(a) * r * 0.85, w: 44 * SKY_ASPECT / 1.8, h: 24 } as never);
  }
}

export interface Soldier {
  bb: Billboard; ring: Box; key: string; aspect: number;
  phase: number; deadFor: number; lx: number; lz: number;
}
type Billboard = ReturnType<World['billboard']>;
export const SOLDIER_H = 1.85;     // metres tall on screen
const TEAM_ART = ['lime', 'pink'] as const;

/** a soldier is a flat painted character that always faces you (frames come from art.ts), standing on a glowing ring in its team colour */
export function makeSoldier(world: World, frames: Record<string, number>, team: number, weapon: string): Omit<Soldier, 'key'> {
  const k = `${weapon}_${TEAM_ART[team] ?? 'lime'}`;
  const [pw, ph] = UNIT_SIZE[k] ?? [250, 320];
  const aspect = pw / ph;
  const bb = world.billboard({ frame: frames[k], x: 0, y: -100, z: 0, w: SOLDIER_H * aspect, h: SOLDIER_H } as never);
  const ring = world.disc({ x: 0, y: -100, z: 0, w: 0.95, h: 0.03, d: 0.95, color: TEAM_COLORS[team], emissive: 1 } as never);
  return { bb, ring, aspect, phase: Math.random() * 6, deadFor: -1, lx: 0, lz: 0 };
}

export function destroySoldier(s: Soldier): void { s.bb.kill(); s.ring.kill(); }

export const weaponName = (id: string): string => (CATALOG as Record<string, { name: string }>)[id]?.name ?? id;
