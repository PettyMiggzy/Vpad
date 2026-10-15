import Phaser from 'phaser';
import { loadLive } from '../chain.js';
import { previewWorld } from '../data.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const w = this.scale.width, h = this.scale.height;
    const label = this.add.text(w / 2, h / 2, 'loading', { color: '#b6ff00', fontSize: '20px' }).setOrigin(0.5);
    this.load.on('progress', (p) => label.setText(`loading ${Math.round(p * 100)}%`));
    for (const u of ['bruiser', 'sniper', 'trickster', 'defender']) this.load.image(u, `art/units/${u}.png`);
    for (const b of ['townhall', 'barracks', 'vault', 'wall', 'guardtower', 'siegeram']) this.load.image(b, `art/buildings/${b}.png`);
    this.load.image('logo', 'art/logo/warheadz-logo.png');
    this.load.image('title', 'art/title/badlands.png');
    const dot = this.textures.createCanvas('spark', 8, 8);
    dot.context.fillStyle = '#ffffff'; dot.context.beginPath(); dot.context.arc(4, 4, 3, 0, 6.3); dot.context.fill(); dot.refresh();
  }

  async create() {
    const live = await loadLive(import.meta.env.BASE_URL);
    this.registry.set('world', live ?? previewWorld());
    this.scene.start(new URLSearchParams(window.location.search).has('logo') ? 'logo' : 'map');
  }
}
