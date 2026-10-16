// The play-test engine: the game's rules (the same numbers and the same fight formula as WarheadzLands) running in the browser with play money,
// so a team can play the whole loop before any wallet or chain is involved. Saved in this browser only. Nothing here touches a chain.
//
// Differences from the contract, on purpose and shown to the tester: play coin and play USDC are free (buttons in the Shop), time can be
// fast-forwarded (1 hour of training in a minute), raids may reach nations a few tiles away (the contract needs touching land), and the other
// nations are computer-run. Prices for speed-ups and shields are placeholders.
import { powers } from './combat.js';
import { LAND, COAST, PASS, WATER, MOUNTAIN } from './terrain.js';

export const H = 3600 * 1000;
export const R = {
  SUPPLY: 1_000_000_000,        // each nation's coin supply
  UNIT_COST_BPS: 1, UNIT_SLOT_BPS: 5, COMMANDER_BPS: 50, BUILD_COST_BPS: 10,
  TRAIN_TIME: 1 * H, COOLDOWN: 24 * H, MAX_SHIELD: 72 * H,
  MAX_LEVEL: 5, MAX_PLOTS: 16, LOOT_BPS: 2000, POOL_BPS: 6000, LAND_POOL_BPS: 5000,
  SPEEDUP_PER_HOUR: 1, SHIELD_PER_HOUR: 2, PREMIUM_PLOT: 20, PLAIN_PLOT: 5,
  REACH: 6,                      // sandbox: a raid may cross up to this many tiles (the contract needs touching land)
  BUYBACK_STEP: 50,              // play USDC of pot that triggers a buyback and burn
  START_COIN: 400_000_000, START_USDC: 100,
  COIN_FAUCET: 100_000_000, USDC_FAUCET: 100, FAUCET_WAIT: 20 * 1000,
};
const KEY = 'badlands.sandbox.v2';
export const SPEEDS = [1, 60, 600];
export const UNIT = ['Bruiser', 'Sniper', 'Trickster', 'Defender'];
const EMBLEMS = ['bruiser', 'sniper', 'trickster', 'defender'];
export const COLORS = [0xffc145, 0x46d39a, 0x4cc9f0, 0xff6f91, 0xa78bfa, 0xff8a4c, 0xe8ff5a, 0xffffff];

/** the one place a nation name is cleaned: the founding screen and the engine must agree, or a name can pass one and fail the other */
export const cleanName = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/ +/g, ' ').trim().slice(0, 12).trim();
const RULES_PRINT = JSON.stringify(R);   // a save made under other rules is dropped, never loaded into a changed game
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const MAX_ORDERS = 200;                 // uncollected training orders a nation may hold (the loader accepts more, so a legitimate save is never refused)
const CAP = 1e12;                       // no saved quantity may exceed this: it keeps every sum inside safe-integer range
const cap = (v) => fin(v) && v >= 0 && v <= CAP;
const int = (v) => Number.isInteger(v);
const validSnap = (n) => !!n && typeof n.name === 'string' && /^[A-Za-z0-9 ]{1,16}$/.test(n.name) && Number.isInteger(n.color) && n.color >= 0 && n.color <= 0xffffff
  && EMBLEMS.includes(n.emblem) && Array.isArray(n.units) && (n.units.length === 3 || n.units.length === 4) && n.units.every((u) => int(u) && u >= 0 && u <= CAP)   // the attacker's snapshot lists the three types it sent
  && int(n.wall) && n.wall >= 0 && n.wall <= R.MAX_LEVEL && int(n.tower) && n.tower >= 0 && n.tower <= R.MAX_LEVEL;
/** a raid report kept in the log must be sound before the battle scene is allowed to replay it: a bad one loses only its replay */
export const validReport = (r) => !!r && typeof r === 'object' && !!r.result && fin(r.result.attack) && r.result.attack >= 0 && fin(r.result.defense) && r.result.defense >= 0
  && typeof r.result.success === 'boolean' && Array.isArray(r.send) && r.send.length === 3 && r.send.every((u) => int(u) && u >= 0 && u <= CAP)
  && (r.loot === undefined || (fin(r.loot) && r.loot >= 0)) && (r.buyback === undefined || (fin(r.buyback) && r.buyback >= 0)) && validSnap(r.a) && validSnap(r.b);
