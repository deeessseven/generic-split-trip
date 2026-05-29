import { SPRITE_KEYS } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { applyText } from '../data/GameText.js';

// Maps each sprite key to its file in public/sprites/.
// Drop matching PNGs into that folder to replace the procedural defaults.
const SPRITE_FILES = {
  [SPRITE_KEYS.CHAR_TOP]:  'sprites/heroTop.png',
  [SPRITE_KEYS.CHAR_SIDE]: 'sprites/heroSide.png',
  [SPRITE_KEYS.BG_TOP]:    'sprites/bkgdTop.png',
  [SPRITE_KEYS.BG_SIDE]:   'sprites/bkgdSide.png',
  [SPRITE_KEYS.OBSTACLE]:  'sprites/wall.png',
};

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Load user-uploaded sprites (highest priority — stored in localStorage)
    SpriteManager.preloadCustom(this);

    // Load gametext.txt for variant customisation
    this.load.text('gametext', 'gametext.txt');

    // Track which packaged sprites fail so we can fall back to procedural generation
    this._missingSprites = new Set();
    this.load.on('loaderror', (file) => {
      if (file.key in SPRITE_FILES) this._missingSprites.add(file.key);
    });

    // Attempt to load each packaged sprite from public/sprites/
    for (const [key, path] of Object.entries(SPRITE_FILES)) {
      this.load.image(key, path);
    }
  }

  create() {
    // Apply gametext.txt overrides before any scene reads GT values
    applyText(this.cache.text.get('gametext'));

    // Generate procedural textures only for sprites not found in the folder
    this._generateDefaultTextures(this._missingSprites);
    this.scene.start('MenuScene');
  }

  _generateDefaultTextures(missing) {
    if (missing.size === 0) return; // all sprites loaded from folder — nothing to generate

    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // ── char_top: blue bird viewed from above, arrow pointing forward (up)
    if (missing.has(SPRITE_KEYS.CHAR_TOP)) {
      g.clear();
      g.fillStyle(0x29b6f6);
      g.fillCircle(24, 24, 21);
      g.fillStyle(0xffffff);
      g.fillCircle(20, 20, 8);
      g.fillStyle(0x0277bd);
      g.fillTriangle(24, 4, 13, 22, 35, 22);
      g.generateTexture(SPRITE_KEYS.CHAR_TOP, 48, 48);
    }

    // ── char_side: blue bird from the side with an eye (48×48)
    if (missing.has(SPRITE_KEYS.CHAR_SIDE)) {
      g.clear();
      g.fillStyle(0x29b6f6);
      g.fillRoundedRect(2, 10, 44, 28, 8);
      g.fillTriangle(0, 24, 12, 18, 12, 30);
      g.fillStyle(0x81d4fa);
      g.fillEllipse(24, 22, 24, 14);
      g.fillStyle(0xffffff);
      g.fillCircle(38, 18, 7);
      g.fillStyle(0x1a237e);
      g.fillCircle(40, 17, 4);
      g.fillStyle(0xffffff);
      g.fillCircle(41, 16, 1.5);
      g.fillStyle(0xffd54f);
      g.fillTriangle(46, 20, 38, 16, 38, 24);
      g.generateTexture(SPRITE_KEYS.CHAR_SIDE, 48, 48);
    }

    // ── bg_top: tiling top-down ground (64×64)
    if (missing.has(SPRITE_KEYS.BG_TOP)) {
      g.clear();
      g.fillStyle(0x2e7d32);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x388e3c, 0.5);
      g.fillRect(0, 0, 32, 32);
      g.fillRect(32, 32, 32, 32);
      g.lineStyle(1, 0x1b5e20, 0.4);
      for (let i = 0; i <= 64; i += 16) {
        g.lineBetween(i, 0, i, 64);
        g.lineBetween(0, i, 64, i);
      }
      g.generateTexture(SPRITE_KEYS.BG_TOP, 64, 64);
    }

    // ── bg_side: tiling sky (128×64)
    if (missing.has(SPRITE_KEYS.BG_SIDE)) {
      g.clear();
      g.fillStyle(0x5c9dd8);
      g.fillRect(0, 0, 128, 64);
      g.fillStyle(0x87ceeb, 0.5);
      g.fillRect(0, 0, 128, 28);
      g.fillStyle(0xffffff, 0.85);
      g.fillRoundedRect(8, 8, 36, 14, 7);
      g.fillRoundedRect(18, 4, 22, 12, 6);
      g.fillStyle(0xffffff, 0.7);
      g.fillRoundedRect(85, 16, 28, 11, 5);
      g.fillRoundedRect(93, 12, 18, 10, 5);
      g.fillStyle(0x7cb87e);
      g.fillRect(0, 54, 128, 10);
      g.generateTexture(SPRITE_KEYS.BG_SIDE, 128, 64);
    }

    // ── obstacle: red brick wall tile (64×64)
    if (missing.has(SPRITE_KEYS.OBSTACLE)) {
      g.clear();
      g.fillStyle(0xb71c1c);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x7f1212, 1);
      for (let y = 0; y < 64; y += 16) {
        g.fillRect(0, y, 64, 3);
      }
      for (let row = 0; row < 4; row++) {
        const offsetX = (row % 2 === 0) ? 0 : 32;
        for (let x = offsetX; x < 64; x += 32) {
          g.fillRect(x, row * 16 + 3, 3, 13);
        }
      }
      g.fillStyle(0xe57373, 0.35);
      g.fillRect(0, 0, 64, 2);
      g.fillRect(0, 0, 2, 64);
      g.lineStyle(2, 0x4e0000, 0.9);
      g.strokeRect(0, 0, 64, 64);
      g.generateTexture(SPRITE_KEYS.OBSTACLE, 64, 64);
    }

    g.destroy();
  }
}
