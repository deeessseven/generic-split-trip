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
  backgroundColor: '#00ff00', // TEMP DEBUG: green = canvas clear-color (inside the canvas)
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

// Sharpen ALL text game-wide: render every Text object's internal canvas at the device pixel
// ratio (capped) so glyphs stay crisp on high-DPI screens. Patched on the factory so it applies
// to every this.add.text(...) without editing each call. Text-only — it doesn't touch the
// canvas/camera/input (unlike full-DPI rendering, which broke).
{
  const textDpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const _text = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    style = style || {};
    if (style.resolution === undefined) style.resolution = textDpr;
    return _text.call(this, x, y, text, style);
  };
}

const game = new Phaser.Game(config);

// TEMP DEBUG: on-screen sizing readout to diagnose first-load fullscreen bars. Remove later.
// A DOM overlay (independent of the canvas) so it shows even if the canvas is mis-sized.
(function () {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:rgba(0,0,0,0.72);' +
    'color:#0f0;font:11px/1.35 monospace;padding:4px 6px;white-space:pre;pointer-events:none;';
  document.body.appendChild(box);
  const upd = () => {
    const vv = window.visualViewport;
    const gc = document.getElementById('game-container');
    const cv = gc && gc.querySelector('canvas');
    box.textContent =
      'win    ' + window.innerWidth + ' x ' + window.innerHeight + '\n' +
      'visual ' + (vv ? Math.round(vv.width) + ' x ' + Math.round(vv.height) : 'n/a') + '\n' +
      'cont   ' + (gc ? gc.offsetWidth + ' x ' + gc.offsetHeight : 'n/a') + '\n' +
      'buffer ' + (cv ? cv.width + ' x ' + cv.height : 'n/a') + '\n' +
      'disp   ' + (cv ? cv.offsetWidth + ' x ' + cv.offsetHeight : 'n/a') + '\n' +
      'screen ' + screen.width + ' x ' + screen.height + '\n' +
      'render ' + (game.renderer ? game.renderer.width + ' x ' + game.renderer.height : 'n/a') + '\n' +
      'dpr ' + (window.devicePixelRatio || 1) +
      '  ' + (window.innerHeight > window.innerWidth ? 'portrait' : 'landscape') +
      '  fs:' + (document.fullscreenElement ? 'Y' : 'N');
  };
  upd();
  setInterval(upd, 200);
})();

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
    // Robust sizing. The game always runs landscape (wide = larger available dim). In FULLSCREEN
    // we size to `screen` (the real full screen) because the viewport under-reports there (the
    // magenta bar); otherwise we use the visible viewport. We size the container explicitly,
    // refresh the scale manager, then FORCE the renderer and EVERY camera to match — Phaser's
    // CameraManager skips a camera's resize when it no longer matches the previous size, which is
    // what left the canvas clear-colour (green) bars.
    const forceSize = () => {
      try {
        let aw, ah;
        if (document.fullscreenElement) { aw = screen.width; ah = screen.height; }
        else { aw = window.innerWidth; ah = window.innerHeight; }
        const w = Math.max(aw, ah), h = Math.min(aw, ah);
        const gc = sm.parent;
        if (gc) {
          if (gc.style.width  !== w + 'px') gc.style.width  = w + 'px';
          if (gc.style.height !== h + 'px') gc.style.height = h + 'px';
        }
        sm.getParentBounds();
        sm.refresh();
        if (game.renderer && game.renderer.resize) game.renderer.resize(sm.baseSize.width, sm.baseSize.height);
        game.scene.getScenes(true).forEach((scn) => { if (scn.cameras) scn.cameras.resize(sm.gameSize.width, sm.gameSize.height); });
      } catch (e) { /* */ }
    };
    const settle = () => { forceSize(); [50, 150, 350, 700, 1200].forEach((t) => setTimeout(forceSize, t)); };
    window.addEventListener('orientationchange', settle);
    window.addEventListener('load', settle);
    window.addEventListener('resize', forceSize);
    document.addEventListener('fullscreenchange', settle);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', forceSize);
    [120, 350, 700, 1200, 2000].forEach((t) => setTimeout(forceSize, t));
    if (typeof ResizeObserver !== 'undefined' && sm.parent) {
      const ro = new ResizeObserver(() => forceSize());
      ro.observe(sm.parent);
    }

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
