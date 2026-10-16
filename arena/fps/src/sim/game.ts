// @ts-nocheck
// Copied unchanged from the match server (arena/server) so the page and the server run the very same rules.
// The arena rules, with no network code in them so they can be tested on their own: two teams (one per token), a top-down map of
// walls, shooting, bots that fill empty seats, and rounds (first team to win two takes the match).
import { WEAPONS, ARMOR, BOOTS, FREE } from './items.js';
export const MAP = { w: 1600, h: 1000 };
export const WALLS = [
  // the outer frame
  [0, 0, 1600, 24], [0, 976, 1600, 24], [0, 0, 24, 1000], [1576, 0, 24, 1000],
  // the middle: a long wall with gaps, cover blocks either side
  [760, 140, 80, 260], [760, 600, 80, 260], [700, 440, 200, 120],
  [330, 200, 140, 90], [330, 710, 140, 90], [1130, 200, 140, 90], [1130, 710, 140, 90],
  [180, 440, 70, 120], [1350, 440, 70, 120], [520, 470, 70, 60], [1010, 470, 70, 60],
  [520, 120, 60, 130], [1020, 750, 60, 130], [1020, 120, 60, 130], [520, 750, 60, 130],
];
export const R = { RADIUS: 15, SPEED: 200, BULLET_SPEED: 640, BULLET_LIFE: 0.7, DAMAGE: 12, FIRE_GAP: 0.34, HP: 100, ROUND_SECONDS: 80, WIN_ROUNDS: 2 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

/** is the circle at (x, y) inside a wall: pushes it out and returns the corrected position */
export function pushOut(x, y, r = R.RADIUS) {
  for (const [wx, wy, ww, wh] of WALLS) {
    const cx = clamp(x, wx, wx + ww), cy = clamp(y, wy, wy + wh);
    let dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) { // the centre is inside: leave by the nearest side
        const left = x - wx, right = wx + ww - x, up = y - wy, down = wy + wh - y;
        const m = Math.min(left, right, up, down);
        if (m === left) x = wx - r; else if (m === right) x = wx + ww + r; else if (m === up) y = wy - r; else y = wy + wh + r;
      } else { const d = Math.sqrt(d2); x = cx + (dx / d) * r; y = cy + (dy / d) * r; }
    }
  }
  return [clamp(x, R.RADIUS, MAP.w - R.RADIUS), clamp(y, R.RADIUS, MAP.h - R.RADIUS)];
}

/** a clear line between two points (no wall across it): sampled every 12 px */
export function clearLine(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, n = Math.ceil(Math.hypot(dx, dy) / 12);
  for (let i = 1; i < n; i++) {
    const x = x1 + (dx * i) / n, y = y1 + (dy * i) / n;
    for (const [wx, wy, ww, wh] of WALLS) if (x > wx && x < wx + ww && y > wy && y < wy + wh) return false;
  }
  return true;
}


/** how far a ray from (ox, oy) at angle a travels before the first wall, at most `max` */
export function rayWall(ox, oy, a, max) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = max;
  for (const [wx, wy, ww, wh] of WALLS) {
    let t0 = 0, t1 = best, miss = false;
    for (const [o, d, lo, hi] of [[ox, dx, wx, wx + ww], [oy, dy, wy, wy + wh]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { miss = true; break; } continue; }
      let a1 = (lo - o) / d, a2 = (hi - o) / d;
      if (a1 > a2) [a1, a2] = [a2, a1];
      t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
      if (t0 > t1) { miss = true; break; }
    }
    if (!miss && t0 < best) best = t0;
  }
  return best;
}

/** where a ray first meets a circle (centre cx, cy, radius r), or Infinity when it misses */
export function rayCircle(ox, oy, a, cx, cy, r) {
  const dx = Math.cos(a), dy = Math.sin(a), fx = cx - ox, fy = cy - oy;
  const t = fx * dx + fy * dy;
  if (t < 0) return Infinity;
  const d2 = fx * fx + fy * fy - t * t;
  if (d2 > r * r) return Infinity;
  return Math.max(0, t - Math.sqrt(r * r - d2));
}


