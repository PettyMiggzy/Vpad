// Keeps the group tidy: the bot's own posts are deleted after ten minutes, and a new welcome replaces the last one.
// Telegram has no timer for a bot's message and a Vercel function cannot wait ten minutes, so the ids of what the bot sent are kept in a small
// stored list and cleared out on the next update that reaches the function (any message or join in the group). A quiet group keeps its last post
// until someone speaks again. With no store configured, or TIDY_MINUTES=0, nothing is kept and nothing is deleted.
const KEEP = 200;                       // most records held at once
const SWEEP_GAP_MS = 20_000;            // a busy group does not read the store on every message
let lastSweep = 0;

/** the store: read() gives { items, tag }, write(items, tag) says whether it was saved (false when someone else saved first) */
function blobStore(env) {
  const token = env.BLOB_READ_WRITE_TOKEN; if (!token) return null;
  const PATH = 'warheadz-bot/messages.json';
  const blob = require('@vercel/blob');
  return {
    async read() {
      const r = await blob.get(PATH, { access: 'private', useCache: false, token });
      if (!r || r.statusCode !== 200) return { items: [], tag: null };
      const items = JSON.parse(await new Response(r.stream).text());
      return { items: Array.isArray(items) ? items : [], tag: r.blob.etag };
    },
    async write(items, tag) {
      try {
        await blob.put(PATH, JSON.stringify(items), { access: 'private', token, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, ...(tag ? { ifMatch: tag } : {}) });
        return true;
      } catch (e) { if (e && (e.name === 'BlobPreconditionFailedError' || /precondition/i.test(String(e.message)))) return false; throw e; }
    },
  };
}

/** a tidy-up helper for one request, or null when the feature is off. env.__tidyStore lets tests bring their own store. */
function makeTidy(env, fetchFn, now) {
  const minutes = env.TIDY_MINUTES === undefined || env.TIDY_MINUTES === '' ? 10 : Number(env.TIDY_MINUTES);
  if (!(minutes > 0)) return null;
  let store; try { store = env.__tidyStore || blobStore(env); } catch { store = null; }
  if (!store || !env.TELEGRAM_BOT_TOKEN) return null;
  const ttl = minutes * 60_000, pending = [], stats = { saved: 0, deleted: 0 };

  /** change the stored list with fn(items) and save it, trying again when another call saved in between */
  async function update(fn) {
    for (let i = 0; i < 4; i++) {
      const { items, tag } = await store.read();
      const next = fn(items);
      if (next === null) return true;
      if (await store.write(next.slice(-KEEP), tag)) return true;
    }
    return false;
  }
  async function del(rec) {
    try {
      const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: rec.c, message_id: rec.m }) });
      const j = await r.json().catch(() => ({}));
      return !!j.ok || /not found|can't be deleted|can't delete/i.test(String(j.description || ''));      // gone already, or Telegram will never let it go: stop trying either way
    } catch { return false; }                                                                            // no answer: keep it for the next sweep
  }
  /** delete these records from the chat and drop them from the list */
  async function remove(recs) {
    if (!recs.length) return 0;
    const gone = [];
    await Promise.all(recs.map(async (r) => { if (await del(r)) gone.push(r); }));
    const key = (r) => `${r.c}:${r.m}`, set = new Set(gone.map(key));
    if (gone.length) await update((items) => items.some((r) => set.has(key(r))) ? items.filter((r) => !set.has(key(r))) : null);
    stats.deleted += gone.length;
    return gone.length;
  }
  return {
    stats,
    /** a function for sendRich: notes the message that went out */
    tracker: (kind) => (chat, id) => { pending.push({ c: chat, m: id, k: kind, t: now }); },
    /** delete what the bot posted earlier of this kind in this chat (a new welcome replaces the last one) */
    async removeKind(chat, kind) {
      try { const { items } = await store.read(); return await remove(items.filter((r) => String(r.c) === String(chat) && r.k === kind)); } catch { return 0; }
    },
    /** save what was sent in this request, then delete whatever has stayed past its time */
    async finish(force = false) {
      try {
        if (pending.length) { await update((items) => [...items, ...pending]); stats.saved += pending.length; }
        if (!force && !pending.length && now - lastSweep < SWEEP_GAP_MS) return;
        lastSweep = now;
        const { items } = await store.read();
        await remove(items.filter((r) => now - r.t >= ttl));
      } catch { /* a tidy-up that fails leaves the post where it is; it is tried again on the next update */ }
    },
  };
}

module.exports = { makeTidy, blobStore, _reset: () => { lastSweep = 0; } };
