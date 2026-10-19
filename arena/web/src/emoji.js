// One spinning thing on a transparent background, a frame at a time, for the animated custom emoji.
// ?size=200&kind=prop&url=/models/props/medkit.glb  (turns round)   ?kind=gun&url=...  (turns round, long side fitted)   ?kind=gunside  (one still, side on, for the loadout cards)
// ?kind=head&url=/models/hero/frog.glb  (the character's head, swinging side to side)   ?kind=crate  (the supply crate)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search), SIZE = Number(q.get('size') || 200), KIND = q.get('kind') || 'prop', URL_ = q.get('url');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE); renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.9;
const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(2, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xb6ff3c, 2.2); rim.position.set(-3, 1, -3); scene.add(rim);
const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 200);

const holder = new THREE.Group(); scene.add(holder);
let model;
if (KIND === 'crate') {
  model = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.62), new THREE.MeshStandardMaterial({ color: 0x7d8c4c, roughness: 0.6, metalness: 0.25 }));
  const band = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, roughness: 0.4, emissive: 0x4a6a10 });
  for (const sx of [-0.28, 0.28]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.64, 0.64), band); b.position.x = sx; model.add(b); }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.66), new THREE.MeshStandardMaterial({ color: 0x3c4828, roughness: 0.5, metalness: 0.4 })); lid.position.y = 0.34;
  model.add(box, lid);
} else {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  model = (await new Promise((res, rej) => loader.load(URL_, res, undefined, rej))).scene;
}
model.updateMatrixWorld(true);
const bb = new THREE.Box3().setFromObject(model), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
let aim = ctr.clone(), span = Math.max(size.x, size.y, size.z) * (KIND === 'gun' || KIND === 'gunside' ? 1.0 : 1.2);
if (KIND === 'head') {
  // the head sits in the top of a standing character: frame that, a little wider than tall so a helmet or ears are not cut
  aim = new THREE.Vector3(ctr.x, bb.max.y - size.y * Number(q.get('hy') || 0.095), ctr.z);
  span = size.y * Number(q.get('hs') || 0.25);
  aim.x += span * Number(q.get('hx') || 0);
}
const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
model.position.sub(aim); holder.add(model);
cam.position.set(0, 0, dist + (KIND === 'head' ? size.z * 0.5 : 0)); cam.lookAt(0, 0, 0);
const tilt = KIND === 'head' ? 0.04 : 0.28;
window.__emoji = {
  frame(u) {
    const a = u * Math.PI * 2;
    if (KIND === 'head') { holder.rotation.y = 0.7 * Math.sin(a); holder.rotation.x = 0.06 * Math.sin(a * 2); holder.position.y = 0.01 * Math.sin(a * 2); }
    else if (KIND === 'gunside') { holder.rotation.y = 0.32; holder.rotation.x = 0.08; holder.rotation.z = 0; }
    else if (KIND === 'gun') { holder.rotation.y = 0.75 * Math.sin(a) - 0.35; holder.rotation.x = 0.1; holder.rotation.z = 0.2; holder.position.y = 0.03 * Math.sin(a * 2) * span; }
    else { holder.rotation.y = a; holder.rotation.x = tilt; holder.position.y = 0.03 * Math.sin(a * 2) * span; }
    renderer.render(scene, cam);
  },
};
window.__ready = true;
