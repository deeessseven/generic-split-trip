import { SPRITE_KEYS, HERO_ANIM_FRAMES } from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { applyText } from '../data/GameText.js';
import { resampleToCanvas } from '../imageResample.js';

// Maps each non-hero sprite key to its file in public/sprites/. (Heroes are frame-based — loaded
// separately as heroTop1..N.png / heroSide1..N.png in preload().) Drop matching PNGs into that
// folder to replace the procedural defaults. HIT_MARK is the "Collision Mark" (same thing): the
// stamp drawn where the hero crashes.
const SPRITE_FILES = {
  [SPRITE_KEYS.BG_TOP]:    'sprites/bkgdTop.png',
  [SPRITE_KEYS.BG_SIDE]:   'sprites/bkgdSide.png',
  [SPRITE_KEYS.OBSTACLE]:  'sprites/wall.png',
  [SPRITE_KEYS.HIT_MARK]:  'sprites/hit.png', // collision / hit mark, preferred 32×32
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

    // Hero animation frames: heroTop1..N.png / heroSide1..N.png (any square resolution). Frame 1
    // is the canonical hero (collision + menu); 2+ frames enable the looped in-game idle. Missing
    // files just loaderror (harmless) — 1 frame = static, 0 frames = procedural fallback.
    for (let i = 1; i <= HERO_ANIM_FRAMES; i++) {
      this.load.image(`${SPRITE_KEYS.CHAR_TOP}_anim${i}`,  `sprites/heroTop${i}.png`);
      this.load.image(`${SPRITE_KEYS.CHAR_SIDE}_anim${i}`, `sprites/heroSide${i}.png`);
    }
  }

  create() {
    // Apply gametext.txt overrides before any scene reads GT values
    applyText(this.cache.text.get('gametext'));

    // Drop any orphaned legacy full-resolution hero originals from older builds (one-time).
    SpriteManager.cleanupLegacyFull();

    // Heroes are frame-based (heroTop1..N). A hero with NO frames falls back to procedural art.
    for (const key of [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]) {
      if (!this.textures.exists(`${key}_anim1`)) this._missingSprites.add(key);
    }

    // Generate procedural textures only for sprites not found in the folder
    this._generateDefaultTextures(this._missingSprites);

    // Build hero textures from their frames (frame 1 = collision/menu base; 2..N = idle frames)
    this._normalizeHeroFrames();

    // Normalize bundled/default backgrounds → 512px and the wall → 64px (matches uploads)
    this._normalizeTiledSprites();

    // Generate decorative FX textures (vignette, parallax dots, particle) once
    this._generateFXTextures();

    this.scene.start('MenuScene');
  }

  // Procedural textures used by GameScene effects. Generated once at boot (global texture
  // manager), guarded so a scene restart never re-adds them.
  _generateFXTextures() {
    // Vignette: radial gradient, transparent center -> dark edges (stretched to screen).
    if (!this.textures.exists('st_vignette')) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 512;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(256, 256, 150, 256, 256, 380);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      this.textures.addCanvas('st_vignette', c);
    }
    // Parallax: sparse soft dots, tiled at low alpha for a subtle depth layer.
    if (!this.textures.exists('st_parallax')) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * 256, y = Math.random() * 256, r = 1 + Math.random() * 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
      }
      this.textures.addCanvas('st_parallax', c);
    }
    // Default collision mark: a red X + ring (256px). Only if no bundled/uploaded one
    // exists — so a real sprites/hit.png or a Settings upload takes priority.
    if (!this.textures.exists(SPRITE_KEYS.HIT_MARK)) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      const C = 128, R = 78;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,17,17,1)'; ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(C - R, C - R); ctx.lineTo(C + R, C + R);
      ctx.moveTo(C + R, C - R); ctx.lineTo(C - R, C + R);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,68,68,0.6)'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(C, C, R + 30, 0, Math.PI * 2); ctx.stroke();
      this.textures.addCanvas(SPRITE_KEYS.HIT_MARK, c);
    }

    // Particle: soft white dot for flap puffs and collision debris.
    if (!this.textures.exists('st_particle')) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)'); // solid core to 50% radius = harder edge
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 16);
      this.textures.addCanvas('st_particle', c);
    }
  }

  // Heroes are supplied as frames heroTop1..N.png / heroSide1..N.png (any square resolution).
  // Frame 1 is the canonical hero: we build its 512px display texture (key + '_title', used by
  // the menu) and its 128px gameplay/collision texture (key — 1 texel = 1 world px). Extra frames
  // 2..N become 128px display textures (key + '_disp2'..) that GameScene cycles for the looped
  // idle. Collision always uses frame 1, so the hitbox is static. A hero with no frames was added
  // to _missingSprites above and gets procedural art instead. Mirrors uploads (SettingsScene).
  _normalizeHeroFrames() {
    for (const key of [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]) {
      const frames = [];
      for (let i = 1; i <= HERO_ANIM_FRAMES; i++) {
        const fk = `${key}_anim${i}`;
        if (this.textures.exists(fk)) frames.push(fk);
      }
      if (frames.length === 0) continue; // no frames → procedural (already generated)

      // Frame 1 = canonical hero: 512px (menu) + 128px (gameplay + collision base).
      const f1 = this.textures.get(frames[0]).getSourceImage();
      const titleKey = key + '_title';
      try { if (this.textures.exists(titleKey)) this.textures.remove(titleKey); } catch {}
      this.textures.addCanvas(titleKey, resampleToCanvas(f1, 512));
      try { if (this.textures.exists(key)) this.textures.remove(key); } catch {}
      this.textures.addCanvas(key, resampleToCanvas(f1, 128));

      // Extra frames → 128px display textures (key_disp2..; frame 1 is `key` itself).
      for (let i = 1; i < frames.length; i++) {
        const dispKey = `${key}_disp${i + 1}`;
        const fsrc = this.textures.get(frames[i]).getSourceImage();
        try { if (this.textures.exists(dispKey)) this.textures.remove(dispKey); } catch {}
        this.textures.addCanvas(dispKey, resampleToCanvas(fsrc, 128));
      }

      // Free the raw native-resolution frame textures; only the 128/512 derivatives are used.
      for (const fk of frames) this.textures.remove(fk);
    }
  }

  // Force the backgrounds, wall, and collision/hit mark to fixed square sizes (512 / 64 / 32),
  // whether they came from a bundled file or a procedural default — so tiling stays consistent
  // and the hit mark matches its preferred 32×32. (Uploads are sized the same way in
  // SettingsScene.) The size check below makes an already-correct file a no-op. Uses the
  // gamma-correct 'triangle' (tent/bilinear) resample: ring-free so tiled textures get no seam
  // halos, and smooth in BOTH directions (a procedural fallback may need upscaling, not just down).
  _normalizeTiledSprites() {
    const targets = [
      [SPRITE_KEYS.BG_TOP, 512],
      [SPRITE_KEYS.BG_SIDE, 512],
      [SPRITE_KEYS.OBSTACLE, 64],
      [SPRITE_KEYS.HIT_MARK, 32], // collision mark === hit mark; preferred 32×32
    ];
    for (const [key, size] of targets) {
      if (!this.textures.exists(key)) continue;
      const src = this.textures.get(key).getSourceImage();
      if (src.width === size && src.height === size) continue; // already correct
      const canvas = resampleToCanvas(src, size, 'triangle');
      this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
    }
  }

  _generateDefaultTextures(missing) {
    // Only the char/bg/obstacle sprites are drawn here; the hit mark is generated in
    // _generateFXTextures. If none of those drawn sprites are missing, skip the graphics alloc
    // entirely (the hit mark being absent must not force a pointless graphics object).
    const drawn = [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE, SPRITE_KEYS.BG_TOP, SPRITE_KEYS.BG_SIDE, SPRITE_KEYS.OBSTACLE];
    if (!drawn.some((k) => missing.has(k))) return;

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
