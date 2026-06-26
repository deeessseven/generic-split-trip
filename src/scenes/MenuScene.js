import { makeButton } from '../Button.js';
import { SPRITE_KEYS } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { safeInsets } from '../safeArea.js';
import { relayoutOnResize } from '../responsive.js';
import { fitText } from '../fitText.js';
import { buildThumbTexture, addThumbHints } from '../thumbHints.js';
import { Flow } from '../Flow.js';
import { GameScene } from './GameScene.js';
import { Leaderboard } from '../leaderboard.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    SpriteManager.preloadCustom(this);
    SpriteManager.preloadCustomTitle(this);
  }

  create() {
    relayoutOnResize(this);
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
    bg.fillGradientStyle(0x324990, 0x324990, 0x243150, 0x243150, 1); // brighter blue (so shadows read)
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
      const l = fitText(this.add.text(centerX, topTipY, label, {
        fontSize: px(22), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
      }).setOrigin(0.5, 0), W * 0.46);
      const d = this.add.text(centerX, topTipY + l.height + Math.round(3 * s), desc, {
        fontSize: px(20), fontFamily: 'Arial', color: '#cfd8dc',
        align: 'center', wordWrap: { width: W * 0.46 },
      }).setOrigin(0.5, 0);
      tipsBottom = Math.max(tipsBottom, d.y + d.height);
    };
    panelTip(W * 0.25, GT.tipLeftLabel,  GT.tipLeftDesc);
    panelTip(W * 0.75, GT.tipRightLabel, GT.tipRightDesc);

    // ── Audio toggle pills (compact) + copyright, anchored to the bottom ──
    const pillUi = 1.5 * s;
    const pillH = Math.round(23 * pillUi);
    const copyrightY = H - si.bottom - Math.round(6 * s);
    const soundCY = copyrightY - Math.round(26 * s) - pillH / 2 - Math.round(2 * s); // both pills sit ~8px lower than before (dynamic)
    const musicCY = soundCY - (pillH + Math.round(6 * s));
    const pillsTop = musicCY - pillH / 2;
    // Make both pills the SAME width: measure each "<label>Off" (widest toggle state) at the pill
    // font, take the max, add the same padding _audioToggle uses, and pass it to both.
    const measurePill = (label) => {
      const t = this.add.text(0, 0, label + 'Off', { fontSize: `${Math.round(13 * pillUi)}px`, fontFamily: '"Arial Black", Arial' });
      const wpx = Math.ceil(t.width); t.destroy(); return wpx;
    };
    const pillW = Math.max(measurePill('Music: '), measurePill('Sound FX: ')) + Math.round(24 * pillUi);
    this._audioToggle(cx, musicCY, 'Music: ',    () => AudioSystem.isMusicEnabled(), (v) => AudioSystem.setMusicEnabled(v), pillUi, pillW);
    this._audioToggle(cx, soundCY, 'Sound FX: ', () => AudioSystem.isSfxEnabled(),   (v) => AudioSystem.setSfxEnabled(v), pillUi, pillW);

    // Leaderboard button sits just above the audio pills (only when a Worker URL is configured).
    // It joins the bottom "cluster", so `clusterTop` (used for the center-column band below) moves
    // up to include it — keeping the title/PLAY column from overlapping it.
    let clusterTop = pillsTop;
    if (Leaderboard.enabled()) {
      const lbH = Math.round(34 * s);
      const lbW = Math.min(Math.round(260 * s), Math.round(W * 0.7));
      const lbCY = pillsTop - Math.round(6 * s) - lbH / 2; // sits just above the pills (nudged down)
      makeButton(this, cx, lbCY, lbW, lbH, GT.leaderboardBtn, 0x18617a, 0x124b5f,
        () => Flow.go(this, 'leaderboard'), `${Math.round(15 * s)}px`);
      // Reserve a clear gap above the button so the PLAY column never overlaps/touches it.
      clusterTop = lbCY - lbH / 2 - Math.round(22 * s);
    }
    const copyrightTxt = fitText(this.add.text(cx, copyrightY, GT.copyright, {
      fontSize: px(15), fontFamily: 'Arial', color: '#607089',
    }).setOrigin(0.5, 1), W * 0.9);
    // Small version number sitting just to the left of the copyright (build-time __APP_VERSION__).
    const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
    if (appVersion) {
      this.add.text(copyrightTxt.x - copyrightTxt.width / 2 - Math.round(6 * s), copyrightY, `v${appVersion}`, {
        fontSize: px(15), fontFamily: 'Arial', color: '#607089',
      }).setOrigin(1, 1);
    }

    // ── Center column fit-scale: shrink the doubled column to the free band if needed ──
    // Measure the column's REAL height at full scale s (title + SURVIVE built off-screen and
    // discarded), then derive the fit from that instead of a hardcoded estimate. The column
    // scales ~linearly with f, so fit = band/colAtS guarantees PLAY/Customize never spill onto
    // the bottom pills — which the old estimate (+ 0.5 floor) failed to prevent on short screens.
    const band = clusterTop - tipsBottom;
    const gapS = Math.round(14 * s);
    const mTitle = this.add.text(0, -9999, GT.gameTitle, {
      fontSize: `${Math.round(138 * s)}px`, fontFamily: '"Arial Black", Arial, sans-serif',
      stroke: '#29b6f6', strokeThickness: Math.max(3, Math.round(8 * s)),
    }).setOrigin(0.5).setPadding(Math.round(16 * s));
    const mSurv = this.add.text(0, -9999, GT.tipSurviveLabel + ':\n' + GT.tipSurviveDesc, {
      fontSize: `${Math.round(45 * s)}px`, fontFamily: '"Arial Black", Arial', align: 'center',
    }).setOrigin(0.5, 0);
    // gametext showCustomizeSprites toggles the "Customize Sprites" button + its upload page
    // (SettingsScene). When off, the button is not drawn and its height is dropped from the
    // column measurements below so the remaining column (Title → SURVIVE → PLAY) stays centered.
    const showCustomize = String(GT.showCustomizeSprites).trim() === 'true';
    const colAtS = mTitle.height + gapS + mSurv.height + Math.round(gapS * 1.5)
                 + Math.round(144 * s) + (showCustomize ? gapS + Math.round(92 * s) : 0); // + PLAY (+ Customize)
    mTitle.destroy(); mSurv.destroy();
    const fit = Phaser.Math.Clamp((band - Math.round(12 * s)) / colAtS, 0.35, 1);
    const f = s * fit;                                      // column scale
    const fpx = (n) => `${Math.round(n * f)}px`;
    const playW = Math.min(Math.round(570 * f), Math.round(W * 0.7)), playH = Math.round(144 * f);
    const setW  = Math.min(Math.round(500 * f), Math.round(W * 0.7)), setH  = Math.round(92 * f);

    // ── Hero previews flanking the center column; soft shadow + slow idle bob ──
    const topKey  = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_TOP);
    const sideKey = SpriteManager.resolveTitleKey(this, SPRITE_KEYS.CHAR_SIDE);
    const heroSize = Math.max(80, Math.min(W * 0.6 - playW, W * 0.4 - 24, H * 0.6, 460));
    const bob = Math.round(7 * s);
    const addHero = (hx, key, delay, horizontal) => {
      const img = this.add.image(hx, cy, key).setDisplaySize(heroSize, heroSize);
      const t = horizontal ? { x: hx + bob } : { y: cy - bob };
      this.tweens.add({ targets: img, ...t, duration: 2200, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    addHero(W * 0.20, topKey, 0, true);     // top-view hero: subtle slide L/R (it steers horizontally)
    addHero(W * 0.80, sideKey, 1100, false); // side-view hero: subtle bob up/down

    // Animated gesture hints (shared with the first gameplay starts; see thumbHints.js).
    // Left thumb (mirrored) slides L/R = top-down steer; right thumb taps up/down = side rise.
    // Menu copies sit just above the background (depth 4/3), below the center column.
    buildThumbTexture(this);
    addThumbHints(this, { leftX: W * 0.25, rightX: W * 0.75, s, W, H, depthHand: 4, depthShadow: 3 });

    // ── Center column (Title → SURVIVE → PLAY → Customize), measured & centered in the band ──
    const title = this.add.text(cx, 0, GT.gameTitle, {
      fontSize: fpx(138), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#29b6f6', strokeThickness: Math.max(3, Math.round(8 * f)),
      align: 'center', // center each line of a multi-line title (gametext \n)
    }).setOrigin(0.5).setPadding(Math.round(16 * f));
    title.setShadow(0, 0, '#29b6f6', Math.round(18 * f), true, true);
    fitText(title, W * 0.92); // keep a long custom title within the screen width

    // SURVIVE tip as two centered lines: "SURVIVE:" over the description.
    const survLabel = fitText(this.add.text(cx, 0, GT.tipSurviveLabel + ':', {
      fontSize: fpx(45), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
    }).setOrigin(0.5, 0), W * 0.8);
    const survDesc = fitText(this.add.text(cx, 0, GT.tipSurviveDesc, {
      fontSize: fpx(45), fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
    }).setOrigin(0.5, 0), W * 0.8);

    const gap = Math.round(14 * f);
    const titleH = title.height;
    const survH = survLabel.height + survDesc.height;
    const colTotal = titleH + gap + survH + Math.round(gap * 1.5) + playH + (showCustomize ? gap + setH : 0);
    // Centered in the band, then nudged up ~20px (dynamic) so the title/SURVIVE sit higher.
    let yy = Math.max(tipsBottom + Math.round(6 * s), (tipsBottom + clusterTop) / 2 - colTotal / 2 - Math.round(20 * s));

    title.setY(yy + titleH / 2);
    this.tweens.add({ targets: title, scale: 1.025, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    yy += titleH + gap;

    survLabel.setY(yy);
    survDesc.setY(yy + survLabel.height);
    yy += survH + Math.round(gap * 1.5);

    // PLAY — rounded (matching the glow pill) with a soft pulsing glow.
    const playY = yy + playH / 2;
    const playRound = Math.round(16 * f);
    const playGlow = this.add.graphics();
    playGlow.fillStyle(0x29b6f6, 1).fillRoundedRect(
      cx - playW / 2 - 14 * f, playY - playH / 2 - 7 * f, playW + 28 * f, playH + 14 * f, playRound + Math.round(4 * f));
    playGlow.setAlpha(0.18);
    this.tweens.add({ targets: playGlow, alpha: 0.42, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const playFill = this.add.graphics();
    const inset = Math.round(8 * f); // shrink the solid blue rect a little inside the hit area / glow
    const drawPlay = (color) => {
      playFill.clear();
      playFill.fillStyle(color, 1).fillRoundedRect(
        cx - playW / 2 + inset / 2, playY - playH / 2 + inset / 2, playW - inset, playH - inset, playRound);
    };
    drawPlay(0x29b6f6);
    this.add.text(cx, playY, 'PLAY', {
      fontSize: fpx(81), fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.rectangle(cx, playY, playW, playH, 0x000000, 0).setInteractive({ useHandCursor: true })
      .on('pointerover', () => drawPlay(0x0288d1))
      .on('pointerout',  () => drawPlay(0x29b6f6))
      .on('pointerdown', () => drawPlay(0x0288d1))
      .on('pointerup',   () => { GameScene.noteNewGame(); Flow.go(this, 'play'); });
    yy += playH + gap;

    // Customize Sprites button — only when gametext's showCustomizeSprites is on (see colAtS above).
    if (showCustomize) {
      const setY = yy + setH / 2;
      makeButton(this, cx, setY, setW, setH, GT.settingsTitle, 0x37474f, 0x263238, () => {
        Flow.go(this, 'settings');
      }, fpx(44));
    }

    // Classy entrance: a quick fade from the dark background.
    this.cameras.main.fadeIn(350, 9, 9, 18);
  }

  // Tappable On/Off pill button (rounded-rect background + centered label), anchored by its
  // CENTER (centerX, centerY). Toggles and recolors itself.
  _audioToggle(centerX, centerY, label, getEnabled, setEnabled, uiScale = 1, fixedW = 0) {
    const h = Math.round(23 * uiScale);
    // Measure the widest state ("Off") so the pill width never jumps as it toggles.
    const txt = this.add.text(0, 0, label + 'Off', {
      fontSize: `${Math.round(13 * uiScale)}px`, fontFamily: '"Arial Black", Arial',
    }).setOrigin(0.5).setDepth(10);
    // Use the caller's fixed width if given (so both pills match), else size to this label.
    const w = fixedW || (Math.ceil(txt.width) + Math.round(24 * uiScale));
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
