// The weapon in your hands: drawn in its own scene on top of the world, so it never sinks into a wall.
import * as THREE from 'three';
import { Unit } from './units.js';

// how much bigger than life each weapon is drawn in the hands, so it fills the view like a real shooter's

const GUN_K = { pistol: 1.0, smg: 0.85, rifle: 0.85, shotgun: 0.85, sniper: 0.75, revolver: 1.0, burst: 0.85, lmg: 0.8, autosg: 0.85, dmr: 0.8 };

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
    this.ads = 0; this.adsS = 0;                 // how far the sights are up (set from the rules), and the smoothed copy that moves the gun
    this.holeU = { uAds: { value: 0 }, uHole: { value: new THREE.Vector3(0, 0, 0) }, uAsp: { value: 1 } };   // the window cut through the sight when aimed: where the eye looks through the glass
    this.shells = []; this.shellGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.026, 6);
    this.brass = new THREE.MeshStandardMaterial({ color: 0xd4a437, metalness: 0.9, roughness: 0.35 });
    this.red = new THREE.MeshStandardMaterial({ color: 0xb02a20, metalness: 0.2, roughness: 0.6 });
  }
  set(weapon, team, color) {
    const key = `${weapon}|${team}`; if (key === this.key) return false; this.key = key; this.equipT = this.unit ? 0.5 : 0; this.rl = null; this.nd = null;
    if (this.unit) { this.rig.remove(this.unit.root); this.unit.dispose(); }
    this.unit = new Unit(this.A, team, weapon, color, 0, true);
    this.unit.freezeAim();
    this.windowize(this.unit.gunInner);
    const hd = this.unit.body.getObjectByName('Head'); if (hd) { this.headBone = hd; }
    this.unit.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    this.rig.add(this.unit.root);
    // a flash that looks like one: a hot white core with four spikes, added to the picture (not a solid ball), drawn once into a small texture
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,236,170,0.95)'); gr.addColorStop(0.5, 'rgba(255,150,40,0.35)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,225,150,0.9)';
    for (let i = 0; i < 4; i++) { cx.save(); cx.translate(64, 64); cx.rotate(i * Math.PI / 4 + 0.2); cx.beginPath(); cx.moveTo(-62, 0); cx.lineTo(0, -3.2); cx.lineTo(62, 0); cx.lineTo(0, 3.2); cx.closePath(); cx.fill(); cx.restore(); }
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.4, 1.1) }));
    this.muzzle.visible = false; this.scene.add(this.muzzle);
    this.weapon = weapon;
    this.oneHand = weapon === 'pistol' || weapon === 'revolver';
    return true;
  }
  /** aimed, the glass of a red-dot or scope is see-through: cut a small round window out of the gun (all of it along the line of sight) so the target shows through the sight */
  windowize(root) {
    const U = this.holeU;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const wrap = (m) => {
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (sh, rr) => {
          if (prev) prev(sh, rr);
          sh.uniforms.uAds = U.uAds; sh.uniforms.uHole = U.uHole; sh.uniforms.uAsp = U.uAsp;
          sh.vertexShader = 'varying vec2 vNdc;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vNdc = gl_Position.xy / gl_Position.w;');
          sh.fragmentShader = 'varying vec2 vNdc;\nuniform float uAds; uniform vec3 uHole; uniform float uAsp;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (uAds > 0.6 && length((vNdc - uHole.xy) * vec2(uAsp, 1.0)) < uHole.z) discard;');
        };
        const key = m.customProgramCacheKey; m.customProgramCacheKey = () => (key ? key.call(m) : '') + 'win';
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(wrap) : wrap(o.material);
    });
  }
  fire() { this.recoil = 1; this.flash = 0.05; this.kick = (Math.random() - 0.5) * 2; if (this.weapon !== 'revolver' && this.weapon !== 'sniper') this.eject = true; }
  startReload(d) { this.rl = { t: 0, d: Math.max(0.6, d) }; }
  throwNade() { this.nd = { t: 0 }; }
  /** the knife: the arms play a slash */
  stab() { this.sb = { t: 0 }; }
  /** a look movement (pixels): the weapon lags a little behind the turn */
  turned(dx, dy) { this.swayX = Math.max(-0.05, Math.min(0.05, (this.swayX ?? 0) - dx * 0.00012)); this.swayY = Math.max(-0.04, Math.min(0.04, (this.swayY ?? 0) - dy * 0.00012)); }
  update(dt, moving, walkPhase, aspect, hidden) {
    this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.rig.visible = !hidden && !!this.unit;
    this.recoil = Math.max(0, this.recoil - dt * 8); this.flash = Math.max(0, this.flash - dt);
    this.swayX = (this.swayX ?? 0) * Math.pow(0.02, dt); this.swayY = (this.swayY ?? 0) * Math.pow(0.02, dt);
    for (let i = this.shells.length - 1; i >= 0; i--) { const sh = this.shells[i]; sh.t += dt; sh.v.y -= 6 * dt; sh.m.position.addScaledVector(sh.v, dt); sh.m.rotation.x += sh.sx * dt; sh.m.rotation.z += sh.sz * dt; if (sh.t > 0.8) { this.scene.remove(sh.m); this.shells.splice(i, 1); } }
    this.equipT = Math.max(0, (this.equipT ?? 0) - dt);
    if (!this.unit) return;
    this.unit.unholdGun();
    const t = this.tune, r = this.unit.root;
    // the arms: the shooting stance, or the middle of a reload or a throw while one is running
    let acting = null;
    if (this.rl) { this.rl.t += dt; if (this.reloading < 0 && this.rl.t > this.rl.d + 0.05) this.rl = null; }
    if (this.rl && this.reloading >= 0) this.rl.t = this.reloading * this.rl.d;
    if (this.rl && this.rl.t >= this.rl.d) this.rl = null;
    if (this.nd) { this.nd.t += dt; if (this.nd.t > 0.9) this.nd = null; }
    if (this.sb) { this.sb.t += dt; if (this.sb.t > 0.5) this.sb = null; }
    if (this.sb) { acting = ['Right_Hand_Sword_Slash', this.sb.t / 0.5]; }
    else if (this.nd) { acting = ['Crouch_Pull_and_Throw', this.nd.t / 0.9]; }
    else if (this.rl) { acting = ['Standing_Reload', this.rl.t / this.rl.d]; }
    if (acting && !this.oneHandOnly) {
      const clip = this.unit.acts[acting[0]], len = clip ? clip.getClip().duration : 1;
      if (!this.unit.pose(acting[0], acting[1] * len)) acting = null;
    } else acting = null;
    if (!acting && this.unit.cur !== 'Walk_Forward_While_Shooting') this.unit.freezeAim();

    // stand the body so its head is at the camera, facing away from it (measured with the viewmodel at rest)
    const rg = this.rig; rg.position.set(0, 0, 0); rg.rotation.set(0, 0, 0); rg.updateMatrixWorld(true);
    r.rotation.set(0, Math.PI + t.yaw, 0); r.position.set(0, 0, 0); r.scale.setScalar(t.scale);
    this.unit.syncGun(t.gunK * (GUN_K[this.weapon] ?? 1), 1 - 0.85 * (this.adsS ?? 0)); r.updateMatrixWorld(true);
    const head = this.headBone;
    const la = this.unit.body.getObjectByName('LeftShoulder');
    if (la) la.scale.setScalar((this.oneHand && !acting) || (!acting && (this.adsS ?? 0) > 0.55) ? 0.001 : 1);   // aimed, the support hand would float beside the gun: leave it out of view
    { const h = SIGHT_WINDOW[this.weapon]; this.holeU.uAds.value = h ? this.adsS : 0; if (h) this.holeU.uHole.value.set(h[0], h[1], h[2]); this.holeU.uAsp.value = aspect; }
    this.adsS += (this.ads - this.adsS) * Math.min(1, dt * 14); const A = this.adsS, ap = ADS_POSE[this.weapon] ?? ADS_POSE.rifle;
    if (head) { head.scale.setScalar(1); r.updateMatrixWorld(true); head.getWorldPosition(_h); r.position.set(-_h.x + t.x + (ap.x - t.x) * A, -_h.y + t.y + (ap.y - t.y) * A, -_h.z + t.z + (ap.z - t.z) * A); head.scale.setScalar(0.001); }
    // the whole viewmodel moves about the eye: walking bob, breathing, turn lag, recoil, drawing the weapon
    const tm = performance.now() / 1000;
    const calm = 1 - 0.75 * this.adsS;       // the sights steady the gun
    const bobX = (moving ? Math.sin(walkPhase * 0.5) * 0.012 : Math.sin(tm * 1.3) * 0.002) * calm, bobY = (moving ? -Math.abs(Math.sin(walkPhase)) * 0.016 : Math.sin(tm * 1.9) * 0.0025) * calm;
    // the action clips raise the arm well above the gun: tip the view down while one runs so the hands stay in sight
    const bell = (p) => Math.max(0, Math.min(1, p / 0.15, (1 - p) / 0.15));
    const tip = acting ? (acting[0] === 'Standing_Reload' ? 0.5 : acting[0] === 'Right_Hand_Sword_Slash' ? 0.1 : 0.3) * bell(acting[1]) : 0;
    this.spr = (this.spr ?? 0) + ((this.sprinting ? 1 : 0) - (this.spr ?? 0)) * Math.min(1, dt * 9); const spr = this.spr;
    const eq = this.equipT > 0 ? (this.equipT / 0.5) ** 2 : 0;
    const kick = this.recoil * this.recoil;
    const tuck = (this.crouch || 0) * (1 - A) * 0.045;
    rg.position.set(bobX + (this.swayX ?? 0) * 0.6, bobY + (this.swayY ?? 0) * 0.6 - eq * 0.32 - kick * 0.012 - tip * 0.06 - spr * 0.06 - tuck, kick * 0.07 * (this.weapon === 'shotgun' || this.weapon === 'sniper' ? 1.8 : 1) + eq * 0.05);
    rg.rotation.set(-tip - spr * 0.45 + kick * (0.05 + (this.weapon === 'sniper' ? 0.06 : 0)) + eq * -0.7 + (this.swayY ?? 0), (this.swayX ?? 0) + spr * 0.35 + (this.kick ?? 0) * kick * 0.01, (this.swayX ?? 0) * 0.8 + (this.kick ?? 0) * kick * 0.015);
    rg.updateMatrixWorld(true); this.unit.syncGun(t.gunK * (GUN_K[this.weapon] ?? 1), 1 - 0.85 * (this.adsS ?? 0)); rg.updateMatrixWorld(true);
    if (!acting && !window.__noHold) { this.unit.holdGun(!this.oneHand); rg.updateMatrixWorld(true); }
    if (this.eject) {
      this.eject = false;
      const shotgun = this.weapon === 'shotgun' || this.weapon === 'autosg', m = new THREE.Mesh(this.shellGeo, shotgun ? this.red : this.brass);
      if (shotgun) m.scale.set(1.6, 1.8, 1.6);
      // out of the ejection port: a little way along the gun from the grip, on top and to the right
      const gp = new THREE.Vector3(), mp = new THREE.Vector3(); this.unit.gun.getWorldPosition(gp); (this.unit.muzzleObj ?? this.unit.gun).getWorldPosition(mp);
      m.position.copy(gp).lerp(mp, 0.22); m.position.x += 0.02; m.position.y += 0.035; this.scene.add(m);
      this.shells.push({ m, t: 0, v: new THREE.Vector3(0.9 + Math.random() * 0.8, 0.9 + Math.random() * 0.7, 0.25 + Math.random() * 0.4), sx: 12 + Math.random() * 16, sz: 9 + Math.random() * 12 });
      if (this.shells.length > 24) { this.scene.remove(this.shells.shift().m); }
    }
    if (this.muzzle) {
      this.muzzle.visible = this.flash > 0 && !hidden;
      (this.unit.muzzleObj ?? this.unit.gun).getWorldPosition(this.muzzle.position);
      this.muzzle.scale.setScalar((this.weapon === 'sniper' ? 0.2 : 0.14) * (0.8 + Math.random() * 0.6));
      this.flashLight.intensity = this.flash > 0 ? 3 : 0; this.flashLight.position.copy(this.muzzle.position);
    }
  }
}
// the see-through window when aimed, per gun with a glass sight: [centre x, centre y, radius] in screen units (the screen is 2 high), the radius measured in heights
const SIGHT_WINDOW = { rifle: [0, 0, 0.1], smg: [0, 0, 0.07], burst: [0, 0, 0.08], dmr: [0, 0, 0.1], pistol: [0, 0, 0.06], sniper: [0, 0, 0.05] };
const _h = new THREE.Vector3();
if (typeof window !== 'undefined') window.__viewTune = () => ({ ADS_POSE, GUN_K });
// where the rig sits when the sights are up: placed so the top of each gun's sight (measured in the view's own space) is in the middle of the screen
const ADS_POSE = { pistol: { x: -0.139, y: -0.035, z: 0.03 }, smg: { x: -0.138, y: -0.041, z: 0.04 }, rifle: { x: -0.132, y: -0.076, z: 0.04 }, shotgun: { x: -0.13, y: -0.014, z: 0.04 }, sniper: { x: -0.133, y: -0.024, z: 0.04 }, revolver: { x: -0.136, y: -0.047, z: 0.03 }, burst: { x: -0.136, y: -0.043, z: 0.04 }, lmg: { x: -0.132, y: -0.05, z: 0.05 }, autosg: { x: -0.129, y: -0.025, z: 0.04 }, dmr: { x: -0.133, y: -0.054, z: 0.04 } };
