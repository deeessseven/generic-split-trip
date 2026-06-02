import { makeButton } from '../Button.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data) {
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;
    const score = data?.score ?? 0;
    const time  = data?.time  ?? 0;

    // Short, one-time sad tune (stops the looping theme).
    AudioSystem.playGameOver();

    // Dim overlay
    this.add.rectangle(cx, cy, W, H, 0x000000, 0.72);

    // Panel
    this.add.rectangle(cx, cy, 360, 300, 0x0d1117, 0.95)
      .setStrokeStyle(2, 0xef5350, 0.8);

    // Title
    this.add.text(cx, cy - 115, GT.gameOverTitle, {
      fontSize: '44px',
      fontFamily: '"Arial Black", Arial',
      color: '#ef5350',
      stroke: '#ffffff',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Primary score
    this.add.text(cx, cy - 55, GT.scoreUnit.charAt(0).toUpperCase() + GT.scoreUnit.slice(1), {
      fontSize: '16px', fontFamily: 'Arial', color: '#90a4ae',
    }).setOrigin(0.5);
    this.add.text(cx, cy - 15, String(score), {
      fontSize: '40px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5);

    // Best score (localStorage)
    const best = this._updateBest(score);
    this.add.text(cx, cy + 35, `${GT.scoreBest}: ${best}`, {
      fontSize: '14px', fontFamily: 'Arial', color: '#ffd54f',
    }).setOrigin(0.5);

    // Time survived
    this.add.text(cx, cy + 65, `${time}${GT.scoreSurvived}`, {
      fontSize: '13px', fontFamily: 'Arial', color: '#b0bec5',
    }).setOrigin(0.5);

    // Buttons
    makeButton(this, cx - 90, cy + 115, 160, 44, GT.btnPlayAgain, 0x29b6f6, 0x0288d1, () => {
      this.scene.start('GameScene');
    });
    makeButton(this, cx + 90, cy + 115, 160, 44, GT.btnMainMenu, 0x37474f, 0x263238, () => {
      this.scene.start('MenuScene');
    });
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
