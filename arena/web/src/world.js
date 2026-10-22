// Builds one map's look from the rules engine's own solids and ramps, so what you see is what stops you.
// Props are generated 3D models fitted to each solid's footprint; ground, walls and decks are real photographed textures; the sky is a real panorama
// that also lights the scene. Each map has its own time of day.
import * as THREE from 'three';
import { PX_PER_M } from './config.js';
import { fitModel, propHeight, loadMapAssets } from './assets.js';
import { weather } from './weather.js';

const m = (px) => px / PX_PER_M;

// what each map looks like and which files it needs
export const THEMES = {
  cargo: {
    hdr: 'industrial_sunset_puresky', ground: 'asphalt_02', gtile: 7, wall: 'concrete_wall_008', metal: 'corrugated_iron', deck: 'metal_plate', roof: 'concrete_floor_worn_001',
    sun: 3.8, sunColor: 0xffb070, env: 1.0, exposure: 0.9, fogNear: 150, fogFar: 520, hazeLum: 0.22, night: false,
    grade: { sat: 1.1, contrast: 1.1, vig: 0.34, grain: 0.022, shadow: [0.93, 0.99, 1.07], high: [1.07, 1.0, 0.9] },
    props: ['container_blue', 'container_grey', 'container_orange', 'container_red', 'container_blue_far', 'container_grey_far', 'container_orange_far', 'container_red_far', 'crate_wood', 'crate_steel', 'barrel_blue', 'barrel_red', 'barrier_concrete', 'sandbags', 'pallet_boxes', 'lamp_flood', 'water_tower', 'truck_cargo', 'forklift', 'pickup_truck', 'fence_chainlink', 'pipe_rack', 'watchtower', 'tires'],
  },
  dust: {
    hdr: 'qwantani_noon_puresky', ground: 'sand_01', gtile: 8, wall: 'large_sandstone_blocks', metal: 'rusty_metal_02', deck: 'concrete_floor_worn_001', roof: 'concrete_floor_worn_001',
    sun: 3.0, sunColor: 0xfff0d8, env: 1.5, exposure: 0.95, fogNear: 170, fogFar: 560, hazeLum: 0.55, night: false,
    grade: { sat: 1.12, contrast: 1.06, vig: 0.28, grain: 0.016, shadow: [0.96, 0.99, 1.05], high: [1.05, 1.0, 0.94] },
    props: ['adobe_house_a', 'adobe_house_b', 'market_stall', 'car_wreck', 'rock_large', 'fountain_dry', 'crate_wood', 'barrel_red', 'barrel_blue', 'sandbags', 'tree_dead', 'water_tower', 'pickup_truck', 'hesco', 'tires', 'shed_metal'],
  },
  refinery: {
    hdr: 'dikhololo_night', ground: 'concrete_floor_02', gtile: 6, wall: 'concrete_wall_008', metal: 'rusty_metal_02', deck: 'metal_plate', roof: 'concrete_floor_worn_001',
    sun: 1.5, sunColor: 0x9fb8ff, env: 1.2, exposure: 1.25, fogNear: 90, fogFar: 340, hazeLum: 0.025, night: true,
    grade: { sat: 1.05, contrast: 1.14, vig: 0.42, grain: 0.03, shadow: [0.9, 0.98, 1.12], high: [1.1, 1.02, 0.88] },
    props: ['tank_vertical', 'tank_horizontal', 'pipe_rack', 'generator', 'shed_metal', 'crate_steel', 'barrel_red', 'barrel_blue', 'barrier_concrete', 'lamp_flood', 'water_tower', 'watchtower', 'truck_cargo', 'fence_chainlink', 'pallet_boxes'],
  },
  training: {
    hdr: 'kloofendal_43d_clear_puresky', ground: 'dirt_floor', gtile: 7, wall: 'concrete_wall_008', metal: 'corrugated_iron', deck: 'concrete_floor_worn_001', roof: 'concrete_floor_worn_001',
    sun: 3.0, sunColor: 0xfff0d8, env: 1.0, exposure: 0.85, fogNear: 220, fogFar: 640, hazeLum: 0.3, night: false,
    grade: { sat: 1.1, contrast: 1.07, vig: 0.28, grain: 0.016, shadow: [0.96, 0.99, 1.05], high: [1.05, 1.0, 0.94] },
    props: ['container_blue', 'container_grey', 'container_orange', 'container_red', 'container_blue_far', 'container_grey_far', 'container_orange_far', 'container_red_far', 'crate_wood', 'crate_steel', 'barrel_red', 'barrel_blue', 'sandbags', 'barrier_concrete', 'fence_chainlink', 'shed_metal', 'watchtower', 'tires'],
  },
  testsite: {
    hdr: 'kloofendal_43d_clear_puresky', ground: 'dirt_floor', gtile: 7, wall: 'white_stucco', metal: 'corrugated_iron', deck: 'concrete_floor_worn_001', roof: 'concrete_floor_worn_001', road: 'asphalt_02',
    sun: 2.8, sunColor: 0xfff0d8, env: 1.0, exposure: 0.8, fogNear: 200, fogFar: 620, hazeLum: 0.26, night: false,
    grade: { sat: 1.12, contrast: 1.07, vig: 0.28, grain: 0.016, shadow: [0.96, 0.99, 1.05], high: [1.05, 1.0, 0.94] },
    props: ['school_bus', 'sedan_classic', 'mannequins', 'tree_green', 'picket_fence', 'car_wreck', 'shed_metal', 'crate_wood', 'barrel_red', 'barrel_blue', 'sandbags', 'barrier_concrete', 'fence_chainlink', 'water_tower', 'watchtower', 'adobe_house_a', 'adobe_house_b'],
  },
};
export const MAP_LIST = [['cargo', 'Cargo Yard', 'dusk, stacked containers, four sniper decks'], ['dust', 'Dust Town', 'noon, rooftops and a tower'], ['refinery', 'Refinery', 'night, tanks and a long catwalk'], ['testsite', 'Test Site', 'daylight, a small suburb, short and fast'], ['training', 'Training Yard', 'daylight, firing lanes to 90 m, an obstacle course, a house, a sniper tower: train with your squad']];

