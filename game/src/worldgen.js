// Paints the world's ground into one big canvas from the contract's own terrain grid. The grid (what is water, mountain, coast,
// pass) is the contract's and is never changed; everything here is how it LOOKS: warped, noisy borders so the 4-by-4 blocks read as
// lakes and ranges, hillshaded relief on the mountains, red badlands foothills, a lush-to-dry grass mix, shallow-to-deep water,
// and dirt roads between the nations. Decorative islets in the ocean margin are not land anyone can use.
import { LAND, WATER, MOUNTAIN, COAST, PASS } from './terrain.js';

export const TILE = 56;
export const MARGIN = 5; // ocean tiles around the playable square

export function makeNoise(seed) {
  const N = 256;
  const g = new Float32Array(N * N);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
    const a = g[y0 | x0], b = g[y0 | x1], c = g[y1 | x0], d = g[y1 | x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const NOISE = makeNoise(1337);
export const noise = NOISE;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** how green the land is at a world pixel: the same low-frequency noise the painter uses, so trees and flowers match the grass */
export const lushAtPx = (px, py) => smooth(0.42, 0.62, NOISE(px / 260 + 7, py / 260 + 3));

function pixelsOf(img, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, size, size);
  return x.getImageData(0, 0, size, size).data;
}

const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** the playable grid plus the ocean margin: per tile weights the painter blends */
export function buildGrid(world) {
  const R = world.radius;
  const T = (R + MARGIN) * 2 + 1;
  const Wf = new Float32Array(T * T), Mf = new Float32Array(T * T), Sf = new Float32Array(T * T), Pf = new Float32Array(T * T);
  const kinds = new Uint8Array(T * T); // 0 land 1 water 2 mountain 3 coast 4 pass 5 ocean 6 islet
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < T; i++) {
      const x = i - (R + MARGIN), y = j - (R + MARGIN);
      const inside = Math.abs(x) <= R && Math.abs(y) <= R;
      const k = j * T + i;
      if (!inside) {
        const d = Math.max(Math.abs(x), Math.abs(y)) - R; // 1 = the ring touching the playable square
        const islet = d >= 2 && hash2(x + 500, y + 500) < 0.1 + 0.05 * (d - 2);
        kinds[k] = islet ? 6 : 5;
        if (islet) Sf[k] = 1; else Wf[k] = 1;
        continue;
      }
      const t = world.terrain(x, y);
      kinds[k] = t;
      if (t === WATER) Wf[k] = 1;
      if (t === MOUNTAIN) Mf[k] = 1;
      if (t === COAST) Sf[k] = 1;
      if (t === PASS) Pf[k] = 1;
    }
  }
  return { T, R, kinds, Wf, Mf, Sf, Pf, size: T * TILE, toPx: (x) => (x + R + MARGIN) * TILE };
}

/** A* over the tile grid between two capitals: land is cheap, mountains dear, water closed. Returns tile coords or null. */
function route(world, from, to) {
  const R = world.radius;
  const cost = (x, y) => {
    if (Math.abs(x) > R || Math.abs(y) > R) return Infinity;
    const t = world.terrain(x, y);
    return t === WATER ? Infinity : t === MOUNTAIN ? 7 : t === PASS ? 1.1 : 1;
  };
  const key = (x, y) => (x + 64) * 256 + (y + 64);
  const open = [[0, from[0], from[1]]];
  const g = new Map([[key(...from), 0]]);
  const prev = new Map();
  const h = (x, y) => Math.abs(x - to[0]) + Math.abs(y - to[1]);
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, x, y] = open.shift();
    if (x === to[0] && y === to[1]) {
      const path = [[x, y]];
      let k = key(x, y);
      while (prev.has(k)) { const p = prev.get(k); path.push(p); k = key(p[0], p[1]); }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = cost(nx, ny);
      if (c === Infinity) continue;
      const ng = g.get(key(x, y)) + c;
      if (ng < (g.get(key(nx, ny)) ?? Infinity)) { g.set(key(nx, ny), ng); prev.set(key(nx, ny), [x, y]); open.push([ng + h(nx, ny), nx, ny]); }
    }
  }
  return null;
}

