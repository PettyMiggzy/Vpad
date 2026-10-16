// The 3D side: the map built from the rules engine's own wall list, soldiers made of boxes (team colours, camo, a gun per weapon),
// and the gun held in front of you. Metres in here, pixels in the rules engine: PX_PER_M converts.
import type { Game } from '../engine/webgpu.js';
import { PX_PER_M, WALL_H } from './config.js';
import { MAP, WALLS } from './sim/index.js';
import { CATALOG } from './sim/items.js';

export type World = Awaited<ReturnType<Game['world3d']>>;
export type GroupH = ReturnType<World['group']>;
type Box = ReturnType<World['box']>;

const m = (px: number) => px / PX_PER_M;
export const CAMO_COLORS: Record<string, string> = { woodland: '#4d6b3a', desert: '#b9955a', arctic: '#c9d6e4', night: '#2b3556', toxic: '#7fd12a' };
const GUN_LEN: Record<string, number> = { pistol: 0.28, smg: 0.42, rifle: 0.7, shotgun: 0.64, sniper: 0.95 };

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
  group: GroupH; legL: GroupH; legR: GroupH; parts: Box[];
  phase: number; deadFor: number; lx: number; lz: number; bodyY: number;
}

/** one soldier: boots, legs, vest in the team colour, head, helmet in the camo colour, a gun sized to the weapon */
export function makeSoldier(world: World, team: string, camo: string, weapon: string): Soldier {
  const group = world.group({ x: 0, y: -100, z: 0 });
  const parts: Box[] = [];
  const add = (cfg: Record<string, unknown>): Box => { const b = world.box({ parent: group, ...cfg } as never); parts.push(b); return b; };
  const cam = CAMO_COLORS[camo] || CAMO_COLORS.woodland;
  const legL = world.group({ parent: group, x: -0.13, y: 0.82, z: 0 }), legR = world.group({ parent: group, x: 0.13, y: 0.82, z: 0 });
  for (const leg of [legL, legR]) {
    parts.push(world.box({ parent: leg, y: -0.4, w: 0.2, h: 0.8, d: 0.24, color: '#2c3328' } as never));
    parts.push(world.box({ parent: leg, y: -0.77, z: 0.03, w: 0.22, h: 0.12, d: 0.32, color: '#111611' } as never));
  }
  add({ y: 1.13, w: 0.5, h: 0.62, d: 0.3, color: cam });                                   // torso
  add({ y: 1.16, z: 0.01, w: 0.54, h: 0.5, d: 0.34, color: team, emissive: 0.16 });        // vest in the team colour
  add({ y: 1.2, z: -0.2, w: 0.34, h: 0.4, d: 0.12, color: team, emissive: 0.9 });          // glowing pack on the back
  add({ y: 1.6, w: 0.26, h: 0.28, d: 0.26, color: '#d2a17a' });                             // head
  add({ y: 1.74, w: 0.31, h: 0.13, d: 0.31, color: cam });                                  // helmet
  add({ x: -0.34, y: 1.2, z: 0.2, w: 0.14, h: 0.14, d: 0.5, color: cam });                  // arms held forward on the gun
  add({ x: 0.3, y: 1.2, z: 0.24, w: 0.14, h: 0.14, d: 0.46, color: cam });
  const len = GUN_LEN[weapon] ?? 0.5;
  add({ x: 0.08, y: 1.2, z: 0.3 + len / 2, w: 0.08, h: 0.12, d: len, color: '#15191a' });
  return { group, legL, legR, parts, phase: Math.random() * 6, deadFor: -1, lx: 0, lz: 0, bodyY: 0 };
}

export function destroySoldier(s: Soldier): void { for (const b of s.parts) b.kill(); }

/** the gun in your hands: a group the main loop points where the camera looks */
export function makeViewmodel(world: World, weapon: string, camo: string) {
  const root = world.group({ x: 0, y: -100, z: 0 });
  const kick = world.group({ parent: root });
  const cam = CAMO_COLORS[camo] || CAMO_COLORS.woodland;
  const len = (GUN_LEN[weapon] ?? 0.5) * 0.9;
  const dark = '#14181a';
  const parts: unknown[] = [];  // every mesh of the gun, so it can be removed
  const box = (cfg: Record<string, unknown>) => { const b = world.box({ parent: kick, ...cfg } as never); parts.push(b); return b; };
  const bx = -0.17, by = -0.2;
  box({ x: bx, y: by, z: 0.5 + len / 2 - 0.12, w: 0.045, h: 0.065, d: len, color: dark });                // barrel and body
  box({ x: bx, y: by - 0.07, z: 0.5, w: 0.045, h: 0.09, d: 0.1, color: '#2d3236' });                      // grip
  box({ x: bx - 0.07, y: by - 0.04, z: 0.55, w: 0.07, h: 0.07, d: 0.3, color: cam });                      // left forearm
  box({ x: bx + 0.01, y: by - 0.07, z: 0.5, w: 0.07, h: 0.07, d: 0.16, color: cam });                      // right hand
  const flash = world.sphere({ parent: kick, x: bx, y: by, z: 0.5 + len - 0.1, w: 0, h: 0, d: 0, color: '#ffe27a', emissive: 1 } as never);
  parts.push(flash);
  return { root, kick, flash, tip: 0.5 + len, parts, dispose: () => { for (const b of parts as { kill(): void }[]) b.kill(); } };
}

export const weaponName = (id: string): string => (CATALOG as Record<string, { name: string }>)[id]?.name ?? id;
