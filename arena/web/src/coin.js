// A spinning coin on a transparent background, one frame at a time, for the animated sticker and emoji: WARHEADZ on one face, Vyre Bad Lands on the other.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search), SIZE = Number(q.get('size') || 512);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE); renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(2, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xb6ff3c, 2.0); rim.position.set(-3, 1, -3); scene.add(rim);
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50); cam.position.set(0, 0, 6.2); cam.lookAt(0, 0, 0);

const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
const logos = { w: await load('/_stickersrc/logo-warheadz.webp'), b: await load('/_stickersrc/logo-badlands.webp') };
/** one face: a dark disc with a lime rim and the logo in the middle */
function face(img, flip, turn) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.translate(S / 2, S / 2); g.rotate(turn); if (flip) g.scale(-1, 1); g.translate(-S / 2, -S / 2);
  const bg = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2); bg.addColorStop(0, '#10200a'); bg.addColorStop(0.7, '#070d05'); bg.addColorStop(1, '#030502');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.lineWidth = 46; g.strokeStyle = '#b6ff3c'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 40, 0, 7); g.stroke();
  g.lineWidth = 8; g.strokeStyle = 'rgba(182,255,60,0.55)'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 100, 0, 7); g.stroke();
  const w = S * 0.74, h = w * img.height / img.width; g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const T = 0.16, R = 1;
const edge = new THREE.MeshStandardMaterial({ color: 0xb6ff3c, metalness: 0.85, roughness: 0.3 });
const mat = (t) => new THREE.MeshStandardMaterial({ map: t, metalness: 0.5, roughness: 0.4, emissive: 0x0b1a05, emissiveIntensity: 0.6 });
// cylinder axis is y: the top cap faces +y, the bottom -y; turn it so the caps face +z and -z
const coin = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 96, 1), [edge, mat(face(logos.w, false, -Math.PI / 2)), mat(face(logos.b, false, -Math.PI / 2))]);
coin.rotation.x = Math.PI / 2; const holder = new THREE.Group(); holder.add(coin); scene.add(holder);
window.__coin = { frame(u) { holder.rotation.y = u * Math.PI * 2; holder.rotation.x = 0.12 * Math.sin(u * Math.PI * 2); holder.position.y = 0.04 * Math.sin(u * Math.PI * 4); renderer.render(scene, cam); } };
window.__ready = true;
