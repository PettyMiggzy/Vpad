// Paints the world's ground into one big canvas from the contract's own terrain grid: grass, dirt, sand, rock and water textures
// (generated art) blended with warped noise so borders are organic, not square. The grid itself (what is water, mountain, coast,
// pass) is untouched; only how it looks is painted here.
import { LAND, WATER, MOUNTAIN, COAST, PASS } from './terrain.js';

export const TILE = 56;
export const MARGIN = 4; // ocean tiles around the playable square

function makeNoise(seed) {
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

function pixelsOf(img, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, size, size);
  return x.getImageData(0, 0, size, size).data;
}

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the playable grid plus the ocean margin: per tile weights the painter blends */
export function buildGrid(world) {
  const R = world.radius;
  const T = (R + MARGIN) * 2 + 1;
  const Wf = new Float32Array(T * T), Mf = new Float32Array(T * T), Sf = new Float32Array(T * T), Pf = new Float32Array(T * T);
  const kinds = new Uint8Array(T * T); // 0 land 1 water 2 mountain 3 coast 4 pass 5 ocean
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < T; i++) {
      const x = i - (R + MARGIN), y = j - (R + MARGIN);
      const inside = Math.abs(x) <= R && Math.abs(y) <= R;
      const t = inside ? world.terrain(x, y) : WATER;
      const k = j * T + i;
      kinds[k] = inside ? t : 5;
      if (t === WATER) Wf[k] = 1;
      if (t === MOUNTAIN) Mf[k] = 1;
      if (t === COAST) Sf[k] = 1;
      if (t === PASS) Pf[k] = 1;
    }
  }
  return { T, R, kinds, Wf, Mf, Sf, Pf, size: T * TILE, toPx: (x) => (x + R + MARGIN) * TILE };
}

/** paints ground + a water shimmer layer; resolves with two canvases. Yields to the browser between bands so the page stays alive. */
export async function paintWorld(scene, grid, onProgress) {
  const { T, Wf, Mf, Sf, Pf } = grid;
  const size = grid.size;
  const tex = (k) => pixelsOf(scene.textures.get(k).getSourceImage());
  const GR = tex('g_grass'), DI = tex('g_dirt'), RO = tex('g_rock'), WA = tex('g_water'), SA = tex('g_sand');
  const n = makeNoise(1337);
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
    let i = Math.floor(u), j = Math.floor(v);
    const fu = u - i, fv = v - j;
    const i0 = Math.min(T - 1, Math.max(0, i)), i1 = Math.min(T - 1, Math.max(0, i + 1));
    const j0 = Math.min(T - 1, Math.max(0, j)), j1 = Math.min(T - 1, Math.max(0, j + 1));
    const a = f[j0 * T + i0], b = f[j0 * T + i1], c = f[j1 * T + i0], d = f[j1 * T + i1];
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  };

  const band = 48;
  for (let y0 = 0; y0 < size; y0 += band) {
    const y1 = Math.min(size, y0 + band);
    for (let py = y0; py < y1; py++) {
      for (let px = 0; px < size; px++) {
        const o = (py * size + px) * 4;
        const wx = px + (n(px / 38, py / 38) - 0.5) * 30 + (n(px / 13, py / 13) - 0.5) * 9;
        const wy = py + (n(px / 38 + 91, py / 38 + 47) - 0.5) * 30 + (n(px / 13 + 17, py / 13 + 5) - 0.5) * 9;
        const u = wx / TILE, v = wy / TILE;
        const fw = bil(Wf, u, v), fm = bil(Mf, u, v), fs = bil(Sf, u, v), fp = bil(Pf, u, v);
        const n1 = n(px / 90, py / 90), n3 = n(px / 11, py / 11);
        const ti = ((py & 511) << 9 | (px & 511)) << 2;
        const ti2 = (((py * 0.8 | 0) + 173 & 511) << 9 | ((px * 0.8 | 0) + 291 & 511)) << 2;
        let r, g, b;
        if (fw > 0.5) {
          // water: darker with depth, a pale foam line at the shore
          const depth = Math.min(1, (fw - 0.5) * 2);
          const sh = 1.05 - 0.38 * depth;
          r = WA[ti] * sh; g = WA[ti + 1] * sh; b = WA[ti + 2] * sh;
          const foam = 1 - smooth(0.5, 0.6, fw);
          const fn = foam * (0.55 + 0.45 * n(px / 7, py / 7));
          r += (225 - r) * fn; g += (240 - g) * fn; b += (235 - b) * fn;
          // shimmer layer: bright caustic lines picked from a second sample
          const lum = (WA[ti2] + WA[ti2 + 1] + WA[ti2 + 2]) / 3;
          const a = Math.max(0, Math.min(1, (lum - 110) / 70)) * (0.7 - 0.35 * depth);
          od[o] = 190; od[o + 1] = 245; od[o + 2] = 235; od[o + 3] = a * 150;
        } else {
          // land: grass with dirt patches, sand by water and on coast plots, a dirt road through passes, rock under mountains
          let gr = GR[ti], gg = GR[ti + 1], gb = GR[ti + 2];
          const dirtMix = smooth(0.5, 0.72, n1) * 0.85 + fp * 0.9;
          const dm = Math.min(1, dirtMix);
          r = gr + (DI[ti] - gr) * dm; g = gg + (DI[ti + 1] - gg) * dm; b = gb + (DI[ti + 2] - gb) * dm;
          const sand = Math.max(fs * 0.55 * smooth(0.3, 0.6, n(px / 24, py / 24) + 0.25), smooth(0.12, 0.46, fw));
          if (sand > 0) { r += (SA[ti] - r) * sand; g += (SA[ti + 1] - g) * sand; b += (SA[ti + 2] - b) * sand; }
          const rock = smooth(0.34, 0.56, fm);
          if (rock > 0) { r += (RO[ti] * 1.15 - r) * rock; g += (RO[ti + 1] * 1.15 - g) * rock; b += (RO[ti + 2] * 1.15 - b) * rock; }
          const wet = 1 - smooth(0.4, 0.5, fw) * 0.18; // damp edge by the water
          const light = (0.88 + 0.24 * n3) * wet;
          r *= light; g *= light; b *= light;
          od[o + 3] = 0;
        }
        gd[o] = r; gd[o + 1] = g; gd[o + 2] = b; gd[o + 3] = 255;
      }
    }
    if (onProgress) onProgress(y1 / size);
    await new Promise((res) => requestAnimationFrame(res));
  }
  gctx.putImageData(gimg, 0, 0);
  octx.putImageData(oimg, 0, 0);
  return { ground, shimmer: over };
}
