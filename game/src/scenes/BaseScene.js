import Phaser from 'phaser';
import { powers, UNIT_NAMES } from '../combat.js';
import { train, collectReady, buildDefense, readNation, buyShield, speedUpLatest, raidNation, expandNation } from '../chain.js';

const DPR = () => window.__dpr || 1;
const UNIT_KEYS = ['bruiser', 'sniper', 'trickster', 'defender'];
const UNIT_NOTE = ['beats tricksters', 'beats bruisers', 'beats snipers', 'defends the base'];
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export class BaseScene extends Phaser.Scene {
  constructor() { super('base'); }

  init(data) { this.nation = data.nation; }

  create() {
    this.world = this.registry.get('world');
    this.live = this.world.live && !!this.nation.token;
    this.panelOpen = true;
    this.build();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.layout, this); document.getElementById('ui').innerHTML = ''; });
  }

  // the scene's drawing area: above the panel on a portrait phone, left of it on a wide screen
  rect() {
    const W = this.scale.width, H = this.scale.height, d = DPR();
    if (window.innerWidth >= 900) return { x: 0, y: 0, w: W - 430 * d, h: H };
    return { x: 0, y: 0, w: W, h: H * 0.42 };
  }

  build() {
    const n = this.nation;
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'g_dirt').setOrigin(0).setTint(0x8a7f6e);
    this.bgGrass = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'g_grass').setOrigin(0).setAlpha(0.55);
    this.fx = [];
    this.sprites = [];
    this.labels = [];
    const mk = (key, extra = {}) => { const i = this.add.image(0, 0, key).setOrigin(0.5, 0.88); i.setOrigin(0.5, 1); this.fx.push(i); return i; };
    this.hallGlow = this.add.image(0, 0, 'glow').setTint(n.color).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: this.hallGlow, alpha: 0.18, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.hall = mk('b_keep');
    this.towerS = mk('b_tower'); this.wallS = mk('b_gate'); this.barracks = mk('b_barracks'); this.vaultS = mk('b_vault');
    this.flag = this.add.graphics();
    this.tweens.add({ targets: this.flag, scaleX: { from: 1, to: 0.82 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.units = UNIT_KEYS.map((key, i) => {
      const shadow = this.add.image(0, 0, 'blob');
      const spr = this.add.image(0, 0, key).setOrigin(0.5, 0.88).setInteractive({ useHandCursor: true });
      spr.idx = i; spr.phase = Math.random() * 6; spr.hit = 0; spr.shadow = shadow;
      spr.on('pointerup', () => this.cheer(spr));
      return spr;
    });
    this.count = UNIT_KEYS.map(() => this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '15px', fontStyle: '800', color: '#ffffff', stroke: '#000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5, 0));
    this.tag = (t, c = '#ffffff') => this.add.text(0, 0, t, { fontFamily: 'system-ui', fontSize: '13px', fontStyle: '800', color: c, stroke: '#000', strokeThickness: 4, resolution: 2 }).setOrigin(0.5, 0);
    this.barTag = this.tag('barracks');
    this.vaultTag = this.tag('');
    this.towerTag = this.tag('');
    this.wallTag = this.tag('');
    this.dust = this.add.particles(0, 0, 'spark', { speed: { min: 20, max: 70 }, lifespan: 420, scale: { start: 0.9, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0xb9a98a, emitting: false });
    this.embers = this.add.particles(0, 0, 'spark', { x: { min: 0, max: this.scale.width }, y: this.scale.height, speedY: { min: -40, max: -14 }, speedX: { min: -8, max: 14 }, scale: { start: 0.35, end: 0 }, alpha: { start: 0.6, end: 0 }, lifespan: 4200, frequency: 120, tint: [0xb6ff00, 0xffe066], blendMode: 'ADD' });
    this.panel();
    this.layout();
  }

  layout() {
    const d = DPR(), r = this.rect(), n = this.nation;
    this.bg.setSize(this.scale.width, this.scale.height).setTileScale(1.1 * d);
    this.bgGrass.setSize(this.scale.width, this.scale.height).setTileScale(1.4 * d);
    const portrait = window.innerWidth < 900;
    const cx = r.x + r.w / 2;
    const unitW = Math.min(r.w * 0.22, r.h * 0.34, 150 * d);
    const hallW = Math.min(r.w * (portrait ? 0.46 : 0.4), r.h * 0.4);
    const baseY = r.y + r.h * (portrait ? 0.6 : 0.58);           // where the hall's feet are
    this.hall.setScale(hallW / this.hall.width).setPosition(cx, baseY);
    this.hallGlow.setPosition(cx, baseY - hallW * 0.4).setScale(hallW / 80);
    const small = Math.min(r.w * 0.26, r.h * 0.3);
    const chipPx = `${(portrait ? 10 : 12) * d}px`;
    const put = (s, x, y, w, tag, text, dim) => {
      s.setScale(w / s.width).setPosition(x, y).setAlpha(dim ? 0.5 : 1);
      tag.setPosition(x, y + 2 * d).setText(text).setFontSize(chipPx).setVisible(!!text);
    };
    put(this.towerS, cx - r.w * 0.38, baseY + r.h * 0.06, small * 0.42, this.towerTag, `tower ×${n.tower}`, n.tower === 0);
    put(this.barracks, cx + r.w * 0.38, baseY - r.h * 0.02, small, this.barTag, '', false);
    put(this.wallS, cx - r.w * 0.2, baseY + r.h * 0.1, small * 0.85, this.wallTag, `wall ×${n.wall}`, n.wall === 0);
    put(this.vaultS, cx + r.w * 0.2, baseY + r.h * 0.1, small * 0.75, this.vaultTag, `pool $${n.pool}`, false);
    this.flag.clear();
    this.flag.fillStyle(0x222222, 1).fillRect(-1.5 * d, 0, 3 * d, 50 * d);
    this.flag.fillStyle(n.color, 1).fillTriangle(1.5 * d, 0, 1.5 * d, 18 * d, 30 * d, 9 * d);
    this.flag.setPosition(cx + hallW * 0.5, baseY - hallW * 0.62);
    // the army, standing in a row in front
    const rowY = r.y + r.h - (portrait ? 22 : 40) * d;
    this.units.forEach((s, i) => {
      const x = r.x + r.w * (0.13 + i * 0.245);
      s.base = unitW / s.width;
      s.home = { x, y: rowY };
      s.shadow.setPosition(x, rowY).setScale(unitW / 128 * 0.9, unitW / 128 * 0.3);
      this.count[i].setPosition(x, rowY + 3 * d).setFontSize(`${(portrait ? 12 : 14) * d}px`).setText(`×${n.units[i]}`);
    });
  }

  cheer(s) { this.hop(s); this.dust.emitParticleAt(s.x, s.home.y, 6); }
  hop(s) { this.tweens.add({ targets: s, y: s.home.y - 22 * DPR(), duration: 150, yoyo: true, ease: 'Quad.out' }); }

  lunge(s, dir = 1) {
    const dx = 60 * DPR() * dir;
    this.tweens.add({
      targets: s, x: s.home.x + dx, angle: 6 * dir, duration: 130, yoyo: true, ease: 'Quad.out',
      onYoyo: () => { s.setTintFill(0xffffff); this.dust.emitParticleAt(s.x + dx * 0.4, s.home.y, 8); this.time.delayedCall(70, () => s.clearTint()); this.cameras.main.shake(90, 0.003); },
      onComplete: () => s.setAngle(0),
    });
  }

  update(t, dt) {
    const sec = dt / 1000;
    for (const s of this.units) {
      s.phase += sec * 2.2;
      const breathe = Math.sin(s.phase) * 0.025;
      if (!this.tweens.isTweening(s) && s.home) s.setPosition(s.home.x + Math.sin(s.phase * 0.5) * 2, s.home.y - Math.abs(Math.sin(s.phase)) * 3 * DPR());
      if (s.base) s.setScale(s.base * (1 - breathe), s.base * (1 + breathe));
      s.shadow.x = s.x;
    }
    this.bgGrass.tilePositionX += sec * 2; // a slow drift so the ground is never dead still
  }

  // ---- the panel (HTML): tabs for Army, Build, War, Shop ----
  panel() {
    const n = this.nation;
    const ui = document.getElementById('ui');
    const live = this.live;
    const others = this.world.nations.filter((o) => o !== n);
    const note = live ? '' : `<div class="note">${this.world.live ? 'This nation has no token record yet.' : 'Preview data: buttons that send transactions are off. The real thing needs a wallet on the test chain.'}</div>`;
    ui.innerHTML = `
      <div class="top basetop"><button class="back" data-back>‹ Map</button><div class="brand"><b style="color:${hex(n.color)}">${n.name}</b><span>${n.holders === null ? '' : n.holders.toLocaleString() + ' holders · '}${n.plots.length} plot${n.plots.length > 1 ? 's' : ''}</span></div>
        <div class="pill ${this.world.live ? '' : 'preview'}">${this.world.live ? 'LIVE · TEST CHAIN' : 'PREVIEW DATA'}</div></div>
      <div class="dock"><div class="tabs"><button data-tab="army" class="on">Army</button><button data-tab="build">Build</button><button data-tab="war">War</button><button data-tab="shop">Shop</button></div>
        <div class="tabbody">
          <section data-pane="army">${UNIT_KEYS.map((k, i) => `
            <div class="card"><img src="art/units/${k}.png" alt=""/><div class="grow"><b>${UNIT_NAMES[i]} <span class="cnt" data-cnt="${i}">×${n.units[i]}</span></b><small>${UNIT_NOTE[i]}</small></div>
              <button class="btn small" data-train="${i}" ${live ? '' : 'disabled'}>Train 5</button></div>`).join('')}
            <button class="btn" data-collect ${live ? '' : 'disabled'}>Collect finished units</button>
            <div class="note">Bruiser beats trickster, trickster beats sniper, sniper beats bruiser. Training costs the nation's coin, burned.</div></section>
          <section data-pane="build" hidden>
            <div class="card"><img src="art/trim/b_wall.png" alt=""/><div class="grow"><b>Wall <span class="cnt">×${n.wall}</span></b><small>+10% defense each</small></div><button class="btn small" data-wall ${live ? '' : 'disabled'}>Build</button></div>
            <div class="card"><img src="art/trim/b_tower.png" alt=""/><div class="grow"><b>Guard tower <span class="cnt">×${n.tower}</span></b><small>+10% defense each</small></div><button class="btn small" data-tower ${live ? '' : 'disabled'}>Build</button></div>
            <div class="note">Building burns the nation's coin. Walls and towers only add defense; a shield can never add strength.</div></section>
          <section data-pane="war" hidden>
            ${others.length ? `<label class="lbl">Target</label><select data-target>${others.map((o, i) => `<option value="${i}">${o.name}</option>`).join('')}</select>
            <div class="fight" data-fight>pick a target and preview the fight</div>
            <div class="row"><button class="btn" data-preview>Preview fight</button><button class="btn danger" data-raid ${live ? '' : 'disabled'}>Raid</button></div>` : '<div class="note">No other nation to fight yet.</div>'}
            <div class="note">The fight is a fixed formula, no luck. The preview uses the same numbers as the contract.</div></section>
          <section data-pane="shop" hidden>
            <div class="grid2"><button class="btn" data-shield ${live ? '' : 'disabled'}>Shield 6h</button><button class="btn" data-speed ${live ? '' : 'disabled'}>Speed up 1h</button>
              <button class="btn" data-plot ${live ? '' : 'disabled'}>Buy next plot</button><button class="btn" data-collect2 ${live ? '' : 'disabled'}>Collect units</button></div>
            <div class="note">Shields add time, never strength. Speed-ups and plots are paid in USDC; they never add war strength.</div></section>
          <div class="status" data-status>${live ? 'ready: each button sends one transaction' : ''}</div>${note}
        </div></div>`;
    ui.querySelector('[data-back]').addEventListener('click', () => this.scene.start('map'));
    const tabs = ui.querySelectorAll('.tabs button');
    tabs.forEach((b) => b.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('on', x === b));
      ui.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    }));
    const status = ui.querySelector('[data-status]');
    const run = async (label, fn) => {
      status.className = 'status wait'; status.textContent = `${label}: waiting for the wallet and the chain…`;
      try {
        const r = await fn();
        const fresh = await readNation(this.world, n.token);
        n.units = fresh.units;
        fresh.units.forEach((u, i) => { const c = ui.querySelector(`[data-cnt="${i}"]`); if (c) c.textContent = `×${u}`; });
        this.layout();
        status.className = 'status ok'; status.textContent = `${label}: done${r && r.hash ? `  tx ${r.hash.slice(0, 18)}…` : ''}`;
      } catch (e) {
        status.className = 'status bad'; status.textContent = `${label}: ${String(e.shortMessage || e.reason || e.message).slice(0, 110)}`;
      }
    };
    const on = (sel, fn) => ui.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    on('[data-train]', (b) => { const i = Number(b.dataset.train); this.hop(this.units[i]); run(`Train 5 ${UNIT_KEYS[i]}`, () => train(this.world, n.token, i, 5)); });
    on('[data-collect],[data-collect2]', () => run('Collect', async () => ({ hash: (await collectReady(this.world))[0] })));
    on('[data-wall]', () => run('Build wall', () => buildDefense(this.world, n.token, true)));
    on('[data-tower]', () => run('Build tower', () => buildDefense(this.world, n.token, false)));
    on('[data-shield]', () => run('Shield 6h', () => buyShield(this.world, n.token, 6)));
    on('[data-speed]', () => run('Speed up 1h', () => speedUpLatest(this.world, n.token, 1)));
    on('[data-plot]', () => run('Buy next plot', () => expandNation(this.world, n)));
    const sel = ui.querySelector('[data-target]');
    const fight = ui.querySelector('[data-fight]');
    const calc = () => {
      const o = others[Number(sel.value)];
      const send = [n.units[0], n.units[1], n.units[2]];
      const r = powers(send, o.units, o.wall, o.tower, false);
      const total = Math.max(1, r.attack + r.defense);
      fight.innerHTML = `<div class="bar"><i style="width:${Math.round((r.attack / total) * 100)}%"></i></div><div class="vs"><span>attack <b>${r.attack}</b></span><span>defense <b>${r.defense}</b></span></div>
        <div class="${r.success ? 'win' : 'lose'}">${r.success ? 'RAID SUCCEEDS' : 'RAID FAILS'}</div>`;
      return r;
    };
    if (sel) {
      sel.addEventListener('change', calc);
      ui.querySelector('[data-preview]').addEventListener('click', () => {
        calc();
        this.units.slice(0, 3).forEach((s, i) => { if (n.units[i] > 0) this.time.delayedCall(i * 220, () => this.lunge(s, 1)); });
      });
      ui.querySelector('[data-raid]').addEventListener('click', () => { const o = others[Number(sel.value)]; this.units.slice(0, 3).forEach((s, i) => this.time.delayedCall(i * 220, () => this.lunge(s, 1))); run(`Raid ${o.name}`, () => raidNation(this.world, n, o)); });
      calc();
    }
  }
}
