import Phaser from 'phaser';
import { LAND, WATER, MOUNTAIN, COAST, PASS } from '../terrain.js';
import { TILE, MARGIN, noise, lushAtPx } from '../worldgen.js';
import { mountSheet } from '../ui.js';

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
    this.grid = this.registry.get('grid');
    const g = this.grid;
    this.px = (x) => g.toPx(x);
    this.owner = new Map();
    for (const n of this.world.nations) for (const [x, y] of n.plots) this.owner.set(`${x},${y}`, n);

    const pad = 900;
    this.add.tileSprite(-pad, -pad, g.size + pad * 2, g.size + pad * 2, 'g_water').setOrigin(0).setTint(0x949494).setDepth(-2);
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(0);
    this.shimmer = this.add.image(0, 0, 'shimmer').setOrigin(0).setDepth(1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    this.tweens.add({ targets: this.shimmer, x: { from: -5, to: 5 }, y: { from: 3, to: -3 }, alpha: { from: 0.45, to: 0.95 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.placeProps();
    this.drawTerritories();
    this.buildNations();
    this.buildWars();
    this.premiumMarks();
    this.atmosphere();
    this.cameraSetup();
    this.buildUi();
  }

  // ---- scenery: ranges, forests, meadows, reeds and ruins, placed from the same grid and noise the ground was painted with ----
  placeProps() {
    const { R, T, kinds } = this.grid;
    const put = (key, x, y, size, byWidth = false, depth = null) => {
      const s = this.add.image(x, y, key).setOrigin(0.5, 0.92);
      s.setScale(size / (byWidth ? s.width : s.height)).setDepth(depth ?? 10 + y);
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
  buildNations() {
    this.walkers = [];
    this.labels = [];
    this.nationObjects = new Map();
    const bkeys = ['barracks', 'guardtower', 'vault', 'wall'];
    for (const n of this.world.nations) {
      const objs = [];
      const [cx, cy] = n.plots[0];
      const X = this.px(cx) + TILE / 2, Y = this.px(cy) + TILE / 2;
      const hall = this.add.image(X, Y + TILE * 0.42, 'townhall').setOrigin(0.5, 0.88).setDepth(2000 + Y + 40);
      hall.setScale((TILE * 2.5) / hall.width);
      // capital glow so it reads from far away
      const glow = this.add.image(X, Y, 'glow').setTint(n.color).setAlpha(0.5).setScale(TILE / 36).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
      this.tweens.add({ targets: glow, alpha: 0.2, scale: TILE / 28, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      // flag
      const pole = this.add.graphics().setDepth(2000 + Y + 41);
      pole.lineStyle(3, 0x222222, 1).lineBetween(X + TILE * 0.9, Y + TILE * 0.2, X + TILE * 0.9, Y - TILE * 0.75);
      const flag = this.add.graphics().setDepth(2000 + Y + 42);
      flag.fillStyle(n.color, 1).fillTriangle(0, 0, 0, 18, 28, 9);
      flag.lineStyle(1.5, 0x000000, 0.6).strokeTriangle(0, 0, 0, 18, 28, 9);
      flag.setPosition(X + TILE * 0.9 + 1.5, Y - TILE * 0.75);
      this.tweens.add({ targets: flag, scaleX: { from: 1, to: 0.8 }, skewY: 0, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      objs.push(hall, glow, pole, flag);
      // buildings by what the nation has: wall and tower counts decide
      n.plots.slice(1).forEach(([x, y], i) => {
        const bx = this.px(x) + TILE / 2, by = this.px(y) + TILE / 2;
        const k = bkeys[(i + (n.wall + n.tower)) % bkeys.length];
        const b = this.add.image(bx, by + TILE * 0.3, k).setOrigin(0.5, 0.85).setDepth(2000 + by + 40);
        b.setScale((TILE * 1.45) / b.width);
        objs.push(b);
      });
      // name tag (kept readable at any zoom in update())
      const label = this.add.text(X, Y - TILE * 0.95, n.name, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '800', color: '#ffffff', stroke: '#000000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5, 1).setDepth(9500);
      const chip = this.add.rectangle(X, Y - TILE * 0.95 + 2, 0, 0, n.color, 1).setDepth(9499);
      label.chip = chip; label.n = n;
      this.labels.push(label);
      objs.push(label, chip);
      this.nationObjects.set(n, objs);
      // little fighters wandering the home plots
      const count = Math.min(4, 2 + Math.floor(n.plots.length / 2));
      for (let i = 0; i < count; i++) this.addWalker(n, i);
      // click target
      const zone = this.add.zone(X, Y, TILE * 2.2, TILE * 2.2).setDepth(9600);
      zone.nation = n;
    }
  }

  addWalker(n, i) {
    const keys = ['bruiser', 'sniper', 'trickster', 'defender'];
    const key = i === 0 ? n.emblem : keys[(keys.indexOf(n.emblem) + i) % 4];
    const [px, py] = n.plots[i % n.plots.length];
    const gx = this.px(px) + TILE * (0.25 + Math.random() * 0.5), gy = this.px(py) + TILE * (0.4 + Math.random() * 0.5);
    const shadow = this.add.image(gx, gy, 'blob').setScale(0.42, 0.18).setAlpha(0.8);
    const spr = this.add.image(gx, gy, key).setOrigin(0.5, 0.85);
    spr.setScale((TILE * 0.95) / spr.width);
    const w = { n, spr, shadow, gx, gy, tx: gx, ty: gy, wait: Math.random() * 2, phase: Math.random() * 6, base: spr.scaleX };
    this.walkers.push(w);
  }

  buildWars() {
    this.warFx = [];
    for (const war of this.world.wars) {
      const a = this.world.nations.find((n) => n.name === war.a), b = this.world.nations.find((n) => n.name === war.b);
      const X = this.px(war.at[0]) + TILE / 2, Y = this.px(war.at[1]) + TILE / 2;
      const ring = this.add.image(X, Y, 'glow').setTint(0xff2020).setScale(TILE * 2.4 / 128).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
      this.tweens.add({ targets: ring, alpha: 0.12, scale: TILE * 3.2 / 128, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const fighters = [];
      [[a, -1], [b, 1]].forEach(([n, side]) => {
        if (!n) return;
        const sh = this.add.image(X + side * 17, Y + 16, 'blob').setScale(0.4, 0.16);
        const s = this.add.image(X + side * 17, Y + 16, n.emblem).setOrigin(0.5, 0.85).setFlipX(side < 0);
        s.setScale((TILE * 0.85) / s.width).setDepth(2000 + Y + 18);
        sh.setDepth(2000 + Y + 10);
        fighters.push({ s, sh, side, x: X + side * 17, y: Y + 16 });
        this.tweens.add({ targets: s, x: X + side * 6, duration: 170, yoyo: true, repeat: -1, repeatDelay: 450 + (side > 0 ? 260 : 0), delay: side > 0 ? 340 : 0, ease: 'Quad.out' });
      });
      const sparks = this.add.particles(X, Y + 2, 'spark', { speed: { min: 40, max: 130 }, angle: { min: 200, max: 340 }, gravityY: 180, lifespan: 480, scale: { start: 0.9, end: 0 }, tint: [0xffe066, 0xff7a2a, 0xffffff], frequency: 360, quantity: 5, blendMode: 'ADD' }).setDepth(9000);
      const lbl = this.add.text(X, Y - TILE * 0.7, `${war.a}  vs  ${war.b}`, { fontFamily: 'system-ui', fontSize: '12px', fontStyle: '800', color: '#ff9a9a', stroke: '#000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5, 1).setDepth(9500);
      lbl.isWar = true;
      this.labels.push(lbl);
      this.warFx.push({ ring, fighters, sparks, lbl });
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
      const c = this.add.image(Math.random() * size, Math.random() * size, 'cloud').setScale(3 + Math.random() * 3).setAlpha(0.28).setDepth(9800).setAngle(Math.random() * 360);
      c.vx = 6 + Math.random() * 8;
      this.clouds.push(c);
    }
    // drifting embers over the wastes
    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: size }, y: { min: 0, max: size }, speedY: { min: -14, max: -4 }, speedX: { min: 6, max: 18 },
      scale: { start: 0.35, end: 0 }, alpha: { start: 0.7, end: 0 }, lifespan: 5200, frequency: 70, tint: [0xb6ff00, 0xffe066], blendMode: 'ADD',
    }).setDepth(9900);
  }

  // ---- camera: drag with inertia, wheel zoom at the cursor, two-finger pinch ----
  cameraSetup() {
    const cam = this.cameras.main;
    const size = this.grid.size;
    this.input.addPointer(2);
    cam.setBounds(-900, -900, size + 1800, size + 1800);
    cam.setBackgroundColor(0x07262d);
    this.minZoom = () => Math.min(this.scale.width, this.scale.height) / size * 0.92;
    const startZoom = Math.max(this.minZoom(), Math.min(this.scale.width, this.scale.height) / (TILE * 11), 0.9 * DPR());
    cam.setZoom(startZoom);
    const first = this.world.nations[0];
    if (first) cam.centerOn(this.px(first.plots[0][0]) + TILE / 2, this.px(first.plots[0][1]) + TILE / 2);
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
      this.vel.set(dx * 60, dy * 60);
    });
    this.input.on('pointerup', (p) => {
      this.pinch = null;
      if (this.tap && Phaser.Math.Distance.Between(p.x, p.y, this.tap.x, this.tap.y) < 9 * DPR() && this.time.now - this.tap.t < 450) { this.vel.set(0, 0); this.onTap(p); }
      this.tap = null;
    });
    this.input.on('wheel', (p, _o, _dx, dy) => this.zoomAt(p.x, p.y, cam.zoom * (dy > 0 ? 0.88 : 1.14)));
    this.scale.on('resize', () => { cam.setZoom(Math.max(cam.zoom, this.minZoom())); });
  }

  zoomAt(sx, sy, z) {
    const cam = this.cameras.main;
    z = Phaser.Math.Clamp(z, this.minZoom(), 2.4 * DPR());
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(z);
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y;
  }

  // ---- picking ----
  onTap(p) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const R = this.grid.R, M = MARGIN;
    const tx = Math.floor(w.x / TILE) - R - M, ty = Math.floor(w.y / TILE) - R - M;
    if (Math.abs(tx) > R || Math.abs(ty) > R) { this.sheet.close(); return; }
    this.select(tx, ty);
  }

  select(tx, ty) {
    const n = this.owner.get(`${tx},${ty}`);
    this.marker?.destroy();
    const X = this.px(tx), Y = this.px(ty);
    this.marker = this.add.rectangle(X + TILE / 2, Y + TILE / 2, TILE - 3, TILE - 3).setStrokeStyle(3, 0xffffff, 1).setFillStyle(0xffffff, 0.08).setDepth(9700);
    this.tweens.add({ targets: this.marker, alpha: 0.4, duration: 520, yoyo: true, repeat: -1 });
    const t = this.world.terrain(tx, ty);
    if (n) { this.showNation(n); return; }
    this.showTile(tx, ty, t);
  }

  showNation(n) {
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

  showTile(tx, ty, t) {
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
        <div class="pill ${live ? '' : 'preview'}">${live ? 'LIVE · TEST CHAIN' : 'PREVIEW DATA'}</div></div>
      <div class="rail"><button data-z="+" aria-label="zoom in">+</button><button data-z="-" aria-label="zoom out">−</button><button data-z="c" aria-label="centre">◎</button></div>
      <button class="fab legend" aria-label="legend">?</button>
      <div class="legend-pop"><div><span class="dot" style="background:#b6ff00"></span>coast plot (premium)</div><div><span class="dot" style="background:#ffd24a"></span>mountain pass (premium)</div><div><span class="dot" style="background:#ff3030"></span>war</div><div style="color:#93a58a;font-size:12px">drag to move · pinch or wheel to zoom · tap a nation</div></div>
      <div class="sheet"></div>`;
    this.sheet = mountSheet(ui.querySelector('.sheet'));
    const cam = this.cameras.main;
    ui.querySelector('.rail').addEventListener('click', (e) => {
      const k = e.target.closest('button')?.dataset.z;
      if (!k) return;
      if (k === 'c') { const n = this.world.nations[0]; cam.pan(n ? this.px(n.plots[0][0]) + TILE / 2 : this.grid.size / 2, n ? this.px(n.plots[0][1]) + TILE / 2 : this.grid.size / 2, 500, 'Sine.inOut'); return; }
      this.zoomAt(this.scale.width / 2, this.scale.height / 2, cam.zoom * (k === '+' ? 1.35 : 0.74));
    });
    const pop = ui.querySelector('.legend-pop');
    ui.querySelector('.legend').addEventListener('click', () => pop.classList.toggle('on'));
    this.events.once('shutdown', () => { ui.innerHTML = ''; });
  }

  update(time, delta) {
    const dt = delta / 1000;
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
        const sp = 24 * dt;
        w.gx += (dx / d) * sp; w.gy += (dy / d) * sp;
        if (Math.abs(dx) > 1) w.spr.setFlipX(dx < 0);
      } else if (w.wait <= 0) {
        const [px, py] = w.n.plots[Math.floor(Math.random() * w.n.plots.length)];
        w.tx = this.px(px) + TILE * (0.15 + Math.random() * 0.7); w.ty = this.px(py) + TILE * (0.35 + Math.random() * 0.55);
        w.wait = 1.5 + Math.random() * 3;
      }
      w.phase += dt * (walking ? 11 : 2.2);
      const hop = walking ? Math.abs(Math.sin(w.phase)) * 5 : 0;
      const squash = walking ? 1 + Math.sin(w.phase * 2) * 0.05 : 1 + Math.sin(w.phase) * 0.025;
      w.spr.setPosition(w.gx, w.gy - hop).setScale(w.base * (2 - squash), w.base * squash).setDepth(2000 + w.gy);
      w.shadow.setPosition(w.gx, w.gy + 1).setScale(0.42 * (1 - hop / 22), 0.18 * (1 - hop / 22)).setDepth(2000 + w.gy - 1);
    }
    for (const wf of this.warFx) for (const f of wf.fighters) { f.sh.x = f.s.x; }
  }
}
