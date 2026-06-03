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
      const l = this.add.text(centerX, topTipY, label, {
        fontSize: px(22), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
      }).setOrigin(0.5, 0);
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
    const soundCY = copyrightY - Math.round(26 * s) - pillH / 2 - Math.round(10 * s); // nudged up 10px
    const musicCY = soundCY - (pillH + Math.round(6 * s));
    const pillsTop = musicCY - pillH / 2;
    this._audioToggle(cx, musicCY, 'Music: ', () => AudioSystem.isMusicEnabled(), (v) => AudioSystem.setMusicEnabled(v), pillUi);
    this._audioToggle(cx, soundCY, 'Sound: ', () => AudioSystem.isSfxEnabled(),   (v) => AudioSystem.setSfxEnabled(v), pillUi);
    this.add.text(cx, copyrightY, GT.copyright, {
      fontSize: px(15), fontFamily: 'Arial', color: '#607089',
    }).setOrigin(0.5, 1);

    // ── Center column fit-scale: shrink the doubled column to the free band if needed ──
    const band = pillsTop - tipsBottom;
    const colEst = 138 * s * 1.45 + 2 * Math.round(16 * s)  // title (generous: stroke+shadow+pad)
                 + 45 * s * 1.4 * 2                         // SURVIVE 2 lines
                 + (144 + 92) * s                           // PLAY (75%) + Customize (doubled) heights
                 + (14 + 21 + 14) * s;                      // gaps
    const fit = Phaser.Math.Clamp((band - 12 * s) / colEst, 0.5, 1);
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

    // Animated gesture hints: a shaded human thumb (skin gradient, fingernail, knuckle creases),
    // drawn once to a texture. Left thumb (mirrored) slides L/R = top-down steer; right thumb
    // taps up/down = side-view rise.
    const thumbKey = 'thumb_hint';
    if (this.textures.exists(thumbKey)) this.textures.remove(thumbKey);
    {
      const CW = 224, CH = 224;
      const c = document.createElement('canvas'); c.width = CW; c.height = CH;
      const x = c.getContext('2d');
      const mx = 112, w = 200, r = w / 2, top = 18, bottom = CH; // wide+short; tip up, flat bottom at edge
      x.beginPath();
      x.moveTo(mx - r, bottom);
      x.lineTo(mx - r, top + r);
      x.arc(mx, top + r, r, Math.PI, 0, false); // round tip
      x.lineTo(mx + r, bottom);
      x.closePath();
      const g = x.createLinearGradient(mx - r, 0, mx + r, 0); // emoji-yellow skin
      g.addColorStop(0, '#ffe082'); g.addColorStop(0.55, '#ffcb4d'); g.addColorStop(1, '#f2a93b');
      x.fillStyle = g;
      x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 6; x.shadowOffsetX = 3;
      x.fill();
      x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetX = 0;
      x.lineWidth = 5; x.strokeStyle = 'rgba(150,95,20,0.5)'; x.stroke();
      // fingernail: larger, its top arch CONCENTRIC with the thumb tip (matching curvature, a
      // 16px skin margin inside), closed by a base line. Subtle gradient fill.
      const nr = 80, ncy = top + r, nBot = 162; // ncy = thumb-tip center → matching curvature (nail −5%)
      x.beginPath();
      x.moveTo(mx - nr, nBot);
      x.lineTo(mx - nr, ncy);
      x.arc(mx, ncy, nr, Math.PI, 0, false);
      x.lineTo(mx + nr, nBot);
      x.closePath();
      const ng = x.createLinearGradient(mx - nr, 0, mx + nr, 0);
      ng.addColorStop(0, '#fffdf2'); ng.addColorStop(0.55, '#fff0c8'); ng.addColorStop(1, '#f3d79a');
      x.fillStyle = ng; x.fill();
      x.lineWidth = 3; x.strokeStyle = 'rgba(150,100,30,0.55)'; x.stroke();
      // knuckle creases across the body (below the nail)
      x.lineWidth = 4; x.strokeStyle = 'rgba(150,100,30,0.38)';
      x.beginPath(); x.moveTo(mx - 80, 188); x.quadraticCurveTo(mx, 204, mx + 80, 188); x.stroke();
      x.beginPath(); x.moveTo(mx - 78, 210); x.quadraticCurveTo(mx, 224, mx + 78, 210); x.stroke();
      this.textures.addCanvas(thumbKey, c);
    }
    const thumbW = Math.round(88 * s), thumbH = Math.round(86 * s);
    const baseY = H - thumbH / 2;             // image bottom flush with the screen's bottom edge
    const slideAmp = Math.round(W * 0.06);
    const tapAmp = Math.round(28 * s);
    const shDX = Math.round(14 * s), shDY = Math.round(7 * s); // shadow offset (light from upper-left)
    const ease = 'Sine.easeInOut';

    // Left hand (mirrored) + cast shadow: slides L/R; bottom stays on the screen edge.
    const leftShadow = this.add.image(W * 0.25 - slideAmp + shDX, baseY + shDY, thumbKey)
      .setDepth(3).setDisplaySize(thumbW, thumbH).setFlipX(true).setTint(0x000000).setAlpha(0.36);
    const leftHand = this.add.image(W * 0.25 - slideAmp, baseY, thumbKey)
      .setDepth(4).setDisplaySize(thumbW, thumbH).setFlipX(true);
    this.tweens.add({ targets: leftHand,   x: W * 0.25 + slideAmp,        duration: 1100, yoyo: true, repeat: -1, ease });
    this.tweens.add({ targets: leftShadow, x: W * 0.25 + slideAmp + shDX, duration: 1100, yoyo: true, repeat: -1, ease });

    // Right hand: taps DOWNWARD and is 20% LARGER at its lifted peak (depth). Its shadow grows +
    // softens when lifted, and tightens + darkens as it presses the screen.
    const rightHand = this.add.image(W * 0.75, baseY, thumbKey).setDepth(4).setDisplaySize(thumbW, thumbH);
    const rsx = rightHand.scaleX, rsy = rightHand.scaleY; // normal (pressed) scale
    rightHand.setScale(rsx * 1.2, rsy * 1.2);             // start lifted (peak) — 20% larger
    const rightShadow = this.add.image(W * 0.75 + shDX * 2, baseY + shDY * 2, thumbKey)
      .setDepth(3).setDisplaySize(thumbW, thumbH).setTint(0x000000).setScale(rsx * 1.35, rsy * 1.35).setAlpha(0.2);
    this.tweens.add({ targets: rightHand, y: baseY + tapAmp, scaleX: rsx, scaleY: rsy, duration: 650, yoyo: true, repeat: -1, ease });
    this.tweens.add({ targets: rightShadow, x: W * 0.75 + Math.round(shDX * 0.5), y: baseY + tapAmp + Math.round(shDY * 0.5), scaleX: rsx, scaleY: rsy, alpha: 0.5, duration: 650, yoyo: true, repeat: -1, ease });

    // ── Center column (Title → SURVIVE → PLAY → Customize), measured & centered in the band ──
    const title = this.add.text(cx, 0, GT.gameTitle, {
      fontSize: fpx(138), fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#29b6f6', strokeThickness: Math.max(3, Math.round(8 * f)),
    }).setOrigin(0.5).setPadding(Math.round(16 * f));
    title.setShadow(0, 0, '#29b6f6', Math.round(18 * f), true, true);

    // SURVIVE tip as two centered lines: "SURVIVE:" over the description.
    const survLabel = this.add.text(cx, 0, GT.tipSurviveLabel + ':', {
      fontSize: fpx(45), fontFamily: '"Arial Black", Arial', color: '#29b6f6',
    }).setOrigin(0.5, 0);
    const survDesc = this.add.text(cx, 0, GT.tipSurviveDesc, {
      fontSize: fpx(45), fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
    }).setOrigin(0.5, 0);

    const gap = Math.round(14 * f);
    const titleH = title.height;
    const survH = survLabel.height + survDesc.height;
    const colTotal = titleH + gap + survH + Math.round(gap * 1.5) + playH + gap + setH;
    // Centered in the band, then nudged up ~20px (dynamic) so the title/SURVIVE sit higher.
    let yy = Math.max(tipsBottom + Math.round(6 * s), (tipsBottom + pillsTop) / 2 - colTotal / 2 - Math.round(20 * s));

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
      .on('pointerup',   () => { AudioSystem.startMusic('game'); this.scene.start('GameScene'); });
    yy += playH + gap;

    const setY = yy + setH / 2;
    makeButton(this, cx, setY, setW, setH, GT.settingsTitle, 0x37474f, 0x263238, () => {
      this.scene.start('SettingsScene');
    }, fpx(44));

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
