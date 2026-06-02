import { makeButton } from '../Button.js';
import { SPRITE_KEYS } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { safeInsets } from '../safeArea.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    SpriteManager.preloadCustom(this);
    SpriteManager.preloadCustomTitle(this);
    SpriteManager.preloadCustomFull(this);
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;

    // Start the slow/happy menu theme (defers until the audio context is unlocked by a tap).
    AudioSystem.startMusic('menu');

    const si = safeInsets();
    // Everything below is laid out RELATIVE to the screen: a single UI scale `s` (vs the 540
    // design height) drives all font/button sizes and vertical offsets, and X positions are
    // fractions of W. So the menu scales and stays balanced on any screen size.
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;

    // ── Background: vertical gradient → slow drifting dots → vignette frame ──
    const bg = this.add.graphics().setDepth(-3);
    bg.fillGradientStyle(0x1b2552, 0x1b2552, 0x07070f, 0x07070f, 1); // navy (top) → near-black (bottom)
    bg.fillRect(0, 0, W, H);
    if (this.textures.exists('st_parallax')) {
      const dots = this.add.tileSprite(cx, cy, W, H, 'st_parallax').setAlpha(0.20).setDepth(-2);
      this.tweens.add({ targets: dots, tilePositionX: 256, tilePositionY: 140, duration: 60000, repeat: -1 });
    }
    if (this.textures.exists('st_vignette')) {
      this.add.image(cx, cy, 'st_vignette').setDisplaySize(W, H).setAlpha(0.7).setDepth(-1);
    }

    // Subtle center seam between the two preview halves
    this.add.rectangle(cx, cy, Math.max(2, Math.round(2 * s)), H, 0x4fc3f7, 0.12);

    // ── LEFT / RIGHT panel tips at the TOP of each half (label over description) ──
    const topTipY = Math.round(Math.min(W, H) * 0.04) + si.top;
    const panelTip = (centerX, label, desc) => {
      const l = this.add.text(centerX, topTipY, label, {
        fontSize: px(15), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
      }).setOrigin(0.5, 0);
      this.add.text(centerX, topTipY + l.height + Math.round(3 * s), desc, {
        fontSize: px(13), fontFamily: 'Arial', color: '#cfd8dc',
        align: 'center', wordWrap: { width: W * 0.47 },
      }).setOrigin(0.5, 0);
    };
    panelTip(W * 0.25, GT.tipLeftLabel,  GT.tipLeftDesc);
    panelTip(W * 0.75, GT.tipRightLabel, GT.tipRightDesc);

    // ── Hero previews flanking the center column; soft shadow + slow idle bob ──
    const topKey  = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_TOP);
    const sideKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    // Fit between the center button column and the screen edges, and within the height.
    const heroSize = Math.max(80, Math.min(W * 0.6 - 220 * s, W * 0.4 - 24, H * 0.6, 400));
    const bob = Math.round(7 * s);
    const addHero = (hx, key, delay) => {
      this.add.ellipse(hx, cy + heroSize * 0.40, heroSize * 0.52, heroSize * 0.13, 0x000000, 0.30);
      const img = this.add.image(hx, cy, key).setDisplaySize(heroSize, heroSize);
      this.tweens.add({ targets: img, y: cy - bob, duration: 2200, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    addHero(W * 0.20, topKey, 0);
    addHero(W * 0.80, sideKey, 1100);

    // ── Center column: Title → SURVIVE line → PLAY → Customize Sprites ──
    // Title (nudged down ~20px from before), soft blue glow + a barely-there pulse.
    const title = this.add.text(cx, cy - 110 * s, GT.gameTitle, {
      fontSize: px(46), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#29b6f6', strokeThickness: Math.max(3, Math.round(6 * s)),
    }).setOrigin(0.5).setPadding(18);
    title.setShadow(0, 0, '#29b6f6', 18, true, true);
    this.tweens.add({ targets: title, scale: 1.025, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // SURVIVE tip line (replaces the old subtitle), centered just under the title.
    const survY = cy - 62 * s;
    const survLabel = this.add.text(0, survY, GT.tipSurviveLabel + ': ', {
      fontSize: px(15), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
    }).setOrigin(0, 0.5);
    const survDesc = this.add.text(0, survY, GT.tipSurviveDesc, {
      fontSize: px(15), fontFamily: 'Arial', color: '#cfd8dc',
    }).setOrigin(0, 0.5);
    const survLeft = cx - (survLabel.width + survDesc.width) / 2;
    survLabel.setX(survLeft);
    survDesc.setX(survLeft + survLabel.width);

    // PLAY — the focal point: a soft pulsing glow behind a bold button.
    const playY = cy - 6 * s;
    const playW = Math.round(220 * s), playH = Math.round(50 * s);
    const playGlow = this.add.graphics();
    playGlow.fillStyle(0x29b6f6, 1).fillRoundedRect(
      cx - playW / 2 - 14 * s, playY - playH / 2 - 7 * s, playW + 28 * s, playH + 14 * s, 16 * s);
    playGlow.setAlpha(0.18);
    this.tweens.add({ targets: playGlow, alpha: 0.42, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    makeButton(this, cx, playY, playW, playH, 'PLAY', 0x29b6f6, 0x0288d1, () => {
      AudioSystem.startMusic('game'); // hard-cut the menu theme the instant Play is tapped
      this.scene.start('GameScene');
    }, px(20));
    // Customize Sprites — much smaller, secondary.
    makeButton(this, cx, cy + 42 * s, Math.round(150 * s), Math.round(26 * s), GT.settingsTitle,
      0x37474f, 0x263238, () => { this.scene.start('SettingsScene'); }, px(11));

    // ── Audio toggle pills — bottom-center, stacked just above the copyright ──
    const pillH = Math.round(23 * s);
    const soundCY = H - si.bottom - Math.round(36 * s);
    const musicCY = soundCY - (pillH + Math.round(4 * s));
    this._audioToggle(cx, musicCY, 'Music: ', () => AudioSystem.isMusicEnabled(), (v) => AudioSystem.setMusicEnabled(v), s);
    this._audioToggle(cx, soundCY, 'Sound: ', () => AudioSystem.isSfxEnabled(),   (v) => AudioSystem.setSfxEnabled(v), s);

    // ── Copyright — centered along the bottom, clear of the safe area ──
    this.add.text(cx, H - si.bottom - Math.round(5 * s), GT.copyright, {
      fontSize: px(10), fontFamily: 'Arial', color: '#607089',
    }).setOrigin(0.5, 1);

    // Classy entrance: a quick fade from the dark background.
    this.cameras.main.fadeIn(350, 9, 9, 18);
  }

  // Tappable On/Off pill button (rounded-rect background + centered label), anchored by its
  // CENTER (centerX, centerY). Toggles and recolors itself.
  _audioToggle(centerX, centerY, label, getEnabled, setEnabled, uiScale = 1) {
    const h = Math.round(23 * uiScale);
    // Measure the widest state ("Off") so the pill width never jumps as it toggles.
    const txt = this.add.text(0, 0, label + 'Off', {
      fontSize: `${Math.round(13 * uiScale)}px`, fontFamily: '"Arial Black", Arial',
    }).setOrigin(0.5).setDepth(10);
    const w = Math.ceil(txt.width) + Math.round(16 * uiScale);
    const left = Math.round(centerX - w / 2), top = Math.round(centerY - h / 2);
    const cx = left + w / 2, cy = top + h / 2;
    txt.setPosition(cx, cy);

    const g = this.add.graphics().setDepth(9);
    const apply = () => {
      const on = getEnabled();
      txt.setText(label + (on ? 'On' : 'Off')).setColor(on ? '#e6fbff' : '#9aa3ad');
      g.clear();
      g.fillStyle(on ? 0x18617a : 0x2a2a3a, 1);
      g.fillRoundedRect(left, top, w, h, h / 2);
      g.lineStyle(2, on ? 0x4fc3f7 : 0x4a4a5a, 1);
      g.strokeRoundedRect(left, top, w, h, h / 2);
    };
    apply();

    // Transparent hit zone over the pill handles taps (kept above the label).
    const zone = this.add.rectangle(cx, cy, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(10);
    zone.on('pointerup', () => { setEnabled(!getEnabled()); apply(); });
    return zone;
  }
}
