import { SPRITE_KEYS } from './constants.js';

const PREFIX       = 'doubleflap_sprite_';
const TITLE_PREFIX = 'doubleflap_sprite_title_';

// Keys that get two stored sizes: 128px for gameplay collision, 512px for title display.
const CHAR_KEYS = new Set([SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]);

export const SpriteManager = {
  // ── Gameplay-size storage (128px for CHAR keys) ───────────────────────────
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

  // ── Title-size storage (512px, CHAR keys only) ────────────────────────────
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

  isCharKey(key) {
    return CHAR_KEYS.has(key);
  },

  // One-time cleanup of the legacy full-resolution hero originals (doubleflap_sprite_full_*).
  // That path was removed (display uses the 512px texture); drop any leftovers so they don't
  // keep eating localStorage for users who uploaded a hero before the change. removeItem on a
  // missing key is a harmless no-op.
  cleanupLegacyFull() {
    for (const key of [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]) {
      try { localStorage.removeItem('doubleflap_sprite_full_' + key); } catch { /* ignore */ }
    }
  },

  // ── Texture key resolution ────────────────────────────────────────────────

  /** Gameplay key: returns key_custom (128px) if it exists, else the default. */
  resolveKey(scene, defaultKey) {
    const customKey = defaultKey + '_custom';
    return scene.textures.exists(customKey) ? customKey : defaultKey;
  },

  /** Title key resolution order:
   *   1. key_title_custom  — user upload, 512px
   *   2. key_custom        — user upload, 128px (fallback if title version missing)
   *   3. key_title         — bundled default, 512px (created by BootScene)
   *   4. key               — bundled/procedural default (128px or 48px) */
  resolveTitleKey(scene, defaultKey) {
    const titleCustom = defaultKey + '_title_custom';
    if (scene.textures.exists(titleCustom)) return titleCustom;
    const custom = defaultKey + '_custom';
    if (scene.textures.exists(custom)) return custom;
    const titleBundled = defaultKey + '_title';
    if (scene.textures.exists(titleBundled)) return titleBundled;
    return defaultKey;
  },

  // Remove a texture if it exists; silent no-op on absence or any error. Centralizes the
  // exists + remove + try/catch dance used wherever a derived texture is rebuilt or reset.
  dropTexture(scene, key) {
    try { if (scene.textures.exists(key)) scene.textures.remove(key); } catch { /* ignore */ }
  },

  // ── Preloaders ────────────────────────────────────────────────────────────

  /** Load all custom gameplay sprites (128px for CHAR keys) into the Phaser loader.
   *  Call in a scene's preload(). Registers textures under key + '_custom'. */
  preloadCustom(scene) {
    for (const key of Object.values(SPRITE_KEYS)) {
      const dataURL = SpriteManager.load(key);
      if (!dataURL) continue;
      const customKey = key + '_custom';
      SpriteManager.dropTexture(scene, customKey);
      scene.load.image(customKey, dataURL);
    }
  },

  /** Load title-size sprites (512px) for CHAR keys only.
   *  Call in a scene's preload(). Registers textures under key + '_title_custom'. */
  preloadCustomTitle(scene) {
    for (const key of [SPRITE_KEYS.CHAR_TOP, SPRITE_KEYS.CHAR_SIDE]) {
      const dataURL = SpriteManager.loadTitle(key);
      if (!dataURL) continue;
      const titleKey = key + '_title_custom';
      SpriteManager.dropTexture(scene, titleKey);
      scene.load.image(titleKey, dataURL);
    }
  },
};
