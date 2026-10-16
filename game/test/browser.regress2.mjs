// Round 2 browser regression checks. Same use as browser.regress.mjs.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// R2-H1: a dead chain RPC must not hold the game on the loading screen (with or without ?play)
for (const q of (process.env.ONLY ? [] : ['', '?play'])) {
  const ctx = await browser.newContext(phone);
  await ctx.route('**/testnet-rpc.vyrechain.com/**', () => { /* never answered */ });
  const p = await ctx.newPage(); const t0 = Date.now();
  await p.goto(`${BASE}${q}`);
  const done = await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 60000 }).then(() => true).catch(() => false);
  check(`R2-H1 boot finishes with a dead RPC (${q || 'no flag'})`, done, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await ctx.close();
}

if (!process.env.ONLY) {
// R2-M1: the open raid planner follows the clock (cooldowns and protection end)
{
  const ctx = await browser.newContext(phone); const p = await ctx.newPage();
  await p.goto(`${BASE}?play`); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  await p.waitForSelector('[data-name]', { timeout: 60000 });
  await p.fill('[data-name]', 'Planner'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; let best = null; for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (sim.canFound(x, y) && sim.kind(x, y) === 0 && !best) best = [x, y]; const c = s.cameras.main; c.setZoom(1.2 * window.__dpr); c.centerOn(s.px(best[0]) + 28, s.px(best[1]) + 28); });
  await p.waitForTimeout(400); await p.touchscreen.tap(195, 422); await p.waitForTimeout(700); await p.click('[data-go]'); await p.waitForTimeout(2500);
  await p.click('[data-base]'); await p.waitForTimeout(1500); await p.click('[data-tab=war]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const b = window.__game.scene.getScene('base'); const sim = b.sim; sim.aiAt = 1e15; const me = b.nation; const foe = sim.byName(document.querySelector('[data-target]').value); me.units = [20, 20, 20, 0]; me.plots = foe.plots.map(([x, y]) => [x + 1, y]); me.nextRaidAt = sim.now + 2 * 3600 * 1000; foe.protectedUntil = sim.now + 2 * 3600 * 1000; });
  await p.click('[data-tab=army]'); await p.click('[data-tab=war]'); await p.waitForTimeout(500);
  const before = await p.evaluate(() => document.querySelector('[data-launch]').disabled);
  await p.evaluate(() => { const b = window.__game.scene.getScene('base'); b.sim.clock += 3 * 3600 * 1000; });
  await p.waitForTimeout(3000);
  const after = await p.evaluate(() => document.querySelector('[data-launch]').disabled);
  check('R2-M1 the planner re-enables itself when the cooldown and protection end', before === true && after === false, `before disabled=${before}, after disabled=${after}`);
  await ctx.close();
}
}

// R3-H1 / R3-M1 / R3-M2: map planner then another sheet does not kill the loop; the Base planner keeps its sliders; toasts do not eat taps
{
  const ctx = await browser.newContext(phone); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}?play`); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  await p.waitForSelector('[data-name]', { timeout: 90000 });
  await p.fill('[data-name]', 'Freeze'); await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; let best = null; for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (sim.canFound(x, y) && sim.kind(x, y) === 0 && !best) best = [x, y]; const c = s.cameras.main; c.setZoom(1.2 * window.__dpr); c.centerOn(s.px(best[0]) + 28, s.px(best[1]) + 28); });
  await p.waitForTimeout(500); await p.touchscreen.tap(195, 422); await p.waitForTimeout(800); await p.click('[data-go]'); await p.waitForTimeout(3000);
  await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const foe = s.sim.nations.find((n) => !n.isPlayer); s.sim.player.units = [30, 30, 30, 0]; s.showNationSandbox(foe); });
  await p.waitForTimeout(500); await p.click('[data-plan]'); await p.waitForTimeout(800); await p.click('[data-back]'); await p.waitForTimeout(500);
  await p.click('[data-log]'); await p.waitForTimeout(500);
  const f0 = await p.evaluate(() => window.__game.loop.frame); await p.waitForTimeout(3500); const f1 = await p.evaluate(() => window.__game.loop.frame);
  check('R3-H1 the game loop survives opening another sheet after the map raid planner', f1 > f0 + 3 && errs.length === 0, `frames ${f0}->${f1} ${errs[0] || ''}`);
  const tp = await p.evaluate(() => { const t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); const v = getComputedStyle(t).pointerEvents; t.remove(); return v; });
  check('R3-M2 toasts do not capture taps', tp === 'none', tp);
  // Base planner keeps its slider across a re-render caused by finished training
  await p.evaluate(() => { const g = window.__game; g.scene.getScene('map').scene.start('base', { nation: g.scene.getScene('map').sim.player }); });
  await p.waitForTimeout(2500);
  await p.click('[data-tab=war]'); await p.waitForTimeout(500);
  await p.evaluate(() => { const el = document.querySelector('[data-send="0"]'); el.value = 7; el.dispatchEvent(new Event('input')); });
  await p.evaluate(() => { const b = window.__game.scene.getScene('base'); b.sim.train(0, 5); b.sim.clock += 2 * 3600 * 1000; });
  await p.waitForTimeout(3000);
  const v = await p.evaluate(() => Number(document.querySelector('[data-send="0"]')?.value));
  check('R3-M1 the Base planner keeps the slider the player set', v === 7, `slider ${v}`);
  await ctx.close();
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
