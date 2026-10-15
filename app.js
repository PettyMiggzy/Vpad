(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var ART_FILES = { world: 'art/world.jpg', war: 'art/war.jpg', land: 'art/land.jpg' };
  var ART = {};
  Object.keys(ART_FILES).forEach(function (k) { var im = new Image(); im.onload = function () { ART[k] = im; if (k === 'world') initWorld(); }; im.onerror = function () { if (k === 'world') initWorld(); }; im.src = ART_FILES[k]; });

  /* ---------- state ---------- */
  var S = {
    usdc: 300, coin: 50000, food: 80, gold: 40, soldiers: 0, queue: 0,
    spent: { land: 0, war: 0, style: 0 }, spentCoin: 0, burnedYou: 0, chestYou: 0, baseBurned: 4210000, baseChest: 1840000,
    owned: { 'skin:knights': 1, 'castle:stone': 1, 'roof:red': 1, 'cry:0': 1, 'banner:#46d39a': 1 },
    style: { skin: 'knights', castle: 'stone', banner: '#46d39a', cry: 0, roof: 'red', blood: true },
    reinf: 0, reinfBonus: 0
  };
  var HOLD_MIN = 10000, REINF_COST = 5, REINF_STEP = 0.5, REINF_CAP = 5;
  var ROOFS = { red: '#b94a35', blue: '#3f6fb5', gold: '#d9a93a' };
  var CRIES = ['FOR THE SPUDS!', 'WAGMI', 'NO RETREAT', 'MOON OR DIE'];
  var BANNERS = ['#46d39a', '#4cc9f0', '#ff6f91', '#a78bfa', '#ff8a4c', '#f6c453'];
  function fmt(n) { return Math.round(n).toLocaleString(); }
  function usd(n) { return '$' + n.toFixed(2); }
  function toRGB(c) { if (c.charAt(0) === '#') { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } var m = c.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  function shade(c, f) { var a = toRGB(c); return 'rgb(' + Math.min(255, Math.round(a[0] * f)) + ',' + Math.min(255, Math.round(a[1] * f)) + ',' + Math.min(255, Math.round(a[2] * f)) + ')'; }
  function mixc(a, b, t) { var A = toRGB(a), B = toRGB(b); return 'rgb(' + Math.round(A[0] * (1 - t) + B[0] * t) + ',' + Math.round(A[1] * (1 - t) + B[1] * t) + ',' + Math.round(A[2] * (1 - t) + B[2] * t) + ')'; }
  function rng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var tT; function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove('on'); }, 2400); }
  function fit(canvas, h) {
    var w = canvas.parentNode.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.height = h + 'px'; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    return { w: w, h: h, dpr: dpr, ctx: canvas.getContext('2d') };
  }
  function chestBonus() { return (S.baseChest + S.chestYou) / 1e6; }

  /* ---------- feed + flow counters ---------- */
  function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var C = { launches: 1200, claims: 7, vol: 0, fees: 0, landUsd: 0, burn: 0, pots: 0 }, feed = [], flowT = 0;
  function say(cls, html) { feed.unshift({ cls: cls, html: html }); if (feed.length > 60) feed.pop(); }
  function renderFlow() {
    $('flowCard').innerHTML = '<h3>Live flow (simulated)</h3><div class="stats">' +
      '<div><span>Launches</span><b>' + fmt(C.launches) + '</b></div><div><span>Nations</span><b>' + nationCount() + '</b></div>' +
      '<div><span>Trading volume</span><b>$' + fmt(C.vol) + '</b></div><div><span>VYRE fees (1%)</span><b class="gold-t">$' + fmt(C.fees) + '</b></div>' +
      '<div><span>Land + style sales</span><b class="gold-t">$' + fmt(C.landUsd) + '</b></div><div><span>Coin burned</span><b>' + fmt(C.burn) + '</b></div>' +
      '<div><span>War pots → buybacks</span><b>$' + fmt(C.pots) + '</b></div><div><span>Claims today</span><b>' + (C.claims - 7) + '</b></div>' +
      '<div><span>REAL test-chain launches</span><b class="up">' + (realInfo.total == null ? '…' : fmt(realInfo.total)) + '</b></div><div><span>Real, refreshed</span><b>' + (realInfo.err ? 'failed' : (realInfo.at || '…')) + '</b></div></div>' +
      '<div class="feed">' + feed.slice(0, 9).map(function (f) { return '<div class="' + f.cls + '">' + f.html + '</div>'; }).join('') + '</div>';
  }

  /* ---------- ledger + wallet ---------- */
  function updateWallet() { $('wUsdc').textContent = usd(S.usdc); $('wCoin').textContent = fmt(S.coin); }
  function updateLedger() {
    var bu = S.baseBurned + S.burnedYou, ch = S.baseChest + S.chestYou, tot = S.spent.land + S.spent.war + S.spent.style;
    $('ledger').innerHTML = '<h3>Where your money goes</h3>' +
      '<div class="flow"><span>You pay <em>USDC</em> + <em>coin</em></span>→<span>USDC to VYRE</span><span>Coin: <em>60%</em> burned</span><span>Coin: <em>40%</em> war chest</span></div>' +
      '<div class="bar"><i style="width:60%;background:var(--hot)"></i><i style="width:40%;background:var(--gold)"></i></div>' +
      '<div class="stats"><div><span>You paid VYRE</span><b>' + usd(tot) + '</b></div><div><span>of it: land</span><b>' + usd(S.spent.land) + '</b></div>' +
      '<div><span>of it: war calls</span><b>' + usd(S.spent.war) + '</b></div><div><span>of it: skins</span><b>' + usd(S.spent.style) + '</b></div>' +
      '<div><span>Burned (you)</span><b>' + fmt(S.burnedYou) + '</b></div><div><span>Chest (you)</span><b>' + fmt(S.chestYou) + '</b></div>' +
      '<div><span>SPUDS burned, all</span><b>' + fmt(bu) + '</b></div><div><span>SPUDS war chest</span><b>' + fmt(ch) + '</b></div></div>' +
      '<p class="muted" style="font-size:13px">The war chest is a shared defense fund. Every 1M SPUDS in it adds +1% to the nation\'s war score (now +' + chestBonus().toFixed(2) + '%). It pays no one.</p>';
  }
  function pay(usdc, coin, kind) {
    if (S.usdc < usdc - 1e-9 || S.coin < coin) { toast('Not enough funds. Use "Refill pretend wallet".'); return false; }
    S.usdc -= usdc; S.coin -= coin; S.spent[kind] += usdc; S.spentCoin += coin; S.burnedYou += coin * 0.6; S.chestYou += coin * 0.4;
    C.landUsd += usdc; C.burn += coin * 0.6; updateWallet(); updateLedger(); return true;
  }
  $('topup').addEventListener('click', function () { S.usdc = 300; S.coin = 50000; updateWallet(); toast('Pretend wallet refilled'); });

  /* ============================== WORLD ============================== */
  var WW = 1000, WH = 750, GW = 200, GH = 150, CS = 5;
  var nations = [
    { id: 0, name: 'SPUDS', color: '#46d39a', seed: [3, 4], w: 1.3, chain: 1, mcap: 4.8, ch: 12.4, holders: 9120 },
    { id: 1, name: 'KRILL', color: '#4cc9f0', seed: [7, 2], w: 1.0, chain: 2, mcap: 3.6, ch: -3.1, holders: 6340 },
    { id: 2, name: 'TOASTY', color: '#ff6f91', seed: [11, 3], w: 1.1, chain: 3, mcap: 3.9, ch: 7.8, holders: 7015 },
    { id: 3, name: 'WOBBLE', color: '#ffc145', seed: [7, 6], w: 1.2, chain: 4, mcap: 4.1, ch: 2.2, holders: 8230 },
    { id: 4, name: 'GLORP', color: '#a78bfa', seed: [11, 7], w: 0.9, chain: 5, mcap: 2.7, ch: -8.6, holders: 4410 },
    { id: 5, name: 'NIMBLE', color: '#ff8a4c', seed: [3, 7], w: 0.8, chain: 6, mcap: 2.2, ch: 19.5, holders: 3890 },
    { id: 6, name: 'DUSTY', color: '#b6e04a', seed: [13, 5], w: 0.7, chain: 7, mcap: 1.9, ch: 0.9, holders: 2975 }
  ];
  nations.forEach(function (n) { n.cells = []; });
  var land = new Uint8Array(GW * GH), near = new Uint8Array(GW * GH), owner = new Int16Array(GW * GH), terr = null, worldReady = false;
  owner.fill(-1);
  var syl = ['zap', 'mo', 'chi', 'blip', 'fluf', 'doge', 'wag', 'pip', 'nub', 'glim', 'tor', 'bunk', 'snor', 'quo', 'frizz', 'yeti', 'crum', 'boop', 'lum', 'vex', 'pog', 'rizz', 'gub', 'wiff'];
  var rr = rng(2026), dots = [], simR = rng(555);
  function mkName(r) { return (syl[Math.floor(r() * syl.length)] + syl[Math.floor(r() * syl.length)]).toUpperCase().slice(0, 7); }
  function onLand(x, y) { var ix = Math.floor(x / CS), iy = Math.floor(y / CS); if (ix < 0 || iy < 0 || ix >= GW || iy >= GH) return true; return near[iy * GW + ix] === 1; }
  function nz(x, y) { return (Math.sin(x * 0.21 + 1.3) * Math.sin(y * 0.17 + 0.4) + Math.sin(x * 0.07 + y * 0.11 + 2.0)) * 0.5; }
  function cellXY(i) { return [(i % GW + 0.5) * CS, (Math.floor(i / GW) + 0.5) * CS]; }
  function initWorld() {
    if (worldReady) return;
    var cv = document.createElement('canvas'); cv.width = GW; cv.height = GH; var c = cv.getContext('2d', { willReadFrequently: true }), ok = false, i, x, y;
    try {
      if (ART.world) { c.drawImage(ART.world, 0, 0, GW, GH); var d = c.getImageData(0, 0, GW, GH).data; for (i = 0; i < GW * GH; i++) { var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; land[i] = (b > r + 25 && b >= g - 8) ? 0 : 1; } ok = true; }
    } catch (e) { ok = false; }
    if (!ok) { for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) { var ex = (x - 100) / 66, ey = (y - 75) / 50; land[y * GW + x] = ex * ex + ey * ey + 0.12 * nz(x, y) < 1 ? 1 : 0; } }
    function smoothL() { var out = new Uint8Array(GW * GH); for (var yy = 0; yy < GH; yy++) for (var xx = 0; xx < GW; xx++) { var n = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var X = xx + dx, Y = yy + dy; if (X >= 0 && Y >= 0 && X < GW && Y < GH) n += land[Y * GW + X]; } out[yy * GW + xx] = n >= 5 ? 1 : 0; } land.set(out); }
    smoothL(); smoothL();
    var lab = new Int32Array(GW * GH), sizes = [0], nl = 0, st = [];
    for (i = 0; i < GW * GH; i++) { if (!land[i] || lab[i]) continue; nl++; sizes[nl] = 0; st.push(i); lab[i] = nl; while (st.length) { var q = st.pop(); sizes[nl]++; var qx = q % GW, qy = (q / GW) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { var X = qx + dd[0], Y = qy + dd[1]; if (X < 0 || Y < 0 || X >= GW || Y >= GH) return; var j = Y * GW + X; if (land[j] && !lab[j]) { lab[j] = nl; st.push(j); } }); } }
    var main = 1; for (i = 2; i <= nl; i++) if (sizes[i] > sizes[main]) main = i;
    for (i = 0; i < GW * GH; i++) if (land[i] && sizes[lab[i]] < 4) land[i] = 0;
    var cells = []; for (i = 0; i < GW * GH; i++) if (lab[i] === main && land[i]) cells.push(i);
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) { var hit = 0; for (var dy = -3; dy <= 3 && !hit; dy++) for (var dx = -3; dx <= 3; dx++) { var X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < GW && Y < GH && land[Y * GW + X]) { hit = 1; break; } } near[y * GW + x] = hit; }
    var sr = rng(7), seeds = [], k;
    var c0 = cellXY(cells[Math.floor(cells.length / 2)]); seeds.push(c0);
    while (seeds.length < nations.length) { var bi = 0, bd = -1; for (i = 0; i < cells.length; i += 3) { var p = cellXY(cells[i]), md = 1e9; seeds.forEach(function (q) { md = Math.min(md, Math.hypot(q[0] - p[0], q[1] - p[1])); }); md += sr() * 10; if (md > bd) { bd = md; bi = i; } } seeds.push(cellXY(cells[bi])); }
    for (var it = 0; it < 6; it++) {
      var sum = seeds.map(function () { return [0, 0, 0]; });
      cells.forEach(function (ci) { var p = cellXY(ci), best = 0, bdd = 1e9; seeds.forEach(function (q, kk) { var dd = Math.hypot(q[0] - p[0], q[1] - p[1]) / nations[kk].w; if (dd < bdd) { bdd = dd; best = kk; } }); sum[best][0] += p[0]; sum[best][1] += p[1]; sum[best][2]++; });
      seeds = seeds.map(function (q, kk) { if (!sum[kk][2]) return q; var mx = sum[kk][0] / sum[kk][2], my = sum[kk][1] / sum[kk][2], bc = null, bdd = 1e9; cells.forEach(function (ci) { var p = cellXY(ci), dd = Math.hypot(p[0] - mx, p[1] - my); if (dd < bdd) { bdd = dd; bc = p; } }); return bc; });
    }
    cells.forEach(function (ci) { var p = cellXY(ci), best = 0, bdd = 1e9, f = 1 + 0.4 * nz(p[0] * 0.33, p[1] * 0.33); seeds.forEach(function (q, kk) { var dd = Math.hypot(q[0] - p[0], q[1] - p[1]) / nations[kk].w * f; if (dd < bdd) { bdd = dd; best = kk; } }); owner[ci] = best; });
    for (var pass = 0; pass < 2; pass++) { var snap = owner.slice(); cells.forEach(function (ci) { var cnt = {}, bk = snap[ci], bn = 0; var cx0 = ci % GW, cy0 = (ci / GW) | 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var X = cx0 + dx, Y = cy0 + dy; if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue; var o = snap[Y * GW + X]; if (o < 0) continue; cnt[o] = (cnt[o] || 0) + 1; if (cnt[o] > bn) { bn = cnt[o]; bk = o; } } owner[ci] = bk; }); }
    nations.forEach(function (n) { n.cells = []; });
    cells.forEach(function (ci) { if (owner[ci] >= 0) nations[owner[ci]].cells.push(ci); });
    nations.forEach(function (n, kk) { if (!n.cells.length) { n.cx = seeds[kk][0]; n.cy = seeds[kk][1]; return; } var mx = 0, my = 0; n.cells.forEach(function (ci) { var p = cellXY(ci); mx += p[0]; my += p[1]; }); mx /= n.cells.length; my /= n.cells.length; var bc = null, bdd = 1e9; n.cells.forEach(function (ci) { var p = cellXY(ci), dd = Math.hypot(p[0] - mx, p[1] - my); if (dd < bdd) { bdd = dd; bc = p; } }); n.cx = bc[0]; n.cy = bc[1]; });
    buildTerr();
    var sp = rng(11), sh = []; var tries = 0;
    while (sh.length < 5 && tries++ < 400) { var sx = 40 + sp() * (WW - 80), sy = 40 + sp() * (WH - 80); if (!onLand(sx, sy) && !onLand(sx - 40, sy) && !onLand(sx + 40, sy) && !onLand(sx, sy - 30) && !onLand(sx, sy + 30)) sh.push({ x0: sx, y0: sy, ax: 14 + sp() * 20, ay: 8 + sp() * 12, sp: 0.15 + sp() * 0.08, ph: sp() * 6 }); }
    ships = sh;
    while (dots.length < 1200) { var dx2 = 8 + rr() * (WW - 16), dy2 = 8 + rr() * (WH - 16); if (onLand(dx2, dy2)) continue; dots.push({ x: dx2, y: dy2, pct: 100 * Math.pow(rr(), 6), name: mkName(rr), claimed: false, readyAt: 0, born: -999, demo: true }); }
    [[0, 100], [1, 100], [2, 100], [3, 97], [4, 94], [5, 91], [6, 88], [7, 84], [8, 82], [9, 80], [10, 76], [11, 71]].forEach(function (a) { dots[a[0] * 37 % dots.length].pct = a[1]; });
    worldReady = true; worldCounts(); if (typeof ctxWorld === 'function') ctxWorld(); loadReal(); setInterval(loadReal, 30000);
  }
  function buildTerr() {
    var tc = document.createElement('canvas'); tc.width = GW; tc.height = GH; var c = tc.getContext('2d'), id = c.createImageData(GW, GH), lm = document.createElement('canvas'); lm.width = GW; lm.height = GH; var lc = lm.getContext('2d'), lid = lc.createImageData(GW, GH), i;
    for (i = 0; i < GW * GH; i++) { var o = owner[i]; if (o >= 0) { var rgb = toRGB(nations[o].color); id.data[i * 4] = rgb[0]; id.data[i * 4 + 1] = rgb[1]; id.data[i * 4 + 2] = rgb[2]; id.data[i * 4 + 3] = 92; } if (land[i]) { lid.data[i * 4] = 255; lid.data[i * 4 + 1] = 255; lid.data[i * 4 + 2] = 255; lid.data[i * 4 + 3] = 255; } }
    c.putImageData(id, 0, 0); lc.putImageData(lid, 0, 0);
    var H = document.createElement('canvas'); H.width = WW; H.height = WH; var h = H.getContext('2d'); h.imageSmoothingEnabled = true; h.imageSmoothingQuality = 'high';
    h.drawImage(tc, 0, 0, WW, WH); h.globalCompositeOperation = 'destination-in'; h.drawImage(lm, 0, 0, WW, WH); h.globalCompositeOperation = 'source-over';
    h.fillStyle = 'rgba(20,12,0,.38)'; var dotsB = [];
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) { var a = owner[y * GW + x]; if (a < 0) continue; if (x < GW - 1) { var b = owner[y * GW + x + 1]; if (b >= 0 && b !== a) dotsB.push([(x + 1) * CS, (y + 0.5) * CS]); } if (y < GH - 1) { var b2 = owner[(y + 1) * GW + x]; if (b2 >= 0 && b2 !== a) dotsB.push([(x + 0.5) * CS, (y + 1) * CS]); } }
    dotsB.forEach(function (p) { h.beginPath(); h.arc(p[0], p[1] + 0.8, 2.6, 0, 7); h.fill(); });
    h.fillStyle = 'rgba(255,242,196,.95)'; dotsB.forEach(function (p) { h.beginPath(); h.arc(p[0], p[1], 1.7, 0, 7); h.fill(); });
    terr = H;
  }
  function transferCells(loser, winner, k) {
    if (!loser.cells.length || !winner.cells.length) return 0;
    var moved = 0;
    while (moved < k && loser.cells.length > 60) {
      var best = -1, bd = 1e9;
      for (var q = 0; q < loser.cells.length; q++) { var ci = loser.cells[q], cx0 = ci % GW, cy0 = (ci / GW) | 0, adj = false; for (var dy = -1; dy <= 1 && !adj; dy++) for (var dx = -1; dx <= 1; dx++) { var X = cx0 + dx, Y = cy0 + dy; if (X >= 0 && Y >= 0 && X < GW && Y < GH && owner[Y * GW + X] === winner.id) { adj = true; break; } } if (!adj) continue; var p = cellXY(ci), dd = Math.hypot(p[0] - winner.cx, p[1] - winner.cy); if (dd < bd) { bd = dd; best = q; } }
      if (best < 0) break; var cc = loser.cells.splice(best, 1)[0]; owner[cc] = winner.id; winner.cells.push(cc); moved++;
    }
    if (moved) buildTerr(); return moved;
  }
  function mcOf(d) { return Math.max(3000, d.pct / 100 * 50000); }
  function netOf(d) { return 3000 * (Math.sqrt(mcOf(d) / 3000) - 1); }
  function nationCount() { return nations.length; }
  var CW, cam = { cx: WW / 2, cy: WH / 2, z: 1 }, selWorld = null, hover = null, drag = null, speed = 4, paused = false, simT = 0, simAcc = 0, warAcc = 18;
  var ships = [{ x0: 120, y0: 560, ax: 90, ay: 20, sp: 0.18, ph: 0 }, { x0: 820, y0: 120, ax: 70, ay: 30, sp: 0.15, ph: 2 }, { x0: 880, y0: 520, ax: 60, ay: 40, sp: 0.2, ph: 4 }, { x0: 90, y0: 150, ax: 50, ay: 25, sp: 0.17, ph: 1 }];
  function wScale() { return Math.min(CW.w / WW, CW.h / WH) * cam.z; }
  function clampCam() { var s = wScale(), hw = CW.w / (2 * s), hh = CW.h / (2 * s); cam.cx = hw * 2 >= WW ? WW / 2 : Math.max(hw, Math.min(WW - hw, cam.cx)); cam.cy = hh * 2 >= WH ? WH / 2 : Math.max(hh, Math.min(WH - hh, cam.cy)); }
  function hexPath(ctx, x, y, s, ox, oy, R) { ctx.beginPath(); for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i - 30), px = ox + (x + (R - 0.6) * Math.cos(a)) * s, py = oy + (y + (R - 0.6) * Math.sin(a)) * s; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); }
  function drawSea(ctx, t, ox, oy, s) {
    ctx.fillStyle = '#0a2a44'; ctx.fillRect(0, 0, CW.w, CW.h);
    if (ART.world) ctx.drawImage(ART.world, ox, oy, WW * s, WH * s);
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, WW * s, WH * s); ctx.clip(); ctx.strokeStyle = 'rgba(210,240,255,.045)'; ctx.lineWidth = 1.2;
    for (var k = 0; k < 26; k++) { var y0 = oy + (k + 0.5) * WH * s / 26; ctx.beginPath(); for (var x = 0; x <= CW.w; x += 14) { var y = y0 + Math.sin(x * 0.03 + t * 0.7 + k * 1.3) * 3 * s; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.restore();
    var vg = ctx.createRadialGradient(CW.w / 2, CW.h / 2, CW.h * 0.45, CW.w / 2, CW.h / 2, CW.w * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, CW.w, CW.h);
  }
  function drawCompass(ctx) {
    var x = 54, y = CW.h - 54; ctx.save(); ctx.translate(x, y); ctx.strokeStyle = 'rgba(235,224,176,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(235,224,176,.65)'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(5, 0); ctx.lineTo(0, 30); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(0, 4); ctx.lineTo(30, 0); ctx.lineTo(0, -4); ctx.closePath(); ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
    ctx.font = '700 10px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -34); ctx.restore();
  }
  function drawShip(ctx, sx, sy, t, ph) {
    var bob = Math.sin(t * 2 + ph) * 1.2; ctx.save(); ctx.translate(sx, sy + bob);
    ctx.fillStyle = '#5b3a24'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e9e4d2'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(7, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#2a1a10'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-9, 5, 18, 1.2); ctx.restore();
  }
  function drawIsle(ctx, n, s, ox, oy, t) {
    var g = Math.min(1, Math.max(0.05, (t - (n.isl.born || 0)) / 2.2)), r = n.isl.r * s * g, x = ox + n.isl.x * s, y = oy + n.isl.y * s;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(3, 5, r * 1.12, r * 0.7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 + 0.2 * Math.sin(t * 2 + n.id)) + ')'; ctx.lineWidth = Math.max(1.5, 2.2 * s); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.74, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ecd9a0'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.64, 0, 0, 7); ctx.fill();
    var gr = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r * 0.8); gr.addColorStop(0, '#78b95a'); gr.addColorStop(1, '#4d9142'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -r * 0.04, r * 0.76, r * 0.48, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = n.color; ctx.lineWidth = Math.max(1.5, 2 * s); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.84, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    [[-0.35, 0.05], [0.3, -0.1], [0.05, 0.22]].forEach(function (p, k) { var px = p[0] * r, py = p[1] * r, u = Math.max(0.7, s * 0.9); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(px - 0.8 * u, py - 8 * u, 1.6 * u, 8 * u); ctx.fillStyle = '#2f8a47'; ctx.beginPath(); ctx.arc(px, py - 9 * u, 4.2 * u, 0, 7); ctx.fill(); });
    ctx.restore();
  }
  function drawKeep(ctx, n, s, ox, oy, t) {
    var u = Math.min(1.8, Math.max(0.7, s * (n.claimed ? 0.55 : 1.0))), x = ox + n.cx * s, y = oy + n.cy * s;
    ctx.save(); ctx.translate(x, y); ctx.scale(u, u);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 4, 13, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8d0bf'; ctx.fillRect(-9, -12, 18, 16); ctx.fillStyle = '#b3ab9a'; ctx.fillRect(2, -12, 7, 16);
    ctx.fillStyle = '#d8d0bf'; for (var i = 0; i < 4; i++) ctx.fillRect(-9 + i * 5, -16, 3, 4);
    ctx.fillStyle = '#4b3a2a'; ctx.fillRect(-2.5, -3, 5, 7);
    ctx.fillStyle = '#ddd'; ctx.fillRect(-0.7, -28, 1.4, 14); ctx.fillStyle = n.color; ctx.beginPath(); ctx.moveTo(0.7, -28); ctx.lineTo(10 + Math.sin(t * 4) * 1.6, -24.5); ctx.lineTo(0.7, -21); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawWorld(t) {
    var ctx = CW.ctx, s = wScale(); ctx.setTransform(CW.dpr, 0, 0, CW.dpr, 0, 0);
    var ox = CW.w / 2 - cam.cx * s, oy = CW.h / 2 - cam.cy * s;
    if (!worldReady) { ctx.fillStyle = '#0a2a44'; ctx.fillRect(0, 0, CW.w, CW.h); ctx.fillStyle = '#9fc4dc'; ctx.font = '600 14px Instrument Sans, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Painting the world…', CW.w / 2, CW.h / 2); return; }
    drawSea(ctx, t, ox, oy, s);
    ships.forEach(function (sh) { var wx = sh.x0 + Math.sin(t * sh.sp + sh.ph) * sh.ax, wy = sh.y0 + Math.cos(t * sh.sp * 0.8 + sh.ph) * sh.ay; drawShip(ctx, ox + wx * s, oy + wy * s, t, sh.ph); });
    if (terr) ctx.drawImage(terr, ox, oy, WW * s, WH * s);
    nations.forEach(function (n) { if (n.isl) drawIsle(ctx, n, s, ox, oy, t); });
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i]; if (d.claimed || (d.demo && !showDemo)) continue;
      var sx = ox + d.x * s, sy = oy + d.y * s; if (sx < -12 || sy < -12 || sx > CW.w + 12 || sy > CW.h + 12) continue;
      var rad = (d.real ? 2.2 : 0.8) + d.pct / 100 * 2.6 * (0.75 + 0.25 * cam.z), age = t - d.born;
      var col = d.real ? mixc('#bfe6ff', '#f6c453', Math.min(1, d.pct / 30)) : (d.pct >= 100 ? '#46d39a' : mixc('#4a7da0', '#f6c453', Math.min(1, d.pct / 90)));
      if (age < 2.2) { ctx.beginPath(); ctx.arc(sx, sy, 2 + age * 14, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 - age / 3.2) + ')'; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (d.pct >= 70) { ctx.beginPath(); ctx.arc(sx, sy, rad + 3 + Math.sin(t * 3 + i) * 1.2, 0, 7); ctx.strokeStyle = d.pct >= 100 ? 'rgba(70,211,154,.75)' : 'rgba(246,196,83,.45)'; ctx.lineWidth = 1.4; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(sx, sy, rad + 2.2, 0, 7); ctx.fillStyle = 'rgba(' + toRGB(col).join(',') + ',' + (d.pct < 12 ? 0.08 : 0.2) + ')'; ctx.fill();
      if (d.real) { ctx.beginPath(); ctx.arc(sx, sy, rad + 2.6, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.4; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 7); ctx.globalAlpha = d.pct < 12 ? 0.6 : 1; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
      if ((d.pct >= 70 && cam.z >= 1.4) || (cam.z >= 3.2 && d.pct >= 20) || (d.real && cam.z >= 2)) { ctx.fillStyle = '#d6e4ee'; ctx.font = '600 10px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(d.name, sx, sy - rad - 5); }
    }
    nations.forEach(function (n) { drawKeep(ctx, n, s, ox, oy, t); });
    ctx.textAlign = 'center';
    nations.forEach(function (n) {
      var px = ox + n.cx * s, py = oy + n.cy * s + (n.claimed ? 14 : 22) * Math.max(0.8, Math.min(1.6, s)), txt = n.name; ctx.font = '800 ' + Math.round(n.claimed ? 10 : 11 + 2 * Math.min(cam.z, 3)) + 'px Bricolage Grotesque, sans-serif';
      var tw = ctx.measureText(txt).width + 14; ctx.fillStyle = 'rgba(6,14,22,.82)'; ctx.fillRect(px - tw / 2, py - 11, tw, 17); ctx.strokeStyle = n.color; ctx.lineWidth = 1.2; ctx.strokeRect(px - tw / 2, py - 11, tw, 17); ctx.fillStyle = '#fff'; ctx.fillText(txt, px, py + 2);
    });
    drawCompass(ctx);
    if (selWorld && selWorld.dot && !selWorld.dot.claimed) { var d2 = selWorld.dot; ctx.beginPath(); ctx.arc(ox + d2.x * s, oy + d2.y * s, 11, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    if (hover && !drag) { ctx.font = '600 12px Instrument Sans, sans-serif'; var txt2 = hover.real ? hover.name + ' · REAL · $' + fmt(hover.mc) + ' cap' : hover.name + ' · ' + Math.round(hover.pct) + '% to land', tw2 = ctx.measureText(txt2).width + 14, hx = Math.min(CW.w - tw2 - 4, hover.sx + 12), hy = Math.max(4, hover.sy - 30); ctx.fillStyle = 'rgba(8,16,24,.92)'; ctx.fillRect(hx, hy, tw2, 22); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt2, hx + 7, hy + 15); ctx.textAlign = 'center'; }
  }
  function liveDots() { var n = 0; for (var i = 0; i < dots.length; i++) if (!dots[i].claimed) n++; return n; }
  function worldCounts() {
    var near = 0, ready = 0, live = 0; dots.forEach(function (d) { if (d.claimed || (d.demo && !showDemo)) return; live++; if (d.pct >= 100) ready++; else if (d.pct >= 80) near++; });
    $('worldStats').innerHTML = '<b>' + fmt(live) + '</b> villages shown (<b>' + realDots.length + '</b> real, white ring; the rest simulated) · <b>' + nations.length + '</b> nations · <b>' + near + '</b> within reach · <b>' + ready + '</b> ready to claim land. Zoom in, drag around, tap a dot.';
  }
  function dotAt(sx, sy) {
    var s = wScale(), ox = CW.w / 2 - cam.cx * s, oy = CW.h / 2 - cam.cy * s, best = null, bd = 10;
    for (var i = 0; i < dots.length; i++) { var d = dots[i]; if (d.claimed || (d.demo && !showDemo)) continue; var dist = Math.hypot(ox + d.x * s - sx, oy + d.y * s - sy); if (dist < bd) { bd = dist; best = d; } }
    return best;
  }
  function nationAt(sx, sy) {
    var s = wScale(), ox = CW.w / 2 - cam.cx * s, oy = CW.h / 2 - cam.cy * s, wx = (sx - ox) / s, wy = (sy - oy) / s;
    for (var k = 0; k < nations.length; k++) { var n = nations[k]; if (n.isl && Math.hypot(wx - n.isl.x, (wy - n.isl.y) * 1.5) < n.isl.r * 1.25) return n; }
    var ix = Math.floor(wx / CS), iy = Math.floor(wy / CS); if (ix < 0 || iy < 0 || ix >= GW || iy >= GH) return null; var o = owner[iy * GW + ix]; return o >= 0 ? nations[o] : null;
  }
  function ctxWorld() {
    var el = $('ctx');
    if (selWorld && selWorld.dot) {
      var d = selWorld.dot, ready = d.pct >= 100;
      if (d.real) {
        el.innerHTML = '<h3>REAL launch · VYRE test chain</h3><h2>' + esc(d.name) + '</h2><p class="muted" style="margin:2px 0 8px">' + esc(d.full) + '</p><div class="bar" style="margin:8px 0"><i style="width:' + Math.min(100, d.pct) + '%;background:var(--gold)"></i></div>' +
          '<div class="stats"><div><span>Market cap now</span><b>$' + fmt(d.mc) + '</b></div><div><span>Of the $50,000 line</span><b>' + d.pct.toFixed(1) + '%</b></div><div><span>Launch number</span><b>#' + d.index + '</b></div><div><span>Launched</span><b>' + new Date(d.createdAt * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC</b></div></div>' +
          '<p class="muted">Read from the chain just now. Test money, no value. Claiming land is part of the simulation only; nothing here is on chain yet.</p><p><a href="' + window.VyreChain.explorer + '/token/' + esc(d.token) + '" target="_blank" rel="noopener">Open this token in the explorer</a></p>';
        return;
      }
      el.innerHTML = '<h3>Village</h3><h2>' + d.name + '</h2><div class="bar" style="margin:8px 0"><i style="width:' + Math.min(100, d.pct) + '%;background:' + (ready ? 'var(--ok)' : 'var(--gold)') + '"></i></div>' +
        '<div class="stats"><div><span>Progress</span><b>' + Math.round(d.pct) + '% to land</b></div><div><span>Market cap</span><b>$' + fmt(mcOf(d)) + '</b></div><div><span>Net USDC in</span><b>$' + fmt(netOf(d)) + '</b></div><div><span>Needs</span><b>$50,000</b></div></div>' +
        (ready ? '<p>It reached the line. In the real thing it must hold it for 24 hours with enough different buyers. Here you can skip the wait.</p><button class="go" id="claimBtn">Claim land now (demo)</button>' : '<p class="muted">Not there yet. Every buy and sell moves this dot.</p>');
      var b = $('claimBtn'); if (b) b.addEventListener('click', function () { claim(d, true); });
    } else if (selWorld && selWorld.nation) {
      var n = selWorld.nation;
      el.innerHTML = '<h3>' + (n.claimed ? 'New nation · land claimed' : 'Nation · Chain #' + n.chain) + '</h3><h2 style="color:' + n.color + '">' + n.name + '</h2><div class="stats"><div><span>Land</span><b>' + n.hexes.length + ' hexes</b></div><div><span>Market cap</span><b>$' + n.mcap.toFixed(2) + 'M</b></div><div><span>24h</span><b class="' + (n.ch >= 0 ? 'up' : 'down') + '">' + (n.ch >= 0 ? '+' : '') + n.ch.toFixed(1) + '%</b></div><div><span>Citizens</span><b>' + fmt(n.holders) + '</b></div></div>' +
        (n.id === 0 ? '<button class="go" id="enter">Enter your land</button>' : '<p class="muted">Pretend you own a plot in SPUDS to try the game. This is a different nation.</p>');
      var e = $('enter'); if (e) e.addEventListener('click', function () { show('land'); });
    } else {
      el.innerHTML = '<h3>How a coin climbs</h3><div class="ladder"><div><b>Village</b><span>every launch starts here, $3,000</span></div><div><b>Claim land</b><span>$50K market cap ≈ $9.2K USDC bought in, held 24h, many wallets</span></div><div><b>Own chain</b><span>much later, about $1M market cap</span></div></div><p class="muted">Press play and watch it run: launches appear as ripples, dots climb, green ones claim land. Tap a dot or a nation.</p>';
    }
  }
  var xr = rng(31);
  function claim(d, manual) {
    d.claimed = true; var cols = ['#f472b6', '#5eead4', '#fca5a5', '#fde047', '#93c5fd', '#c4b5fd'], col = cols[(nations.length - 7) % cols.length];
    var n = { id: nations.length, name: d.name, color: col, claimed: true, cells: [], isl: { x: d.x, y: d.y, r: 15, born: performance.now() / 1000 }, chain: 0, mcap: 0.05 + xr() * 0.04, ch: (xr() - 0.3) * 20, holders: 600 + Math.round(xr() * 1400) }; n.cx = d.x; n.cy = d.y; nations.push(n);
    C.claims++; say('g', '<b>' + d.name + '</b> claimed land · a nation is born');
    if (manual) { selWorld = null; ctxWorld(); toast(d.name + ' claimed land. A chain comes much later.'); }
    worldCounts();
  }
  var evCool = 0;
  function simStep(dtSim, t) {
    if (!worldReady) return;
    simT += dtSim; var launches = 0;
    var spawn = Math.min(6, Math.floor(dtSim * 1.6 * (0.6 + simR()) + simR()));
    for (var q = 0; q < spawn; q++) {
      var x, y; do { x = 8 + simR() * (WW - 16); y = 8 + simR() * (WH - 16); } while (onLand(x, y));
      var nd = { x: x, y: y, pct: 0.1 + simR() * 1.4, name: mkName(simR), claimed: false, readyAt: 0, born: t, demo: true }; dots.push(nd); C.launches++; launches++;
      if (simR() < 0.35) say('', '<b>' + nd.name + '</b> launched · $3,000');
    }
    var picks = Math.min(260, Math.floor(60 * Math.sqrt(dtSim) + 20));
    for (var i = 0; i < picks; i++) {
      var d = dots[Math.floor(simR() * dots.length)]; if (!d || d.claimed || d.real) continue;
      var before = d.pct, mom = 0.25 + d.pct * 0.012, delta = (simR() - 0.42) * mom * (simR() < 0.08 ? 4 : 1);
      d.pct = Math.max(0, Math.min(100, d.pct + delta));
      var trade = (3 + simR() * 90) * (1 + d.pct / 30); C.vol += trade; C.fees += trade * 0.01;
      var m = [25, 50, 75, 90]; for (var k = 0; k < m.length; k++) if (before < m[k] && d.pct >= m[k] && simR() < 0.6) say('y', '<b>' + d.name + '</b> climbs to ' + m[k] + '% of land');
      if (d.pct >= 100 && !d.readyAt) { d.readyAt = simT; say('g', '<b>' + d.name + '</b> hit the line · 24h hold starts'); }
    }
    for (var j = 0; j < dots.length; j++) { var e = dots[j]; if (!e.claimed && !e.real && e.readyAt && simT - e.readyAt > 24 && nations.length < 21) claim(e, false); }
    nations.forEach(function (n2) { var sp = (0.4 + simR() * 2.4) * dtSim * 0.5; C.landUsd += sp; C.burn += sp * 140 * 0.6; });
    warAcc -= dtSim;
    if (warAcc <= 0) {
      warAcc = 40 + simR() * 40; var a = nations[Math.floor(simR() * nations.length)], b = nations[Math.floor(simR() * nations.length)];
      if (a !== b) { var pot = C.vol * 0.00002 * (0.5 + simR()); C.pots += pot; say('r', '<b>' + a.name + '</b> vs <b>' + b.name + '</b> war ends · pot $' + fmt(pot) + ' buys back the winner'); }
    }
    if (launches && dots.length > 2600) { for (var z = dots.length - 1; z >= 0 && dots.length > 2400; z--) if (!dots[z].claimed && dots[z].pct < 2 && simR() < 0.5) dots.splice(z, 1); }
  }

  var realDots = [], realInfo = { total: null, at: null, err: false }, showDemo = true, realBusy = false;
  function fnv(str) { var x = 2166136261; for (var i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function placeReal(token) {
    var r = rng((fnv(token) % 2147483000) + 1), x, y, k, ok;
    for (k = 0; k < 120; k++) { x = 14 + r() * (WW - 28); y = 14 + r() * (WH - 28); if (onLand(x, y)) continue; ok = true; for (var i = 0; i < realDots.length; i++) if (Math.hypot(realDots[i].x - x, realDots[i].y - y) < 9) { ok = false; break; } if (ok) return [x, y]; }
    return [x, y];
  }
  function loadReal() {
    if (realBusy || !window.VyreChain) { if (!window.VyreChain) { realInfo.err = true; renderFlow(); } return; }
    realBusy = true;
    window.VyreChain.load(300).then(function (r) {
      var by = {}; realDots.forEach(function (d) { by[d.token] = d; }); var fresh = 0, t = performance.now() / 1000;
      r.items.slice().reverse().forEach(function (it) {
        if (it.mc == null) return; var pct = Math.max(0, Math.min(100, it.mc / 50000 * 100)), d = by[it.token];
        if (d) { d.mc = it.mc; d.pct = pct; return; }
        var p = placeReal(it.token); d = { x: p[0], y: p[1], pct: pct, name: it.symbol, full: it.name, real: true, token: it.token, mc: it.mc, index: it.index, createdAt: it.createdAt, claimed: false, readyAt: 0, born: realDots.length ? t : -999 };
        realDots.push(d); dots.push(d); if (realDots.length > 1 && realInfo.total != null) { fresh++; say('g', '<b>' + esc(it.symbol) + '</b> launched on the REAL test chain'); }
      });
      realInfo.total = r.total; realInfo.err = false; realInfo.at = new Date().toISOString().slice(11, 19) + ' UTC'; realBusy = false; worldCounts(); renderFlow();
    }).catch(function () { realInfo.err = true; realBusy = false; renderFlow(); });
  }
  (function () { var b = document.getElementById('demoTog'); if (b) b.addEventListener('click', function () { showDemo = !showDemo; b.classList.toggle('on', showDemo); b.textContent = 'Demo crowd: ' + (showDemo ? 'on' : 'off'); worldCounts(); }); })();
  function bindWorld() {
    var cv = $('cWorld'), moved = 0, last;
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; moved = 0; last = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', function (e) {
      var rect = cv.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (drag) { var s = wScale(); cam.cx -= (e.clientX - last.x) / s; cam.cy -= (e.clientY - last.y) / s; moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; clampCam(); }
      else { var d = dotAt(sx, sy); hover = d ? { name: d.name, pct: d.pct, real: d.real, mc: d.mc, sx: sx, sy: sy } : null; }
    });
    cv.addEventListener('pointerup', function (e) {
      var rect = cv.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top; drag = null;
      if (moved < 5) { var d = dotAt(sx, sy), n = d ? null : nationAt(sx, sy); selWorld = d ? { dot: d } : (n ? { nation: n } : null); ctxWorld(); }
    });
    cv.addEventListener('pointerleave', function () { hover = null; });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    $('zIn').addEventListener('click', function () { zoomBy(1.5); });
    $('zOut').addEventListener('click', function () { zoomBy(1 / 1.5); });
    $('zReset').addEventListener('click', function () { cam = { cx: WW / 2, cy: WH / 2, z: 1 }; cv.style.touchAction = 'pan-y'; });
    cv.style.touchAction = 'pan-y';
    $('sPlay').addEventListener('click', function () { paused = !paused; $('sPlay').textContent = paused ? 'Play' : 'Pause'; });
    Array.prototype.forEach.call($('simbar').querySelectorAll('button[data-sp]'), function (b) { b.addEventListener('click', function () { speed = +b.getAttribute('data-sp'); Array.prototype.forEach.call($('simbar').querySelectorAll('button[data-sp]'), function (o) { o.classList.toggle('on', o === b); }); }); });
  }
  function zoomBy(f) { cam.z = Math.max(1, Math.min(9, cam.z * f)); clampCam(); $('cWorld').style.touchAction = cam.z > 1.05 ? 'none' : 'pan-y'; }

  /* ============================== LAND ============================== */
  var N = 9, LC, TW = 70, TH = 35, OX = 0, OY = 0;
  var BT = {
    house: { name: 'House', color: '#e0966a', cost: [2, 400], time: 8, desc: 'Homes for your workers. A bigger town gets more done.' },
    farm: { name: 'Farm', color: '#6e4d2d', cost: [3, 600], time: 10, desc: 'Grows food over time. Food trains soldiers.' },
    treasury: { name: 'Treasury', color: '#d9a93a', cost: [6, 1200], time: 16, desc: 'Makes gold over time. Gold trains soldiers.' },
    barracks: { name: 'Barracks', color: '#9a5f3e', cost: [8, 1500], time: 18, desc: 'Trains soldiers. Each one adds attack to the war score.' },
    wall: { name: 'Wall', color: '#9aa6b0', cost: [1, 200], time: 5, desc: 'Cheap defense for the war score.' },
    tower: { name: 'Tower', color: '#8294a6', cost: [5, 900], time: 14, desc: 'Strong defense. Its archers shoot in wars.' }
  };
  var blds = [
    { t: 'hall', i: 4, j: 4, lv: 1, st: 'done', flash: 0 }, { t: 'house', i: 2, j: 3, lv: 1, st: 'done', flash: 0 },
    { t: 'farm', i: 6, j: 5, lv: 1, st: 'done', flash: 0 }, { t: 'tower', i: 7, j: 2, lv: 1, st: 'done', flash: 0 }, { t: 'wall', i: 3, j: 7, lv: 1, st: 'done', flash: 0 }
  ];
  var trees = [[0, 0], [8, 0], [0, 8], [8, 8], [1, 0], [0, 1], [8, 1], [7, 8], [0, 7], [5, 0], [8, 6], [1, 8]];
  var workers = [], pick = null, hoverT = null, selB = null, trainAcc = 0, smoke = [];
  var wr = rng(77);
  for (var w = 0; w < 6; w++) workers.push({ x: 1 + wr() * 7, y: 1 + wr() * 7, tx: 4, ty: 4, wait: wr() * 2, ph: wr() * 6, hm: false, col: ['#e24d4d', '#4d8de2', '#e2c14d', '#7ad06a', '#c070e0', '#e08a3c'][w] });
  var tgr = rng(5), tufts = []; for (var ti = 0; ti < N; ti++) for (var tj = 0; tj < N; tj++) { var arr = []; for (var q = 0; q < 4; q++) arr.push({ u: 0.12 + tgr() * 0.76, v: 0.12 + tgr() * 0.76, f: tgr() < 0.15 }); tufts.push(arr); }
  function P(gx, gy) { return [OX + (gx - gy) * TW / 2, OY + (gx + gy) * TH / 2]; }
  function poly(ctx, pts, fill, stroke) { ctx.beginPath(); pts.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
  function lift(p, h) { return [p[0], p[1] - h]; }
  function box(ctx, i, j, fp, h, color, alpha, z) {
    var a = 0.5 - fp / 2, b = 0.5 + fp / 2, zz = z || 0, T = lift(P(i + a, j + a), zz), R = lift(P(i + b, j + a), zz), B = lift(P(i + b, j + b), zz), L = lift(P(i + a, j + b), zz);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    poly(ctx, [L, B, lift(B, h), lift(L, h)], shade(color, 0.86), 'rgba(0,0,0,.25)'); poly(ctx, [B, R, lift(R, h), lift(B, h)], shade(color, 0.66), 'rgba(0,0,0,.25)'); poly(ctx, [lift(T, h), lift(R, h), lift(B, h), lift(L, h)], color, 'rgba(0,0,0,.18)');
    ctx.globalAlpha = 1; return { T: lift(T, h), R: lift(R, h), B: lift(B, h), L: lift(L, h) };
  }
  function roof(ctx, tp, rh, color) { var cx = (tp.T[0] + tp.B[0]) / 2, cy = (tp.T[1] + tp.B[1]) / 2, apex = [cx, cy - rh]; poly(ctx, [tp.L, tp.B, apex], shade(color, 0.85), 'rgba(0,0,0,.25)'); poly(ctx, [tp.B, tp.R, apex], shade(color, 0.62), 'rgba(0,0,0,.25)'); }
  function drawTree(ctx, i, j, t) {
    var c = P(i + 0.5, j + 0.5), sw = Math.sin(t * 1.5 + i * 2 + j) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + 3, 14, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#5a3d24'; ctx.fillRect(c[0] - 2, c[1] - 12, 4, 14);
    ctx.fillStyle = '#2f7a46'; ctx.beginPath(); ctx.arc(c[0] + sw, c[1] - 22, 13, 0, 7); ctx.fill(); ctx.fillStyle = '#3c9358'; ctx.beginPath(); ctx.arc(c[0] - 4 + sw, c[1] - 26, 8, 0, 7); ctx.fill();
  }
  function drawBuilding(ctx, b, t) {
    var tp, c = P(b.i + 0.5, b.j + 0.5), bt = BT[b.t], alpha = b.st === 'building' ? 0.45 : 1, lv = b.lv, rc = ROOFS[S.style.roof];
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(c[0] + 6, c[1] + 4, TW * 0.34, TH * 0.34, 0, 0, 7); ctx.fill();
    if (b.t === 'hall') { tp = box(ctx, b.i, b.j, 0.86, 30, '#d9d2c4'); roof(ctx, tp, 22, rc); ctx.fillStyle = '#f6c453'; ctx.fillRect(c[0] - 1, c[1] - 66, 2, 20); poly(ctx, [[c[0] + 1, c[1] - 66], [c[0] + 15 + Math.sin(t * 4) * 2, c[1] - 61], [c[0] + 1, c[1] - 56]], S.style.banner); }
    else if (b.t === 'house') { tp = box(ctx, b.i, b.j, 0.6, 18 + lv * 3, bt.color, alpha); roof(ctx, tp, 14, rc); if (b.st === 'done') { var sm = [(tp.T[0] + tp.R[0]) / 2, (tp.T[1] + tp.R[1]) / 2]; for (var k = 0; k < 3; k++) { var ph = (t * 0.6 + k / 3 + b.i) % 1; ctx.fillStyle = 'rgba(220,220,230,' + (0.35 * (1 - ph)) + ')'; ctx.beginPath(); ctx.arc(sm[0] + Math.sin(ph * 5) * 3, sm[1] - 6 - ph * 22, 2 + ph * 4, 0, 7); ctx.fill(); } } }
    else if (b.t === 'farm') {
      var a = 0.06, T = P(b.i + a, b.j + a), R = P(b.i + 1 - a, b.j + a), B = P(b.i + 1 - a, b.j + 1 - a), L = P(b.i + a, b.j + 1 - a);
      ctx.globalAlpha = alpha; poly(ctx, [T, R, B, L], '#6e4d2d', 'rgba(0,0,0,.3)');
      for (var k2 = 0; k2 < 5; k2++) { var u = 0.18 + k2 * 0.16, p1 = P(b.i + 0.14, b.j + u), p2 = P(b.i + 0.86, b.j + u), grow = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.8 + k2)); ctx.strokeStyle = mixc('#5a7a35', '#8fd24a', grow); ctx.lineWidth = 2 + grow * 2; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    else if (b.t === 'treasury') { tp = box(ctx, b.i, b.j, 0.7, 24 + lv * 3, '#8a7a4a', alpha); var cc = [(tp.T[0] + tp.B[0]) / 2, (tp.T[1] + tp.B[1]) / 2]; ctx.globalAlpha = alpha; ctx.beginPath(); ctx.ellipse(cc[0], cc[1] - 4, 17, 11, 0, Math.PI, 0); ctx.fillStyle = '#e9bb44'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke(); ctx.globalAlpha = 1; if (b.st === 'done') { ctx.fillStyle = 'rgba(255,240,170,' + (0.4 + 0.4 * Math.sin(t * 5)) + ')'; ctx.fillRect(cc[0] + 5, cc[1] - 15 - (t * 12 % 8), 3, 3); } }
    else if (b.t === 'barracks') { tp = box(ctx, b.i, b.j, 0.9, 18 + lv * 2, bt.color, alpha); roof(ctx, tp, 9, shade(rc, 0.8)); var f0 = [(tp.T[0] + tp.R[0]) / 2, (tp.T[1] + tp.R[1]) / 2]; ctx.fillStyle = '#ddd'; ctx.fillRect(f0[0], f0[1] - 24, 2, 24); poly(ctx, [[f0[0] + 2, f0[1] - 24], [f0[0] + 14 + Math.sin(t * 5) * 2, f0[1] - 20], [f0[0] + 2, f0[1] - 15]], S.style.banner); }
    else if (b.t === 'wall') { box(ctx, b.i, b.j, 0.9, 8 + lv * 3, bt.color, alpha); }
    else if (b.t === 'tower') { var th = 40 + lv * 5; box(ctx, b.i, b.j, 0.46, th, bt.color, alpha); box(ctx, b.i, b.j, 0.64, 7, shade(bt.color, 1.1), alpha, th); }
    var top = P(b.i + 0.5, b.j + 0.5);
    if (b.st === 'building') {
      var h = 36; ctx.strokeStyle = 'rgba(246,196,83,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); var q1 = P(b.i + 0.1, b.j + 0.1), q2 = P(b.i + 0.9, b.j + 0.9); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q1[0], q1[1] - h); ctx.moveTo(q2[0], q2[1]); ctx.lineTo(q2[0], q2[1] - h); ctx.moveTo(q1[0], q1[1] - h); ctx.lineTo(q2[0], q2[1] - h); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(top[0] - 20, top[1] - 62, 40, 6); ctx.fillStyle = '#f6c453'; ctx.fillRect(top[0] - 20, top[1] - 62, 40 * b.prog, 6);
    } else if (b.t !== 'hall' && b.t !== 'farm' && b.t !== 'wall') {
      for (var l = 0; l < lv; l++) { ctx.beginPath(); ctx.arc(top[0] - (lv - 1) * 4 + l * 8, top[1] - (b.t === 'tower' ? 66 : 44), 2.6, 0, 7); ctx.fillStyle = '#f6c453'; ctx.fill(); }
    }
    if (b.flash > 0) poly(ctx, [P(b.i, b.j), P(b.i + 1, b.j), P(b.i + 1, b.j + 1), P(b.i, b.j + 1)], null, 'rgba(255,255,255,' + b.flash + ')');
  }
  function drawPerson(ctx, x, y, col, t, hammer) {
    var p = P(x, y), sw = Math.sin(t * 10) * 3;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 5, 2.4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0] - 1.5, p[1] - 5); ctx.lineTo(p[0] - 1.5 + sw * 0.4, p[1]); ctx.moveTo(p[0] + 1.5, p[1] - 5); ctx.lineTo(p[0] + 1.5 - sw * 0.4, p[1]); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(p[0] - 3, p[1] - 12, 6, 8); ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(p[0], p[1] - 15, 3, 0, 7); ctx.fill(); ctx.fillStyle = shade(col, 0.6); ctx.fillRect(p[0] - 3.5, p[1] - 18.5, 7, 2);
    if (hammer) { var h = Math.sin(t * 12); ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0] + 3, p[1] - 9); ctx.lineTo(p[0] + 8, p[1] - 14 + h * 5); ctx.stroke(); }
  }
  function sizeLand() { var h = Math.max(340, Math.min(520, Math.round(LC.w * 0.66))); LC = fit($('cLand'), h); TW = Math.floor(Math.min(80, (LC.w - 24) / N)); TH = TW / 2; OX = LC.w / 2; OY = (LC.h - N * TH) / 2 + 30; }
  function drawLand(t) {
    var ctx = LC.ctx; ctx.setTransform(LC.dpr, 0, 0, LC.dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, LC.h); g.addColorStop(0, '#20456a'); g.addColorStop(0.55, '#e8a76a'); g.addColorStop(0.56, '#133248'); g.addColorStop(1, '#0a1a28'); ctx.fillStyle = g; ctx.fillRect(0, 0, LC.w, LC.h);
    if (ART.land) { ctx.globalAlpha = 0.85; ctx.drawImage(ART.land, 0, 0, LC.w, LC.h); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.1)'; for (var cl = 0; cl < 3; cl++) { var cxx = ((t * 6 + cl * 260) % (LC.w + 200)) - 100, cyy = 40 + cl * 30; ctx.beginPath(); ctx.ellipse(cxx, cyy, 70, 12, 0, 0, 7); ctx.ellipse(cxx + 36, cyy - 8, 40, 10, 0, 0, 7); ctx.fill(); }
    var L = P(0, N), B = P(N, N), R = P(N, 0); var dep = 26;
    poly(ctx, [L, B, lift(B, -dep), lift(L, -dep)], '#6b4a2e', 'rgba(0,0,0,.4)'); poly(ctx, [B, R, lift(R, -dep), lift(B, -dep)], '#503821', 'rgba(0,0,0,.4)');
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var path = (i === 4 && j >= 4) || (j === 4 && i >= 4) || (i === 4 && j === 3) ;
      poly(ctx, [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], path ? '#a08a5a' : ((i + j) % 2 ? '#3f8a58' : '#459963'), 'rgba(0,0,0,.14)');
      if (!path) tufts[i * N + j].forEach(function (u) { var p = P(i + u.u, j + u.v); if (u.f) { ctx.fillStyle = '#ffe27a'; ctx.fillRect(p[0], p[1] - 2, 2, 2); ctx.fillStyle = '#ff9bb0'; ctx.fillRect(p[0] + 3, p[1], 2, 2); } else { ctx.strokeStyle = 'rgba(20,70,40,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] - 1, p[1] - 4); ctx.moveTo(p[0] + 2, p[1]); ctx.lineTo(p[0] + 3, p[1] - 3); ctx.stroke(); } });
    }
    if (hoverT && hoverT.i >= 0 && hoverT.i < N && hoverT.j >= 0 && hoverT.j < N) {
      var occ = blds.some(function (b) { return b.i === hoverT.i && b.j === hoverT.j; }) || isTree(hoverT.i, hoverT.j);
      poly(ctx, [P(hoverT.i, hoverT.j), P(hoverT.i + 1, hoverT.j), P(hoverT.i + 1, hoverT.j + 1), P(hoverT.i, hoverT.j + 1)], pick ? (occ ? 'rgba(255,90,54,.4)' : 'rgba(246,196,83,.45)') : 'rgba(255,255,255,.18)', '#fff');
    }
    if (selB) poly(ctx, [P(selB.i, selB.j), P(selB.i + 1, selB.j), P(selB.i + 1, selB.j + 1), P(selB.i, selB.j + 1)], null, '#f6c453');
    var items = [];
    trees.forEach(function (tr) { items.push({ d: tr[0] + tr[1] + 1, fn: function () { drawTree(ctx, tr[0], tr[1], t); } }); });
    blds.forEach(function (b) { items.push({ d: b.i + b.j + 1, fn: function () { drawBuilding(ctx, b, t); } }); });
    workers.forEach(function (wk) { items.push({ d: wk.x + wk.y, fn: function () { drawPerson(ctx, wk.x, wk.y, wk.col, wk.ph, wk.hm); } }); });
    var bar = blds.filter(function (b) { return b.t === 'barracks' && b.st === 'done'; })[0];
    if (bar) for (var s = 0; s < Math.min(S.soldiers, 12); s++) { (function (s) { var gx = bar.i + 1.25 + (s % 4) * 0.2, gy = bar.j + 0.3 + Math.floor(s / 4) * 0.22; items.push({ d: gx + gy, fn: function () { drawPerson(ctx, gx, gy + Math.sin(t * 3 + s) * 0.02, '#3b6bd6', t * 0.4 + s, false); var p = P(gx, gy); ctx.fillStyle = '#d0d6dd'; ctx.fillRect(p[0] + 3, p[1] - 20, 1.6, 14); } }); })(s); }
    items.sort(function (a, b) { return a.d - b.d; }).forEach(function (it) { it.fn(); });
  }
  function isTree(i, j) { return trees.some(function (t) { return t[0] === i && t[1] === j; }); }
  function scores() {
    var def = 5, atk = S.soldiers * 3;
    blds.forEach(function (b) { if (b.st !== 'done') return; if (b.t === 'tower') def += 12 * b.lv; if (b.t === 'wall') def += 4 * b.lv; if (b.t === 'barracks') def += 2 * b.lv; });
    return { def: def, atk: atk, bonus: Math.min(12, (def + atk) / 10) };
  }
  function updLand(dt) {
    var sites = blds.filter(function (b) { return b.st === 'building'; });
    sites.forEach(function (b) { b.prog += dt / (BT[b.t].time * (b.upg ? 0.6 : 1)); if (b.prog >= 1) { b.st = 'done'; b.lv = b.to || 1; b.upg = false; b.flash = 1; toast(BT[b.t].name + ' ready'); say('', 'You finished a <b>' + BT[b.t].name + '</b>'); if (view === 'land') refreshCtxLand(); } });
    blds.forEach(function (b) { if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 1.2); });
    workers.forEach(function (wk, k) {
      var tgt = sites.length ? sites[k % sites.length] : null;
      if (tgt) { wk.tx = tgt.i + 0.5; wk.ty = tgt.j + 1.15; }
      else if (wk.wait <= 0) { wk.tx = 0.5 + Math.random() * 8; wk.ty = 0.5 + Math.random() * 8; wk.wait = 1 + Math.random() * 3; }
      var dx = wk.tx - wk.x, dy = wk.ty - wk.y, dist = Math.hypot(dx, dy);
      if (dist > 0.1) { wk.x += dx / dist * dt * 1.1; wk.y += dy / dist * dt * 1.1; wk.ph += dt; wk.hm = false; }
      else { wk.hm = !!tgt; wk.ph += dt * (tgt ? 1 : 0.1); if (!tgt) wk.wait -= dt; }
    });
    var farms = 0, trs = 0; blds.forEach(function (b) { if (b.st !== 'done') return; if (b.t === 'farm') farms += b.lv; if (b.t === 'treasury') trs += b.lv; });
    S.food += farms * 1.6 * dt; S.gold += trs * 1.1 * dt;
    if (S.queue > 0) { trainAcc += dt; if (trainAcc >= 3) { trainAcc = 0; S.queue--; S.soldiers++; if (view === 'land') refreshCtxLand(); } } else trainAcc = 0;
  }
  var hudT = 0;
  function hud() {
    var sc = scores(), ws = blds.filter(function (b) { return b.t === 'house' && b.st === 'done'; }).length + 3;
    $('hud').innerHTML = '<span>Food <b>' + fmt(S.food) + '</b></span><span>Gold <b>' + fmt(S.gold) + '</b></span><span>Soldiers <b>' + S.soldiers + (S.queue ? '+' + S.queue : '') + '</b></span><span>Defense <b>' + sc.def + '</b></span><span>Attack <b>' + sc.atk + '</b></span><span>War bonus <b>+' + sc.bonus.toFixed(1) + '%</b></span><span>Workers <b>' + Math.min(ws, workers.length) + '</b></span>';
  }
  function buildMenu() {
    var m = $('menu'); m.innerHTML = '';
    Object.keys(BT).forEach(function (k) {
      var b = BT[k], el = document.createElement('button'); el.setAttribute('data-k', k);
      el.innerHTML = '<span><i class="sw" style="background:' + b.color + '"></i>' + b.name + '</span><small>$' + b.cost[0] + ' + ' + fmt(b.cost[1]) + ' coin · ' + b.time + 's</small>';
      el.addEventListener('click', function () { pick = pick === k ? null : k; selB = null; markMenu(); refreshCtxLand(); });
      m.appendChild(el);
    });
    drawRoofOpts();
  }
  function markMenu() { Array.prototype.forEach.call($('menu').children, function (el) { el.classList.toggle('on', el.getAttribute('data-k') === pick); }); }
  function drawRoofOpts() {
    var o = $('roofOpts'); o.innerHTML = '<span class="muted" style="align-self:center;font-size:13px">Roofs and banner (cosmetic):</span>';
    [['red', 'Red', 0], ['blue', 'Blue', 0], ['gold', 'Gold', 2]].forEach(function (r) {
      var own = S.owned['roof:' + r[0]], b = document.createElement('button'); b.className = S.style.roof === r[0] ? 'on' : ''; b.innerHTML = '<i class="sw2" style="background:' + ROOFS[r[0]] + '"></i> ' + r[1] + (own ? '' : '<small>$' + r[2] + '</small>');
      b.addEventListener('click', function () { if (!own) { if (!pay(r[2], 0, 'style')) return; S.owned['roof:' + r[0]] = 1; say('y', 'You bought <b>Gold roofs</b> · $' + r[2]); } S.style.roof = r[0]; drawRoofOpts(); }); o.appendChild(b);
    });
  }
  function refreshCtxLand() {
    var el = $('ctx');
    if (pick) { var pb = BT[pick]; el.innerHTML = '<h3>Placing</h3><h2>' + pb.name + '</h2><p>' + pb.desc + '</p><div class="stats"><div><span>You pay</span><b>$' + pb.cost[0] + '</b></div><div><span>And</span><b>' + fmt(pb.cost[1]) + ' coin</b></div></div><p class="muted">Tap an empty green tile. Workers walk over and build it. Tap the same button again to cancel.</p>'; return; }
    if (selB) {
      var bt = selB.t === 'hall' ? { name: 'Town Hall', desc: 'The heart of your land. Fixed.', cost: [0, 0] } : BT[selB.t], sc = scores();
      var canUp = selB.t !== 'hall' && selB.t !== 'farm' && selB.st === 'done' && selB.lv < 3, uc = [bt.cost[0] * selB.lv * 0.8, bt.cost[1] * selB.lv * 0.8];
      el.innerHTML = '<h3>Building</h3><h2>' + bt.name + ' · level ' + selB.lv + '</h2><p>' + bt.desc + '</p>' + (selB.st === 'building' ? '<p class="muted">Under construction: ' + Math.round(selB.prog * 100) + '%</p>' : '') +
        '<div class="row2">' + (canUp ? '<button class="gold" id="upg">Upgrade to level ' + (selB.lv + 1) + ': $' + uc[0].toFixed(1) + ' + ' + fmt(uc[1]) + '</button>' : '') + (selB.t === 'barracks' && selB.st === 'done' ? '<button class="go" id="train">Train a soldier: 30 food, 15 gold</button>' : '') + '</div>' +
        '<div class="stats"><div><span>Defense</span><b>' + sc.def + '</b></div><div><span>Attack</span><b>' + sc.atk + '</b></div></div>';
      var u = $('upg'); if (u) u.addEventListener('click', function () { if (pay(uc[0], uc[1], 'land')) { selB.st = 'building'; selB.prog = 0; selB.to = selB.lv + 1; selB.upg = true; toast('Upgrade started'); refreshCtxLand(); } });
      var tr = $('train'); if (tr) tr.addEventListener('click', function () { if (S.food < 30 || S.gold < 15) { toast('Need 30 food and 15 gold. Farms make food, treasuries make gold.'); return; } S.food -= 30; S.gold -= 15; S.queue++; toast('Soldier training'); refreshCtxLand(); });
      return;
    }
    var s2 = scores();
    el.innerHTML = '<h3>Your land in SPUDS</h3><h2>Build it up</h2><p>Pick a building below, then tap an empty tile. Tap a building to upgrade it, or to train soldiers at the barracks.</p><div class="stats"><div><span>Defense</span><b>' + s2.def + '</b></div><div><span>Attack</span><b>' + s2.atk + '</b></div><div><span>War bonus</span><b>+' + s2.bonus.toFixed(1) + '%</b></div><div><span>Chest bonus</span><b>+' + chestBonus().toFixed(2) + '%</b></div></div><p class="muted">Farms and treasuries make game points (food, gold). They are not money and cannot be withdrawn.</p>';
  }
  function tileAt(e) { var rect = $('cLand').getBoundingClientRect(), sx = e.clientX - rect.left - OX, sy = e.clientY - rect.top - OY, dx = sx / (TW / 2), dy = sy / (TH / 2); return { i: Math.floor((dy + dx) / 2), j: Math.floor((dy - dx) / 2) }; }
  function bindLand() {
    var cv = $('cLand');
    cv.addEventListener('pointermove', function (e) { hoverT = tileAt(e); });
    cv.addEventListener('pointerleave', function () { hoverT = null; });
    cv.addEventListener('click', function (e) {
      var t = tileAt(e); if (t.i < 0 || t.j < 0 || t.i >= N || t.j >= N) return;
      var b = blds.filter(function (x) { return x.i === t.i && x.j === t.j; })[0];
      if (pick) {
        if (b || isTree(t.i, t.j)) { toast('That tile is taken.'); return; }
        var c = BT[pick].cost; if (!pay(c[0], c[1], 'land')) return;
        blds.push({ t: pick, i: t.i, j: t.j, lv: 1, st: 'building', prog: 0, flash: 0 }); toast(BT[pick].name + ' started: workers are on the way'); say('', 'You started a <b>' + BT[pick].name + '</b>'); return;
      }
      selB = b || null; refreshCtxLand();
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { pick = null; selB = null; markMenu(); if (view === 'land') refreshCtxLand(); } });
  }

  /* ============================== WAR ============================== */
  var WC, war = { on: false, done: false, vol: 0, sa: 50, sd: 50, t: 0 }, units = [], bodies = [], splats = [], parts = [], shots = [], shake = 0, hpL = 100, hpR = 100, warIv = null, fireA = 3, fireB = 3, wave = 0, cryT = 0;
  function sizeWar() { var w = WC.w; WC = fit($('cWar'), Math.max(300, Math.min(460, Math.round(w * 0.56)))); }
  function groundY() { return WC.h * 0.74; }
  function spawnUnit(side, kind, x) {
    units.push({ side: side, kind: kind || 'sword', x: x != null ? x : (side ? WC.w - 118 : 118), y: Math.random(), hp: 1, ph: Math.random() * 6, cd: Math.random() * 1.2, dead: false, jump: 0 });
  }
  function resetWar() {
    units = []; bodies = []; splats = []; parts = []; shots = []; hpL = hpR = 100; wave = 0;
    var nL = 12 + Math.min(S.soldiers, 10), nR = 14;
    for (var i = 0; i < nL; i++) spawnUnit(0, i % 5 === 0 ? 'archer' : 'sword'); for (var k = 0; k < nR; k++) spawnUnit(1, k % 5 === 0 ? 'archer' : 'sword');
  }
  function bloodAt(x, y, n, big) {
    for (var i = 0; i < n; i++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * (big ? 170 : 110), vy: -40 - Math.random() * (big ? 150 : 90), life: 0.7 + Math.random() * 0.6, col: S.style.blood ? (Math.random() < 0.7 ? '#b01313' : '#7a0b0b') : '#cfd6dd', r: 1.4 + Math.random() * 1.8, g: true });
    if (S.style.blood) splats.push({ x: x + (Math.random() - 0.5) * 16, y: y + Math.random() * 10, r: 5 + Math.random() * (big ? 14 : 8), a: 0.75, t: 0 });
  }
  function killUnit(u, big) {
    if (u.dead) return; u.dead = true; var y = groundY() + 8 + u.y * WC.h * 0.17; bloodAt(u.x, y - 10, big ? 16 : 9, big);
    bodies.push({ x: u.x, y: y, side: u.side, kind: u.kind, t: 0, flip: Math.random() < 0.5 ? 1 : -1 });
  }
  function explode(x, y, r) {
    shake = Math.min(10, shake + 6); for (var i = 0; i < 26; i++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 230, vy: -Math.random() * 190, life: 0.6 + Math.random() * 0.7, col: Math.random() < 0.5 ? '#ff9a2e' : (Math.random() < 0.5 ? '#ffd84a' : '#5a5048'), r: 2 + Math.random() * 4, g: true });
    units.forEach(function (u) { if (!u.dead && Math.hypot(u.x - x, groundY() + u.y * WC.h * 0.17 - y) < r) killUnit(u, true); });
  }
  function drawFigure(ctx, x, y, side, kind, ph, skin, banner, scale, fallen, flip) {
    var c = side ? '#ffc145' : banner, sw = Math.sin(ph) * 3, u = scale;
    ctx.save(); ctx.translate(x, y); ctx.scale(u * (side ? -1 : 1) * (flip || 1), u);
    if (fallen) { ctx.rotate(Math.PI / 2.2); ctx.translate(-4, 8); ctx.globalAlpha = fallen; }
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, 1, 7, 2.6, 0, 0, 7); ctx.fill();
    var sk = side ? 'orc' : skin;
    ctx.strokeStyle = sk === 'skeleton' ? '#e8e6dc' : '#2a2a2a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2 + sw * 0.5, 0); ctx.moveTo(2, -6); ctx.lineTo(2 - sw * 0.5, 0); ctx.stroke();
    if (sk === 'robot') { ctx.fillStyle = '#9aa7b6'; ctx.fillRect(-4.5, -14, 9, 9); ctx.fillStyle = c; ctx.fillRect(-4.5, -11, 9, 3); ctx.fillStyle = '#c8d2dc'; ctx.fillRect(-4, -21, 8, 7); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-2.6, -18.5, 5.2, 1.8); ctx.fillStyle = '#9aa7b6'; ctx.fillRect(-0.6, -25, 1.2, 4); }
    else if (sk === 'skeleton') { ctx.fillStyle = '#d8d6ca'; ctx.fillRect(-3.5, -14, 7, 8); ctx.fillStyle = '#2a2a2a'; for (var rr2 = 0; rr2 < 3; rr2++) ctx.fillRect(-3, -13 + rr2 * 2.5, 6, 0.8); ctx.fillStyle = '#efede2'; ctx.beginPath(); ctx.arc(0, -18, 4.4, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-2.6, -19.2, 1.8, 2); ctx.fillRect(0.8, -19.2, 1.8, 2); ctx.fillRect(-1.4, -15.8, 2.8, 1); ctx.fillStyle = c; ctx.fillRect(-4.5, -15, 9, 2); }
    else if (sk === 'frogs') { ctx.fillStyle = '#4fb34a'; ctx.fillRect(-4, -13, 8, 8); ctx.fillStyle = c; ctx.fillRect(-4, -10, 8, 3); ctx.fillStyle = '#5fcb58'; ctx.beginPath(); ctx.ellipse(0, -17, 5.6, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3, -21, 2.3, 0, 7); ctx.arc(3, -21, 2.3, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-3, -21, 1.1, 0, 7); ctx.arc(3, -21, 1.1, 0, 7); ctx.fill(); ctx.strokeStyle = '#2f7a2c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -17, 3, 0.1, Math.PI - 0.1); ctx.stroke(); }
    else if (sk === 'orc') { ctx.fillStyle = shade(c, 0.7); ctx.fillRect(-4.5, -14, 9, 9); ctx.fillStyle = '#6aa05a'; ctx.beginPath(); ctx.arc(0, -18, 4.6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-3, -15.3, 1.3, 2.2); ctx.fillRect(1.7, -15.3, 1.3, 2.2); ctx.fillStyle = '#c0392b'; ctx.fillRect(-2.6, -19.6, 1.6, 1.6); ctx.fillRect(1, -19.6, 1.6, 1.6); ctx.fillStyle = '#4b3a2a'; ctx.fillRect(-5, -23, 10, 2.4); }
    else { ctx.fillStyle = c; ctx.fillRect(-4, -14, 8, 9); ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(0, -18, 3.6, 0, 7); ctx.fill(); ctx.fillStyle = '#8a95a3'; ctx.beginPath(); ctx.arc(0, -19, 4.4, Math.PI, 0); ctx.fill(); ctx.fillRect(-4.4, -19, 8.8, 1.6); ctx.fillStyle = '#c8cfd8'; ctx.beginPath(); ctx.moveTo(-6.4, -12); ctx.lineTo(-1.6, -12); ctx.lineTo(-1.6, -5.5); ctx.lineTo(-4, -2.8); ctx.lineTo(-6.4, -5.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(-5.4, -10.4, 2.6, 2.6); }
    if (kind === 'archer') { ctx.strokeStyle = '#7a4f2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(6, -10, 7, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(6 + Math.cos(-1.2) * 7, -10 + Math.sin(-1.2) * 7); ctx.lineTo(6 + Math.cos(1.2) * 7, -10 + Math.sin(1.2) * 7); ctx.stroke(); }
    else { ctx.strokeStyle = sk === 'skeleton' ? '#efede2' : (sk === 'robot' ? '#7ff0ff' : '#e5e9ee'); ctx.lineWidth = sk === 'orc' ? 2.6 : 1.8; ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(10 + Math.sin(ph * 1.3) * 3, -18 + Math.cos(ph) * 3); ctx.stroke(); }
    ctx.restore();
  }
  function drawCastle(ctx, x, side, color, style, hp, t) {
    var gy = groundY(), W = 84, H = 108, dir = side ? -1 : 1, sc = style === 'wood' ? '#8a5a34' : (style === 'neon' ? '#1b2640' : '#8b94a3'), sd = style === 'wood' ? '#6d4426' : (style === 'neon' ? '#121a2e' : '#6c7584');
    ctx.save(); ctx.translate(x, gy);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 4, W * 0.7, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = sc; ctx.fillRect(-W / 2, -H, W, H); ctx.fillStyle = sd; ctx.fillRect(-W / 2, -H, 12, H); ctx.fillRect(W / 2 - 10, -H, 10, H);
    ctx.fillStyle = style === 'neon' ? color : sd; for (var k = 0; k < 6; k++) ctx.fillRect(-W / 2 + k * 15, -H - 11, 10, 11);
    if (style === 'stone') { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; for (var rw = 1; rw < 7; rw++) { ctx.beginPath(); ctx.moveTo(-W / 2, -rw * 15); ctx.lineTo(W / 2, -rw * 15); ctx.stroke(); } }
    if (style === 'wood') { ctx.strokeStyle = 'rgba(0,0,0,.25)'; for (var pl = 0; pl < 9; pl++) { ctx.beginPath(); ctx.moveTo(-W / 2 + pl * 10, -H); ctx.lineTo(-W / 2 + pl * 10, 0); ctx.stroke(); } }
    if (style === 'neon') { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.strokeRect(-W / 2 + 2, -H + 2, W - 4, H - 4); ctx.shadowBlur = 0; ctx.fillStyle = color; ctx.fillRect(-9, -40, 18, 40); }
    else { ctx.fillStyle = '#1a232e'; ctx.fillRect(-10, -38, 20, 38); ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-10, -38, 10, 38); }
    ctx.fillStyle = '#0f1822'; ctx.fillRect(-22, -78, 8, 14); ctx.fillRect(14, -78, 8, 14);
    var tx = dir * 62; ctx.fillStyle = sd; ctx.fillRect(tx - 11, -140, 22, 140); ctx.fillStyle = sc; ctx.fillRect(tx - 11, -140, 8, 140); for (var q = 0; q < 3; q++) ctx.fillRect(tx - 11 + q * 8, -149, 6, 9);
    ctx.fillStyle = '#ddd'; ctx.fillRect(-1, -H - 44, 2, 34); ctx.beginPath(); ctx.moveTo(1, -H - 44); ctx.lineTo(1 + dir * 26 + Math.sin(t * 4) * 3, -H - 36); ctx.lineTo(1, -H - 26); ctx.fillStyle = color; ctx.fill();
    if (hp < 75) { ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-20, -90); ctx.lineTo(-8, -66); ctx.lineTo(-18, -50); ctx.moveTo(18, -100); ctx.lineTo(8, -70); ctx.lineTo(20, -56); ctx.stroke(); }
    if (hp < 55) { for (var f = 0; f < 5; f++) { var fx = -30 + f * 15, ph = t * 7 + f * 1.7, fh = 12 + Math.sin(ph) * 5 + (55 - hp) * 0.35; ctx.fillStyle = 'rgba(255,120,30,.85)'; ctx.beginPath(); ctx.moveTo(fx - 5, -H); ctx.quadraticCurveTo(fx, -H - fh, fx + 5, -H); ctx.fill(); ctx.fillStyle = 'rgba(255,220,90,.9)'; ctx.beginPath(); ctx.moveTo(fx - 2.5, -H); ctx.quadraticCurveTo(fx, -H - fh * 0.55, fx + 2.5, -H); ctx.fill(); } ctx.fillStyle = 'rgba(40,40,46,.35)'; for (var sm = 0; sm < 4; sm++) { var sp = (t * 0.5 + sm / 4) % 1; ctx.beginPath(); ctx.arc(-20 + sm * 14 + Math.sin(sp * 6) * 6, -H - 20 - sp * 70, 6 + sp * 12, 0, 7); ctx.fill(); } }
    ctx.restore();
    var bw = 90, bx = x - bw / 2, by = gy - 178; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx, by, bw, 8); ctx.fillStyle = hp > 55 ? '#46d39a' : (hp > 30 ? '#f6c453' : '#ff5a36'); ctx.fillRect(bx, by, bw * hp / 100, 8);
  }
  function drawWar(t, dt) {
    var ctx = WC.ctx; ctx.setTransform(WC.dpr, 0, 0, WC.dpr, 0, 0); var gy = groundY();
    var sx = shake > 0.1 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.1 ? (Math.random() - 0.5) * shake : 0; shake *= 0.9; ctx.translate(sx, sy);
    var g = ctx.createLinearGradient(0, 0, 0, gy); g.addColorStop(0, '#1a1f3c'); g.addColorStop(0.5, '#6b3a4a'); g.addColorStop(1, '#e08a4c'); ctx.fillStyle = g; ctx.fillRect(-10, -10, WC.w + 20, gy + 10);
    if (ART.war) { ctx.globalAlpha = 0.92; ctx.drawImage(ART.war, 0, 0, WC.w, WC.h); ctx.globalAlpha = 1; }
    else {
      ctx.fillStyle = 'rgba(255,214,140,.9)'; ctx.beginPath(); ctx.arc(WC.w * 0.5, gy - 26, 52, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,214,140,.22)'; ctx.beginPath(); ctx.arc(WC.w * 0.5, gy - 26, 96, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(25,18,30,.8)'; ctx.beginPath(); ctx.moveTo(0, gy); for (var mx = 0; mx <= WC.w; mx += 30) ctx.lineTo(mx, gy - 38 - 40 * Math.abs(Math.sin(mx * 0.017 + 1))); ctx.lineTo(WC.w, gy); ctx.fill();
      ctx.fillStyle = 'rgba(14,10,20,.9)'; ctx.beginPath(); ctx.moveTo(0, gy); for (var mx2 = 0; mx2 <= WC.w; mx2 += 24) ctx.lineTo(mx2, gy - 14 - 22 * Math.abs(Math.sin(mx2 * 0.03 + 3))); ctx.lineTo(WC.w, gy); ctx.fill();
      for (var sm = 0; sm < 3; sm++) { var cxx = WC.w * (0.2 + sm * 0.3), sp = (t * 0.05 + sm / 3) % 1; ctx.fillStyle = 'rgba(40,36,44,.35)'; for (var s2 = 0; s2 < 6; s2++) { ctx.beginPath(); ctx.arc(cxx + Math.sin(s2 + t * 0.4) * 12, gy - 30 - s2 * 22, 14 + s2 * 4, 0, 7); ctx.fill(); } }
    }
    var gg = ctx.createLinearGradient(0, gy, 0, WC.h); gg.addColorStop(0, '#46503a'); gg.addColorStop(1, '#2a3224'); ctx.fillStyle = gg; ctx.fillRect(-10, gy, WC.w + 20, WC.h - gy + 10);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; for (var gl = 0; gl < 12; gl++) { ctx.beginPath(); ctx.moveTo(((gl * 97) % WC.w), gy + 6 + (gl % 4) * 18); ctx.lineTo(((gl * 97) % WC.w) + 40, gy + 6 + (gl % 4) * 18); ctx.stroke(); }
    splats.forEach(function (sp) { sp.t += dt; var a = sp.a * Math.max(0, 1 - sp.t / 40); ctx.fillStyle = 'rgba(120,12,12,' + a + ')'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.45, 0, 0, 7); ctx.fill(); });
    splats = splats.filter(function (sp) { return sp.t < 40; });
    var share = war.sa / (war.sa + war.sd), front = WC.w * (0.24 + 0.52 * share);
    hpL = Math.max(14, Math.min(100, 100 - Math.max(0, 0.5 - share) * 280 - war.t * 4)); hpR = Math.max(14, Math.min(100, 100 - Math.max(0, share - 0.5) * 280 - war.t * 4));
    var banner = S.style.banner, towersA = blds.filter(function (b) { return b.t === 'tower' && b.st === 'done'; }).length;
    drawCastle(ctx, 62, 0, banner, S.style.castle, war.on || war.done ? hpL : 100, t); drawCastle(ctx, WC.w - 62, 1, '#ffc145', 'stone', war.on || war.done ? hpR : 100, t);
    if (war.on) {
      war.t += dt / 20 * 1; cryT -= dt;
      if (Math.random() < dt * (2.4 + towersA * 1.6)) shots.push({ k: 'arrow', x: 112, y: gy - 120, tx: front + 30 + Math.random() * 50, p: 0, side: 0 });
      if (Math.random() < dt * 2.6) shots.push({ k: 'arrow', x: WC.w - 112, y: gy - 120, tx: front - 30 - Math.random() * 50, p: 0, side: 1 });
      if (Math.random() < dt * 0.42) shots.push({ k: 'ball', x: 104, y: gy - 150, tx: front + 70, p: 0, side: 0 });
      if (Math.random() < dt * 0.4) shots.push({ k: 'ball', x: WC.w - 104, y: gy - 150, tx: front - 70, p: 0, side: 1 });
      wave -= dt; if (wave <= 0) { wave = 1.5; var lAlive = units.filter(function (u) { return !u.dead && !u.side; }).length, rAlive = units.filter(function (u) { return !u.dead && u.side; }).length; if (lAlive < 30 && Math.random() < 0.4 + share * 0.5) spawnUnit(0, Math.random() < 0.2 ? 'archer' : 'sword'); if (rAlive < 30 && Math.random() < 1.1 - share * 0.5) spawnUnit(1, Math.random() < 0.2 ? 'archer' : 'sword'); }
    }
    shots = shots.filter(function (s) {
      s.p += dt * (s.k === 'ball' ? 0.8 : 1.5);
      var x = s.x + (s.tx - s.x) * s.p, y = s.y + (gy + 20 - s.y) * s.p - Math.sin(s.p * Math.PI) * (s.k === 'ball' ? 120 : 70);
      if (s.k === 'arrow') { ctx.strokeStyle = '#f3f3f3'; ctx.lineWidth = 1.4; var dx = s.tx > s.x ? 1 : -1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 8, y - 3); ctx.stroke(); }
      else { ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,214,90,.8)'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 20, vy: -10, life: 0.4, col: 'rgba(255,150,60,.8)', r: 2, g: false }); }
      if (s.p >= 1) { if (s.k === 'ball') explode(x, gy + 10, 46); else { var near = units.filter(function (u) { return !u.dead && u.side !== s.side && Math.abs(u.x - x) < 14; })[0]; if (near && Math.random() < 0.5) killUnit(near, false); else if (!near) { ctx.strokeStyle = '#ddd'; } } return false; }
      return true;
    });
    var order = units.slice().sort(function (a, b) { return a.y - b.y; });
    bodies.forEach(function (b) { b.t += dt; if (b.t < 24) { var a = Math.max(0, 1 - b.t / 24); drawFigure(ctx, b.x, b.y, b.side, b.kind, 0, S.style.skin, banner, 1.5, a * 0.9, b.flip); } });
    bodies = bodies.filter(function (b) { return b.t < 24; });
    order.forEach(function (u) {
      if (u.dead) return; var y = gy + 8 + u.y * WC.h * 0.17, dir = u.side ? -1 : 1, tgt, spread = (u.y - 0.5) * 36;
      if (!war.on && !war.done) tgt = u.side ? WC.w - 130 - u.y * 24 : 130 + u.y * 24;
      else if (u.kind === 'archer') tgt = u.side ? Math.min(WC.w - 140, front + 120 + spread) : Math.max(140, front - 120 - spread);
      else tgt = u.side ? front + 18 + spread * 0.5 : front - 18 - spread * 0.5;
      var mv = (war.on ? 46 : 22) * (0.6 + u.y * 0.5), dx2 = tgt - u.x; u.x += Math.max(-mv * dt, Math.min(mv * dt, dx2)); u.ph += dt * (Math.abs(dx2) > 4 ? 9 : (war.on ? 6 : 1.4));
      if (war.on) { u.cd -= dt; if (u.cd <= 0 && u.kind !== 'archer') { var foe = units.filter(function (e) { return !e.dead && e.side !== u.side && Math.abs(e.x - u.x) < 22; })[0]; if (foe) { u.cd = 0.55 + Math.random() * 0.8; var pw = u.side ? 1 - share : share, hit = Math.random() < 0.18 + pw * 0.42; for (var sp2 = 0; sp2 < 3; sp2++) parts.push({ x: (u.x + foe.x) / 2, y: y - 14, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 40, life: 0.25, col: '#fff2a8', r: 1.2, g: false }); if (hit) killUnit(foe, Math.random() < 0.15); } else u.cd = 0.3; } else if (u.cd <= 0 && u.kind === 'archer') { u.cd = 1 + Math.random(); shots.push({ k: 'arrow', x: u.x, y: y - 14, tx: front + (u.side ? -20 : 20) + (Math.random() - 0.5) * 50, p: 0, side: u.side }); } }
      var jmp = war.done && ((share >= 0.5) === !u.side) ? Math.abs(Math.sin(t * 6 + u.ph)) * 6 : 0;
      drawFigure(ctx, u.x, y - jmp, u.side, u.kind, u.ph, S.style.skin, banner, 1.5, 0, 1);
    });
    units = units.filter(function (u) { return !u.dead; });
    parts.forEach(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += 380 * dt; ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; if (p.g && p.y > gy + 10 + Math.random() * 40 && p.col.charAt(0) === '#' && p.col !== '#cfd6dd' && Math.random() < 0.02 && S.style.blood) splats.push({ x: p.x, y: p.y, r: 2 + Math.random() * 2, a: 0.6, t: 0 }); });
    parts = parts.filter(function (p) { return p.life > 0 && parts.length < 900; });
    if (war.on && cryT <= 0 && Math.random() < dt * 0.25) cryT = 2.2;
    if (war.on && cryT > 0) { var cry = CRIES[S.style.cry]; ctx.font = '800 15px Bricolage Grotesque, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = banner; ctx.strokeText(cry, Math.max(80, front - 80), gy - 70 - (2.2 - cryT) * 10); ctx.fillText(cry, Math.max(80, front - 80), gy - 70 - (2.2 - cryT) * 10); }
    ctx.font = '800 14px Bricolage Grotesque, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('SPUDS (you)', 14, 24); ctx.textAlign = 'right'; ctx.fillText('WOBBLE', WC.w - 14, 24); ctx.textAlign = 'center';
    ctx.setTransform(WC.dpr, 0, 0, WC.dpr, 0, 0);
  }
  function holderOk() { return S.coin >= HOLD_MIN; }
  function opt(group, id, label, price, extra) {
    var key = group + ':' + id, own = !!S.owned[key], on = String(S.style[group]) === String(id) || (group === 'banner' && S.style.banner === id);
    return '<button data-g="' + group + '" data-id="' + id + '" data-p="' + price + '" class="' + (on ? 'on' : '') + '">' + (extra || '') + label + (own || !price ? '' : '<small>$' + price + '</small>') + '</button>';
  }
  function ctxWar() {
    var sc = scores(), el = $('ctx'), rb = Math.min(REINF_CAP, S.reinfBonus);
    el.innerHTML = '<h3>War</h3><h2>SPUDS vs WOBBLE</h2><p class="muted">Similar size, so the fight is fair. 24 hours, played here in about 20 seconds.</p>' +
      '<div class="stats"><div><span>Defenses + soldiers</span><b>+' + sc.bonus.toFixed(1) + '%</b></div><div><span>War chest</span><b>+' + chestBonus().toFixed(2) + '%</b></div><div><span>Reinforcements</span><b>+' + rb.toFixed(1) + '%</b></div><div><span>WOBBLE bonus</span><b>+7.0%</b></div></div>' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><small class="muted">Trading in this war</small><div class="big" id="vol">$' + fmt(war.vol) + '</div></div><div><small class="muted">Prize pot</small><div class="big gold-t" id="pot">$' + fmt(war.vol * 0.002) + '</div></div></div>' +
      '<div class="flow"><span>Trades</span>→<span>1% fee</span>→<span><em>20%</em> of it</span>→<span>Pot</span>→<span>Buys back the winner\'s coin</span></div>' +
      '<div class="row2"><button class="war" id="goWar"' + (war.on ? ' disabled' : '') + '>' + (war.done ? 'Fight again' : 'Declare war') + '</button>' +
      '<button class="gold" id="reinf"' + ((!war.on || !holderOk() || rb >= REINF_CAP) ? ' disabled' : '') + '>Call reinforcements $' + REINF_COST + '</button></div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:6px">' + (holderOk() ? 'Holders only: you hold ' + fmt(S.coin) + ' SPUDS, so you can call them in during a battle. Each call adds +' + REINF_STEP + '% (capped at +' + REINF_CAP + '%) and 5 fresh soldiers. Spending cannot buy a war.' : 'Reinforcements are for holders: hold at least ' + fmt(HOLD_MIN) + ' SPUDS.') + ' Called so far: ' + S.reinf + '.</p>' +
      '<div id="warRes"></div><div class="log" id="log"></div>' +
      '<h3 style="margin-top:14px">Make your army yours (cosmetic, paid in USDC)</h3>' +
      '<div class="muted" style="font-size:12.5px">Army</div><div class="opts">' + opt('skin', 'knights', 'Knights', 0) + opt('skin', 'frogs', 'Frogs', 3) + opt('skin', 'skeleton', 'Skeletons', 3) + opt('skin', 'robot', 'Robots', 3) + '</div>' +
      '<div class="muted" style="font-size:12.5px">Castle</div><div class="opts">' + opt('castle', 'stone', 'Stone', 0) + opt('castle', 'wood', 'Wood', 4) + opt('castle', 'neon', 'Neon', 4) + '</div>' +
      '<div class="muted" style="font-size:12.5px">Banner</div><div class="opts">' + BANNERS.map(function (b) { return '<button data-g="banner" data-id="' + b + '" data-p="0" class="' + (S.style.banner === b ? 'on' : '') + '"><i class="sw2" style="background:' + b + '"></i></button>'; }).join('') + '</div>' +
      '<div class="muted" style="font-size:12.5px">Battle cry</div><div class="opts">' + CRIES.map(function (c, i) { return opt('cry', i, c, i === 3 ? 1 : 0); }).join('') + '</div>' +
      '<div class="muted" style="font-size:12.5px">Blood</div><div class="opts"><button data-g="blood" data-id="1" data-p="0" class="' + (S.style.blood ? 'on' : '') + '">Cartoon blood on</button><button data-g="blood" data-id="0" data-p="0" class="' + (!S.style.blood ? 'on' : '') + '">Off</button></div>';
    $('goWar').addEventListener('click', startWar); $('reinf').addEventListener('click', callReinf);
    Array.prototype.forEach.call(el.querySelectorAll('.opts button[data-g]'), function (b) { b.addEventListener('click', function () {
      var g = b.getAttribute('data-g'), id = b.getAttribute('data-id'), p = +b.getAttribute('data-p'), key = g + ':' + id;
      if (g === 'blood') { S.style.blood = id === '1'; ctxWar(); return; }
      if (p && !S.owned[key]) { if (!pay(p, 0, 'style')) return; S.owned[key] = 1; say('y', 'You bought <b>' + (b.textContent.replace(/\$.*/, '')).trim() + '</b> · $' + p); }
      if (g === 'cry') S.style.cry = +id; else if (g === 'banner') { S.style.banner = id; } else S.style[g] = id;
      ctxWar();
    }); });
  }
  function callReinf() {
    if (!war.on || !holderOk() || S.reinfBonus >= REINF_CAP) return;
    if (!pay(REINF_COST, 0, 'war')) return; S.reinf++; S.reinfBonus = Math.min(REINF_CAP, S.reinfBonus + REINF_STEP);
    for (var i = 0; i < 5; i++) spawnUnit(0, i === 0 ? 'archer' : 'sword', 70 + Math.random() * 30); shake = Math.max(shake, 4);
    var lg = $('log'); if (lg) { var d = document.createElement('div'); d.textContent = 'Horn: reinforcements arrive (+' + REINF_STEP + '%)'; lg.insertBefore(d, lg.firstChild); }
    say('r', 'You called <b>reinforcements</b> in the SPUDS war · $' + REINF_COST); ctxWarKeep();
  }
  function ctxWarKeep() { var vol = $('vol') ? $('vol').textContent : null; var pot = $('pot') ? $('pot').textContent : null; var lg = $('log') ? $('log').innerHTML : ''; ctxWar(); if (vol) { $('vol').textContent = vol; $('pot').textContent = pot; $('log').innerHTML = lg; } }
  function startWar() {
    if (war.on) return;
    var sc = scores(); war = { on: true, done: false, vol: 0, sa: 50, sd: 50, t: 0 }; S.reinfBonus = 0; S.reinf = 0; resetWar(); ctxWar();
    var bonusD = 1.07, log = $('log'); function add(m) { var d = document.createElement('div'); d.textContent = m; var lg = $('log'); if (lg) lg.insertBefore(d, lg.firstChild); } add('Hour 0 · the war opens');
    var tick = 0, T = 44; clearInterval(warIv);
    warIv = setInterval(function () {
      tick++; var bonusA = 1 + (sc.bonus + chestBonus() + Math.min(REINF_CAP, S.reinfBonus)) / 100, step = 9000 + Math.random() * 51000, pa = 0.5 + (Math.random() - 0.5) * 0.3;
      war.vol += step; war.sa += step * pa * bonusA / 8000; war.sd += step * (1 - pa) * bonusD / 8000;
      var share = 100 * war.sa / (war.sa + war.sd), bar = $('warBar').children; bar[0].style.width = share + '%'; bar[1].style.width = (100 - share) + '%';
      var ve = $('vol'), pe = $('pot'); if (ve) ve.textContent = '$' + fmt(war.vol); if (pe) pe.textContent = '$' + fmt(war.vol * 0.002);
      if (tick % 8 === 0) add('Hour ' + Math.round(tick * 24 / T) + ' · ' + (share >= 50 ? 'SPUDS' : 'WOBBLE') + ' pushes the line');
      if (tick >= T) {
        clearInterval(warIv); war.on = false; war.done = true; var win = war.sa >= war.sd, pot = Math.round(war.vol * 0.002), wn = win ? 'SPUDS' : 'WOBBLE', loser = nations[win ? 3 : 0], winner = nations[win ? 0 : 3];
        var moved = transferCells(loser, winner, 30);
        winner.ch += 2.5; loser.ch -= 1.8; C.pots += pot; say('r', '<b>' + wn + '</b> wins the war · pot $' + fmt(pot) + ' buys back the coin · ' + moved + ' tiles change hands'); S.reinfBonus = 0;
        if (view === 'war') { ctxWarKeep(); }
        var rs = $('warRes'); if (rs) rs.innerHTML = '<div class="result"><b style="color:' + (win ? '#46d39a' : '#ffc145') + '">' + wn + ' wins.</b> ' + moved + ' tiles change hands on the world map. The pot of <b class="gold-t">$' + fmt(pot) + '</b> buys back ' + wn + ' on the open market. ' + (win ? 'WOBBLE' : 'SPUDS') + ' keeps its liquidity and its chain. ' + (win ? 'Your defenses, the chest and any reinforcements added ' + (sc.bonus + chestBonus() + S.reinfBonus).toFixed(1) + '% to the score.' : 'Build more defenses and try again.') + '</div>';
      }
    }, 460);
  }

  /* ============================== shell ============================== */
  var view = 'world', last = performance.now();
  function show(v) {
    view = v;
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
    ['world', 'land', 'war'].forEach(function (k) { $('v-' + k).classList.toggle('on', k === v); });
    resize();
    if (v === 'world') { ctxWorld(); worldCounts(); } if (v === 'land') { refreshCtxLand(); hud(); } if (v === 'war') ctxWar();
  }
  function resize() {
    if (view === 'world') { var h = Math.max(280, Math.round($('v-world').clientWidth * 0.75)); CW = fit($('cWorld'), h); clampCam(); }
    if (view === 'land') { LC.w = $('v-land').clientWidth || 600; sizeLand(); }
    if (view === 'war') { WC.w = $('v-war').clientWidth || 600; sizeWar(); if (!units.length) resetWar(); }
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-view')); }); });
  window.addEventListener('resize', resize);
  var cntT = 0;
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now; var t = now / 1000;
    if (!paused) { simAcc += dt * speed; if (simAcc >= 0.25) { simStep(simAcc, t); simAcc = 0; } }
    if (view === 'world' && CW && CW.ctx) drawWorld(t);
    if (view === 'land' && LC && LC.ctx) drawLand(t);
    if (view === 'war' && WC && WC.ctx) drawWar(t, dt);
    updLand(dt); hudT += dt; cntT += dt; flowT += dt;
    if (hudT > 0.25) { hudT = 0; if (view === 'land') hud(); }
    if (flowT > 0.5) { flowT = 0; renderFlow(); }
    if (cntT > 1.5) { cntT = 0; if (view === 'world') worldCounts(); }
    requestAnimationFrame(frame);
  }
  CW = fit($('cWorld'), 360); LC = { w: 600 }; WC = { w: 600 };
  say('', 'The world opens: 1,200 villages, 7 nations'); buildMenu(); bindWorld(); bindLand(); updateWallet(); updateLedger(); worldCounts(); show('world');
  requestAnimationFrame(frame);
})();