const validNation = (n) => !!n && typeof n.name === 'string' && /^[A-Za-z0-9 ]{1,16}$/.test(n.name) && Array.isArray(n.plots) && n.plots.length > 0 && n.plots.length <= R.MAX_PLOTS && n.plots.every((p) => Array.isArray(p) && int(p[0]) && int(p[1]))
  && Array.isArray(n.units) && n.units.length === 4 && n.units.every((u) => int(u) && u >= 0 && u <= CAP) && Array.isArray(n.jobs) && n.jobs.length <= 500
  && n.jobs.every((j) => j && int(j.id) && int(j.unit) && j.unit >= 0 && j.unit <= 3 && int(j.count) && j.count > 0 && j.count <= CAP && fin(j.readyAt) && typeof j.collected === 'boolean')
  && [n.wall, n.tower].every((v) => int(v) && v >= 0 && v <= R.MAX_LEVEL) && [n.pool, n.pot, n.coin, n.usdc, n.trained, n.burned].every(cap) && [n.protectedUntil, n.nextRaidAt].every(fin)
  && typeof n.isPlayer === 'boolean' && int(n.color) && n.color >= 0 && n.color <= 0xffffff && EMBLEMS.includes(n.emblem)
  && (n.holders === null || n.holders === undefined || cap(n.holders)) && (n.isPlayer || (fin(n.aggression) && n.aggression >= 0 && n.aggression <= 1));
function validSave(s) {
  return !!s && s.v === 2 && fin(s.clock) && SPEEDS.includes(s.speed) && Array.isArray(s.log) && Array.isArray(s.nations) && s.nations.length > 0 && s.nations.length <= 40 && s.nations.every(validNation)
    && s.nations.filter((n) => n.isPlayer).length <= 1 && (s.nations.some((n) => n.isPlayer) ? s.nations.find((n) => n.isPlayer).name === s.playerName : true)
    && new Set(s.nations.map((n) => n.name)).size === s.nations.length && fin(s.aiAt)
    && (s.faucetAt === undefined || (s.faucetAt && typeof s.faucetAt === 'object' && !Array.isArray(s.faucetAt) && Object.values(s.faucetAt).every(fin)))
    && (s.notes === undefined || Array.isArray(s.notes)) && s.rules === RULES_PRINT;
}
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const rnd = (n) => Math.floor(Math.random() * n);

