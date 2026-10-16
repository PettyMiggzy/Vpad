import Phaser from 'phaser';
import { loadLive } from '../chain.js';
import { previewWorld } from '../data.js';
import { buildGrid, paintWorld } from '../worldgen.js';
import { loadAnimSheets, makeAnims } from '../anim.js';
import { Sim } from '../sim.js';

const setBoot = (msg, pct) => { const m = document.getElementById('bootmsg'), b = document.getElementById('bootbar'); if (m) m.textContent = msg; if (b && pct != null) b.style.width = `${Math.max(4, Math.round(pct * 100))}%`; };

export const PROPS = {
  mount: 4, tree: 6, rock: 10, ruin: 6, mesa: 5, flora: 15, lush: 6,
};

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const bar = document.getElementById('boot');
    this.load.on('progress', (p) => setBoot('loading art', p * 0.4));
    for (const u of ['bruiser', 'sniper', 'trickster', 'defender']) this.load.image(u, `art/units/${u}.png`);
    for (const b of ['townhall', 'barracks', 'vault', 'wall', 'guardtower', 'siegeram']) this.load.image(b, `art/buildings/${b}.png`);
    for (const t of ['grass', 'dirt', 'rock', 'water', 'sand', 'lush', 'redrock', 'slate']) this.load.image(`g_${t}`, `art/tiles/g_${t}.jpg`);
    for (const [k, n] of Object.entries(PROPS)) for (let i = 0; i < n; i++) this.load.image(`${k}${i}`, `art/props/${k}${i}.png`);
    for (const t of ['bruiser', 'sniper', 'trickster', 'defender', 'townhall', 'barracks', 'vault', 'wall', 'guardtower']) this.load.image(`t_${t}`, `art/trim/${t}.png`);
    for (const t of ['b_keep', 'b_gate', 'b_wall', 'b_barracks', 'b_vault', 'b_tower', 'c_crates', 'c_tent', 'c_ram', 'c_tent2', 'c_rack', 'c_tent3']) this.load.image(t, `art/trim/${t}.png`);
    loadAnimSheets(this);
    this.load.image('logo', 'art/logo/warheadz-logo.png');
    this.load.image('title', 'art/title/badlands.png');
  }

  async create() {
    const bar = document.getElementById('boot');
    this.makeSprites();
    makeAnims(this);
    setBoot('reading the chain', 0.45);
    const live = await loadLive(import.meta.env.BASE_URL);
    const forcePreview = new URLSearchParams(window.location.search).has('preview');
    const params = new URLSearchParams(window.location.search);
    let world = forcePreview ? previewWorld() : (live && live.nations.length && !params.has('play') ? live : null);
    if (!world) {
      // no real nations yet (or ?play): the play-test sandbox, the game's rules with play money, saved in this browser
      world = previewWorld();
      if (!forcePreview) { try { new Sim(world); } catch (e) { console.warn('sandbox save unusable, starting fresh', e); try { localStorage.removeItem('badlands.sandbox.v2'); } catch (_) { /* ignore */ } world = previewWorld(); new Sim(world); } }
    }
    this.registry.set('world', world);
    if (new URLSearchParams(window.location.search).has('logo')) {
      if (bar) bar.remove();
      this.scene.start('logo');
      return;
    }
    const grid = buildGrid(world);
    this.registry.set('grid', grid);
    const { ground, shimmer } = await paintWorld(this, grid, (p) => setBoot('painting the Bad Lands', 0.5 + p * 0.5), world);
    this.textures.addCanvas('ground', ground);
    this.textures.addCanvas('shimmer', shimmer);
    if (bar) bar.remove();
    this.scene.start('map');
  }

  // small shared sprites drawn once: soft glow, cloud shadow, spark, shadow blob
  makeSprites() {
    const mk = (key, size, draw) => {
      const c = this.textures.createCanvas(key, size, size);
      draw(c.context, size);
      c.refresh();
    };
    mk('glow', 128, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    });
    mk('spark', 16, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    });
    mk('blob', 128, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    });
    mk('cloud', 256, (x, s) => {
      for (let i = 0; i < 9; i++) {
        const cx = s * (0.25 + Math.random() * 0.5), cy = s * (0.3 + Math.random() * 0.4), r = s * (0.14 + Math.random() * 0.16);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, s, s);
      }
    });
  }
}
