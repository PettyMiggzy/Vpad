import Phaser from 'phaser';
import { LAND, WATER, MOUNTAIN, COAST, PASS } from '../terrain.js';

const TILE = 44;
const COLORS = { [LAND]: 0x16260f, [WATER]: 0x0b3b4a, [MOUNTAIN]: 0x3a3d38, [COAST]: 0x1d3a16, [PASS]: 0x3a3414 };

export class MapScene extends Phaser.Scene {
  constructor() { super('map'); }

  create() {
    this.world = this.registry.get('world');
    const { terrain, radius: RADIUS } = this.world;
    const size = (RADIUS * 2 + 1) * TILE;
    const px = (x) => (x + RADIUS) * TILE;
    const g = this.add.graphics();
    for (let y = -RADIUS; y <= RADIUS; y++) {
      for (let x = -RADIUS; x <= RADIUS; x++) {
        const t = terrain(x, y);
        g.fillStyle(COLORS[t], 1).fillRect(px(x), px(y), TILE - 1, TILE - 1);
        if (t === MOUNTAIN) g.fillStyle(0x6b6f66, 1).fillTriangle(px(x) + 6, px(y) + TILE - 8, px(x) + TILE / 2, px(y) + 8, px(x) + TILE - 6, px(y) + TILE - 8);
        if (t === WATER) g.lineStyle(1, 0x1a7a94, 0.5).lineBetween(px(x) + 6, px(y) + TILE / 2, px(x) + TILE - 6, px(y) + TILE / 2);
        if (t === COAST) g.lineStyle(2, 0xb6ff00, 0.55).strokeRect(px(x) + 2, px(y) + 2, TILE - 5, TILE - 5);
        if (t === PASS) g.lineStyle(2, 0xffd24a, 0.9).strokeRect(px(x) + 2, px(y) + 2, TILE - 5, TILE - 5);
      }
    }
    // nations: their plots tinted, their emblem on the capital
    const byName = new Map(this.world.nations.map((n) => [n.name, n]));
    for (const n of this.world.nations) {
      for (const [x, y] of n.plots) g.fillStyle(n.color, 0.38).fillRect(px(x), px(y), TILE - 1, TILE - 1).lineStyle(2, n.color, 1).strokeRect(px(x), px(y), TILE - 1, TILE - 1);
      const [cx, cy] = n.plots[0];
      const emblem = this.add.image(px(cx) + TILE / 2, px(cy) + TILE / 2 - 4, n.emblem).setDisplaySize(TILE * 1.5, TILE * 1.5 * 0.75).setInteractive({ useHandCursor: true });
      emblem.on('pointerup', (p) => { if (!this.dragged) this.scene.start('base', { nation: n }); });
      this.add.text(px(cx) + TILE / 2, px(cy) + TILE + 6, n.name, { color: '#ffffff', fontSize: '12px', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    }
    // wars: a red glow where two nations touch
    for (const w of this.world.wars) {
      const ax = (w.at[0] + RADIUS + 0.5) * TILE, ay = (w.at[1] + RADIUS + 0.5) * TILE;
      const glow = this.add.circle(ax, ay, TILE * 0.9, 0xff2a2a, 0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, alpha: 0.12, scale: 1.5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.add.text(ax, ay - TILE * 0.9, `${w.a} vs ${w.b}`, { color: '#ff6a6a', fontSize: '11px', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    }

    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setBounds(-3000, -3000, size + 6000, size + 6000);
    cam.setZoom(Math.min(this.scale.width, this.scale.height) / (size + 90));
    cam.centerOn(size / 2, size / 2);
    this.dragged = false;
    this.input.on('pointermove', (p) => {
      if (!p.isDown) return;
      if (p.getDistance() > 6) this.dragged = true;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('pointerdown', () => { this.dragged = false; });
    this.input.on('wheel', (_p, _o, _dx, dy) => { cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.3, 3)); });

    // the screen furniture stays put: a second camera that draws only it
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    const hud = [
      this.add.text(16, 14, 'VYRE BAD LANDS', { color: '#b6ff00', fontSize: '22px', fontStyle: 'bold' }),
      this.add.text(16, 44, this.world.live ? `LIVE · read from the contracts on ${this.world.rpc} (a test chain)` : 'PREVIEW · the map is real (the contract\'s own terrain); the nations and wars are made up', { color: this.world.live ? '#b6ff00' : '#ffd24a', fontSize: '12px' }),
      this.add.text(16, 64, 'drag to move · wheel to zoom · click a nation', { color: '#9aa', fontSize: '12px' }),
      this.add.text(16, this.scale.height - 40, 'lime border: coast (premium)   gold border: mountain pass (premium)   red glow: war', { color: '#cfe', fontSize: '12px' }),
    ];
    hud.forEach((h) => h.setScrollFactor(0));
    cam.ignore(hud);
    ui.ignore(this.children.list.filter((c) => !hud.includes(c)));
    this.scale.on('resize', (s) => { ui.setSize(s.width, s.height); cam.setSize(s.width, s.height); cam.centerOn(size / 2, size / 2); });
  }
}
