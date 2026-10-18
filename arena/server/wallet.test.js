import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.ARENA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-wallet-'));
const { askCode, link, linkMessage, walletOf, pidOf } = await import('./wallet.js');
const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');
const pid = (n) => `abcdef0123456789abcdef01234567${String(n).padStart(2, '0')}`;
const acct = () => privateKeyToAccount(generatePrivateKey());
const sign = (a, code, addr = a.address) => a.signMessage({ message: linkMessage(addr, code) });

test('a signed message with the right code links the wallet to the profile, once', async () => {
  const a = acct(), { code } = askCode(pid(1));
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  const r = await link(code, a.address, await sign(a, code));
  assert.equal(r.ok, true);
  assert.equal(walletOf(pid(1)), a.address.toLowerCase());
  assert.equal(pidOf(a.address), pid(1)); assert.equal(pidOf(a.address.toLowerCase()), pid(1));
  assert.ok((await link(code, a.address, await sign(a, code))).error, 'the code works once');
});
test('somebody else signing for the address, or for another code, links nothing', async () => {
  const a = acct(), thief = acct(), { code } = askCode(pid(2));
  assert.ok((await link(code, a.address, await thief.signMessage({ message: linkMessage(a.address, code) }))).error, 'signed by another key');
  assert.ok((await link(code, thief.address, await sign(thief, 'AAAAAAAA', thief.address))).error, 'signed for a different code');
  assert.equal(walletOf(pid(2)), null);
});
test('a signature for the code but another wallet address is refused', async () => {
  const a = acct(), b = acct(), { code } = askCode(pid(3));
  assert.ok((await link(code, b.address, await sign(a, code, a.address))).error);
});
test('a code is void after five wrong tries, after ten minutes, and when it does not look like a code', async () => {
  const a = acct(), t0 = Date.now(), { code } = askCode(pid(4), t0);
  const bad = '0x' + '11'.repeat(65);
  for (let i = 0; i < 5; i++) assert.ok((await link(code, a.address, bad, t0)).error);
  assert.ok((await link(code, a.address, await sign(a, code), t0)).error, 'void after five wrong tries');
  const { code: c2 } = askCode(pid(5), t0);
  assert.ok((await link(c2, a.address, await sign(a, c2), t0 + 10 * 60 * 1000 + 1)).error, 'expired');
  for (const junk of ['', 'short', 'abcdefgh', 'AAAAAAA0', null, 5, {}]) assert.ok((await link(junk, a.address, bad)).error);
  assert.ok((await link(c2, 'nope', bad)).error);
  assert.ok((await link(c2, a.address, 'nope')).error);
});
test('one wallet per profile and one profile per wallet', async () => {
  const a = acct(), b = acct();
  const c6 = askCode(pid(6)).code; assert.equal((await link(c6, a.address, await sign(a, c6))).ok, true);
  assert.ok(askCode(pid(6)).error, 'a linked profile gets no new code');
  const c7 = askCode(pid(7)).code;
  assert.ok((await link(c7, a.address, await sign(a, c7))).error, 'the wallet is taken');
  assert.equal(pidOf(a.address), pid(6));
  assert.ok((await link(c7, b.address, await sign(b, c7))).error, 'a code that met a refusal is used up');
  const c7b = askCode(pid(7)).code; // (the first code was used up by the refusal)
  assert.equal((await link(c7b, b.address, await sign(b, c7b))).ok, true, 'a different wallet still works for the other profile');
});
test('a profile can ask for six codes an hour, the newest replaces the one before, and bad ids get none', async () => {
  const t = Date.now();
  const first = askCode(pid(8), t).code;
  for (let i = 0; i < 5; i++) askCode(pid(8), t + i + 1);
  assert.ok(askCode(pid(8), t + 100).error, 'the seventh is refused');
  const a = acct(); assert.ok((await link(first, a.address, await sign(a, first), t + 100)).error, 'an older code was replaced');
  assert.ok(askCode('../etc/passwd').error); assert.ok(askCode('abcdef0123456789abcdef0123456799x').error);
});
test('the links survive a restart', async () => {
  const a = acct(), c = askCode(pid(9)).code; await link(c, a.address, await sign(a, c));
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.ARENA_DATA, 'links.json'), 'utf8'));
  assert.equal(saved[pid(9)], a.address.toLowerCase());
});
