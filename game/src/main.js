import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MapScene } from './scenes/MapScene.js';
import { BaseScene } from './scenes/BaseScene.js';
import { LogoScene } from './scenes/LogoScene.js';

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#050805',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BootScene, MapScene, BaseScene, LogoScene],
  render: { antialias: true },
});
