import { SPRITE_KEYS } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { makeButton } from '../Button.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { resampleToCanvas } from '../imageResample.js';
import { relayoutOnResize } from '../responsive.js';

export class SettingsScene extends Phaser.Scene {
  constructor() { super('SettingsScene'); }

  create() {
    relayoutOnResize(this);
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;

    const SLOT_DEFS = [
      { key: SPRITE_KEYS.CHAR_TOP,  label: GT.slotCharTop,  hint: '512×512' },
      { key: SPRITE_KEYS.CHAR_SIDE, label: GT.slotCharSide, hint: '512×512' },
      { key: SPRITE_KEYS.BG_TOP,    label: GT.slotBgTop,    hint: '512×512 tileable' },
      { key: SPRITE_KEYS.BG_SIDE,   label: GT.slotBgSide,   hint: '512×512 tileable' },
      { key: SPRITE_KEYS.OBSTACLE,  label: GT.slotObstacle, hint: '64×64 tileable' },
      // "Collision Mark" (GT.slotHitMark) is the HIT_MARK sprite — same thing; preferred 32×32.
      { key: SPRITE_KEYS.HIT_MARK,  label: GT.slotHitMark,  hint: '32×32' },
    ];

    // Background
    this.add.rectangle(cx, cy, W, H, 0x0d0d1a);

    // Sizes here target ~2× the old text/buttons and +50% previews. A 6-slot row PLUS a header
    // and footer can't all be that large in ~360px of landscape height (they'd overflow), so the
    // page is split into three vertical regions (header / grid / footer) and each region's
    // content is grown toward the target then fit to its region height and the screen width — as
    // large as fits, never overflowing. Long strings shrink-to-fit (_fitText) so they don't spill.
    const maxW    = W * 0.95;
    const headerH = Math.round(H * 0.22);
    const backRef = Math.round(H * 0.28); // reference height the bottom Back button is sized from

    // ── Header: title + subtitle, anchored to the top ──
    const title = this._fitText(cx, Math.round(H * 0.015), GT.settingsTitle, 56,
      { fontFamily: '"Arial Black", Arial', color: '#ffffff' }, maxW, headerH * 0.46).setOrigin(0.5, 0);
    const subtitle = this._fitText(cx, title.y + title.height + Math.round(H * 0.01), GT.settingsSubtitle, 24,
      { fontFamily: 'Arial', color: '#78909c', align: 'center' }, maxW, headerH * 0.32).setOrigin(0.5, 0);
    const headerBottom = subtitle.y + subtitle.height;

    // ── Footer: just the Back button, anchored to the bottom (no note — uploading is
    // self-explanatory, and dropping it gives the slot grid more height). ──
    // Keep the BACK label at its size, but halve the gray rectangle around it.
    const backFs = Math.round(backRef * 0.55 * 0.42);                                   // label size (unchanged)
    const backH  = Math.round(backRef * 0.55 * 0.5);                                    // rectangle halved
    const backW  = Math.min(Math.round(200 * Math.min(1, H / 360)), Math.round(W * 0.9)); // halved (was 400)
    const backY  = H - Math.round(H * 0.02) - backH / 2;
    const backTop = backY - backH / 2;
    makeButton(this, cx, backY, backW, backH, GT.btnBack, 0x37474f, 0x263238, () => {
      this.scene.start('MenuScene');
    }, `${backFs}px`);

    // ── Slot grid: one row, sized to fill the band between header and footer ──
    // DSW/DSH = the design slot's width/height at slotScale = 1 (preview 108 + 2× text stacked).
    const DSW = 120, DSH = 256;
    const gap   = Math.round(12 * Math.min(1, H / 360));
    const slotW = Math.min(150, (W * 0.96 - (SLOT_DEFS.length - 1) * gap) / SLOT_DEFS.length);
    const slotGap = Math.round(H * 0.03); // a little breathing room between the slots and Back button
    const band  = Math.max(0, backTop - headerBottom - slotGap);
    const slotScale = Math.min(1, slotW / DSW, band / DSH);
    const slotY    = headerBottom + band / 2;
    const slotBoxH = Math.round(DSH * slotScale);
    const totalW   = SLOT_DEFS.length * slotW + (SLOT_DEFS.length - 1) * gap;
    const startX   = cx - totalW / 2 + slotW / 2;

    this._previews = {};
    SLOT_DEFS.forEach((def, i) => {
      const x = startX + i * (slotW + gap);
      this._buildSlot(x, slotY, slotW, slotBoxH, slotScale, def);
    });
  }

