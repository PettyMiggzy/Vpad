import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.ARENA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-wh-'));
const { listen, close } = await import('./index.js');
const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');
const { linkMessage } = await import('./wallet.js');
const port = await listen(0, '127.0.0.1');
const base = `http://127.0.0.1:${port}`;
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const pid = 'feedface0123456789abcdef01234567';

test('the game page asks for a code, the website links the wallet, and the hub reads the profile by wallet', async () => {
  const a = privateKeyToAccount(generatePrivateKey());
  assert.equal((await fetch(`${base}/api/hub?address=${a.address}`)).status, 404, 'nobody is linked yet');
  await (await fetch(`${base}/api/profile?pid=${pid}`)).json(); // (a profile exists once it has been read)
  const c = await post('/api/link/code', { pid });
  assert.equal(c.status, 200); assert.match(c.body.code, /^[A-HJ-NP-Z2-9]{8}$/);
  const signature = await a.signMessage({ message: linkMessage(a.address, c.body.code) });
  const bad = await post('/api/link', { code: c.body.code, address: a.address, signature: '0x' + '22'.repeat(65) });
  assert.equal(bad.status, 400);
  const ok = await post('/api/link', { code: c.body.code, address: a.address, signature });
  assert.equal(ok.status, 200); assert.equal(ok.body.address, a.address);
  const hub = await (await fetch(`${base}/api/hub?address=${a.address.toLowerCase()}`)).json();
  assert.ok(hub.catalog && typeof hub.level === 'number' && Array.isArray(hub.owned));
  assert.equal(hub.pid, undefined, 'the hub never shows the player id (it is the key to the profile)');
  assert.equal((await post('/api/link/code', { pid })).status, 400, 'a linked player gets no new code');
});
test.after(() => close());
