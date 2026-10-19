import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { handle, welcomeFor, isJoin, _reset } = createRequire(import.meta.url)('../api/_welcome.js');

const ENV = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_WEBHOOK_SECRET: 's3cret', WELCOME_CHAT_ID: '-100123', WELCOME_OWNER_IDS: '42, 43', WELCOME_VIDEO_URL: 'https://example.test/w.mp4' };
const H = { 'x-telegram-bot-api-secret-token': 's3cret' };
const join = (over = {}) => ({ chat_member: { chat: { id: -100123 }, date: 1000, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member', user: { id: 7, first_name: 'Ana' } }, ...over } });
/** a stand-in Telegram: records each call, and can refuse a method */
const tg = (fail = []) => { const calls = []; return { calls, fetch: async (url, init) => { const method = url.split('/').pop(); calls.push({ method, body: JSON.parse(init.body) }); return { json: async () => ({ ok: !fail.includes(method) }) }; } }; };
test.beforeEach(() => _reset());

test('a request without the right secret is refused and sends nothing', async () => {
  const t = tg();
  assert.equal((await handle({}, join(), ENV, t.fetch)).status, 401);
  assert.equal((await handle({ 'x-telegram-bot-api-secret-token': 'nope' }, join(), ENV, t.fetch)).status, 401);
  assert.equal((await handle(H, join(), { ...ENV, TELEGRAM_WEBHOOK_SECRET: '' }, t.fetch)).status, 503, 'no secret configured: not open to anyone');
  assert.equal(t.calls.length, 0);
});

test('someone joining the group gets the welcome with the video and buttons, naming them', async () => {
  const t = tg(), r = await handle(H, join(), ENV, t.fetch);
  assert.deepEqual([r.status, r.sent], [200, true]);
  assert.equal(t.calls.length, 1); assert.equal(t.calls[0].method, 'sendVideo');
  const b = t.calls[0].body;
  assert.equal(b.chat_id, -100123); assert.equal(b.video, ENV.WELCOME_VIDEO_URL); assert.equal(b.parse_mode, 'HTML');
  assert.match(b.caption, /Ana/); assert.match(b.caption, /WARHEADZ/); assert.match(b.caption, /Vyre Bad Lands/);
  assert.ok(b.caption.length <= 1024, 'a video caption may not pass 1024 characters');
  assert.ok(b.reply_markup.inline_keyboard.flat().every((x) => x.url.startsWith('https://')));
});

test('without a video, or when Telegram will not take the video, the same welcome goes as plain text', async () => {
  const a = tg(); await handle(H, join(), { ...ENV, WELCOME_VIDEO_URL: '' }, a.fetch);
  assert.deepEqual(a.calls.map((c) => c.method), ['sendMessage']);
  _reset();
  const b = tg(['sendVideo']), r = await handle(H, join(), ENV, b.fetch);
  assert.deepEqual(b.calls.map((c) => c.method), ['sendVideo', 'sendMessage']); assert.equal(r.sent, true);
});

test('nobody is welcomed for leaving, being a bot, a different group, or already being in', async () => {
  const t = tg();
  for (const u of [
    join({ old_chat_member: { status: 'member' }, new_chat_member: { status: 'left', user: { id: 7 } } }),
    join({ new_chat_member: { status: 'member', user: { id: 8, is_bot: true, first_name: 'B' } } }),
    join({ chat: { id: -999 } }),
    join({ old_chat_member: { status: 'member' }, new_chat_member: { status: 'administrator', user: { id: 7 } } }),
    join({ old_chat_member: { status: 'member' }, new_chat_member: { status: 'restricted', is_member: true, user: { id: 7 } } }),
    { message: { text: 'hello', chat: { id: -100123 }, from: { id: 7 } } }, {}, null,
  ]) assert.equal((await handle(H, u, ENV, t.fetch)).sent, false);
  assert.equal(t.calls.length, 0);
});

test('someone muted and then released is not welcomed again, but one who came back after leaving is', () => {
  assert.equal(isJoin({ old_chat_member: { status: 'restricted', is_member: true }, new_chat_member: { status: 'member', user: { id: 1 } } }), false);
  assert.equal(isJoin({ old_chat_member: { status: 'kicked' }, new_chat_member: { status: 'member', user: { id: 1 } } }), true);
  assert.equal(isJoin({ old_chat_member: { status: 'restricted', is_member: false }, new_chat_member: { status: 'member', user: { id: 1 } } }), true);
});

test('Telegram sending the same join again is answered once; a flood of joins is capped; the off switch stops it', async () => {
  const t = tg();
  await handle(H, join(), ENV, t.fetch, 1_000); await handle(H, join(), ENV, t.fetch, 2_000);
  assert.equal(t.calls.length, 1, 'the retry is ignored');
  for (let i = 0; i < 20; i++) await handle(H, join({ date: 2000 + i, new_chat_member: { status: 'member', user: { id: 100 + i, first_name: 'X' } } }), ENV, t.fetch, 3_000 + i);
  assert.equal(t.calls.length, 6, 'six a minute at most');
  const u = tg(); _reset();
  assert.equal((await handle(H, join(), { ...ENV, WELCOME: 'off' }, u.fetch)).sent, false); assert.equal(u.calls.length, 0);
});

test('names cannot inject markup', () => {
  const { text } = welcomeFor({ id: 9, first_name: '<a href="x">hi</a> & <b>' });
  assert.ok(!text.includes('<a href="x">'));
  assert.match(text, /&lt;a href=&quot;|&lt;a href="x"&gt;/);
  assert.ok(text.includes('&amp;'));
  assert.match(welcomeFor({ id: 9, first_name: 'x'.repeat(500) }).text, /x{60}</);
});

test('the owner can preview the welcome with /testwelcome, in a private chat or the group, and nobody else can', async () => {
  const t = tg();
  const msg = (from, chat, text = '/testwelcome') => ({ message: { text, from: { id: from, first_name: 'Boss' }, chat } });
  assert.equal((await handle(H, msg(42, { id: 42, type: 'private' }), ENV, t.fetch)).sent, true);
  assert.equal(t.calls[0].body.chat_id, 42);
  assert.equal((await handle(H, msg(43, { id: -100123, type: 'supergroup' }, '/testwelcome@warheadzsbot'), ENV, t.fetch)).sent, true);
  assert.equal((await handle(H, msg(7, { id: 7, type: 'private' }), ENV, t.fetch)).sent, false, 'not the owner');
  assert.equal((await handle(H, msg(42, { id: -555, type: 'supergroup' }), ENV, t.fetch)).sent, false, 'not the welcome group');
  assert.equal((await handle(H, msg(42, { id: 42, type: 'private' }, '/testwelcomes'), ENV, t.fetch)).sent, false);
  assert.equal(t.calls.length, 2);
});

test('a Telegram failure never turns into a retry storm', async () => {
  const boom = async () => { throw new Error('network'); };
  const r = await handle(H, join(), ENV, boom);
  assert.equal(r.status, 200); assert.equal(r.sent, false);
});
