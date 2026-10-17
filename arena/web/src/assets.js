// Loads the 3D models (generated soldiers, weapons and map props), the Poly Haven ground textures and sky panoramas.
// The soldiers and weapons load once; each map pulls in only the props, textures and sky it uses.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL;
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, () => rej(new Error('could not load ' + url))));

function shade(root) { root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; for (const m of [].concat(o.material)) if (m.map) m.map.anisotropy = 8; } }); }
function shadeProp(root) { root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) if (m.map) m.map.anisotropy = 8; } }); }

export const GUN_FILE = { pistol: 'a', smg: 'j', rifle: 'd', shotgun: 'l', sniper: 'e' };

export async function loadAssets(onProgress = () => {}) {
  const A = { hero: {}, clips: null, gunsH: {}, props: {}, tex: {}, hdr: {} };
  const jobs = [];
  let done = 0;
  const add = (p) => { jobs.push(p); p.then(() => onProgress(done += 1, jobs.length)); return p; };
  // the generated 3D soldiers (one rig, shared animation clips) and the generated weapons
  for (const c of ['frog', 'bulldog']) add(load(`${BASE}models/hero/${c}.glb`).then((g) => { shade(g.scene); A.hero[c] = g; }));
  add(load(`${BASE}models/hero/clips.glb`).then((g) => { A.clips = g.animations; }));
  for (const w of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) add(load(`${BASE}models/hero/gun_${w}.glb`).then((g) => { shade(g.scene); A.gunsH[w] = g; }));
  await Promise.all(jobs);
  return A;
}

/** pulls in what one map needs: { props: [names], tex: [names], hdr: name } */
export async function loadMapAssets(A, need, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const add = (p) => { jobs.push(p); p.then(() => onProgress(done += 1, jobs.length)); return p; };
  for (const n of need.props) if (!A.props[n]) A.props[n] = null, add(load(`${BASE}models/props/${n}.glb`).then((g) => { shadeProp(g.scene); A.props[n] = g; }));
  const tl = new THREE.TextureLoader();
  for (const n of need.tex) {
    if (A.tex[n]) continue;
    A.tex[n] = null;
    add(Promise.all(['diff', 'nor', 'rough'].map((k) => tl.loadAsync(`${BASE}tex/${n}_${k}.webp`))).then(([d, nr, r]) => {
      for (const t of [d, nr, r]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
      d.colorSpace = THREE.SRGBColorSpace;
      A.tex[n] = { map: d, normalMap: nr, roughnessMap: r };
    }));
  }
  if (need.hdr && !A.hdr[need.hdr]) { A.hdr[need.hdr] = null; add(new RGBELoader().loadAsync(`${BASE}hdr/${need.hdr}.hdr`).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; A.hdr[need.hdr] = t; })); }
  await Promise.all(jobs);
}

/** a clone of a model scaled to fit w, h, d (metres), standing on y=0, centred on x/z; turned a quarter if its long side runs the other way */
export function fitModel(gltf, w, h, d, uniform = false) {
  const o = gltf.scene.clone(true), g = new THREE.Group();
  g.add(o);
  let box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
  if ((size.x > size.z * 1.15) !== (w > d * 1.15) && Math.abs(size.x - size.z) > 0.2) { o.rotation.y = Math.PI / 2; box = new THREE.Box3().setFromObject(g); size = box.getSize(new THREE.Vector3()); }
  const c = box.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -box.min.y, -c.z);
  const out = new THREE.Group(); out.add(g);
  if (uniform) out.scale.setScalar(Math.min(w / size.x, h / size.y, d / size.z));
  else out.scale.set(w / size.x, h / size.y, d / size.z);
  return out;
}

/** a clone scaled evenly to a height, standing on y=0, centred on x/z */
export function propHeight(gltf, h) {
  const o = gltf.scene.clone(true), g = new THREE.Group(); g.add(o);
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -box.min.y, -c.z);
  const out = new THREE.Group(); out.add(g); out.scale.setScalar(h / size.y);
  return out;
}
