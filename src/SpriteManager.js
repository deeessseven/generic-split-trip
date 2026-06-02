import { SPRITE_KEYS } from './constants.js';

const PREFIX       = 'splittrip_sprite_';
const TITLE_PREFIX = 'splittrip_sprite_title_';
const FULL_PREFIX  = 'splittrip_sprite_full_';

// Keys that get two stored sizes: 100px for gameplay collision, 400px for title display.
const CHAR_KEYS = new Set([SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]);

export const SpriteManager = {
  // ── Gameplay-size storage (100px for CHAR keys) ───────────────────────────
  save(key, dataURL) {
    try {
      localStorage.setItem(PREFIX + key, dataURL);
    } catch (e) {
      console.warn('SpriteManager: localStorage write failed', e);
    }
  },

  load(key) {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch { /* ignore */ }
  },

  // ── Title-size storage (400px, CHAR keys only) ────────────────────────────
  saveTitle(key, dataURL) {
    try {
      localStorage.setItem(TITLE_PREFIX + key, dataURL);
    } catch (e) {
      console.warn('SpriteManager: localStorage write failed (title)', e);
    }
  },

  loadTitle(key) {
    try {
      return localStorage.getItem(TITLE_PREFIX + key);
    } catch {
      return null;
    }
  },

  removeTitle(key) {
    try {
      localStorage.removeItem(TITLE_PREFIX + key);
    } catch { /* ignore */ }
  },

  // ── Full-resolution original storage (CHAR keys only, for crisp display) ──────
  // Uploads can be large; saveFull returns false if it doesn't fit (caller falls back).
  saveFull(key, dataURL) {
    try { localStorage.setItem(FULL_PREFIX + key, dataURL); return true; }
    catch (e) { console.warn('SpriteManager: full-res original too big for storage; using 400px', e); return false; }
  },

  loadFull(key) {
    try { return localStorage.getItem(FULL_PREFIX + key); } catch { return null; }
  },

  removeFull(key) {
    try { localStorage.removeItem(FULL_PREFIX + key); } catch { /* ignore */ }
  },

  isCharKey(key) {
    return CHAR_KEYS.has(key);
  },

  // ── Texture key resolution ────────────────────────────────────────────────

  /** Gameplay key: returns key_custom (100px) if it exists, else the default. */
  resolveKey(scene, defaultKey) {
    const customKey = defaultKey + '_custom';
    return scene.textures.exists(customKey) ? customKey : defaultKey;
  },

  /** Title key resolution order:
   *   1. key_title_custom  — user upload, 400px
   *   2. key_custom        — user upload, 100px (fallback if title version missing)
   *   3. key_title         — bundled default, 400px (created by BootScene)
   *   4. key               — bundled/procedural default (100px or 48px) */
  resolveTitleKey(scene, defaultKey) {
    const titleCustom = defaultKey + '_title_custom';
    if (scene.textures.exists(titleCustom)) return titleCustom;
    const custom = defaultKey + '_custom';
    if (scene.textures.exists(custom)) return custom;
    const titleBundled = defaultKey + '_title';
    if (scene.textures.exists(titleBundled)) return titleBundled;
    return defaultKey;
  },

  /** Highest-resolution DISPLAY key — prefers the original full-res image, then the 400px
   *  title, then smaller fallbacks. An uploaded sprite takes full precedence over the bundled
   *  one. GameScene scales whatever this returns down to the 100px logical footprint. */
  resolveDisplayKey(scene, defaultKey) {
    const ex = (k) => scene.textures.exists(k);
    // Uploaded sprite wins entirely over the bundled default.
    if (ex(defaultKey + '_full_custom'))  return defaultKey + '_full_custom';
    if (ex(defaultKey + '_title_custom')) return defaultKey + '_title_custom';
    if (ex(defaultKey + '_custom'))       return defaultKey + '_custom';
    // Bundled default.
    if (ex(defaultKey + '_full'))  return defaultKey + '_full';
    if (ex(defaultKey + '_title')) return defaultKey + '_title';
    return defaultKey;
  },

  // ── Preloaders ────────────────────────────────────────────────────────────

  /** Load all custom gameplay sprites (100px for CHAR keys) into the Phaser loader.
   *  Call in a scene's preload(). Registers textures under key + '_custom'. */
  preloadCustom(scene) {
    for (const key of Object.values(SPRITE_KEYS)) {
      const dataURL = SpriteManager.load(key);
      if (!dataURL) continue;
      const customKey = key + '_custom';
      try {
        if (scene.textures.exists(customKey)) scene.textures.remove(customKey);
      } catch { /* ignore */ }
      scene.load.image(customKey, dataURL);
    }
  },

  /** Load title-size sprites (400px) for CHAR keys only.
   *  Call in a scene's preload(). Registers textures under key + '_title_custom'. */
  preloadCustomTitle(scene) {
    for (const key of [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]) {
      const dataURL = SpriteManager.loadTitle(key);
      if (!dataURL) continue;
      const titleKey = key + '_title_custom';
      try {
        if (scene.textures.exists(titleKey)) scene.textures.remove(titleKey);
      } catch { /* ignore */ }
      scene.load.image(titleKey, dataURL);
    }
  },

  /** Load the full-resolution original uploads (CHAR keys only) for crisp display.
   *  Call in a scene's preload(). Registers textures under key + '_full_custom'. */
  preloadCustomFull(scene) {
    for (const key of [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]) {
      const dataURL = SpriteManager.loadFull(key);
      if (!dataURL) continue;
      const fullKey = key + '_full_custom';
      try {
        if (scene.textures.exists(fullKey)) scene.textures.remove(fullKey);
      } catch { /* ignore */ }
      scene.load.image(fullKey, dataURL);
    }
  },
};
