import { SPRITE_KEYS } from './constants.js';

const PREFIX = 'splittrip_sprite_';

export const SpriteManager = {
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

  /** Return the custom texture key if it exists in the scene, else the default key. */
  resolveKey(scene, defaultKey) {
    const customKey = defaultKey + '_custom';
    return scene.textures.exists(customKey) ? customKey : defaultKey;
  },

  /** Load all custom sprites saved in localStorage into the given Phaser scene's loader.
   *  Call in a scene's preload(). Loaded under key + '_custom'. */
  preloadCustom(scene) {
    for (const key of Object.values(SPRITE_KEYS)) {
      const dataURL = SpriteManager.load(key);
      if (!dataURL) continue;
      const customKey = key + '_custom';
      // Remove stale texture so loader can overwrite
      try {
        if (scene.textures.exists(customKey)) scene.textures.remove(customKey);
      } catch { /* ignore */ }
      scene.load.image(customKey, dataURL);
    }
  },
};