  // Add a centered-by-caller text at the target font px, then shrink the font so the text fits
  // within maxW (and maxH if given). Lets the big customize-page labels grow without overflowing.
  _fitText(x, y, str, fontPx, style, maxW, maxH) {
    const t = this.add.text(x, y, str, { fontSize: `${Math.round(fontPx)}px`, ...style });
    let s = 1;
    if (t.width > maxW) s = Math.min(s, maxW / t.width);
    if (maxH && t.height > maxH) s = Math.min(s, maxH / t.height);
    if (s < 1) t.setFontSize(Math.max(8, Math.floor(fontPx * s)));
    return t;
  }

  _buildSlot(x, y, slotW, slotBoxH, ss, def) {
    const { key, label, hint } = def;

    // ss (set in create) scales the slot design — preview 108 (+50% of the old 72) and 2× text —
    // to whatever fits the band. The two action lines and the hint are long, so cap THEIR font to
    // the slot width too (independently of ss) so they never spill past the slot edges.
    const fpx = (n) => `${Math.round(n * ss)}px`;
    const linePx = `${Math.round(20 * Math.min(ss, slotW / 180))}px`;

    // Slot background (visual only — uploading is triggered by the "[ tap to upload ]" line)
    this.add.rectangle(x, y, slotW, slotBoxH, 0x1a2332).setStrokeStyle(1, 0x37474f);

    // Preview — char keys use the title-size texture (512px) for a crisper preview
    const previewKey = SpriteManager.isCharKey(key)
      ? SpriteManager.resolveTitleKey(this, key)
      : SpriteManager.resolveKey(this, key);
    const ps = Math.round(108 * ss); // +50% of the old 72
    const preview = this.add.image(x, y - 74 * ss, previewKey).setDisplaySize(ps, ps);
    this._previews[key] = preview;

    // Labels
    fitText(this.add.text(x, y + 14 * ss, label, {
      fontSize: fpx(24), fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
    }).setOrigin(0.5), slotW * 0.92);
    this.add.text(x, y + 58 * ss, hint, {
      fontSize: linePx, fontFamily: 'Arial', color: '#546e7a',
    }).setOrigin(0.5);

    // Upload trigger — ONLY this line opens the picker (tapping the preview does nothing).
    const uploadTxt = this.add.text(x, y + 88 * ss, '[ tap to upload ]', {
      fontSize: linePx, fontFamily: 'Arial', color: '#29b6f6',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    uploadTxt.on('pointerover', () => uploadTxt.setColor('#81d4fa'));
    uploadTxt.on('pointerout',  () => uploadTxt.setColor('#29b6f6'));
    uploadTxt.on('pointerup',   () => this._openFilePicker(key));

    // Reset button
    const resetTxt = this.add.text(x, y + 118 * ss, '[ reset default ]', {
      fontSize: linePx, fontFamily: 'Arial', color: '#ef9a9a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Reset on tap — removes both sizes for char keys
    resetTxt.on('pointerup', () => {
      SpriteManager.remove(key);
      const customKey = key + '_custom';
      try { if (this.textures.exists(customKey)) this.textures.remove(customKey); } catch {}
      if (SpriteManager.isCharKey(key)) {
        SpriteManager.removeTitle(key);
        const titleKey = key + '_title_custom';
        try { if (this.textures.exists(titleKey)) this.textures.remove(titleKey); } catch {}
      }
      preview.setTexture(key);
    });
  }

  // ── File picker ─────────────────────────────────────────────────────────────
  // Uses a real <input type="file" accept="image/*">: the system photo/file picker on mobile
  // browsers and Android WebView, the file dialog on desktop. On iOS WKWebView it works on
  // modern iOS; a Capacitor build wanting guaranteed photo access would use the Camera plugin.

  _openFilePicker(key) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Keep in DOM but invisible; iOS WKWebView requires element to be in DOM
    input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;z-index:-1;';
    document.body.appendChild(input);

    const cleanup = () => {
      try { document.body.removeChild(input); } catch {}
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) return;
      this._readImageFile(file, key);
    });

    // cancel without selection
    input.addEventListener('cancel', cleanup);
    // fallback cleanup after 60s
    setTimeout(cleanup, 60000);

    input.click();
  }

  _readImageFile(file, key) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (SpriteManager.isCharKey(key)) {
          this._saveCharSprite(img, key);
        } else {
          this._saveGenericSprite(img, key);
        }
      };
      img.onerror = () => this._showToast(GT.toastUploadError); // unsupported/corrupt image
      img.src = e.target.result;
    };
    reader.onerror = () => this._showToast(GT.toastUploadError);
    reader.readAsDataURL(file);
  }

  // Hero sprites: 128px (gameplay/collision) + 512px (pre-filtered display). One Image decode,
  // a couple of canvas resamples.
  _saveCharSprite(img, key) {
    // Hero sprites use the configured resampler (RESAMPLE_MODE in imageResample.js, currently Lanczos-3).
    const gameplay = resampleToCanvas(img, 128).toDataURL('image/png');
    const title    = resampleToCanvas(img, 512).toDataURL('image/png');

    SpriteManager.save(key, gameplay);
    SpriteManager.saveTitle(key, title);

    const customKey = key + '_custom';
    const titleKey  = key + '_title_custom';
    try { if (this.textures.exists(customKey)) this.textures.remove(customKey); } catch {}
    try { if (this.textures.exists(titleKey))  this.textures.remove(titleKey);  } catch {}

    // Wait for both textures to load before updating the preview
    let loaded = 0;
    const onBothLoaded = () => {
      loaded++;
      if (loaded === 2) {
        const preview = this._previews[key];
        // Show the 512px version in the settings preview (crisper)
        if (preview) preview.setTexture(titleKey);
        this._showToast(GT.toastSpriteSaved);
      }
    };
    this.textures.once('addtexture-' + customKey, onBothLoaded);
    this.textures.once('addtexture-' + titleKey,  onBothLoaded);
    this.textures.addBase64(customKey, gameplay);
    this.textures.addBase64(titleKey,  title);
  }

  // Resize uploads to a fixed square so they store small and tile predictably:
  //   backgrounds → 512 (fill a panel), wall → 64 (matches WALL_WIDTH),
  //   collision/hit mark → 32 (its preferred size).
  // Uses the gamma-correct 'triangle' (tent/bilinear) resample — ring-free matters because
  // backgrounds/wall are tiled, so a sharp kernel could leave a visible seam at the wrap edge.
  _saveGenericSprite(img, key) {
    let size = 32; // collision mark === hit mark (preferred 32×32)
    if (key === SPRITE_KEYS.BG_TOP || key === SPRITE_KEYS.BG_SIDE) size = 512;
    else if (key === SPRITE_KEYS.OBSTACLE) size = 64;
    const dataURL = resampleToCanvas(img, size, 'triangle').toDataURL('image/png');
    SpriteManager.save(key, dataURL);
    const customKey = key + '_custom';
    try { if (this.textures.exists(customKey)) this.textures.remove(customKey); } catch {}
    this.textures.once('addtexture-' + customKey, () => {
      const preview = this._previews[key];
      if (preview) preview.setTexture(customKey);
      this._showToast(GT.toastSpriteSaved);
    });
    this.textures.addBase64(customKey, dataURL);
  }

  _showToast(msg) {
    const { width: W, height: H } = this.scale;
    const P = Math.min(1, H / 360);
    const toast = fitText(this.add.text(W / 2, Math.round(H * 0.70), msg, {
      fontSize: `${Math.round(26 * P)}px`, fontFamily: 'Arial', color: '#ffffff',
      backgroundColor: '#263238',
      padding: { x: Math.round(12 * P), y: Math.round(8 * P) },
    }).setOrigin(0.5).setDepth(20).setAlpha(0), W * 0.92);
    this.tweens.add({
      targets: toast,
      alpha: { from: 0, to: 1 },
      yoyo: true, hold: 1800,
      duration: 300,
      onComplete: () => toast.destroy(),
    });
  }
}
