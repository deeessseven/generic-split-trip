import './style.css';
import Phaser from 'phaser';
import { BootScene }     from './scenes/BootScene.js';
import { MenuScene }     from './scenes/MenuScene.js';
import { GameScene }     from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { GAME_W, GAME_H } from './constants.js';
import { AudioSystem } from './AudioSystem.js';

// Audio contexts start suspended until a user gesture — unlock (and start music) on tap.
document.addEventListener('pointerdown', () => AudioSystem.unlock(), { capture: true });

// Stop the music whenever the page leaves view (tab switch, minimize, screen lock, app
// switch); resume when it returns. visibilitychange covers most cases; blur/focus also
// catches switching to another window on desktop.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) AudioSystem.pauseForBackground();
  else AudioSystem.resumeFromBackground();
});
window.addEventListener('blur',  () => AudioSystem.pauseForBackground());
window.addEventListener('focus', () => AudioSystem.resumeFromBackground());
window.addEventListener('pagehide', () => AudioSystem.pauseForBackground());

// On tap, enter fullscreen (hides address bar) and lock to landscape-primary so device
// rotation has no effect. capture:true fires before Phaser handles the same event.
// Retry on EVERY tap (no "achieved" latch): if the player ever exits fullscreen, the next
// tap re-expands the game. Keeping the game fullscreen matters more than honoring a manual
// exit, and the first attempt can also silently fail, so retrying guarantees it catches.
document.addEventListener('pointerdown', function () {
  if (document.fullscreenElement) return; // already fullscreen, nothing to do
  const el = document.documentElement;
  const req = el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el);
  const lockOrientation = () => screen.orientation?.lock('landscape-primary').catch(() => {});
  if (req) req().then(lockOrientation).catch(lockOrientation);
  else lockOrientation();
}, { capture: true });

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  // Generate mipmaps (power-of-two textures only) so scrolling/minified textures don't
  // shimmer; antialias is the WebGL default but set explicitly. NPOT textures (heroes)
  // simply skip mipmaps — no error.
  render: {
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    antialias: true,
  },
  scale: {
    // RESIZE makes the canvas fill the container exactly — no black bars.
    // The container is always sized in landscape dimensions (see style.css), so the
    // game always runs at landscape proportions regardless of device orientation.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  GAME_W,
    height: GAME_H,
  },
  input: {
    activePointers: 4, // support multi-touch (left + right panel simultaneously)
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene, SettingsScene],
};

const game = new Phaser.Game(config);

// When the container is CSS-rotated 90°CW (portrait mode), Phaser's built-in
// coordinate transform maps touches to wrong game coords. Patch updateInputPlugins
// (fires after Phaser sets ptr.x/y, before any scene handler) to recompute from
// the native event's raw client coords using the correct 90°CW inverse mapping.
game.events.on('ready', () => {
  const im = game.input;
  const sm = game.scale;

  // When #game-container is CSS-rotated 90° in portrait mode, Phaser's two methods
  // that call getBoundingClientRect() return the VISUAL (post-transform) box —
  // swapped portrait dims — instead of the layout dims. Both must be overridden.
  if (sm.parent && !sm.parentIsWindow) {
    // Fix 1: getParentBounds — used to size the canvas. Use offsetWidth/offsetHeight
    // (layout dims, unaffected by CSS transform) instead of getBoundingClientRect.
    sm.getParentBounds = function () {
      const pw = this.parent.offsetWidth;
      const ph = this.parent.offsetHeight;
      if (this.parentSize.width !== pw || this.parentSize.height !== ph) {
        this.parentSize.setSize(pw, ph);
        return true;
      }
      return false;
    };

    // Fix 2: updateCenter — used to compute marginLeft/marginTop that center the
    // canvas within its parent. It reads canvas.getBoundingClientRect() which, after
    // the parent's CSS rotation, returns swapped dims and produces a wrong offset.
    // Use canvas.offsetWidth/offsetHeight (layout dims) instead.
    sm.updateCenter = function () {
      const ac = this.autoCenter;
      if (ac === 0) return; // NO_CENTER
      const canvas = this.canvas;
      const style = canvas.style;
      const pw = this.parentSize.width;
      const ph = this.parentSize.height;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      let ox = Math.floor((pw - cw) / 2);
      let oy = Math.floor((ph - ch) / 2);
      if (ac === 2) oy = 0;      // CENTER_HORIZONTALLY
      else if (ac === 3) ox = 0; // CENTER_VERTICALLY
      style.marginLeft = ox + 'px';
      style.marginTop = oy + 'px';
    };

    // First load / mobile address-bar collapse / fullscreen transition can leave the canvas
    // sized to a stale (smaller) viewport, showing dark bars at the edges. Re-measure the
    // container and resize on every event that changes the viewport, plus a few delayed
    // passes to catch the initial settle (the visualViewport API fires on address-bar moves
    // that a plain window 'resize' can miss).
    const forceRefresh = () => { try { sm.getParentBounds(); sm.refresh(); } catch (e) { /* */ } };
    window.addEventListener('orientationchange', () => setTimeout(forceRefresh, 60));
    document.addEventListener('fullscreenchange', forceRefresh);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', forceRefresh);
    [120, 350, 700, 1200].forEach((t) => setTimeout(forceRefresh, t));

    // Trigger an immediate resize with corrected dimensions.
    if (sm.getParentBounds()) sm.refresh();
  }

  if (typeof im.updateInputPlugins !== 'function') return;
  const _orig = im.updateInputPlugins.bind(im);
  im.updateInputPlugins = function (type, pointers) {
    if (window.innerHeight > window.innerWidth) {
      const sw = window.innerWidth, sh = window.innerHeight;
      const gw = sm.width,        gh = sm.height;
      for (const ptr of pointers) {
        if (!ptr?.active || !ptr.event) continue;
        const e = ptr.event;
        let rx, ry;
        if (e.changedTouches?.length > 0) {
          let t = e.changedTouches[0];
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === ptr.identifier) { t = e.changedTouches[i]; break; }
          }
          rx = t.clientX; ry = t.clientY;
        } else if (e.clientX !== undefined) {
          rx = e.clientX; ry = e.clientY;
        } else continue;
        // 90°CW: portrait (rx,ry) → landscape game (ry/sh*gw, (1−rx/sw)*gh)
        ptr.x = ry / sh * gw;
        ptr.y = (1 - rx / sw) * gh;
      }
    }
    return _orig(type, pointers);
  };
});
