import { makeButton } from '../Button.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { relayoutOnResize } from '../responsive.js';
import { GameScene } from './GameScene.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data) {
    relayoutOnResize(this);
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;
    const score = data?.score ?? 0;
    const time  = data?.time  ?? 0;

    // Uniform scale-down on short screens so the fixed-size panel never overflows the viewport.
    // k = 1 at H ≥ 360 (the fullscreen case), so the normal layout is byte-for-byte unchanged.
    const k  = Math.min(1, H / 360);
    const fp = (n) => `${Math.round(n * k)}px`;

    // Short, one-time sad tune (stops the looping theme).
    AudioSystem.playGameOver();

    // Dim overlay
    this.add.rectangle(cx, cy, W, H, 0x000000, 0.72);

    // Panel
    this.add.rectangle(cx, cy, Math.round(360 * k), Math.round(300 * k), 0x0d1117, 0.95)
      .setStrokeStyle(2, 0xef5350, 0.8);

    // Title
    this.add.text(cx, cy - 115 * k, GT.gameOverTitle, {
      fontSize: fp(44),
      fontFamily: '"Arial Black", Arial',
      color: '#ef5350',
      stroke: '#ffffff',
      strokeThickness: Math.max(1, Math.round(3 * k)),
    }).setOrigin(0.5);

    // Primary score
    this.add.text(cx, cy - 55 * k, GT.scoreUnit.charAt(0).toUpperCase() + GT.scoreUnit.slice(1), {
      fontSize: fp(16), fontFamily: 'Arial', color: '#90a4ae',
    }).setOrigin(0.5);
    this.add.text(cx, cy - 15 * k, String(score), {
      fontSize: fp(40), fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5);

    // Best score (localStorage)
    const best = this._updateBest(score);
    this.add.text(cx, cy + 35 * k, `${GT.scoreBest}: ${best}`, {
      fontSize: fp(14), fontFamily: 'Arial', color: '#ffd54f',
    }).setOrigin(0.5);

    // Time survived
    this.add.text(cx, cy + 65 * k, `${time}${GT.scoreSurvived}`, {
      fontSize: fp(13), fontFamily: 'Arial', color: '#b0bec5',
    }).setOrigin(0.5);

    // Buttons
    makeButton(this, cx - 90 * k, cy + 115 * k, Math.round(160 * k), Math.round(44 * k), GT.btnPlayAgain, 0x29b6f6, 0x0288d1, () => {
      GameScene.noteNewGame();
      this.scene.start('GameScene');
    }, fp(16));
    makeButton(this, cx + 90 * k, cy + 115 * k, Math.round(160 * k), Math.round(44 * k), GT.btnMainMenu, 0x37474f, 0x263238, () => {
      this.scene.start('MenuScene');
    }, fp(16));
  }

  _updateBest(score) {
    try {
      const key = 'splittrip_best_walls';
      const prev = parseInt(localStorage.getItem(key), 10) || 0;
      const best = Math.max(prev, score);
      localStorage.setItem(key, String(best));
      return best;
    } catch {
      return score;
    }
  }
}
