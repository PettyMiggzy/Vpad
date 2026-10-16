// The characters' animation sheets (generated clips, cut out and packed by the art pipeline): per character a walk loop and an attack.
// Each sheet is 8 columns of 192-pixel cells; the feet are at the bottom centre of a cell, the character faces right.
export const CHARS = ['bruiser', 'sniper', 'trickster', 'defender'];
export const FRAME = 192;
// the attack clip's useful part: first frame of the wind-up, the frame where the blow lands, the last frame of the recovery
export const ATTACK = {
  bruiser: { start: 12, impact: 34, end: 44, ranged: false },
  sniper: { start: 28, impact: 33, end: 42, ranged: true },
  trickster: { start: 9, impact: 18, end: 34, ranged: false },
  defender: { start: 10, impact: 15, end: 30, ranged: false },
};
export const ATTACK_FPS = 24;
export const impactMs = (ch) => ((ATTACK[ch].impact - ATTACK[ch].start) / ATTACK_FPS) * 1000;
export const attackMs = (ch) => ((ATTACK[ch].end - ATTACK[ch].start + 1) / ATTACK_FPS) * 1000;

export function loadAnimSheets(scene) {
  for (const ch of CHARS) for (const kind of ['walk', 'attack']) {
    scene.load.spritesheet(`${ch}_${kind}`, `art/anim/${ch}_${kind}.webp`, { frameWidth: FRAME, frameHeight: FRAME, endFrame: 48 });
  }
}

export function makeAnims(scene) {
  for (const ch of CHARS) {
    const a = ATTACK[ch];
    scene.anims.create({ key: `${ch}_walk`, frames: scene.anims.generateFrameNumbers(`${ch}_walk`, { start: 0, end: 48 }), frameRate: 14, repeat: -1, yoyo: true });
    scene.anims.create({ key: `${ch}_attack`, frames: scene.anims.generateFrameNumbers(`${ch}_attack`, { start: a.start, end: a.end }), frameRate: ATTACK_FPS, repeat: 0 });
  }
}

/** a character sprite standing at (x, y) (feet), `size` is the cell's on-screen width; the stance is the attack clip's first frame */
export function makeFighter(scene, ch, x, y, size, flip = false) {
  const s = scene.add.sprite(x, y, `${ch}_attack`, 0).setOrigin(0.5, 1);
  s.setScale(size / FRAME).setFlipX(flip);
  s.ch = ch;
  return s;
}
