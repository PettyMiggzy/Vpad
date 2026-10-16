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
export const COLORS = [0xffc145, 0x46d39a, 0x4cc9f0, 0xff6f91, 0xa78bfa, 0xff8a4c, 0xe8ff5a, 0xffffff];

const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const rnd = (n) => Math.floor(Math.random() * n);

export class Sim {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.radius = world.radius;
    this.lastReal = Date.now();
    const s = this.read();
    if (s) {
      this.clock = s.clock; this.speed = s.speed; this.log = s.log; this.notes = s.notes || []; this.faucetAt = s.faucetAt || {};
      this.nations = s.nations; this.playerName = s.playerName; this.aiAt = s.aiAt || this.clock;
    } else {
      this.clock = 1000 * H; this.speed = 60; this.log = []; this.notes = []; this.faucetAt = {}; this.playerName = null; this.aiAt = this.clock;
      this.nations = world.nations.map((n, i) => this.makeAI(n, i));
    }
    world.nations = this.nations;
    world.sandbox = true;
    world.live = false;
    world.sim = this;
    world.wars = this.currentWars();
  }

  // ---- saving ----
  read() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.v === 2 ? s : null; } catch (_) { return null; }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 2, clock: this.clock, speed: this.speed, log: this.log.slice(-60), notes: this.notes, faucetAt: this.faucetAt, nations: this.nations, playerName: this.playerName, aiAt: this.aiAt }));
    } catch (_) { /* storage full or blocked: the game still runs */ }
  }
  reset() { try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ } }

  makeAI(n, i) {
    const base = 8 + rnd(25);
    return {
      name: n.name, color: n.color, emblem: n.emblem, plots: n.plots, isPlayer: false, token: `sim-${n.name}`,
      units: [base + rnd(20), base + rnd(20), base + rnd(20), Math.floor(base / 2)], wall: rnd(2), tower: rnd(2),
      pool: 60 + rnd(200), pot: 0, protectedUntil: this.clockStart() - 1, nextRaidAt: 0, jobs: [], holders: 800 + rnd(4000),
      coin: R.SUPPLY, trained: 0, aggression: 0.35 + Math.random() * 0.4, burned: 0, usdc: 0,
    };
  }
  clockStart() { return 1000 * H; }

  // ---- the clock ----
  /** advances the game clock by the real time since the last call, scaled by the speed; runs the other nations; returns new log entries */
  tick() {
    const nowReal = Date.now();
    const dt = Math.min(5000, nowReal - this.lastReal);
    this.lastReal = nowReal;
    const before = this.log.length;
    this.clock += dt * this.speed;
    for (const n of this.nations) this.finishJobs(n);
    if (this.clock - this.aiAt >= 3 * H) { const steps = Math.min(8, Math.floor((this.clock - this.aiAt) / (3 * H))); this.aiAt += steps * 3 * H; for (let i = 0; i < steps; i++) this.aiTurn(); }
    this.wars = null;
    return this.log.slice(before);
  }
  get now() { return this.clock; }
  setSpeed(x) { this.speed = x; this.save(); }

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
  strength(n) { return n.units[0] * 100 + n.units[1] * 100 + n.units[2] * 100 + n.units[3] * 250; }
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
    name = String(name || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12);
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
    count = Math.floor(count); this.need(count > 0 && unit >= 0 && unit <= 3, 'bad order');
    this.need(p.trained + count <= Math.floor(p.coin / this.slot()), `holding too small: you can train ${Math.max(0, Math.floor(p.coin / this.slot()) - p.trained)} more (hold more coin)`);
    p.trained += count;
    p.coin -= this.unitCost() * count; p.burned += this.unitCost() * count;
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
    const jobs = this.readyJobs(); this.need(jobs.length, 'nothing is ready yet');
    let total = 0;
    for (const j of jobs) { j.collected = true; p.units[j.unit] += j.count; total += j.count; }
    p.jobs = p.jobs.filter((j) => !j.collected);
    this.logEvent({ kind: 'info', text: `${total} unit${total > 1 ? 's' : ''} join the army.` });
    this.save();
    return total;
  }
  pay(p, usdc, poolBps = R.POOL_BPS) {
    this.need(p.usdc >= usdc, `not enough play USDC (need ${usdc}, have ${Math.floor(p.usdc)}): get more in the Shop`);
    p.usdc -= usdc; p.pool += (usdc * poolBps) / 10000;
  }
  speedUp(hours) {
    const p = this.player; this.need(p, 'no nation');
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
    p.coin -= cost; p.burned += cost;
    if (wall) p.wall++; else p.tower++;
    this.logEvent({ kind: 'info', text: `Built ${wall ? 'a wall' : 'a tower'} (level ${level + 1}): +10% defense.` });
    this.save();
  }
  buyShield(hours) {
    const p = this.player; this.need(p, 'no nation');
    const base = Math.max(this.clock, p.protectedUntil), target = base + hours * H;
    this.need(target <= this.clock + R.MAX_SHIELD, 'a shield can reach at most 72 hours ahead');
    this.pay(p, hours * R.SHIELD_PER_HOUR);
    p.protectedUntil = target;
    this.logEvent({ kind: 'info', text: `Shield bought: protected for ${Math.ceil((target - this.clock) / H)} more hours. A shield never adds strength.` });
    this.save();
  }
  canExpand(x, y) {
    const p = this.player; if (!p || p.plots.length >= R.MAX_PLOTS) return false;
    if (!this.buildable(x, y) || this.owner(x, y)) return false;
    return p.plots.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) === 1);
  }
  expand(x, y) {
    const p = this.player; this.need(p, 'no nation');
    this.need(p.plots.length < R.MAX_PLOTS, 'the most plots a nation can hold is 16');
    this.need(this.canExpand(x, y), 'a new plot must be open land touching yours');
    this.pay(p, this.kind(x, y) === LAND ? R.PLAIN_PLOT : R.PREMIUM_PLOT, R.LAND_POOL_BPS);
    p.plots.push([x, y]);
    this.logEvent({ kind: 'info', text: `Took the plot at ${x}, ${y}.` });
    this.save();
  }
  faucet(what) {
    const p = this.player; this.need(p, 'no nation');
    const last = this.faucetAt[what] || 0;
    this.need(Date.now() - last > R.FAUCET_WAIT, `wait ${Math.ceil((R.FAUCET_WAIT - (Date.now() - last)) / 1000)} s`);
    this.faucetAt[what] = Date.now();
    if (what === 'coin') p.coin += R.COIN_FAUCET; else p.usdc += R.USDC_FAUCET;
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
    if (n.pot < R.BUYBACK_STEP) return 0;
    const spent = n.pot; n.pot = 0; n.burned += spent * 1_000_000;
    this.logEvent({ kind: 'info', text: `${n.name}'s buyback pot reaches $${spent.toFixed(0)}: its coin is bought back and burned.` });
    return spent;
  }

  // ---- the other nations ----
  aiTurn() {
    for (const n of this.nations) {
      if (n.isPlayer) continue;
      // economy: a batch of units now and then, a defense level now and then, a little war chest income
      if (Math.random() < 0.7) { const t = Math.random() < 0.4 ? ['bruiser', 'sniper', 'trickster', 'defender'].indexOf(n.emblem) : rnd(4); n.units[t] += 3 + rnd(8); }
      if (Math.random() < 0.12) { if (Math.random() < 0.5 && n.wall < 3) n.wall++; else if (n.tower < 3) n.tower++; }
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
      const send = [Math.floor(n.units[0] * 0.8), Math.floor(n.units[1] * 0.8), Math.floor(n.units[2] * 0.8)];
      if (send[0] + send[1] + send[2] < 5) continue;
      const pl = this.plan(n, d, send);
      if (pl.attack < pl.defense * 0.85) continue;              // only attack when it looks winnable
      const why = pl.why.filter((w) => !/command a raid/.test(w));
      if (why.length) continue;
      this.raid(n, d, send);
    }
    this.save();
  }
}

const snap = (n, units) => ({ name: n.name, color: n.color, emblem: n.emblem, units: units.slice(), wall: n.wall, tower: n.tower, isPlayer: n.isPlayer });
export const fmtLeft = (ms) => { const h = ms / H; if (h >= 1) return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`; const m = ms / 60000; return m >= 1 ? `${Math.ceil(m)}m` : `${Math.ceil(ms / 1000)}s`; };
export const fmtCoin = (c) => (c >= 1e9 ? `${(c / 1e9).toFixed(2)}B` : c >= 1e6 ? `${(c / 1e6).toFixed(c >= 1e8 ? 0 : 1)}M` : c >= 1e3 ? `${Math.round(c / 1e3)}K` : `${Math.round(c)}`);
