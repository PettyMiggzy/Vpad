// Levels, weapon mastery and saved classes: pure rules shared by the page (browser profile) and the server (hosted profile).
import { CATALOG, SLOTS, FREE, OLD_MOD_SLOT, STARTER_CLASS_GUNS } from './items.js';

export const MAX_LEVEL = 30;
export const XP = { kill: 50, head: 25, melee: 25, nade: 10, round: 100, match: 250, play: 50 };
/** experience needed to go from level n to n + 1 */
const need = (n) => 300 + 120 * n;
export const xpForLevel = (L) => { let t = 0; for (let n = 1; n < L; n++) t += need(n); return t; };
export function levelOf(xp) { let L = 1; while (L < MAX_LEVEL && xp >= xpForLevel(L + 1)) L++; return L; }
/** progress inside the current level, 0 to 1 */
export function levelFrac(xp) { const L = levelOf(xp); if (L >= MAX_LEVEL) return 1; const a = xpForLevel(L), b = xpForLevel(L + 1); return (xp - a) / (b - a); }

/** the level at which each thing can be bought (anything not listed is open from level 1). Guns are not listed: all of them are owned from the start */
export const UNLOCK = {
  extmag: 2, quickmag: 3, grip: 4, barrel: 5, scope: 6, steady: 7, hollow: 8, bolt: 9,
  reddot: 3, comp: 4, fore: 5, suppressor: 9, ap: 10,
  light: 2, heavy: 5, elite: 9, helmet1: 3, helmet2: 6, swift: 2, runner: 4,
  frag3: 2, frag4: 5, heavy3: 8,
};

export const MASTERY = [20, 60, 150];          // kills with one weapon for bronze, silver, gold
export const masteryOf = (kills) => MASTERY.filter((k) => kills >= k).length;

/** what stops a profile from owning or equipping an item right now: a message, or null when it is open */
export function lockedReason(p, id) {
  const it = CATALOG[id]; if (!it) return 'unknown item';
  if (id === 'gold') return Object.values(p.weaponKills ?? {}).some((k) => k >= MASTERY[2]) ? null : 'Master any weapon (150 kills) to earn it';
  if (id === 'obsidian') return levelOf(p.xp ?? 0) >= 20 ? null : 'Reach level 20 to earn it';
  const need = UNLOCK[id];
  const L = levelOf(p.xp ?? 0);
  return need && L < need ? `Reach level ${need}` : null;
}

export function addXp(p, n) { p.xp = Math.min(1e9, Math.max(0, Math.floor((p.xp ?? 0) + n))); }
export function addWeaponKill(p, weapon) { p.weaponKills ??= {}; p.weaponKills[weapon] = (p.weaponKills[weapon] ?? 0) + 1; }

// ---- classes: five saved loadouts ----
export const CLASS_COUNT = 5;
export const freshClasses = () => Array.from({ length: CLASS_COUNT }, (_, i) => ({ name: `Class ${i + 1}`, loadout: { ...FREE, weapon: STARTER_CLASS_GUNS[i % STARTER_CLASS_GUNS.length] } }));
export const cleanClassName = (v) => String(v ?? '').replace(/[^A-Za-z0-9 ]/g, '').replace(/ +/g, ' ').trim().slice(0, 14);

/** a loadout cut down to what the profile owns and may use (anything else falls back to the free item of that slot) */
export function usable(p, loadout) {
  const out = { ...FREE };
  // a loadout saved before the mod slot was split into four still names its one mod: it goes into the slot that mod belongs to now
  if (loadout && typeof loadout.mod === 'string' && OLD_MOD_SLOT[loadout.mod] && !loadout[OLD_MOD_SLOT[loadout.mod]]) loadout = { ...loadout, [OLD_MOD_SLOT[loadout.mod]]: loadout.mod };
  for (const s of SLOTS) { const id = loadout?.[s]; if (typeof id === 'string' && CATALOG[id]?.slot === s && p.owned.includes(id) && !lockedReason(p, id)) out[s] = id; }
  return out;
}
export function sanitizeClasses(p, raw) {
  const out = freshClasses();
  if (Array.isArray(raw)) raw.slice(0, CLASS_COUNT).forEach((c, i) => { if (c && typeof c === 'object') { out[i].name = cleanClassName(c.name) || out[i].name; out[i].loadout = usable(p, c.loadout); } });
  return out;
}
/** save what is equipped into class i */
export function saveClass(p, i) { if (!(i >= 0 && i < CLASS_COUNT)) return { error: 'no such class' }; p.classes[i].loadout = usable(p, p.loadout); p.activeClass = i; return {}; }
/** equip class i (only what is still owned and unlocked) */
export function selectClass(p, i) { if (!(i >= 0 && i < CLASS_COUNT)) return { error: 'no such class' }; p.loadout = usable(p, p.classes[i].loadout); p.activeClass = i; return {}; }
export function renameClass(p, i, name) { if (!(i >= 0 && i < CLASS_COUNT)) return { error: 'no such class' }; const n = cleanClassName(name); if (!n) return { error: 'give it a name' }; p.classes[i].name = n; return {}; }