// ---- navigation: a coarse grid over the map, blocked where a player's circle could not stand; bots walk a breadth-first path ----
const CELL = 40, GW = Math.ceil(MAP.w / CELL), GH = Math.ceil(MAP.h / CELL);
const blocked = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const cx = gx * CELL + CELL / 2, cy = gy * CELL + CELL / 2;
  for (const [wx, wy, ww, wh] of WALLS) {
    const nx = clamp(cx, wx, wx + ww), ny = clamp(cy, wy, wy + wh);
    if ((cx - nx) ** 2 + (cy - ny) ** 2 < (R.RADIUS + 8) ** 2) { blocked[gy * GW + gx] = 1; break; }
  }
}
const cellOf = (x, y) => [clamp(Math.floor(x / CELL), 0, GW - 1), clamp(Math.floor(y / CELL), 0, GH - 1)];
/** the nearest free cell to (gx, gy): a bot or a target standing close to a wall still gets a path */
function freeCell(gx, gy) {
  if (!blocked[gy * GW + gx]) return [gx, gy];
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = gx + dx, y = gy + dy;
    if (x >= 0 && y >= 0 && x < GW && y < GH && !blocked[y * GW + x]) return [x, y];
  }
  return [gx, gy];
}
/** waypoints (cell centres) from (x1, y1) to (x2, y2), or [] when nothing is found */
export function navPath(x1, y1, x2, y2) {
  const [sx, sy] = freeCell(...cellOf(x1, y1)), [tx, ty] = freeCell(...cellOf(x2, y2));
  const start = sy * GW + sx, goal = ty * GW + tx;
  const prev = new Int32Array(GW * GH).fill(-1); prev[start] = start;
  const q = [start];
  // a different order of neighbours each time gives a different one of the equally short routes, so a team does not all take the same lane
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].sort(() => Math.random() - 0.5);
  for (let qi = 0; qi < q.length && prev[goal] < 0; qi++) {
    const c = q[qi], cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || blocked[ny * GW + nx] || prev[ny * GW + nx] >= 0) continue;
      if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;   // no cutting a corner
      prev[ny * GW + nx] = c; q.push(ny * GW + nx);
    }
  }
  if (prev[goal] < 0) return [];
  const out = [];
  for (let c = goal; c !== start; c = prev[c]) out.push([(c % GW) * CELL + CELL / 2, ((c / GW) | 0) * CELL + CELL / 2]);
  return out.reverse();
}

/** the stats of a loadout (unknown or missing parts fall back to the free items) */
export function statsOf(l = {}) {
  const weapon = WEAPONS[l.weapon] ? l.weapon : FREE.weapon, armor = ARMOR[l.armor] ? l.armor : FREE.armor, boots = BOOTS[l.boots] ? l.boots : FREE.boots;
  return { weapon, armor, boots, camo: typeof l.camo === 'string' ? l.camo : FREE.camo, hpMax: ARMOR[armor].hp, speedMul: ARMOR[armor].speed * BOOTS[boots].speed };
}
export const cleanName = (v) => String(v ?? '').replace(/[^A-Za-z0-9 ]/g, '').replace(/ +/g, ' ').trim().slice(0, 12);
export const cleanColor = (v) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : 0xb6ff00);
export const cleanSkin = (v) => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : 0);

export class Match {
  /** teams: two { name, color }; perSide: seats per team (humans and bots together) */
  constructor({ teams, perSide = 8, bots = true }) {
    this.teams = teams; this.perSide = Math.max(1, Math.min(32, perSide)); this.useBots = bots;
    this.players = new Map(); this.bullets = []; this.nextId = 1;
    this.score = [0, 0]; this.round = 0; this.phase = 'lobby'; this.timer = 6; this.winner = null; this.roundWinner = null;
    this.events = []; this.rv = 0;   // rv counts every change of who is in the match, so the room knows when to send the roster again
  }

