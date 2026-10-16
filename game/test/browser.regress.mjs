// Browser regression checks for the audit findings (run against a served build):
//   BASE_URL=http://127.0.0.1:4173/ CHROME=/path/to/chrome node test/browser.regress.mjs   (needs playwright-core on NODE_PATH or beside this file)
// Exit code 1 when any check fails. Each line names the audit finding it guards.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${BASE}?play`);
await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
await p.evaluate(() => { try { localStorage.removeItem('badlands.sandbox.v2'); } catch (_) {} });
await p.reload(); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
await p.waitForSelector('[data-name]', { timeout: 30000 });
await p.fill('[data-name]', 'Regress'); await p.click('[data-next]'); await p.waitForTimeout(600);
await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; let best = null; for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (sim.canFound(x, y) && sim.kind(x, y) === 0 && (!best || Math.hypot(x - 2, y + 3) < Math.hypot(best[0] - 2, best[1] + 3))) best = [x, y]; const c = s.cameras.main; c.setZoom(1.2 * window.__dpr); c.centerOn(s.px(best[0]) + 28, s.px(best[1]) + 28); });
await p.waitForTimeout(400); await p.touchscreen.tap(195, 422); await p.waitForTimeout(600); await p.click('[data-go]'); await p.waitForTimeout(2500);

// M3: pinch/wheel zoom keeps the point under the finger fixed
const drift = await p.evaluate(() => {
  const s = window.__game.scene.getScene('map'); const c = s.cameras.main; const sx = 120 * window.__dpr, sy = 300 * window.__dpr;
  const at = (z) => { const cx = c.width / 2, cy = c.height / 2; return [c.scrollX + cx + (sx - cx) / c.zoom, c.scrollY + cy + (sy - cy) / c.zoom]; };
  const before = at(); s.zoomAt(sx, sy, c.zoom * 1.6); const after = at();
  return Math.hypot(after[0] - before[0], after[1] - before[1]);
});
check('M3 zoom holds the focal point', drift < 2, `drift ${drift.toFixed(1)} px`);

// M2: a tap on the nation's name tag / hall base opens the nation, not a tile
const hit = await p.evaluate(() => {
  const s = window.__game.scene.getScene('map'); const me = s.sim.player; const [cx, cy] = me.plots[0];
  const X = s.px(cx) + 28, Y = s.px(cy) + 28; return [[X, Y - 52], [X, Y + 70], [X - 40, Y + 40]].map(([x, y]) => (s.hitNation ? s.hitNation({ x, y })?.name : s.owner.get(`${Math.floor(x / 56) - 17},${Math.floor(y / 56) - 17}`)?.name) || null);
});
check('M2 nation compound is hit-tested (tag, hall base, gate)', hit.every((n) => n === 'REGRESS'), JSON.stringify(hit));

// H1: a stale toast action fired in another scene must not leave two scenes running
await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; const me = sim.player; const foe = sim.nations.find((n) => !n.isPlayer); me.protectedUntil = 0; foe.units = [200, 200, 200, 0]; foe.nextRaidAt = 0; me.plots = foe.plots.map(([x, y]) => [x + 1, y]); const orig = sim.tick.bind(sim); sim.tick = () => { const b = sim.log.length; sim.raid(foe, me, [150, 150, 150]); sim.tick = orig; return sim.log.slice(b); }; s.lastHud = 5000; s.sandboxTick(10); });
await p.waitForTimeout(500);
const hadToast = await p.evaluate(() => !!document.querySelector('.toast button'));
await p.click('[data-base]'); await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.toast button')?.click()); await p.waitForTimeout(2500);
const active = await p.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
check('H1 a stale toast click leaves one scene running (and the toast existed)', hadToast && active.length === 1, `${hadToast ? '' : '(no toast) '}${active.join(',')}`);
await p.evaluate(() => { const g = window.__game; for (const sc of g.scene.getScenes(true)) g.scene.stop(sc.scene.key); g.scene.start('map'); }); await p.waitForTimeout(2500);

// M5: rotating mid-battle lays the field out again
await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; const me = sim.player; const foe = sim.nations.find((n) => !n.isPlayer); me.units = [30, 30, 30, 0]; foe.protectedUntil = 0; me.nextRaidAt = 0; me.plots = foe.plots.map(([x, y]) => [x + 1, y]); const r = sim.raid(me, foe, [30, 30, 30]); s.scene.start('battle', { report: r, back: 'map', home: me }); });
await p.waitForTimeout(3000);
await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(1500);
const lay = await p.evaluate(() => { const b = window.__game.scene.getScene('battle'); const g = window.__game.scale; return { w: g.width, h: g.height, cams: b.cameras.main.width, right: b.fighters.R.every((s) => s.home.x > g.width * 0.5) && b.fighters.L.every((s) => s.home.x < g.width * 0.5) }; });
check('M5 battle is laid out for the rotated screen (defenders on the right half)', lay.right, JSON.stringify(lay));
await p.setViewportSize({ width: 390, height: 844 });

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
