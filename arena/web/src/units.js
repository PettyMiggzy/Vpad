// Soldiers: generated 3D characters (one shared 24-bone rig, so one set of animation clips fits all of them) holding generated weapons.
// A team ring and an overhead marker say whose side each one is.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const UNIT_H = 1.85;
const POOL = [['frog'], ['bulldog']];
/** the characters everyone else is drawn as: both teams use all of them (the team colour on the armour and the ring under the feet say whose side each one is) */
const CROWD = ['frog', 'bulldog', 'ape'];
const GUN_LEN = { pistol: 0.32, smg: 0.62, rifle: 0.95, shotgun: 0.95, sniper: 1.25, revolver: 0.42, burst: 0.72, lmg: 1.15, autosg: 0.95, dmr: 1.1, mp: 0.4, pdw: 0.62, br: 1.0, amr: 1.4, thumper: 0.85, rocket: 1.2, minigun: 1.1, flame: 0.95, raygun: 0.95, crossbow: 0.9 };
// where the weapon sits in the right hand (tuned by eye; live-editable from the console while testing)
// the pistol model is drawn pointing the other way from the rest: turn it half a circle so every weapon's muzzle leads
// the generated models have the muzzle at the model's -x end and the stock at +x, so every one is turned half a way round to point down the sights
const GUN_TURN = {};
const TURN = Math.PI;
// where each grip sits along the model, as a share of its length from the middle towards the stock: the hand holds the grip, not the middle
const GUN_GRIP = { pistol: 0.26, smg: 0.19, rifle: 0.16, shotgun: 0.3, sniper: 0.19, revolver: 0.18, burst: 0.21, lmg: 0.17, autosg: 0.24, dmr: 0.16, mp: 0.26, pdw: 0.2, br: 0.16, amr: 0.19, thumper: 0.2, rocket: 0.14, minigun: 0.2, flame: 0.2, raygun: 0.18, crossbow: 0.18 };
// where the jetpack sits on the spine bone, in metres in the bone's own axes (tuned by eye; live-editable from the console)
export const PACK = { x: 0, y: 0.05, z: -0.2, rx: 0, ry: 0, rz: 0 };
if (typeof window !== 'undefined') window.__packTune = PACK;
export const GUN_OFFSET = { pos: [0, 0.03, 0.2], rot: [0, 0.34, 0], k: 1 };

