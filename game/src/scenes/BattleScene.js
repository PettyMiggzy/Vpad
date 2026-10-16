import Phaser from 'phaser';
import { powers, UNIT_NAMES } from '../combat.js';
import { CHARS, ATTACK, FRAME, impactMs, attackMs, makeFighter } from '../anim.js';

const DPR = () => window.__dpr || 1;
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// A raid, played out. The outcome is the contract's own formula (combat.js); the fight is dressed around it: both armies march in,
// trade blows (melee units step in, snipers shoot tracers), the loser's bar empties and its army falls.
export class BattleScene extends Phaser.Scene {
  constructor() { super('battle'); }

  init(data) { this.att = data.a; this.def = data.b; this.back = data.back || 'map'; this.token = (this.token || 0) + 1; }

  create() {
    const W = this.scale.width, H = this.scale.height, d = DPR();
    this.alive = true;
    this.run = this.token;
    const portrait = window.innerWidth < 900;
    this.portrait = portrait;
    const a = this.att, b = this.def;
    this.result = powers([a.units[0], a.units[1], a.units[2]], b.units, b.wall, b.tower, false);

    // --- the field: dirt ground with a grass verge, a backdrop of mountains, trees and rocks at the edges ---
    this.add.tileSprite(0, 0, W, H, 'g_dirt').setOrigin(0).setTint(0xb7a68c).setTileScale(1.2 * d);
    const horizon = H * 0.34;
    this.add.tileSprite(0, 0, W, horizon, 'g_lush').setOrigin(0).setTint(0xb0b0b0).setTileScale(1.1 * d);
    const edge = this.add.graphics();
    edge.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.0, 0.55, 0.55).fillRect(0, horizon - 30 * d, W, 32 * d);
    const hills = ['mount0', 'mesa0', 'mount1', 'mesa1', 'mount2', 'mesa2', 'mount3'];
    const hw = Math.max(W / 3.4, 150 * d);
    for (let i = -1; i < W / hw + 1; i++) {
      const k = hills[(i + 7) % hills.length];
      const s = this.add.image(i * hw * 0.82 + hw * 0.4, horizon + 10 * d, k).setOrigin(0.5, 1);
      s.setScale(hw / s.width).setDepth(1);
    }
    for (let i = 0; i < 7; i++) {
      const s = this.add.image(Phaser.Math.Between(0, W), horizon + Phaser.Math.Between(4, 30) * d, `lush${i % 6}`).setOrigin(0.5, 1);
      s.setScale((60 + Math.random() * 30) * d / s.height).setDepth(2);
    }
    for (let i = 0; i < 9; i++) {
      const x = Phaser.Math.Between(0, W), y = H * (0.42 + Math.random() * 0.5);
      if (Math.abs(x - W / 2) < W * 0.1) continue;
      const s = this.add.image(x, y, `flora${[7, 8, 11, 14, 4, 0][i % 6]}`).setOrigin(0.5, 1);
      s.setScale((26 + Math.random() * 18) * d / s.height).setAlpha(0.95).setDepth(3);
    }
    this.add.image(W / 2, H * 0.56, 'glow').setTint(0xffffff).setAlpha(0.1).setScale(W / 90, H / 300).setDepth(3);

    // --- the two armies ---
    this.fighters = { L: [], R: [] };
    this.hp = { L: 1, R: 1 };
    this.size = portrait ? Math.min(W * 0.3, H * 0.19) : Math.min(W * 0.13, H * 0.3);
    this.placeArmy('L', a, [0, 1, 2]);
    this.placeArmy('R', b, [0, 1, 2, 3]);
    this.dust = this.add.particles(0, 0, 'spark', { speed: { min: 30, max: 140 }, angle: { min: 200, max: 340 }, gravityY: 260, lifespan: 520, scale: { start: 1.1, end: 0 }, tint: [0xffe066, 0xff7a2a, 0xffffff], emitting: false, blendMode: 'ADD' }).setDepth(99999);
    this.puff = this.add.particles(0, 0, 'glow', { speed: { min: 10, max: 60 }, lifespan: 600, scale: { start: 0.25, end: 0.7 }, alpha: { start: 0.35, end: 0 }, tint: 0xb9a98a, emitting: false }).setDepth(99998);

