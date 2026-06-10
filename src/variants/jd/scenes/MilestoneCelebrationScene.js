// View 2 — a milestone birthday celebration shown after a crash, but ONLY when the run passed
// >= celebN walls (the variant's gameOver route gates this; if it's reached, we always celebrate).
// Wishes Small Dino a Happy {Nth} birthday and shows this run's live {walls}/{seconds}. "Tap
// anywhere to continue" → the normal Game Over screen (score carried through). Variant-only.
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
    const cx = W / 2;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;
    const si = safeInsets();

    // Live values from this run (the gameOver payload) for {walls} / {seconds}.
    const walls = data && Number.isFinite(data.score) ? data.score : 0;
    const seconds = data && Number.isFinite(data.time) ? data.time : 0;
    const tokens = { N: GT.celebN, Nth: GT.celebNth, walls, seconds };

    // Festive gradient backdrop
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x1b5e20, 0x2e7d32, 0x1a1a2e, 0x12121f, 1);
    bg.fillRect(0, 0, W, H);

    startFireworks(this, W, H);
    startConfetti(this, W, H);

    // ── Title ──
    const title = this.add.text(cx, si.top + Math.round(H * 0.05), fillTokens(GT.milestoneTitle, tokens), {
      fontSize: px(54), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#fff3b0', align: 'center',
      stroke: '#ef6c00', strokeThickness: Math.max(3, Math.round(7 * s)),
    }).setOrigin(0.5, 0).setDepth(20);
    title.setShadow(0, 0, '#ffd740', Math.round(16 * s), true, true);
    fitText(title, W * 0.92);
    this.tweens.add({ targets: title, scale: 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Hero (Small Dino) ──
    const heroKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const heroSize = Math.max(90, Math.min(W * 0.32, H * 0.28, 300));
    const heroY = title.y + title.height + heroSize * 0.5 + Math.round(12 * s);
    const hero = this.add.image(cx, heroY, heroKey).setDisplaySize(heroSize, heroSize).setDepth(15);
    this.tweens.add({ targets: hero, angle: { from: -5, to: 5 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Message (msg1..2 with tokens, non-empty joined) ──
    const msg = [GT.milestoneMsg1, GT.milestoneMsg2]
      .map((l) => fillTokens(l, tokens))
      .filter((l) => l && l.trim())
      .join('\n');
    if (msg) {
      const msgText = this.add.text(cx, heroY + heroSize * 0.5 + Math.round(16 * s), msg, {
        fontSize: px(23), fontFamily: 'Arial', color: '#e6fbff', align: 'center',
        wordWrap: { width: W * 0.86 }, lineSpacing: Math.round(6 * s),
      }).setOrigin(0.5, 0).setDepth(20);
      fitText(msgText, W * 0.92);
    }

    // ── Tap prompt ──
    const tap = this.add.text(cx, H - si.bottom - Math.round(22 * s), GT.milestoneTapContinue, {
      fontSize: px(24), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      align: 'center', stroke: '#000000', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 1).setDepth(20);
    fitText(tap, W * 0.92);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Tap anywhere → normal Game Over screen, carrying the run's score data. ──
    let armed = false;
    this.time.delayedCall(450, () => { armed = true; });
    this.input.on('pointerdown', () => { if (armed) Flow.go(this, 'afterMilestone', data); });

    this.cameras.main.fadeIn(300, 9, 9, 18);
  }
}
