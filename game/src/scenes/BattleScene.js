import Phaser from 'phaser';
import { powers, UNIT_NAMES, losses } from '../combat.js';
import { CHARS, ATTACK, FRAME, impactMs, attackMs, makeFighter, flipFor } from '../anim.js';

const DPR = () => window.__dpr || 1;
const hex = (c) => `#${(Number(c) >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A raid, played out. The outcome is the contract's own formula (combat.js); the fight is dressed around it: both armies march in,
// trade blows (melee units step in, snipers shoot tracers), the loser's bar empties and its army falls.
export class BattleScene extends Phaser.Scene {
  constructor() { super('battle'); }

  init(data) {
    this.data0 = data;
    this.fastIx = 0;
    this.report = data.report || null;
    this.att = this.report ? this.report.a : data.a;
    this.def = this.report ? this.report.b : data.b;
    this.send = this.report ? this.report.send : [data.a.units[0], data.a.units[1], data.a.units[2]];
    this.home = data.home || null;
    this.back = data.back || 'map';
    this.token = (this.token || 0) + 1;
  }

  create() {
    const W = this.scale.width, H = this.scale.height, d = DPR();
    this.alive = true;
    this.run = this.token;
    const portrait = W <= H * 1.1;   // by the shape of the screen, not its width: a phone turned on its side is a wide screen
    this.portrait = portrait;
    const a = this.att, b = this.def;
    this.result = this.report ? this.report.result : powers(this.send, b.units, b.wall, b.tower, false);

    // --- the field: dirt ground with a grass verge, a backdrop of mountains, trees and rocks at the edges ---
    this.add.tileSprite(0, 0, W, H, 'g_dirt').setOrigin(0).setTint(0xb7a68c).setTileScale(1.2 * d);
    const horizon = H * 0.34;
    // a smoky dusk sky over the wastes: the sky darkens upward, the horizon glows from the volcanoes, ash clouds drift
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x08060c, 0x08060c, 0x7a2a12, 0x7a2a12, 1).fillRect(0, 0, W, horizon + 14 * d);
    this.add.image(W / 2, horizon, 'glow').setTint(0xff6a20).setAlpha(0.55).setScale(W / 60, 2.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(0.5);
    for (let i = 0; i < 6; i++) {
      const c = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(Math.round(H * 0.04), Math.round(horizon * 0.9)), 'cloud').setTint(0x2a2220).setAlpha(0.5).setScale((1.6 + Math.random() * 1.8) * d).setDepth(0.6);
      this.tweens.add({ targets: c, x: c.x + (Math.random() < 0.5 ? -1 : 1) * W * 0.15, duration: 14000 + Math.random() * 9000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    const hills = ['mount0', 'mesa0', 'mount1', 'mesa1', 'mount2', 'mesa2', 'mount3'];
    const hw = Math.max(W / 3.4, 150 * d);
    for (let i = -1; i < W / hw + 1; i++) {
      const k = hills[(i + 7) % hills.length];
      const s = this.add.image(i * hw * 0.82 + hw * 0.4, horizon + 10 * d, k).setOrigin(0.5, 1);
      s.setScale(hw / s.width).setDepth(1).setTint(0x8a6e66);
      if (k.startsWith('mount')) {   // volcano: a lava glow at the crest
        const g = this.add.image(s.x, s.y - s.displayHeight * 0.78, 'glow').setTint(0xff5a14).setAlpha(0.7).setScale(Math.max(0.6, s.displayWidth / 260)).setBlendMode(Phaser.BlendModes.ADD).setDepth(1.1);
        this.tweens.add({ targets: g, alpha: 0.3, duration: 900 + Math.random() * 700, yoyo: true, repeat: -1 });
      }
    }
    for (let i = 0; i < 5; i++) {
      const s = this.add.image(Phaser.Math.Between(0, W), horizon + Phaser.Math.Between(4, 30) * d, `tree${[0, 3, 4, 1, 5][i % 5]}`).setOrigin(0.5, 1);
      s.setScale((50 + Math.random() * 24) * d / s.height).setDepth(2).setTint(0x4a5040);
    }
    for (let i = 0; i < 9; i++) {
      const x = Phaser.Math.Between(0, W), y = H * (0.42 + Math.random() * 0.5);
      if (Math.abs(x - W / 2) < W * 0.1) continue;
      const s = this.add.image(x, y, `flora${[7, 8, 11, 14, 4, 0][i % 6]}`).setOrigin(0.5, 1);
      s.setScale((26 + Math.random() * 18) * d / s.height).setAlpha(0.95).setDepth(3).setTint(0x66705a);
    }
    this.add.image(W / 2, H * 0.56, 'glow').setTint(0xffffff).setAlpha(0.1).setScale(W / 90, H / 300).setDepth(3);

    // --- the two armies ---
    this.fighters = { L: [], R: [] };
    this.mass = { L: [], R: [] };
    this.vehicles = { L: [], R: [] };
    this.prog = { L: 0, R: 0 };
    this.hp = { L: 1, R: 1 };
    this.size = portrait ? Math.min(W * 0.26, H * 0.165) : Math.min(W * 0.12, H * 0.27);
    const armyA = { ...a, units: [this.send[0], this.send[1], this.send[2], 0] };
    // what each side loses is the contract's rule (a failed raid costs the attacker half, a won one a tenth; the defender loses three tenths or a tenth)
    const won = this.result.success;
    this.lossFrac = { L: won ? 0.1 : 0.5, R: won ? 0.3 : 0.1 };
    this.start = { L: armyA.units.reduce((t, v) => t + v, 0), R: b.units.reduce((t, v) => t + v, 0) };
    this.loss = losses(this.send, b.units, won);
    this.showUnits = !!this.report && !this.report.estimated;
    this.fortress = this.addFortress();
    this.placeArmy('L', armyA, [0, 1, 2]);
    this.placeArmy('R', b, [0, 1, 2, 3]);
    this.addMass('L', armyA); this.addMass('R', b);
    this.addVehicles('L', armyA); this.addVehicles('R', b);
    this.carry = { L: 0, R: 0 };
    this.dust = this.add.particles(0, 0, 'spark', { speed: { min: 30, max: 140 }, angle: { min: 200, max: 340 }, gravityY: 260, lifespan: 520, scale: { start: 1.1, end: 0 }, tint: [0xffe066, 0xff7a2a, 0xffffff], emitting: false, blendMode: 'ADD' }).setDepth(99999);
    this.puff = this.add.particles(0, 0, 'glow', { speed: { min: 10, max: 60 }, lifespan: 600, scale: { start: 0.25, end: 0.7 }, alpha: { start: 0.35, end: 0 }, tint: 0xb9a98a, emitting: false }).setDepth(99998);

    this.hud();
    this.cameras.main.fadeIn(350, 0, 0, 0);
    // a rotation or resize mid-battle relays the field out: play it again from the start with the same report
    let rt = null;
    this.onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (this.alive) this.scene.restart(this.data0); }, 350); };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.alive = false; this.time.timeScale = 1; this.tweens.timeScale = 1; this.anims.globalTimeScale = 1; clearTimeout(rt); this.scale.off('resize', this.onResize); document.getElementById('ui').innerHTML = ''; });
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
    const frontX = side === 'L' ? W * (this.portrait ? 0.4 : 0.4) : W * (this.portrait ? 0.6 : 0.6);
    const backX = side === 'L' ? W * (this.portrait ? 0.19 : 0.22) : W * (this.portrait ? 0.81 : 0.78);
    const front = list.slice(0, 5), back = [];
    const top = H * (this.portrait ? 0.62 : 0.6), bottom = H * (this.portrait ? 0.92 : 0.94);
    const spread = (arr, x, off) => arr.forEach((u, i) => {
      const y = arr.length === 1 ? (top + bottom) / 2 + off : top + (bottom - top) * (i / (arr.length - 1)) + off;
      const col = !this.portrait && i % 2 ? sign * -W * 0.07 : 0;
      const s = makeFighter(this, u.ch, x + col - sign * W * 0.4, y, this.size, side === 'R');
      s.home = { x: x + col, y }; s.side = side; s.setDepth(y).setAlpha(0);
      s.shadow = this.add.image(x, y - 2, 'blob').setScale(this.size / 128 * 0.8, this.size / 128 * 0.26).setDepth(y - 1).setAlpha(0);
      s.team = this.ring(side, x + col - sign * W * 0.4, y, this.size * 0.9);
      this.fighters[side].push(s);
    });
    spread(front, frontX, 0); spread(back, backX, -H * 0.02);
    this.fighters[side].sort((p1, p2) => p1.home.y - p2.home.y);
  }


  // ---- the set dressing: a fortress for the defender, a massed formation behind each side's champions, vehicles on both sides ----
  addFortress() {
    const W = this.scale.width, H = this.scale.height, b = this.def;
    const fw = Math.min(W * (this.portrait ? 0.2 : 0.12), H * (this.portrait ? 0.115 : 0.2));
    const base = H * 0.5, gx = W - fw * 1.45, parts = [];
    const put = (key, x, w, depthAdd = 0) => { const sp = this.add.image(x, base, key).setOrigin(0.5, 1); sp.setScale(w / sp.width).setDepth(base + depthAdd); parts.push(sp); return sp; };
    const nw = Math.min(3, Math.max(0, b.wall)), nt = Math.min(2, Math.max(0, b.tower));
    // everything stays on screen: the gate, one wall to its left, a second further left, a third on its right; towers at the corners
    if (nw >= 2) put('b_wall', gx - fw * 1.9, fw * 1.05); if (nw >= 1) put('b_wall', gx - fw * 0.95, fw * 1.05);
    if (nw >= 3) put('b_wall', gx + fw * 0.95, fw * 1.05);
    put('b_gate', gx, fw * 1.15, 2);
    if (nt >= 1) put('b_tower', gx - fw * (nw >= 2 ? 2.5 : 1.45), fw * 0.5, 3);
    if (nt >= 2) put('b_tower', W - fw * 0.28, fw * 0.5, 3);
    const flag = this.add.image(gx - fw * 0.35, base + H * 0.05, 'v_banner').setOrigin(0.5, 1);
    flag.setScale(Math.min(W * 0.1, H * 0.17) / flag.width).setFlipX(true).setDepth(base + H * 0.05);
    parts.push(flag);
    const mine = this.add.image(W * 0.05, base + H * 0.06, 'v_banner').setOrigin(0.5, 1);
    mine.setScale(Math.min(W * 0.1, H * 0.17) / mine.width).setDepth(base + H * 0.06);
    return { parts, hit: { x: gx - fw * 0.4, y: base - fw * 0.55 }, mine };
  }

  /** the massed formation: rows of small soldiers, melee in the files nearest the middle and snipers at the back */
  addMass(side, n) {
    const W = this.scale.width, H = this.scale.height, sign = side === 'L' ? 1 : -1;
    const total = n.units.reduce((t, v) => t + v, 0);
    const count = total <= 0 ? 0 : Math.min(total, Phaser.Math.Clamp(Math.round(Math.sqrt(total) * 1.3), 6, 24));
    const order = [0, 2, 3, 1], sum = order.reduce((t, k) => t + (n.units[k] || 0), 0) || 1;
    let types = [];
    for (const k of order) types.push(...Array(Math.round(count * (n.units[k] || 0) / sum)).fill(k));
    while (types.length < count) types.push(types[0] ?? 0);
    types = types.slice(0, count);
    const x0 = side === 'L' ? W * 0.03 : W * 0.7, span = W * 0.27;
    const cols = Math.min(6, Math.max(2, Math.ceil(count / 4))), rows = Math.ceil(count / cols);
    const yMin = H * (this.portrait ? 0.435 : 0.43), yMax = H * (this.portrait ? 0.57 : 0.57);
    const dx = span / cols, dy = (yMax - yMin) / rows;
    const ms = Math.min(this.size * 0.42, dx * 1.5, dy * 2.4);
    let i = 0;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows && i < count; r++, i++) {
      const x = (side === 'L' ? x0 + span - dx * (c + 0.5) : x0 + dx * (c + 0.5)) + (Math.random() - 0.5) * dx * 0.3;
      const y = yMin + dy * (r + 0.5) + (Math.random() - 0.5) * dy * 0.3;
      const s = makeFighter(this, CHARS[types[i] === 3 ? 3 : types[i]], x - sign * W * 0.35, y, ms, side === 'R');
      s.home = { x, y }; s.side = side; s.mini = true; s.setDepth(y).setAlpha(0);
      s.team = this.ring(side, x - sign * W * 0.35, y, ms * 0.9);
      this.mass[side].push(s);
    }
  }

  addVehicles(side, n) {
    const W = this.scale.width, H = this.scale.height, sign = side === 'L' ? 1 : -1;
    const total = n.units.reduce((t, v) => t + v, 0);
    const keys = [];
    if (total >= 15) keys.push(side === 'L' ? 'v_tank' : 'v_gun');
    if (total >= 80) keys.push(side === 'L' ? 'v_rocket' : 'v_tank2');
    const vw = Math.min(W * (this.portrait ? 0.25 : 0.1), H * 0.15);
    keys.forEach((k, i) => {
      const x = side === 'L' ? W * (this.portrait ? 0.14 : 0.12) : W * (this.portrait ? 0.86 : 0.88), y = H * (this.portrait ? [0.74, 0.9] : [0.72, 0.9])[i];
      const sp = this.add.image(x - sign * W * 0.4, y, k).setOrigin(0.5, 1);
      sp.setScale(vw / sp.width).setFlipX(side === 'R').setDepth(y).setAlpha(0);
      sp.home = { x, y }; sp.side = side;
      sp.team = this.ring(side, x - sign * W * 0.4, y, vw * 0.8);
      this.vehicles[side].push(sp);
    });
  }

  /** a glow in the side's colour under a fighter's feet, so the two armies tell apart at a glance (the art itself is all lime) */
  ring(side, x, y, w) {
    const c = side === 'L' ? this.att.color : this.def.color;
    return this.add.image(x, y - 2, 'glow').setTint(c).setBlendMode(Phaser.BlendModes.ADD).setScale(w / 128, w * 0.34 / 128).setDepth(y - 2).setAlpha(0);
  }

  sync(s) { if (s.shadow) s.shadow.x = s.x; if (s.team) s.team.x = s.x; }

  // ---- impact kit: one explosion, one shell, one way to lose soldiers ----
  boom(x, y, k = 1) {
    const d = DPR();
    const ring = this.add.graphics().setDepth(99991), o = { t: 0 };
    this.tweens.add({ targets: o, t: 1, duration: 420, ease: 'Quad.out', onUpdate: () => { ring.clear(); ring.lineStyle(5 * d * (1 - o.t) + 1, 0xffd27a, 0.85 * (1 - o.t)).strokeCircle(x, y, (10 + 70 * o.t) * d * k); }, onComplete: () => ring.destroy() });
    const fl = this.add.image(x, y, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setDepth(99992).setScale(0.5 * k).setAlpha(0.9);
    this.tweens.add({ targets: fl, scale: 1.8 * k, alpha: 0, duration: 380, onComplete: () => fl.destroy() });
    this.dust.emitParticleAt(x, y, Math.round(16 * k));
    this.puff.emitParticleAt(x, y, Math.round(5 * k));
    this.cameras.main.shake(150, 0.005 * k);
  }

  /** a vehicle fires: recoil, muzzle flash, a shell on an arc, then the explosion where it lands */
  fire(v, tx, ty, delay = 0, onLand = null) {
    return new Promise((res) => this.time.delayedCall(delay, () => {
      if (!this.alive) return res();
      const dir = v.side === 'L' ? 1 : -1, d = DPR();
      this.tweens.add({ targets: v, x: v.home.x - dir * 7 * d, duration: 90, ease: 'Quad.out', onComplete: () => this.tweens.add({ targets: v, x: v.home.x, duration: 90 }) });
      const mx = v.x + dir * v.displayWidth * 0.46, my = v.y - v.displayHeight * 0.62;
      this.dust.emitParticleAt(mx, my, 8);
      const shell = this.add.circle(mx, my, 4 * d, 0xffe066).setDepth(99993), o = { t: 0 };
      const arc = Math.min(this.scale.height * 0.22, Math.abs(tx - mx) * 0.4);
      this.tweens.add({ targets: o, t: 1, duration: 640, onUpdate: () => { shell.x = mx + (tx - mx) * o.t; shell.y = my + (ty - my) * o.t - Math.sin(Math.PI * o.t) * arc; }, onComplete: () => { shell.destroy(); this.boom(tx, ty, 1); if (onLand) onLand(); res(); } });
    }));
  }

  /** the fortress takes a hit: its pieces flash and shake */
  jolt() {
    for (const p of this.fortress.parts) { p.setTintFill(0xffffff); this.time.delayedCall(70, () => p.clearTint()); this.tweens.add({ targets: p, x: p.x + 3 * DPR(), duration: 60, yoyo: true, repeat: 1 }); }
  }

  /** `share` of the side's whole loss lands now: soldiers in the formation fall and the unit count drops to match */
  hurt(side, share) {
    this.prog[side] = Math.min(1, this.prog[side] + share);
    const arr = this.mass[side], want = Math.round(arr.length * this.lossFrac[side] * this.prog[side]);
    let dead = arr.filter((m) => m.dead).length;
    const d = DPR();
    while (dead < want) {
      const live = arr.filter((m) => !m.dead); if (!live.length) break;
      const m = live[Math.floor(Math.random() * live.length)]; m.dead = true; dead++;
      m.setTint(0x777777); m.stop(); if (m.team) m.team.setAlpha(0.12);
      this.tweens.add({ targets: m, angle: (side === 'L' ? -1 : 1) * 80, y: m.y + 6 * d, alpha: 0.35, duration: 420, ease: 'Quad.in' });
    }
    const el = document.querySelector(`[data-units="${side}"]`);
    if (el && this.showUnits) { const left = this.start[side] - Math.round(this.loss[side] * this.prog[side]); el.textContent = `${left.toLocaleString()} ${left === 1 ? 'unit' : 'units'}`; }
  }

  hud() {
    const a = this.att, b = this.def;
    const ui = document.getElementById('ui');
    ui.innerHTML = `
      <div class="battle-top">
        <button class="back" data-back>‹ Back</button><button class="back fast" data-fast>×1</button>
        <div class="vs">
          <div class="side l"><b style="color:${hex(a.color)}">${esc(a.name)}</b><div class="bar"><i data-hp="L" style="background:${hex(a.color)}"></i></div><small>attack ${this.result.attack.toLocaleString()}</small><small data-units="L">${this.showUnits ? this.start.L.toLocaleString() + (this.start.L === 1 ? ' unit' : ' units') : ''}</small></div>
          <div class="x">VS</div>
          <div class="side r"><b style="color:${hex(b.color)}">${esc(b.name)}</b><div class="bar"><i data-hp="R" style="background:${hex(b.color)}"></i></div><small>defense ${this.result.defense.toLocaleString()}</small><small data-units="R">${this.showUnits ? this.start.R.toLocaleString() + (this.start.R === 1 ? ' unit' : ' units') : ''}</small></div>
        </div>
      </div>
      <div class="banner" data-banner></div>
      <div class="battle-result" data-result></div>`;
    ui.querySelector('[data-back]').addEventListener('click', () => this.leave());
    const fast = ui.querySelector('[data-fast]');
    fast.addEventListener('click', () => {                           // 1x, 3x, 6x: the whole fight speeds up (timers, tweens, animations)
      const steps = [1, 3, 6]; this.fastIx = ((this.fastIx || 0) + 1) % steps.length; const f = steps[this.fastIx];
      this.time.timeScale = f; this.tweens.timeScale = f; this.anims.globalTimeScale = f; fast.textContent = `×${f}`;
    });
    this.setHp('L', 1); this.setHp('R', 1);
  }

  setHp(side, v) {
    this.hp[side] = Math.max(0, v);
    const el = document.querySelector(`[data-hp="${side}"]`);
    if (el) el.style.width = `${Math.round(this.hp[side] * 100)}%`;
  }

  leave() {
    this.alive = false;
    if (this.back === 'base') this.scene.start('base', { nation: this.home || this.att });
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
      this.tweens.add({ targets: s.team, alpha: 0.85, duration: 300, delay: i * 80 });
      this.tweens.add({ targets: s, x: s.home.x, duration: 1300, delay: i * 80, ease: 'Sine.out', onUpdate: () => { this.sync(s); }, onComplete: () => { s.stop(); s.setFrame(0); } });
    });
    for (const side of ['L', 'R']) {
      this.mass[side].forEach((m, i) => {
        m.play(`${m.ch}_walk`);
        this.tweens.add({ targets: m, alpha: 1, duration: 300, delay: i * 45 });
        this.tweens.add({ targets: m.team, alpha: 0.7, duration: 300, delay: i * 45 });
        this.tweens.add({ targets: m, x: m.home.x, duration: 1500, delay: i * 45, ease: 'Sine.out', onUpdate: () => this.sync(m), onComplete: () => { m.stop(); m.setFrame(0); } });
      });
      this.vehicles[side].forEach((v, i) => {
        this.tweens.add({ targets: v, alpha: 1, duration: 300, delay: i * 200 });
        this.tweens.add({ targets: v.team, alpha: 0.8, duration: 300, delay: i * 200 });
        this.tweens.add({ targets: v, x: v.home.x, duration: 1500, delay: i * 200, ease: 'Sine.out', onUpdate: () => this.sync(v) });
      });
    }
    if (!(await ok(2000))) return;
    this.banner('FIGHT!', 800, '#ff5a5a');
    if (!(await ok(900))) return;
    // the guns open the fight: each vehicle fires on the other side's line (the attacker's at the fortress, the defender's at the attackers' ranks)
    const volley = [];
    const W0 = this.scale.width, H0 = this.scale.height;
    this.vehicles.L.forEach((v, i) => { for (let k = 0; k < 2; k++) volley.push(this.fire(v, this.fortress.hit.x + (Math.random() - 0.5) * W0 * 0.1, this.fortress.hit.y + (Math.random() - 0.5) * H0 * 0.04, k * 420 + i * 200, () => { this.jolt(); this.hurt('R', 0.2 / (this.vehicles.L.length * 2)); })); });
    this.vehicles.R.forEach((v, i) => { for (let k = 0; k < 2; k++) volley.push(this.fire(v, W0 * (0.12 + Math.random() * 0.14), H0 * (0.47 + Math.random() * 0.08), k * 420 + i * 200 + 150, () => this.hurt('L', 0.2 / (this.vehicles.R.length * 2)))); });
    if (volley.length) { await Promise.all(volley); if (!this.alive || this.run !== this.token) return; if (!(await ok(500))) return; }
    this.chatter = this.time.addEvent({ delay: 650, loop: true, callback: () => {
      const live = [...this.mass.L, ...this.mass.R].filter((m) => !m.dead); if (!live.length) return;
      const m = live[Math.floor(Math.random() * live.length)];
      m.play(`${m.ch}_attack`); m.once('animationcomplete', () => { if (!m.dead) m.setFrame(0); });
    } });

    const success = this.result.success;
    const winner = success ? 'L' : 'R', loser = success ? 'R' : 'L';
    const hits = 5; // blows the loser takes
    const ratio = Math.min(0.85, Math.max(0.25, success ? this.result.defense / Math.max(1, this.result.attack) : this.result.attack / Math.max(1, this.result.defense)));
    const per = { [loser]: 1 / (hits + 1), [winner]: Math.min(0.5, ratio * 0.6) / hits };   // the winner's bar dips but never looks like a near-loss
    const power = { L: this.result.attack, R: this.result.defense };
    for (let i = 0; i < hits * 2 + 1; i++) {
      // the winner's army lands a blow, then the loser's answers (one fewer for the loser)
      const side = i % 2 === 0 ? winner : loser;
      if (side === loser && i >= hits * 2) break;
      const foe = side === 'L' ? 'R' : 'L';
      await this.blow(side, foe, Math.round((power[side] / hits) * (0.8 + Math.random() * 0.4)), per[foe], foe === loser ? 0.8 / (hits + 1) : 0.8 / hits);
      if (!this.alive || this.run !== this.token) return;
      if (!(await ok(160))) return;
    }
    this.setHp(loser, 0);
    await this.finish(winner, loser);
  }

  pick(side) { const a = this.fighters[side]; return a[Math.floor(Math.random() * a.length)]; }

  async blow(side, foe, dmg, hpLoss, share = 0) {
    const u = this.pick(side), t = this.pick(foe);
    const info = ATTACK[u.ch];
    const dir = side === 'L' ? 1 : -1;
    const melee = !info.ranged;
    const gap = Math.abs(t.home.x - u.home.x);
    if (melee) this.tweens.add({ targets: u, x: u.home.x + dir * gap * 0.62, duration: 320, ease: 'Quad.out', onUpdate: () => { this.sync(u); } });
    u.setDepth(u.y + 5000);
    u.play(`${u.ch}_attack`);
    await this.wait(impactMs(u.ch) + (melee ? 120 : 0));
    if (!this.alive) return;
    if (info.ranged) await this.tracer(u, t, dir);
    this.hit(t, u, dmg, hpLoss, share);
    await this.wait(Math.max(200, attackMs(u.ch) - impactMs(u.ch)));
    if (!this.alive) return;
    if (melee) this.tweens.add({ targets: u, x: u.home.x, duration: 260, ease: 'Quad.inOut', onUpdate: () => { this.sync(u); }, onComplete: () => u.setDepth(u.home.y) });
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

  hit(t, from, dmg, hpLoss, share = 0) {
    const d = DPR();
    // white flash, knock-back, shake, sparks and a damage number
    t.setTintFill(0xffffff);
    this.time.delayedCall(70, () => t.clearTint());
    const dir = from.side === 'L' ? 1 : -1;
    this.tweens.add({ targets: t, x: t.x + dir * 14 * d, duration: 80, yoyo: true, ease: 'Quad.out', onUpdate: () => { this.sync(t); } });
    this.cameras.main.shake(130, 0.004);
    this.dust.emitParticleAt(t.x, t.y - this.size * 0.4, 14);
    this.puff.emitParticleAt(t.x, t.y - 4, 3);
    const n = this.add.text(t.x, t.y - this.size * 0.75, (dmg > 0 ? `-${dmg.toLocaleString()}` : '0'), { fontFamily: 'system-ui', fontSize: `${22 * d}px`, fontStyle: '900', color: '#ffe066', stroke: '#000', strokeThickness: 5 * d, resolution: 2 }).setOrigin(0.5).setDepth(99999);
    this.tweens.add({ targets: n, y: n.y - 46 * d, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => n.destroy() });
    const side = t.side;
    this.setHp(side, this.hp[side] - hpLoss);
    if (share) this.hurt(side, share);
  }

  async finish(winner, loser) {
    const d = DPR();
    if (this.chatter) this.chatter.remove();
    this.hurt('L', 1); this.hurt('R', 1);   // the counters end on exactly what the result card says
    // a won raid breaks the gate and walls, a failed one leaves them standing
    if (winner === 'L') {
      const f = this.fortress;
      f.parts.forEach((p, i) => { this.time.delayedCall(i * 110, () => { if (!this.alive) return; this.boom(p.x, p.y - p.displayHeight * 0.4, 0.8); this.tweens.add({ targets: p, angle: (i % 2 ? 1 : -1) * 18, y: p.y + 14 * d, alpha: 0.45, duration: 600 }); }); });
    } else this.jolt();
    // the loser's army falls, the winner's cheers
    [...this.fighters[loser], ...this.mass[loser].filter((m) => !m.dead)].forEach((s, i) => {
      s.setTint(0x777777); if (s.mini) s.stop();
      this.tweens.add({ targets: s, angle: (loser === 'L' ? -1 : 1) * 78, y: s.y + 10 * d, alpha: 0.4, duration: 520, delay: i * 90, ease: 'Quad.in' });
      if (s.shadow) this.tweens.add({ targets: s.shadow, alpha: 0.2, duration: 400, delay: i * 90 });
      if (s.team) this.tweens.add({ targets: s.team, alpha: 0.12, duration: 400, delay: i * 90 });
    });
    this.mass[winner].filter((m) => !m.dead).forEach((m, i) => { m.stop(); m.setFrame(0); this.tweens.add({ targets: m, y: m.y - 10 * d, duration: 220, yoyo: true, repeat: 2, delay: i * 40, ease: 'Quad.out' }); });
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
    const lossA = this.loss.L, lossB = this.loss.R;
    const extra = (this.report && !this.report.estimated) ? `<p class="small">${esc(a.name)} loses ${lossA.toLocaleString()} unit${lossA === 1 ? '' : 's'}, ${esc(b.name)} loses ${lossB.toLocaleString()} unit${lossB === 1 ? '' : 's'}${this.report.loot ? `. Loot: $${this.report.loot.toLocaleString(undefined, { maximumFractionDigits: 1 })} from ${esc(b.name)}'s war pool goes to ${esc(a.name)}'s buyback pot` : ''}${this.report.buyback ? `. The pot reaches $${this.report.buyback.toFixed(0)}: ${esc(a.name)}'s coin is bought back and burned` : ''}.</p>` : '';
    el.innerHTML = `<h3 style="color:${hex(winner === 'L' ? a.color : b.color)}">${esc(wName)} wins</h3>
      <p>${r.success ? `${esc(a.name)} breaks ${esc(b.name)}'s defense` : `${esc(b.name)} holds the line against ${esc(a.name)}`}.<br/>Attack <b>${r.attack.toLocaleString()}</b> vs defense <b>${r.defense.toLocaleString()}</b>. A fixed formula, no luck.</p>${extra}
      <div class="row"><button class="btn primary" data-replay>Watch again</button><button class="btn" data-back2>${this.back === 'base' ? 'Back to base' : 'Back to the map'}</button></div>`;
    el.classList.add('on');
    el.querySelector('[data-replay]').addEventListener('click', () => this.scene.restart(this.data0));
    el.querySelector('[data-back2]').addEventListener('click', () => this.leave());
  }
}