  humans(team) { return [...this.players.values()].filter((p) => !p.bot && p.team === team).length; }
  count(team) { return [...this.players.values()].filter((p) => p.team === team).length; }

  /** the seat for a joining human: the asked team if it has room, else the other, else none */
  chooseTeam(asked) {
    const order = asked === 0 || asked === 1 ? [asked, 1 - asked] : (this.humans(0) <= this.humans(1) ? [0, 1] : [1, 0]);
    for (const t of order) if (this.humans(t) < this.perSide) return t;
    return -1;
  }

  addPlayer(sid, { name, team, loadout }) {
    const t = this.chooseTeam(team);
    if (t < 0) return null;
    // a human takes a bot's seat
    const bot = [...this.players.values()].find((p) => p.bot && p.team === t);
    if (bot) this.players.delete(bot.id);
    this.rv++;
    const p = this.makePlayer(sid, t, cleanName(name) || 'Player', loadout, false);
    this.players.set(sid, p);
    this.spawn(p);
    return p;
  }

  removePlayer(sid) { this.players.delete(sid); this.rv++; }

  makePlayer(id, team, name, loadout, bot) {
    const st = statsOf(loadout);
    return { id, team, name, ...st, bot, x: 0, y: 0, aim: team === 0 ? 0 : Math.PI, hp: st.hpMax, alive: false, kills: 0, cd: 0, input: { dx: 0, dy: 0, aim: 0, fire: false }, brain: { retarget: 0, strafe: 1, flip: 0 } };
  }

  spawn(p) {
    const left = p.team === 0, idx = [...this.players.values()].filter((q) => q.team === p.team && q.id !== p.id).length;
    const col = Math.floor(idx / 8), row = idx % 8;
    let x = (left ? 90 : MAP.w - 90) + (left ? col * 46 : -col * 46), y = 120 + row * 106 + rnd(-14, 14);
    [x, y] = pushOut(x, y);
    Object.assign(p, { x, y, hp: p.hpMax, alive: true, cd: 0, aim: left ? 0 : Math.PI });
  }

  fillBots() {
    if (!this.useBots) return;
    for (const t of [0, 1]) {
      while (this.count(t) < this.perSide) {
        const id = `bot${this.nextId++}`;
        const gear = { weapon: Object.keys(WEAPONS)[(this.nextId * 7) % 5], armor: Object.keys(ARMOR)[this.nextId % 3], boots: Object.keys(BOOTS)[(this.nextId + 1) % 3], camo: ['woodland', 'desert', 'arctic', 'night', 'toxic'][this.nextId % 5] };
        const p = this.makePlayer(id, t, ['Rex', 'Nova', 'Bolt', 'Kilo', 'Zed', 'Echo', 'Ghost', 'Viper', 'Rook', 'Axel', 'Dusk', 'Lynx'][this.nextId % 12], gear, true);
        this.players.set(id, p); this.rv++;
        if (this.phase === 'live') { p.alive = false; } else this.spawn(p);
      }
    }
  }

  startRound() {
    this.round += 1; this.phase = 'countdown'; this.timer = 3; this.bullets = []; this.roundWinner = null;
    this.fillBots();
    for (const t of [0, 1]) { let i = 0; for (const p of this.players.values()) if (p.team === t) { p.slot = i++; } }
    for (const p of this.players.values()) this.spawn(p);
    this.events.push({ type: 'round', n: this.round });
  }

  aliveCount(team) { let n = 0; for (const p of this.players.values()) if (p.team === team && p.alive) n++; return n; }

  endRound(winner) {
    this.phase = 'roundover'; this.timer = 4; this.roundWinner = winner;
    if (winner === 0 || winner === 1) this.score[winner] += 1;
    if (this.score[0] >= R.WIN_ROUNDS || this.score[1] >= R.WIN_ROUNDS) { this.phase = 'matchover'; this.timer = 10; this.winner = this.score[0] >= R.WIN_ROUNDS ? 0 : 1; this.events.push({ type: 'match', winner: this.winner }); }
    else this.events.push({ type: 'roundEnd', winner });
  }

