import './style.css';
import Phaser from 'phaser';
import { BootScene }     from './scenes/BootScene.js';
import { MenuScene }     from './scenes/MenuScene.js';
import { GameScene }     from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { GAME_W, GAME_H } from './constants.js';
import { AudioSystem } from './AudioSystem.js';
import { maybeShowIosInstallHint } from './iosHint.js';

// iPhone Safari has no Fullscreen API, so the only way to true fullscreen is "Add to Home
// Screen". Show a one-time, dismissible hint telling the user how. No-ops on every other
// platform and can never block a game tap (the banner is pointer-events:none).
maybeShowIosInstallHint();

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

// On tap, enter fullscreen (hides the address bar) and lock to landscape-primary so device
// rotation has no effect. Triggered on pointerUP (finger-lift): Android Chrome honors the
// fullscreen API far more reliably on the completed gesture than on touch-start, which is why
// the first touch-start attempt used to fail with a TypeError. Retry on EVERY tap (no "achieved"
// latch) so a manual exit gets re-corrected, with a `pending` guard so overlapping requests
// can't collide into a TypeError. capture:true fires before Phaser handles the same event.
let fsPending = false;
document.addEventListener('pointerup', function () {
  if (document.fullscreenElement || fsPending) return;
  const el = document.documentElement;
  const req = el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el);
  const lockOrientation = () => { try { screen.orientation?.lock('landscape-primary').catch(() => {}); } catch (e) { /* */ } };
  if (!req) { lockOrientation(); return; }
  fsPending = true;
  Promise.resolve(req())
    .then(lockOrientation)
    .catch(() => {})
    .finally(() => { fsPending = false; });
}, { capture: true });

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  // Generate mipmaps (power-of-two textures only) so scrolling/minified textures don't
  // shimmer; antialias is the WebGL default but set explicitly. NPOT textures (e.g. the
  // gesture-hint thumb, or a procedural 48px hero fallback) simply skip mipmaps — no error.
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

    // CONTINUOUS RECONCILE. The discrete resize/orientation/fullscreen events fired with stale
    // dimensions (or were missed) on some devices, so the game only re-sized on scene CREATE
    // (first load / Play Again) — leaving bars after rotation or mid-game fullscreen. Instead we
    // poll the target size every tick and, the instant it changes, resize the container, the
    // scale manager, the renderer, AND every camera. The game always runs landscape (wide =
    // larger dim); in fullscreen we trust `screen` (the viewport under-reports there).
    let lastW = 0, lastH = 0;
    // Resize the container, scale manager, renderer, AND every camera to the target size.
    // The scenes themselves re-flow their CONTENT via relayoutOnResize() (see responsive.js),
    // which listens to the scale 'resize' event that sm.refresh() emits below.
    const applySize = (w, h) => {
      const gc = sm.parent;
      if (gc) { gc.style.width = w + 'px'; gc.style.height = h + 'px'; }
      sm.getParentBounds();
      sm.refresh();
      if (game.renderer && game.renderer.resize) game.renderer.resize(sm.baseSize.width, sm.baseSize.height);
      game.scene.getScenes(true).forEach((scn) => { if (scn.cameras) scn.cameras.resize(sm.gameSize.width, sm.gameSize.height); });
    };
    const reconcile = () => {
      try {
        let aw, ah;
        if (document.fullscreenElement) { aw = screen.width; ah = screen.height; }
        else { aw = window.innerWidth; ah = window.innerHeight; }
        const w = Math.max(aw, ah), h = Math.min(aw, ah);
        if (!w || !h || (w === lastW && h === lastH)) return;
        lastW = w; lastH = h;
        applySize(w, h);
      } catch (e) { /* */ }
    };
    setInterval(reconcile, 200);
    ['resize', 'orientationchange'].forEach((e) => window.addEventListener(e, reconcile));
    document.addEventListener('fullscreenchange', reconcile);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', reconcile);
    if (typeof ResizeObserver !== 'undefined' && sm.parent) {
      new ResizeObserver(reconcile).observe(sm.parent);
    }
    reconcile();
  }

  if (typeof im.updateInputPlugins !== 'function') return;
  const _orig = im.updateInputPlugins.bind(im);
  im.updateInputPlugins = function (type, pointers) {
    if (window.innerHeight > window.innerWidth) {
      const sw = window.innerWidth, sh = window.innerHeight;
      const gw = sm.width,        gh = sm.height;
      for (const ptr of pointers) {
        // Do NOT skip on !ptr.active. Phaser's touchend sets pointer.active=false BEFORE
        // updateInputPlugins(TOUCH_END) runs (see Pointer.touchend / InputManager.onTouchEnd),
        // so an `!active` guard dropped the finger-LIFT — the very event that fires a button's
        // 'pointerup'. In CSS-rotated portrait that left the lift uncorrected, so every menu/PLAY
        // tap missed its target (the bug only showed with auto-rotate OFF = portrait). A usable
        // event is all we need; the inner logic already `continue`s when coords are absent.
        if (!ptr?.event) continue;
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
