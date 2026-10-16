import Phaser from 'phaser';
import { LAND, WATER, MOUNTAIN, COAST, PASS } from '../terrain.js';
import { TILE, MARGIN, noise, lushAtPx } from '../worldgen.js';
import { mountSheet } from '../ui.js';
import { ATTACK, impactMs, attackMs, flipFor } from '../anim.js';
import { mountHud, openOnboarding, confirmClaim, plannerHtml, bindPlanner, toast, openBattle, clearToasts, refreshPlanner, dropPlanner, checkStale } from '../sandboxUi.js';
import { fmtLeft } from '../sim.js';
import { tidyWars } from '../wars.js';

const DPR = () => window.__dpr || 1;

const hash = (a, b, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const KIND_NAME = { [LAND]: 'Open ground', [WATER]: 'Water', [MOUNTAIN]: 'Mountain', [COAST]: 'Coast plot', [PASS]: 'Mountain pass' };

export class MapScene extends Phaser.Scene {
  constructor() { super('map'); }

  create() {
    this.world = this.registry.get('world');
    this.sim = null; this.sbx = null; this.pick = null; this.pickGfx = null;
    this.world.wars = tidyWars(this.world.sim ? this.world.sim.currentWars() : this.world.wars);
    this.grid = this.registry.get('grid');
    const g = this.grid;
    this.px = (x) => g.toPx(x);
    this.owner = new Map();
    for (const n of this.world.nations) for (const [x, y] of n.plots) this.owner.set(`${x},${y}`, n);

    const pad = 2200;
    this.add.tileSprite(-pad, -pad, g.size + pad * 2, g.size + pad * 2, 'g_water').setOrigin(0).setTint(0x949494).setDepth(-2);
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(0);
    this.shimmer = this.add.image(0, 0, 'shimmer').setOrigin(0).setDepth(1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    this.tweens.add({ targets: this.shimmer, x: { from: -5, to: 5 }, y: { from: 3, to: -3 }, alpha: { from: 0.45, to: 0.95 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.findBattlefields();
    this.placeProps();
    this.drawTerritories();
    this.buildNations();
    this.buildWars();
    this.premiumMarks();
    this.atmosphere();
    this.cameraSetup();
    this.buildUi();
    if (this.world.sandbox) this.startSandbox();
  }

  // ---- scenery: ranges, forests, meadows, reeds and ruins, placed from the same grid and noise the ground was painted with ----
  placeProps() {
    const { R, T, kinds } = this.grid;
    const put = (key, x, y, size, byWidth = false, depth = null) => {
      const s = this.add.image(x, y, key).setOrigin(0.5, 0.92);
      s.setScale(size / (byWidth ? s.width : s.height)).setDepth(depth ?? 10 + y);
      // the wastes are scorched: greenery is dulled to dead olive, the red mesas to burnt brown
      if (/^(tree|lush|flora)/.test(key)) s.setTint(0x66705a); else if (/^mesa/.test(key)) s.setTint(0xa2806c);
      // some ranges are volcanoes: a lava glow at the crest, pulsing
      if (/^mount/.test(key) && Math.abs(Math.floor(x * 7 + y * 13)) % 4 === 0) {
        const g = this.add.image(x, y - s.displayHeight * 0.66, 'glow').setTint(0xff5a14).setAlpha(0.6).setScale(Math.max(0.5, s.displayWidth / 300)).setBlendMode(Phaser.BlendModes.ADD).setDepth((depth ?? 10 + y) + 1);
        this.tweens.add({ targets: g, alpha: 0.28, duration: 900 + (Math.abs(x) % 700), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      return s;
    };
    const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
    const terr = (x, y) => (Math.abs(x) > R || Math.abs(y) > R ? WATER : this.world.terrain(x, y));
    for (let ty = -R - 4; ty <= R + 4; ty++) {
      for (let tx = -R - 4; tx <= R + 4; tx++) {
        const inside = Math.abs(tx) <= R && Math.abs(ty) <= R;
        const cx = this.px(tx) + TILE / 2, cy = this.px(ty) + TILE / 2;
        const r1 = hash(tx, ty, 1), r2 = hash(tx, ty, 2), r3 = hash(tx, ty, 3), r4 = hash(tx, ty, 4), r5 = hash(tx, ty, 5);
        const jx = (r2 - 0.5) * TILE * 0.8, jy = (r3 - 0.5) * TILE * 0.7;
        if (!inside) {
          // decorative islets in the ocean margin (see buildGrid): a rock and a tree, nothing playable
          const kk = kinds[(ty + R + MARGIN) * T + (tx + R + MARGIN)];
          if (kk === 6) { put('rock' + pick([4, 6, 9], r4), cx + jx * 0.4, cy + 8, TILE * 0.55); if (r5 < 0.7) put('tree' + pick([0, 3, 4], r1), cx - jx * 0.3, cy + 10, TILE * 1.1); }
          continue;
        }
        const t = this.world.terrain(tx, ty);
        const owned = this.owner.has(`${tx},${ty}`);
        const nearOwned = owned || [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => this.owner.has(`${tx + dx},${ty + dy}`));
        if (this.fieldTiles.has(`${tx},${ty}`)) { if (r1 < 0.2) put(`rock${pick([2, 3, 6], r4)}`, cx + jx, cy + jy + 10, TILE * 0.4); continue; }
        const lush = lushAtPx(cx, cy);
        const forest = noise(tx * 0.31 + 11, ty * 0.31 + 4);
        const nm = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => terr(tx + dx, ty + dy) === MOUNTAIN).length;
        if (t === MOUNTAIN) {
          if (nm === 4) {
            if (r1 < 0.72) put(`mount${Math.floor(r4 * 4)}`, cx + jx * 0.7, cy + TILE * 0.42 + jy * 0.4, TILE * (2.3 + r2 * 0.9), true, 10 + cy + 30);
            if (r5 < 0.25) put(`mount${Math.floor(r1 * 4)}`, cx - jx * 0.8, cy + TILE * 0.6 + jy * 0.3, TILE * (1.6 + r3 * 0.6), true, 10 + cy + 34);
          } else {
            if (r1 < 0.34) put(`mesa${Math.floor(r4 * 5)}`, cx + jx * 0.9, cy + TILE * 0.5 + jy * 0.5, TILE * (1.7 + r2 * 1.0), true, 10 + cy + 30);
            else if (r1 < 0.5) put(`rock${pick([4, 6, 9], r4)}`, cx + jx, cy + TILE * 0.5 + jy * 0.4, TILE * (0.5 + r2 * 0.4));
            if (r5 < 0.2) put(`mount${Math.floor(r3 * 4)}`, cx + jx, cy + TILE * 0.4, TILE * 2, true, 10 + cy + 32);
          }
          if (r3 < 0.18) put(`rock${pick([4, 6, 9], r4)}`, cx - jx, cy + TILE * 0.55, TILE * 0.5);
          continue;
        }
        if (t === WATER) {
          const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terr(tx + dx, ty + dy) !== WATER);
          if (shore && r1 < 0.22) put('flora3', cx + jx, cy + jy, TILE * 0.55, false, 3);
          continue;
        }
        // land
        if (nearOwned) { if (!owned && r1 < 0.12) put(`flora${pick([7, 8, 11, 14], r4)}`, cx + jx, cy + jy + 14, TILE * 0.45); continue; }
        if (owned) { if (r1 < 0.1) put(`rock${pick([0, 1, 4, 6, 9], r4)}`, cx + jx, cy + jy + 12, TILE * 0.4); continue; }
        if (t === PASS) { if (r1 < 0.4) put(`rock${pick([4, 6, 9], r4)}`, cx + jx, cy + jy + 12, TILE * (0.45 + r2 * 0.3)); continue; }
        if (t === COAST) {
          if (r1 < 0.5) put(`flora${pick([1, 2, 9], r4)}`, cx + jx, cy + jy + 16, TILE * (0.8 + r2 * 0.4));
          else if (r1 < 0.62) put(`rock${pick([4, 6, 9, 2], r4)}`, cx + jx, cy + jy + 12, TILE * 0.45);
          continue;
        }
        const green = lush > 0.45;
        if (forest > 0.58 && r1 < 0.62) {
          const k = green ? pick(['lush0', 'lush0', 'lush2', 'lush3', 'lush4', 'lush5', 'lush1', 'tree1'], r4) : pick(['tree1', 'tree1', 'tree3', 'tree4', 'tree5', 'tree0', 'tree2'], r4);
          put(k, cx + jx, cy + jy + TILE * 0.45, TILE * (1.2 + r2 * 0.6));
          if (r5 < 0.25) put(`flora${pick([12, 5], r3)}`, cx - jx, cy + jy + 14, TILE * 0.38);
        } else if (r1 < 0.07) put(green ? pick(['lush0', 'lush2', 'lush4', 'lush5'], r4) : pick(['tree0', 'tree1', 'tree3', 'tree4'], r4), cx + jx, cy + jy + TILE * 0.4, TILE * (1.1 + r2 * 0.5));
        else if (r1 < 0.34) put(`flora${green ? pick([7, 8, 4, 10, 11, 14, 0], r4) : pick([7, 11, 14, 13], r4)}`, cx + jx, cy + jy + 14, TILE * (0.5 + r2 * 0.35));
        else if (r1 < 0.4) put(`rock${green ? pick([0, 4, 6, 9], r4) : pick([0, 1, 4, 6, 9], r4)}`, cx + jx, cy + jy + 12, TILE * (0.4 + r2 * 0.3));
        else if (r1 < 0.43 && !green) put(`rock${pick([5, 7, 8], r4)}`, cx + jx, cy + jy + TILE * 0.35, TILE * 0.95);
        else if (r1 < 0.45) put(`flora${pick([5, 12, 6], r4)}`, cx + jx, cy + jy + 14, TILE * 0.5);
        else if (r1 < 0.455) put('rock2', cx + jx, cy + jy + 8, TILE * 0.35);
        else if (r1 < 0.465) put('rock3', cx + jx, cy + jy + 14, TILE * 0.6);
        else if (r1 < 0.478) put(`ruin${Math.floor(r4 * 6)}`, cx + jx * 0.5, cy + TILE * 0.35, TILE * (Math.floor(r4 * 6) === 5 ? 1.8 : Math.floor(r4 * 6) === 2 ? 1.1 : 1.3));
      }
    }
  }

  smoke(x, y) {
    const e = this.add.particles(x, y, 'glow', { speedY: { min: -26, max: -14 }, speedX: { min: -5, max: 5 }, scale: { start: 0.08, end: 0.4 }, alpha: { start: 0.35, end: 0 }, lifespan: 2400, frequency: 300, tint: 0x9a8f88 });
    e.setDepth(9000);
  }

  drawTerritories() {
    const gfx = this.add.graphics().setDepth(5);
    const edge = this.add.graphics().setDepth(6);
    for (const n of this.world.nations) {
      const has = (x, y) => this.owner.get(`${x},${y}`) === n;
      for (const [x, y] of n.plots) {
        const X = this.px(x), Y = this.px(y);
        gfx.fillStyle(n.color, 0.2).fillRect(X, Y, TILE, TILE);
        const sides = [[0, -1, X, Y, X + TILE, Y], [0, 1, X, Y + TILE, X + TILE, Y + TILE], [-1, 0, X, Y, X, Y + TILE], [1, 0, X + TILE, Y, X + TILE, Y + TILE]];
        for (const [dx, dy, x1, y1, x2, y2] of sides) {
          if (has(x + dx, y + dy)) continue;
          edge.lineStyle(9, n.color, 0.18).lineBetween(x1, y1, x2, y2);
          edge.lineStyle(3, n.color, 1).lineBetween(x1, y1, x2, y2);
        }
      }
    }
  }

  // ---- nations: capital hall, flag, label, buildings on other plots, wandering units ----
  // ---- nations: a settlement laid out around the capital plot (hall in the middle, towers at the corners, walls along the front),
  // barracks and vault on the next plots, tents and a campfire on the rest, and the army on a parade ground in front ----
  buildNations() {
    this.walkers = [];
    this.labels = [];
    this.nationObjects = new Map();
    const T = TILE;
    for (const n of this.world.nations) {
      const objs = [];
      const [cx, cy] = n.plots[0];
      const X = this.px(cx) + T / 2, Y = this.px(cy) + T / 2;
      const D = (y) => 2000 + y;
      const placed = [];
      const hallHit = (px, py) => Math.abs(px - X) < T * 0.6 && py > Y - T * 0.5 && py < Y + T * 0.8;
      const put = (key, x, y, w, depth = null, force = false, home = null) => {
        // a piece stands on open land, clear of the hall and of the pieces already placed: if its exact spot is water, mountain or taken,
        // it moves to the nearest free spot on a ring around it, never to a place where it would hide behind the hall
        if (!force) {
          const free = (px, py) => this.landPoint(px, py - 4) && !hallHit(px, py) && !placed.some(([qx, qy]) => Math.hypot(qx - px, (qy - py) * 1.6) < T * 0.34);
          if (!free(x, y)) {
            let spot = null;
            for (const r of [0.25, 0.5, 0.75, 1.0]) {
              for (let k = 0; k < 8 && !spot; k++) {
                const ang = (k / 8) * Math.PI * 2, nx = x + Math.cos(ang) * r * T, ny = y + Math.sin(ang) * r * T * 0.7;
                if (free(nx, ny)) spot = [nx, ny];
              }
              if (spot) break;
            }
            if (!spot && home) spot = [home[0], home[1]];
            if (!spot) {   // no open ground nearby: beside the hall, on the first of a few spots nothing stands on yet
              const side = x >= X ? 1 : -1, apart = (px, py) => !placed.some(([qx, qy]) => Math.hypot(qx - px, (qy - py) * 1.6) < T * 0.34);
              const beside = [side, -side].flatMap((sd) => [[0.95, 0.55], [0.95, 0.95], [1.25, 0.55], [0.95, 0.15], [1.25, 0.95], [1.25, 0.15]].map(([dx, dy]) => [X + sd * T * dx, Y + T * dy]));
              spot = beside.find(([px, py]) => apart(px, py) && this.landPoint(px, py - 4)) || beside.find(([px, py]) => this.landPoint(px, py - 4)) || beside.find(([px, py]) => apart(px, py)) || beside[0];
            }
            [x, y] = spot;
          }
        }
        placed.push([x, y]);
        const s = this.add.image(x, y, key).setOrigin(0.5, 1);
        s.setScale(w / s.width).setDepth(depth ?? D(y));
        objs.push(s);
        return s;
      };
      // a swept dirt yard under the compound, so it sits on the ground instead of floating
      const yard = this.add.graphics().setDepth(6);
      const yy = this.landPoint(X, Y + T * 0.95) ? Y + T * 0.55 : Y + T * 0.1, yh = this.landPoint(X, Y + T * 0.95) ? T * 1.5 : T * 0.9;
      // the yard is built from overlapping patches and only where there is land under them, so on a coast it never hangs over the sea
      for (let u = -1; u <= 1; u += 0.5) for (const v of [-0.25, 0.25]) {
        const px = X + u * T * 0.95, py = yy + v * yh;
        if (!this.landPoint(px, py) || !this.landPoint(px + Math.sign(u || 1) * T * 0.3, py)) continue;
        yard.fillStyle(0x6b5238, 0.55).fillEllipse(px, py, T * 0.95, yh * 0.62);
        yard.fillStyle(n.color, 0.1).fillEllipse(px, py, T * 0.95, yh * 0.62);
      }
      objs.push(yard);
      // capital glow so it reads from far away
      const glow = this.add.image(X, Y, 'glow').setTint(n.color).setAlpha(0.4).setScale(T * 2.2 / 128).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
      this.tweens.add({ targets: glow, alpha: 0.15, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      objs.push(glow);
      // the front gate with a wall either side, then towers at the corners: one piece for each wall and tower the nation has built
      const wallAt = [[0, 1.02, 'b_gate', 0.8], [-0.78, 0.98, 'b_wall', 0.72], [0.78, 0.98, 'b_wall', 0.72]];
      for (let i = 0; i < Math.min(3, n.wall); i++) put(wallAt[i][2], X + wallAt[i][0] * T, Y + wallAt[i][1] * T, T * wallAt[i][3]);
      const towerAt = [[-1.0, 0.9], [1.0, 0.9], [-0.95, 0.15], [0.95, 0.15]];
      for (let i = 0; i < Math.min(4, n.tower); i++) put('b_tower', X + towerAt[i][0] * T, Y + towerAt[i][1] * T, T * 0.36);
      // the hall
      put('b_keep', X, Y + T * 0.6, T * 1.3, null, true);
      // flag on the hall's right shoulder
      const pole = this.add.graphics().setDepth(D(Y + T * 0.7));
      pole.lineStyle(2.5, 0x2a2a2a, 1).lineBetween(X + T * 0.62, Y + T * 0.05, X + T * 0.62, Y - T * 0.75);
      const flag = this.add.graphics().setDepth(D(Y + T * 0.71));
      flag.fillStyle(n.color, 1).fillTriangle(0, 0, 0, 14, 22, 7);
      flag.lineStyle(1.2, 0x000000, 0.6).strokeTriangle(0, 0, 0, 14, 22, 7);
      flag.setPosition(X + T * 0.62 + 1.2, Y - T * 0.75);
      this.tweens.add({ targets: flag, scaleX: { from: 1, to: 0.78 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      objs.push(pole, flag);
      // two tall banners in the nation's colour hang either side of the gate
      for (const sd of [-1, 1]) {
        const bn = this.add.graphics().setDepth(D(Y + T * 0.6) + 1);
        const bx = X + sd * T * (sd < 0 ? 0.72 : 0.84), by = Y - T * 0.15, bw = T * 0.16, bh = T * 0.5;
        bn.fillStyle(0x0b0d0a, 1).fillRect(bx - bw / 2 - 1.5, by - 2, bw + 3, bh + 5);
        bn.fillStyle(n.color, 1).fillRect(bx - bw / 2, by, bw, bh - bw * 0.5).fillTriangle(bx - bw / 2, by + bh - bw * 0.5, bx + bw / 2, by + bh - bw * 0.5, bx, by + bh);
        bn.lineStyle(1.6, 0x0b0d0a, 0.85).lineBetween(bx - bw * 0.3, by + bh * 0.25, bx, by + bh * 0.42).lineBetween(bx, by + bh * 0.42, bx + bw * 0.3, by + bh * 0.25);
        objs.push(bn);
      }
      // the other plots: barracks, then the vault, then tents and a campfire
      n.plots.slice(1).forEach(([x, y], i) => {
        const bx = this.px(x) + T / 2, by = this.px(y) + T * 0.82;
        const home = [bx, this.px(y) + T * 0.5];
        if (i === 0) put('b_barracks', bx, by, T * 0.95, null, false, home);
        else if (i === 1) put('b_vault', bx, by, T * 0.9, null, false, home);
        else put(['c_tent', 'c_crates', 'c_tent3', 'ruin2', 'c_tent2', 'c_rack'][(i - 2) % 6], bx, by, T * 0.85, null, false, home);
      });
      // name tag (kept readable at any zoom in update())
      const label = this.add.text(X, Y - T * 1.3, n.name, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '800', color: '#ffffff', stroke: '#000000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5, 1).setDepth(9500);
      const chip = this.add.rectangle(X, Y - T * 1.3 + 2, 0, 0, n.color, 1).setDepth(9499);
      label.chip = chip; label.n = n;
      this.labels.push(label);
      objs.push(label, chip);
      this.nationObjects.set(n, objs);
      // the army: small figures on the parade ground, more of them for a bigger army
      const total = n.units.reduce((a, b2) => a + b2, 0);
      const count = 2 + Math.min(4, Math.floor(total / 90));
      for (let i = 0; i < count; i++) this.addWalker(n, i);
    }
  }

  // somewhere a figure may stand: the ground in front of the capital's walls, or the lower half of the nation's other plots; never on
  // water or mountain, never inside the compound
  yardPoint(n) {
    const T = TILE, { R } = this.grid;
    const [cx, cy] = n.plots[0];
    const X = this.px(cx) + T / 2, Y = this.px(cy) + T / 2;
    const ok = (x, y) => {
      if (!this.landPoint(x, y)) return false;
      const tx = Math.floor(x / T) - R - MARGIN, ty = Math.floor(y / T) - R - MARGIN;
      if (Math.abs(tx) > R || Math.abs(ty) > R) return false;
      const t = this.world.terrain(tx, ty);
      if (t === WATER || t === MOUNTAIN) return false;
      // the painter bends tile edges by up to ~50 px, so the ground around the spot must be open land too
      for (const [dx, dy] of [[-30, 0], [30, 0], [0, -30], [0, 30], [-22, -22], [22, -22], [-22, 22], [22, 22]]) {
        const ux = Math.floor((x + dx) / T) - R - MARGIN, uy = Math.floor((y + dy) / T) - R - MARGIN;
        const k = Math.abs(ux) > R || Math.abs(uy) > R ? WATER : this.world.terrain(ux, uy);
        if (k === WATER || k === MOUNTAIN) return false;
      }
      return true;
    };
    for (let tries = 0; tries < 30; tries++) {
      let x, y;
      if (n.plots.length > 1 && Math.random() < 0.45) {
        const [px, py] = n.plots[1 + Math.floor(Math.random() * (n.plots.length - 1))];
        x = this.px(px) + T * (0.15 + Math.random() * 0.7); y = this.px(py) + T * (0.85 + Math.random() * 0.12);
      } else {
        x = X + (Math.random() - 0.5) * T * 2.3; y = Y + T * (1.6 + Math.random() * 0.4);
      }
      if (ok(x, y)) return [x, y];
    }
    return [X, Y + T * 0.2];                                     // the capital's own tile is always land
  }

  addWalker(n, i) {
    const keys = ['bruiser', 'sniper', 'trickster', 'defender'];
    const key = i === 0 ? n.emblem : keys[(keys.indexOf(n.emblem) + i) % 4];
    const [gx, gy] = this.yardPoint(n);
    const size = TILE * 1.05;                       // the animation cell; the character fills most of it
    const shadow = this.add.image(gx, gy, 'blob').setScale(size / 128 * 0.42, size / 128 * 0.15).setAlpha(0.85);
    const spr = this.add.sprite(gx, gy, `${key}_walk`, 0).setOrigin(0.5, 0.97); spr.ch = key;
    spr.setScale(size / 192);
    const w = { n, spr, key, shadow, gx, gy, tx: gx, ty: gy, wait: Math.random() * 2, walking: false };
    this.walkers.push(w);
  }

  // A war is fought on flat open ground, never on a mountain or in a lake: the contract only says which two nations are at war, so the
  // spot is the clearest open tile (no water, mountain or owned plot around it) nearest the middle of the two capitals.
  findBattlefields() {
    const { R } = this.grid;
    this.fieldTiles = new Set();
    this.fields = new Map();
    const t = (x, y) => (Math.abs(x) > R || Math.abs(y) > R ? WATER : this.world.terrain(x, y));
    const clear = (x, y) => {
      if (this.owner.has(`${x},${y}`)) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = t(x + dx, y + dy);
        if (k === WATER || k === MOUNTAIN) return false;
        if (this.owner.has(`${x + dx},${y + dy}`) && (dx || dy)) return false;
      }
      return true;
    };
    const taken = [];
    for (const war of this.world.wars) {
      const [mx, my] = war.at;
      let best = null;
      for (let y = -R + 1; y <= R - 1; y++) for (let x = -R + 1; x <= R - 1; x++) {
        if (!clear(x, y)) continue;
        if (taken.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3)) continue;
        const d = Math.hypot(x - mx, y - my);
        if (!best || d < best.d) best = { d, x, y };
      }
      if (!best) {                       // no clear 3x3 left: take the nearest plain open tile instead of the raw midpoint
        for (let y = -R + 1; y <= R - 1; y++) for (let x = -R + 1; x <= R - 1; x++) {
          const k = t(x, y); if ((k !== LAND && k !== COAST && k !== PASS) || this.owner.has(`${x},${y}`)) continue;
          if (taken.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 2)) continue;
          const d = Math.hypot(x - mx, y - my); if (!best || d < best.d) best = { d, x, y };
        }
      }
      const at = best ? [best.x, best.y] : war.at;
      taken.push(at);
      this.fields.set(war, at);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.fieldTiles.add(`${at[0] + dx},${at[1] + dy}`);
    }
  }

  buildWars() {
    this.warFx = [];
    this.warSpots = [];
    this.impactSparks = this.add.particles(0, 0, 'spark', { speed: { min: 40, max: 150 }, angle: { min: 200, max: 340 }, gravityY: 220, lifespan: 480, scale: { start: 1, end: 0 }, tint: [0xffe066, 0xff7a2a, 0xffffff], emitting: false, blendMode: 'ADD' }).setDepth(9000);
    for (const war of this.world.wars) {
      const a = this.world.nations.find((n) => n.name === war.a), b = this.world.nations.find((n) => n.name === war.b);
      const at = this.fields.get(war) || war.at;
      const X = this.px(at[0]) + TILE / 2, Y = this.px(at[1]) + TILE / 2;
      // a trampled, scorched battlefield under the fight
      const field = this.add.graphics().setDepth(6);
      field.fillStyle(0x3a2a1a, 0.5).fillEllipse(X, Y + TILE * 0.35, TILE * 2.6, TILE * 1.5);
      field.fillStyle(0x15100a, 0.35).fillEllipse(X, Y + TILE * 0.4, TILE * 1.6, TILE * 0.9);
      const ring = this.add.image(X, Y + TILE * 0.2, 'glow').setTint(0xff2020).setScale(TILE * 2.6 / 128).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(1990);
      this.tweens.add({ targets: ring, alpha: 0.12, scale: TILE * 3.2 / 128, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const fighters = [];
      [[a, -1], [b, 1]].forEach(([n, side]) => {
        if (!n) return;
        const fx = X + side * TILE * 0.34, fy = Y + TILE * 0.5;
        const sh = this.add.image(fx, fy, 'blob').setScale(0.45, 0.17).setDepth(2000 + fy - 1);
        const s = this.add.sprite(fx, fy, `${n.emblem}_attack`, 0).setOrigin(0.5, 0.97).setFlipX(flipFor(n.emblem, side > 0));
        s.setScale((TILE * 1.2) / 192).setDepth(2000 + fy);
        fighters.push({ s, sh, side, n });
      });
      // they trade blows for ever: one swings, the blow lands, the other answers
      const fx = { fighters, X, Y };
      const swing = (i) => {
        const f = fighters[i % fighters.length];
        if (!f) return;
        f.s.play(`${f.n.emblem}_attack`);
        this.time.delayedCall(impactMs(f.n.emblem), () => {
          const foe = fighters[(i + 1) % fighters.length];
          if (foe && foe !== f) { foe.s.setTintFill(0xffffff); this.time.delayedCall(70, () => foe.s.clearTint()); }
          this.impactSparks.emitParticleAt(X + (f.side > 0 ? 1 : -1) * -TILE * 0.05, Y + TILE * 0.1, 8);
        });
        this.time.delayedCall(attackMs(f.n.emblem) + 250, () => swing(i + 1));
      };
      this.time.delayedCall(Math.random() * 800, () => swing(0));
      const sparks = null;
      const lbl = this.add.text(X, Y - TILE * 0.7, `${war.a}  vs  ${war.b}`, { fontFamily: 'system-ui', fontSize: '12px', fontStyle: '800', color: '#ffb0b0', stroke: '#000', strokeThickness: 3, resolution: 2 }).setOrigin(0.5, 1).setDepth(9500);
      lbl.isWar = true;
      lbl.chip = this.add.rectangle(X, Y - TILE * 0.7, 0, 0, 0xff4040, 1).setDepth(9499);
      lbl.n = { color: 0xff4040 };
      this.labels.push(lbl);
      this.warFx.push({ ring, fighters, lbl });
      this.warSpots.push({ x: X, y: Y, war, a, b, lbl });
    }
  }

  premiumMarks() {
    const { R } = this.grid;
    for (let ty = -R; ty <= R; ty++) {
      for (let tx = -R; tx <= R; tx++) {
        const t = this.world.terrain(tx, ty);
        if ((t !== COAST && t !== PASS) || this.owner.has(`${tx},${ty}`)) continue;
        const X = this.px(tx) + TILE / 2, Y = this.px(ty) + TILE / 2;
        const col = t === COAST ? 0xb6ff00 : 0xffd24a;
        const m = this.add.image(X, Y, 'glow').setTint(col).setScale(0.28).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
        const gem = this.add.graphics().setDepth(8);
        gem.fillStyle(col, 1).fillPoints([{ x: X, y: Y - 7 }, { x: X + 5, y: Y }, { x: X, y: Y + 7 }, { x: X - 5, y: Y }], true).lineStyle(1, 0x000000, 0.7).strokePoints([{ x: X, y: Y - 7 }, { x: X + 5, y: Y }, { x: X, y: Y + 7 }, { x: X - 5, y: Y }], true);
        this.tweens.add({ targets: m, alpha: 0.2, scale: 0.45, duration: 1100 + ((tx * 7 + ty * 13) & 7) * 110, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
  }

  atmosphere() {
    const size = this.grid.size;
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      const c = this.add.image(Math.random() * size, Math.random() * size, 'cloud').setScale(3 + Math.random() * 3).setAlpha(0.34).setTint(0x4a4038).setDepth(9800).setAngle(Math.random() * 360);
      c.vx = 6 + Math.random() * 8;
      this.clouds.push(c);
    }
    // drifting embers over the wastes
    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: size }, y: { min: 0, max: size }, speedY: { min: -14, max: -4 }, speedX: { min: 6, max: 18 },
      scale: { start: 0.35, end: 0 }, alpha: { start: 0.7, end: 0 }, lifespan: 5200, frequency: 70, tint: [0xff7a1a, 0xffb347, 0xb6ff00], blendMode: 'ADD',
    }).setDepth(9900);
  }

  // ---- camera: drag with inertia, wheel zoom at the cursor, two-finger pinch ----
  cameraSetup() {
    const cam = this.cameras.main;
    const size = this.grid.size;
    this.input.addPointer(2);
    cam.setBounds(-2200, -2200, size + 4400, size + 4400);
    cam.setBackgroundColor(0x05100f);
    this.minZoom = () => Math.max(this.scale.width, this.scale.height) / (size + 4400);
    const startZoom = Math.max(this.minZoom(), Math.min(this.scale.width, this.scale.height) / (TILE * 11), 1.1 * DPR());
    cam.setZoom(startZoom);
    const first = this.world.nations[0];
    const keep = this.registry.get('mapCam');
    if (keep) { this.camRestored = true; cam.setZoom(Math.max(keep.zoom, this.minZoom())); cam.scrollX = keep.x; cam.scrollY = keep.y; this.registry.remove('mapCam'); }
    else if (first) cam.centerOn(this.px(first.plots[0][0]) + TILE / 2, this.px(first.plots[0][1]) + TILE / 2);
    else cam.centerOn(size / 2, size / 2);
    this.vel = new Phaser.Math.Vector2(0, 0);
    this.pinch = null;
    this.tap = null;

    this.input.on('pointerdown', (p) => {
      this.vel.set(0, 0);
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) this.tap = null; else this.tap = { x: p.x, y: p.y, t: this.time.now };
    });
    this.input.on('pointermove', (p) => {
      if (!p.isDown) return;
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        if (this.pinch) {
          this.zoomAt(mx, my, cam.zoom * (d / this.pinch.d));
          cam.scrollX -= (mx - this.pinch.mx) / cam.zoom; cam.scrollY -= (my - this.pinch.my) / cam.zoom;
        }
        this.pinch = { d, mx, my };
        return;
      }
      const dx = (p.x - p.prevPosition.x) / cam.zoom, dy = (p.y - p.prevPosition.y) / cam.zoom;
      cam.scrollX -= dx; cam.scrollY -= dy;
      this.vel.set(dx * 60, dy * 60); this.lastMove = this.time.now;
    });
    this.input.on('pointerup', (p) => {
      if (this.time.now - (this.lastMove || 0) > 90) this.vel.set(0, 0);   // held still before letting go: no fling
      this.pinch = null;
      if (this.tap && Phaser.Math.Distance.Between(p.x, p.y, this.tap.x, this.tap.y) < 9 * DPR() && this.time.now - this.tap.t < 450) { this.vel.set(0, 0); this.onTap(p); }
      this.tap = null;
    });
    this.input.on('wheel', (p, _o, _dx, dy) => this.zoomAt(p.x, p.y, cam.zoom * (dy > 0 ? 0.88 : 1.14)));
    this.viewMid = { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
    // turning the phone keeps the same spot in the middle of the screen (the camera's scroll alone would drift by half the size change)
    this.onResize = () => { cam.setZoom(Math.max(cam.zoom, this.minZoom())); if (this.viewMid) cam.centerOn(this.viewMid.x, this.viewMid.y); };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.registry.set('mapCam', { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom }); this.scale.off('resize', this.onResize); clearToasts(); });
  }

  // zoom about a screen point: the world point under (sx, sy) stays under it (Phaser zooms about the camera's centre)
  zoomAt(sx, sy, z) {
    const cam = this.cameras.main;
    z = Phaser.Math.Clamp(z, this.minZoom(), 2.4 * DPR());
    const cx = cam.width / 2, cy = cam.height / 2;
    const wx = cam.scrollX + cx + (sx - cx) / cam.zoom, wy = cam.scrollY + cy + (sy - cy) / cam.zoom;
    cam.setZoom(z);
    cam.scrollX = wx - cx - (sx - cx) / z; cam.scrollY = wy - cy - (sy - cy) / z;
  }

  // ---- picking ----
  /** is this world point open land (not water, mountain or off the map, nor the painted edge of either)? */
  landPoint(x, y) {
    const T = TILE, { R } = this.grid;
    const at = (px, py) => { const ux = Math.floor(px / T) - R - MARGIN, uy = Math.floor(py / T) - R - MARGIN; return Math.abs(ux) > R || Math.abs(uy) > R ? WATER : this.world.terrain(ux, uy); };
    for (const [dx, dy] of [[0, 0], [-26, 0], [26, 0], [0, -26], [0, 26], [-20, -20], [20, -20], [-20, 20], [20, 20]]) { const k = at(x + dx, y + dy); if (k === WATER || k === MOUNTAIN) return false; }
    return true;
  }
  /** a walk in a straight line must stay on land all the way */
  pathOk(ax, ay, bx, by) {
    for (let i = 1; i <= 6; i++) if (!this.landPoint(ax + ((bx - ax) * i) / 6, ay + ((by - ay) * i) / 6)) return false;
    return true;
  }
  clearMarker() { if (this.marker) { this.tweens.killTweensOf(this.marker); this.marker.destroy(); this.marker = null; } }

  // what a tap lands on: a war, then a nation (its whole compound, name tag and buildings, not only the tile under the finger), then the tile
  hitNation(w) {
    const T = TILE;
    for (const l of this.labels) if (!l.isWar && l.n && l.getBounds().contains(w.x, w.y)) return l.n;
    for (const n of this.world.nations) {
      const [cx, cy] = n.plots[0];
      const X = this.px(cx) + T / 2, Y = this.px(cy) + T / 2;
      // the capital's own tile, plus the hall's base that hangs over its lower edge: the other tiles around it stay tappable
      if (Math.abs(w.x - X) < 0.62 * T && w.y > Y - 0.5 * T && w.y < Y + 0.8 * T) return n;
    }
    return null;
  }

  onTap(p) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const R = this.grid.R, M = MARGIN;
    const tx = Math.floor(w.x / TILE) - R - M, ty = Math.floor(w.y / TILE) - R - M;
    // a war (its field or its name tag, which grows when zoomed out), then a nation (tag or capital), then the tile
    const spot = (this.warSpots || []).find((s) => (Math.abs(s.x - w.x) < TILE * 1.5 && w.y > s.y - TILE * 1.2 && w.y < s.y + TILE * 1.2) || (s.lbl && s.lbl.getBounds().contains(w.x, w.y)));
    if (spot) { this.clearMarker(); this.showWar(spot); return; }
    if (!this.pick) { const hit = this.hitNation(w); if (hit) { this.clearMarker(); this.showNation(hit); return; } }
    if (Math.abs(tx) > R || Math.abs(ty) > R) { this.sheet.close(); return; }
    this.select(tx, ty);
  }

  select(tx, ty) {
    const n = this.owner.get(`${tx},${ty}`);
    this.clearMarker();
    const X = this.px(tx), Y = this.px(ty);
    this.marker = this.add.rectangle(X + TILE / 2, Y + TILE / 2, TILE - 3, TILE - 3).setStrokeStyle(3, 0xffffff, 1).setFillStyle(0xffffff, 0.08).setDepth(9700);
    this.tweens.add({ targets: this.marker, alpha: 0.4, duration: 520, yoyo: true, repeat: -1 });
    const t = this.world.terrain(tx, ty);
    if (n) { this.showNation(n); return; }
    this.showTile(tx, ty, t);
  }

  showNation(n) {
    if (this.world.sandbox) { this.showNationSandbox(n); return; }
    const wars = this.world.wars.filter((w) => w.a === n.name || w.b === n.name);
    const foes = wars.map((w) => (w.a === n.name ? w.b : w.a));
    const holders = n.holders === null ? '-' : n.holders.toLocaleString();
    this.sheet.open(`
      <h2><span class="dot" style="background:#${n.color.toString(16).padStart(6, '0')};width:14px;height:14px"></span>${n.name}${foes.length ? '<span class="tag war">AT WAR</span>' : ''}</h2>
      <div class="sub">${n.plots.length} plot${n.plots.length > 1 ? 's' : ''}${foes.length ? ' · fighting ' + foes.join(', ') : ''}</div>
      <div class="stats">
        <div class="stat"><b>${holders}</b><span>holders</span></div>
        <div class="stat"><b>$${n.pool}</b><span>war pool</span></div>
        <div class="stat"><b>${n.units.reduce((a, b) => a + b, 0)}</b><span>units</span></div>
        <div class="stat"><b>${n.wall + n.tower}</b><span>defenses</span></div>
      </div>
      <div class="row"><button class="btn primary" data-go>Enter base</button><button class="btn" data-close>Close</button></div>`, {
      go: () => this.scene.start('base', { nation: n }),
    });
  }

  showWar(spot) {
    const { war, a, b } = spot;
    this.clearMarker();
    if (!a || !b) { this.sheet.close(); return; }
    const snap = (n, units) => ({ name: n.name, color: n.color, emblem: n.emblem, units: units.slice(), wall: n.wall, tower: n.tower });
    // a raid with its own record replays exactly; one read from the chain replays with the numbers the chain reported
    const report = war.report || (war.attack !== undefined ? { estimated: true, result: { attack: war.attack, defense: war.defense, success: !!war.success }, send: a.units.slice(0, 3), loot: 0, a: snap(a, a.units.slice(0, 3).concat(0)), b: snap(b, b.units) } : null);
    this.sheet.open(`
      <h2><span class="tag war" style="margin:0">WAR</span>${a.name} vs ${b.name}</h2>
      <div class="sub">${war.success === undefined ? 'a raid is under way' : war.success ? `${a.name} broke through` : `${b.name} held`}</div>
      <div class="stats" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat"><b>${a.units.reduce((x, y) => x + y, 0)}</b><span>${a.name} units</span></div>
        <div class="stat"><b>${b.units.reduce((x, y) => x + y, 0)}</b><span>${b.name} units</span></div>
      </div>
      <div class="row">${report ? '<button class="btn danger" data-go>Watch the battle</button>' : ''}<button class="btn" data-close>Close</button></div>`, {
      go: () => openBattle({ report, back: 'map' }),
    });
  }

  // ---- play test ----
  /** the plots the player can take now: pulsing outlines in the nation's colour with the price, so growing is never a guessing game */
  landOptions() {
    const sim = this.sim, p = sim.player, out = [], seen = new Set();
    if (!p) return out;
    for (const [x, y] of p.plots) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k)) continue; seen.add(k);
      if (sim.canExpand(x + dx, y + dy)) out.push([x + dx, y + dy]);
    }
    return out;
  }

  drawLand() {
    this.landObjs?.forEach((o) => o.destroy());
    this.landObjs = []; this.landLabels = [];
    const sim = this.sim, p = sim.player;
    if (!p) return;
    const col = p.color, T = TILE;
    for (const [x, y] of this.landOptions()) {
      const X = this.px(x), Y = this.px(y), cost = sim.plotCost(x, y), afford = p.usdc >= cost;
      const g = this.add.graphics().setDepth(6.5);
      g.fillStyle(col, afford ? 0.16 : 0.07).fillRect(X + 3, Y + 3, T - 6, T - 6);
      g.lineStyle(3, col, afford ? 0.95 : 0.4).strokeRect(X + 3, Y + 3, T - 6, T - 6);
      this.tweens.add({ targets: g, alpha: afford ? 0.45 : 0.8, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const t = this.add.text(X + T / 2, Y + T / 2, `+ $${cost}`, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '800', color: afford ? '#ffffff' : '#9a9a8a', stroke: '#000000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setDepth(9400);
      this.landObjs.push(g, t); this.landLabels.push(t);
    }
  }

  /** the Land button: show where the nation can grow and what the next plot costs */
  focusLand() {
    const sim = this.sim, p = sim.player;
    if (!p) return;
    const opts = this.landOptions();
    if (!opts.length) { toast(p.plots.length >= 16 ? 'Your nation is full: 16 plots.' : 'No free plot touches your land (water, mountains or other nations all round).'); return; }
    const c = this.cameras.main, mid = { x: c.scrollX + c.width / 2, y: c.scrollY + c.height / 2 };
    let best = opts[0], bd = Infinity;
    for (const o of opts) { const d = Math.hypot(this.px(o[0]) + TILE / 2 - mid.x, this.px(o[1]) + TILE / 2 - mid.y); if (d < bd) { bd = d; best = o; } }
    c.pan(this.px(best[0]) + TILE / 2, this.px(best[1]) + TILE / 2, 450, 'Sine.easeInOut');
    c.zoomTo(Math.max(c.zoom, 1.1 * DPR()), 450);
    toast(`Tap a glowing plot to take it. The next plot costs $${sim.plotCost(best[0], best[1])} and each one doubles. You have $${Math.floor(p.usdc)}.`);
  }

  startSandbox() {
    this.sim = this.world.sim;
    this.sbx = mountHud(this);
    this.lastHud = 0;
    this.seenLog = this.sim.log.length;
    this.drawLand();
    const p = this.sim.player;
    if (!p) { const me = this; setTimeout(() => { if (me.scene.isActive() && !me.sim.player) openOnboarding(me); }, 200); return; }
    const c = this.cameras.main;
    if (!this.camRestored) c.centerOn(this.px(p.plots[0][0]) + TILE / 2, this.px(p.plots[0][1]) + TILE / 2);
    let helped = true;
    try { helped = !!localStorage.getItem('badlands.helped'); if (!helped) localStorage.setItem('badlands.helped', '1'); } catch (_) { /* storage blocked: the game still runs */ }
    if (!helped) toast('Tap your base to train an army. Tap another nation to scout and raid it. To grow, tap an open plot touching your land.');
  }

  sandboxTick(delta) {
    const sim = this.sim;
    this.lastHud = (this.lastHud || 0) + delta;
    if (this.lastHud < 700) return;
    this.lastHud = 0;
    checkStale(sim);
    const fresh = sim.tick();
    for (const e of fresh) {
      if (e.kind !== 'raid') continue;
      const p = sim.player;
      if (p && e.b === p.name) toast(`${e.a} raided you: ${e.success ? 'they broke through' : 'you held'}.`, { label: 'Watch', run: () => openBattle({ report: e.report, back: 'map' }) });
    }
    this.sbx?.refresh();
    refreshPlanner();
  }

  showNationSandbox(n) {
    const sim = this.sim, me = sim.player;
    const total = n.units.reduce((a, b) => a + b, 0);
    const prot = sim.protectedLeft(n);
    const stats = `<div class="stats">
      <div class="stat"><b>${total}</b><span>units</span></div><div class="stat"><b>$${Math.floor(n.pool)}</b><span>war pool</span></div>
      <div class="stat"><b>${n.wall}/${n.tower}</b><span>wall/tower</span></div><div class="stat"><b>${prot ? '🛡' : '-'}</b><span>${prot ? fmtLeft(prot) : 'open'}</span></div></div>`;
    if (n.isPlayer) {
      this.sheet.open(`<h2><span class="dot" style="background:#${n.color.toString(16).padStart(6, '0')};width:14px;height:14px"></span>${n.name} <span class="tag prem">YOU</span></h2><div class="sub">${n.plots.length} plot${n.plots.length > 1 ? 's' : ''}</div>${stats}<div class="row"><button class="btn primary" data-go>Enter base</button><button class="btn" data-close>Close</button></div>`, { go: () => this.scene.start('base', { nation: n }) });
      return;
    }
    if (!me) { this.sheet.open(`<h2>${n.name}</h2><div class="sub">found your own nation first</div>${stats}<div class="row"><button class="btn" data-close>Close</button></div>`, {}); return; }
    this.sheet.open(`<h2><span class="dot" style="background:#${n.color.toString(16).padStart(6, '0')};width:14px;height:14px"></span>${n.name}</h2><div class="sub">scouted: you can see their whole army</div>${stats}<div class="row"><button class="btn danger" data-plan>Plan a raid</button><button class="btn" data-close>Close</button></div>`, {
      plan: () => {
        this.sheet.open(`<h2>Raid ${n.name}</h2><div class="sub">choose how many units to send</div>${plannerHtml(sim, me, n)}<div class="row"><button class="btn" data-back>Back</button></div>`, { back: () => this.showNationSandbox(n) });
        bindPlanner(document.querySelector('.sheet'), sim, me, n, (report) => { this.sheet.close(); this.scene.start('battle', { report, back: 'map', home: me }); });
      },
    });
  }

  showTile(tx, ty, t) {
    if (this.world.sandbox) {
      const sim = this.sim;
      if (this.pick) { confirmClaim(this, tx, ty); return; }
      if (sim.player && !sim.owner(tx, ty) && sim.buildable(tx, ty) && !sim.canExpand(tx, ty) && !this.pick) {
        this.sheet.open(`<h2>${t === 3 ? 'Coast plot' : t === 4 ? 'Mountain pass' : 'Open ground'}</h2><div class="sub">plot ${tx}, ${ty}</div><div class="note" style="margin-top:0">${sim.player.plots.length >= 16 ? 'Your nation is full (16 plots).' : 'A new plot has to touch your own land (straight up, down, left or right of a plot you hold).'}</div><div class="row"><button class="btn" data-close>Close</button></div>`, {});
        return;
      }
      if (sim.player && sim.canExpand(tx, ty)) {
        const cost = sim.plotCost(tx, ty);
        this.sheet.open(`<h2>Take this plot?</h2><div class="sub">next to your land · plot ${tx}, ${ty}</div><div class="note" style="margin-top:0">Costs $${cost} play USDC (half of it joins your war pool) and burns coin. Each plot costs double the last. You need a commander's coin holding.</div><div class="row"><button class="btn primary" data-go>Take it · $${cost}</button><button class="btn" data-close>Close</button></div>`, {
          go: () => { try { sim.expand(tx, ty); this.sheet.close(); this.scene.restart(); } catch (e) { toast(e.message); } },
        });
        return;
      }
    }
    const prem = t === COAST ? '<span class="tag prem">premium</span>' : t === PASS ? '<span class="tag gold">premium</span>' : '';
    const text = t === COAST ? 'Coast plot. 20 USDC unless the project took it at launch.' : t === PASS ? 'Mountain pass plot, +20% defense for whoever holds it. 20 USDC unless taken at launch.'
      : t === MOUNTAIN ? 'Mountains: nobody can build here.' : t === WATER ? 'Water: nobody can build here.' : 'Open ground. A project claims land at about $50k market cap, or by deal at launch.';
    this.sheet.open(`<h2>${KIND_NAME[t]}${prem}</h2><div class="sub">plot ${tx}, ${ty}</div><div style="font-size:14px;line-height:1.5;margin-bottom:14px;color:#cfe0c4">${text}</div><div class="row"><button class="btn" data-close>Close</button></div>`, {});
  }

  // ---- screen furniture (DOM, so it works the same on a phone) ----
  buildUi() {
    const live = this.world.live;
    const ui = document.getElementById('ui');
    ui.innerHTML = `
      <div class="top"><div class="brand"><b>VYRE BAD LANDS</b><span>${this.world.nations.length} nations · ${this.world.wars.length} wars</span></div>
        <div class="pill ${live ? '' : 'preview'}">${live ? 'LIVE · TEST CHAIN' : this.world.sandbox ? 'PLAY TEST' : this.world.empty ? 'DEMO WORLD' : 'PREVIEW DATA'}</div></div>
      <div class="rail"><button data-z="+" aria-label="zoom in">+</button><button data-z="-" aria-label="zoom out">−</button><button data-z="c" aria-label="centre">◎</button></div>
      <button class="fab legend" aria-label="legend">?</button>
      <div class="legend-pop"><div><span class="dot" style="background:#b6ff00"></span>coast plot (premium)</div><div><span class="dot" style="background:#ffd24a"></span>mountain pass (premium)</div><div><span class="dot" style="background:#ff3030"></span>war</div><div style="color:#93a58a;font-size:12px">drag to move · pinch or wheel to zoom · tap a nation</div></div>
      <div class="sheet"></div>`;
    this.sheet = mountSheet(ui.querySelector('.sheet'));
    this.sheet.onClose = () => { this.clearMarker(); dropPlanner(); };
    this.sheet.onOpen = () => dropPlanner();
    const cam = this.cameras.main;
    ui.querySelector('.rail').addEventListener('click', (e) => {
      const k = e.target.closest('button')?.dataset.z;
      if (!k) return;
      if (k === 'c') { const n = this.world.sim?.player || this.world.nations[0]; cam.pan(n ? this.px(n.plots[0][0]) + TILE / 2 : this.grid.size / 2, n ? this.px(n.plots[0][1]) + TILE / 2 : this.grid.size / 2, 500, 'Sine.easeInOut'); return; }
      this.zoomAt(this.scale.width / 2, this.scale.height / 2, cam.zoom * (k === '+' ? 1.35 : 0.74));
    });
    const pop = ui.querySelector('.legend-pop');
    ui.querySelector('.legend').addEventListener('click', () => pop.classList.toggle('on'));
    this.events.once('shutdown', () => { ui.innerHTML = ''; });
  }

  update(time, delta) {
    const dt = delta / 1000;
    if (this.sim) this.sandboxTick(delta);
    if (this.landLabels?.length) { const show = this.cameras.main.zoom > 0.55 * DPR(); for (const l of this.landLabels) if (l.visible !== show) l.setVisible(show); }
    { const c = this.cameras.main; this.viewMid = { x: c.scrollX + c.width / 2, y: c.scrollY + c.height / 2 }; }
    const cam = this.cameras.main;
    // drag inertia
    if (!this.input.activePointer.isDown && (Math.abs(this.vel.x) > 1 || Math.abs(this.vel.y) > 1)) {
      cam.scrollX -= this.vel.x * dt / cam.zoom; cam.scrollY -= this.vel.y * dt / cam.zoom;
      this.vel.scale(Math.pow(0.02, dt));
    }
    // clouds drift
    for (const c of this.clouds) { c.x += c.vx * dt; if (c.x > this.grid.size + 400) c.x = -400; }
    // name tags keep a readable size
    const k = Phaser.Math.Clamp(DPR() / cam.zoom, 0.7, 2.6);
    for (const l of this.labels) {
      l.setScale(k);
      if (l.chip) { l.chip.setSize(l.width * k + 14 * k, l.height * k * 0.82).setPosition(l.x, l.y - l.height * k * 0.42); l.chip.setFillStyle(0x000000, 0.55).setStrokeStyle(2, l.n.color, 1); }
    }
    // walkers hop between spots in their own plots
    for (const w of this.walkers) {
      w.wait -= dt;
      const dx = w.tx - w.gx, dy = w.ty - w.gy, d = Math.hypot(dx, dy);
      let walking = false;
      if (d > 2) {
        walking = true;
        const sp = 26 * dt;
        w.gx += (dx / d) * sp; w.gy += (dy / d) * sp;
        if (Math.abs(dx) > 1) w.spr.setFlipX(flipFor(w.spr.ch, dx < 0));
      } else if (w.wait <= 0) {
        for (let tries = 0; tries < 8; tries++) { const [nx, ny] = this.yardPoint(w.n); if (this.pathOk(w.gx, w.gy, nx, ny)) { w.tx = nx; w.ty = ny; break; } }
        w.wait = 1.5 + Math.random() * 3;
      }
      if (walking !== w.walking) {
        w.walking = walking;
        if (walking) w.spr.play(`${w.key}_walk`); else { w.spr.stop(); w.spr.setFrame(0); }
      }
      w.spr.setPosition(w.gx, w.gy).setDepth(2000 + w.gy);
      w.shadow.setPosition(w.gx, w.gy - 1).setDepth(2000 + w.gy - 1);
    }
  }
}