  restartMatch() { this.score = [0, 0]; this.round = 0; this.winner = null; for (const p of this.players.values()) p.kills = 0; this.startRound(); }

  /** one step of `dt` seconds */
  step(dt) {
    this.events = [];
    if (this.phase === 'lobby') {
      this.timer -= dt;
      if (this.timer <= 0 && this.players.size >= 0) this.startRound();
      this.fillBots();
      return;
    }
    if (this.phase === 'countdown') { this.timer -= dt; if (this.timer <= 0) { this.phase = 'live'; this.timer = R.ROUND_SECONDS; } this.think(dt, false); return; }
    if (this.phase === 'roundover') { this.timer -= dt; this.moveBullets(dt); if (this.timer <= 0) this.startRound(); return; }
    if (this.phase === 'matchover') { this.timer -= dt; this.moveBullets(dt); if (this.timer <= 0) this.restartMatch(); return; }
    // live
    this.timer -= dt;
    this.think(dt, true);
    this.moveBullets(dt);
    const a = this.aliveCount(0), b = this.aliveCount(1);
    if (a === 0 || b === 0) this.endRound(a === b ? -1 : a > b ? 0 : 1);
    else if (this.timer <= 0) {
      // time is up: the team with more players standing, then more health, wins the round
      const hp = (t) => [...this.players.values()].filter((p) => p.team === t && p.alive).reduce((s, p) => s + p.hp, 0);
      this.endRound(a !== b ? (a > b ? 0 : 1) : hp(0) === hp(1) ? -1 : hp(0) > hp(1) ? 0 : 1);
    }
  }

