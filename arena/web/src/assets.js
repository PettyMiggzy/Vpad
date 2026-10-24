// Loads the 3D models (generated soldiers, weapons and map props), the Poly Haven ground textures and sky panoramas.
// The soldiers and weapons load once; each map pulls in only the props, textures and sky it uses.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL;
// phones get the lighter set (smaller textures and sky, `-m` folders): a phone browser gives up on a page that holds hundreds of megabytes of pictures.
// ?lite=1 forces it, ?lite=0 turns it off.
export const LITE = (() => {
  if (import.meta.env.VITE_LITE === '1') return true;   // the store apps carry only the light set
  const q = new URLSearchParams(location.search).get('lite');
  if (q === '1') return true;
  if (q === '0') return false;
  try { return matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4); } catch { return false; }
})();
const S = LITE ? '-m' : '';
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
/** runs a download again when a phone's connection drops it (mobile data and in-app browsers fail a file now and then); gives up after three tries */
export async function retrying(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
}
const load = (url) => retrying(() => new Promise((res, rej) => loader.load(url, res, undefined, () => rej(new Error('could not load ' + url)))));

function shade(root) { root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; for (const m of [].concat(o.material)) if (m.map) m.map.anisotropy = 8; } }); }
// a generated model's metal reflects the sky and the ground only, so a flat face turned away from the sun reads as a black mirror: keep the metal shine, but never a full mirror
function shadeProp(root) { root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) { if (m.map) m.map.anisotropy = 8; if (m.metalness > 0.5) m.metalness = 0.5; if (m.roughness < 0.6) m.roughness = 0.6; } } }); }

export const EXTRA_HEROES = ['ape'];
export const WEAPON_IDS = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'revolver', 'burst', 'lmg', 'autosg', 'dmr', 'mp', 'pdw', 'br', 'amr'];
export const GUN_FILE = { pistol: 'a', smg: 'j', rifle: 'd', shotgun: 'l', sniper: 'e' };

/** the first-person model of one weapon, loaded when it is first carried (ten of them at once would be hundreds of megabytes of pictures) */
export function loadGun(A, w) {
  if (A.gunsH[w]) return Promise.resolve(A.gunsH[w]);
  A.gunWait ??= {};
  return (A.gunWait[w] ??= load(`${BASE}models${S}/hero/gun_${w}.glb`).then((g) => { shade(g.scene); A.gunsH[w] = g; return g; }).catch(() => null));
}

function freeTextures(root) {
  root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose(); });
}
/** drops what the map before this one used and this one does not, so only one map's pictures sit in graphics memory */
function release(A, need) {
  for (const n of Object.keys(A.props)) if (!need.props.includes(n)) { if (A.props[n]) freeTextures(A.props[n].scene); delete A.props[n]; }
  for (const n of Object.keys(A.tex)) if (!need.tex.includes(n)) { for (const t of Object.values(A.tex[n] || {})) t.dispose(); delete A.tex[n]; }
  for (const n of Object.keys(A.hdr)) if (n !== need.hdr) { A.hdr[n]?.dispose(); delete A.hdr[n]; }
}

export async function loadAssets(onProgress = () => {}) {
  const A = { hero: {}, heroLo: {}, clips: null, gunsH: {}, gunsLo: {}, props: {}, floor: {}, tex: {}, hdr: {} };
  const jobs = [];
  let done = 0;
  const add = (p) => { jobs.push(p); p.then(() => onProgress(done += 1, jobs.length)); return p; };
  // the generated 3D soldiers (one rig, shared animation clips) and the generated weapons
  for (const c of ['frog', 'bulldog']) add(load(`${BASE}models${S}/hero/${c}.glb`).then((g) => { shade(g.scene); A.hero[c] = g; }));
  // lighter copies for the crowd: only your own arms and weapon need every triangle
  for (const c of ['frog', 'bulldog']) add(load(`${BASE}models${S}/hero/${c}_lo.glb`).then((g) => { shade(g.scene); A.heroLo[c] = g; }));
  // more characters for the crowd (bots and other players): only the light copy, since your own arms are always the first two
  for (const c of EXTRA_HEROES) add(load(`${BASE}models${S}/hero/${c}_lo.glb`).then((g) => { shade(g.scene); A.heroLo[c] = g; A.hero[c] = g; }));
  for (const w of WEAPON_IDS) add(load(`${BASE}models${S}/hero/gun_${w}_lo.glb`).then((g) => { shade(g.scene); A.gunsLo[w] = g; }));
  // the ammunition box and the med kit that lie about the maps
  for (const n of ['ammo_box', 'medkit']) add(load(`${BASE}models${S}/props/${n}.glb`).then((g) => { shadeProp(g.scene); A.floor[n] = g; }).catch(() => null));
  const clipSets = [];
  for (const f of ['clips', 'clips2', 'clips3']) add(load(`${BASE}models${S}/hero/${f}.glb`).then((g) => { clipSets[['clips', 'clips2', 'clips3'].indexOf(f)] = g.animations; }));
  await Promise.all(jobs);
  A.clips = clipSets.flat();
  return A;
}

/** pulls in what one map needs: { props: [names], tex: [names], hdr: name } */
export async function loadMapAssets(A, need, onProgress = () => {}) {
  release(A, need);
  const jobs = [];
  let done = 0;
  const add = (p) => { jobs.push(p); p.then(() => onProgress(done += 1, jobs.length)); return p; };
  for (const n of need.props) if (!A.props[n]) A.props[n] = null, add(load(`${BASE}models${S}/props/${n}.glb`).then((g) => { shadeProp(g.scene); A.props[n] = g; }));
  const tl = new THREE.TextureLoader();
  for (const n of need.tex) {
    if (A.tex[n]) continue;
    A.tex[n] = null;
    add(Promise.all(['diff', 'nor', 'rough'].map((k) => retrying(() => tl.loadAsync(`${BASE}tex${S}/${n}_${k}.webp`)))).then(([d, nr, r]) => {
      for (const t of [d, nr, r]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
      d.colorSpace = THREE.SRGBColorSpace;
      A.tex[n] = { map: d, normalMap: nr, roughnessMap: r };
    }));
  }
  if (need.hdr && !A.hdr[need.hdr]) { A.hdr[need.hdr] = null; add(retrying(() => new RGBELoader().loadAsync(`${BASE}hdr${S}/${need.hdr}.hdr`)).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; A.hdr[need.hdr] = t; })); }
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
