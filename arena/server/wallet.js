// Linking a wallet to a player profile, for the website's war hub. A player asks for a short code from the game page (the server ties it
// to that profile for ten minutes), then signs a message that names the wallet and the code on the website. The server checks the
// signature itself: no money moves and nothing is sent to a chain, a signature only proves who holds the wallet. One wallet per profile
// and one profile per wallet, for good (an unlink goes through support). The page can only ask for a code; the website can only link.
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { recoverMessageAddress, isAddress, getAddress } from 'viem';
import { getProfile, validPid } from './profiles.js';

const FILE = path.join(process.env.ARENA_DATA || path.join(import.meta.dirname, 'data'), 'links.json');
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODES = 5000;       // codes waiting at once: the oldest go first, so a flood of requests cannot fill the memory
const MAX_TRIES = 5;          // wrong signatures against one code before it is void
const ASKS_PER_HOUR = 6;      // codes one profile may ask for in an hour
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

const byPid = new Map();      // pid -> wallet (lowercase)
const byWallet = new Map();   // wallet (lowercase) -> pid
try { for (const [pid, w] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) { byPid.set(pid, w); byWallet.set(w, pid); } } catch (_) { /* no file yet */ }
const saveNow = () => {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(byPid))); fs.renameSync(tmp, FILE); } catch (e) { console.warn('could not save wallet links', e.message); }
};

const codes = new Map();      // code -> { pid, exp, tries }
const asked = new Map();      // pid -> [times]

export const linkMessage = (address, code) => `Vyre Bad Lands: link this wallet to my player\nWallet: ${String(address).toLowerCase()}\nCode: ${code}`;
export const walletOf = (pid) => byPid.get(pid) ?? null;
export const pidOf = (address) => (isAddress(String(address), { strict: false }) ? byWallet.get(String(address).toLowerCase()) ?? null : null);

/** a code for this profile to link a wallet with; a profile that is already linked gets none */
export function askCode(pid, now = Date.now()) {
  if (!validPid(pid) || !getProfile(pid)) return { error: 'bad id' };
  if (byPid.has(pid)) return { error: 'this player already has a wallet linked' };
  const times = (asked.get(pid) ?? []).filter((t) => now - t < 3600_000);
  if (times.length >= ASKS_PER_HOUR) return { error: 'too many codes asked for, try again later' };
  times.push(now); asked.set(pid, times);
  for (const [c, v] of codes) if (v.pid === pid || v.exp <= now) codes.delete(c); // one code at a time per profile
  while (codes.size >= MAX_CODES) codes.delete(codes.keys().next().value);
  let code;
  do { code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); } while (codes.has(code));
  codes.set(code, { pid, exp: now + CODE_TTL_MS, tries: 0 });
  return { code, expiresInSeconds: CODE_TTL_MS / 1000 };
}

/** checks the signature and links; every refusal is the same plain answer, so a wrong guess learns nothing */
export async function link(code, address, signature, now = Date.now()) {
  const fail = { error: 'that code or signature did not work' };
  if (typeof code !== 'string' || !CODE_RE.test(code) || typeof address !== 'string' || !isAddress(address, { strict: false })) return fail;
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return fail;
  const c = codes.get(code);
  if (!c || c.exp <= now) { codes.delete(code); return fail; }
  let who;
  try { who = await recoverMessageAddress({ message: linkMessage(address, code), signature }); } catch { who = null; }
  if (!who || who.toLowerCase() !== address.toLowerCase()) {
    if (++c.tries >= MAX_TRIES) codes.delete(code);
    return fail;
  }
  codes.delete(code); // once only, whatever happens next
  const w = address.toLowerCase();
  if (byPid.has(c.pid)) return { error: 'this player already has a wallet linked' };
  if (byWallet.has(w)) return { error: 'that wallet is linked to another player' };
  byPid.set(c.pid, w); byWallet.set(w, c.pid); saveNow();
  return { ok: true, address: getAddress(address) };
}
