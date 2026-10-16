// A typed face on the match server's own rules file (copied unchanged next to this one). The page and the server run the same code.
import * as G from './game.js';

export interface Player {
  id: string; team: number; name: string; weapon: string; armor: string; boots: string; camo: string;
  hp: number; hpMax: number; x: number; y: number; aim: number; alive: boolean; kills: number; cd: number; bot: boolean;
  input: { dx: number; dy: number; aim: number; fire: boolean };
}
export interface SimEvent { type: string; by: string; victim: string; x: number; y: number; ex: number; ey: number; hit: number; n: number; winner: number }
export interface MatchLike {
  players: Map<string, Player>; events: SimEvent[]; score: number[]; round: number; phase: string; timer: number; winner: number | null;
  addPlayer(id: string, o: { name: string; team?: number; loadout?: Record<string, string> }): Player | null;
  startRound(): void; step(dt: number): void; aliveCount(team: number): number;
}
export interface MatchOptions { teams: { name: string; color: number }[]; perSide?: number; bots?: boolean }

export const Match = G.Match as unknown as new (o: MatchOptions) => MatchLike;
export const WALLS = G.WALLS as number[][];
export const MAP = G.MAP as { w: number; h: number };
export const R = G.R as { WIN_ROUNDS: number; RADIUS: number };
export const rayWall = G.rayWall as (ox: number, oy: number, a: number, max: number) => number;
export const rayCircle = G.rayCircle as (ox: number, oy: number, a: number, cx: number, cy: number, r: number) => number;
export const pushOut = G.pushOut as (x: number, y: number) => [number, number];
