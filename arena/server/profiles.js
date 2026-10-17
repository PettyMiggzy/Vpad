// Player profiles: the coins a player has earned, what they own and what they carry. Kept by the server (a client cannot grant itself
// anything) in a JSON file, keyed by a random id the page makes once and keeps. A real version would key these to a wallet or an account.
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG, FREE, START_COINS } from './items.js';
import { levelOf, levelFrac, lockedReason, usable, freshClasses, sanitizeClasses, saveClass, selectClass, renameClass, addXp, addWeaponKill } from './progress.js';

const FILE = path.join(process.env.ARENA_DATA || path.join(import.meta.dirname, 'data'), 'profiles.json');
const PID = /^[a-f0-9-]{16,64}$/;
export const validPid = (v) => typeof v === 'string' && PID.test(v);

const profiles = new Map();
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) profiles.set(k, v); } catch (_) { /* no file yet */ }
let timer = null;
const save = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(profiles))); } catch (e) { console.warn('could not save profiles', e.message); }
  }, 2000);
};

export function getProfile(pid) {
  if (!validPid(pid)) return null;
  let p = profiles.get(pid);
  if (!p) { p = { coins: START_COINS, owned: Object.values(FREE), loadout: { ...FREE }, xp: 0, weaponKills: {}, classes: freshClasses(), activeClass: 0 }; profiles.set(pid, p); save(); }
  if (p.xp === undefined) { p.xp = 0; p.weaponKills = {}; p.classes = sanitizeClasses(p, null); p.activeClass = 0; }     // a profile saved before levels existed
  return p;
}
export const view = (p) => ({ coins: p.coins, owned: p.owned, loadout: p.loadout, xp: p.xp, level: levelOf(p.xp), levelFrac: levelFrac(p.xp), weaponKills: p.weaponKills, classes: p.classes, activeClass: p.activeClass });

export function buy(pid, item) {
  const p = getProfile(pid), it = CATALOG[item];
  if (!p || !it) return { error: 'unknown item' };
  if (p.owned.includes(item)) return { error: 'you already own it' };
  const lock = lockedReason(p, item); if (lock) return { error: lock };
  if (p.coins < it.cost) return { error: 'not enough coins' };
  p.coins -= it.cost; p.owned.push(item); p.loadout[it.slot] = item; save();
  return view(p);
}
export function equip(pid, item) {
  const p = getProfile(pid), it = CATALOG[item];
  if (!p || !it) return { error: 'unknown item' };
  if (!p.owned.includes(item)) return { error: 'you do not own it' };
  const lock = lockedReason(p, item); if (lock) return { error: lock };
  p.loadout[it.slot] = item; save();
  return view(p);
}
/** the loadout a match may use: only what the player owns and has unlocked, the free item in any slot that is not */
export function loadoutFor(pid) { const p = getProfile(pid); return p ? usable(p, p.loadout) : { ...FREE }; }
export function award(pid, coins) { const p = getProfile(pid); if (p && coins > 0) { p.coins += Math.floor(coins); save(); } }
export function grantXp(pid, n, weapon) { const p = getProfile(pid); if (!p) return; if (n > 0) addXp(p, n); if (weapon && CATALOG[weapon]?.slot === 'weapon') addWeaponKill(p, weapon); save(); }
export function classOp(pid, op, i, name) {
  const p = getProfile(pid); if (!p) return { error: 'bad id' };
  const r = op === 'save' ? saveClass(p, i) : op === 'select' ? selectClass(p, i) : op === 'rename' ? renameClass(p, i, name) : { error: 'unknown action' };
  if (!r.error) save();
  return r.error ? r : view(p);
}
