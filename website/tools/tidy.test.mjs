import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { handle, _reset } = req('../api/_welcome.js');

const ENV = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_WEBHOOK_SECRET: 's3cret', WELCOME_CHAT_ID: '-100123', WELCOME_OWNER_IDS: '42', HYPE: 'on' };
const H = { 'x-telegram-bot-api-secret-token': 's3cret' };
const MIN = 60_000;
const join = (id, date, name = 'Ana') => ({ chat_member: { chat: { id: -100123 }, date, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member', user: { id, first_name: name } } } });
const say = (text, id = 900) => ({ message: { message_id: id, chat: { id: -100123, type: 'supergroup' }, from: { id: 5, first_name: 'Bo' }, text } });

/** a stand-in store with the same rule as the real one: a save is refused when the list changed since it was read */
const memStore = () => { let items = [], v = 0; return { get items() { return items; }, async read() { return { items: JSON.parse(JSON.stringify(items)), tag: v ? String(v) : null }; }, async write(next, tag) { if ((tag ?? null) !== (v ? String(v) : null)) return false; items = JSON.parse(JSON.stringify(next)); v++; return true; } }; };
/** a stand-in Telegram that numbers every message it sends and remembers which are still up */
const tg = () => { let n = 1000; const up = new Set(), deleted = [], calls = []; return { up, deleted, calls, fetch: async (url, init) => { const method = url.split('/').pop(), b = JSON.parse(init.body); calls.push({ method, b });
  if (method === 'getChatMemberCount') return { json: async () => ({ ok: true, result: 16 }) };
  if (method === 'deleteMessage') { const ok = up.delete(b.message_id); deleted.push(b.message_id); return { json: async () => (ok ? { ok: true, result: true } : { ok: false, description: 'Bad Request: message to delete not found' }) }; }
  if (method === 'sendMessage' || method === 'sendVideo') { const id = ++n; up.add(id); return { json: async () => ({ ok: true, result: { message_id: id } }) }; }
  return { json: async () => ({ ok: true }) }; } }; };
const run = (env, t, update, now) => handle(H, update, env, t.fetch, now, () => 0.99);

test.beforeEach(() => _reset());

test('a welcome stays up for ten minutes and is gone on the next update after that', async () => {
  const store = memStore(), t = tg(), env = { ...ENV, __tidyStore: store };
  await run(env, t, join(7, 1000), 0);
  assert.equal(t.up.size, 1, 'the welcome is up');
  await run(env, t, say('hello'), 9 * MIN);
  assert.equal(t.up.size, 1, 'still up at nine minutes');
  await run(env, t, say('hello again'), 10 * MIN + 1);
  assert.equal(t.up.size, 0, 'gone after ten minutes');
  assert.deepEqual(store.items, [], 'and forgotten');
});

test('a new person joining takes down the last welcome at once and posts their own', async () => {
  const store = memStore(), t = tg(), env = { ...ENV, __tidyStore: store };
  await run(env, t, join(7, 1000, 'Ana'), 0);
  const first = [...t.up][0];
  await run(env, t, join(8, 1001, 'Cy'), 2 * MIN);
  assert.equal(t.up.has(first), false, 'the first welcome is gone');
  assert.equal(t.up.size, 1, 'only the new one is up');
  assert.equal(store.items.length, 1);
});

test('the bot\'s other posts (commands, milestones) also go after ten minutes, but a join does not take them down', async () => {
  const store = memStore(), t = tg(), env = { ...ENV, __tidyStore: store };
  await run(env, t, say('/play'), 0);
  assert.equal(t.up.size, 1);
  await run(env, t, join(9, 1002), 3 * MIN);
  assert.equal(t.up.size, 2, 'the /play post stays through a join');
  await run(env, t, say('hi'), 10 * MIN + 5);
  assert.equal(t.up.size, 1, 'the /play post is gone, the welcome (3 minutes old) is not');
  await run(env, t, say('hi'), 13 * MIN + 10);
  assert.equal(t.up.size, 0);
});

test('a post that is already gone is forgotten and not tried again', async () => {
  const store = memStore(), t = tg(), env = { ...ENV, __tidyStore: store };
  await run(env, t, join(7, 1000), 0);
  t.up.clear();                                                // someone deleted it by hand
  await run(env, t, say('x'), 11 * MIN);
  assert.deepEqual(store.items, []);
  const before = t.deleted.length; await run(env, t, say('y'), 12 * MIN);
  assert.equal(t.deleted.length, before, 'no second attempt');
});

test('Telegram not answering keeps the record for the next sweep', async () => {
  const store = memStore(), t = tg(), env = { ...ENV, __tidyStore: store };
  await run(env, t, join(7, 1000), 0);
  const flaky = { ...t, fetch: async (url, init) => { if (url.endsWith('/deleteMessage')) throw new Error('network'); return t.fetch(url, init); } };
  await run(env, flaky, say('x'), 11 * MIN);
  assert.equal(store.items.length, 1, 'still listed');
  await run(env, t, say('y'), 12 * MIN);
  assert.equal(store.items.length, 0, 'taken down on the next sweep');
});

test('a save that loses a race is tried again, so no post is forgotten', async () => {
  const inner = memStore(); let hit = false;
  const store = { read: () => inner.read(), async write(next, tag) { if (!hit) { hit = true; await inner.write([{ c: 1, m: 1, k: 'post', t: 0 }], tag); } return inner.write(next, tag); } };
  const t = tg(), env = { ...ENV, __tidyStore: store };
  await run(env, t, join(7, 1000), 0);
  assert.equal(inner.items.length, 2, 'the other call\'s record and ours both kept');
});

test('TIDY_MINUTES sets the time, and 0 keeps everything', async () => {
  const s1 = memStore(), t1 = tg(), e1 = { ...ENV, TIDY_MINUTES: '2', __tidyStore: s1 };
  await run(e1, t1, join(7, 1000), 0); await run(e1, t1, say('x'), 2 * MIN + 1);
  assert.equal(t1.up.size, 0);
  _reset();
  const s2 = memStore(), t2 = tg(), e2 = { ...ENV, TIDY_MINUTES: '0', __tidyStore: s2 };
  await run(e2, t2, join(7, 1000), 0); await run(e2, t2, say('x'), 60 * MIN);
  assert.equal(t2.up.size, 1); assert.equal(s2.items.length, 0, 'nothing was kept');
});

test('with no store the bot behaves as before and deletes nothing', async () => {
  const t = tg();
  await run(ENV, t, join(7, 1000), 0); await run(ENV, t, join(8, 1001), MIN); await run(ENV, t, say('x'), 60 * MIN);
  assert.equal(t.up.size, 2); assert.equal(t.deleted.length, 0);
});

test('an update that fails the secret check touches nothing', async () => {
  const store = memStore(), t = tg();
  const r = await handle({}, join(7, 1000), { ...ENV, __tidyStore: store }, t.fetch, 0, () => 0.99);
  assert.equal(r.status, 401); assert.equal(t.calls.length, 0); assert.deepEqual(store.items, []);
});
