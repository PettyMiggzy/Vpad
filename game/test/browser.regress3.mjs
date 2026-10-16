// Round 2 battle/map regression checks (use like browser.regress.mjs).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${BASE}?preview`); await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 180000 });
await p.waitForTimeout(2500);
const scene = () => window.__game.scene.getScene('map');

// M2: no building base and no walker target in the sea, for every nation in the preview world (incl. KRILL/GLORP/WOBBLE on the edges)
const sea = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); let bad = 0, total = 0; for (const n of s.world.nations) for (let i = 0; i < 80; i++) { const [x, y] = s.yardPoint(n); total++; const T = 56, R = s.grid.R, M = 5; const tx = Math.floor(x / T) - R - M, ty = Math.floor(y / T) - R - M; const k = Math.abs(tx) > R || Math.abs(ty) > R ? 1 : s.world.terrain(tx, ty); if (k === 1 || k === 2) bad++; } return { bad, total }; });
check('R2-M2 walker targets are never on water or mountain tiles', sea.bad === 0, JSON.stringify(sea));
const parts = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const out = []; for (const [n, objs] of s.nationObjects) for (const o of objs) if (o.texture && /^b_(gate|wall|tower)$/.test(o.texture.key)) out.push(s.landPoint(o.x, o.y - 4)); return out; });
check('R2-M2 walls, towers and gates are only drawn on land', parts.every(Boolean), `${parts.filter((x) => !x).length} of ${parts.length} off land`);

// M3: at minimum zoom the war name tag is tappable at its ends and top
await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.setZoom(s.minZoom()); const w = s.warSpots[0]; c.centerOn(w.x, w.y); });
await p.waitForTimeout(600);
const tags = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.preRender(); const b = s.warSpots[0].lbl.getBounds(); const pts = [[b.x + 3, b.centerY], [b.right - 3, b.centerY], [b.centerX, b.y + 3]]; return pts.map(([x, y]) => { s.sheet.close(); s.onTap({ x: (x - c.worldView.x) * c.zoom, y: (y - c.worldView.y) * c.zoom }); return /WAR/.test(document.querySelector('.sheet')?.textContent || ''); }); });
check('R2-M3 war name tags are tappable at their ends when zoomed out', tags.every(Boolean), JSON.stringify(tags));

// M4: a nation tag on the top row (GLORP) is tappable
const top = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; const n = s.world.nations.find((x) => x.plots[0][1] <= -11) || s.world.nations[0]; const tag = s.labels.find((l) => l.n === n); c.setZoom(1.1 * window.__dpr); c.centerOn(tag.x, tag.y + 40); return n.name; });
await p.waitForTimeout(500);
const tapTag = await p.evaluate((name) => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.preRender(); const tag = s.labels.find((l) => l.n && l.n.name === name); const b = tag.getBounds(); s.sheet.close(); s.onTap({ x: (b.centerX - c.worldView.x) * c.zoom, y: (b.centerY - c.worldView.y) * c.zoom }); return document.querySelector('.sheet')?.textContent || ''; }, top);
check('R2-M4 a top-row nation tag opens the nation', tapTag.includes(top), top);

// L4: at minimum zoom the camera view always fits inside the world bounds (no flat seam)
const seam = await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const c = s.cameras.main; c.setZoom(s.minZoom()); c.centerOn(s.grid.size / 2, s.grid.size / 2); const v = c.worldView; const b = c._bounds; return { w: v.width <= b.width + 1, h: v.height <= b.height + 1 }; });
check('R2-L4 zoomed out, the view fits inside the world (no seam)', seam.w && seam.h, JSON.stringify(seam));

// M1: a report built from the chain's own numbers shows no invented losses
await p.evaluate(() => { const s = window.__game.scene.getScene('map'); const [a, b] = s.world.nations; const snap = (n, u) => ({ name: n.name, color: n.color, emblem: n.emblem, units: u, wall: n.wall, tower: n.tower }); s.scene.start('battle', { report: { estimated: true, result: { attack: 3000, defense: 5000, success: false }, send: [10, 10, 10], loot: 0, a: snap(a, [10, 10, 10, 0]), b: snap(b, [10, 10, 10, 5]) }, back: 'map' }); });
await p.waitForTimeout(1500);
await p.click('[data-fast]'); await p.click('[data-fast]');               // 6x so the fight ends quickly
await p.waitForSelector('.battle-result.on', { timeout: 90000 });
const card = await p.evaluate(() => document.querySelector('.battle-result').innerText);
check('R2-M1 a chain-built report shows no invented losses', !/loses/i.test(card) && /3,000/.test(card), card.replace(/\n/g, ' ').slice(0, 90));
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
