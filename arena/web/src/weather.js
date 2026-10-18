// Weathering for the map's own surfaces (walls, ground, decks), added to a standard material: the photographed texture tiles evenly, and this
// breaks the tiling up and makes the place look used. All of it is computed from where the surface is in the world, so one shared material
// still looks different from one wall to the next.
//   patches   slow light and dark blotches across the surface (hides the repeat)
//   grime     dirt and damp climbing the first metre or so of any upright surface, rougher and darker
//   streaks   long vertical stains down upright surfaces
//   puddles   on flat ground only: low, mirror-like patches of water that reflect the sky and the lamps
import * as THREE from 'three';

const NOISE = `
float wHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }
float wFbm(vec2 p) { return wNoise(p) * 0.55 + wNoise(p * 2.1) * 0.3 + wNoise(p * 4.3) * 0.15; }
`;

/** opts: { patches 0..1, grime 0..1, streaks 0..1, puddles 0..1 (0 = none), puddleTint } */
export function weather(mat, opts = {}) {
  const o = { patches: 0.7, grime: 0.7, streaks: 0.5, puddles: 0, ...opts };
  const key = JSON.stringify(o);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wPatches = { value: o.patches }; sh.uniforms.wGrime = { value: o.grime }; sh.uniforms.wStreaks = { value: o.streaks }; sh.uniforms.wPuddles = { value: o.puddles };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWN; uniform float wPatches, wGrime, wStreaks, wPuddles;\n${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wUp = clamp(vWN.y, 0.0, 1.0), wSide = 1.0 - abs(vWN.y);
        vec2 wp = vWPos.xz + vec2(vWPos.y * 0.7, 0.0);
        float wPatch = wFbm(wp * 0.22);
        diffuseColor.rgb *= 1.0 + (wPatch - 0.5) * 0.9 * wPatches;
        float wFine = wNoise(wp * 2.3);
        diffuseColor.rgb *= 1.0 + (wFine - 0.5) * 0.18 * wPatches;
        float wGr = smoothstep(1.7, 0.05, vWPos.y) * wSide * (0.45 + 0.55 * wNoise(wp * 1.3 + vec2(vWPos.y * 2.0, 0.0))) * wGrime;
        diffuseColor.rgb *= 1.0 - 0.5 * wGr;
        float wSt = smoothstep(0.58, 0.92, wNoise(vec2((vWPos.x + vWPos.z) * 2.6, vWPos.y * 0.16))) * wSide * wStreaks * smoothstep(0.0, 1.2, vWPos.y);
        diffuseColor.rgb *= 1.0 - 0.28 * wSt;
        float wPud = 0.0;
        if (wPuddles > 0.0) { wPud = smoothstep(0.62, 0.74, wFbm(vWPos.xz * 0.16 + 7.0)) * smoothstep(0.85, 0.97, wUp) * wPuddles; diffuseColor.rgb *= 1.0 - 0.6 * wPud; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + wGr * 0.3, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.12, wPud);`);
  };
  mat.customProgramCacheKey = () => 'weather' + key;
  mat.needsUpdate = true;
  return mat;
}
