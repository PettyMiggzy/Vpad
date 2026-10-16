// The 3D side: the map built from the rules engine's own wall list, soldiers made of boxes (team colours, camo, a gun per weapon),
// and the gun held in front of you. Metres in here, pixels in the rules engine: PX_PER_M converts.
import type { Game } from '../engine/webgpu.js';
import { PX_PER_M, WALL_H, TEAM_COLORS } from './config.js';
import { UNIT_SIZE } from './art.js';
import { MAP, WALLS } from './sim/index.js';
import { CATALOG } from './sim/items.js';

export type World = Awaited<ReturnType<Game['world3d']>>;
export type GroupH = ReturnType<World['group']>;
type Box = ReturnType<World['box']>;

const m = (px: number) => px / PX_PER_M;

/** floor, walls and the neon trim: lime on the middle walls, each team's colour round its own end */
export function buildArena(world: World, colors: readonly [string, string]): void {
  const W = m(MAP.w), H = m(MAP.h);
  world.box({ x: W / 2, y: -0.25, z: H / 2, w: W + 40, h: 0.5, d: H + 40, color: '#4a5260', rough: 0.95 });
  // lane markings and the two bases
  for (let i = 1; i < 8; i++) world.box({ x: (W / 8) * i, y: 0.011, z: H / 2, w: 0.08, h: 0.02, d: H - 2, color: '#242b24' });
  const base = (x0: number, c: string) => {
    world.box({ x: x0, y: 0.015, z: H / 2, w: 5.4, h: 0.03, d: H - 1.6, color: c, alpha: 0.16, emissive: 0.25 });
    world.box({ x: x0, y: 0.04, z: 1.2, w: 5.4, h: 0.06, d: 0.12, color: c, emissive: 1 });
    world.box({ x: x0, y: 0.04, z: H - 1.2, w: 5.4, h: 0.06, d: 0.12, color: c, emissive: 1 });
  };
  base(3.4, colors[0]); base(W - 3.4, colors[1]);
  WALLS.forEach(([wx, wy, ww, wh], i) => {
    const w = m(ww), d = m(wh), cx = m(wx) + w / 2, cz = m(wy) + d / 2;
    const frame = i < 4, crate = !frame && Math.min(w, d) <= 1.3 && Math.max(w, d) <= 1.5;
    const h = frame ? WALL_H + 0.6 : crate ? 1.4 : WALL_H;
    world.box({ x: cx, y: h / 2, z: cz, w, h, d, color: frame ? '#4d5663' : crate ? '#8a6c3f' : '#8c98a4', rough: 0.85, emissive: frame ? 0.1 : 0.14 });
    if (frame) return;
    const left = cx < W * 0.34, right = cx > W * 0.66;
    const trim = left ? colors[0] : right ? colors[1] : '#b6ff00';
    world.box({ x: cx, y: h + 0.04, z: cz, w: w + 0.06, h: 0.08, d: d + 0.06, color: trim, emissive: 1 });
  });
  // glowing strip round the top of the frame so the edge of the world reads at once
  world.box({ x: W / 2, y: WALL_H + 0.62, z: 0.5, w: W, h: 0.06, d: 0.1, color: '#b6ff00', emissive: 0.8 });
  world.box({ x: W / 2, y: WALL_H + 0.62, z: H - 0.5, w: W, h: 0.06, d: 0.1, color: '#b6ff00', emissive: 0.8 });
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