/** dirt roads joining each nation's capital to its nearest neighbour already joined (a spanning tree); returns the tile paths */
export function roads(world) {
  const caps = world.nations.map((n) => n.plots[0]);
  const joined = [0], out = [];
  while (joined.length < caps.length) {
    let best = null;
    for (let i = 0; i < caps.length; i++) {
      if (joined.includes(i)) continue;
      for (const j of joined) {
        const d = Math.abs(caps[i][0] - caps[j][0]) + Math.abs(caps[i][1] - caps[j][1]);
        if (!best || d < best.d) best = { d, i, j };
      }
    }
    if (!best) break;
    const p = route(world, caps[best.j], caps[best.i]);
    if (p) out.push(p);
    joined.push(best.i);
  }
  return out;
}

/** a mask of the roads at half resolution, wobbled and blurred so the edges are soft */
function roadMask(world, grid) {
  const hs = 2, W = Math.ceil(grid.size / hs);
  const c = document.createElement('canvas');
  c.width = c.height = W;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, W, W);
  x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  for (const path of roads(world)) {
    let pts = path.map(([tx, ty]) => [(grid.toPx(tx) + TILE / 2) / hs, (grid.toPx(ty) + TILE / 2) / hs]);
    for (let it = 0; it < 2; it++) { // Chaikin smoothing: the right-angle steps become curves
      const q = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      q.push(pts[pts.length - 1]); pts = q;
    }
    x.lineWidth = 13;
    x.beginPath();
    pts.forEach(([px, py], i) => { const wob = (NOISE(px / 9, py / 9) - 0.5) * 5; i ? x.lineTo(px + wob, py - wob) : x.moveTo(px + wob, py - wob); });
    x.stroke();
  }
  const d = x.getImageData(0, 0, W, W).data;
  const m = new Float32Array(W * W);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
  // one box blur each way
  const t = new Float32Array(W * W), r = 3;
  for (let y = 0; y < W; y++) for (let xx = 0; xx < W; xx++) { let s = 0; for (let k = -r; k <= r; k++) s += m[y * W + Math.min(W - 1, Math.max(0, xx + k))]; t[y * W + xx] = s / (2 * r + 1); }
  for (let y = 0; y < W; y++) for (let xx = 0; xx < W; xx++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(W - 1, Math.max(0, y + k)) * W + xx]; m[y * W + xx] = s / (2 * r + 1); }
  return { m, W, hs };
}

