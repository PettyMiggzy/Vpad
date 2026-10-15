import Phaser from 'phaser';
import { powers, UNIT_NAMES } from '../combat.js';
import { train, collectReady, buildDefense, readNation } from '../chain.js';

const UNIT_KEYS = ['bruiser', 'sniper', 'trickster', 'defender'];
const BUILDS = [
  ['wall', 'Wall', '+10% defense'],
  ['guardtower', 'Guard tower', '+10% defense'],
  ['vault', 'Vault', 'protects treasury'],
  ['barracks', 'Barracks', 'trains units'],
  ['siegeram', 'Siege ram', 'breaks walls'],
];

export class BaseScene extends Phaser.Scene {
  constructor() { super('base'); }

  init(data) { this.nation = data.nation; }

  create() {
    const n = this.nation;
    const W = this.scale.width, H = this.scale.height;
    this.add.text(20, 16, `${n.name}  ·  base`, { color: '#b6ff00', fontSize: '26px', fontStyle: 'bold' });
    this.add.text(20, 50, n.holders === null ? 'LIVE · read from the contracts' : 'PREVIEW · made-up numbers', { color: n.holders === null ? '#b6ff00' : '#ffd24a', fontSize: '12px' });
    const back = this.add.text(W - 20, 20, '← back to the map', { color: '#fff', fontSize: '16px', backgroundColor: '#1d3a16', padding: { x: 10, y: 6 } }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('map'));

    // the town hall
    this.add.image(W * 0.3, H * 0.4, 'townhall').setDisplaySize(380, 285);
    this.add.text(W * 0.3, H * 0.4 + 160, `${n.holders === null ? '' : n.holders.toLocaleString() + ' holders   ·   '}war pool $${n.pool}`, { color: '#cfe', fontSize: '14px' }).setOrigin(0.5);

    // buildings
    BUILDS.forEach(([key, label, note], i) => {
      const x = 40 + i * 150, y = H - 190;
      this.add.rectangle(x + 65, y + 70, 135, 165, 0x0d160d).setStrokeStyle(1, 0x27391a);
      this.add.image(x + 65, y + 55, key).setDisplaySize(110, 82);
      this.add.text(x + 65, y + 110, label, { color: '#fff', fontSize: '13px', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(x + 65, y + 130, note, { color: '#9aa', fontSize: '11px' }).setOrigin(0.5);
      this.add.text(x + 65, y + 148, 'burns coin to build', { color: '#b6ff00', fontSize: '10px' }).setOrigin(0.5);
    });

    // the army
    this.sprites = [];
    UNIT_KEYS.forEach((key, i) => {
      const x = W * 0.62 + (i % 2) * 190, y = 130 + Math.floor(i / 2) * 215;
      const s = this.add.image(x, y, key).setDisplaySize(180, 135).setInteractive({ useHandCursor: true });
      s.baseY = y; s.baseX = x;
      this.sprites.push(s);
      (this.unitLabels ??= [])[i] = this.add.text(x, y + 80, `${UNIT_NAMES[i]}  ×${n.units[i]}`, { color: '#fff', fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5);
      this.tweens.add({ targets: s, y: y - 4, duration: 1200 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      s.on('pointerup', () => this.hit(s));
    });

    // a fight preview, scored by the same formula as the contract
    const enemy = { units: [60, 30, 20, 10], wall: 1, tower: 0 };
    const send = [n.units[0], n.units[1], n.units[2]];
    const r = powers(send, enemy.units, enemy.wall, enemy.tower, false);
    const btn = this.add.text(W * 0.62 + 95, H - 215, 'Fight preview', { color: '#050805', backgroundColor: '#b6ff00', fontSize: '18px', fontStyle: 'bold', padding: { x: 16, y: 8 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.result = this.add.text(W * 0.62 + 95, H - 175, `sending ${send.join(' / ')} against 60 / 30 / 20 + 10 defenders\n(wall 1)`, { color: '#9aa', fontSize: '12px', align: 'center' }).setOrigin(0.5, 0);
    btn.on('pointerup', () => {
      this.sprites.slice(0, 3).forEach((s, i) => { if (send[i] > 0) this.time.delayedCall(i * 250, () => this.lunge(s)); });
      this.time.delayedCall(900, () => this.result.setText(`attack ${r.attack}  vs  defense ${r.defense}\n${r.success ? 'RAID SUCCEEDS' : 'RAID FAILS'}  (a fixed formula, no luck)`).setColor(r.success ? '#b6ff00' : '#ff6a6a'));
    });
    if (this.registry.get('world').live && n.token) this.actions(n, W, H);
    this.add.text(20, H - 20, 'unit counters: bruiser > trickster > sniper > bruiser', { color: '#9aa', fontSize: '12px' }).setOrigin(0, 1);
  }

  lunge(s) {
    this.tweens.add({ targets: s, x: s.baseX - 60, duration: 140, yoyo: true, ease: 'Quad.out', onYoyo: () => this.hit(s) });
  }

  hit(s) {
    s.setTint(0xff5555);
    this.tweens.add({ targets: s, angle: { from: -4, to: 4 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => { s.setAngle(0); s.clearTint(); } });
  }

  // the player's buttons: each sends one real transaction to the game's contract (the page's wallet, or the local test key)
  actions(n, W, H) {
    const world = this.registry.get('world');
    const status = this.add.text(20, 82, 'ready: each button sends a transaction', { color: '#9aa', fontSize: '12px', wordWrap: { width: W * 0.5 } });
    const run = async (label, fn) => {
      status.setText(`${label}: waiting for the wallet and the chain…`).setColor('#ffd24a');
      try {
        const r = await fn();
        const fresh = await readNation(world, n.token);
        fresh.units.forEach((u, i) => this.unitLabels[i].setText(`${UNIT_NAMES[i]}  ×${u}`));
        n.units = fresh.units;
        status.setText(`${label}: done${r && r.hash ? `  tx ${r.hash.slice(0, 18)}…` : ''}`).setColor('#b6ff00');
      } catch (e) {
        status.setText(`${label}: ${String(e.shortMessage || e.reason || e.message).slice(0, 90)}`).setColor('#ff6a6a');
      }
    };
    const btn = (x, y, label, fn) => {
      const b = this.add.text(x, y, label, { color: '#050805', backgroundColor: '#b6ff00', fontSize: '13px', fontStyle: 'bold', padding: { x: 8, y: 5 } }).setInteractive({ useHandCursor: true });
      b.on('pointerup', () => run(label, fn));
      return b;
    };
    ['bruiser', 'sniper', 'trickster', 'defender'].forEach((u, i) => btn(20 + i * 170, 110, `Train 5 ${u}`, () => train(world, n.token, i, 5)));
    btn(20, 144, 'Collect ready units', async () => ({ hash: (await collectReady(world))[0] }));
    btn(210, 144, 'Build wall', () => buildDefense(world, n.token, true));
    btn(330, 144, 'Build tower', () => buildDefense(world, n.token, false));
  }
}
