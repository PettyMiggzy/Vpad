// The arena rules, with no network code in them so they can be tested on their own: two teams (one per token), a map with walls, ramps and
// high decks, hitscan shooting (head, body, cover you can shoot over), grenades, bots that fill empty seats, and rounds (first to two takes the match).
// Positions are pixels (50 to the metre), heights are metres.
import { WEAPONS, ARMOR, BOOTS, FREE, GRENADE } from './items.js';
import { MAPS, STEP } from './maps.js';
export { MAPS };
// the retired top-down client still reads the flat wall list of the first map
export const MAP = { w: MAPS.cargo.w, h: MAPS.cargo.h };
export const WALLS = MAPS.cargo.solids.map((s) => [s.x, s.y, s.w, s.h]);
const M = 50;
export const R = { RADIUS: 15, SPEED: 200, HP: 100, ROUND_SECONDS: 120, WIN_ROUNDS: 2, EYE: 1.6, BODY: 1.85, HEAD: 1.68, DROP: 1.3, FALL: 12, GRAV: 15 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const inRect = (x, y, s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h;

/** the floor under a point: the highest of the ground, any roof or deck, and any ramp */
export function floorAt(map, x, y) {
  let f = 0;
  for (const s of map.solids) if (s.walk && s.top > f && inRect(x, y, s)) f = s.top;
  for (const r of map.ramps) {
    if (!inRect(x, y, r)) continue;
    const t = r.axis === 'x+' ? (x - r.x) / r.w : r.axis === 'x-' ? 1 - (x - r.x) / r.w : r.axis === 'y+' ? (y - r.y) / r.h : 1 - (y - r.y) / r.h;
    const h = r.from + (r.to - r.from) * clamp(t, 0, 1);
    if (h > f) f = h;
  }
  return f;
}

/** push a circle at height z out of every solid that stands higher than a step above it; stays inside the map */
export function pushOut(map, x, y, z = 0, r = R.RADIUS) {
  for (const s of map.solids) {
    if (s.top <= z + STEP) continue;
    const cx = clamp(x, s.x, s.x + s.w), cy = clamp(y, s.y, s.y + s.h);
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) {
        const left = x - s.x, right = s.x + s.w - x, up = y - s.y, down = s.y + s.h - y, m = Math.min(left, right, up, down);
        if (m === left) x = s.x - r; else if (m === right) x = s.x + s.w + r; else if (m === up) y = s.y - r; else y = s.y + s.h + r;
      } else { const d = Math.sqrt(d2); x = cx + (dx / d) * r; y = cy + (dy / d) * r; }
    }
  }
  return [clamp(x, r, map.w - r), clamp(y, r, map.h - r)];
}

/** a move from (x, y, z) to (nx, ny): allowed unless it climbs more than a step or drops off a ledge; slides along what blocks it */
export function tryMove(map, x, y, z, nx, ny) {
  for (const [tx, ty] of [[nx, ny], [nx, y], [x, ny]]) {
    const [px, py] = pushOut(map, tx, ty, z);
    const f = floorAt(map, px, py);
    if (f - z > STEP || z - f > R.DROP) continue;
    return [px, py, f];
  }
  return [x, y, z];
}

/** where a ray first meets a solid: from (ox, oy) at height oz, along the unit direction (dx, dy), rising `slope` metres per pixel; up to `max` pixels */
export function raySolids(map, ox, oy, oz, dx, dy, slope, max) {
  let best = max;
  for (const s of map.solids) {
    if (inRect(ox, oy, s)) continue;               // a roof or a deck you stand on never blocks your own shots
    let t0 = 0, t1 = best, miss = false;
    for (const [o, d, lo, hi] of [[ox, dx, s.x, s.x + s.w], [oy, dy, s.y, s.y + s.h]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { miss = true; break; } continue; }
      let a1 = (lo - o) / d, a2 = (hi - o) / d;
      if (a1 > a2) [a1, a2] = [a2, a1];
      t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
      if (t0 > t1) { miss = true; break; }
    }
    if (miss || t0 >= best) continue;
    if (Math.min(oz + slope * t0, oz + slope * t1) < s.top) best = t0;     // the ray is below the top of it somewhere inside it
  }
  if (slope < 0) best = Math.min(best, -oz / slope);   // the ground
  return best;
}

