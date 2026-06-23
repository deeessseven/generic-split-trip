import { makeButton } from '../Button.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { relayoutOnResize } from '../responsive.js';
import { Flow } from '../Flow.js';
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

    // Panel inner width that text must stay within (panel is 360*k wide).
    const panelW = Math.round(360 * k) * 0.9;

    // Title
    fitText(this.add.text(cx, cy - 115 * k, GT.gameOverTitle, {
      fontSize: fp(44),
      fontFamily: '"Arial Black", Arial',
      color: '#ef5350',
      stroke: '#ffffff',
      strokeThickness: Math.max(1, Math.round(3 * k)),
      align: 'center', // center each line of a multi-line game-over title (gametext \n)
    }).setOrigin(0.5), panelW);

    // This run: wall count (primary), then seconds survived below it.
    fitText(this.add.text(cx, cy - 52 * k, `${score} ${GT.scoreUnit}`, {
      fontSize: fp(38), fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5), panelW);
    fitText(this.add.text(cx, cy - 8 * k, `${time}${GT.scoreSurvived}`, {
      fontSize: fp(22), fontFamily: 'Arial', color: '#b0bec5',
    }).setOrigin(0.5), panelW);

    // Best run (most walls; ties broken by more time) — shows both walls and seconds survived.
    const best = this._updateBest(score, time);
    fitText(this.add.text(cx, cy + 34 * k, `${GT.scoreBest}: ${best.walls} ${GT.scoreUnit}, ${best.time}${GT.scoreSurvived}`, {
      fontSize: fp(16), fontFamily: 'Arial', color: '#ffd54f',
    }).setOrigin(0.5), panelW);

    // Buttons
    makeButton(this, cx - 90 * k, cy + 115 * k, Math.round(160 * k), Math.round(44 * k), GT.btnPlayAgain, 0x29b6f6, 0x0288d1, () => {
      GameScene.noteNewGame();
      Flow.go(this, 'playAgain');
    }, fp(16));
    makeButton(this, cx + 90 * k, cy + 115 * k, Math.round(160 * k), Math.round(44 * k), GT.btnMainMenu, 0x37474f, 0x263238, () => {
      Flow.go(this, 'mainMenu');
    }, fp(16));
  }

  // Best run = most walls, ties broken by more time. Stored as JSON { walls, time }; migrates the
  // old walls-only key ('doubleflap_best_walls'). Returns the best { walls, time }.
  _updateBest(score, time) {
    const key = 'doubleflap_best';
    let best = { walls: 0, time: 0 };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        best = { walls: Number(p.walls) || 0, time: Number(p.time) || 0 };
      } else {
        const oldWalls = parseInt(localStorage.getItem('doubleflap_best_walls'), 10);
        if (oldWalls) best = { walls: oldWalls, time: 0 };
      }
    } catch { /* ignore */ }
    if (score > best.walls || (score === best.walls && time > best.time)) {
      best = { walls: score, time };
      try { localStorage.setItem(key, JSON.stringify(best)); } catch { /* ignore */ }
    }
    return best;
  }
}
