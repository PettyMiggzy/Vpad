// Soldiers: generated 3D characters (one shared 24-bone rig, so one set of animation clips fits all of them) holding generated weapons.
// A team ring and an overhead marker say whose side each one is.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const UNIT_H = 1.85;
const POOL = [['frog'], ['bulldog']];
const GUN_LEN = { pistol: 0.32, smg: 0.62, rifle: 0.95, shotgun: 0.95, sniper: 1.25 };
// where the weapon sits in the right hand (tuned by eye; live-editable from the console while testing)
export const GUN_OFFSET = { pos: [0, 0.03, 0.2], rot: [0, 0.34, 0], k: 1 };

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _o = new THREE.Matrix4(), _e = new THREE.Euler();

export class Unit {
  constructor(A, team, weapon, color, seed) {
    this.team = team; this.weapon = weapon;
    const names = POOL[team];
    const src = A.hero[names[(typeof seed === 'number' ? seed : 0) % names.length]];
    this.root = new THREE.Group();
    this.body = SkeletonUtils.clone(src.scene);
    this.root.add(this.body);
    this.root.updateMatrixWorld(true);
    // which way is the front of this model? the rig has a 'headfront' marker ahead of the head: turn the body so that is +Z
    const hf = this.body.getObjectByName('headfront'), hd = this.body.getObjectByName('Head');
    if (hf && hd) { const a = new THREE.Vector3(), b = new THREE.Vector3(); hf.getWorldPosition(a); hd.getWorldPosition(b); this.body.rotation.y = -Math.atan2(a.x - b.x, a.z - b.z); this.root.updateMatrixWorld(true); this.front = this.body.rotation.y; }
    const box = new THREE.Box3().setFromObject(this.body);
    this.scale = UNIT_H / (box.max.y - box.min.y);
    this.body.scale.multiplyScalar(this.scale);
    this.body.position.y = -box.min.y * this.scale;
    // weapon
    const gunSrc = A.gunsH[weapon];
    this.gun = new THREE.Group();
    const g = gunSrc.scene.clone(true);
    const gb = new THREE.Box3().setFromObject(g), gs = gb.getSize(new THREE.Vector3()), gc = gb.getCenter(new THREE.Vector3());
    const long = Math.max(gs.x, gs.y, gs.z);
    g.position.sub(gc); g.scale.setScalar((GUN_LEN[weapon] ?? 0.8) / long);
    this.gunInner = new THREE.Group(); this.gunInner.add(g); this.gun.add(this.gunInner);
    this.gun.matrixAutoUpdate = false; this.root.add(this.gun);
    this.hand = this.body.getObjectByName('RightHand');
    // team marks
    const col = new THREE.Color(color);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.025; this.root.add(this.ring);
    this.mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), toneMapped: false }));
    this.mark.position.y = UNIT_H + 0.45; this.root.add(this.mark);
    // animation
    this.mixer = new THREE.AnimationMixer(this.body);
    this.acts = {};
    for (const c of A.clips) {
      const a = this.mixer.clipAction(c);
      if (c.name.startsWith('Shot_and_Fall')) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }
      this.acts[c.name] = a;
    }
    this.cur = null; this.dead = false; this.dieT = 0; this.flash = 0;
    this.play('Idle'); this.mixer.setTime(Math.random() * 3);
  }
  play(name, fade = 0.18) {
    if (this.cur === name) return;
    const next = this.acts[name]; if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.cur) this.acts[this.cur].crossFadeTo(next, fade, false);
    this.cur = name;
  }
  /** speed in metres a second, back true when moving away from where it faces */
  update(dt, speed, firing, alive, t, back = false) {
    if (!alive) {
      if (!this.dead) { this.dead = true; this.dieT = 0; this.cur = null; for (const a of Object.values(this.acts)) a.stop(); this.play('Shot_and_Fall_Backward', 0.05); }
      this.dieT += dt; this.mixer.update(dt);
      this.ring.visible = false; this.mark.visible = false; this.syncGun(); this.gun.visible = this.dieT < 2.5;
      return;
    }
    if (this.dead) { this.dead = false; for (const a of Object.values(this.acts)) a.stop(); this.cur = null; this.ring.visible = true; this.mark.visible = true; this.gun.visible = true; }
    this.play(speed < 0.35 ? 'Idle' : back ? 'Walk_Backward_While_Shooting' : speed < 3.2 ? 'Walk_Forward_While_Shooting' : 'Run_and_Shoot');
    this.mixer.update(dt);
    this.syncGun();
    this.mark.position.y = UNIT_H + 0.45 + Math.sin(t * 3 + this.root.id) * 0.05; this.mark.rotation.y = t * 2;
  }
  /** first person: freeze the shooting stance (arms raised on the weapon) at one moment of the clip */
  freezeAim(name = 'Walk_Forward_While_Shooting', at = 0.8) {
    for (const a of Object.values(this.acts)) a.stop();
    const a = this.acts[name]; a.reset().setEffectiveWeight(1).play(); a.paused = true; a.time = at; this.cur = name; this.mixer.update(0);
    this.ring.visible = false; this.mark.visible = false;
  }
  /** the weapon sits at the right hand and always points the way the soldier faces (independent of how the bone is turned) */
  syncGun(kMul = 1) {
    if (!this.hand) return;
    this.root.updateMatrixWorld(true);
    _inv.copy(this.root.matrixWorld).invert();
    _m.copy(this.hand.matrixWorld).premultiply(_inv);
    _p.setFromMatrixPosition(_m);
    const gp = GUN_OFFSET.pos, k = GUN_OFFSET.k * kMul;
    _e.set(GUN_OFFSET.rot[0], GUN_OFFSET.rot[1] - Math.PI / 2, GUN_OFFSET.rot[2]);
    _q.setFromEuler(_e);
    _o.compose(new THREE.Vector3(_p.x + gp[0], _p.y + gp[1], _p.z + gp[2]), _q, new THREE.Vector3(k, k, k));
    this.gun.matrix.copy(_o);
    this.gun.matrixWorldNeedsUpdate = true;
  }
  dispose() { this.root.removeFromParent(); this.root.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) { o.geometry.dispose(); o.material.dispose(); } }); }
}
