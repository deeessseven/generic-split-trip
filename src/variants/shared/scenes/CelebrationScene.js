// View 1 — birthday celebration shown after PLAY. Fireworks + confetti, text on the LEFT, and an
// animated side-view hero (heroSide frames 1..4, looped) as large as fits on the RIGHT, then "tap
// anywhere to START THE GAME". Text is laid out dynamically (fitTextColumn) so any-length gametext
// fits. Variant-only.
import Phaser from 'phaser';
import { GT } from '../../../data/GameText.js';
import { SPRITE_KEYS } from '../../../constants.js';
import { SpriteManager } from '../../../SpriteManager.js';
import { relayoutOnResize } from '../../../responsive.js';
import { safeInsets } from '../../../safeArea.js';
import { Flow } from '../../../Flow.js';
import { startConfetti, startFireworks, makeAnimatedHero, fitTextColumn } from './celebrationFx.js';

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

    // Hero on the RIGHT (as large as fits); text in the LEFT column.
    const heroSize = Math.round(Math.min(H - 16, W * 0.55));
    const heroCx = W - 8 - heroSize / 2;
    const textRight = W - 16 - heroSize;          // text column spans x ∈ [0, textRight]
    const tx = Math.round(textRight / 2);
    const tw = Math.max(140, textRight * 0.9);
    const colTop = si.top + Math.round(8 * s);
    const colBot = H - si.bottom - Math.round(14 * s);
    const colGap = Math.round(10 * s);

    // Festive gradient backdrop
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x3a1c71, 0x5b2a86, 0x1a1a2e, 0x12121f, 1);
    bg.fillRect(0, 0, W, H);

    startFireworks(this, W, H);
    startConfetti(this, W, H);

    // ── Hero — animated side-view, on the RIGHT ──
    const hero = makeAnimatedHero(this, SPRITE_KEYS.CHAR_SIDE, heroCx, H / 2, heroSize, 'celebSideHero', 5);
    this.tweens.add({ targets: hero, y: H / 2 - Math.round(10 * s), duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Text (positions/sizes set by fitTextColumn below) ──
    const title = this.add.text(tx, colTop, GT.celebTitle, {
      fontSize: px(58), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#fff3b0', align: 'center',
      stroke: '#c2185b', strokeThickness: Math.max(3, Math.round(7 * s)),
    }).setDepth(20);
    title.setShadow(0, 0, '#ffd740', Math.round(16 * s), true, true);

    let msgText = null;
    const msg = [GT.celebMsg1, GT.celebMsg2, GT.celebMsg3].filter((l) => l && l.trim()).join('\n');
    if (msg) {
      msgText = this.add.text(tx, 0, msg, {
        fontSize: px(22), fontFamily: 'Arial', color: '#e6fbff', align: 'center',
        wordWrap: { width: tw }, lineSpacing: Math.round(6 * s),
        stroke: '#1a0a2e', strokeThickness: Math.max(3, Math.round(5 * s)),
      }).setDepth(20);
      msgText.setShadow(0, Math.round(2 * s), '#000000', Math.round(7 * s), false, true);
    }

    const tap = this.add.text(tx, colBot, GT.celebTapStart, {
      fontSize: px(26), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      align: 'center', stroke: '#000000', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setDepth(20);

    // Dynamic layout: title→top, tap→bottom, message fits and centers between them.
    fitTextColumn(title, msgText, tap, tx, colTop, colBot, colGap, tw);

    // Idle animations (after layout so measured heights are clean).
    this.tweens.add({ targets: title, scale: 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Tap anywhere → start the game. Short guard so the lingering PLAY tap can't skip it. ──
    let armed = false;
    this.time.delayedCall(450, () => { armed = true; });
    this.input.on('pointerdown', () => { if (armed) Flow.go(this, 'startGame'); });

    this.cameras.main.fadeIn(300, 9, 9, 18);
  }
}
