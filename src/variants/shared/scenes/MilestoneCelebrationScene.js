// View 2 — a milestone birthday celebration shown after a crash, but ONLY when the run passed
// >= celebN walls (the variant's gameOver route gates this; if it's reached, we always celebrate).
// Shows this run's live {walls}/{seconds}. "Tap anywhere to continue" → the normal Game Over screen
// (score carried through). Two-column layout: hero LEFT, text RIGHT. Variant-only.
import Phaser from 'phaser';
import { GT } from '../../../data/GameText.js';
import { SPRITE_KEYS } from '../../../constants.js';
import { SpriteManager } from '../../../SpriteManager.js';
import { relayoutOnResize } from '../../../responsive.js';
import { fitText } from '../../../fitText.js';
import { safeInsets } from '../../../safeArea.js';
import { Flow } from '../../../Flow.js';
import { startConfetti, startFireworks, fillTokens } from './celebrationFx.js';

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

    // Two-column layout: hero pinned LEFT, all text in the RIGHT column beside it.
    const heroSize = Math.min(512, Math.round(W * 0.55));
    const heroRight = 8 + heroSize;
    const heroCx = 8 + heroSize / 2;
    const rx = Math.round((heroRight + W) / 2);
    const rw = Math.max(140, (W - heroRight) * 0.9);

    // Festive gradient backdrop
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x1b5e20, 0x2e7d32, 0x1a1a2e, 0x12121f, 1);
    bg.fillRect(0, 0, W, H);

    startFireworks(this, W, H);
    startConfetti(this, W, H);

    // ── Hero — full-size, on the LEFT ──
    const heroKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const hero = this.add.image(heroCx, H / 2, heroKey).setDisplaySize(heroSize, heroSize).setDepth(-2);
    this.tweens.add({ targets: hero, angle: { from: -4, to: 4 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Title — RIGHT column, top ──
    const title = this.add.text(rx, si.top + Math.round(H * 0.10), fillTokens(GT.milestoneTitle, tokens), {
      fontSize: px(54), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#fff3b0', align: 'center',
      stroke: '#ef6c00', strokeThickness: Math.max(3, Math.round(7 * s)),
    }).setOrigin(0.5, 0).setDepth(20);
    title.setShadow(0, 0, '#ffd740', Math.round(16 * s), true, true);
    fitText(title, rw);
    this.tweens.add({ targets: title, scale: 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Message — RIGHT column, middle (msg1..2 with tokens) ──
    const msg = [GT.milestoneMsg1, GT.milestoneMsg2]
      .map((l) => fillTokens(l, tokens))
      .filter((l) => l && l.trim())
      .join('\n');
    if (msg) {
      const msgText = this.add.text(rx, H * 0.56, msg, {
        fontSize: px(23), fontFamily: 'Arial', color: '#e6fbff', align: 'center',
        wordWrap: { width: rw }, lineSpacing: Math.round(6 * s),
        stroke: '#0a2e12', strokeThickness: Math.max(3, Math.round(5 * s)),
      }).setOrigin(0.5, 0.5).setDepth(20);
      msgText.setShadow(0, Math.round(2 * s), '#000000', Math.round(7 * s), false, true);
      fitText(msgText, rw);
    }

    // ── Tap prompt — RIGHT column, bottom ──
    const tap = this.add.text(rx, H - si.bottom - Math.round(22 * s), GT.milestoneTapContinue, {
      fontSize: px(24), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      align: 'center', stroke: '#000000', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 1).setDepth(20);
    fitText(tap, rw);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Tap anywhere → normal Game Over screen, carrying the run's score data. ──
    let armed = false;
    this.time.delayedCall(450, () => { armed = true; });
    this.input.on('pointerdown', () => { if (armed) Flow.go(this, 'afterMilestone', data); });

    this.cameras.main.fadeIn(300, 9, 9, 18);
  }
}
