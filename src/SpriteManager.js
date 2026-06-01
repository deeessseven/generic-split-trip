import { SPRITE_KEYS } from './constants.js';

const PREFIX       = 'splittrip_sprite_';
const TITLE_PREFIX = 'splittrip_sprite_title_';

// Keys that get two stored sizes: 100px for gameplay collision, 250px for title display.
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

  // ── Title-size storage (250px, CHAR keys only) ────────────────────────────
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

  // ── Texture key resolution ────────────────────────────────────────────────

  /** Gameplay key: returns key_custom (100px) if it exists, else the default. */
  resolveKey(scene, defaultKey) {
    const customKey = defaultKey + '_custom';
    return scene.textures.exists(customKey) ? customKey : defaultKey;
  },

  /** Title key: prefers key_title_custom (250px), falls back to key_custom, then default. */
  resolveTitleKey(scene, defaultKey) {
    const titleKey = defaultKey + '_title_custom';
    if (scene.textures.exists(titleKey)) return titleKey;
    const customKey = defaultKey + '_custom';
    if (scene.textures.exists(customKey)) return customKey;
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

  /** Load title-size sprites (250px) for CHAR keys only.
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
};
