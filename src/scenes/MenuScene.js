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
    this.add.rectangle(cx, cy, 2, H, 0x4fc3f7, 0.12);

    // Audio toggle pills (top-left). Inset from rounded corners / notch like the HUD labels.
    const corner = Math.round(Math.min(W, H) * 0.02);
    const pillX = corner + si.left;
    const pillTop = corner + si.top;
    this._audioToggle(pillX, pillTop,      'Music: ', () => AudioSystem.isMusicEnabled(), (v) => AudioSystem.setMusicEnabled(v));
    this._audioToggle(pillX, pillTop + 26, 'Sound: ', () => AudioSystem.isSfxEnabled(),   (v) => AudioSystem.setSfxEnabled(v));

    // Hero previews — top-view left, side-view right. Crisp 512px display textures, sized to
    // fit between the PLAY button and the screen edges. Each gets a soft ground shadow and a
    // slow, gentle idle bob (slightly out of phase) so they feel alive.
    const topKey  = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_TOP);
    const sideKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const heroSize = Math.max(96, Math.min(W * 0.6 - 244, W * 0.4 - 24, 400));
    const addHero = (hx, key, delay) => {
      this.add.ellipse(hx, cy + heroSize * 0.40, heroSize * 0.52, heroSize * 0.13, 0x000000, 0.30);
      const img = this.add.image(hx, cy, key).setDisplaySize(heroSize, heroSize);
      this.tweens.add({ targets: img, y: cy - 7, duration: 2200, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    addHero(W * 0.20, topKey, 0);
    addHero(W * 0.80, sideKey, 1100);

    // Title — soft blue glow + a barely-there pulse.
    const title = this.add.text(cx, cy - 130, GT.gameTitle, {
      fontSize: '46px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#29b6f6', strokeThickness: 6,
    }).setOrigin(0.5).setPadding(18);
    title.setShadow(0, 0, '#29b6f6', 18, true, true);
    this.tweens.add({ targets: title, scale: 1.025, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(cx, cy - 82, GT.gameSubtitle, {
      fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#90caf9',
    }).setOrigin(0.5);

    // PLAY — the focal point: a soft pulsing glow behind a bold button.
    const playGlow = this.add.graphics();
    playGlow.fillStyle(0x29b6f6, 1).fillRoundedRect(cx - 124, cy - 50, 248, 64, 16);
    playGlow.setAlpha(0.18);
    this.tweens.add({ targets: playGlow, alpha: 0.42, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    makeButton(this, cx, cy - 18, 220, 50, 'PLAY', 0x29b6f6, 0x0288d1, () => {
      AudioSystem.startMusic('game'); // hard-cut the menu theme the instant Play is tapped
      this.scene.start('GameScene');
    }, '20px');
    // Customize Sprites — much smaller, secondary.
    makeButton(this, cx, cy + 34, 150, 26, GT.settingsTitle, 0x37474f, 0x263238, () => {
      this.scene.start('SettingsScene');
    }, '11px');

    // SURVIVE tip — the whole "LABEL: desc" line centered, just below the buttons.
    const survY = cy + 78;
    const survLabel = this.add.text(0, survY, GT.tipSurviveLabel + ': ', {
      fontSize: '15px', fontFamily: '"Arial Black", Arial', color: '#29b6f6',
    }).setOrigin(0, 0.5);
    const survDesc = this.add.text(0, survY, GT.tipSurviveDesc, {
      fontSize: '15px', fontFamily: 'Arial', color: '#cfd8dc',
    }).setOrigin(0, 0.5);
    const survLeft = cx - (survLabel.width + survDesc.width) / 2;
    survLabel.setX(survLeft);
    survDesc.setX(survLeft + survLabel.width);

    // LEFT / RIGHT panel tips at the bottom of each half (label stacked above description).
    // Anchored above the bottom edge by a 0.03 corner clearance plus the device safe-area bottom.
    const tipMargin = Math.round(Math.min(W, H) * 0.03) + si.bottom;
    const panelTip = (centerX, label, desc) => {
      const d = this.add.text(centerX, H - tipMargin, desc, {
        fontSize: '14px', fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
      }).setOrigin(0.5, 1);
      this.add.text(centerX, H - tipMargin - d.height - 3, label, {
        fontSize: '15px', fontFamily: '"Arial Black", Arial', color: '#29b6f6',
      }).setOrigin(0.5, 1);
    };
    panelTip(W * 0.25, GT.tipLeftLabel,  GT.tipLeftDesc);
    panelTip(W * 0.75, GT.tipRightLabel, GT.tipRightDesc);

    // Copyright — centered along the bottom, clear of the safe area.
    this.add.text(cx, H - 6 - si.bottom, GT.copyright, {
      fontSize: '10px', fontFamily: 'Arial', color: '#607089',
    }).setOrigin(0.5, 1);

    // Classy entrance: a quick fade from the dark background.
    this.cameras.main.fadeIn(350, 9, 9, 18);
  }

  // Tappable On/Off pill button (rounded-rect background + centered label, doubled size)
  // anchored at top-left corner (left, top). Toggles and recolors itself.
  _audioToggle(left, top, label, getEnabled, setEnabled) {
    const h = 23;
    // Measure the widest state ("Off") so the pill width never jumps as it toggles.
    const txt = this.add.text(0, 0, label + 'Off', {
      fontSize: '13px', fontFamily: '"Arial Black", Arial',
    }).setOrigin(0.5).setDepth(10);
    const w = Math.ceil(txt.width) + 16;
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
