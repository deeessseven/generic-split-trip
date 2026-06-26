import { makeButton } from '../Button.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { relayoutOnResize } from '../responsive.js';
import { Flow } from '../Flow.js';
import { GameScene } from './GameScene.js';
import { Leaderboard } from '../leaderboard.js';
import { promptName, closeActivePrompt } from '../nameEntry.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data) {
    relayoutOnResize(this);
    // If this scene tears down (incl. a resize-driven restart) while the name box is open, close it
    // so the DOM overlay can't linger or stack. No-op if no prompt is open.
    this.events.once('shutdown', closeActivePrompt);
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;
    const score = data?.score ?? 0;
    const time  = data?.time  ?? 0;
    const fromLb = !!(data && data.fromLeaderboard); // returned here via the leaderboard's Back

    // Uniform scale-down on short screens so the fixed-size panel never overflows the viewport.
    // k = 1 at H ≥ 360 (the fullscreen case), so the normal layout is byte-for-byte unchanged.
    const k  = Math.min(1, H / 360);
    const fp = (n) => `${Math.round(n * k)}px`;

    // Short, one-time sad tune (stops the looping theme). Don't replay it when just returning
    // from the leaderboard.
    if (!fromLb) AudioSystem.playGameOver();

    // Dim overlay
    this.add.rectangle(cx, cy, W, H, 0x000000, 0.72);

    // When the leaderboard is enabled the panel grows to fit a result line + a Leaderboard button.
    const lbOn = Leaderboard.enabled();

    // Panel
    this.add.rectangle(cx, cy, Math.round(360 * k), Math.round((lbOn ? 360 : 300) * k), 0x0d1117, 0.95)
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
    fitText(this.add.text(cx, cy - 8 * k, `${time.toFixed(2)}${GT.scoreSurvived}`, {
      fontSize: fp(22), fontFamily: 'Arial', color: '#b0bec5',
    }).setOrigin(0.5), panelW);

    // Best run (most walls; ties broken by more time) — shows both walls and seconds survived.
    const best = this._updateBest(score, time);
    fitText(this.add.text(cx, cy + 34 * k, `${GT.scoreBest}: ${best.walls} ${GT.scoreUnit}, ${best.time.toFixed(2)}${GT.scoreSurvived}`, {
      fontSize: fp(16), fontFamily: 'Arial', color: '#ffd54f',
    }).setOrigin(0.5), panelW);

    // Leaderboard: a result line + a Leaderboard button, and (if this run made the Top 10) a
    // name prompt → submit. Only when a Worker URL is configured; otherwise the panel is unchanged.
    if (lbOn) {
      // Tell the leaderboard to send its Back button to THIS game-over screen (with our payload),
      // not the title — and to skip re-prompting for a name on return (fromLeaderboard).
      const lbNav = { backScene: this.scene.key, backData: { score, time, fromLeaderboard: true } };
      makeButton(this, cx, cy + 96 * k, Math.round(220 * k), Math.round(40 * k),
        GT.leaderboardBtn, 0x18617a, 0x124b5f, () => Flow.go(this, 'leaderboard', lbNav), fp(15));
      // Auto-prompt whenever this run earns a global Top-10 slot (qualifies). Do NOT gate on a
      // personal best — a non-record run can still place on the global board (e.g. your 2nd-best
      // is global #2). score>0 only avoids a 0-wall prompt while the board still has empty slots.
      // Skip it when we came BACK from the leaderboard (don't re-ask for a name).
      if (!fromLb && score > 0 && Leaderboard.qualifies(score, time)) {
        this._handleQualify(score, time);
      }
    }

    // Buttons
    const navY = (lbOn ? 150 : 115) * k;
    makeButton(this, cx - 90 * k, cy + navY, Math.round(160 * k), Math.round(44 * k), GT.btnPlayAgain, 0x29b6f6, 0x0288d1, () => {
      GameScene.noteNewGame();
      Flow.go(this, 'playAgain');
    }, fp(16));
    makeButton(this, cx + 90 * k, cy + navY, Math.round(160 * k), Math.round(44 * k), GT.btnMainMenu, 0x37474f, 0x263238, () => {
      Flow.go(this, 'mainMenu');
    }, fp(16));
  }

  // Qualifying run → prompt for a name → submit → jump straight to the leaderboard so the player
  // sees their placement. Skipping the name prompt leaves them on the game-over screen.
  async _handleQualify(score, time) {
    const name = await promptName(Leaderboard.lastName());
    if (name == null) return; // player skipped
    await Leaderboard.submit(name, score, time);
    if (this.scene.isActive()) {
      Flow.go(this, 'leaderboard', { backScene: this.scene.key, backData: { score, time, fromLeaderboard: true } });
    }
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
