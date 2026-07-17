import { makeButton } from '../Button.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { relayoutOnResize } from '../responsive.js';
import { Flow } from '../Flow.js';
import { GameScene } from './GameScene.js';
import { Leaderboard } from '../leaderboard.js';
import { promptName, closeActivePrompt } from '../nameEntry.js';
import { ClipRecorder } from '../clipRecorder.js';
import { shareClip } from '../shareClip.js';

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

    // When the leaderboard is enabled the panel grows to fit a result line + a Leaderboard button.
    const lbOn = Leaderboard.enabled();

    // Replay clip of the run that just ended (see clipRecorder.js). mightHaveClip() is true while
    // the post-crash capture is still finalizing (≤1.2s), so the panel reserves the button row now
    // and the buttons/loop appear when the blob resolves. False (recording off / unsupported /
    // no run recorded) leaves this screen EXACTLY as it was before the replay feature.
    const replayUi = ClipRecorder.mightHaveClip();

    // Row centers (design px, scaled by k below) + nominal panel height per layout. The
    // non-replay numbers are the original layout, unchanged.
    let rows;
    if (replayUi && lbOn) rows = { replay: 96, lb: 142, nav: 192, panelH: 444 };
    else if (replayUi)    rows = { replay: 78,          nav: 128, panelH: 330 };
    else if (lbOn)        rows = {             lb: 96,  nav: 150, panelH: 360 };
    else                  rows = {                      nav: 115, panelH: 300 };

    // Uniform scale-down on short screens so the fixed-size panel never overflows the viewport.
    // Basis 360 keeps the original layouts byte-for-byte; only the taller replay+leaderboard
    // panel scales from its own height.
    const kBasis = rows.panelH <= 360 ? 360 : rows.panelH + 10;
    const k  = Math.min(1, H / kBasis);
    const fp = (n) => `${Math.round(n * k)}px`;

    // Short, one-time sad tune (stops the looping theme). Don't replay it when just returning
    // from the leaderboard.
    if (!fromLb) AudioSystem.playGameOver();

    // Dim overlay + panel — refs kept so the replay presentation can make them see-through.
    this._dimRect = this.add.rectangle(cx, cy, W, H, 0x000000, 0.72);
    this._panelRect = this.add.rectangle(cx, cy, Math.round(360 * k), Math.round(rows.panelH * k), 0x0d1117, 0.95)
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

    // ── Replay: Watch / Share buttons (hidden until the clip blob resolves) + loop behind the
    // panel. Top-10 SEQUENCING (David's spec): when this run is about to prompt for a name, the
    // whole replay presentation waits — panel stays opaque — until the player skips the prompt
    // or comes back from the leaderboard. Otherwise it appears as soon as the clip is ready.
    this._clip = null;
    this._vid = null;
    this._replayUrl = null;
    this._replayOn = false;
    this._watching = false;
    this._shareBusy = false;
    this._k = k;
    const willPrompt = lbOn && !fromLb && score > 0 && Leaderboard.qualifies(score, time);
    this._replayAllowed = !willPrompt;

    if (replayUi) {
      const ry = cy + rows.replay * k;
      this._watchBtn = this._button(cx - 90 * k, ry, Math.round(160 * k), Math.round(40 * k),
        GT.btnWatchReplay, 0x455a64, 0x37474f, () => this._openWatch(), fp(14));
      this._shareBtn = this._button(cx + 90 * k, ry, Math.round(160 * k), Math.round(40 * k),
        GT.btnShareReplay, 0x2e7d32, 0x1b5e20, () => this._share(), fp(14));
      this._watchBtn.setVisible(false);
      this._shareBtn.setVisible(false);
      ClipRecorder.whenReady().then((clip) => {
        if (!clip || !this.scene.isActive()) return;
        this._clip = clip;
        this._maybeEnableReplay();
      });
      this.events.once('shutdown', () => {
        if (this._replayUrl) { URL.revokeObjectURL(this._replayUrl); this._replayUrl = null; }
      });
    }

    // Leaderboard: a result line + a Leaderboard button, and (if this run made the Top 10) a
    // name prompt → submit. Only when a Worker URL is configured; otherwise the panel is unchanged.
    if (lbOn) {
      // Tell the leaderboard to send its Back button to THIS game-over screen (with our payload),
      // not the title — and to skip re-prompting for a name on return (fromLeaderboard).
      const lbNav = { backScene: this.scene.key, backData: { score, time, fromLeaderboard: true } };
      makeButton(this, cx, cy + rows.lb * k, Math.round(220 * k), Math.round(40 * k),
        GT.leaderboardBtn, 0x18617a, 0x124b5f, () => Flow.go(this, 'leaderboard', lbNav), fp(15));
      // Auto-prompt whenever this run earns a global Top-10 slot (qualifies). Do NOT gate on a
      // personal best — a non-record run can still place on the global board (e.g. your 2nd-best
      // is global #2). score>0 only avoids a 0-wall prompt while the board still has empty slots.
      // Skip it when we came BACK from the leaderboard (don't re-ask for a name).
      if (willPrompt) {
        this._handleQualify(score, time);
      }
    }

    // Buttons
    const navY = rows.nav * k;
    makeButton(this, cx - 90 * k, cy + navY, Math.round(160 * k), Math.round(44 * k), GT.btnPlayAgain, 0x29b6f6, 0x0288d1, () => {
      GameScene.noteNewGame();
      Flow.go(this, 'playAgain');
    }, fp(16));
    makeButton(this, cx + 90 * k, cy + navY, Math.round(160 * k), Math.round(44 * k), GT.btnMainMenu, 0x37474f, 0x263238, () => {
      Flow.go(this, 'mainMenu');
    }, fp(16));
  }

  // Qualifying run → prompt for a name → submit → jump straight to the leaderboard so the player
  // sees their placement. Skipping the name prompt leaves them on the game-over screen — which is
  // when the deferred replay presentation (loop + buttons) is finally allowed to appear.
  async _handleQualify(score, time) {
    const name = await promptName(Leaderboard.lastName());
    if (name == null) { // player skipped — stay here and show the replay
      this._replayAllowed = true;
      this._maybeEnableReplay();
      return;
    }
    await Leaderboard.submit(name, score, time);
    if (this.scene.isActive()) {
      Flow.go(this, 'leaderboard', { backScene: this.scene.key, backData: { score, time, fromLeaderboard: true } });
    }
  }

  // ── Replay presentation ─────────────────────────────────────────────────────

  // Once BOTH the clip is ready AND the Top-10 sequencing allows it: reveal the Watch/Share
  // buttons, start the muted loop behind the panel, and make the panel ~50% transparent.
  _maybeEnableReplay() {
    if (this._replayOn || !this._replayAllowed || !this._clip || !this.scene.isActive()) return;
    this._replayOn = true;
    const { width: W, height: H } = this.scale;
    try {
      this._replayUrl = URL.createObjectURL(this._clip.blob);
      const vid = this.add.video(W / 2, H / 2).setDepth(-5); // behind the dim + panel (depth 0)
      this._vid = vid;
      vid.once('created', () => {          // underlying <video> exists only from here on
        vid.setDisplaySize(W, H);          // fill the screen once dims are known
        this._setVidMute(this._vidShouldBeMuted()); // re-assert — pre-load mute state doesn't stick
      });
      vid.setLoop(true);
      vid.loadURL(this._replayUrl);
      vid.play(true);
      this._setVidMute(true); // background loop is ALWAYS silent; sound belongs to Watch Replay
    } catch { this._vid = null; }
    // See-through only when the loop actually plays behind us.
    if (this._vid) {
      this._dimRect.setFillStyle(0x000000, 0.35);
      this._panelRect.setFillStyle(0x0d1117, 0.5);
    }
    if (this._watchBtn) this._watchBtn.setVisible(true);
    if (this._shareBtn) this._shareBtn.setVisible(true);
  }

  // Full-screen replay view: black cover + the SAME video object brought to the front, with
  // sound per the player's toggles (silent only when Music AND Sound FX are both off), and
  // Share/Back floating on top. Back drops everything back to the panel state.
  _openWatch() {
    if (!this._vid || this._watching) return;
    this._watching = true;
    AudioSystem.stopGameOver(); // don't fight the clip's own audio with the sad tune
    const { width: W, height: H } = this.scale;
    const k = this._k;
    const cover = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 1).setDepth(24)
      .setInteractive(); // swallows taps so the panel buttons underneath can't be hit
    this._vid.setDepth(25);
    this._setVidMute(this._vidShouldBeMuted());
    const by = H - Math.round(34 * k);
    const share = this._button(W / 2 - 95 * k, by, Math.round(170 * k), Math.round(44 * k),
      GT.btnShareReplay, 0x2e7d32, 0x1b5e20, () => this._share(), `${Math.round(15 * k)}px`, 30);
    const back = this._button(W / 2 + 95 * k, by, Math.round(170 * k), Math.round(44 * k),
      GT.btnBack, 0x37474f, 0x263238, () => {
        share.destroy(); back.destroy(); cover.destroy();
        this._watching = false;
        this._setVidMute(true);
        this._vid.setDepth(-5);
      }, `${Math.round(15 * k)}px`, 30);
  }

  // The loop behind the panel is ALWAYS silent (the game-over tune owns that moment); the
  // full-screen Watch Replay view has sound per the player's audio settings — silent only when
  // Music AND Sound FX are both off (the clip is one mixed track, so it's all-or-nothing).
  _vidShouldBeMuted() {
    if (!this._watching) return true;
    return !(AudioSystem.isMusicEnabled() || AudioSystem.isSfxEnabled());
  }

  // Set mute through Phaser AND directly on the underlying <video> element. Phaser's setMute
  // before the element exists (pre-'created') does not reliably carry over to it — the cause of
  // the background loop audibly playing — so every state change re-asserts both.
  _setVidMute(m) {
    if (!this._vid) return;
    try { this._vid.setMute(m); } catch { /* */ }
    const el = this._vid.video;
    if (el) { el.muted = m; if (!m) el.volume = 1; }
  }

  // Hand the clip to the platform's share path (system share sheet / web share / download).
  _share() {
    if (!this._clip || this._shareBusy) return;
    this._shareBusy = true;
    shareClip(this._clip).finally(() => { this._shareBusy = false; });
  }

  // makeButton clone that ALSO returns the label + supports depth and show/hide — needed for the
  // pre-created (hidden) replay buttons and the watch-view overlay. Hidden also drops the hit
  // area so an invisible button can never swallow a tap.
  _button(x, y, w, h, label, fill, hover, cb, fontSize, depth = 0) {
    const bg = this.add.rectangle(x, y, w, h, fill).setInteractive({ useHandCursor: true }).setDepth(depth);
    const txt = fitText(this.add.text(x, y, label, {
      fontSize, fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5).setDepth(depth), w * 0.9, h * 0.8);
    bg.on('pointerover', () => bg.setFillStyle(hover));
    bg.on('pointerout',  () => bg.setFillStyle(fill));
    bg.on('pointerdown', () => bg.setFillStyle(hover));
    bg.on('pointerup',   cb);
    return {
      bg, txt,
      setVisible(v) {
        bg.setVisible(v); txt.setVisible(v);
        if (v) bg.setInteractive({ useHandCursor: true }); else bg.disableInteractive();
      },
      destroy() { bg.destroy(); txt.destroy(); },
    };
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