/** the soldiers and weapons are painted with lime accents: swap those for the team's colour (blue 0.61 or red 0.0 on the hue wheel), leave browns and greys alone */
const TEAM_HUE = [0.61, 0.005, 0.25];   // blue, red, and (stickers only) the brand lime
function teamize(root, team) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mk = (m0) => {
      const m = m0.clone();
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
            if (d > 0.1 && mx > 0.2) {
              float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0; h /= 6.0;
              if (h > 0.16 && h < 0.44) { vec3 k = clamp(abs(mod(${TEAM_HUE[team].toFixed(3)} * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); diffuseColor.rgb = mn + d * k; }
            } }`);
      };
      m.customProgramCacheKey = () => `team${team}`;
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(mk) : mk(o.material);
  });
}

// where each hand holds the weapon, in the weapon's own space: the right hand at (rx, ry) below the model's middle; the left a share lf of the way to the muzzle, ly below the barrel line
const GUN_HOLD = {
  pistol: { rx: 0.0, ry: -0.03, lf: 0.2, ly: -0.05 }, revolver: { rx: 0.0, ry: -0.03, lf: 0.2, ly: -0.05 },
  smg: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.05 }, rifle: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.045 }, burst: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.045 },
  shotgun: { rx: -0.01, ry: -0.035, lf: 0.6, ly: -0.04 }, autosg: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.05 }, sniper: { rx: -0.01, ry: -0.04, lf: 0.62, ly: -0.05 },
  lmg: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.07 }, dmr: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.05 },
  mp: { rx: 0.0, ry: -0.03, lf: 0.2, ly: -0.05 }, pdw: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.06 }, br: { rx: -0.01, ry: -0.04, lf: 0.6, ly: -0.045 }, amr: { rx: -0.01, ry: -0.04, lf: 0.62, ly: -0.05 },
  thumper: { rx: -0.01, ry: -0.04, lf: 0.55, ly: -0.05 }, rocket: { rx: -0.01, ry: -0.05, lf: 0.45, ly: -0.09 }, minigun: { rx: -0.01, ry: -0.05, lf: 0.55, ly: -0.07 }, flame: { rx: -0.01, ry: -0.05, lf: 0.45, ly: -0.08 }, raygun: { rx: -0.01, ry: -0.04, lf: 0.55, ly: -0.05 }, crossbow: { rx: -0.01, ry: -0.04, lf: 0.55, ly: -0.05 },
};
if (typeof window !== 'undefined') window.__holdTune = GUN_HOLD;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
/** turn a bone so the direction to its child (from -> to) points at 'want'; works in world space and sets the bone's local rotation */
function aimBone(bone, child, want) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _c.subVectors(_b, _a).normalize(); _d.copy(want).sub(_a).normalize();
  _qa.setFromUnitVectors(_c, _d); bone.getWorldQuaternion(_qb); _qb.premultiply(_qa);
  const pq = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  bone.quaternion.copy(pq.invert().multiply(_qb)); bone.updateMatrixWorld(true);
}
/** two-bone IK: shoulder-side bone 'up', elbow 'mid', wrist 'end' reach the world point 'target'; the elbow bends towards 'pole' */
function solveArm(up, mid, end, target, pole, along, mix = 0.7) {
  let S = up.getWorldPosition(new THREE.Vector3()), E = mid.getWorldPosition(new THREE.Vector3()), W = end.getWorldPosition(new THREE.Vector3());
  { // a target beyond the arm's reach: lengthen the arm a little (up to a fifth) rather than leave the hand hanging short of the gun
    const reach = S.distanceTo(E) + E.distanceTo(W), need = S.distanceTo(target);
    if (need > reach * 0.97) { const s = Math.min(1.22, need / (reach * 0.97)); up.scale.multiplyScalar(s); end.scale.multiplyScalar(1 / s); up.updateMatrixWorld(true); S = up.getWorldPosition(new THREE.Vector3()); E = mid.getWorldPosition(new THREE.Vector3()); W = end.getWorldPosition(new THREE.Vector3()); }
  }
  const l1 = S.distanceTo(E), l2 = E.distanceTo(W), to = target.clone().sub(S); let d = to.length(); const dir = to.clone().normalize();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0); perp.normalize();
  const elbow = S.clone().addScaledVector(dir, a).addScaledVector(perp, h);
  aimBone(up, mid, elbow);
  aimBone(mid, end, S.clone().addScaledVector(dir, d));
  if (along) {   // the hand lies along the weapon: fingers follow the way the gun points
    const f = end.getWorldPosition(new THREE.Vector3()).sub(mid.getWorldPosition(new THREE.Vector3())).normalize(), want = f.clone().lerp(along, mix).normalize();
    _qa.setFromUnitVectors(f, want); end.getWorldQuaternion(_qb); _qb.premultiply(_qa);
    end.quaternion.copy(end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_qb)); end.updateMatrixWorld(true);
  }
}
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _o = new THREE.Matrix4(), _e = new THREE.Euler();

export class Unit {
  constructor(A, team, weapon, color, seed, full = false) {
    this.team = team; this.weapon = weapon;
    const names = POOL[team] ?? POOL[0];
    const crowd = CROWD.filter((n) => A.heroLo[n]);
    const nm = !full && typeof seed === 'number' && crowd.length ? crowd[Math.abs(seed) % crowd.length] : names[0], src = full ? A.hero[nm] : A.heroLo[nm];
    this.hero = nm;
    this.root = new THREE.Group();
    this.body = SkeletonUtils.clone(src.scene); teamize(this.body, team);
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
    const gunSrc = (full && A.gunsH[weapon]) || A.gunsLo[weapon];
    this.gun = new THREE.Group();
    const g = gunSrc.scene.clone(true);
    const gb = new THREE.Box3().setFromObject(g), gs = gb.getSize(new THREE.Vector3()), gc = gb.getCenter(new THREE.Vector3());
    const long = Math.max(gs.x, gs.y, gs.z);
    teamize(g, team);
    g.position.sub(gc); g.position.x -= (GUN_GRIP[weapon] ?? 0.18) * (GUN_LEN[weapon] ?? 0.8); g.scale.setScalar((GUN_LEN[weapon] ?? 0.8) / long);
    // the muzzle: the -x end of the model, about two thirds of the way up its height (where a barrel sits); flashes and tracers start here
    { const s = (GUN_LEN[weapon] ?? 0.8) / long; this.muzzleObj = new THREE.Object3D(); this.muzzleObj.position.set(g.position.x + s * gb.min.x, g.position.y + s * (gb.min.y + 0.62 * gs.y), g.position.z + s * gc.z); }
    this.gunInner = new THREE.Group(); this.gunInner.add(g); this.gunInner.add(this.muzzleObj); this.gunInner.rotation.y = GUN_TURN[weapon] ?? TURN; this.gun.add(this.gunInner);
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
      if (c.name.startsWith('Shot_and_')) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }
      if (['Gunshot_Reaction', 'Standing_Reload', 'Crouch_Pull_and_Throw', 'Right_Hand_Sword_Slash', 'Regular_Jump'].includes(c.name)) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }
      this.acts[c.name] = a;
    }
    this.cur = null; this.dead = false; this.dieT = 0; this.flash = 0; this.ovr = null; this.dieClip = ['Shot_and_Fall_Backward', 'Shot_and_Fall_Forward', 'Shot_and_Slow_Fall_Backward'][Math.floor(Math.random() * 3)];
    this.play('Idle'); this.mixer.setTime(Math.random() * 3);
  }
  play(name, fade = 0.18) {
    if (this.cur === name) return;
    const next = this.acts[name]; if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.cur) this.acts[this.cur].crossFadeTo(next, fade, false);
    this.cur = name;
  }
  /** speed in metres a second, back true when moving away from where it faces. rough skips the bone walk on soldiers far from the camera */
  update(dt, speed, firing, alive, t, back = false, rough = false) {
    if (!alive) {
      if (!this.dead) { this.dead = true; this.dieT = 0; this.cur = null; for (const a of Object.values(this.acts)) a.stop(); this.play(this.acts[this.dieClip] ? this.dieClip : 'Shot_and_Fall_Backward', 0.05); }
      this.dieT += dt; this.mixer.update(dt);
      this.ring.visible = false; this.mark.visible = false; this.syncGun(); this.gun.visible = this.dieT < 2.5;
      return;
    }
    if (this.dead) { this.dead = false; for (const a of Object.values(this.acts)) a.stop(); this.cur = null; this.ring.visible = true; this.mark.visible = true; this.gun.visible = true; }
    if (this.ovr) { this.ovr.t -= dt; if (this.ovr.t <= 0) this.ovr = null; }
    if (this.ovr) this.play(this.ovr.clip);
    else this.play(speed < 0.35 ? 'Idle' : back ? 'Walk_Backward_While_Shooting' : speed < 3.2 ? 'Walk_Forward_While_Shooting' : 'Run_and_Shoot');
    this.mixer.update(dt);
    this.roughN = ((this.roughN ?? 0) + 1) & 3;
    if (!rough || this.roughN === 0) this.syncGun();
    this.mark.position.y = UNIT_H + 0.45 + Math.sin(t * 3 + this.root.id) * 0.05; this.mark.rotation.y = t * 2;
  }
  /** a short action over the walking: 'reload' or 'throw' */
  act(kind) {
    const clip = { throw: 'Crouch_Pull_and_Throw', melee: 'Right_Hand_Sword_Slash', jump: 'Regular_Jump', reload: 'Standing_Reload' }[kind] ?? 'Standing_Reload', a = this.acts[clip];
    if (!a) return;
    this.ovr = { clip, t: Math.min({ throw: 1.1, melee: 0.55, jump: 0.7, reload: 1.8 }[kind] ?? 1, a.getClip().duration) };
  }
  /** a flinch when hit (skipped while another action is running) */
  hit() {
    if (this.dead || this.ovr || !this.acts.Gunshot_Reaction) return;
    this.ovr = { clip: 'Gunshot_Reaction', t: Math.min(0.5, this.acts.Gunshot_Reaction.getClip().duration) };
  }
  /** first person: freeze the shooting stance (arms raised on the weapon) at one moment of the clip */
  freezeAim(name = 'Walk_Forward_While_Shooting', at = 0.8) {
    for (const a of Object.values(this.acts)) a.stop();
    const a = this.acts[name]; a.reset().setEffectiveWeight(1).play(); a.paused = true; a.time = at; this.cur = name; this.mixer.update(0);
    this.ring.visible = false; this.mark.visible = false;
  }
  /** first person: hold one clip of the action animations at a given moment (the arms follow it) */
  pose(name, time) {
    const a = this.acts[name]; if (!a) return false;
    if (this.cur !== name) { for (const x of Object.values(this.acts)) x.stop(); a.reset().setEffectiveWeight(1).play(); a.paused = true; this.cur = name; }
    a.time = Math.min(time, a.getClip().duration - 0.001); this.mixer.update(0);
    return true;
  }
  /** the weapon sits at the right hand and always points the way the soldier faces (independent of how the bone is turned) */
  syncGun(kMul = 1, yawMul = 1) {
    if (!this.hand) return;
    this.root.updateMatrixWorld(true);
    _inv.copy(this.root.matrixWorld).invert();
    _m.copy(this.hand.matrixWorld).premultiply(_inv);
    _p.setFromMatrixPosition(_m);
    const gp = GUN_OFFSET.pos, k = GUN_OFFSET.k * kMul;
    _e.set(GUN_OFFSET.rot[0], GUN_OFFSET.rot[1] * yawMul - Math.PI / 2, GUN_OFFSET.rot[2]);
    _q.setFromEuler(_e);
    _p.set(_p.x + gp[0], _p.y + gp[1], _p.z + gp[2]); _s.set(k, k, k);
    _o.compose(_p, _q, _s);
    this.gun.matrix.copy(_o);
    this.gun.matrixWorldNeedsUpdate = true;
  }
  /** first person: put both hands on the weapon. The right hand takes the grip, the left the handguard; each arm is solved with two-bone IK so it reaches the gun it holds (the clips only fit the gun roughly). Call after syncGun, with the animation pose freshly applied. */
  holdGun(left = true) {
    if (!this.hand || !this.muzzleObj) return;
    this.root.updateMatrixWorld(true);
    const grip = GUN_HOLD[this.weapon] ?? GUN_HOLD.rifle;
    const mz = this.muzzleObj.position.clone().applyMatrix4(this.gunInner.matrix);     // the muzzle in the gun's own space
    const rt = new THREE.Vector3(grip.rx, grip.ry, 0), lt = mz.clone().multiplyScalar(grip.lf); lt.y = mz.y * grip.lf + grip.ly; lt.z = grip.lz ?? 0;
    this.gun.localToWorld(rt); this.gun.localToWorld(lt);
    const B = (n) => this.body.getObjectByName(n);
    this._saved = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'].map((n) => [B(n), B(n).quaternion.clone(), B(n).scale.clone()]);
    const side = new THREE.Vector3().subVectors(B('LeftShoulder').getWorldPosition(_a), B('RightShoulder').getWorldPosition(_b)).normalize().clone();
    const down = new THREE.Vector3(0, -1, 0), fwd = mz.clone().normalize(); this.gun.localToWorld(fwd).sub(this.gun.getWorldPosition(new THREE.Vector3())).normalize();
    solveArm(B('RightArm'), B('RightForeArm'), B('RightHand'), rt, down.clone().addScaledVector(side, -0.4));
    if (left) solveArm(B('LeftArm'), B('LeftForeArm'), B('LeftHand'), lt, down.clone().addScaledVector(side, 0.5), fwd, 0.75);
    this.root.updateMatrixWorld(true);
  }
  /** give the arms back their clip pose (before the next frame's hold, so the weapon is anchored to the clip's hand, not to last frame's solved one) */
  unholdGun() { if (this._saved) { for (const [b, q, sc] of this._saved) { b.quaternion.copy(q); b.scale.copy(sc); } this._saved = null; } }
  /** a jetpack on the back, with a flame while it burns. It is built the first time it is needed and rides the spine bone. */
  setJet(has, burning, t) {
    if (!has && !this.pack) return;
    if (!this.pack) {
      const bone = this.body.getObjectByName('Spine02') ?? this.body.getObjectByName('Spine');
      if (!bone) return;
      const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.8, roughness: 0.35 }), trim = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, metalness: 0.3, roughness: 0.5, emissive: 0x294000 });
      const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a20).multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0.9 });
      this.flames = [];
      for (const sx of [-0.09, 0.09]) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.46, 12), steel); can.position.set(sx, 0, 0); g.add(can);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.04, 12), trim); ring.position.set(sx, 0.12, 0); g.add(ring);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.07, 10), steel); nozzle.position.set(sx, -0.26, 0); g.add(nozzle);
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 10), flameMat); fl.rotation.x = Math.PI; fl.position.set(sx, -0.55, 0); fl.visible = false; g.add(fl); this.flames.push(fl);
      }
      const ws = bone.getWorldScale(new THREE.Vector3()); g.scale.setScalar(1 / Math.max(1e-4, ws.x));
      g.position.set(PACK.x / Math.max(1e-4, ws.x), PACK.y / Math.max(1e-4, ws.x), PACK.z / Math.max(1e-4, ws.x)); g.rotation.set(PACK.rx, PACK.ry, PACK.rz);
      bone.add(g); this.pack = g;
    }
    this.pack.visible = !!has;
    for (const f of this.flames) { f.visible = !!burning; if (burning) f.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(t * 40)), 1); }
  }
  dispose() { this.root.removeFromParent(); this.root.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) { o.geometry.dispose(); o.material.dispose(); } }); }
}
