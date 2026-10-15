import Phaser from 'phaser';

// The Vyre Bad Lands title: lime slashes cut the screen, the title drops in, the units rush in and clash under it, then
// everything idles (breathing glow, sparks). `?logo` in the page address opens this scene.
export class LogoScene extends Phaser.Scene {
  constructor() { super('logo'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const cx = W / 2, cy = H * 0.42;
    this.cameras.main.setBackgroundColor('#000000');
    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: W }, y: { min: H * 0.3, max: H }, lifespan: 4000, speedY: { min: -30, max: -8 }, speedX: { min: -6, max: 6 },
      scale: { start: 0.6, end: 0 }, alpha: { start: 0.5, end: 0 }, quantity: 1, frequency: 140, blendMode: 'ADD', tint: 0xb6ff00,
    });

    // three slashes across the screen
    const slash = (y, delay, angle) => {
      const s = this.add.rectangle(-W, y, W * 1.6, 7, 0xb6ff00).setAngle(angle).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95);
      this.tweens.add({ targets: s, x: W * 1.6, delay, duration: 520, ease: 'Cubic.in', onComplete: () => s.destroy() });
    };
    slash(cy - 70, 100, -9); slash(cy, 260, 7); slash(cy + 80, 420, -5);

    // the title, with a second copy on top that breathes
    const title = this.add.image(cx, cy, 'title').setAlpha(0).setScale(1.25);
    const maxW = Math.min(W * 0.92, 980);
    const base = maxW / title.width;
    title.setScale(base * 1.25);
    const glow = this.add.image(cx, cy, 'title').setScale(base).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.time.delayedCall(560, () => {
      this.cameras.main.shake(260, 0.006);
      this.cameras.main.flash(180, 182, 255, 0);
      this.tweens.add({ targets: title, alpha: 1, scale: base, duration: 240, ease: 'Back.out' });
      this.tweens.add({ targets: glow, alpha: { from: 0, to: 0.35 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 300 });
    });

    // the units: bruiser and defender hold the corners, the trickster crosses in front, the sniper fires over the title
    const floor = H - 150;
    const mk = (key, x, y, w, flip) => this.add.image(x, y, key).setDisplaySize(w, w * 0.75).setFlipX(!!flip).setAlpha(0);
    const bruiser = mk('bruiser', -300, floor, 360);
    const defender = mk('defender', W + 300, floor, 340, true);
    const sniper = mk('sniper', cx - 60, H + 260, 300);
    const trickster = mk('trickster', cx, -260, 300);
    const enter = (o, x, y, delay) => this.tweens.add({ targets: o, x, y, alpha: 1, delay, duration: 700, ease: 'Cubic.out' });
    enter(bruiser, cx - Math.min(W * 0.34, 470), floor, 900);
    enter(defender, cx + Math.min(W * 0.34, 470), floor, 1000);
    enter(sniper, cx - 150, floor + 6, 1300);
    enter(trickster, cx + 150, floor - 10, 1400);
    [bruiser, defender, sniper, trickster].forEach((o, i) => this.time.delayedCall(2300, () => this.tweens.add({ targets: o, y: o.y - 8, duration: 1100 + i * 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' })));

    // the clash: the bruiser and the defender step in, a lime burst, the sniper's bolt crosses the title
    this.time.delayedCall(2100, () => {
      this.tweens.add({ targets: bruiser, x: bruiser.x + 70, duration: 160, yoyo: true, ease: 'Quad.out' });
      this.tweens.add({ targets: defender, x: defender.x - 70, duration: 160, yoyo: true, ease: 'Quad.out' });
      this.tweens.add({ targets: trickster, x: trickster.x - 380, duration: 220, yoyo: true, ease: 'Quad.inOut' });
      const bolt = this.add.rectangle(sniper.x + 120, sniper.y - 70, 24, 6, 0xb6ff00).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: bolt, x: W + 100, scaleX: 12, alpha: 0, duration: 520, ease: 'Quad.in', onComplete: () => bolt.destroy() });
      const burst = this.add.circle(cx, floor - 60, 20, 0xb6ff00, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: burst, scale: 8, alpha: 0, duration: 420, onComplete: () => burst.destroy() });
      this.cameras.main.shake(180, 0.005);
    });
    this.time.addEvent({ delay: 4200, loop: true, callback: () => { this.tweens.add({ targets: sniper, x: sniper.x - 14, duration: 90, yoyo: true }); const b = this.add.rectangle(sniper.x + 120, sniper.y - 70, 24, 6, 0xb6ff00).setBlendMode(Phaser.BlendModes.ADD); this.tweens.add({ targets: b, x: W + 100, scaleX: 12, alpha: 0, duration: 520, ease: 'Quad.in', onComplete: () => b.destroy() }); } });
  }
}
