import { makeButton } from '../Button.js';
import { SPRITE_KEYS } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    SpriteManager.preloadCustom(this);
    SpriteManager.preloadCustomTitle(this);
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;

    // Start the looping theme (defers until the audio context is unlocked by a tap).
    AudioSystem.startMusic();

    // Background gradient via two rects
    this.add.rectangle(cx, cy, W, H, 0x0d0d1a);
    this.add.rectangle(cx, cy * 0.5, W, cy, 0x1a1a3e, 0.6);

    // Audio toggles (top-left). Persisted; apply game-wide.
    this._audioToggle(10, 8,  'Music: ', () => AudioSystem.isMusicEnabled(), (v) => AudioSystem.setMusicEnabled(v));
    this._audioToggle(10, 30, 'Sound: ', () => AudioSystem.isSfxEnabled(),   (v) => AudioSystem.setSfxEnabled(v));

    // Decorative split-screen preview lines
    this.add.rectangle(cx, cy, 3, H, 0x29b6f6, 0.4);

    // Hero sprite previews — top view left, side view right, 2× scale
    // Use 400px title-size textures for crisp display; fall back gracefully if not yet uploaded.
    // Size the heroes as large as fits — bounded by the PLAY button and the screen edges,
    // with a small margin, capped at the 400px native texture size:
    //   PLAY clearance: hero right edge (0.20W + size/2) must stay left of the button's left
    //     edge (0.5W − 110, button is 220px wide centered) → size ≤ 0.6W − 220.
    //   Screen edge:    hero half (size/2) must fit within the 0.20W margin → size ≤ 0.4W.
    const topKey  = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_TOP);
    const sideKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const heroSize = Math.max(96, Math.min(W * 0.6 - 244, W * 0.4 - 24, 400));
    this.add.image(W * 0.20, cy, topKey).setDisplaySize(heroSize, heroSize);
    this.add.image(W * 0.80, cy, sideKey).setDisplaySize(heroSize, heroSize);

    // Title
    this.add.text(cx, cy - 130, GT.gameTitle, {
      fontSize: '46px',
      fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff',
      stroke: '#29b6f6',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 82, GT.gameSubtitle, {
      fontSize: '15px',
      fontFamily: 'Arial, sans-serif',
      color: '#90caf9',
    }).setOrigin(0.5);

    // Buttons
    makeButton(this, cx, cy - 18, 220, 50, 'PLAY', 0x29b6f6, 0x0288d1, () => {
      this.scene.start('GameScene');
    }, '18px');
    makeButton(this, cx, cy + 50, 220, 44, GT.settingsTitle, 0x37474f, 0x263238, () => {
      this.scene.start('SettingsScene');
    }, '18px');

    // How to play
    const tips = [
      [GT.tipLeftLabel,    GT.tipLeftDesc],
      [GT.tipRightLabel,   GT.tipRightDesc],
      [GT.tipSurviveLabel, GT.tipSurviveDesc],
    ];
    tips.forEach(([label, desc], i) => {
      const y = cy + 115 + i * 34;
      this.add.text(cx - 10, y, label + ':', {
        fontSize: '12px', fontFamily: '"Arial Black", Arial',
        color: '#29b6f6', align: 'right',
      }).setOrigin(1, 0.5);
      this.add.text(cx + 6, y, desc, {
        fontSize: '12px', fontFamily: 'Arial',
        color: '#cfd8dc', align: 'left',
      }).setOrigin(0, 0.5);
    });

    // Version
    this.add.text(W - 8, H - 6, GT.gameVersion, {
      fontSize: '10px', fontFamily: 'Arial', color: '#546e7a',
    }).setOrigin(1, 1);
  }

  // Small tappable On/Off label that toggles and recolors itself.
  _audioToggle(x, y, label, getEnabled, setEnabled) {
    const color = () => (getEnabled() ? '#9fe7ff' : '#667');
    const txt = this.add.text(x, y, label + (getEnabled() ? 'On' : 'Off'), {
      fontSize: '13px', fontFamily: 'Arial', color: color(),
    }).setDepth(10).setInteractive({ useHandCursor: true });
    txt.on('pointerup', () => {
      const v = !getEnabled();
      setEnabled(v);
      txt.setText(label + (v ? 'On' : 'Off')).setColor(color());
    });
    return txt;
  }
}
