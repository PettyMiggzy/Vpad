// Player profiles: the coins a player has earned, what they own and what they carry. Kept by the server (a client cannot grant itself
// anything) in a JSON file, keyed by a random id the page makes once and keeps. A real version would key these to a wallet or an account.
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG, FREE, SLOTS, START_COINS } from './items.js';

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
  if (!p) { p = { coins: START_COINS, owned: Object.values(FREE), loadout: { ...FREE } }; profiles.set(pid, p); save(); }
  return p;
}
export const view = (p) => ({ coins: p.coins, owned: p.owned, loadout: p.loadout });

export function buy(pid, item) {
  const p = getProfile(pid), it = CATALOG[item];
  if (!p || !it) return { error: 'unknown item' };
  if (p.owned.includes(item)) return { error: 'you already own it' };
  if (p.coins < it.cost) return { error: 'not enough coins' };
  p.coins -= it.cost; p.owned.push(item); p.loadout[it.slot] = item; save();
  return view(p);
}
export function equip(pid, item) {
  const p = getProfile(pid), it = CATALOG[item];
  if (!p || !it) return { error: 'unknown item' };
  if (!p.owned.includes(item)) return { error: 'you do not own it' };
  p.loadout[it.slot] = item; save();
  return view(p);
}
/** the loadout a match may use: only what the player owns, the free item in any slot that is not */
export function loadoutFor(pid) {
  const p = getProfile(pid), out = { ...FREE };
  if (p) for (const s of SLOTS) if (p.owned.includes(p.loadout[s]) && CATALOG[p.loadout[s]]?.slot === s) out[s] = p.loadout[s];
  return out;
}
export function award(pid, coins) { const p = getProfile(pid); if (p && coins > 0) { p.coins += Math.floor(coins); save(); } }
