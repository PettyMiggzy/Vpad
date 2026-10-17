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
    const key = `${weapon}|${team}`; if (key === this.key) return false; this.key = key; this.equipT = this.unit ? 0.5 : 0; this.rl = null; this.nd = null;
    if (this.unit) { this.rig.remove(this.unit.root); this.unit.dispose(); }
    this.unit = new Unit(this.A, team, weapon, color, 0, true);
    this.unit.freezeAim();
    const hd = this.unit.body.getObjectByName('Head'); if (hd) { this.headBone = hd; }
    this.unit.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    this.rig.add(this.unit.root);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd870).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.95 }));
    this.muzzle.visible = false; this.scene.add(this.muzzle);
    this.weapon = weapon;
    this.oneHand = weapon === 'pistol';
    return true;
  }
  fire() { this.recoil = 1; this.flash = 0.05; this.kick = (Math.random() - 0.5) * 2; }
  startReload(d) { this.rl = { t: 0, d: Math.max(0.6, d) }; }
  throwNade() { this.nd = { t: 0 }; }
  /** a look movement (pixels): the weapon lags a little behind the turn */
  turned(dx, dy) { this.swayX = Math.max(-0.05, Math.min(0.05, (this.swayX ?? 0) - dx * 0.00012)); this.swayY = Math.max(-0.04, Math.min(0.04, (this.swayY ?? 0) - dy * 0.00012)); }
  update(dt, moving, walkPhase, aspect, hidden) {
    this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.rig.visible = !hidden && !!this.unit;
    this.recoil = Math.max(0, this.recoil - dt * 8); this.flash = Math.max(0, this.flash - dt);
    this.swayX = (this.swayX ?? 0) * Math.pow(0.02, dt); this.swayY = (this.swayY ?? 0) * Math.pow(0.02, dt);
    this.equipT = Math.max(0, (this.equipT ?? 0) - dt);
    if (!this.unit) return;
    const t = this.tune, r = this.unit.root;
    // the arms: the shooting stance, or the middle of a reload or a throw while one is running
    let acting = null;
    if (this.rl) { this.rl.t += dt; if (this.reloading < 0 && this.rl.t > this.rl.d + 0.05) this.rl = null; }
    if (this.rl && this.reloading >= 0) this.rl.t = this.reloading * this.rl.d;
    if (this.rl && this.rl.t >= this.rl.d) this.rl = null;
    if (this.nd) { this.nd.t += dt; if (this.nd.t > 0.9) this.nd = null; }
    if (this.nd) { acting = ['Crouch_Pull_and_Throw', this.nd.t / 0.9]; }
    else if (this.rl) { acting = ['Standing_Reload', this.rl.t / this.rl.d]; }
    if (acting && !this.oneHandOnly) {
      const clip = this.unit.acts[acting[0]], len = clip ? clip.getClip().duration : 1;
      if (!this.unit.pose(acting[0], acting[1] * len)) acting = null;
    } else acting = null;
    if (!acting && this.unit.cur !== 'Walk_Forward_While_Shooting') this.unit.freezeAim();
    // stand the body so its head is at the camera, facing away from it (measured with the viewmodel at rest)
    const rg = this.rig; rg.position.set(0, 0, 0); rg.rotation.set(0, 0, 0); rg.updateMatrixWorld(true);
    r.rotation.set(0, Math.PI + t.yaw, 0); r.position.set(0, 0, 0); r.scale.setScalar(t.scale);
    this.unit.syncGun(t.gunK * (GUN_K[this.weapon] ?? 1)); r.updateMatrixWorld(true);
    const head = this.headBone;
    const la = this.unit.body.getObjectByName('LeftShoulder');
    if (la) la.scale.setScalar(this.oneHand && !acting ? 0.001 : 1);
    if (head) { head.scale.setScalar(1); r.updateMatrixWorld(true); head.getWorldPosition(_h); r.position.set(-_h.x + t.x, -_h.y + t.y, -_h.z + t.z); head.scale.setScalar(0.001); }
    // the whole viewmodel moves about the eye: walking bob, breathing, turn lag, recoil, drawing the weapon
    const tm = performance.now() / 1000;
    const bobX = moving ? Math.sin(walkPhase * 0.5) * 0.012 : Math.sin(tm * 1.3) * 0.002, bobY = moving ? -Math.abs(Math.sin(walkPhase)) * 0.016 : Math.sin(tm * 1.9) * 0.0025;
    // the action clips raise the arm well above the gun: tip the view down while one runs so the hands stay in sight
    const bell = (p) => Math.max(0, Math.min(1, p / 0.15, (1 - p) / 0.15));
    const tip = acting ? (acting[0] === 'Standing_Reload' ? 0.5 : 0.3) * bell(acting[1]) : 0;
    this.spr = (this.spr ?? 0) + ((this.sprinting ? 1 : 0) - (this.spr ?? 0)) * Math.min(1, dt * 9); const spr = this.spr;
    const eq = this.equipT > 0 ? (this.equipT / 0.5) ** 2 : 0;
    const kick = this.recoil * this.recoil;
    rg.position.set(bobX + (this.swayX ?? 0) * 0.6, bobY + (this.swayY ?? 0) * 0.6 - eq * 0.32 - kick * 0.012 - tip * 0.06 - spr * 0.06, kick * 0.07 * (this.weapon === 'shotgun' || this.weapon === 'sniper' ? 1.8 : 1) + eq * 0.05);
    rg.rotation.set(-tip - spr * 0.45 + kick * (0.05 + (this.weapon === 'sniper' ? 0.06 : 0)) + eq * -0.7 + (this.swayY ?? 0), (this.swayX ?? 0) + spr * 0.35 + (this.kick ?? 0) * kick * 0.01, (this.swayX ?? 0) * 0.8 + (this.kick ?? 0) * kick * 0.015);
    rg.updateMatrixWorld(true); this.unit.syncGun(t.gunK * (GUN_K[this.weapon] ?? 1)); rg.updateMatrixWorld(true);
    if (this.muzzle) {
      this.muzzle.visible = this.flash > 0 && !hidden;
      this.unit.gun.getWorldPosition(this.muzzle.position);
      this.muzzle.scale.setScalar(0.8 + Math.random() * 0.7);
      this.flashLight.intensity = this.flash > 0 ? 3 : 0; this.flashLight.position.copy(this.muzzle.position);
    }
  }
}
const _h = new THREE.Vector3();
