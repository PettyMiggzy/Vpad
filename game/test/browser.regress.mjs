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
  const X = s.px(cx) + 28, Y = s.px(cy) + 28; const tag = s.labels.find((l) => l.n === me); const tb = tag.getBounds(); return [[tb.centerX, tb.centerY], [X, Y + 35], [X - 20, Y + 30]].map(([x, y]) => (s.hitNation ? s.hitNation({ x, y })?.name : null) || null);
});
check('M2 nation is hit-tested by its name tag and hall tile', hit.every((n) => n === 'REGRESS'), JSON.stringify(hit));

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


// ---- UI audit findings ----
// H1: the centre button and a Nations row move the camera without killing the render loop
await p.evaluate(() => { const g = window.__game; for (const sc of g.scene.getScenes(true)) g.scene.stop(sc.scene.key); g.scene.start('map'); }); await p.waitForTimeout(3000);
const frame0 = await p.evaluate(() => window.__game.loop.frame);
const errBefore = errs.length;
await p.click('.rail [data-z="c"]'); await p.waitForTimeout(800);
await p.click('[data-rank]'); await p.waitForTimeout(500); await p.click('.nrow:nth-child(2)'); await p.waitForTimeout(900);
const frame1 = await p.evaluate(() => window.__game.loop.frame);
check('H1 centre button and Nations row keep the game running', frame1 > frame0 + 20 && errs.length === errBefore, `frames ${frame0}->${frame1}, new errors ${errs.length - errBefore}`);
const centred = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const me = s.sim.player; const c = s.cameras.main; return true; });

// M1: the first extra plot next to a one-plot capital can be tapped in its middle
const exp = await p.evaluate(() => {
  const s = window.__game.scene.getScene('map'); const me = s.sim.player; const [cx, cy] = me.plots[0];
  const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => s.sim.canExpand(cx + dx, cy + dy));
  const w = (dx, dy) => ({ x: s.px(cx + dx) + 28, y: s.px(cy + dy) + 28 });
  return open.map(([dx, dy]) => ({ nation: !!s.hitNation(w(dx, dy)) }));
});
check('M1 expandable plots next to the capital are not swallowed by the nation hit box', exp.length > 0 && exp.every((e) => !e.nation), JSON.stringify(exp));

// M2: while picking land the banner does not sit over the zoom and centre buttons (checked on a fresh game)
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const q = await ctx2.newPage();
await q.goto(`${BASE}?play`); await q.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
await q.evaluate(() => localStorage.removeItem('badlands.sandbox.v2')); await q.reload(); await q.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
await q.waitForSelector('[data-name]', { timeout: 30000 });
// H3: a name the screen would have let through as "A " is cleaned the same way by the engine
await q.fill('[data-name]', 'ab !'); await q.click('[data-next]'); await q.waitForTimeout(800);
const top = await q.evaluate(() => ['.rail [data-z="-"]', '.rail [data-z="c"]'].map((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === document.querySelector(sel); }));
check('M2 zoom-out and centre are reachable during land pick', top.every(Boolean), JSON.stringify(top));
await q.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; let best = null; for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (sim.canFound(x, y) && sim.kind(x, y) === 0 && !best) best = [x, y]; const c = s.cameras.main; c.setZoom(1.2 * window.__dpr); c.centerOn(s.px(best[0]) + 28, s.px(best[1]) + 28); });
await q.waitForTimeout(400); await q.touchscreen.tap(195, 422); await q.waitForTimeout(600); await q.click('[data-go]'); await q.waitForTimeout(2500);
check('H3 founding with the name "ab !" completes', await q.evaluate(() => !!window.__game.scene.getScene('map').sim.player), '');
// H2: New game really wipes (the page-hide save must not write it back)
await q.evaluate(() => { const s = window.__game.scene.getScene('map'); s.sim.reset(); window.dispatchEvent(new Event('pagehide')); });
check('H2 a wiped save is not written back', await q.evaluate(() => localStorage.getItem('badlands.sandbox.v2') === null), '');
await ctx2.close();

// H4: storage that throws must not freeze the game after founding
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx3.addInitScript(() => { const boom = () => { throw new DOMException('blocked', 'SecurityError'); }; try { Object.defineProperty(window, 'localStorage', { get: boom }); } catch (_) {} });
const r = await ctx3.newPage(); const errs3 = []; r.on('pageerror', (e) => errs3.push(String(e)));
await r.goto(`${BASE}?play`); await r.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
await r.waitForSelector('[data-name]', { timeout: 30000 }); await r.fill('[data-name]', 'Blocked'); await r.click('[data-next]'); await r.waitForTimeout(800);
await r.evaluate(() => { const s = window.__game.scene.getScene('map'); const sim = s.sim; let best = null; for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (sim.canFound(x, y) && sim.kind(x, y) === 0 && !best) best = [x, y]; const c = s.cameras.main; c.setZoom(1.2 * window.__dpr); c.centerOn(s.px(best[0]) + 28, s.px(best[1]) + 28); });
await r.waitForTimeout(400); await r.touchscreen.tap(195, 422); await r.waitForTimeout(600); await r.click('[data-go]'); await r.waitForTimeout(3000);
const alive = await r.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
check('H4 the game survives blocked browser storage after founding', alive.includes('map') && errs3.length === 0, `${alive.join(',')} ${errs3[0] || ''}`);
await ctx3.close();

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
