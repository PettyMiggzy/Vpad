// The weapon in your hands: drawn in its own scene on top of the world, so it never sinks into a wall.
import * as THREE from 'three';
import { Unit } from './units.js';

// how much bigger than life each weapon is drawn in the hands, so it fills the view like a real shooter's

const GUN_K = { pistol: 0.78, smg: 0.95, rifle: 1, shotgun: 1, sniper: 0.95 };

export class ViewModel {
  constructor(A) {
    this.A = A;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.02, 10);
    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x554433, 1.4));
    const l = new THREE.DirectionalLight(0xffd2a0, 2.6); l.position.set(0.5, 1, 0.6); this.scene.add(l);
    this.rig = new THREE.Group(); this.scene.add(this.rig);     // the soldier's own body, seen from inside the head: arms on the weapon
    this.flashLight = new THREE.PointLight(0xffd080, 0, 3, 2); this.scene.add(this.flashLight);
    this.recoil = 0; this.flash = 0; this.key = ''; this.unit = null; this.muzzle = null;
    this.tune = { x: -0.04, y: -0.08, z: 0.0, yaw: 0, scale: 0.6, gunK: 1.35 };
  }
  set(weapon, team, color) {
    const key = `${weapon}|${team}`; if (key === this.key) return; this.key = key;
    if (this.unit) { this.rig.remove(this.unit.root); this.unit.dispose(); }
    this.unit = new Unit(this.A, team, weapon, color);
    this.unit.freezeAim();
    const hd = this.unit.body.getObjectByName('Head'); if (hd) { this.headBone = hd; }
    this.unit.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    this.rig.add(this.unit.root);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd870).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.95 }));
    this.muzzle.visible = false; this.scene.add(this.muzzle);
    this.weapon = weapon;
    this.oneHand = weapon === 'pistol';
  }
  fire() { this.recoil = 1; this.flash = 0.05; }
  update(dt, moving, walkPhase, aspect, hidden, pitch = 0) {
    this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.rig.visible = !hidden && !!this.unit;
    this.recoil = Math.max(0, this.recoil - dt * 9); this.flash = Math.max(0, this.flash - dt);
    if (!this.unit) return;
    const t = this.tune, r = this.unit.root;
    // stand the body so its head is at the camera, facing away from it
    r.rotation.set(0, Math.PI + t.yaw, 0); r.position.set(0, 0, 0); r.scale.setScalar(t.scale);
    this.unit.syncGun(t.gunK * (GUN_K[this.weapon] ?? 1)); r.updateMatrixWorld(true);
    const head = this.headBone;
    const la = this.unit.body.getObjectByName('LeftShoulder');
    if (la) la.scale.setScalar(this.oneHand ? 0.001 : 1);
    if (head) { head.scale.setScalar(1); r.updateMatrixWorld(true); head.getWorldPosition(_h); r.position.set(-_h.x + t.x, -_h.y + t.y, -_h.z + t.z); head.scale.setScalar(0.001); }
    const bob = moving ? Math.sin(walkPhase) * 0.01 : 0;
    r.position.y += bob + Math.abs(Math.sin(walkPhase)) * (moving ? 0.01 : 0) - this.recoil * 0.015;
    r.position.z += this.recoil * 0.06;
    r.rotation.x = this.recoil * 0.04;
    this.unit.syncGun(t.gunK * (GUN_K[this.weapon] ?? 1)); r.updateMatrixWorld(true);
    if (this.muzzle) {
      this.muzzle.visible = this.flash > 0 && !hidden;
      this.unit.gun.getWorldPosition(this.muzzle.position);
      this.muzzle.scale.setScalar(0.8 + Math.random() * 0.7);
      this.flashLight.intensity = this.flash > 0 ? 3 : 0; this.flashLight.position.copy(this.muzzle.position);
    }
  }
}
const _h = new THREE.Vector3();
