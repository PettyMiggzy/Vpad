import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MapScene } from './scenes/MapScene.js';
import { BaseScene } from './scenes/BaseScene.js';
import { LogoScene } from './scenes/LogoScene.js';
import { BattleScene } from './scenes/BattleScene.js';

// The canvas is drawn at the screen's real pixel density (capped at 2x) so art stays sharp on phones; every scene works in these
// game pixels and the DOM panels in CSS pixels.
export const DPR = Math.min(window.devicePixelRatio || 1, 2);
window.__dpr = DPR;
const size = () => [Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR)];
const [W, H] = size();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#07262d',
  scale: { mode: Phaser.Scale.NONE, width: W, height: H, zoom: 1 / DPR },
  scene: [BootScene, MapScene, BaseScene, BattleScene, LogoScene],
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 3, touch: { capture: true } },
  disableContextMenu: true,
});
window.__game = game;
const fit = () => { const [w, h] = size(); game.scale.resize(w, h); };
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