/** paints ground + a water shimmer layer; resolves with two canvases. Yields to the browser between bands so the page stays alive. */
export async function paintWorld(scene, grid, onProgress, world) {
  const { T, Wf, Mf, Sf, Pf } = grid;
  const size = grid.size;
  const tex = (k) => pixelsOf(scene.textures.get(k).getSourceImage());
  const GR = tex('g_grass'), LU = tex('g_lush'), DI = tex('g_dirt'), RR = tex('g_redrock'), SL = tex('g_slate'), WA = tex('g_water'), SA = tex('g_sand');
  const n = NOISE;
  const road = roadMask(world, grid);
  const ground = document.createElement('canvas');
  ground.width = ground.height = size;
  const gctx = ground.getContext('2d');
  const gimg = gctx.createImageData(size, size);
  const gd = gimg.data;
  const over = document.createElement('canvas');
  over.width = over.height = size;
  const octx = over.getContext('2d');
  const oimg = octx.createImageData(size, size);
  const od = oimg.data;

  const bil = (f, u, v) => {
    u -= 0.5; v -= 0.5;
    const i = Math.floor(u), j = Math.floor(v);
    const fu = u - i, fv = v - j;
    const i0 = Math.min(T - 1, Math.max(0, i)), i1 = Math.min(T - 1, Math.max(0, i + 1));
    const j0 = Math.min(T - 1, Math.max(0, j)), j1 = Math.min(T - 1, Math.max(0, j + 1));
    const a = f[j0 * T + i0], b = f[j0 * T + i1], c = f[j1 * T + i0], d = f[j1 * T + i1];
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  };
  // mountain relief: ridged noise under the (warped) mountain mask
  const relief = (px, py, fm) => {
    const r1 = 1 - Math.abs(2 * n(px / 40 + 60, py / 40) - 1), r2 = 1 - Math.abs(2 * n(px / 17 + 80, py / 17 + 9) - 1);
    return smooth(0.22, 0.78, fm) * (0.35 + 0.65 * (0.8 * r1 + 0.2 * r2));
  };

  const band = 40;
  for (let y0 = 0; y0 < size; y0 += band) {
    const y1 = Math.min(size, y0 + band);
    for (let py = y0; py < y1; py++) {
      for (let px = 0; px < size; px++) {
        const o = (py * size + px) * 4;
        const wx = px + (n(px / 120, py / 120) - 0.5) * 74 + (n(px / 46 + 5, py / 46) - 0.5) * 26 + (n(px / 14, py / 14) - 0.5) * 7;
        const wy = py + (n(px / 120 + 31, py / 120 + 17) - 0.5) * 74 + (n(px / 46, py / 46 + 9) - 0.5) * 26 + (n(px / 14 + 17, py / 14 + 5) - 0.5) * 7;
        const u = wx / TILE, v = wy / TILE;
        const fw = bil(Wf, u, v) + (n(px / 70 + 3, py / 70 + 11) - 0.5) * 0.3;
        const fm = bil(Mf, u, v) + (n(px / 55 + 40, py / 55) - 0.5) * 0.25;
        const fs = bil(Sf, u, v), fp = bil(Pf, u, v);
        const n1 = n(px / 90, py / 90), n3 = n(px / 11, py / 11);
        const ti = ((py & 511) << 9 | (px & 511)) << 2;
        const ti2 = (((py * 0.43 + 173) & 511) << 9 | ((px * 0.43 + 291) & 511)) << 2;
        let r, g, b;
        if (fw > 0.5) {
          const depth = Math.min(1, (fw - 0.5) * 2.2);
          const sh = 1.1 - 0.52 * depth;
          r = WA[ti] * sh; g = WA[ti + 1] * sh; b = WA[ti + 2] * sh;
          // shallows: warm turquoise by the shore fading into the deep blue
          const shallow = 1 - smooth(0, 0.42, depth);
          r += (70 - r) * shallow * 0.5; g += (190 - g) * shallow * 0.5; b += (170 - b) * shallow * 0.45;
          const foam = 1 - smooth(0.5, 0.58, fw);
          const fn = foam * (0.5 + 0.5 * n(px / 7, py / 7));
          r += (232 - r) * fn; g += (244 - g) * fn; b += (238 - b) * fn;
          const lum = (WA[ti2] + WA[ti2 + 1] + WA[ti2 + 2]) / 3;
          const a = Math.max(0, Math.min(1, (lum - 105) / 65)) * (0.75 - 0.4 * depth);
          od[o] = 200; od[o + 1] = 248; od[o + 2] = 240; od[o + 3] = a * 160;
        } else {
          const lush = Math.min(1, smooth(0.42, 0.62, n(px / 260 + 7, py / 260 + 3)) + smooth(0.55, 0.0, fw) * 0.35);
          // grass: two samples at different scales so the texture never visibly repeats; lush mixes toward green
          let gr = GR[ti] * 0.6 + GR[ti2] * 0.4, gg = GR[ti + 1] * 0.6 + GR[ti2 + 1] * 0.4, gb = GR[ti + 2] * 0.6 + GR[ti2 + 2] * 0.4;
          const lr = LU[ti] * 0.6 + LU[ti2] * 0.4, lg = LU[ti + 1] * 0.6 + LU[ti2 + 1] * 0.4, lb = LU[ti + 2] * 0.6 + LU[ti2 + 2] * 0.4;
          gr += (lr * 0.9 - gr) * lush; gg += (lg * 0.95 - gg) * lush; gb += (lb * 0.85 - gb) * lush;
          // dirt patches (rust where it is dry), more road-like dirt on passes
          const dirtMix = Math.min(1, smooth(0.52, 0.74, n1) * (1 - lush * 0.7) * 0.9 + fp * 0.9);
          const dr = DI[ti] * 0.7 + RR[ti2] * 0.3, dg = DI[ti + 1] * 0.7 + RR[ti2 + 1] * 0.3, db = DI[ti + 2] * 0.7 + RR[ti2 + 2] * 0.3;
          r = gr + (dr - gr) * dirtMix; g = gg + (dg - gg) * dirtMix; b = gb + (db - gb) * dirtMix;
          // dirt roads between nations
          const rx = Math.min(road.W - 1, (px / road.hs) | 0), ry = Math.min(road.W - 1, (py / road.hs) | 0);
          const rd = smooth(0.25, 0.7, road.m[ry * road.W + rx] + (n3 - 0.5) * 0.25);
          if (rd > 0) { const rr = DI[ti] * 0.85 + 20, rg = DI[ti + 1] * 0.8 + 12, rb = DI[ti + 2] * 0.7; r += (rr - r) * rd * 0.92; g += (rg - g) * rd * 0.92; b += (rb - b) * rd * 0.92; }
          // sand by the water and on coast plots
          const sand = Math.max(fs * 0.5 * smooth(0.3, 0.6, n(px / 24, py / 24) + 0.25), smooth(0.1, 0.45, fw));
          if (sand > 0) { r += (SA[ti] - r) * sand; g += (SA[ti + 1] - g) * sand; b += (SA[ti + 2] - b) * sand; }
          // mountains: red badlands foothills first, then slate with hillshaded ridges
          const foot = smooth(0.12, 0.38, fm) * (1 - smooth(0.42, 0.7, fm));
          if (foot > 0) { r += (RR[ti] * 0.95 - r) * foot * 0.85; g += (RR[ti + 1] * 0.9 - g) * foot * 0.85; b += (RR[ti + 2] * 0.9 - b) * foot * 0.85; }
          const rock = smooth(0.4, 0.66, fm);
          let light = 1;
          if (rock > 0) {
            const h0 = relief(px, py, fm), h1 = relief(px + 2.4, py + 2.4, fm);
            const shade = 0.8 + (h0 - h1) * 4.2 + (h0 - 0.5) * 0.25; // light from the north-west
            const sr = SL[ti] * 1.15, sg = SL[ti + 1] * 1.1, sb = SL[ti + 2] * 1.05;
            const cap = smooth(0.62, 0.9, h0) * 0.35; // pale rock high up
            r += ((sr + (205 - sr) * cap) * Math.max(0.5, Math.min(1.15, shade)) - r) * rock; g += ((sg + (205 - sg) * cap) * Math.max(0.5, Math.min(1.15, shade)) - g) * rock; b += ((sb + (200 - sb) * cap) * Math.max(0.5, Math.min(1.15, shade)) - b) * rock;
          }
          const wet = 1 - smooth(0.4, 0.5, fw) * 0.2;
          light = (0.9 + 0.22 * n3) * wet;
          r *= light; g *= light; b *= light;
          od[o + 3] = 0;
        }
        // the outer edge fades into the endless sea beyond, so the world has no visible border line
        const ed = Math.min(px, py, size - 1 - px, size - 1 - py);
        const ea = ed >= 110 ? 1 : smooth(0, 110, ed);
        gd[o] = r; gd[o + 1] = g; gd[o + 2] = b; gd[o + 3] = 255 * ea;
        od[o + 3] *= ea;
      }
    }
    if (onProgress) onProgress(y1 / size);
    await new Promise((res) => requestAnimationFrame(res));
  }
  gctx.putImageData(gimg, 0, 0);
  octx.putImageData(oimg, 0, 0);
  return { ground, shimmer: over };
}
