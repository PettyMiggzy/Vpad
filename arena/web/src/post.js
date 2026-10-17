// The last full-screen touch before the picture goes out: colour grading (a gentle S-curve, saturation, warm lights and cool shadows or the
// other way round, per map), a soft vignette and a fine film grain. It runs on the linear picture, before the tone mapping in OutputPass.
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1280, 720) },
    sat: { value: 1.08 }, contrast: { value: 1.08 }, vig: { value: 0.32 }, grain: { value: 0.02 },
    shadowTint: { value: new THREE.Vector3(0.97, 1.0, 1.04) }, highTint: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, sat, contrast, vig, grain; uniform vec2 res; uniform vec3 shadowTint, highTint; varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c *= mix(shadowTint, highTint, smoothstep(0.02, 0.9, l));
      c = max((c - 0.18) * contrast + 0.18, 0.0);
      vec2 q = vUv - 0.5; q.x *= res.x / res.y;
      c *= 1.0 - clamp(dot(q, q) * vig * 1.6, 0.0, 0.7);
      c += (hash(vUv * res + fract(time) * 91.7) - 0.5) * grain * (0.4 + 0.6 * (1.0 - clamp(l, 0.0, 1.0)));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export function makeGradePass() { return new ShaderPass(GradeShader); }

/** one map's grade: { sat, contrast, vig, grain, shadow: [r,g,b], high: [r,g,b] } */
export function applyGrade(pass, g, lite = false) {
  const u = pass.uniforms;
  u.sat.value = g.sat; u.contrast.value = g.contrast; u.vig.value = g.vig; u.grain.value = lite ? 0 : g.grain;
  u.shadowTint.value.set(...g.shadow); u.highTint.value.set(...g.high);
}
