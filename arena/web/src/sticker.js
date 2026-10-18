// Renders one soldier on a transparent background, one animation frame at a time, for animated stickers (a tool page, not part of the game).
// ?hero=frog|bulldog &w=weapon &clip=name &size=512 ; window.__st.frame(t) poses the soldier at t seconds of the clip and draws.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadAssets, loadGun } from './assets.js';
import { Unit } from './units.js';

const q = new URLSearchParams(location.search);
const SIZE = Number(q.get('size') || 512), team = q.get('team') ? Number(q.get('team')) : q.get('hero') === 'bulldog' ? 1 : 0, weapon = q.get('w') || 'rifle', clip = q.get('clip') || 'Run_and_Shoot';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
const HGT = Number(q.get('h') || SIZE);   // a wide sticker is 512 across and shorter
renderer.setPixelRatio(1); renderer.setSize(SIZE, HGT); renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const dim = Number(q.get('dim') || (q.get('model') ? 0.55 : 1));   // light, dark-coated characters need less light than the green frog did
scene.environmentIntensity = 0.9 * dim;
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x443322, 0.8 * dim));
const key = new THREE.DirectionalLight(0xfff0dc, 2.6 * dim); key.position.set(2.5, 3.5, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xb6ff3c, 2.4); rim.position.set(-3, 2.2, -2.5); scene.add(rim);
const cam = new THREE.PerspectiveCamera(28, SIZE / HGT, 0.1, 50);
const A = await loadAssets(); await loadGun(A, weapon);
if (q.get('model')) {   // a character that is not in the game's list yet: loaded straight from its rigged file, standing in for the first hero
  const g = await new GLTFLoader().loadAsync(`/_stickersrc/${q.get('model')}`);
  g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  A.hero.frog = g; A.heroLo.frog = g;
}
// extra animation files (emotes made for each character): their clips are added by name, the rig is the same
for (const f of (q.get('clips_from') || '').split(',').filter(Boolean)) { const g = await new GLTFLoader().loadAsync(`/_stickersrc/${f}`); A.clips = A.clips.concat(g.animations); }
const unit = new Unit(A, team, weapon, 0xb6ff3c, 0, true);
if (q.get('nogun')) unit.gun.visible = false;
scene.add(unit.root); unit.ring.visible = false; unit.mark.visible = false;
unit.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
let act = unit.acts[clip]; if (!act) throw new Error('no clip ' + clip + ' in ' + Object.keys(unit.acts).join(','));
for (const a of Object.values(unit.acts)) a.stop();
act.reset().setEffectiveWeight(1).play(); act.paused = true;
let dur = act.getClip().duration;
// the same spiky flash the game draws at a barrel
const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d');
const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,236,170,0.95)'); gr.addColorStop(0.5, 'rgba(255,150,40,0.35)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,225,150,0.9)';
for (let i = 0; i < 4; i++) { cx.save(); cx.translate(64, 64); cx.rotate(i * Math.PI / 4 + 0.2); cx.beginPath(); cx.moveTo(-62, 0); cx.lineTo(0, -3.2); cx.lineTo(62, 0); cx.lineTo(0, 3.2); cx.closePath(); cx.fill(); cx.restore(); }
const fx = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.4, 1.1) })); fx.visible = false; scene.add(fx);
window.__st = {
  get dur() { return dur; }, clips: Object.keys(unit.acts),
  setClip(name) { const a = unit.acts[name]; if (!a) throw new Error('no clip ' + name); for (const x of Object.values(unit.acts)) x.stop(); act = a; act.reset().setEffectiveWeight(1).play(); act.paused = true; dur = act.getClip().duration; return dur; },
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
// a second soldier for the chase sticker: a runner crossing the frame with the mascot behind him, firing
let runner = null, rAct = null, rDur = 1;
if (q.get('chase')) {
  runner = new Unit(A, 1, 'pistol', 0xff4040, 0, true); runner.gun.visible = false; runner.ring.visible = false; runner.mark.visible = false;
  runner.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); scene.add(runner.root);
  const rn = Object.keys(runner.acts).find((k) => k.includes('RunFast')); for (const a of Object.values(runner.acts)) a.stop();
  rAct = runner.acts[rn]; rAct.reset().setEffectiveWeight(1).play(); rAct.paused = true; rDur = rAct.getClip().duration;
  const tr = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 1.0), toneMapped: false, transparent: true, opacity: 0.95 })); tr.visible = false; scene.add(tr);
  const cdur = () => unit.acts.Run_and_Shoot.getClip().duration;
  window.__st.chaseSetup = () => { for (const a of Object.values(unit.acts)) a.stop(); act = unit.acts.Run_and_Shoot; act.reset().setEffectiveWeight(1).play(); act.paused = true; dur = act.getClip().duration; };
  window.__st.chase = (t, o = {}) => {
    const yaw = Math.PI / 2 - 0.3, W = o.half ?? 3.5;
    const rx = THREE.MathUtils.lerp(-W, W, (t - 0.0) / 1.9), cx0 = THREE.MathUtils.lerp(-W, W, (t - 0.75) / 1.9);
    runner.root.rotation.y = yaw; runner.root.position.set(rx, 0, 0); rAct.time = (t * 1.1) % rDur; runner.mixer.update(0);
    unit.root.rotation.y = yaw; unit.root.position.set(cx0, 0, 0.05); act.time = (t * 1.0) % dur; unit.mixer.update(0); unit.syncGun();
    runner.root.updateMatrixWorld(true); unit.root.updateMatrixWorld(true);
    const fire = (Math.floor(t * 14) % 2 === 0) && cx0 > -2.3 && cx0 < 2.7;
    fx.visible = fire; tr.visible = fire && rx > -2.0 && rx < 2.6;
    if (fire) {
      const m = new THREE.Vector3(); (unit.muzzleObj ?? unit.gun).getWorldPosition(m); fx.position.copy(m); fx.scale.setScalar(0.38 + 0.1 * Math.sin(t * 90)); fx.material.rotation = t * 40;
      const target = new THREE.Vector3(rx + 0.15, 1.35, 0), d = target.clone().sub(m), L = d.length(); tr.position.copy(m).addScaledVector(d.normalize(), L / 2 + 0.2); tr.scale.set(1, 1, Math.max(0.1, L - 0.4)); tr.lookAt(target);
    }
    const c = new THREE.Vector3(0, o.cy ?? 0.92, 0), r = o.r ?? 1.4, dist = r / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(c.x, c.y + 0.1, c.z + dist); cam.lookAt(c.x, c.y, c.z);
    renderer.render(scene, cam);
  };
}
window.__ready = true;
