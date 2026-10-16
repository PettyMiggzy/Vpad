// Round 4 battle/map regression checks (use like browser.regress.mjs).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

{ // preview world: pieces and wars
  const ctx = await browser.newContext(phone); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}?preview`); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  const hidden = (force) => p.evaluate((force) => {
    const s = window.__game.scene.getScene('map'); const T = 56;
    if (force) { s.landPoint = () => false; s.buildNations(); }
    let bad = 0, total = 0, stacked = 0;
    for (const [n, objs] of s.nationObjects) {
      const [cx, cy] = n.plots[0]; const X = s.px(cx) + T / 2, Y = s.px(cy) + T / 2;
      const pcs = objs.filter((o) => o.texture && /^(b_(?!keep)|c_|ruin)/.test(o.texture.key));
      for (const o of pcs) { total++; if (Math.abs(o.x - X) < T * 0.6 && o.y > Y - T * 0.5 && o.y < Y + T * 0.8 && !/barracks|vault/.test(o.texture.key)) bad++; }
      if (!force) for (let i = 0; i < pcs.length; i++) for (let j = i + 1; j < pcs.length; j++) if (Math.hypot(pcs[i].x - pcs[j].x, pcs[i].y - pcs[j].y) < T * 0.15) { stacked++; globalThis.__st = 1; window.__stk = (window.__stk || []).concat([[n.name, pcs[i].texture.key, pcs[j].texture.key, Math.round(pcs[i].x - X), Math.round(pcs[i].y - Y)]]); }
    }
    return { bad, total, stacked, stk: window.__stk };
  }, force);
  const a = await hidden(false);
  check('R4-M1 no defense piece stands under the hall or on top of another', a.bad === 0 && a.stacked === 0 && a.total > 0, JSON.stringify(a));
  const b = await hidden(true);
  check('R4-M1 even with no open ground the pieces sit beside the hall, not behind it', b.bad === 0 && b.total > 0, JSON.stringify(b));

  await p.evaluate(() => { const g = window.__game; const s = g.scene.getScene('map'); const [a, b] = s.world.nations; const w = []; for (let i = 0; i < 90; i++) w.push({ a: i % 2 ? a.name : b.name, b: i % 2 ? b.name : a.name, at: [0, 0], success: true, attack: 10, defense: 5 }); s.world.wars = w; s.scene.restart(); });
  await p.waitForTimeout(3500);
  const wars = await p.evaluate(() => window.__game.scene.getScene('map').world.wars.length);
  check('R4-M2 90 raids between two nations make one war on the map', wars === 1, `wars ${wars}`);

  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const g = window.__game; g.scene.stop('map'); g.registry.set('mapCam', { x: 0, y: 0, zoom: 0.0001 }); g.scene.start('map'); });
  await p.waitForTimeout(3500);
  const z = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); return { z: s.cameras.main.zoom, min: s.minZoom() }; });
  check('R4-L1 a restored zoom is never below the new minimum', z.z >= z.min - 1e-9, JSON.stringify(z));
  // R5-M3: turning the phone keeps the nation in view
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.setZoom(1.1 * window.__dpr); const n = s.world.nations[0]; c.centerOn(s.px(n.plots[0][0]) + 28, s.px(n.plots[0][1]) + 28); });
  await p.waitForTimeout(800);
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(3500);
  const rot = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.preRender(); const n = s.world.nations[0]; const wx = s.px(n.plots[0][0]) + 28, wy = s.px(n.plots[0][1]) + 28; return { sx: (wx - c.worldView.x) * c.zoom, sy: (wy - c.worldView.y) * c.zoom, w: c.width, h: c.height }; });
  check('R5-M3 after turning the phone the nation is still on screen', rot.sx > 0 && rot.sx < rot.w && rot.sy > 0 && rot.sy < rot.h, JSON.stringify(rot));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1500);
  // R6: the fortress at its fullest (wall 3, tower 2) is entirely on screen
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const [a, b] = s.world.nations; const snap = (n, u, w, t) => ({ name: n.name, color: n.color, emblem: n.emblem, units: u, wall: w, tower: t }); s.scene.start('battle', { report: { estimated: true, result: { attack: 100, defense: 900, success: false }, send: [5, 5, 5], loot: 0, a: snap(a, [5, 5, 5, 0], 0, 0), b: snap(b, [20, 20, 20, 20], 3, 2) }, back: 'map' }); });
  await p.waitForTimeout(2500);
  const fo = await p.evaluate(() => { const s = window.__game.scene.getScene('battle'); const W = s.scale.width; return s.fortress.parts.filter((x) => x.texture.key !== 'v_banner').map((x) => { const b = x.getBounds(); return { k: x.texture.key, l: Math.round(b.x), r: Math.round(b.right), W }; }); });
  check('R6 the fortress at wall 3 and tower 2 is wholly on screen', fo.length >= 6 && fo.every((x) => x.l >= -2 && x.r <= x.W + 4), JSON.stringify(fo.filter((x) => x.l < -2 || x.r > x.W + 4)));
  // R6-M1: the unit counters end on exactly what the result card says (3 each sent and a win: the attacker loses none)
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const [a, b] = s.world.nations; const snap = (n, u) => ({ name: n.name, color: n.color, emblem: n.emblem, units: u, wall: 1, tower: 1 }); s.scene.start('battle', { report: { result: { attack: 900, defense: 100, success: true }, send: [3, 3, 3], loot: 0, a: snap(a, [3, 3, 3, 0]), b: snap(b, [4, 0, 0, 0]) }, back: 'map' }); });
  await p.waitForTimeout(1500); await p.click('[data-fast]'); await p.click('[data-fast]');
  await p.waitForSelector('.battle-result.on', { timeout: 240000 });
  const cnt = await p.evaluate(() => ({ L: document.querySelector('[data-units="L"]')?.textContent, R: document.querySelector('[data-units="R"]')?.textContent, card: document.querySelector('.battle-result')?.textContent || '' }));
  check('R6-M1 the battle counters end on the result card numbers', cnt.L === '9 units' && cnt.R === '3 units' && /loses 0 units/.test(cnt.card) && /loses 1 unit/.test(cnt.card), JSON.stringify({ L: cnt.L, R: cnt.R }));
  check('no page errors (preview)', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

{ // play-test: scroll is kept after a base visit
  const ctx = await browser.newContext(phone); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}?play`); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  await p.waitForSelector('[data-name]', { timeout: 90000 });
  await p.fill('[data-name]', 'Scroll'); await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; let best = null; for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (sim.canFound(x, y) && sim.kind(x, y) === 0 && !best) best = [x, y]; const c = s.cameras.main; c.setZoom(1.2 * window.__dpr); c.centerOn(s.px(best[0]) + 28, s.px(best[1]) + 28); });
  await p.waitForTimeout(500); await p.touchscreen.tap(195, 422); await p.waitForTimeout(800); await p.click('[data-go]'); await p.waitForTimeout(3000);
  const before = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.scrollX += 700; c.scrollY += 500; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); s.scene.start('base', { nation: s.sim.player }); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__game.scene.getScene('base').scene.start('map'); });
  await p.waitForTimeout(3500);
  const after = await p.evaluate(() => { const c = window.__game.scene.getScene('map').cameras.main; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  check('R4-M3 the map keeps its scroll after a visit to the base', Math.abs(after.x - before.x) < 3 && Math.abs(after.y - before.y) < 3, JSON.stringify({ before, after }));
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const foe = s.sim.nations.find((n) => !n.isPlayer); s.sim.player.units = [30, 30, 30, 0]; s.showNationSandbox(foe); });
  await p.waitForTimeout(800); await p.click('[data-plan]'); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__game.scene.getScene('map').sim.player.units = [12, 30, 30, 0]; });
  await p.waitForFunction(() => document.querySelector('[data-send="0"]')?.max === '12', null, { timeout: 30000 }).catch(() => {});
  const pl = await p.evaluate(() => { const r = document.querySelector('[data-send="0"]'); return { max: r?.max, val: r?.value, label: document.querySelector('[data-m="0"]')?.textContent, shield: /ends your own shield/.test(document.querySelector('.sheet')?.textContent || '') }; });
  check('R4-L4 the map planner follows an army that shrinks while it is open', pl.max === '12' && pl.val === '12' && pl.label === '12', JSON.stringify(pl));
  // R5-M1: another tab saved a newer game: this tab reloads rather than overwrite it
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); window.__tabMark = 1; localStorage.setItem('badlands.sandbox.v2.rev', String(s.sim.rev + 5)); });
  await p.waitForFunction(() => !window.__tabMark, null, { timeout: 60000 }).then(() => check('R5-M1 a tab whose game was saved elsewhere reloads', true), () => check('R5-M1 a tab whose game was saved elsewhere reloads', false, 'no reload'));
  check('no page errors (play)', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

{ // R5: a rejected old save is explained inside the onboarding card, not in a toast the modal would cover
  const ctx = await browser.newContext(phone); await ctx.addInitScript(() => { try { localStorage.setItem('badlands.sandbox.v2', JSON.stringify({ v: 2, rules: 'old', nations: [] })); } catch (_) { /* ignore */ } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}?play`); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  await p.waitForSelector('[data-name]', { timeout: 90000 });
  const note = await p.evaluate(() => document.querySelector('.card.big')?.textContent || '');
  check('R5-M2 a rejected save is explained on the founding card', /earlier game/.test(note), note.slice(0, 60));
  await ctx.close();
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