const glow = (hex, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
const rngOf = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** a box whose texture coordinates are in metres, so one shared material tiles evenly on every size */
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile); }
  return g;
}

/** the brightest spot in a panorama is the sun: its direction (y up) */
function sunOf(tex) {
  const { data, width, height } = tex.image;
  let best = -1, bi = 0;
  for (let i = 0; i < width * height; i++) { const l = data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]; if (+l > best) { best = +l; bi = i; } }
  const x = bi % width, row = Math.floor(bi / width);
  const u = (x + 0.5) / width, v = tex.flipY ? 1 - (row + 0.5) / height : (row + 0.5) / height;
  const phi = (u - 0.5) * Math.PI * 2, lat = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(phi), Math.sin(lat), Math.cos(lat) * Math.sin(phi));
}
/** the average colour just above the horizon, away from the sun: the haze the far ground fades into */
function hazeOf(tex, sun) {
  const { data, width, height } = tex.image;
  const c = new THREE.Color(0, 0, 0); let n = 0;
  for (let row = 0; row < height; row++) {
    const v = tex.flipY ? 1 - (row + 0.5) / height : (row + 0.5) / height, lat = (v - 0.5) * Math.PI;
    if (lat < 0.01 || lat > 0.14) continue;
    for (let x = 0; x < width; x += 8) {
      const phi = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(phi), Math.sin(lat), Math.cos(lat) * Math.sin(phi));
      if (dir.dot(sun) > 0.55) continue;
      const i = (row * width + x) * 4; c.r += +data[i]; c.g += +data[i + 1]; c.b += +data[i + 2]; n++;
    }
  }
  return n ? c.multiplyScalar(1 / n) : c;
}

