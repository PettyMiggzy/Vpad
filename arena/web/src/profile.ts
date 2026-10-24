// @ts-nocheck
// The player's coins, what they own and what they carry. In this build it lives in the browser (play money, nothing touches a wallet);
// the rules are the match server's own, so moving it to the server later changes where it is kept and nothing else.
import { CATALOG, FREE, START_COINS, STARTER_OWNED, STARTER_LOADOUT } from '../../server/items.js';
import { lockedReason, usable, freshClasses, sanitizeClasses, saveClass, selectClass, renameClass, addXp, addWeaponKill, levelOf, levelFrac } from '../../server/progress.js';

export type Loadout = Record<string, string>;
export interface ClassSlot { name: string; loadout: Loadout }
export interface Profile { coins: number; owned: string[]; loadout: Loadout; xp: number; weaponKills: Record<string, number>; classes: ClassSlot[]; activeClass: number }

export function freshProfile(): Profile {
  return { coins: START_COINS, owned: [...STARTER_OWNED] as string[], loadout: { ...STARTER_LOADOUT } as Loadout, xp: 0, weaponKills: {}, classes: freshClasses() as ClassSlot[], activeClass: 0 };
}

/** a profile read back from storage: anything unknown is dropped, the free items are always owned and always the fallback */
export function sanitize(raw: unknown): Profile {
  const p = freshProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<Profile>;
  if (Number.isFinite(r.coins) && (r.coins as number) >= 0) p.coins = Math.min(1e9, Math.floor(r.coins as number));
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && (CATALOG as Record<string, unknown>)[id] && !p.owned.includes(id)) p.owned.push(id);
  if (Number.isFinite(r.xp) && (r.xp as number) >= 0) p.xp = Math.min(1e9, Math.floor(r.xp as number));
  if (r.weaponKills && typeof r.weaponKills === 'object') for (const [k, v] of Object.entries(r.weaponKills)) if ((CATALOG as Record<string, { slot: string }>)[k]?.slot === 'weapon' && Number.isFinite(v)) p.weaponKills[k] = Math.max(0, Math.floor(v as number));
  p.loadout = usable(p, r.loadout) as Loadout;                       // only what is owned and unlocked; the free item otherwise
  p.classes = sanitizeClasses(p, r.classes) as ClassSlot[];
  if (Number.isInteger(r.activeClass) && (r.activeClass as number) >= 0 && (r.activeClass as number) < p.classes.length) p.activeClass = r.activeClass as number;
  return p;
}

export function buy(p: Profile, item: string): { error?: string } {
  const it = (CATALOG as Record<string, { slot: string; cost: number }>)[item];
  if (!it) return { error: 'unknown item' };
  if (p.owned.includes(item)) return { error: 'you already own it' };
  const lock = lockedReason(p, item); if (lock) return { error: lock };
  if (p.coins < it.cost) return { error: 'not enough coins' };
  p.coins -= it.cost; p.owned.push(item); p.loadout[it.slot] = item;
  return {};
}

export function equip(p: Profile, item: string): { error?: string } {
  const it = (CATALOG as Record<string, { slot: string }>)[item];
  if (!it) return { error: 'unknown item' };
  if (!p.owned.includes(item)) return { error: 'you do not own it' };
  const lock = lockedReason(p, item); if (lock) return { error: lock };
  p.loadout[it.slot] = item;
  return {};
}

export function award(p: Profile, coins: number): void {
  if (coins > 0) p.coins = Math.min(1e9, p.coins + Math.floor(coins));
}

/** the page address options: team names and colours are cleaned the way the server cleans them */
export function teamNames(search: string, defaults: readonly [string, string]): [string, string] {
  const q = new URLSearchParams(search);
  const clean = (v: string | null, d: string) => { const s = String(v ?? '').replace(/[^A-Za-z0-9$ ]/g, '').replace(/ +/g, ' ').trim().slice(0, 12); return s || d; };
  return [clean(q.get('a'), defaults[0]), clean(q.get('b'), defaults[1])];
}

export const level = (p: Profile) => levelOf(p.xp);
export const levelProgress = (p: Profile) => levelFrac(p.xp);
export function gainXp(p: Profile, n: number, weapon?: string | null): void { addXp(p, n); if (weapon && (CATALOG as Record<string, { slot: string }>)[weapon]?.slot === 'weapon') addWeaponKill(p, weapon); }
export const classSave = (p: Profile, i: number) => saveClass(p, i);
export const classSelect = (p: Profile, i: number) => selectClass(p, i);
export const classRename = (p: Profile, i: number, name: string) => renameClass(p, i, name);
