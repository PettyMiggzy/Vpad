import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { handle, welcomeFor, isJoin, _reset } = createRequire(import.meta.url)('../api/_welcome.js');

const ENV = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_WEBHOOK_SECRET: 's3cret', WELCOME_CHAT_ID: '-100123', WELCOME_OWNER_IDS: '42, 43', WELCOME_VIDEO_URL: 'https://example.test/w.mp4' };
const H = { 'x-telegram-bot-api-secret-token': 's3cret' };
const join = (over = {}) => ({ chat_member: { chat: { id: -100123 }, date: 1000, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member', user: { id: 7, first_name: 'Ana' } }, ...over } });
/** a stand-in Telegram: records each call, and can refuse a method */
const tg = (fail = [], members = 16) => { const calls = [], asks = []; return { calls, asks, fetch: async (url, init) => { const method = url.split('/').pop(); const body = JSON.parse(init.body); if (method === 'getChatMemberCount') { asks.push(body); return { json: async () => ({ ok: true, result: members }) }; } calls.push({ method, body }); return { json: async () => ({ ok: !fail.includes(method) }) }; } }; };
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

// ---- group hype ----
const say = (text, over = {}) => ({ message: { message_id: 5, text, from: { id: 7, first_name: 'Ana' }, chat: { id: -100123, type: 'supergroup' }, ...over } });
const always = () => 0, never = () => 0.99;

test('reaching a member milestone posts a hype line after the welcome; other counts do not', async () => {
  for (const n of [25, 50, 75, 100, 150, 1000, 1250]) {
    _reset(); const t = tg([], n);
    await handle(H, join(), ENV, t.fetch);
    assert.deepEqual(t.calls.map((c) => c.method), ['sendVideo', 'sendMessage'], `milestone ${n}`);
    assert.match(t.calls[1].body.text, new RegExp(String(n)));
  }
  for (const n of [16, 24, 26, 99, 101, 1001, 1100]) {
    _reset(); const t = tg([], n); await handle(H, join(), ENV, t.fetch);
    assert.deepEqual(t.calls.map((c) => c.method), ['sendVideo'], `no milestone at ${n}`);
  }
  _reset(); const off = tg([], 50); await handle(H, join(), { ...ENV, HYPE: 'off' }, off.fetch);
  assert.deepEqual(off.calls.map((c) => c.method), ['sendVideo'], 'hype off: welcome only');
});

test('/hype, /play, /stickers and /lfg answer in the group with a button, and pause so nobody can spam them', async () => {
  const t = tg();
  assert.equal((await handle(H, say('/hype'), ENV, t.fetch, 1_000, always)).sent, true);
  assert.equal((await handle(H, say('/hype'), ENV, t.fetch, 5_000, always)).sent, false, 'inside the pause');
  assert.equal((await handle(H, say('/hype'), ENV, t.fetch, 30_000, always)).sent, true, 'after the pause');
  assert.equal((await handle(H, say('/play'), ENV, t.fetch, 31_000)).sent, true);
  assert.equal((await handle(H, say('/stickers@warheadzsbot'), ENV, t.fetch, 32_000)).sent, true);
  assert.equal((await handle(H, say('/lfg anyone for dust town?'), ENV, t.fetch, 33_000)).sent, true);
  const lfg = t.calls.at(-1).body;
  assert.match(lfg.text, /Ana/); assert.match(lfg.text, /dust town/); assert.ok(lfg.reply_markup.inline_keyboard.flat().every((b) => b.url.startsWith('https://')));
  assert.equal(t.calls.length, 5);
});

test('commands meant for another bot, from bots, or in other groups are ignored; markup in an /lfg note is escaped', async () => {
  const t = tg();
  assert.equal((await handle(H, say('/hype@SomeOtherBot'), ENV, t.fetch, 1_000)).sent, false);
  assert.equal((await handle(H, say('/hype', { from: { id: 9, is_bot: true } }), ENV, t.fetch, 2_000)).sent, false);
  assert.equal((await handle(H, say('/hype', { chat: { id: -555, type: 'supergroup' } }), ENV, t.fetch, 3_000)).sent, false);
  assert.equal((await handle(H, say('/hype', { chat: { id: 7, type: 'private' } }), ENV, t.fetch, 4_000)).sent, true, 'a private chat with the bot is fine');
  assert.equal((await handle(H, say('/lfg <b>x</b> & <a href="evil">y</a>'), ENV, t.fetch, 5_000)).sent, true);
  const body = t.calls.at(-1).body.text;
  assert.ok(!body.includes('<a href="evil">') && !body.includes('<b>x</b>'));
  assert.equal((await handle(H, say('/hype'), { ...ENV, HYPE: 'off' }, t.fetch, 90_000)).sent, false);
});

test('streak talk and screenshots get a reaction now and then, never every message, never commands, never other groups', async () => {
  const t = tg();
  assert.equal((await handle(H, say('just hit a 7 kill streak'), ENV, t.fetch, 1, always)).sent, true);
  const r = t.calls[0];
  assert.equal(r.method, 'setMessageReaction'); assert.equal(r.body.message_id, 5); assert.equal(r.body.reaction[0].type, 'emoji');
  assert.equal((await handle(H, say('just hit a 7 kill streak'), ENV, t.fetch, 2, never)).sent, false, 'chance said no');
  assert.equal((await handle(H, say('good morning everyone'), ENV, t.fetch, 3, always)).sent, false, 'nothing to cheer');
  assert.equal((await handle(H, say(undefined, { text: undefined, photo: [{ file_id: 'x' }] }), ENV, t.fetch, 4, always)).sent, true, 'a screenshot');
  assert.equal((await handle(H, say('streak', { chat: { id: -555, type: 'supergroup' } }), ENV, t.fetch, 5, always)).sent, false);
  assert.equal(t.calls.length, 2);
});

test('the hype lines promise nothing about money, prices or winnings', async () => {
  const { LINES } = (await import('node:module')).createRequire(import.meta.url)('../api/_hype.js');
  for (const l of LINES) assert.ok(!/\b(win|profit|earn|price|moon|airdrop|invest|pump|\$)/i.test(l), l);
  assert.ok(LINES.length >= 10);
});
