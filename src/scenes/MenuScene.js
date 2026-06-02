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
    // RELATIVE layout: a UI scale `s` (vs the 540 design height) drives sizes; X positions are
    // fractions of W. Font TARGETS below are doubled from the old design; the center column is
    // then fit-scaled to the free band between the top tips and the bottom pills so the doubled
    // text gets as large as the screen allows without overlapping.
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
    this.add.rectangle(cx, cy, Math.max(2, Math.round(2 * s)), H, 0x4fc3f7, 0.12); // center seam

    // ── LEFT / RIGHT panel tips at the TOP of each half (doubled) ──
    const topTipY = Math.round(Math.min(W, H) * 0.04) + si.top;
    let tipsBottom = topTipY;
    const panelTip = (centerX, label, desc) => {
      const l = this.add.text(centerX, topTipY, label, {
        fontSize: px(30), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
      }).setOrigin(0.5, 0);
      const d = this.add.text(centerX, topTipY + l.height + Math.round(3 * s), desc, {
        fontSize: px(26), fontFamily: 'Arial', color: '#cfd8dc',
        align: 'center', wordWrap: { width: W * 0.46 },
      }).setOrigin(0.5, 0);
      tipsBottom = Math.max(tipsBottom, d.y + d.height);
    };
    panelTip(W * 0.25, GT.tipLeftLabel,  GT.tipLeftDesc);
    panelTip(W * 0.75, GT.tipRightLabel, GT.tipRightDesc);

    // ── Audio toggle pills (compact) + copyright, anchored to the bottom ──
    const pillUi = s;
    const pillH = Math.round(23 * pillUi);
    const copyrightY = H - si.bottom - Math.round(6 * s);
    const soundCY = copyrightY - Math.round(26 * s) - pillH / 2;
    const musicCY = soundCY - (pillH + Math.round(6 * s));
    const pillsTop = musicCY - pillH / 2;
    this._audioToggle(cx, musicCY, 'Music: ', () => AudioSystem.isMusicEnabled(), (v) => AudioSystem.setMusicEnabled(v), pillUi);
    this._audioToggle(cx, soundCY, 'Sound: ', () => AudioSystem.isSfxEnabled(),   (v) => AudioSystem.setSfxEnabled(v), pillUi);
    this.add.text(cx, copyrightY, GT.copyright, {
      fontSize: px(20), fontFamily: 'Arial', color: '#607089',
    }).setOrigin(0.5, 1);

    // ── Center column fit-scale: shrink the doubled column to the free band if needed ──
    const band = pillsTop - tipsBottom;
    const colEst = 92 * s * 1.15 + 2 * Math.round(16 * s)   // title (+padding)
                 + 30 * s * 1.35 * 2                        // SURVIVE (2 lines)
                 + (96 + 46) * s                            // PLAY (larger) + Customize heights
                 + (14 + 21 + 14) * s;                      // gaps
    const fit = Phaser.Math.Clamp((band - 12 * s) / colEst, 0.5, 1);
    const f = s * fit;                                      // column scale
    const fpx = (n) => `${Math.round(n * f)}px`;
    const playW = Math.round(380 * f), playH = Math.round(96 * f);
    const setW  = Math.round(250 * f), setH  = Math.round(46 * f);

    // ── Hero previews flanking the center column; soft shadow + slow idle bob ──
    const topKey  = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_TOP);
    const sideKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const heroSize = Math.max(80, Math.min(W * 0.6 - playW, W * 0.4 - 24, H * 0.6, 460));
    const bob = Math.round(7 * s);
    const addHero = (hx, key, delay) => {
      this.add.ellipse(hx, cy + heroSize * 0.40, heroSize * 0.52, heroSize * 0.13, 0x000000, 0.30);
      const img = this.add.image(hx, cy, key).setDisplaySize(heroSize, heroSize);
      this.tweens.add({ targets: img, y: cy - bob, duration: 2200, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    addHero(W * 0.20, topKey, 0);
    addHero(W * 0.80, sideKey, 1100);

    // ── Center column (Title → SURVIVE → PLAY → Customize), measured & centered in the band ──
    const title = this.add.text(cx, 0, GT.gameTitle, {
      fontSize: fpx(92), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#29b6f6', strokeThickness: Math.max(3, Math.round(8 * f)),
    }).setOrigin(0.5).setPadding(Math.round(16 * f));
    title.setShadow(0, 0, '#29b6f6', Math.round(18 * f), true, true);

    // SURVIVE tip as two centered lines: "SURVIVE:" over the description.
    const survLabel = this.add.text(cx, 0, GT.tipSurviveLabel + ':', {
      fontSize: fpx(30), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
    }).setOrigin(0.5, 0);
    const survDesc = this.add.text(cx, 0, GT.tipSurviveDesc, {
      fontSize: fpx(30), fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
    }).setOrigin(0.5, 0);

    const gap = Math.round(14 * f);
    const titleH = title.height;
    const survH = survLabel.height + survDesc.height;
    const colTotal = titleH + gap + survH + Math.round(gap * 1.5) + playH + gap + setH;
    let yy = Math.max(tipsBottom + Math.round(6 * s), (tipsBottom + pillsTop) / 2 - colTotal / 2);

    title.setY(yy + titleH / 2);
    this.tweens.add({ targets: title, scale: 1.025, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    yy += titleH + gap;

    survLabel.setY(yy);
    survDesc.setY(yy + survLabel.height);
    yy += survH + Math.round(gap * 1.5);

    // PLAY — larger, with ROUNDED corners (matching the glow pill) and a soft pulsing glow.
    const playY = yy + playH / 2;
    const playRound = Math.round(16 * f);
    const playGlow = this.add.graphics();
    playGlow.fillStyle(0x29b6f6, 1).fillRoundedRect(
      cx - playW / 2 - 14 * f, playY - playH / 2 - 7 * f, playW + 28 * f, playH + 14 * f, playRound + Math.round(4 * f));
    playGlow.setAlpha(0.18);
    this.tweens.add({ targets: playGlow, alpha: 0.42, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const playFill = this.add.graphics();
    const drawPlay = (color) => {
      playFill.clear();
      playFill.fillStyle(color, 1).fillRoundedRect(cx - playW / 2, playY - playH / 2, playW, playH, playRound);
    };
    drawPlay(0x29b6f6);
    this.add.text(cx, playY, 'PLAY', {
      fontSize: fpx(54), fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.rectangle(cx, playY, playW, playH, 0x000000, 0).setInteractive({ useHandCursor: true })
      .on('pointerover', () => drawPlay(0x0288d1))
      .on('pointerout',  () => drawPlay(0x29b6f6))
      .on('pointerdown', () => drawPlay(0x0288d1))
      .on('pointerup',   () => { AudioSystem.startMusic('game'); this.scene.start('GameScene'); });
    yy += playH + gap;

    const setY = yy + setH / 2;
    makeButton(this, cx, setY, setW, setH, GT.settingsTitle, 0x37474f, 0x263238, () => {
      this.scene.start('SettingsScene');
    }, fpx(22));

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
