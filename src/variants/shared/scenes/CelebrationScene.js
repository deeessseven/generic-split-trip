// View 1 — a delightful birthday celebration shown right after the player taps PLAY, before the
// game starts. Fireworks + confetti, a birthday message (all text from gametext.txt), then "tap
// anywhere to START THE GAME". Two-column layout: hero on the LEFT, text in a RIGHT column (so the
// large title doesn't cover the hero). Variant-only; the base game never registers this scene.
import Phaser from 'phaser';
import { GT } from '../../../data/GameText.js';
import { SPRITE_KEYS } from '../../../constants.js';
import { SpriteManager } from '../../../SpriteManager.js';
import { relayoutOnResize } from '../../../responsive.js';
import { fitText } from '../../../fitText.js';
import { safeInsets } from '../../../safeArea.js';
import { Flow } from '../../../Flow.js';
import { startConfetti, startFireworks } from './celebrationFx.js';

export class CelebrationScene extends Phaser.Scene {
  constructor() { super('CelebrationScene'); }

  preload() {
    SpriteManager.preloadCustom(this);
    SpriteManager.preloadCustomTitle(this);
  }

  create() {
    relayoutOnResize(this);
    const { width: W, height: H } = this.scale;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;
    const si = safeInsets();

    // Two-column layout: hero pinned LEFT, all text in the RIGHT column beside it.
    const heroSize = Math.min(512, Math.round(W * 0.55)); // full 512 on the 960-wide game; smaller if narrower
    const heroRight = 8 + heroSize;                       // hero occupies x ∈ [8, heroRight]
    const heroCx = 8 + heroSize / 2;
    const rx = Math.round((heroRight + W) / 2);           // center of the right text column
    const rw = Math.max(140, (W - heroRight) * 0.9);      // text wrap/fit width

    // Festive gradient backdrop
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x3a1c71, 0x5b2a86, 0x1a1a2e, 0x12121f, 1);
    bg.fillRect(0, 0, W, H);

    startFireworks(this, W, H);
    startConfetti(this, W, H);

    // ── Hero — full-size, on the LEFT ──
    const heroKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const hero = this.add.image(heroCx, H / 2, heroKey).setDisplaySize(heroSize, heroSize).setDepth(-2);
    this.tweens.add({ targets: hero, y: H / 2 - Math.round(10 * s), duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Title — RIGHT column, top ──
    const title = this.add.text(rx, si.top + Math.round(H * 0.10), GT.celebTitle, {
      fontSize: px(58), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#fff3b0', align: 'center',
      stroke: '#c2185b', strokeThickness: Math.max(3, Math.round(7 * s)),
    }).setOrigin(0.5, 0).setDepth(20);
    title.setShadow(0, 0, '#ffd740', Math.round(16 * s), true, true);
    fitText(title, rw);
    this.tweens.add({ targets: title, scale: 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Message — RIGHT column, middle (msg1..3 joined) ──
    const msg = [GT.celebMsg1, GT.celebMsg2, GT.celebMsg3].filter((l) => l && l.trim()).join('\n');
    if (msg) {
      const msgText = this.add.text(rx, H * 0.56, msg, {
        fontSize: px(22), fontFamily: 'Arial', color: '#e6fbff', align: 'center',
        wordWrap: { width: rw }, lineSpacing: Math.round(6 * s),
        stroke: '#1a0a2e', strokeThickness: Math.max(3, Math.round(5 * s)),
      }).setOrigin(0.5, 0.5).setDepth(20);
      msgText.setShadow(0, Math.round(2 * s), '#000000', Math.round(7 * s), false, true);
      fitText(msgText, rw);
    }

    // ── Tap prompt — RIGHT column, bottom ──
    const tap = this.add.text(rx, H - si.bottom - Math.round(22 * s), GT.celebTapStart, {
      fontSize: px(26), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      align: 'center', stroke: '#000000', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 1).setDepth(20);
    fitText(tap, rw);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Tap anywhere → start the game. Short guard so the lingering PLAY tap can't skip it. ──
    let armed = false;
    this.time.delayedCall(450, () => { armed = true; });
    this.input.on('pointerdown', () => { if (armed) Flow.go(this, 'startGame'); });

    this.cameras.main.fadeIn(300, 9, 9, 18);
  }
}
