// View 1 — a delightful birthday celebration shown right after the player taps PLAY, before the
// game starts. Fireworks + confetti, a birthday message to Small Dino (all text from gametext.txt),
// then "tap anywhere to START THE GAME". Variant-only; the base game never registers this scene.
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
    const cx = W / 2;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;
    const si = safeInsets();

    // Festive gradient backdrop
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x3a1c71, 0x5b2a86, 0x1a1a2e, 0x12121f, 1);
    bg.fillRect(0, 0, W, H);

    startFireworks(this, W, H);
    startConfetti(this, W, H);

    // ── Title ──
    const title = this.add.text(cx, si.top + Math.round(H * 0.04), GT.celebTitle, {
      fontSize: px(58), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#fff3b0', align: 'center',
      stroke: '#c2185b', strokeThickness: Math.max(3, Math.round(7 * s)),
    }).setOrigin(0.5, 0).setDepth(20);
    title.setShadow(0, 0, '#ffd740', Math.round(16 * s), true, true);
    fitText(title, W * 0.92);
    this.tweens.add({ targets: title, scale: 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Hero — full-size, behind everything (text overlays it) ──
    const heroKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const heroSize = 512;  // full native size of the 512px title hero sprite
    const hero = this.add.image(cx, H / 2, heroKey).setDisplaySize(heroSize, heroSize).setDepth(-2);
    this.tweens.add({ targets: hero, y: H / 2 - Math.round(10 * s), duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Message — overlaid on the hero, in the lower-middle (msg1..3 joined) ──
    const msg = [GT.celebMsg1, GT.celebMsg2, GT.celebMsg3].filter((l) => l && l.trim()).join('\n');
    if (msg) {
      const msgText = this.add.text(cx, H * 0.62, msg, {
        fontSize: px(22), fontFamily: 'Arial', color: '#e6fbff', align: 'center',
        wordWrap: { width: W * 0.86 }, lineSpacing: Math.round(6 * s),
        stroke: '#1a0a2e', strokeThickness: Math.max(3, Math.round(5 * s)),
      }).setOrigin(0.5, 0.5).setDepth(20);
      msgText.setShadow(0, Math.round(2 * s), '#000000', Math.round(7 * s), false, true);
      fitText(msgText, W * 0.92);
    }

    // ── Tap prompt ──
    const tap = this.add.text(cx, H - si.bottom - Math.round(22 * s), GT.celebTapStart, {
      fontSize: px(26), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      align: 'center', stroke: '#000000', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 1).setDepth(20);
    fitText(tap, W * 0.92);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Tap anywhere → start the game. Short guard so the lingering PLAY tap can't skip it. ──
    let armed = false;
    this.time.delayedCall(450, () => { armed = true; });
    this.input.on('pointerdown', () => { if (armed) Flow.go(this, 'startGame'); });

    this.cameras.main.fadeIn(300, 9, 9, 18);
  }
}