/** where a ray first meets a circle (centre cx, cy, radius r), or Infinity when it misses */
export function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = cx - ox, fy = cy - oy, t = fx * dx + fy * dy;
  if (t < 0) return Infinity;
  const d2 = fx * fx + fy * fy - t * t;
  if (d2 > r * r) return Infinity;
  return Math.max(0, t - Math.sqrt(r * r - d2));
}

/** is there a clear line between two points (heights in metres)? */
export function clearLine(map, x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d < 1) return true;
  return raySolids(map, x1, y1, z1, dx / d, dy / d, (z2 - z1) / d, d) >= d - 1;
}

// ---- navigation: a coarse grid with the floor height of each cell; bots walk a breadth-first path that never steps up or off more than a step ----
const CELL = 40;
function nav(map) {
  if (map._nav) return map._nav;
  const GW = Math.ceil(map.w / CELL), GH = Math.ceil(map.h / CELL);
  const floor = new Float32Array(GW * GH), blocked = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const cx = gx * CELL + CELL / 2, cy = gy * CELL + CELL / 2;
    // a cell centre can sit exactly on the edge of a deck or ramp: take the highest floor within a pixel of it
    const f = Math.max(floorAt(map, cx - 1, cy - 1), floorAt(map, cx + 1, cy - 1), floorAt(map, cx - 1, cy + 1), floorAt(map, cx + 1, cy + 1));
    floor[gy * GW + gx] = f;
    const [px, py] = pushOut(map, cx, cy, f, R.RADIUS + 8);
    if (Math.abs(px - cx) > 0.5 || Math.abs(py - cy) > 0.5) blocked[gy * GW + gx] = 1;
  }
  return (map._nav = { GW, GH, floor, blocked });
}
const cellOf = (n, x, y) => [clamp(Math.floor(x / CELL), 0, n.GW - 1), clamp(Math.floor(y / CELL), 0, n.GH - 1)];
function freeCell(n, gx, gy, f) {
  const ok = (x, y) => x >= 0 && y >= 0 && x < n.GW && y < n.GH && !n.blocked[y * n.GW + x] && Math.abs(n.floor[y * n.GW + x] - f) <= STEP;
  if (ok(gx, gy)) return [gx, gy];
  for (let r = 1; r < 7; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ok(gx + dx, gy + dy)) return [gx + dx, gy + dy];
  return [gx, gy];
}
/** waypoints (cell centres) from a point to another, or [] when nothing is found; z1 and z2 are the floors the two stand on */
export function navPath(map, x1, y1, z1, x2, y2, z2) {
  const n = nav(map), { GW, GH, floor, blocked } = n;
  const [sx, sy] = freeCell(n, ...cellOf(n, x1, y1), z1), [tx, ty] = freeCell(n, ...cellOf(n, x2, y2), z2);
  const start = sy * GW + sx, goal = ty * GW + tx;
  const prev = new Int32Array(GW * GH).fill(-1); prev[start] = start;
  const q = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].sort(() => Math.random() - 0.5);
  for (let qi = 0; qi < q.length && prev[goal] < 0; qi++) {
    const c = q[qi], cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx;
      if (blocked[ni] || prev[ni] >= 0 || Math.abs(floor[ni] - floor[c]) > STEP * 0.8) continue;
      if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;
      prev[ni] = c; q.push(ni);
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
  /** teams: two { name, color }; perSide: seats per team (humans and bots together); map: an id or a map */
  constructor({ teams, perSide = 8, bots = true, map = 'cargo' }) {
    this.map = typeof map === 'string' ? (MAPS[map] || MAPS.cargo) : map;
    this.teams = teams; this.perSide = Math.max(1, Math.min(32, perSide)); this.useBots = bots;
    this.players = new Map(); this.nades = []; this.nextId = 1;
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
    const bot = [...this.players.values()].find((p) => p.bot && p.team === t);   // a human takes a bot's seat
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
    return { id, team, name, ...st, bot, x: 0, y: 0, z: 0, aim: team === 0 ? 0 : Math.PI, pitch: 0, hp: st.hpMax, alive: false, kills: 0, cd: 0, grenades: GRENADE.count, nadeCd: 0,
      input: { dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, nade: false }, brain: { retarget: 0, strafe: 1, flip: 0 } };
  }

  spawn(p) {
    const list = this.map.spawns[p.team], idx = [...this.players.values()].filter((q) => q.team === p.team && q.id !== p.id && q.alive).length;
    const sp = list[idx % list.length] || [this.map.w / 2, this.map.h / 2];
    let x = sp[0] + rnd(-12, 12), y = sp[1] + rnd(-12, 12);
    [x, y] = pushOut(this.map, x, y, 0);
    Object.assign(p, { x, y, z: floorAt(this.map, x, y), hp: p.hpMax, alive: true, cd: 0, nadeCd: 0, grenades: GRENADE.count, aim: p.team === 0 ? 0 : Math.PI, pitch: 0 });
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
    this.round += 1; this.phase = 'countdown'; this.timer = 3; this.nades = []; this.roundWinner = null;
    this.fillBots();
    for (const p of this.players.values()) { p.brain.perch = null; p.alive = false; }
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
    if (this.phase === 'roundover') { this.timer -= dt; this.moveNades(dt); if (this.timer <= 0) this.startRound(); return; }
    if (this.phase === 'matchover') { this.timer -= dt; this.moveNades(dt); if (this.timer <= 0) this.restartMatch(); return; }
    // live
    this.timer -= dt;
    this.think(dt, true);
    this.moveNades(dt);
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
      if (Number.isFinite(inp.pitch)) p.pitch = clamp(inp.pitch, -1.4, 1.4);
      const sp = R.SPEED * p.speedMul;
      const [nx, ny, f] = tryMove(this.map, p.x, p.y, p.z, p.x + dx * sp * dt, p.y + dy * sp * dt);
      p.x = nx; p.y = ny; p.z = f >= p.z ? f : Math.max(f, p.z - R.FALL * dt);
      p.cd = Math.max(0, p.cd - dt); p.nadeCd = Math.max(0, p.nadeCd - dt);
      if (live && inp.fire && p.cd === 0) { const w = WEAPONS[p.weapon]; p.cd = w.gap; this.shoot(p, w); }
      if (live && inp.nade && p.nadeCd === 0 && p.grenades > 0) { p.grenades -= 1; p.nadeCd = 1.0; this.throwNade(p); inp.nade = false; }
    }
  }

  /** a shot lands the instant it is fired: each pellet is a ray that stops at the first solid, the ground or an enemy (head, body) */
  shoot(p, w) {
    const range = w.range ?? w.speed * w.life, eye = p.z + R.EYE;
    for (let i = 0; i < w.pellets; i++) {
      const a = p.aim + rnd(-w.spread, w.spread), pt = p.pitch + rnd(-w.spread, w.spread) * 0.7;
      const dx = Math.cos(a), dy = Math.sin(a), slope = Math.tan(pt) / M;
      let hitD = raySolids(this.map, p.x, p.y, eye, dx, dy, slope, range), hit = null, head = false;
      for (const q of this.players.values()) {
        if (!q.alive || q.team === p.team) continue;
        const d = rayCircle(p.x, p.y, dx, dy, q.x, q.y, R.RADIUS + 3);
        if (!(d < hitD)) continue;
        const hz = eye + slope * d;
        if (hz < q.z || hz > q.z + R.BODY) continue;
        hitD = d; hit = q; head = hz >= q.z + R.HEAD;
      }
      const ex = p.x + dx * hitD, ey = p.y + dy * hitD, ez = eye + slope * hitD;
      this.events.push({ type: 'shot', by: p.id, x: p.x, y: p.y, z: eye, ex, ey, ez, hit: hit ? 1 : 0 });
      if (!hit) continue;
      hit.hp -= w.dmg * (head ? 2 : 1);
      if (hit.hp <= 0) { hit.alive = false; p.kills += 1; this.events.push({ type: 'kill', by: p.id, victim: hit.id, x: hit.x, y: hit.y, head: head ? 1 : 0 }); }
      else this.events.push({ type: 'hit', by: p.id, victim: hit.id, x: ex, y: ey, z: ez, head: head ? 1 : 0 });
    }
  }

  // ---- grenades: thrown along your aim, arc under gravity, bounce off solids and floors, burst after the fuse ----
  throwNade(p) {
    const v = GRENADE.speed * M, pt = clamp(p.pitch + 0.22, -1.2, 1.2), c = Math.cos(pt);
    const n = { x: p.x + Math.cos(p.aim) * 20, y: p.y + Math.sin(p.aim) * 20, z: p.z + R.EYE - 0.2, vx: Math.cos(p.aim) * v * c, vy: Math.sin(p.aim) * v * c, vz: Math.sin(pt) * GRENADE.speed, fuse: GRENADE.fuse, owner: p.id, team: p.team, id: this.nextId++ };
    this.nades.push(n);
    this.events.push({ type: 'nade', by: p.id, id: n.id, x: n.x, y: n.y, z: n.z });
  }

  moveNades(dt) {
    const keep = [];
    for (const n of this.nades) {
      n.fuse -= dt;
      n.vz -= R.GRAV * dt;
      let nx = n.x + n.vx * dt, ny = n.y + n.vy * dt, nz = n.z + n.vz * dt;
      for (const s of this.map.solids) {
        if (nz >= s.top || nz < 0 || !inRect(nx, ny, s)) continue;
        // it ran into the side of something: bounce off the side it came from
        const px = n.x, py = n.y, hitX = !(px > s.x && px < s.x + s.w), hitY = !(py > s.y && py < s.y + s.h);
        if (hitX || !hitY) { n.vx = -n.vx * 0.45; nx = n.x; } if (hitY) { n.vy = -n.vy * 0.45; ny = n.y; }
        if (!hitX && !hitY) { n.vx = -n.vx * 0.45; n.vy = -n.vy * 0.45; nx = n.x; ny = n.y; }
      }
      nx = clamp(nx, 4, this.map.w - 4); ny = clamp(ny, 4, this.map.h - 4);
      const f = floorAt(this.map, nx, ny);
      if (nz < f) { nz = f; if (Math.abs(n.vz) > 2.5) n.vz = -n.vz * 0.35; else n.vz = 0; n.vx *= 0.6; n.vy *= 0.6; }
      n.x = nx; n.y = ny; n.z = nz;
      if (n.fuse <= 0) this.explode(n); else keep.push(n);
    }
    this.nades = keep;
  }

  explode(n) {
    this.events.push({ type: 'boom', x: n.x, y: n.y, z: n.z });
    const owner = this.players.get(n.owner);
    for (const q of this.players.values()) {
      if (!q.alive || (q.team === n.team && q.id !== n.owner)) continue;
      const d = Math.hypot(q.x - n.x, q.y - n.y);
      if (d > GRENADE.radius) continue;
      if (!clearLine(this.map, n.x, n.y, n.z + 0.3, q.x, q.y, q.z + 1.0)) continue;
      const dz = Math.abs(q.z + 1.0 - n.z) * M, dist = Math.hypot(d, dz);
      if (dist > GRENADE.radius) continue;
      const dmg = GRENADE.dmg * (1 - dist / GRENADE.radius) * (q.id === n.owner ? 0.5 : 1);
      if (dmg < 1) continue;
      q.hp -= dmg;
      if (q.hp <= 0) { q.alive = false; if (owner && q.id !== owner.id) owner.kills += 1; this.events.push({ type: 'kill', by: n.owner, victim: q.id, x: q.x, y: q.y, nade: 1 }); }
      else this.events.push({ type: 'hit', by: n.owner, victim: q.id, x: q.x, y: q.y, z: q.z + 1, nade: 1 });
    }
  }

  botBrain(p, dt) {
    const b = p.brain; b.retarget -= dt; b.flip -= dt; b.pathAt = (b.pathAt ?? 0) - dt;
    if (b.flip <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.flip = rnd(0.6, 1.8); }
    const w = WEAPONS[p.weapon], reach = w.range ?? 1500;
    let target = null, best = Infinity;
    if (b.retarget <= 0 || !b.target || !this.players.get(b.target)?.alive) {
      for (const q of this.players.values()) { if (q.team === p.team || !q.alive) continue; const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < best) { best = d; target = q; } }
      b.target = target?.id ?? null; b.retarget = rnd(0.5, 1.2);
    }
    target = b.target ? this.players.get(b.target) : null;
    const inp = p.input; inp.fire = false; inp.dx = 0; inp.dy = 0; inp.nade = false;
    if (!target) return;
    const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const see = clearLine(this.map, p.x, p.y, p.z + R.EYE, target.x, target.y, target.z + 1.3);
    // aim at the chest with a little error that grows with distance, so they hit but not always
    const err = (0.012 + d / 60000) * (w.pellets > 1 ? 1 : 1);
    inp.aim = ang + rnd(-err, err) * 4;
    inp.pitch = Math.atan2(target.z + 1.3 - (p.z + R.EYE), d / M) + rnd(-err, err) * 3;
    // snipers head for a high deck on their own half and hold it; everyone else closes to a sensible range
    if (p.weapon === 'sniper' && !see) {
      if (!b.perch) {
        const decks = this.map.solids.filter((s) => s.walk && s.top >= 4 && (p.team === 0 ? s.x + s.w / 2 < this.map.w / 2 : s.x + s.w / 2 >= this.map.w / 2));
        const dk = decks[Math.floor(Math.random() * decks.length)];
        b.perch = dk ? [dk.x + dk.w / 2, dk.y + dk.h / 2, dk.top] : [p.x, p.y, p.z];
      }
      if (Math.hypot(b.perch[0] - p.x, b.perch[1] - p.y) > 90) {
        if (!b.path || b.path.length === 0 || b.pathAt <= 0) { b.path = navPath(this.map, p.x, p.y, p.z, b.perch[0], b.perch[1], b.perch[2]); b.pathAt = rnd(0.8, 1.4); }
        while (b.path.length > 1 && Math.hypot(b.path[0][0] - p.x, b.path[0][1] - p.y) < 26) b.path.shift();
        const wp = b.path[0] || [b.perch[0], b.perch[1]], wa = Math.atan2(wp[1] - p.y, wp[0] - p.x);
        inp.dx = Math.cos(wa) * 0.9; inp.dy = Math.sin(wa) * 0.9; inp.aim = wa; inp.pitch = 0;
        return;
      }
    }
    const stand = Math.min(reach * 0.45, 900);
    if (d > stand || !see) {
      // walk the path round the walls (re-found every so often, or when the old one is used up)
      if (!b.path || b.path.length === 0 || b.pathAt <= 0) { b.path = navPath(this.map, p.x, p.y, p.z, target.x, target.y, target.z); b.pathAt = rnd(0.5, 1.0); }
      while (b.path.length > 1 && Math.hypot(b.path[0][0] - p.x, b.path[0][1] - p.y) < 26) b.path.shift();
      const wp = b.path[0] || [target.x, target.y], wa = Math.atan2(wp[1] - p.y, wp[0] - p.x);
      inp.dx = Math.cos(wa); inp.dy = Math.sin(wa);
      if (!see) { inp.aim = wa; inp.pitch = 0; }
    } else { inp.dx = -Math.sin(ang) * b.strafe; inp.dy = Math.cos(ang) * b.strafe; }
    // bots keep apart from their own team-mates, so a team spreads over the map
    for (const q of this.players.values()) {
      if (q === p || !q.alive || q.team !== p.team) continue;
      const ox = p.x - q.x, oy = p.y - q.y, od = Math.hypot(ox, oy);
      if (od > 0 && od < 55) { inp.dx += (ox / od) * (55 - od) / 28; inp.dy += (oy / od) * (55 - od) / 28; }
    }
    inp.dx *= 0.9; inp.dy *= 0.9;
    if (see && d < reach * 0.85 && Math.random() < 0.5) inp.fire = true;
    // a grenade now and then at an enemy that is far but in sight
    if (see && d > 500 && d < 1000 && p.grenades > 0 && Math.random() < 0.0015) inp.nade = true;
  }

  snapshot() {
    return {
      ph: this.phase, tm: Math.max(0, Math.ceil(this.timer)), r: this.round, sc: this.score, rw: this.roundWinner, w: this.winner, map: this.map.id,
      al: [this.aliveCount(0), this.aliveCount(1)], n: [this.count(0), this.count(1)],
      p: [...this.players.values()].map((p) => [p.id, p.team, Math.round(p.x), Math.round(p.y), +p.aim.toFixed(2), p.hp, p.alive ? 1 : 0, p.kills, p.bot ? 1 : 0, +p.z.toFixed(2), +p.pitch.toFixed(2), p.grenades]),
      g: this.nades.map((n) => [n.id, Math.round(n.x), Math.round(n.y), +n.z.toFixed(2)]),
      ev: this.events,
    };
  }

  roster() { return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, weapon: p.weapon, armor: p.armor, camo: p.camo, hpMax: p.hpMax, team: p.team, bot: p.bot })); }
}
