// A match played on the server, shaped like the local Match so the page draws it the same way. The server runs the rules; this holds the
// latest snapshot as soldiers (the same objects frame after frame, so the page can keep its own references), the roster that names them,
// and the events that arrived since the page last looked. step() does nothing: nobody simulates here.
import { MAPS } from '../../server/game.js';
import { WEAPONS } from '../../server/items.js';
import { Recoil, feelOf } from '../../server/gunfeel.js';

const blank = () => ({ dx: 0, dy: 0, aim: 0, pitch: 0, fire: false, nade: false, reload: false, sprint: false, jump: false, melee: false, swap: false, use: false, ads: false });

/** a thing on the floor, from the short form that goes over the wire */
const floorItem = (w) => ({ id: w.id, kind: w.k, x: w.x, y: w.y, z: w.z, weapon: w.w });

export class NetMatch {
  constructor(hello, teams) {
    this.teams = teams;
    this.meId = hello.id;
    this.pull = -1e9;
    this.map = MAPS[hello.map] || MAPS.cargo;
    this.mode = hello.mode === 'challenge' ? 'challenge' : 'practice';
    this.objective = hello.objective === 'zone' ? 'zone' : hello.objective === 'dm' ? 'dm' : 'elim'; this.minutes = hello.minutes || 5; this.overtime = false;
    this.perSide = hello.perSide;
    this.players = new Map();
    this.nades = [];
    this.pickups = { list: [] };      // what lies on the floor: boxes, kits and dropped guns (the same shape the local rules keep)
    this.events = [];
    this.score = [0, 0]; this.round = 0; this.timer = 0; this.phase = 'lobby'; this.winner = null;
    this.zoneP = [0, 0]; this.zoneIn = [false, false]; this.uav = [0, 0];
    this.alive = [0, 0];
    this.ready = false;
    this.roster = new Map();
    this.setRoster(hello.roster || []);
  }

  setRoster(list) {
    this.roster = new Map(list.map((r) => [r.id, r]));
    for (const [id, p] of this.players) if (!this.roster.has(id)) this.players.delete(id);
    for (const p of this.players.values()) this.dress(p, this.roster.get(p.id));
  }

  /** what the roster knows about a soldier: the name, build and gear that do not change from one snapshot to the next */
  dress(p, r) {
    if (!r) return;
    p.name = r.name; p.bot = !!r.bot; p.team = r.team; p.hpMax = r.hpMax || 100; p.primary = r.primary; p.camo = r.camo; p.armor = r.armor;
    p.magMul = r.magMul || 1; p.reloadMul = r.reloadMul || 1; p.zoomMul = r.zoomMul || 1; p.steady = r.steady || 0; p.recoilMul = r.recoilMul || 1;
  }

  aliveCount(t) { return this.alive[t] ?? 0; }
  step() { /* the server steps the rules */ }
  /** the page takes the events that arrived since its last look */
  takeEvents() { const e = this.events; this.events = []; return e; }
  push(e, now = performance.now()) {
    // your own recoil is replayed here from your own shots, with the same rules the server runs (a shotgun's pellets are one pull)
    if (e.type === 'shot' && e.by === this.meId) {
      const me = this.players.get(this.meId);
      if (me && me.rc && !((WEAPONS[me.weapon]?.pellets ?? 1) > 1 && now - this.pull < 25)) me.rc.shot(me.weapon, me.ads, me.recoilMul || 1);
      this.pull = now;
    }
    if (e.type === 'pk+') { if (!this.pickups.list.some((q) => q.id === e.id)) this.pickups.list.push(floorItem(e)); return; }
    if (e.type === 'pk-') { this.pickups.list = this.pickups.list.filter((q) => q.id !== e.id); return; }
    if (this.events.length < 400) this.events.push(e);
  }
  /** time passes for you: the sights come up or go down, and the recoil settles */
  tick(dt) {
    const me = this.players.get(this.meId);
    if (!me || !me.rc) return;
    const ft = feelOf(me.weapon), want = !!me.input?.ads && !me.sprinting && !(me.rl > 0) && me.alive;
    me.ads = Math.max(0, Math.min(1, me.ads + (want ? 1 : -1) * dt / ft.ads.t));
    me.rc.step(dt, me.weapon);
  }

  /** one snapshot, as net.js places it for this frame */
  apply(s, now = performance.now()) {
    this.mode = s.mode === 'challenge' ? 'challenge' : 'practice';
    this.objective = s.obj === 'zone' ? 'zone' : s.obj === 'dm' ? 'dm' : 'elim'; this.overtime = s.ot === 1; if (s.mn) this.minutes = s.mn;
    this.phase = s.ph; this.round = s.r; this.score = s.sc; this.timer = s.tm; this.winner = s.w;
    this.uav = s.uv || [0, 0]; this.alive = s.al || [0, 0];
    const zn = s.zn;
    if (zn) { this.zoneP = [zn[4], zn[5]]; this.zoneIn = [!!zn[6], !!zn[7]]; } else { this.zoneP = [0, 0]; this.zoneIn = [false, false]; }
    if (Array.isArray(s.pk)) this.pickups.list = s.pk.map(floorItem);
    this.nades = (s.g || []).map((n) => ({ id: n[0], x: n[1], y: n[2], z: n[3] }));
    const seen = new Set();
    for (const row of s.p) {
      seen.add(row[0]);
      let p = this.players.get(row[0]);
      if (!p) { p = { id: row[0], name: 'Player', input: blank(), rlSince: 0, hpMax: 100, rl: 0, reloadTime: 1.5, magSize: 12, sprinting: false, slot: 0, speedMul: 1, rc: new Recoil(), ads: 0 }; this.players.set(row[0], p); this.dress(p, this.roster.get(row[0])); }
      const wasAlive = p.alive;
      p.team = row[1]; p.x = row[2]; p.y = row[3]; p.aim = row[4]; p.hp = row[5]; p.alive = row[6] === 1; if (p.alive && wasAlive === false) { p.rc = new Recoil(); p.ads = 0; } p.kills = row[7]; p.bot = row[8] === 1;
      p.z = row[9]; p.pitch = row[10]; p.grenades = row[11]; p.ammo = row[12]; p.deaths = row[14]; p.boost = row[16] === 1; p.reserve = row[17] ?? 0;
      if (row[15] !== p.weapon) {
        p.weapon = row[15] || 'pistol';
        const w = WEAPONS[p.weapon] || WEAPONS.pistol;
        p.slot = p.weapon === p.primary ? 0 : 1;
        p.magSize = Math.max(1, Math.round(w.mag * p.magMul));
        p.reloadTime = w.reload * p.reloadMul;
      }
      if (row[13] === 1) { if (!p.rlSince) p.rlSince = now; p.rl = Math.max(0.02, p.reloadTime * (p.boost ? 0.5 : 1) - (now - p.rlSince) / 1000); } else { p.rlSince = 0; p.rl = 0; }
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
    this.ready = true;
  }
}
