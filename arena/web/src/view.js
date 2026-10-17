// The weapon in your hands: drawn in its own scene on top of the world, so it never sinks into a wall.
import * as THREE from 'three';
import { GUN_FILE } from './assets.js';

const LEN = { pistol: 0.34, smg: 0.46, rifle: 0.72, shotgun: 0.7, sniper: 0.92 };

export class ViewModel {
  constructor(A) {
    this.A = A;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(58, 1, 0.02, 10);
    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x554433, 1.5));
    const l = new THREE.DirectionalLight(0xffd2a0, 2.4); l.position.set(0.5, 1, 0.6); this.scene.add(l);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.kick = new THREE.Group(); this.root.add(this.kick);
    this.flashLight = new THREE.PointLight(0xffd080, 0, 3, 2); this.scene.add(this.flashLight);
    this.recoil = 0; this.flash = 0; this.key = '';
  }
  set(weapon, teamColor, sleeve) {
    const key = `${weapon}|${teamColor}`; if (key === this.key) return; this.key = key;
    while (this.kick.children.length) this.kick.remove(this.kick.children[0]);
    const g = this.A.guns[GUN_FILE[weapon]], o = g.scene.clone(true);
    const b0 = new THREE.Box3().setFromObject(o), s0 = b0.getSize(new THREE.Vector3());
    o.scale.setScalar((LEN[weapon] ?? 0.5) / s0.z);
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()); o.position.sub(c);
    o.traverse((x) => { if (x.isMesh) { x.castShadow = false; x.receiveShadow = false; } });
    const gun = new THREE.Group(); gun.add(o); gun.rotation.y = Math.PI;       // the model's muzzle points back, turn it away from you
    gun.position.set(0.2, -0.22, -0.5 - (LEN[weapon] ?? 0.5) * 0.18);
    this.kick.add(gun); this.gun = gun;
    // blocky arms in the team colour with bare hands
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a37c, roughness: 0.9 }), cloth = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.8 });
    const arm = (x, z, ry, len = 0.5) => {
      const a = new THREE.Group();
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), cloth); sl.position.z = len / 2;
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.12), skin); hd.position.z = -0.03;
      a.add(sl, hd); a.position.set(x, -0.27, z); a.rotation.y = ry; a.rotation.x = 0.12; return a;
    };
    this.kick.add(arm(0.27, -0.33, 0.1, 0.55));
    if (weapon !== 'pistol') this.kick.add(arm(0.06, -0.5 - (LEN[weapon] ?? 0.5) * 0.28, -0.32, 0.5));
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd870).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.95 }));
    this.muzzle.position.set(0.2, -0.2, -0.5 - (LEN[weapon] ?? 0.5) * 0.7); this.muzzle.visible = false; this.kick.add(this.muzzle);
  }
  fire() { this.recoil = 1; this.flash = 0.05; }
  update(dt, moving, walkPhase, aspect, hidden) {
    this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.root.visible = !hidden;
    this.recoil = Math.max(0, this.recoil - dt * 9); this.flash = Math.max(0, this.flash - dt);
    const bx = moving ? Math.sin(walkPhase) * 0.012 : 0, by = moving ? Math.abs(Math.cos(walkPhase)) * 0.014 : 0;
    this.kick.position.set(bx, by, this.recoil * 0.07); this.kick.rotation.x = this.recoil * 0.05;
    if (this.muzzle) { this.muzzle.visible = this.flash > 0; this.muzzle.scale.setScalar(0.8 + Math.random() * 0.7); }
    this.flashLight.intensity = this.flash > 0 ? 3 : 0; if (this.muzzle) this.flashLight.position.copy(this.muzzle.getWorldPosition(new THREE.Vector3()));
  }
}
