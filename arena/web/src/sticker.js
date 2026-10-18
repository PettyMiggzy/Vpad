// Renders one soldier on a transparent background, one animation frame at a time, for animated stickers (a tool page, not part of the game).
// ?hero=frog|bulldog &w=weapon &clip=name &size=512 ; window.__st.frame(t) poses the soldier at t seconds of the clip and draws.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadAssets, loadGun } from './assets.js';
import { Unit } from './units.js';

const q = new URLSearchParams(location.search);
const SIZE = Number(q.get('size') || 512), team = q.get('team') ? Number(q.get('team')) : q.get('hero') === 'bulldog' ? 1 : 0, weapon = q.get('w') || 'rifle', clip = q.get('clip') || 'Run_and_Shoot';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE); renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const dim = Number(q.get('dim') || (q.get('hero') === 'ape' ? 0.55 : 1));   // light, dark-coated characters need less light than the green frog did
scene.environmentIntensity = 0.9 * dim;
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x443322, 0.8 * dim));
const key = new THREE.DirectionalLight(0xfff0dc, 2.6 * dim); key.position.set(2.5, 3.5, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xb6ff3c, 2.4); rim.position.set(-3, 2.2, -2.5); scene.add(rim);
const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
const A = await loadAssets(); await loadGun(A, weapon);
if (q.get('hero') === 'ape') {   // a character that is not in the game's list yet: loaded straight from its rigged file, standing in for the first hero
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync(`/models/hero/${q.get('file') || '_ape_raw.glb'}`);
  g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  A.hero.frog = g; A.heroLo.frog = g;
}
const unit = new Unit(A, team, weapon, 0xb6ff3c, 0, true);
scene.add(unit.root); unit.ring.visible = false; unit.mark.visible = false;
unit.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
const act = unit.acts[clip]; if (!act) throw new Error('no clip ' + clip + ' in ' + Object.keys(unit.acts).join(','));
for (const a of Object.values(unit.acts)) a.stop();
act.reset().setEffectiveWeight(1).play(); act.paused = true;
const dur = act.getClip().duration;
// the same spiky flash the game draws at a barrel
const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d');
const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,236,170,0.95)'); gr.addColorStop(0.5, 'rgba(255,150,40,0.35)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,225,150,0.9)';
for (let i = 0; i < 4; i++) { cx.save(); cx.translate(64, 64); cx.rotate(i * Math.PI / 4 + 0.2); cx.beginPath(); cx.moveTo(-62, 0); cx.lineTo(0, -3.2); cx.lineTo(62, 0); cx.lineTo(0, 3.2); cx.closePath(); cx.fill(); cx.restore(); }
const fx = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.4, 1.1) })); fx.visible = false; scene.add(fx);
window.__st = {
  dur, clips: Object.keys(unit.acts),
  frame(t, o = {}) {
    act.time = Math.min(Math.max(0, t), dur - 1e-3); unit.mixer.update(0);
    const yaw = (o.yaw ?? 0.55); unit.root.rotation.y = yaw; unit.root.position.set(o.x ?? 0, o.y ?? 0, 0);
    unit.syncGun(); unit.root.updateMatrixWorld(true);
    const c = new THREE.Vector3(o.cx ?? 0, o.cy ?? 0.95, 0), r = o.r ?? 1.08, dist = r / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(c.x + dist * 0.2, c.y + 0.1, c.z + dist); cam.lookAt(c.x, c.y, c.z);
    fx.visible = !!o.flash; if (o.flash) { (unit.muzzleObj ?? unit.gun).getWorldPosition(fx.position); fx.scale.setScalar(o.flash * 0.5); fx.material.rotation = o.flash * 3; }
    renderer.render(scene, cam);
  },
  box() { const b = new THREE.Box3().setFromObject(unit.root); return [b.min.toArray(), b.max.toArray()]; },
};
window.__ready = true;
