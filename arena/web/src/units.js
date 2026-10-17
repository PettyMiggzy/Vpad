// Soldiers: Kenney's animated blocky characters. Legs follow the walk and sprint clips while the arms follow the gun-holding clips,
// so a soldier can run and shoot at once. A team ring and an overhead marker say whose side each one is.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GUN_FILE } from './assets.js';

const LOWER = /^(leg-left|leg-right|root)\./, UPPER = /^(arm-left|arm-right|torso|head)\./;
// who is on which team (looks only): organic fighters for one side, machines and masks for the other
const POOL = [['l', 'o', 'm', 'n', 'f', 'k', 'c', 'a'], ['h', 'g', 'r', 'd', 'j', 'q', 'p', 'e']];
const GUN_LEN = { pistol: 0.36, smg: 0.5, rifle: 0.85, shotgun: 0.8, sniper: 1.05 };
const TWO_HANDED = { pistol: false, smg: true, rifle: true, shotgun: true, sniper: true };
export const UNIT_H = 1.85;

function layer(clip, re, name) {
  const tracks = clip.tracks.filter((t) => re.test(t.name)).map((t) => t.clone());
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

let pick = 0;
export class Unit {
  constructor(A, team, weapon, color, seed) {
    this.team = team; this.weapon = weapon;
    const letter = POOL[team][(typeof seed === 'number' ? seed : pick++) % POOL[team].length];
    const src = A.chars[letter];
    this.root = new THREE.Group();
    this.body = SkeletonUtils.clone(src.scene);
    const box = new THREE.Box3().setFromObject(this.body);
    this.scale = UNIT_H / (box.max.y - box.min.y);
    this.body.scale.multiplyScalar(this.scale);
    this.body.position.y = -box.min.y * this.scale;
    this.root.add(this.body);
    // gun at the chest, arms follow the holding clips
    const gunSrc = A.guns[GUN_FILE[weapon]];
    const len = GUN_LEN[weapon] ?? 0.6;
    const gb = new THREE.Box3().setFromObject(gunSrc.scene), gs = gb.getSize(new THREE.Vector3());
    const k = len / gs.z;
    const gunHolder = new THREE.Group(); gunHolder.add(fitGun(gunSrc, k)); gunHolder.position.set(-0.02, 1.0, 0.36 + len * 0.25); gunHolder.rotation.y = Math.PI;
    this.root.add(gunHolder); this.gunHolder = gunHolder;
    // team marks
    const col = new THREE.Color(color);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.025; this.root.add(this.ring);
    this.mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), toneMapped: false }));
    this.mark.position.y = UNIT_H + 0.45; this.root.add(this.mark);
    // animation layers
    this.mixer = new THREE.AnimationMixer(this.body);
    const by = Object.fromEntries(src.animations.map((c) => [c.name, c]));
    const two = TWO_HANDED[weapon];
    const make = (clip, loop = THREE.LoopRepeat) => { const a = this.mixer.clipAction(clip); a.loop = loop; a.clampWhenFinished = loop === THREE.LoopOnce; a.enabled = true; return a; };
    this.acts = {
      idle: make(layer(by.idle, LOWER, 'idleL')), walk: make(layer(by.walk, LOWER, 'walkL')), sprint: make(layer(by.sprint, LOWER, 'sprintL')),
      hold: make(layer(by[two ? 'holding-both' : 'holding-right'], UPPER, 'holdU')),
      shoot: make(layer(by[two ? 'holding-both-shoot' : 'holding-right-shoot'], UPPER, 'shootU')),
      die: make(by.die, THREE.LoopOnce),
    };
    for (const a of Object.values(this.acts)) a.setEffectiveWeight(0);
    this.cur = null; this.shootT = 0; this.dead = false; this.dieT = 0;
    this.acts.hold.setEffectiveWeight(1).play();
    this.setLower('idle');
    this.mixer.setTime(Math.random() * 2);
  }
  setLower(n) {
    if (this.cur === n) return;
    const next = this.acts[n]; next.reset().setEffectiveWeight(1).play();
    if (this.cur) this.acts[this.cur].crossFadeTo(next, 0.18, false);
    this.cur = n;
  }
  /** speed in metres a second; firing true on the frame a shot goes off */
  update(dt, speed, firing, alive, t) {
    if (!alive) {
      if (!this.dead) { this.dead = true; this.dieT = 0; for (const a of Object.values(this.acts)) a.setEffectiveWeight(0); this.acts.die.reset().setEffectiveWeight(1).play(); }
      this.dieT += dt; this.mixer.update(dt);
      this.ring.visible = false; this.mark.visible = false; this.gunHolder.visible = this.dieT < 0.4;
      return;
    }
    if (this.dead) { this.dead = false; this.acts.die.stop(); this.cur = null; this.acts.hold.setEffectiveWeight(1).reset().play(); this.ring.visible = true; this.mark.visible = true; this.gunHolder.visible = true; }
    this.setLower(speed < 0.3 ? 'idle' : speed < 3.3 ? 'walk' : 'sprint');
    this.shootT = firing ? 0.2 : Math.max(0, this.shootT - dt);
    const sh = this.shootT > 0 ? 1 : 0;
    this.acts.shoot.setEffectiveWeight(sh); this.acts.hold.setEffectiveWeight(1 - sh);
    if (sh && !this.acts.shoot.isRunning()) this.acts.shoot.reset().play();
    this.mixer.update(dt);
    this.mark.position.y = UNIT_H + 0.45 + Math.sin(t * 3 + this.root.id) * 0.05; this.mark.rotation.y = t * 2;
  }
  dispose() { this.root.removeFromParent(); this.root.traverse((o) => { if (o.isMesh && (o.material.isMeshBasicMaterial)) { o.geometry.dispose(); o.material.dispose(); } }); }
}

function fitGun(gunSrc, k) {
  const o = gunSrc.scene.clone(true); o.scale.setScalar(k);
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
  o.position.sub(c);
  const g = new THREE.Group(); g.add(o); return g;
}
