// View 2 — milestone celebration after a qualifying crash (run passed >= celebN walls). An animated
// top-view hero (heroTop frames 1..4, looped) as large as fits on the LEFT, text on the RIGHT
// showing this run's {walls}/{seconds}. "Tap anywhere to continue" → the normal Game Over screen
// (score carried). Text is laid out dynamically (fitTextColumn) so any-length gametext fits.
import Phaser from 'phaser';
import { GT } from '../../../data/GameText.js';
import { SPRITE_KEYS } from '../../../constants.js';
import { SpriteManager } from '../../../SpriteManager.js';
import { relayoutOnResize } from '../../../responsive.js';
import { safeInsets } from '../../../safeArea.js';
import { Flow } from '../../../Flow.js';
import { startConfetti, startFireworks, fillTokens, makeAnimatedHero, fitTextColumn } from './celebrationFx.js';

export class MilestoneCelebrationScene extends Phaser.Scene {
  constructor() { super('MilestoneCelebrationScene'); }

  preload() {
    SpriteManager.preloadCustom(this);
    SpriteManager.preloadCustomTitle(this);
  }

  create(data) {
    relayoutOnResize(this);
    const { width: W, height: H } = this.scale;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;
    const si = safeInsets();

    // Live values from this run (the gameOver payload) for {walls} / {seconds}.
    const walls = data && Number.isFinite(data.score) ? data.score : 0;
    const seconds = data && Number.isFinite(data.time) ? data.time : 0;
    const tokens = { N: GT.celebN, Nth: GT.celebNth, walls, seconds };

    // Hero on the LEFT (as large as fits); text in the RIGHT column.
    const heroSize = Math.round(Math.min(H - 16, W * 0.55));
    const heroCx = 8 + heroSize / 2;
    const heroRight = 16 + heroSize;              // text column spans x ∈ [heroRight, W]
    const tx = Math.round((heroRight + W) / 2);
    const tw = Math.max(140, (W - heroRight) * 0.9);
    const colTop = si.top + Math.round(8 * s);
    const colBot = H - si.bottom - Math.round(14 * s);
    const colGap = Math.round(10 * s);

    // Festive gradient backdrop
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x1b5e20, 0x2e7d32, 0x1a1a2e, 0x12121f, 1);
    bg.fillRect(0, 0, W, H);

    startFireworks(this, W, H);
    startConfetti(this, W, H);

    // ── Hero — animated top-view, on the LEFT ──
    const hero = makeAnimatedHero(this, SPRITE_KEYS.CHAR_TOP, heroCx, H / 2, heroSize, 'milestoneTopHero', 5);
    this.tweens.add({ targets: hero, y: H / 2 - Math.round(10 * s), duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Text (positions/sizes set by fitTextColumn below) ──
    const title = this.add.text(tx, colTop, fillTokens(GT.milestoneTitle, tokens), {
      fontSize: px(54), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#fff3b0', align: 'center',
      stroke: '#ef6c00', strokeThickness: Math.max(3, Math.round(7 * s)),
    }).setDepth(20);
    title.setShadow(0, 0, '#ffd740', Math.round(16 * s), true, true);

    let msgText = null;
    const msg = [GT.milestoneMsg1, GT.milestoneMsg2]
      .map((l) => fillTokens(l, tokens))
      .filter((l) => l && l.trim())
      .join('\n');
    if (msg) {
      msgText = this.add.text(tx, 0, msg, {
        fontSize: px(23), fontFamily: 'Arial', color: '#e6fbff', align: 'center',
        wordWrap: { width: tw }, lineSpacing: Math.round(6 * s),
        stroke: '#0a2e12', strokeThickness: Math.max(3, Math.round(5 * s)),
      }).setDepth(20);
      msgText.setShadow(0, Math.round(2 * s), '#000000', Math.round(7 * s), false, true);
    }

    const tap = this.add.text(tx, colBot, GT.milestoneTapContinue, {
      fontSize: px(24), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      align: 'center', stroke: '#000000', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setDepth(20);

    // Dynamic layout: title→top, tap→bottom, message fits and centers between them.
    fitTextColumn(title, msgText, tap, tx, colTop, colBot, colGap, tw);

    // Idle animations (after layout so measured heights are clean).
    this.tweens.add({ targets: title, scale: 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Tap anywhere → normal Game Over screen, carrying the run's score data. ──
    let armed = false;
    this.time.delayedCall(450, () => { armed = true; });
    this.input.on('pointerdown', () => { if (armed) Flow.go(this, 'afterMilestone', data); });

    this.cameras.main.fadeIn(300, 9, 9, 18);
  }
}
