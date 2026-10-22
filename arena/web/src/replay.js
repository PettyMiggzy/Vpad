// Killcam sampling: a soldier's recorded samples (about 30 a second) read back at any moment, positions and angles blended between the two nearest.
export const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
export function sampleHist(a, tt) {
  if (tt <= a[0].t) return a[0];
  for (let i = a.length - 1; i > 0; i--) {
    if (a[i - 1].t <= tt) {
      const p = a[i - 1], q = a[i], k = Math.max(0, Math.min(1, (tt - p.t) / Math.max(1e-6, q.t - p.t)));
      return { ...p, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k, aim: lerpAng(p.aim, q.aim, k), pitch: p.pitch + (q.pitch - p.pitch) * k, crouch: (p.crouch || 0) + ((q.crouch || 0) - (p.crouch || 0)) * k };
    }
  }
  return a[a.length - 1];
}