export async function buildWorld(scene, renderer, map, A, colors, quality, onProgress) {
  const th = THEMES[map.theme] || THEMES.cargo;
  await loadMapAssets(A, { props: th.props, tex: [th.ground, th.wall, th.metal, th.deck, th.roof, ...(th.road ? [th.road] : [])], hdr: th.hdr }, onProgress);
  const group = new THREE.Group(); scene.add(group);
  const W = map.wM, H = map.hM;
  const own = [];                                                    // geometries made here, freed when the map is dropped
  const keep = (g) => { own.push(g); return g; };
  const R = rngOf(map.id.length * 7919 + 13);

  // ---- sky, light, haze ----
  const hdr = A.hdr[th.hdr];
  const sunDir = sunOf(hdr);
  if (sunDir.y < 0.05) sunDir.y = 0.35, sunDir.normalize();
  const haze = hazeOf(hdr, sunDir);
  { const lum = 0.2126 * haze.r + 0.7152 * haze.g + 0.0722 * haze.b; haze.multiplyScalar(th.hazeLum / Math.max(lum, 1e-4)); }
  const pm = new THREE.PMREMGenerator(renderer); const envTex = pm.fromEquirectangular(hdr).texture; pm.dispose();
  scene.background = hdr; scene.environment = envTex; scene.environmentIntensity = th.env; scene.backgroundIntensity = th.night ? 1.3 : map.theme === 'cargo' ? 0.75 : 1;
  scene.fog = new THREE.Fog(haze, th.fogNear, th.fogFar);
  renderer.toneMappingExposure = th.exposure;
  // sky-and-ground fill so the shaded sides are lifted in the colour of what surrounds them
  const hemi = { cargo: [0xb0b8d0, 0x58483c, 0.45], dust: [0xbcd0ff, 0xd8b880, 1.1], refinery: [0x6070a0, 0x30302c, 0.18], testsite: [0xbcd0ff, 0xd8c8a0, 0.95] }[map.theme] || [0xffffff, 0x444444, 0.3];
  group.add(new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2]));
  const sun = new THREE.DirectionalLight(th.sunColor, th.sun);
  sun.position.copy(sunDir).multiplyScalar(90).add(new THREE.Vector3(W / 2, 0, H / 2));
  sun.target.position.set(W / 2, 0, H / 2); group.add(sun.target);
  const sunOff = sunDir.clone().multiplyScalar(90);
  if (quality !== 'low') {
    sun.castShadow = true; sun.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048);
    const c = sun.shadow.camera; c.left = -50; c.right = 50; c.top = 40; c.bottom = -40; c.near = 20; c.far = 240;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2;
  }
  group.add(sun);

  // ---- floating dust: tiny specks drifting in the light, which gives the air depth ----
  let motes = null;
  if (quality === 'high') {
    const N = 520, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (R() - 0.5) * 70; pos[i * 3 + 1] = 0.3 + R() * 7; pos[i * 3 + 2] = (R() - 0.5) * 70; seed[i] = R() * 6.28; }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cg = cv.getContext('2d');
    const gr = cg.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 32, 32);
    const dotTex = new THREE.CanvasTexture(cv);
    const mat = new THREE.PointsMaterial({ size: 0.07, map: dotTex, transparent: true, opacity: th.night ? 0.22 : 0.42, depthWrite: false, color: th.sunColor, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    motes = new THREE.Points(g, mat); motes.frustumCulled = false; group.add(motes); own.push(dotTex, mat);
    motes.userData = { seed, base: pos.slice() };
  }
  /** keep the shadow box and the dust around the player: called every frame with the camera's place */
  const follow = (t, cam) => {
    const gx = Math.round(cam.x / 0.5) * 0.5, gz = Math.round(cam.z / 0.5) * 0.5;       // stepped, so the shadows do not shimmer as you walk
    sun.target.position.set(gx, 0, gz); sun.position.set(gx + sunOff.x, sunOff.y, gz + sunOff.z); sun.target.updateMatrixWorld();
    if (motes) motes.userData.centre = cam;
    tick(t);
  };
  const tick = (t) => {
    if (!motes) return;
    const p = motes.geometry.attributes.position, { seed, base, centre } = motes.userData, cx = centre ? centre.x : W / 2, cz = centre ? centre.z : H / 2;
    for (let i = 0; i < seed.length; i++) {
      // specks fixed in the world, repeating every 70 metres, so only the ones near you are ever drawn
      const wrap = (v, c) => c + ((((v - c + 35) % 70) + 70) % 70) - 35;
      const bx = wrap(base[i * 3], cx), bz = wrap(base[i * 3 + 2], cz);
      p.array[i * 3] = bx + Math.sin(t * 0.15 + seed[i]) * 1.4; p.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.22 + seed[i] * 2) * 0.6; p.array[i * 3 + 2] = bz + Math.cos(t * 0.13 + seed[i]) * 1.4;
    }
    p.needsUpdate = true;
  };

  // ---- materials ----
  const matCache = new Map();
  const pbr = (name, tint = 0xffffff, rough = 1, wopts = null) => {
    const k = name + tint + JSON.stringify(wopts); if (matCache.has(k)) return matCache.get(k);
    const t = A.tex[name];
    const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: rough, metalness: name.includes('metal') || name.includes('corrugated') ? 0.5 : 0.02, color: tint });
    if (wopts) weather(mat, wopts);
    matCache.set(k, mat); return mat;
  };
  const warm = map.theme === 'dust';
  const wet = map.theme === 'dust' ? 0 : th.night ? 0.9 : 0.7;       // puddles on the dry sand would look wrong
  const wallMat = pbr(th.wall, warm ? 0xf4dcb0 : 0xffffff, 1, warm ? { patches: 0.7, grime: 0.45, streaks: 0.35 } : { patches: 0.9, grime: 0.9, streaks: 0.7 }), metalMat = pbr(th.metal, 0xffffff, 1, { patches: 0.5, grime: 0.6, streaks: 0.8 });
  const deckMat = pbr(th.deck, warm ? 0x9c8868 : map.theme === 'testsite' ? 0xb4a894 : 0xffffff, 1, { patches: 0.6, grime: 0.3, streaks: 0.2, puddles: wet * 0.8 }), roofMat = pbr(th.roof, warm ? 0x6e604a : map.theme === 'testsite' ? 0xa89c8a : 0xffffff, 1, { patches: 0.8, grime: 0.3, streaks: 0.2, puddles: wet * 0.6 });
  const groundMat = pbr(th.ground, 0xffffff, 1, { patches: 0.9, grime: 0, streaks: 0, puddles: wet });
  const railMat = pbr(th.metal, 0xa88c78, 1, { patches: 0.5, grime: 0.5, streaks: 0.6 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xe8b800, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.9 });
  const mesh = (geo, mat, x, y, z, shadow = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; group.add(o); return o; };
  const slab = (mat, tile, x0, z0, w, d, y0, h) => mesh(keep(boxGeo(w, h, d, tile)), mat, x0 + w / 2, y0 + h / 2, z0 + d / 2);

  // ---- ground: a big textured plane well past the walls, so the far haze is ground and not a cut-off edge ----
  const gsize = 560;
  const gg = keep(new THREE.PlaneGeometry(gsize, gsize)); const guv = gg.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * gsize / th.gtile, guv.getY(i) * gsize / th.gtile);
  const ground = new THREE.Mesh(gg, groundMat); ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; group.add(ground);

  // ---- team ends: a lit pad in each team's colour, lamp posts ----
  const padGeo = keep(new THREE.PlaneGeometry(8, H - 4));
  colors.forEach((col, t) => {
    const cx = t === 0 ? 4.6 : W - 4.6;
    const p = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.55), transparent: true, opacity: 0.035, toneMapped: false, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set(cx, 0.02, H / 2); group.add(p);
    for (const [w, d, x, z] of [[8, 0.12, 0, -(H - 4) / 2], [8, 0.12, 0, (H - 4) / 2], [0.12, H - 4, t === 0 ? 4 : -4, 0]]) {
      const e = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.03, d)), glow(col, 1.6)); e.position.set(cx + x, 0.035, H / 2 + z); group.add(e);
    }
  });

  // ---- props ----
  const prop = (name, w, h, d, cx, y, cz, uniform = false) => {
    const g = A.props[name]; if (!g) return null;
    let o = fitModel(g, w, h, d, uniform);
    // a stripped-down copy (same pictures, a tenth of the triangles) takes over past a distance: most of a big map is far away
    const far = A.props[name + '_far'];
    if (far) {
      const lo = fitModel(far, w, h, d, uniform);
      let mat = null; g.scene.traverse((x) => { if (x.isMesh && !mat) mat = x.material; });
      lo.traverse((x) => { if (x.isMesh) { x.material = mat; x.castShadow = x.receiveShadow = true; } });
      const lod = new THREE.LOD(); lod.addLevel(o, 0); lod.addLevel(lo, quality === 'low' ? 55 : 85); o = lod;
    }
    o.position.set(cx, y, cz); group.add(o); return o;
  };
  const tall = (name, hgt, x, z, rot = 0) => { const g = A.props[name]; if (!g) return null; const o = propHeight(g, hgt); o.position.set(x, 0, z); o.rotation.y = rot; group.add(o); return o; };
  const NOM = { crate: 1.3, barrel: 1.1, barrier: 1.1, sandbag: 1.1, rail: 1.15 };
  const containerNames = ['container_blue', 'container_grey', 'container_orange', 'container_red'];
  let nCrate = 0, nBarrel = 0;

  // a block of shipping containers: lanes of 2.6 m, segments of about 6 m, layers of 2.7 m; a walkable top gets a steel plate
  const containerBlock = (x0, z0, w, d, top, walk, v) => {
    const layers = Math.max(1, Math.round(top / 2.7)), lh = top / layers;
    const alongX = w >= d, long = alongX ? w : d, wide = alongX ? d : w;
    const nl = Math.max(1, Math.round(wide / 2.6)), ns = Math.max(1, Math.round(long / 6.1));
    const lw = wide / nl, sl = long / ns;
    for (let L = 0; L < layers; L++) for (let a = 0; a < nl; a++) for (let b = 0; b < ns; b++) {
      const nm = containerNames[(v + L * 2 + a + b * 3) % containerNames.length];
      const cx = alongX ? x0 + sl * (b + 0.5) : x0 + lw * (a + 0.5), cz = alongX ? z0 + lw * (a + 0.5) : z0 + sl * (b + 0.5);
      prop(nm, alongX ? sl : lw, lh, alongX ? lw : sl, cx, L * lh, cz);
    }
    if (walk) mesh(keep(boxGeo(w + 0.05, 0.12, d + 0.05, 2.5)), deckMat, x0 + w / 2, top - 0.05, z0 + d / 2);
  };
  // an adobe building: sandstone walls, a flat roof you can walk on, dark doors and windows
  const building = (x0, z0, w, d, top, walk, doors, mat = wallMat) => {
    slab(mat, 3.2, x0, z0, w, d, 0, top);
    if (walk) mesh(keep(boxGeo(w - 0.06, 0.1, d - 0.06, 2.6)), roofMat, x0 + w / 2, top + 0.02, z0 + d / 2, false);
    const win = (px, pz, ry, ww, hh, y) => { const o = mesh(keep(new THREE.BoxGeometry(ww, hh, 0.12)), dark, px, y, pz, false); o.rotation.y = ry; };
    for (const side of ['n', 's', 'w', 'e']) {
      const alongZ = side === 'w' || side === 'e', len = alongZ ? d : w;
      const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, off = (t - 0.5) * len;
        const px = alongZ ? (side === 'w' ? x0 - 0.02 : x0 + w + 0.02) : x0 + w / 2 + off, pz = alongZ ? z0 + d / 2 + off : (side === 'n' ? z0 - 0.02 : z0 + d + 0.02);
        const ry = alongZ ? Math.PI / 2 : 0;
        if (doors && doors.includes(side) && i === Math.floor(n / 2)) win(px, pz, ry, 1.3, 2.4, 1.2); else if (top > 2.8) win(px, pz, ry, 0.9, 1.1, Math.min(top - 1.2, 2.2));
      }
    }
  };
  // a steel platform: grey steel sides, a plate floor, yellow edge stripes
  const platform = (x0, z0, w, d, top) => {
    slab(metalMat, 3, x0, z0, w, d, 0, top);
    mesh(keep(boxGeo(w + 0.08, 0.14, d + 0.08, 2.2)), deckMat, x0 + w / 2, top - 0.06, z0 + d / 2);
    for (const [ww, dd, px, pz] of [[w + 0.1, 0.16, x0 + w / 2, z0 - 0.03], [w + 0.1, 0.16, x0 + w / 2, z0 + d + 0.03], [0.16, d + 0.1, x0 - 0.03, z0 + d / 2], [0.16, d + 0.1, x0 + w + 0.03, z0 + d / 2]])
      mesh(keep(new THREE.BoxGeometry(ww, 0.12, dd)), hazard, px, top + 0.01, pz, false);
    // legs: dark posts down the sides so it reads as a raised platform
    for (const [px, pz] of [[x0, z0], [x0 + w, z0], [x0, z0 + d], [x0 + w, z0 + d]]) mesh(keep(new THREE.BoxGeometry(0.28, top, 0.28)), dark, px, top / 2, pz);
  };

  for (const s of map.solids) {
    const w = m(s.w), d = m(s.h), x0 = m(s.x), z0 = m(s.y), cx = x0 + w / 2, cz = z0 + d / 2, top = s.top, nom = NOM[s.kind] ?? top, y = top - nom;
    switch (s.kind) {
      case 'wall': {
        slab(wallMat, 3.4, x0, z0, w, d, 0, top);
        mesh(keep(boxGeo(w + 0.1, 0.18, d + 0.1, 2)), deckMat, cx, top + 0.09, cz);
        break;
      }
      case 'container': containerBlock(x0, z0, w, d, top, s.walk, s.v); break;
      case 'crate': prop(nCrate++ % 3 === 0 ? 'crate_steel' : 'crate_wood', w, nom, d, cx, y, cz); break;
      case 'barrel': prop(nBarrel++ % 2 ? 'barrel_blue' : 'barrel_red', w, nom, d, cx, y, cz); break;
      case 'barrier': prop('barrier_concrete', w, nom, d, cx, y, cz); break;
      case 'sandbag': prop('sandbags', w, nom, d, cx, y, cz); break;
      case 'house':
        if (map.theme === 'testsite') {
          // painted suburban houses: a yellow row on one side of the street and a green row on the other, a parapet round the flat roof, a porch awning over the street door
          const mat = pbr(th.wall, x0 < W / 2 ? 0xf2d56e : 0xa6cfa0, 1, { patches: 0.5, grime: 0.35, streaks: 0.4 });
          building(x0, z0, w, d, top, true, z0 < H / 2 ? ['s'] : ['n'], mat);
          const north = z0 < H / 2, doorZ = north ? z0 + d + 0.35 : z0 - 0.35;
          mesh(keep(new THREE.BoxGeometry(2.6, 0.12, 1.1)), roofMat, x0 + w / 2, 2.7, doorZ, true);
          for (const dx of [-1.15, 1.15]) mesh(keep(new THREE.BoxGeometry(0.1, 2.7, 0.1)), dark, x0 + w / 2 + dx, 1.35, north ? doorZ + 0.45 : doorZ - 0.45, false);
        } else building(x0, z0, w, d, top, true, ['s', 'n']);
        break;
      case 'bus': { const o = prop('school_bus', w, top, d, cx, 0, cz); if (!o) slab(new THREE.MeshStandardMaterial({ color: 0xe8b800, roughness: 0.6 }), 3, x0, z0, w, d, 0, top); break; }
      case 'fence': prop('fence_chainlink', w, top, d, cx, 0, cz); break;
      case 'tower': building(x0, z0, w, d, top, true, ['w', 'e']); break;
      case 'hut': prop('adobe_house_b', w, top, d, cx, 0, cz); break;
      case 'stall': prop('market_stall', w, top, d, cx, 0, cz); break;
      case 'car': prop(th.night ? 'pickup_truck' : map.theme === 'testsite' ? 'sedan_classic' : 'car_wreck', w, top, d, cx, 0, cz); break;
      case 'rock': prop('rock_large', w, top, d, cx, 0, cz); break;
      case 'fountain': prop('fountain_dry', w, top, d, cx, 0, cz); break;
      case 'tank': prop('tank_vertical', w, top, d, cx, 0, cz); break;
      case 'tank_h': prop('tank_horizontal', w, top, d, cx, 0, cz); break;
      case 'pipes': prop('pipe_rack', w, top, d, cx, 0, cz); break;
      case 'generator': prop('generator', w, top, d, cx, 0, cz); break;
      case 'shed': prop('shed_metal', w, top, d, cx, 0, cz); break;
      case 'catwalk': case 'scaffold': platform(x0, z0, w, d, top); break;
      case 'rail': slab(map.theme === 'dust' ? wallMat : map.theme === 'refinery' ? railMat : metalMat, map.theme === 'dust' ? 3.2 : 1.5, x0, z0, w, d, top - nom, nom); break;
      default: slab(wallMat, 3, x0, z0, w, d, 0, top);
    }
  }
  // ---- the street, sidewalks and yard decor of the suburb ----
  if (map.theme === 'testsite') {
    const roadMat = pbr(th.road, 0xd8d8d8, 1, { patches: 0.6, grime: 0.4, streaks: 0.3 });
    const walkMat = pbr(th.roof, 0xe8e2d4, 1, { patches: 0.5, grime: 0.2, streaks: 0.2 });
    const z0 = 21.8, z1 = 34.2;
    const road = mesh(keep(boxGeo(W - 4, 0.04, z1 - z0, 4)), roadMat, W / 2, 0.02, (z0 + z1) / 2, false); road.receiveShadow = true;
    for (const zz of [z0 - 0.7, z1 + 0.7]) mesh(keep(boxGeo(W - 4, 0.08, 1.4, 2)), walkMat, W / 2, 0.04, zz, false);
    const dash = new THREE.MeshStandardMaterial({ color: 0xe8d070, roughness: 0.8 });
    for (let x = 4; x < W - 4; x += 4) mesh(keep(new THREE.BoxGeometry(2, 0.05, 0.16)), dash, x + 1, 0.055, H / 2, false);
    // fenced front lawns and the family of mannequins in each back yard, both ends alike
    for (const [x, z, ry] of [[12.5, 5.2, 0.4], [12.5, 50.8, 3.5], [W - 12.5, H - 5.2, 3.5], [W - 12.5, 5.2, 0.4]]) tall('mannequins', 1.8, x, z, ry);
    for (const [x, z] of [[34, 19.5], [34, 36.5], [W - 34, 19.5], [W - 34, 36.5]]) tall('tree_green', 6.2, x, z, R() * 6);
    for (let k = 0; k < 6; k++) for (const z of [19.9, 36.1]) { const px = 38 + k * 3.7; if (px < W - 38) prop('picket_fence', 3.7, 1.1, 0.2, px + 1.85, 0, z); }
  }

  // ---- ramps: a wedge of steel plate from the floor up to the deck ----
  for (const r of map.ramps) {
    const w = m(r.w), d = m(r.h), L = r.axis[0] === 'x' ? w : d, Wd = r.axis[0] === 'x' ? d : w;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L, r.to); sh.lineTo(0, r.from); sh.closePath();
    const g = keep(new THREE.ExtrudeGeometry(sh, { depth: Wd, bevelEnabled: false }));
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.2, uv.getY(i) / 2.2);
    const o = new THREE.Mesh(g, deckMat); o.castShadow = o.receiveShadow = true;
    const x0 = m(r.x), z0 = m(r.y);
    if (r.axis === 'x+') o.position.set(x0, 0, z0);
    else if (r.axis === 'x-') { o.rotation.y = Math.PI; o.position.set(x0 + w, 0, z0 + d); }
    else if (r.axis === 'y+') { o.rotation.y = -Math.PI / 2; o.position.set(x0 + w, 0, z0); }
    else { o.rotation.y = Math.PI / 2; o.position.set(x0, 0, z0 + d); }
    group.add(o);
  }

  // ---- lamps: flood lamps at each team's end that really light the ground ----
  const lampH = 4.6, lights = [];
  const nPoint = quality === 'low' ? 0 : th.night ? (quality === 'mid' ? 6 : 10) : map.theme === 'cargo' ? 4 : 0;
  const lampSpots = [[2.2, 6], [2.2, H - 6], [W - 2.2, 6], [W - 2.2, H - 6], [W / 2, 3], [W / 2, H - 3]];
  // and a row down each long side, so a 200 m map is not dark in the middle; any spot that lands inside a building or platform is left out
  for (let k = 1; k <= 5; k++) for (const f of [0.25, 0.75]) lampSpots.push([W * k / 6, H * f]);
  const blocked = (x, z) => map.solids.some((s) => x >= m(s.x) - 0.5 && x <= m(s.x + s.w) + 0.5 && z >= m(s.y) - 0.5 && z <= m(s.y + s.h) + 0.5);
  lampSpots.forEach(([x, z], i) => {
    if (map.theme === 'dust' || map.theme === 'testsite' || blocked(x, z)) return;
    const o = A.props.lamp_flood ? tall('lamp_flood', lampH, x, z, x < W / 2 ? Math.PI / 2 : -Math.PI / 2) : null;
    if (i < nPoint) {
      const l = new THREE.PointLight(th.night ? 0xffe0b0 : 0xffd8a0, th.night ? 30 : 7, 22, 1.6);
      l.position.set(x, lampH - 0.3, z); group.add(l); lights.push(l);
    }
  });

  // ---- the skyline round the outside: seen over the perimeter wall from the high decks ----
  const noShadow = (o) => { if (o) o.traverse((x) => { if (x.isMesh) x.castShadow = false; }); return o; };
  const out = (name, hgt, x, z, rot) => noShadow(tall(name, hgt, x, z, rot));
  const ring = (n, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + R() * 0.3, rx = W / 2 + 12 + R() * 20, rz = H / 2 + 8 + R() * 18; fn(i, W / 2 + Math.cos(a) * (rx + 18), H / 2 + Math.sin(a) * (rz + 14), a); } };
  if (map.theme === 'cargo') {
    ring(34, (i, x, z, a) => { const stack = 1 + Math.floor(R() * 3); for (let k = 0; k < stack; k++) { const nm = containerNames[(i + k) % 4]; const o = noShadow(prop(nm, 6.1, 2.7, 2.5, x, k * 2.7, z)); if (o) o.rotation.y = a + Math.PI / 2; } });
    out('water_tower', 18, W + 24, -14, 0); out('water_tower', 14, -22, H + 16, 0.5); out('watchtower', 12, -12, -10, 0.4); out('watchtower', 12, W + 12, H + 10, 3.4);
    for (let i = 0; i < 6; i++) out(i % 2 ? 'truck_cargo' : 'forklift', i % 2 ? 3.4 : 2.4, -6 + i * 14, -9 - R() * 4, R() * 6);
  } else if (map.theme === 'dust') {
    ring(26, (i, x, z, a) => { const nm = i % 3 === 0 ? 'adobe_house_a' : 'adobe_house_b'; const o = noShadow(tall(nm, 4 + R() * 3.5, x, z, a + Math.PI)); if (o) o.rotation.y = a + Math.PI / 2; });
    for (let i = 0; i < 9; i++) out('rock_large', 3 + R() * 5, -20 + R() * (W + 40), (i % 2 ? -24 : H + 24) + R() * 8, R() * 6);
    for (let i = 0; i < 7; i++) out('tree_dead', 5 + R() * 3, -16 + R() * (W + 32), (i % 2 ? -14 : H + 14) + R() * 6, R() * 6);
    out('water_tower', 16, W + 28, H / 2 + 6, 0);
  } else if (map.theme === 'testsite') {
    ring(22, (i, x, z, a) => { const o = noShadow(tall(i % 2 ? 'adobe_house_a' : 'adobe_house_b', 4 + R() * 2.5, x, z, a + Math.PI)); if (o) o.rotation.y = a + Math.PI / 2; });
    for (let i = 0; i < 9; i++) out('tree_green', 5 + R() * 3, -14 + R() * (W + 28), (i % 2 ? -10 : H + 10) + R() * 5, R() * 6);
    out('water_tower', 17, W + 22, H / 2 - 4, 0); out('watchtower', 12, -14, H + 8, 0.4);
  } else {
    ring(16, (i, x, z, a) => { noShadow(out(i % 3 === 0 ? 'tank_horizontal' : 'tank_vertical', 10 + R() * 8, x, z, a)); });
    out('water_tower', 20, -26, 4, 0); out('water_tower', 18, W + 26, H - 4, 0); out('watchtower', 13, -10, -12, 0.3); out('watchtower', 13, W + 10, H + 12, 3.3);
    for (let i = 0; i < 5; i++) out('pipe_rack', 4.5, -10 + i * 16, -14, 0);
  }

  const dispose = () => {
    scene.remove(group); for (const g of own) g.dispose();
    for (const l of lights) l.dispose?.();
    envTex.dispose();
  };
  return { sun, lights, dispose, theme: th, group, tick, follow };
}
