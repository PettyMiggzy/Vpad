// The arena: built from the rules engine's own wall list, so what you see is what stops you.
// Shipping containers are the long walls, barrels and crates are the small cover, an industrial skyline stands behind, a low sun casts shadows.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { MAP, WALLS } from '../../server/game.js';
import { PX_PER_M } from './config.js';
import { fitModel } from './assets.js';

const m = (px) => px / PX_PER_M;
export const W = m(MAP.w), H = m(MAP.h);
const glow = (hex, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });

export function buildWorld(scene, A, colors, quality) {
  const group = new THREE.Group(); scene.add(group);
  // sky, haze and light
  const sky = new Sky(); sky.scale.setScalar(900);
  const su = sky.material.uniforms;
  su.turbidity.value = 7; su.rayleigh.value = 2.4; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.86;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(215));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  scene.fog = new THREE.Fog(0x3a2f45, 45, 150);
  scene.add(new THREE.HemisphereLight(0xbcc8ff, 0x4a3a30, 0.95));
  const sun = new THREE.DirectionalLight(0xffb27a, 3.1);
  sun.position.copy(sunDir).multiplyScalar(60).add(new THREE.Vector3(W / 2, 0, H / 2));
  sun.target.position.set(W / 2, 0, H / 2); scene.add(sun.target);
  if (quality !== 'low') {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -30; c.right = 30; c.top = 24; c.bottom = -24; c.near = 5; c.far = 160;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  }
  scene.add(sun);

  // ground: the dark prototype grid, two metres a square
  const gt = A.tex.dark1.clone(); gt.needsUpdate = true; gt.repeat.set((W + 160) / 3, (H + 160) / 3);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 160, H + 160), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.92, metalness: 0.05, color: 0xffffff, emissive: 0x20242c, emissiveIntensity: 0.6 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; group.add(ground);

  // each team's end: a glowing pad, a line, lamp posts that really light the ground
  const pad = (cx, color) => {
    const g = A.tex.light1.clone(); g.needsUpdate = true; g.repeat.set(2, 7);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5.4, H - 1.6), new THREE.MeshStandardMaterial({ map: g, color: 0x39414e, emissive: color, emissiveIntensity: 0.06, roughness: 0.55, metalness: 0.2 }));
    p.rotation.x = -Math.PI / 2; p.position.set(cx, 0.012, H / 2); p.receiveShadow = true; group.add(p);
    // a glowing frame round the pad, in the team's colour
    for (const [w, d, x, z] of [[5.4, 0.1, 0, -(H - 1.6) / 2], [5.4, 0.1, 0, (H - 1.6) / 2], [0.1, H - 1.6, -2.7, 0], [0.1, H - 1.6, 2.7, 0]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), glow(color, 1.3)); e.position.set(cx + x, 0.04, H / 2 + z); group.add(e);
    }
    const dir = cx < W / 2 ? 1 : -1;
    for (const z of [3.2, H / 2, H - 3.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: 0.6, metalness: 0.5 }));
      pole.position.set(cx + dir * 2.55, 2.1, z); pole.castShadow = true; group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glow(color, 2.6)); bulb.position.set(cx + dir * 2.45, 4.3, z); group.add(bulb);
      if (quality !== 'low') { const l = new THREE.PointLight(color, 11, 12, 1.8); l.position.set(cx + dir * 2.3, 4, z); group.add(l); }
    }
  };
  pad(3.4, colors[0]); pad(W - 3.4, colors[1]);

  // walls and cover
  const containers = ['shipping-container-a', 'shipping-container-b', 'shipping-container-c'];
  let ci = 0;
  WALLS.forEach(([wx, wy, ww, wh], i) => {
    const w = m(ww), d = m(wh), cx = m(wx) + w / 2, cz = m(wy) + d / 2;
    const frame = i < 4, barrel = !frame && w <= 0.9 && d <= 0.9, crate = !frame && !barrel && w <= 1.3 && d <= 1.3;
    if (frame) {
      const t = A.tex.light1.clone(); t.needsUpdate = true; t.repeat.set(Math.max(w, d) / 2, 2);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 4.4, d), new THREE.MeshStandardMaterial({ map: t, color: 0x8a93a6, roughness: 0.85 }));
      mesh.position.set(cx, 2.2, cz); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w > d ? w : 0.12, 0.1, w > d ? 0.12 : d), glow('#b6ff00', 1.25));
      strip.position.set(cx, 4.45, cz); group.add(strip);
      return;
    }
    let obj;
    if (barrel) { obj = fitModel(A.sv.barrel, w, 1.15, d); }
    else if (crate) { obj = fitModel(A.sv['box-large'], w, 1.25, d); }
    else {
      obj = new THREE.Group();
      const long = Math.max(w, d), n = Math.max(1, Math.round(long / 5.2)), seg = long / n;
      for (let k = 0; k < n; k++) {
        const c = fitModel(A.ind[containers[(ci++) % 3]], w > d ? seg : w, 2.7, w > d ? d : seg);
        if (w > d) c.position.x = -long / 2 + seg * (k + 0.5); else c.position.z = -long / 2 + seg * (k + 0.5);
        obj.add(c);
      }
    }
    obj.position.set(cx, 0, cz); group.add(obj);
    if (!barrel && !crate) {
      // a glowing edge on top: lime in the middle, each team's colour near its own end
      const left = cx < W * 0.34, right = cx > W * 0.66;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.07, d + 0.04), glow(left ? colors[0] : right ? colors[1] : '#b6ff00', 1.25));
      strip.position.set(cx, 2.74, cz); group.add(strip);
    }
  });

  // skyline: industrial blocks, a water tower and tanks standing round the outside, hazy in the fog
  const names = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g'];
  const N = 22;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + 0.17, rx = W / 2 + 26 + (k % 3) * 7, rz = H / 2 + 22 + ((k + 1) % 3) * 6;
    const nm = k % 11 === 3 ? 'water-tower' : k % 7 === 5 ? 'detail-tank-large' : names[k % names.length];
    const box = new THREE.Box3().setFromObject(A.ind[nm].scene), s = box.getSize(new THREE.Vector3());
    const sc = (nm === 'water-tower' ? 9 : 14 + (k % 4) * 3) / Math.max(s.x, s.z);
    const o = A.ind[nm].scene.clone(true); o.scale.setScalar(sc); o.position.set(W / 2 + Math.cos(a) * rx, 0, H / 2 + Math.sin(a) * rz); o.rotation.y = -a + Math.PI / 2 + (k % 2) * Math.PI;
    group.add(o);
  }
  return { sun, sky };
}
