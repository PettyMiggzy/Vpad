// The player's coins, what they own and what they carry. In this build it lives in the browser (play money, nothing touches a wallet);
// the rules are the match server's own, so moving it to the server later changes where it is kept and nothing else.
import { CATALOG, FREE, SLOTS, START_COINS } from './sim/items.js';

export type Loadout = Record<string, string>;
export interface Profile { coins: number; owned: string[]; loadout: Loadout }

export function freshProfile(): Profile {
  return { coins: START_COINS, owned: Object.values(FREE) as string[], loadout: { ...FREE } as Loadout };
}

/** a profile read back from storage: anything unknown is dropped, the free items are always owned and always the fallback */
export function sanitize(raw: unknown): Profile {
  const p = freshProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<Profile>;
  if (Number.isFinite(r.coins) && (r.coins as number) >= 0) p.coins = Math.min(1e9, Math.floor(r.coins as number));
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && (CATALOG as Record<string, unknown>)[id] && !p.owned.includes(id)) p.owned.push(id);
  for (const slot of SLOTS as string[]) {
    const id = r.loadout?.[slot];
    if (typeof id === 'string' && p.owned.includes(id) && (CATALOG as Record<string, { slot: string }>)[id].slot === slot) p.loadout[slot] = id;
  }
  return p;
}

export function buy(p: Profile, item: string): { error?: string } {
  const it = (CATALOG as Record<string, { slot: string; cost: number }>)[item];
  if (!it) return { error: 'unknown item' };
  if (p.owned.includes(item)) return { error: 'you already own it' };
  if (p.coins < it.cost) return { error: 'not enough coins' };
  p.coins -= it.cost; p.owned.push(item); p.loadout[it.slot] = item;
  return {};
}

export function equip(p: Profile, item: string): { error?: string } {
  const it = (CATALOG as Record<string, { slot: string }>)[item];
  if (!it) return { error: 'unknown item' };
  if (!p.owned.includes(item)) return { error: 'you do not own it' };
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
