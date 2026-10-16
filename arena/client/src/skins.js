// Character looks, drawn top-down with the character facing +x. A look is a list of shapes in units of the body radius; colours name
// a slot ('acc' is the player's own colour, 'team' the team's colour) so the menu preview and the arena draw the same thing.
export const SKINS = [
  { name: 'Rookie', shapes: [] },
  { name: 'Helmet', shapes: [{ t: 'circle', x: -0.1, y: 0, r: 0.82, c: '#2b3320' }, { t: 'rect', x: -0.5, y: -0.14, w: 1.1, h: 0.28, c: 'acc' }] },
  { name: 'Visor', shapes: [{ t: 'rect', x: 0.15, y: -0.55, w: 0.75, h: 1.1, c: 'rgba(120,230,255,0.85)' }] },
  { name: 'Mohawk', shapes: [{ t: 'tri', p: [[-0.9, -0.28], [-0.9, 0.28], [-0.35, 0]], c: 'acc' }, { t: 'tri', p: [[-0.4, -0.28], [-0.4, 0.28], [0.15, 0]], c: 'acc' }, { t: 'tri', p: [[0.1, -0.28], [0.1, 0.28], [0.6, 0]], c: 'acc' }] },
  { name: 'Horns', shapes: [{ t: 'tri', p: [[-0.1, -0.7], [-0.7, -1.25], [0.3, -0.95]], c: '#e8e2cc' }, { t: 'tri', p: [[-0.1, 0.7], [-0.7, 1.25], [0.3, 0.95]], c: '#e8e2cc' }] },
  { name: 'Crown', shapes: [{ t: 'circle', x: -0.05, y: 0, r: 0.6, c: '#f2c14e' }, { t: 'circle', x: -0.05, y: 0, r: 0.3, c: '#7a1f1f' }, { t: 'circle', x: 0.35, y: 0, r: 0.16, c: '#fff4c0' }] },
];
export const COLORS = [0xb6ff00, 0xff8a3c, 0x4cc9f0, 0xf72585, 0xffd166, 0xc77dff, 0xffffff, 0x2ec4b6];
export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** the menu preview: a character on a canvas */
export function previewSkin(canvas, skin, color) {
  const g = canvas.getContext('2d'), S = canvas.width, r = S * 0.3, cx = S / 2, cy = S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = hex(color); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = S * 0.04; g.stroke();
  g.fillStyle = '#222'; g.fillRect(cx + r * 0.5, cy - r * 0.18, r * 1.2, r * 0.36);
  for (const s of SKINS[skin].shapes) {
    g.fillStyle = s.c === 'acc' ? '#fff' : s.c;
    if (s.t === 'circle') { g.beginPath(); g.arc(cx + s.x * r, cy + s.y * r, s.r * r, 0, 7); g.fill(); }
    else if (s.t === 'rect') g.fillRect(cx + s.x * r, cy + s.y * r, s.w * r, s.h * r);
    else { g.beginPath(); s.p.forEach(([x, y], i) => (i ? g.lineTo(cx + x * r, cy + y * r) : g.moveTo(cx + x * r, cy + y * r))); g.closePath(); g.fill(); }
  }
}
