import { SPRITE_KEYS } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { makeButton } from '../Button.js';
import { GT } from '../data/GameText.js';

export class SettingsScene extends Phaser.Scene {
  constructor() { super('SettingsScene'); }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;

    const SLOT_DEFS = [
      { key: SPRITE_KEYS.CHAR_TOP,  label: GT.slotCharTop,  hint: 'any size' },
      { key: SPRITE_KEYS.CHAR_SIDE, label: GT.slotCharSide, hint: 'any size' },
      { key: SPRITE_KEYS.BG_TOP,    label: GT.slotBgTop,    hint: '256×256 px' },
      { key: SPRITE_KEYS.BG_SIDE,   label: GT.slotBgSide,   hint: '256×256 px' },
      { key: SPRITE_KEYS.OBSTACLE,  label: GT.slotObstacle, hint: '256×256 px' },
    ];

    // Background
    this.add.rectangle(cx, cy, W, H, 0x0d0d1a);
    this.add.text(cx, 22, GT.settingsTitle, {
      fontSize: '28px', fontFamily: '"Arial Black", Arial', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(cx, 54, GT.settingsSubtitle, {
      fontSize: '12px', fontFamily: 'Arial', color: '#78909c',
    }).setOrigin(0.5);

    // Slot grid — 5 slots across
    const slotW  = 140;
    const slotH  = 170;
    const totalW = SLOT_DEFS.length * slotW + (SLOT_DEFS.length - 1) * 14;
    const startX = cx - totalW / 2 + slotW / 2;
    const slotY  = cy + 10;

    this._previews = {};

    SLOT_DEFS.forEach((def, i) => {
      const x = startX + i * (slotW + 14);
      this._buildSlot(x, slotY, slotW, slotH, def);
    });

    // Back button
    makeButton(this, cx, H - 36, 200, 44, GT.btnBack, 0x37474f, 0x263238, () => {
      this.scene.start('MenuScene');
    }, '18px');

    // Note about iOS web
    this.add.text(cx, H - 10, 'Note: sprite uploads require a modern browser. Capacitor iOS supported.', {
      fontSize: '9px', fontFamily: 'Arial', color: '#546e7a',
    }).setOrigin(0.5, 1);
  }

  _buildSlot(x, y, slotW, slotH, def) {
    const { key, label, hint } = def;

    // Slot background
    const bg = this.add.rectangle(x, y, slotW, slotH, 0x1a2332)
      .setStrokeStyle(1, 0x37474f)
      .setInteractive({ useHandCursor: true });

    // Preview — char keys use the title-size texture (300px) for a crisper preview
    const previewKey = SpriteManager.isCharKey(key)
      ? SpriteManager.resolveTitleKey(this, key)
      : SpriteManager.resolveKey(this, key);
    const preview = this.add.image(x, y - 32, previewKey).setDisplaySize(72, 72);
    this._previews[key] = preview;

    // Labels
    this.add.text(x, y + 30, label, {
      fontSize: '12px', fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
    }).setOrigin(0.5);
    this.add.text(x, y + 55, hint, {
      fontSize: '10px', fontFamily: 'Arial', color: '#546e7a',
    }).setOrigin(0.5);

    // Upload indicator
    this.add.text(x, y + 72, '[ tap to upload ]', {
      fontSize: '10px', fontFamily: 'Arial', color: '#29b6f6',
    }).setOrigin(0.5);

    // Reset button
    const resetTxt = this.add.text(x, y + 89, '[ reset default ]', {
      fontSize: '10px', fontFamily: 'Arial', color: '#ef9a9a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Slot upload on tap
    bg.on('pointerover',  () => bg.setFillStyle(0x263238));
    bg.on('pointerout',   () => bg.setFillStyle(0x1a2332));
    bg.on('pointerup',    () => this._openFilePicker(key));

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
  // Uses a real <input type="file"> for cross-platform compatibility.
  // In Capacitor (WKWebView / Android WebView) this works natively.
  // On desktop browsers it opens the system file dialog.

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
          this._saveGenericSprite(e.target.result, key);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Hero sprites: resize to 100px (gameplay/collision) and 300px (title display).
  // One Image decode, two canvas draws — no duplicate file reads.
  _saveCharSprite(img, key) {
    const gameplay = this._canvasResize(img, 100);
    const title    = this._canvasResize(img, 300);

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
        // Show the 300px version in the settings preview (crisper)
        if (preview) preview.setTexture(titleKey);
        this._showToast(GT.toastSpriteSaved);
      }
    };
    this.textures.once('addtexture-' + customKey, onBothLoaded);
    this.textures.once('addtexture-' + titleKey,  onBothLoaded);
    this.textures.addBase64(customKey, gameplay);
    this.textures.addBase64(titleKey,  title);
  }

  // Non-hero sprites: store the raw dataURL unchanged (no resize needed).
  _saveGenericSprite(dataURL, key) {
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

  // Resize any image to a square canvas of the given px size, return PNG dataURL.
  _canvasResize(img, size) {
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  }

  _showToast(msg) {
    const { width: W, height: H } = this.scale;
    const toast = this.add.text(W / 2, H - 80, msg, {
      fontSize: '13px', fontFamily: 'Arial', color: '#ffffff',
      backgroundColor: '#263238',
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: { from: 0, to: 1 },
      yoyo: true, hold: 1800,
      duration: 300,
      onComplete: () => toast.destroy(),
    });
  }
}
