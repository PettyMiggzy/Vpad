// Shared constants & tuning. Imports only the engine TYPES (erased at runtime), so this leaf module pulls in no engine code.
import type { GameOptions } from '../engine/webgpu.js';

export const BACKGROUND = '#050805';
export const PIXEL_ART = false;
export const CONTAINER = '#game';

export const GAME_OPTIONS: GameOptions = {
  container: CONTAINER,
  background: BACKGROUND,
  pixelArt: PIXEL_ART,
};

// ── THE ARENA ────────────────────────────────────────────────────────────────
// The rules engine works in pixels (the same file the match server runs); the 3D world is in metres.
export const PX_PER_M = 50;
export const WALL_H = 3.2;          // wall height, metres
export const EYE_H = 1.65;          // standing eye height
export const FOV = 78;
export const SIM_STEP = 1 / 60;     // fixed rules step
export const FPS_LOOK_TOUCH = 1.7;  // touch drag turns this many times faster than a mouse

// ── TEAMS (a launchpad token each; read from the page address: ?a=NAME&b=NAME) ──
export const TEAM_COLORS = ['#b6ff00', '#ff3ca8'] as const;
export const DEFAULT_TEAM_NAMES = ['LIME', 'PINK'] as const;
export const SEATS = [4, 8, 12, 16, 20, 32] as const;
export const DEFAULT_SEATS = 8;

export const STORE_KEY = 'vyre.arena.fps.v1';
