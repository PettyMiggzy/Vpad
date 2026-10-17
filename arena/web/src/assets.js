// Loads the 3D models (Kenney's CC0 blocky characters, blasters and kits) and the floor textures once.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL + 'models/';
const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, () => rej(new Error('could not load ' + url))));

/** crisp palette textures: the models are made of flat colours and pixels */
function crisp(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of [].concat(o.material)) if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestMipmapLinearFilter; m.map.anisotropy = 4; }
  });
}

export const GUN_FILE = { pistol: 'a', smg: 'j', rifle: 'd', shotgun: 'l', sniper: 'e' };

export async function loadAssets(onProgress = () => {}) {
  const A = { chars: {}, guns: {}, ind: {}, sv: {}, tex: {} };
  const jobs = [];
  const add = (p) => { jobs.push(p); p.then(() => onProgress(done += 1, jobs.length)); return p; };
  let done = 0;
  for (const c of 'abcdefghijklmnopqr') add(load(`${BASE}char/character-${c}.glb`).then((g) => { crisp(g.scene); A.chars[c] = g; }));
  for (const g of new Set(Object.values(GUN_FILE))) add(load(`${BASE}gun/blaster-${g}.glb`).then((x) => { crisp(x.scene); A.guns[g] = x; }));
  for (const n of ['shipping-container-a', 'shipping-container-b', 'shipping-container-c', 'building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'water-tower', 'detail-tank', 'detail-tank-large', 'chimney-large'])
    add(load(`${BASE}ind/${n}.glb`).then((x) => { crisp(x.scene); A.ind[n] = x; }));
  for (const n of ['barrel', 'box-large', 'box']) add(load(`${BASE}sv/${n}.glb`).then((x) => { crisp(x.scene); A.sv[n] = x; }));
  const tl = new THREE.TextureLoader();
  for (const n of ['dark1', 'light1', 'orange1']) add(tl.loadAsync(`${import.meta.env.BASE_URL}tex/${n}.png`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; A.tex[n] = t; }));
  await Promise.all(jobs);
  return A;
}

/** a clone of a model scaled to fit w, h, d (metres), standing on y=0, centred on x/z; turned a quarter if its long side runs the other way */
export function fitModel(gltf, w, h, d) {
  const o = gltf.scene.clone(true), g = new THREE.Group();
  g.add(o);
  let box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
  if ((size.x > size.z * 1.15) !== (w > d * 1.15) && Math.abs(size.x - size.z) > 0.2) { o.rotation.y = Math.PI / 2; box = new THREE.Box3().setFromObject(g); size = box.getSize(new THREE.Vector3()); }
  const c = box.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -box.min.y, -c.z);
  const out = new THREE.Group(); out.add(g);
  out.scale.set(w / size.x, h / size.y, d / size.z);
  return out;
}