export class Sim {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.radius = world.radius;
    this.lastReal = Date.now();
    this.rev = this.storedRev();
    const s = this.read();
    if (s) {
      this.clock = s.clock; this.speed = s.speed; this.log = s.log.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string' && fin(e.t)).map((e) => (e.report !== undefined && !validReport(e.report) ? { ...e, report: undefined } : e)); this.notes = Array.isArray(s.notes) ? s.notes.filter((x) => x && typeof x.text === 'string') : []; this.faucetAt = s.faucetAt || {};
      this.nations = s.nations; this.playerName = s.playerName; this.aiAt = Math.min(this.clock, Math.max(s.aiAt || this.clock, this.clock - 8 * 3 * H));   // an old or tampered turn clock cannot make every tick run catch-up turns
    } else {
      this.clock = 1000 * H; this.speed = 60; this.log = []; this.notes = []; this.faucetAt = {}; this.playerName = null; this.aiAt = this.clock;
      this.nations = world.nations.map((n, i) => this.makeAI(n, i));
    }
    try { if (typeof window !== 'undefined') { const keep = () => this.save(); window.addEventListener('pagehide', keep); document.addEventListener('visibilitychange', () => { if (document.hidden) keep(); }); } } catch (_) { /* not a browser */ }
    world.nations = this.nations;
    world.sandbox = true;
    world.live = false;
    world.sim = this;
    world.wars = this.currentWars();
  }

  // ---- saving ----
  read() {
    try {
      const raw = localStorage.getItem(KEY);
      const s = JSON.parse(raw || 'null');
      if (validSave(s) && this.plotsOk(s) && s.seed === this.seedPrint()) return s;
      if (s) {   // a save that does not make sense is never trusted, but it is kept aside (one copy) instead of destroyed
        this.rejectedSave = true;
        try { localStorage.setItem(KEY + '.rejected', raw); localStorage.removeItem(KEY); } catch (_) { /* no room for the copy: the save stays where it is, untrusted and unused, and the next save replaces it */ }
      }
      return null;
    } catch (_) {   // not even valid JSON: kept aside too
      try { const raw = localStorage.getItem(KEY); if (raw) { this.rejectedSave = true; localStorage.setItem(KEY + '.rejected', raw); localStorage.removeItem(KEY); } } catch (_2) { /* ignore */ }
      return null;
    }
  }
  /** the save's revision, kept beside it: a tab holding an older one must not overwrite what another tab has saved since */
  storedRev() { try { const v = Number(localStorage.getItem(KEY + '.rev')); return Number.isSafeInteger(v) && v >= 0 && v < 1e12 ? v : 0; } catch (_) { return 0; } }
  seedPrint() { return `${this.world.seed}:${this.radius}`; }
  // plots must be real buildable land inside the world, and no two nations may share one
  plotsOk(s) {
    const seen = new Set();
    for (const n of s.nations) for (const [x, y] of n.plots) {
      const k = `${x},${y}`;
      if (seen.has(k) || Math.abs(x) > this.radius || Math.abs(y) > this.radius || !this.buildable(x, y)) return false;
      seen.add(k);
    }
    return true;
  }
  save() {
    if (this.wiped) return true;             // a wiped game is not written back by the page-hide handlers
    if (!this.player && !this.notes.length) return true;   // a window still on the founding screen has nothing to keep, and must not take the save from the window that is playing
    if (this.stale) return false;
    try {
      const cur = this.storedRev();
      if (cur > this.rev) { this.stale = true; return false; }   // another tab saved since this one loaded: this one is out of date and must reload, not overwrite
      localStorage.setItem(KEY, JSON.stringify({ v: 2, rules: RULES_PRINT, seed: this.seedPrint(), clock: this.clock, speed: this.speed, log: this.log.slice(-60), notes: this.notes, faucetAt: this.faucetAt, nations: this.nations, playerName: this.playerName, aiAt: this.aiAt }));
      this.rev = cur + 1; try { localStorage.setItem(KEY + '.rev', String(this.rev)); } catch (_) { /* the game itself was saved */ }
      this.saveFailed = false;
      return true;
    } catch (_) { this.saveFailed = true; return false; }       // storage full or blocked: the game still runs, but the caller can say so
  }
  addNote(text, day) {
    const n = { at: new Date().toISOString(), day, text: String(text).slice(0, 1000) };
    this.notes.push(n); if (this.notes.length > 50) this.notes.splice(0, this.notes.length - 50);
    return n;
  }
  reset() { this.wiped = true; try { localStorage.removeItem(KEY); localStorage.setItem(KEY + '.rev', String(Math.max(this.rev, this.storedRev()) + 1)); } catch (_) { /* ignore */ } }

  makeAI(n, i) {
    const base = 8 + rnd(25);
    return {
      name: n.name, color: n.color, emblem: n.emblem, plots: n.plots, isPlayer: false, token: `sim-${n.name}`,
      units: [base + rnd(20), base + rnd(20), base + rnd(20), Math.floor(base / 2)], wall: rnd(2), tower: rnd(2),
      pool: 60 + rnd(200), pot: 0, protectedUntil: this.clockStart() - 1, nextRaidAt: 0, jobs: [], holders: 800 + rnd(4000),
      coin: R.SUPPLY, trained: 0, aggression: 0.35 + Math.random() * 0.4, burned: 0, usdc: 0,
    };
  }
  get emblems() { return EMBLEMS; }
  get rulesPrint() { return RULES_PRINT; }
  clockStart() { return 1000 * H; }

  // ---- the clock ----
  /** advances the game clock by the real time since the last call, scaled by the speed; runs the other nations; returns new log entries */
  tick() {
    const nowReal = Date.now();
    if ((this.lastSave || 0) > nowReal) this.lastSave = 0;        // the computer's clock stepped back
    const dt = Math.max(0, Math.min(5000, nowReal - this.lastReal));
    this.lastReal = nowReal;
    const before = this.log.length;
    this.clock += dt * this.speed;
    for (const n of this.nations) this.finishJobs(n);
    if (this.clock - this.aiAt >= 3 * H) { const steps = Math.min(8, Math.floor((this.clock - this.aiAt) / (3 * H))); this.aiAt += steps * 3 * H; for (let i = 0; i < steps; i++) this.aiTurn(); }
    this.wars = null;
    if (nowReal - (this.lastSave || 0) > 5000) { this.lastSave = nowReal; this.save(); }
    return this.log.slice(before);
  }
  get now() { return this.clock; }
  setSpeed(x) { if (!SPEEDS.includes(x)) return; this.speed = x; this.save(); }

  // ---- queries ----
  get player() { return this.nations.find((n) => n.isPlayer) || null; }
  byName(name) { return this.nations.find((n) => n.name === name); }
  owner(x, y) { return this.nations.find((n) => n.plots.some((p) => p[0] === x && p[1] === y)) || null; }
  kind(x, y) { return Math.abs(x) > this.radius || Math.abs(y) > this.radius ? WATER : this.terrain(x, y); }
  buildable(x, y) { const k = this.kind(x, y); return k === LAND || k === COAST || k === PASS; }
  unitCost() { return (R.SUPPLY * R.UNIT_COST_BPS) / 10000; }
  slot() { return (R.SUPPLY * R.UNIT_SLOT_BPS) / 10000; }
  buildCost(level) { return (R.SUPPLY * R.BUILD_COST_BPS * (level + 1)) / 10000; }
  protectedLeft(n) { return Math.max(0, n.protectedUntil - this.clock); }
  cooldownLeft(n) { return Math.max(0, n.nextRaidAt - this.clock); }
  strength(n) { return n.units[0] * 100 + n.units[1] * 100 + n.units[2] * 100 + n.units[3] * 150; }
  canFound(x, y) {
    if (!this.buildable(x, y) || this.owner(x, y)) return false;
    return !this.nations.some((n) => n.plots.some((p) => dist(p, [x, y]) < 3));
  }
  currentWars() {
    const out = [];
    for (const e of this.log.slice(-12)) {
      if (e.kind !== 'raid' || this.clock - e.t > 12 * H) continue;
      const a = this.byName(e.a), b = this.byName(e.b);
      if (!a || !b || out.some((w) => w.a === a.name && w.b === b.name)) continue;
      out.push({ a: a.name, b: b.name, at: [(a.plots[0][0] + b.plots[0][0]) / 2, (a.plots[0][1] + b.plots[0][1]) / 2], success: e.success, report: e.report });
    }
    return out.slice(-3);
  }
  logEvent(e) { e.t = this.clock; this.log.push(e); return e; }

  // ---- founding ----
  claim(name, emblem, color, x, y) {
    if (this.player) throw new Error('you already have a nation');
    name = cleanName(name);
    this.need(int(x) && int(y), 'bad plot');
    this.need(this.emblems.includes(emblem) && int(color) && color >= 0 && color <= 0xffffff, 'bad champion or colour');
    if (name.length < 2) throw new Error('give your nation a name (2 to 12 letters)');
    if (this.byName(name)) throw new Error('that name is taken');
    if (!this.canFound(x, y)) throw new Error('that plot is not open (water, mountain, taken or too close to another nation)');
    const prem = this.kind(x, y) !== LAND;
    const p = {
      name, color, emblem, plots: [[x, y]], isPlayer: true, token: `sim-${name}`, units: [0, 0, 0, 0], wall: 0, tower: 0,
      pool: 0, pot: 0, protectedUntil: this.clock + R.COOLDOWN, nextRaidAt: 0, jobs: [], holders: 1, coin: R.START_COIN, trained: 0, burned: 0, usdc: R.START_USDC, points: 0,
    };
    if (prem) { if (p.usdc < R.PREMIUM_PLOT) throw new Error('not enough play USDC'); p.usdc -= R.PREMIUM_PLOT; p.pool += (R.PREMIUM_PLOT * R.LAND_POOL_BPS) / 10000; }
    this.nations.push(p);
    this.playerName = name;
    this.logEvent({ kind: 'info', text: `${name} claims land at ${x}, ${y}. A new nation is protected for 24 hours.` });
    this.save();
    return p;
  }

  // ---- the player's actions (the same checks as the contract) ----
  need(cond, msg) { if (!cond) throw new Error(msg); }
  train(unit, count) {
    const p = this.player; this.need(p, 'no nation');
    p.jobs = p.jobs.filter((j) => !j.collected);   // collected orders are history, they never count against the limit
    this.need(int(count) && count > 0 && int(unit) && unit >= 0 && unit <= 3, 'bad order');
    this.need(p.jobs.length < MAX_ORDERS, 'too many training orders waiting: collect your finished units first (or train bigger batches)');
    this.need(p.trained + count <= Math.floor(p.coin / this.slot()), `holding too small: you can train ${Math.max(0, Math.floor(p.coin / this.slot()) - p.trained)} more (hold more coin)`);
    p.trained += count;
    p.coin -= this.unitCost() * count; p.burned = Math.min(CAP, p.burned + this.unitCost() * count);
    p.jobs.push({ id: this.nextId(p), unit, count, readyAt: this.clock + R.TRAIN_TIME, collected: false });
    this.logEvent({ kind: 'info', text: `Training ${count} ${UNIT[unit].toLowerCase()}${count > 1 ? 's' : ''}: ready in an hour of game time.` });
    this.save();
  }
  nextId(p) { return p.jobs.reduce((m, j) => Math.max(m, j.id + 1), 0); }
  finishJobs(n) {
    for (const j of n.jobs) if (!j.collected && this.clock >= j.readyAt && !n.isPlayer) { j.collected = true; n.units[j.unit] += j.count; }
  }
  readyJobs() { const p = this.player; return p ? p.jobs.filter((j) => !j.collected && this.clock >= j.readyAt) : []; }
  collect() {
    const p = this.player; this.need(p, 'no nation');
    p.jobs = p.jobs.filter((j) => !j.collected);   // finished orders already collected never block a new collection
    const jobs = this.readyJobs(); this.need(jobs.length, 'nothing is ready yet');
    let total = 0;
    for (const j of jobs) { j.collected = true; p.units[j.unit] += j.count; total += j.count; }
    p.jobs = p.jobs.filter((j) => !j.collected);
    this.logEvent({ kind: 'info', text: `${total} unit${total > 1 ? 's' : ''} join the army.` });
    this.save();
    return total;
  }
  pay(p, usdc, poolBps = R.POOL_BPS) {
    this.need(fin(usdc) && usdc >= 0, 'bad amount');
    this.need(p.usdc >= usdc, `not enough play USDC (need ${usdc}, have ${Math.floor(p.usdc)}): get more in the Shop`);
    p.usdc -= usdc; p.pool += (usdc * poolBps) / 10000;
  }
  speedUp(hours) {
    const p = this.player; this.need(p, 'no nation');
    this.need(int(hours) && hours > 0, 'speed up by a whole number of hours');
    const job = p.jobs.filter((j) => !j.collected && j.readyAt > this.clock).sort((a, b) => b.readyAt - a.readyAt)[0];
    this.need(job, 'no training to speed up');
    const left = job.readyAt - this.clock, cut = Math.min(left, hours * H), billed = Math.ceil(cut / H);
    this.pay(p, billed * R.SPEEDUP_PER_HOUR);
    job.readyAt -= cut;
    this.logEvent({ kind: 'info', text: `Sped up training by ${billed} hour${billed > 1 ? 's' : ''} for $${billed * R.SPEEDUP_PER_HOUR}. Speed only: no extra strength.` });
    this.save();
  }
  build(wall) {
    const p = this.player; this.need(p, 'no nation');
    const level = wall ? p.wall : p.tower;
    this.need(level < R.MAX_LEVEL, 'already at the top level');
    const cost = this.buildCost(level);
    this.need(p.coin >= cost, 'not enough coin to burn: get more in the Shop');
    p.coin -= cost; p.burned = Math.min(CAP, p.burned + cost);
    if (wall) p.wall++; else p.tower++;
    this.logEvent({ kind: 'info', text: `Built ${wall ? 'a wall' : 'a tower'} (level ${level + 1}): +10% defense.` });
    this.save();
  }
  buyShield(hours) {
    const p = this.player; this.need(p, 'no nation');
    this.need(int(hours) && hours > 0, 'buy a whole number of hours');
    const base = Math.max(this.clock, p.protectedUntil), target = base + hours * H;
    this.need(target <= this.clock + R.MAX_SHIELD, 'a shield can reach at most 72 hours ahead');
    this.pay(p, hours * R.SHIELD_PER_HOUR);
    p.protectedUntil = target;
    this.logEvent({ kind: 'info', text: `Shield bought: protected for ${Math.ceil((target - this.clock) / H)} more hours. A shield never adds strength.` });
    this.save();
  }
  canExpand(x, y) {
    const p = this.player; if (!p || p.plots.length >= R.MAX_PLOTS || !int(x) || !int(y)) return false;
    if (!this.buildable(x, y) || this.owner(x, y)) return false;
    return p.plots.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) === 1);
  }
  plotCost(x, y) {
    const p = this.player, base = R.PLAIN_PLOT * 2 ** (p.plots.length - 1);   // doubles with every plot owned
    return this.kind(x, y) !== LAND && base < R.PREMIUM_PLOT ? R.PREMIUM_PLOT : base;
  }
  expand(x, y) {
    const p = this.player; this.need(p, 'no nation');
    this.need(int(x) && int(y), 'bad plot');
    this.need(p.plots.length < R.MAX_PLOTS, 'the most plots a nation can hold is 16');
    this.need(p.coin >= (R.SUPPLY * R.COMMANDER_BPS) / 10000, 'you need more coin to take land (commander holding)');
    this.need(this.canExpand(x, y), 'a new plot must be open land touching yours');
    const burn = (R.SUPPLY * R.BUILD_COST_BPS * p.plots.length) / 10000;
    this.need(p.coin - burn >= 0, 'not enough coin to burn for this plot');
    this.pay(p, this.plotCost(x, y), R.LAND_POOL_BPS);
    p.coin -= burn; p.burned = Math.min(CAP, p.burned + burn);
    p.plots.push([x, y]);
    this.logEvent({ kind: 'info', text: `Took the plot at ${x}, ${y}.` });
    this.save();
  }
  faucet(what) {
    const p = this.player; this.need(p, 'no nation');
    this.need(what === 'coin' || what === 'usdc', 'unknown faucet');
    let last = this.faucetAt[what] || 0; if (last > Date.now()) last = 0;
    this.need(Date.now() - last > R.FAUCET_WAIT, `wait ${Math.ceil((R.FAUCET_WAIT - (Date.now() - last)) / 1000)} s`);
    this.faucetAt[what] = Date.now();
    if (what === 'coin') p.coin = Math.min(CAP, p.coin + R.COIN_FAUCET); else p.usdc = Math.min(CAP, p.usdc + R.USDC_FAUCET);
    this.save();
  }

  // ---- raids ----
  /** the target plot a raid from `a` would hit: the defender's plot nearest the attacker's land, and the reason it can't reach if so */
  approach(a, d) {
    let best = null;
    for (const mp of a.plots) for (const tp of d.plots) { const k = dist(mp, tp); if (!best || k < best.k) best = { k, mp, tp }; }
    return best;
  }
  plan(a, d, send) {
    this.need(Array.isArray(send) && send.length === 3 && [0, 1, 2].every((i) => int(send[i]) && send[i] >= 0), 'a raid order is three whole numbers');
    const ap = this.approach(a, d);
    const onPass = this.kind(ap.tp[0], ap.tp[1]) === PASS;
    const r = powers(send, d.units, d.wall, d.tower, onPass);
    const why = [];
    if (a === d) why.push('that is your own nation');
    if (ap.k > R.REACH) why.push(`too far: ${ap.k} tiles (raids reach ${R.REACH} in this test)`);
    if (this.cooldownLeft(a) > 0) why.push(`your army is cooling down for ${fmtLeft(this.cooldownLeft(a))}`);
    if (this.protectedLeft(d) > 0) why.push(`${d.name} is protected for ${fmtLeft(this.protectedLeft(d))}`);
    if (a.isPlayer && a.coin < (R.SUPPLY * R.COMMANDER_BPS) / 10000) why.push('you need more coin to command a raid');
    if (send[0] + send[1] + send[2] <= 0) why.push('send at least one unit');
    for (let i = 0; i < 3; i++) if (send[i] > a.units[i]) why.push(`you only have ${a.units[i]} ${UNIT[i].toLowerCase()}s`);
    return { ...r, onPass, why, reach: ap.k };
  }
  /** runs a raid with the contract's formula and losses; returns a report the battle scene plays */
  raid(a, d, send) {
    const pl = this.plan(a, d, send);
    this.need(!pl.why.length, pl.why[0]);
    const snapA = snap(a, send), snapD = snap(d, d.units.slice());
    const success = pl.success;
    for (let i = 0; i < 3; i++) a.units[i] -= success ? Math.floor(send[i] / 10) : Math.floor(send[i] / 2);
    for (let i = 0; i < 4; i++) d.units[i] -= success ? Math.floor((d.units[i] * 3) / 10) : Math.floor(d.units[i] / 10);
    a.protectedUntil = this.clock;
    a.nextRaidAt = this.clock + R.COOLDOWN;
    let loot = 0;
    if (success) {
      loot = (d.pool * R.LOOT_BPS) / 10000; d.pool -= loot; a.pot += loot;
      d.protectedUntil = this.clock + R.COOLDOWN;
    }
    const buyback = this.settlePot(a);
    const report = { result: { attack: pl.attack, defense: pl.defense, success }, send: send.slice(), loot, a: snapA, b: snapD, buyback };
    this.logEvent({ kind: 'raid', a: a.name, b: d.name, success, attack: pl.attack, defense: pl.defense, loot, report, text: `${a.name} raids ${d.name}: ${success ? 'the raid succeeds' : 'the raid fails'} (attack ${pl.attack} vs defense ${pl.defense})${loot ? `, loot $${loot.toFixed(1)} to the buyback pot` : ''}.` });
    this.save();
    return report;
  }
  // when a nation's buyback pot reaches a step, it buys its own coin back and burns it (the real contract does this through a keeper)
  settlePot(n) {
    const steps = Math.floor(n.pot / R.BUYBACK_STEP);
    if (!steps || !Number.isFinite(steps)) return 0;
    const spent = steps * R.BUYBACK_STEP;
    n.pot -= spent; n.burned = Math.min(CAP, n.burned + spent * 1_000_000);
    this.logEvent({ kind: 'info', text: `${n.name}'s buyback pot spends $${spent.toFixed(0)}: its coin is bought back and burned.` });
    return spent;
  }

  // ---- the other nations ----
  aiTurn() {
    for (const n of this.nations) {
      if (n.isPlayer) continue;
      // economy: a batch of units now and then, a defense level now and then, a little war chest income
      if (Math.random() < 0.7) { const t = Math.random() < 0.4 ? ['bruiser', 'sniper', 'trickster', 'defender'].indexOf(n.emblem) : rnd(4); n.units[t] += 3 + rnd(8); }
      if (n.aggression < 0.55 && Math.random() < 0.12) { if (Math.random() < 0.5 && n.wall < 4) n.wall++; else if (n.tower < 4) n.tower++; }   // the aggressive nations spend on armies, not on walls
      n.pool += 5 + rnd(25);
      const total = n.units[0] + n.units[1] + n.units[2] + n.units[3];
      if (total > 700) for (let i = 0; i < 4; i++) n.units[i] = Math.floor(n.units[i] * 0.9);
    }
    // a computer nation may raid a neighbour: the player first if they are open and weaker
    const p = this.player;
    for (const n of this.nations) {
      if (n.isPlayer || this.cooldownLeft(n) > 0 || Math.random() > n.aggression * 0.5) continue;
      const targets = this.nations.filter((d) => d !== n && this.protectedLeft(d) === 0 && this.approach(n, d).k <= R.REACH);
      if (!targets.length) continue;
      const d = (p && targets.includes(p) && Math.random() < 0.6) ? p : targets[rnd(targets.length)];
      const send = [n.units[0], n.units[1], n.units[2]];
      if (send[0] + send[1] + send[2] < 5) continue;
      const pl = this.plan(n, d, send);
      if (d === p ? pl.attack <= pl.defense : pl.attack < pl.defense * 0.6) continue;   // against the player a computer nation only strikes when it would win: a failed raid still costs the defender units              // only attack when it looks winnable
      const why = pl.why.filter((w) => !/command a raid/.test(w));
      if (why.length) continue;
      this.raid(n, d, send);
    }
    this.save();
  }
}

const snap = (n, units) => ({ name: n.name, color: n.color, emblem: n.emblem, units: units.slice(), wall: n.wall, tower: n.tower, isPlayer: n.isPlayer });
export const fmtLeft = (ms) => {
  if (ms >= 60000) { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
  const sec = Math.max(1, Math.ceil(ms / 1000));
  return sec >= 60 ? '1m' : `${sec}s`;
};
export const fmtCoin = (c) => {
  if (c >= 999_500_000) return `${(c / 1e9).toFixed(2)}B`;
  if (c >= 999_500) { const m = c / 1e6; return `${m.toFixed(m >= 99.95 ? 0 : 1)}M`; }
  if (c >= 1e3) return `${Math.round(c / 1e3)}K`;
  return `${Math.round(c)}`;
};