    this.hud();
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.events.once('shutdown', () => { this.alive = false; document.getElementById('ui').innerHTML = ''; });
    this.sequence();
  }

  // stand an army in two columns: melee in the front column (nearer the middle), snipers behind; sprite counts follow the army's size
  placeArmy(side, n, types) {
    const W = this.scale.width, H = this.scale.height;
    const list = [];
    for (const t of types) {
      const c = n.units[t];
      if (c <= 0) continue;
      const k = c >= 60 && t !== 1 ? 2 : 1;
      for (let i = 0; i < k; i++) list.push({ t, ch: CHARS[t] });
    }
    if (!list.length) list.push({ t: 0, ch: n.emblem || 'bruiser' });
    const sign = side === 'L' ? 1 : -1;
    const frontX = side === 'L' ? W * (this.portrait ? 0.37 : 0.4) : W * (this.portrait ? 0.63 : 0.6);
    const backX = side === 'L' ? W * (this.portrait ? 0.19 : 0.22) : W * (this.portrait ? 0.81 : 0.78);
    const front = list.filter((u) => u.ch !== 'sniper').slice(0, 5), back = list.filter((u) => u.ch === 'sniper').slice(0, 2);
    const top = H * (this.portrait ? 0.5 : 0.55), bottom = H * (this.portrait ? 0.9 : 0.93);
    const spread = (arr, x, off) => arr.forEach((u, i) => {
      const y = arr.length === 1 ? (top + bottom) / 2 + off : top + (bottom - top) * (i / (arr.length - 1)) + off;
      const s = makeFighter(this, u.ch, x - sign * W * 0.4, y, this.size, side === 'R');
      s.home = { x, y }; s.side = side; s.setDepth(y).setAlpha(0);
      s.shadow = this.add.image(x, y - 2, 'blob').setScale(this.size / 128 * 0.8, this.size / 128 * 0.26).setDepth(y - 1).setAlpha(0);
      this.fighters[side].push(s);
    });
    spread(front, frontX, 0); spread(back, backX, -H * 0.02);
    this.fighters[side].sort((p1, p2) => p1.home.y - p2.home.y);
  }

  hud() {
    const a = this.att, b = this.def;
    const ui = document.getElementById('ui');
    ui.innerHTML = `
      <div class="battle-top">
        <button class="back" data-back>‹ Back</button>
        <div class="vs">
          <div class="side l"><b style="color:${hex(a.color)}">${a.name}</b><div class="bar"><i data-hp="L" style="background:${hex(a.color)}"></i></div><small>attack ${this.result.attack.toLocaleString()}</small></div>
          <div class="x">VS</div>
          <div class="side r"><b style="color:${hex(b.color)}">${b.name}</b><div class="bar"><i data-hp="R" style="background:${hex(b.color)}"></i></div><small>defense ${this.result.defense.toLocaleString()}</small></div>
        </div>
      </div>
      <div class="banner" data-banner></div>
      <div class="battle-result" data-result></div>`;
    ui.querySelector('[data-back]').addEventListener('click', () => this.leave());
    this.setHp('L', 1); this.setHp('R', 1);
  }

  setHp(side, v) {
    this.hp[side] = Math.max(0, v);
    const el = document.querySelector(`[data-hp="${side}"]`);
    if (el) el.style.width = `${Math.round(this.hp[side] * 100)}%`;
  }

  leave() {
    this.alive = false;
    if (this.back === 'base') this.scene.start('base', { nation: this.att });
    else this.scene.start('map');
  }

  wait(ms) { return new Promise((res) => this.time.delayedCall(ms, () => res(this.alive && this.run === this.token))); }

  banner(text, ms = 1100, color = '#ffffff') {
    const el = document.querySelector('[data-banner]');
    if (!el) return;
    el.textContent = text; el.style.color = color; el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), ms);
  }

  // ---- the fight ----
  async sequence() {
    const ok = async (ms) => (await this.wait(ms));
    // march in
    this.banner(`${this.att.name}  ⚔  ${this.def.name}`, 1500);
    for (const side of ['L', 'R']) this.fighters[side].forEach((s, i) => {
      s.play(`${s.ch}_walk`);
      this.tweens.add({ targets: [s, s.shadow], alpha: 1, duration: 300, delay: i * 80 });
      this.tweens.add({ targets: s, x: s.home.x, duration: 1300, delay: i * 80, ease: 'Sine.out', onUpdate: () => { s.shadow.x = s.x; }, onComplete: () => { s.stop(); s.setFrame(0); } });
    });
    if (!(await ok(1800))) return;
    this.banner('FIGHT!', 800, '#ff5a5a');
    if (!(await ok(900))) return;

    const success = this.result.success;
    const winner = success ? 'L' : 'R', loser = success ? 'R' : 'L';
    const hits = 5; // blows the loser takes
    const ratio = Math.min(0.85, Math.max(0.25, success ? this.result.defense / Math.max(1, this.result.attack) : this.result.attack / Math.max(1, this.result.defense)));
    const per = { [loser]: 1 / hits, [winner]: ratio / hits };
    const power = { L: this.result.attack, R: this.result.defense };
    for (let i = 0; i < hits * 2 + 1; i++) {
      // the winner's army lands a blow, then the loser's answers (one fewer for the loser)
      const side = i % 2 === 0 ? winner : loser;
      if (side === loser && i >= hits * 2) break;
      const foe = side === 'L' ? 'R' : 'L';
      await this.blow(side, foe, Math.round((power[side] / hits) * (0.8 + Math.random() * 0.4)), per[foe]);
      if (!this.alive || this.run !== this.token) return;
      if (!(await ok(160))) return;
    }
    this.setHp(loser, 0);
    await this.finish(winner, loser);
  }

  pick(side) { const a = this.fighters[side]; return a[Math.floor(Math.random() * a.length)]; }

  async blow(side, foe, dmg, hpLoss) {
    const u = this.pick(side), t = this.pick(foe);
    const info = ATTACK[u.ch];
    const dir = side === 'L' ? 1 : -1;
    const melee = !info.ranged;
    const gap = Math.abs(t.home.x - u.home.x);
    if (melee) this.tweens.add({ targets: u, x: u.home.x + dir * gap * 0.62, duration: 320, ease: 'Quad.out', onUpdate: () => { u.shadow.x = u.x; } });
    u.setDepth(u.y + 5000);
    u.play(`${u.ch}_attack`);
    await this.wait(impactMs(u.ch) + (melee ? 120 : 0));
    if (!this.alive) return;
    if (info.ranged) await this.tracer(u, t, dir);
    this.hit(t, u, dmg, hpLoss);
    await this.wait(Math.max(200, attackMs(u.ch) - impactMs(u.ch)));
    if (!this.alive) return;
    if (melee) this.tweens.add({ targets: u, x: u.home.x, duration: 260, ease: 'Quad.inOut', onUpdate: () => { u.shadow.x = u.x; }, onComplete: () => u.setDepth(u.home.y) });
    else u.setDepth(u.home.y);
    u.setFrame(0);
  }

  tracer(from, to, dir) {
    return new Promise((res) => {
      const x0 = from.x + dir * this.size * 0.42, y0 = from.y - this.size * 0.5;
      const x1 = to.x, y1 = to.y - this.size * 0.4;
      const g = this.add.graphics().setDepth(99990);
      const o = { t: 0 };
      this.tweens.add({ targets: o, t: 1, duration: 170, onUpdate: () => {
        g.clear();
        const hx = x0 + (x1 - x0) * o.t, hy = y0 + (y1 - y0) * o.t, tx = x0 + (x1 - x0) * Math.max(0, o.t - 0.25), ty = y0 + (y1 - y0) * Math.max(0, o.t - 0.25);
        g.lineStyle(7 * DPR(), 0xb6ff00, 0.35).lineBetween(tx, ty, hx, hy);
        g.lineStyle(3 * DPR(), 0xffffff, 1).lineBetween(tx, ty, hx, hy);
      }, onComplete: () => { g.destroy(); res(); } });
    });
  }

  hit(t, from, dmg, hpLoss) {
    const d = DPR();
    // white flash, knock-back, shake, sparks and a damage number
    t.setTintFill(0xffffff);
    this.time.delayedCall(70, () => t.clearTint());
    const dir = from.side === 'L' ? 1 : -1;
    this.tweens.add({ targets: t, x: t.x + dir * 14 * d, duration: 80, yoyo: true, ease: 'Quad.out', onUpdate: () => { t.shadow.x = t.x; } });
    this.cameras.main.shake(130, 0.004);
    this.dust.emitParticleAt(t.x, t.y - this.size * 0.4, 14);
    this.puff.emitParticleAt(t.x, t.y - 4, 3);
    const n = this.add.text(t.x, t.y - this.size * 0.75, `-${dmg.toLocaleString()}`, { fontFamily: 'system-ui', fontSize: `${22 * d}px`, fontStyle: '900', color: '#ffe066', stroke: '#000', strokeThickness: 5 * d, resolution: 2 }).setOrigin(0.5).setDepth(99999);
    this.tweens.add({ targets: n, y: n.y - 46 * d, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => n.destroy() });
    const side = t.side;
    this.setHp(side, this.hp[side] - hpLoss);
  }

  async finish(winner, loser) {
    const d = DPR();
    // the loser's army falls, the winner's cheers
    this.fighters[loser].forEach((s, i) => {
      s.setTint(0x777777);
      this.tweens.add({ targets: s, angle: (loser === 'L' ? -1 : 1) * 78, y: s.y + 10 * d, alpha: 0.4, duration: 520, delay: i * 90, ease: 'Quad.in' });
      this.tweens.add({ targets: s.shadow, alpha: 0.2, duration: 400, delay: i * 90 });
    });
    this.fighters[winner].forEach((s, i) => {
      s.setFrame(0);
      this.tweens.add({ targets: s, y: s.y - 26 * d, duration: 240, yoyo: true, repeat: 2, delay: i * 120, ease: 'Quad.out' });
    });
    this.cameras.main.flash(250, 255, 255, 255, true);
    const a = this.att, b = this.def, r = this.result;
    const wName = winner === 'L' ? a.name : b.name;
    this.banner(r.success ? 'RAID SUCCEEDS' : 'RAID FAILS', 4000, r.success ? '#b6ff00' : '#ff5a5a');
    if (!(await this.wait(900))) return;
    const el = document.querySelector('[data-result]');
    if (!el) return;
    el.innerHTML = `<h3 style="color:${hex(winner === 'L' ? a.color : b.color)}">${wName} wins</h3>
      <p>${r.success ? `${a.name} breaks ${b.name}'s defense` : `${b.name} holds the line against ${a.name}`}.<br/>Attack <b>${r.attack.toLocaleString()}</b> vs defense <b>${r.defense.toLocaleString()}</b>. A fixed formula, no luck.</p>
      <div class="row"><button class="btn primary" data-replay>Watch again</button><button class="btn" data-back2>${this.back === 'base' ? 'Back to base' : 'Back to the map'}</button></div>`;
    el.classList.add('on');
    el.querySelector('[data-replay]').addEventListener('click', () => this.scene.restart({ a, b, back: this.back }));
    el.querySelector('[data-back2]').addEventListener('click', () => this.leave());
  }
}