  think(dt, live) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.bot) this.botBrain(p, dt);
      const inp = p.input;
      let dx = clamp(Number(inp.dx) || 0, -1, 1), dy = clamp(Number(inp.dy) || 0, -1, 1);
      const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
      if (Number.isFinite(inp.aim)) p.aim = inp.aim;
      const sp = R.SPEED * p.speedMul;
      [p.x, p.y] = pushOut(p.x + dx * sp * dt, p.y + dy * sp * dt);
      p.cd = Math.max(0, p.cd - dt);
      if (live && inp.fire && p.cd === 0) {
        const w = WEAPONS[p.weapon]; p.cd = w.gap;
        this.shoot(p, w);
      }
    }
  }

  /** a shot lands the instant it is fired (first person): each pellet is a ray that stops at the first wall or enemy */
  shoot(p, w) {
    const range = w.speed * w.life;
    for (let i = 0; i < w.pellets; i++) {
      const a = p.aim + rnd(-w.spread, w.spread);
      let hitD = rayWall(p.x, p.y, a, range), hit = null;
      for (const q of this.players.values()) {
        if (!q.alive || q.team === p.team) continue;
        const d = rayCircle(p.x, p.y, a, q.x, q.y, R.RADIUS + 3);
        if (d < hitD) { hitD = d; hit = q; }
      }
      const ex = p.x + Math.cos(a) * hitD, ey = p.y + Math.sin(a) * hitD;
      this.events.push({ type: 'shot', by: p.id, x: p.x, y: p.y, ex, ey, hit: hit ? 1 : 0 });
      if (!hit) continue;
      hit.hp -= w.dmg;
      if (hit.hp <= 0) { hit.alive = false; p.kills += 1; this.events.push({ type: 'kill', by: p.id, victim: hit.id, x: hit.x, y: hit.y }); }
      else this.events.push({ type: 'hit', by: p.id, victim: hit.id, x: ex, y: ey });
    }
  }

  botBrain(p, dt) {
    const b = p.brain; b.retarget -= dt; b.flip -= dt; b.pathAt = (b.pathAt ?? 0) - dt;
    if (b.flip <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.flip = rnd(0.6, 1.8); }
    let target = null, best = Infinity;
    if (b.retarget <= 0 || !b.target || !this.players.get(b.target)?.alive) {
      for (const q of this.players.values()) { if (q.team === p.team || !q.alive) continue; const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < best) { best = d; target = q; } }
      b.target = target?.id ?? null; b.retarget = rnd(0.5, 1.2);
    }
    target = b.target ? this.players.get(b.target) : null;
    const inp = p.input; inp.fire = false; inp.dx = 0; inp.dy = 0;
    if (!target) return;
    const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const see = clearLine(p.x, p.y, target.x, target.y);
    // a little aiming error that shrinks as it gets closer, so they hit but not always
    inp.aim = ang + rnd(-0.2, 0.2) * (0.35 + d / 400);
    if (d > 300 || !see) {
      // walk the path round the walls (re-found every so often, or when the old one is used up)
      if (!b.path || b.path.length === 0 || b.pathAt <= 0) { b.path = navPath(p.x, p.y, target.x, target.y); b.pathAt = rnd(0.5, 1.0); }
      while (b.path.length > 1 && Math.hypot(b.path[0][0] - p.x, b.path[0][1] - p.y) < 26) b.path.shift();
      const wp = b.path[0] || [target.x, target.y], wa = Math.atan2(wp[1] - p.y, wp[0] - p.x);
      inp.dx = Math.cos(wa); inp.dy = Math.sin(wa);
      if (!see) inp.aim = wa;
    } else { inp.dx = -Math.sin(ang) * b.strafe; inp.dy = Math.cos(ang) * b.strafe; }
    // bots keep apart from their own team-mates (and take a little sideways drift of their own), so a team spreads over the map
    for (const q of this.players.values()) {
      if (q === p || !q.alive || q.team !== p.team) continue;
      const ox = p.x - q.x, oy = p.y - q.y, od = Math.hypot(ox, oy);
      if (od > 0 && od < 55) { inp.dx += (ox / od) * (55 - od) / 28; inp.dy += (oy / od) * (55 - od) / 28; }
    }
    inp.dx *= 0.9; inp.dy *= 0.9;
    if (see && d < 400 && Math.random() < 0.5) inp.fire = true;
  }

  moveBullets(dt) {
    const keep = [];
    for (const bl of this.bullets) {
      bl.life -= dt;
      const nx = bl.x + bl.vx * dt, ny = bl.y + bl.vy * dt;
      let dead = bl.life <= 0 || !clearLine(bl.x, bl.y, nx, ny);
      if (!dead) {
        for (const p of this.players.values()) {
          if (!p.alive || p.team === bl.team) continue;
          if ((p.x - nx) ** 2 + (p.y - ny) ** 2 < (R.RADIUS + 3) ** 2) {
            p.hp -= bl.dmg ?? R.DAMAGE; dead = true;
            if (p.hp <= 0) { p.alive = false; const o = this.players.get(bl.owner); if (o) o.kills += 1; this.events.push({ type: 'kill', by: bl.owner, victim: p.id, x: p.x, y: p.y }); }
            else this.events.push({ type: 'hit', x: nx, y: ny });
            break;
          }
        }
      }
      bl.x = nx; bl.y = ny;
      if (!dead) keep.push(bl);
    }
    this.bullets = keep;
  }

  snapshot() {
    return {
      ph: this.phase, tm: Math.max(0, Math.ceil(this.timer)), r: this.round, sc: this.score, rw: this.roundWinner, w: this.winner,
      al: [this.aliveCount(0), this.aliveCount(1)], n: [this.count(0), this.count(1)],
      p: [...this.players.values()].map((p) => [p.id, p.team, Math.round(p.x), Math.round(p.y), +p.aim.toFixed(2), p.hp, p.alive ? 1 : 0, p.kills, p.bot ? 1 : 0]),
      b: this.bullets.map((b) => [Math.round(b.x), Math.round(b.y), b.team, Math.round(b.vx), Math.round(b.vy)]),
      ev: this.events,
    };
  }

  roster() { return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, weapon: p.weapon, armor: p.armor, camo: p.camo, hpMax: p.hpMax, team: p.team, bot: p.bot })); }
}
