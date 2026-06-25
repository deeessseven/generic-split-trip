import {
  GRAVITY, FLAP_VELOCITY,
  BASE_SPEED, SPEED_RAMP, MAX_SPEED,
  SPAWN_DIST, VISIBLE_DIST,
  GAP_MULT_INITIAL, GAP_MULT_MIN, GAP_X_SCALE,
  WALL_THICKNESS, WALL_WIDTH,
  CHAR_TOPDOWN_Y_FRAC, CHAR_SIDE_X_FRAC,
  SPRITE_KEYS, GROUND_MARGIN,
  HERO_ANIM_FRAMES, HERO_ANIM_FPS,
} from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { AudioSystem } from '../AudioSystem.js';
import { safeInsets } from '../safeArea.js';
import { relayoutOnResize } from '../responsive.js';
import { addThumbHints } from '../thumbHints.js';
import { Flow } from '../Flow.js';

// ── Debug flag ────────────────────────────────────────────────────────────────
// Per-variant debug collision outline, toggled via gametext (debugOutline = true/false).
// Draws the pixel-accurate collision silhouette over each sprite (visible to players).
// Computed per scene as this._debugOutline in create() (GT is applied at boot).

// Count of NEW games started this page load (incremented by noteNewGame from the PLAY /
// PLAY AGAIN buttons — NOT in create(), so a resize-driven scene.restart() doesn't inflate it).
// The menu's gesture thumbs show for the first 3 games.
let gamesStarted = 0;
// ─────────────────────────────────────────────────────────────────────────────

// Frame-rate-independent lerp. A raw Phaser.Math.Linear(a, b, rate) converges at a
// fixed amount PER FRAME, so it feels faster at 120fps and slower at 30fps. This
// rescales `rate` (tuned for 60fps) by the real frame time so smoothing converges at
// the same wall-clock speed on any refresh rate.
function smooth(current, target, rate, dt) {
  return Phaser.Math.Linear(current, target, 1 - Math.pow(1 - rate, dt * 60));
}

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  // Call when the player deliberately starts a new game (PLAY / PLAY AGAIN), before
  // scene.start('GameScene'). Kept out of create() so a resize-driven restart isn't counted.
  static noteNewGame() { gamesStarted++; }

  // Reload custom sprites each time the game starts so Settings changes take effect
  preload() {
    SpriteManager.preloadCustom(this);
  }

  create() {
    // Re-fit on viewport change, but ONLY while the run is fresh. The first Play tap triggers the
    // fullscreen / address-bar transition, which grows the viewport right after create() built the
    // panels at the pre-fullscreen size — that re-fit is REQUIRED (else the first run shows dark
    // bars on the right/bottom). The transition fires sub-second, before any wall, so the veto
    // below still allows it. A LATER resize (mid-run rotation) is vetoed so it can't restart and
    // wipe progress. (A run already in progress keeps its layout; eliminating the bars there too
    // would need an in-place re-flow, a larger change.)
    relayoutOnResize(this, () => this.wallsPassed === 0 && this.elapsedTime < 3);
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Uniform scaling for large screens (tablets) ────────────────────────────
    // heroScale makes the hero, walls, gaps, and the jump/fall physics occupy the same
    // fraction of the screen on a tablet as they do on a ~REF_SHORT-tall phone. It is FLOORED
    // at 1, and REF_SHORT (520) sits above the largest phones' logical landscape short-side
    // (even high-DPI flagships ~480-512px), so for EVERY phone heroScale === 1 and every
    // "* this.heroScale" below is an exact identity — phones render byte-for-byte as before.
    // Only screens taller than 520px (tablets) scale up.
    const REF_SHORT = 520;
    this.heroScale  = Math.max(1, Math.min(W, H) / REF_SHORT);
    this.wallT      = WALL_THICKNESS * this.heroScale;
    this.wallW      = WALL_WIDTH     * this.heroScale;
    this.gravity    = GRAVITY        * this.heroScale;
    this.flapVel    = FLAP_VELOCITY  * this.heroScale;

    // ── Panel layout ──────────────────────────────────────────────────────────
    this.lW = W / 2;
    this.rX = W / 2;
    this.rW = W / 2;
    this.pH = H;

    this.charTopY  = CHAR_TOPDOWN_Y_FRAC * H;
    this.charSideX = this.rX + CHAR_SIDE_X_FRAC * this.rW;

    this.topScale  = this.charTopY / VISIBLE_DIST;
    this.sideScale = (this.rW * (1 - CHAR_SIDE_X_FRAC)) / VISIBLE_DIST;

    // Spawn obstacles fully OFF-SCREEN — just past each panel's entry edge — so they scroll
    // smoothly into view instead of popping in half-visible at the edge. At exactly VISIBLE_DIST
    // a wall's CENTER sits on the edge (half showing); pushing the spawn out by half the wall
    // size (+2px) in dist units hides it completely first. Top and side views have different
    // scales, so use whichever needs the larger lead-in.
    this.obstacleSpawnDist = VISIBLE_DIST + Math.max(
      (this.wallT / 2 + 2) / this.topScale,
      (this.wallW / 2 + 2) / this.sideScale,
    );

    // ── Character state ───────────────────────────────────────────────────────
    this.charXPx       = this.lW / 2;
    this.targetCharXPx = this.lW / 2;
    this.charYPx       = H * 0.20;
    this.velY          = 0;

    // ── Game state ────────────────────────────────────────────────────────────
    this.isAlive       = true;
    this.isDying       = false;
    this.elapsedTime   = 0;
    this.speed         = BASE_SPEED;
    this.distTraveled  = 0;
    this.nextSpawnDist = SPAWN_DIST * 0.1;
    this.obstacles     = [];
    this.wallsPassed   = 0;

    // ── Seeded RNG ────────────────────────────────────────────────────────────
    // INTENTIONAL: the fixed seed makes the gap CENTERS identical on every run, so a given hero
    // on a given screen size always faces the same course (fair for score comparison / practice).
    // The gap WIDTHS still vary with the hero's measured opaque size (see _spawnObstacle), and
    // edge-snapping is done in pixels — so a custom-uploaded hero or a different screen resolution
    // produces a slightly different layout. To fully randomize, seed with a variable (e.g. Date.now()).
    this.rng = new Phaser.Math.RandomDataGenerator(['doubleflap-v1']);

    // ── Top-view sprite rotation ──────────────────────────────────────────────
    this.topAngle     = 0;
    this.prevCharXPx  = this.lW / 2;
    this.smoothVelX   = 0;
    this.topTiltState = 'none'; // 'none' | 'left' | 'right'

    // ── Side-view sprite rotation ─────────────────────────────────────────────
    this.sideAngle  = 0;
    this.smoothVelY = 0;
    this.hasTapped  = false;
    this.wasRising  = false;
    this.apexTime   = 0;

    // Top hero's ±15% visual scale (recomputed each frame from the side hero's height)
    this.topVisScale = 1;

    // ── Input tracking ────────────────────────────────────────────────────────
    this.leftPointerId = -1;
    this._lastShuffleX = this.charXPx; // for throttling the top-view shuffle SFX

    // Switch to the upbeat gameplay theme
    AudioSystem.startMusic('game');

    // ── Visual objects ────────────────────────────────────────────────────────
    const bgTopKey  = SpriteManager.resolveKey(this, SPRITE_KEYS.BG_TOP);
    const bgSideKey = SpriteManager.resolveKey(this, SPRITE_KEYS.BG_SIDE);
    this.bgLeft  = this.add.tileSprite(this.lW / 2, H / 2, this.lW, H, bgTopKey);
    this.bgRight = this.add.tileSprite(this.rX + this.rW / 2, H / 2, this.rW, H, bgSideKey);

    // Parallax layer over each panel — same dot texture, scrolls slower than the base
    // background (see update) to suggest depth. Depth 0.5 keeps it above the base bg (0)
    // and below obstacles (2).
    this.bgLeftPara  = this.add.tileSprite(this.lW / 2, H / 2, this.lW, H, 'st_parallax').setDepth(0.5).setAlpha(0.3);
    this.bgRightPara = this.add.tileSprite(this.rX + this.rW / 2, H / 2, this.rW, H, 'st_parallax').setDepth(0.5).setAlpha(0.3);

    // Ground strip at bottom of side view. INTENTIONAL: it reuses the top-view background
    // texture (bgTopKey) so the floor reads as "ground" (same material as the top-down
    // terrain) rather than the side-view sky texture.
    this.groundStrip = this.add.tileSprite(this.rX + this.rW / 2, H - 10, this.rW, 20, bgTopKey).setDepth(2.5);

    // Obstacle TileSprite pool. Each visible obstacle uses up to 4 tiles (2 walls in the
    // top view + 2 in the side view). The on-screen worst case is ~16 tiles, so 32 is ample
    // headroom; but _placeTile also grows the pool on demand (using _obsKey) if it ever runs
    // dry, so a missing tile can never become an invisible-but-lethal wall. Invisible tiles
    // are nearly free.
    this._obsKey = SpriteManager.resolveKey(this, SPRITE_KEYS.OBSTACLE);
    this._obstacleTiles = Array.from({ length: 32 }, () =>
      this.add.tileSprite(0, 0, 1, 1, this._obsKey).setDepth(2).setVisible(false)
    );
    this._obstacleTileIdx = 0;

    // Debug collision outline — enabled per-variant via gametext (debugOutline = true)
    this._debugOutline = String(GT.debugOutline).trim() === 'true';
    this.debugGfx = this._debugOutline ? this.add.graphics().setDepth(20) : null;

    // Flap-puff ("cloud") placement, configurable via gametext. parseInt → garbage/empty
    // falls back to the default rather than 0; result is clamped to its valid range.
    // Top: 1..9 as a 3×3 grid over the opaque sprite (1-3 front/top, 4-6 middle, 7-9
    // back/bottom; cols left/center/right). 8 = back-center = the legacy position.
    // Side: 1..5 horizontally across the opaque width (1=left, 3=center, 5=right).
    const clampPos = (v, lo, hi, def) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
    };
    this._cloudTopPos  = clampPos(GT.cloudTopPos,  1, 9, 8);
    this._cloudSidePos = clampPos(GT.cloudSidePos, 1, 5, 2);

    // Character sprites (on top of obstacles and gap indicator).
    // ctKey/csKey are the 128px gameplay textures (frame 1 of the hero) — a gamma-correct
    // (linear-light) downscale of the native art — used for BOTH collision (1 texel = 1 world px)
    // and DISPLAY, shown 1:1 at the 128px footprint. The hero is a Sprite running a looped idle
    // built from frame 1 + the *_disp2..N frames (bundled heroes only; an upload is single-frame).
    // Collision uses frame 1 only, so the hitbox is static. The 512px _title texture still serves
    // the menu's larger hero. topDisplayScale resolves to 1 (128/128) below.
    const ctKey = SpriteManager.resolveKey(this, SPRITE_KEYS.CHAR_TOP);
    const csKey = SpriteManager.resolveKey(this, SPRITE_KEYS.CHAR_SIDE);
    this.charTopSprite  = this._makeHero(this.charXPx, this.charTopY,  SPRITE_KEYS.CHAR_TOP,  ctKey, 'heroTopIdle');
    this.charSideSprite = this._makeHero(this.charSideX, this.charYPx, SPRITE_KEYS.CHAR_SIDE, csKey, 'heroSideIdle');

    // Flap puff emitters (emit on demand from _onDown). angle is the emission direction
    // in degrees: 0=right, 90=down, 180=left, 270=up.
    // Side: ONE soft puff (wide and short) near the bottom of the hero's opaque pixels
    // (shifted left). No motion — it just appears and fades. Depth 3.5 (above the hero).
    this.flapFX = this.add.particles(0, 0, 'st_particle', {
      lifespan: 450,
      speed: 0, // stationary — just shows up and disappears, no shooting
      scaleX: { start: 8.4, end: 0 }, // double the length (was 4.2)
      scaleY: { start: 2.1, end: 0 }, // half the height (was 4.2)
      alpha: { start: 0.65, end: 0 },
      emitting: false,
    }).setDepth(3.5);

    // Top: ONE extra-large soft poof from the bottom 1/3 of the opaque pixels, drifting
    // gently downward. Depth 2.6 (BELOW the hero's depth 3) so the bird sits on top of it
    // and it reads as coming out from underneath.
    this.topFlapFX = this.add.particles(0, 0, 'st_particle', {
      lifespan: 500,
      speed: { min: 10, max: 55 },
      angle: { min: 60, max: 120 },
      scale: { start: 7.5, end: 0 }, // 75% of the previous 10.0
      alpha: { start: 0.6, end: 0 },
      emitting: false,
    }).setDepth(2.6);

    // Shaped collision silhouette. For an animated hero it's the AVERAGE outline of its frames
    // (per-row mean of the left/right opaque edges, over the rows a majority of frames share); a
    // single-frame hero (custom upload / static / procedural) uses just its own silhouette.
    this.hitboxScale    = 0.95 * this.heroScale;
    this.charTopBounds  = this._averagedBounds(this._heroFrameKeys(SPRITE_KEYS.CHAR_TOP,  ctKey));
    this.charSideBounds = this._averagedBounds(this._heroFrameKeys(SPRITE_KEYS.CHAR_SIDE, csKey));
    // Factor that renders the display texture at the 128px logical footprint: gameplay-texture-
    // width / display-texture-width. Display == the 128px frame-1 texture, so this is 1 (a higher-
    // res custom upload would scale down). All visual scaling multiplies by this.
    this.topDisplayScale  = this.charTopBounds.w  / this.textures.getFrame(ctKey).realWidth  * this.heroScale;
    this.sideDisplayScale = this.charSideBounds.w / this.textures.getFrame(csKey).realWidth * this.heroScale;
    this.charTopSprite.setScale(this.topDisplayScale);
    this.charSideSprite.setScale(this.sideDisplayScale);

    // Top-view panel-edge clamp extent, measured dynamically from the silhouette over the tilt
    // range the hero actually holds toward each edge (right edge → 0…+20° CW, left edge →
    // 0…−20° CCW, matching topTarget). Each edge uses ONLY its own tilt direction, so the
    // opposite tilt's corner can't inflate the bound — the fully-tilted hero's opaque pixels
    // touch the edge with no gap, and no intermediate tilt pokes past. Constant (computed once)
    // so the clamp can't rattle. Movement-only; wall collision is unaffected.
    {
      const tb = this.charTopBounds;
      const tcx = tb.w / 2, tcy = tb.h / 2;
      let maxOff = -Infinity, minOff = Infinity;
      for (let deg = 0; deg <= 20; deg += 2) {   // right edge: tilt 0 → +20° (CW)
        const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        for (let row = 0; row < tb.h; row++) {
          if (!isFinite(tb.rowMaxX[row])) continue;
          const offR = (tb.rowMaxX[row] - tcx) * ca - (row - tcy) * sa;
          if (offR > maxOff) maxOff = offR;
        }
      }
      for (let deg = 0; deg >= -20; deg -= 2) {  // left edge: tilt 0 → −20° (CCW)
        const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        for (let row = 0; row < tb.h; row++) {
          if (!isFinite(tb.rowMinX[row])) continue;
          const offL = (tb.rowMinX[row] - tcx) * ca - (row - tcy) * sa;
          if (offL < minOff) minOff = offL;
        }
      }
      this.topClampMaxOff = (isFinite(maxOff) ? maxOff : tcx)  * this.heroScale;
      this.topClampMinOff = (isFinite(minOff) ? minOff : -tcx) * this.heroScale;
    }

    // Static center divider — drawn once, never needs to be redrawn
    this.add.rectangle(W / 2, H / 2, 3, H, 0x546e7a, 0.9).setDepth(5);

    // Vignette — radial gradient texture stretched over the screen for focus/depth.
    // Transparent center means HUD readability near the middle is unaffected.
    this.add.image(W / 2, H / 2, 'st_vignette').setDisplaySize(W, H).setDepth(8);

    // Score HUD: "<walls> walls  |  <seconds>s", with the | sitting exactly on the divider.
    // Three anchored pieces (walls right-aligned, centered pipe, seconds left-aligned) so the
    // pipe lands on the vertical divider line regardless of how wide each side gets.
    const scoreStyle = {
      fontSize: `${Math.round(18 * this.heroScale)}px`,
      fontFamily: '"Arial Black", Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: Math.max(1, Math.round(4 * this.heroScale)),
    };
    const scoreDivX = W / 2;
    const scoreGap  = 12 * this.heroScale;
    this.scoreWallsTxt = this.add.text(scoreDivX - scoreGap, 6, `0 ${GT.scoreUnit}`, scoreStyle).setOrigin(1, 0).setDepth(6);
    this.add.text(scoreDivX, 6, '|', scoreStyle).setOrigin(0.5, 0).setDepth(6);
    this.scoreTimeTxt = this.add.text(scoreDivX + scoreGap, 6, '0.00s', scoreStyle).setOrigin(0, 0).setDepth(6);

    // Panel labels. The screen may have rounded corners and/or a notch/cutout that clips the
    // corners. Vertical inset is small (labels sit near the top edge); horizontal inset is
    // larger so BOTH labels clear the rounded corners — otherwise the side WITHOUT a safe-area
    // inset (the non-notch side) clips while the notch side stays clear. Per-side safe-area is
    // added on top to also clear an actual notch/cutout.
    const si = safeInsets();
    const cornerY = Math.round(Math.min(W, H) * 0.02);
    const cornerX = Math.round(Math.min(W, H) * 0.04);
    const labelTopY = cornerY + si.top;
    // Both labels nudged ~10px toward the horizontal center, dynamically (W × 0.01).
    // TOP VIEW also keeps its ~40px left offset (W × 0.04), clamped to the left edge.
    const centerNudge = Math.round(W * 0.01);
    const topViewShift = Math.round(W * 0.04);
    const topViewX = Math.max(2, cornerX + si.left - topViewShift + centerNudge);
    fitText(this.add.text(topViewX, labelTopY, `${GT.labelTopView}\n${GT.labelTopHint}`, {
      fontSize: `${Math.round(11 * this.heroScale)}px`, fontFamily: 'Arial', color: '#eceff1',
      alpha: 0.7,
    }).setDepth(6), W * 0.45);
    fitText(this.add.text(W - cornerX - si.right - centerNudge, labelTopY, `${GT.labelSideView}\n${GT.labelSideHint}`, {
      fontSize: `${Math.round(11 * this.heroScale)}px`, fontFamily: 'Arial', color: '#eceff1', align: 'right',
      alpha: 0.7,
    }).setOrigin(1, 0).setDepth(6), W * 0.45);

    // First-time-only gesture hint (the menu thumbs); no per-game text messages.
    this._showStartThumbs();

    // ── Input ─────────────────────────────────────────────────────────────────
    this.input.on('pointerdown',      this._onDown, this);
    this.input.on('pointermove',      this._onMove, this);
    this.input.on('pointerup',        this._onUp,   this);
    this.input.on('pointerupoutside', this._onUp,   this);
  }

  // Create a hero Sprite at (x, y). For the bundled hero (dispKey === baseKey) with 2+ frames,
  // build (once) and play a looped idle animation from frame 1 (baseKey) + baseKey_disp2..N. A
  // custom upload (dispKey !== baseKey) is single-frame and stays static. Returns the Sprite.
  _makeHero(x, y, baseKey, dispKey, animKey) {
    const sprite = this.add.sprite(x, y, dispKey).setDepth(3);
    if (dispKey === baseKey) {
      const frames = [{ key: baseKey }];
      for (let i = 2; i <= HERO_ANIM_FRAMES; i++) {
        const dk = `${baseKey}_disp${i}`;
        if (this.textures.exists(dk)) frames.push({ key: dk });
      }
      if (frames.length >= 2) {
        if (!this.anims.exists(animKey)) {
          this.anims.create({ key: animKey, frames, frameRate: HERO_ANIM_FPS, repeat: -1 });
        }
        sprite.play(animKey);
      }
    }
    return sprite;
  }

  // ── Input handlers ─────────────────────────────────────────────────────────

  _onDown(ptr) {
    if (this.isDying) return;
    if (ptr.x < this.rX) {
      if (this.leftPointerId === -1) {
        this.leftPointerId = ptr.id;
        this.targetCharXPx = Phaser.Math.Clamp(ptr.x, 0, this.lW);
      }
    } else {
      this.velY = this.flapVel;
      this.sideAngle = -20; // snap CCW immediately on tap
      this.hasTapped = true;
      this.wasRising = true;
      this._emitFlapPuffs();
      AudioSystem.playJump();
    }
  }

  _onMove(ptr) {
    if (this.isDying) return;
    if (ptr.id === this.leftPointerId) {
      this.targetCharXPx = Phaser.Math.Clamp(ptr.x, 0, this.lW);
    }
  }

  _onUp(ptr) {
    if (ptr.id === this.leftPointerId) this.leftPointerId = -1;
  }

  // Flap thrust: one puff per view, fired together.
  _emitFlapPuffs() {
    // Side: one soft puff at cloudSidePos (1..5) across the opaque width, and raised from the
    // bottom-most opaque pixel by 1/5 of the (untilted) opaque height. Adaptive per sprite,
    // untilted (ignores the flap tilt). Tracks the ±15% visual scale.
    if (this.flapFX) {
      const sb = this.charSideBounds;
      const sc = this.charSideSprite.scaleX / this.sideDisplayScale * this.heroScale; // logical (128px→world) scale, minus the display-texture factor; ×heroScale re-applies the large-screen scale folded into sideDisplayScale
      const cx = sb.w / 2, cy = sb.h / 2;
      const px = sb.leftEdge + (sb.rightEdge - sb.leftEdge) * (this._cloudSidePos - 1) / 4;
      const py = sb.botEdge - (sb.botEdge - sb.topEdge) / 5; // up 1/5 of the opaque height
      const ex = this.charSideX + (px - cx) * sc;
      const ey = this.charYPx   + (py - cy) * sc;
      this.flapFX.emitParticleAt(ex, ey, 1);
    }
    // Top: one extra-large soft poof at cloudTopPos (1..9), a 3×3 grid over the opaque pixels.
    if (this.topFlapFX) {
      const tb = this.charTopBounds;
      const tcx = tb.w / 2, tcy = tb.h / 2;
      const th = this.topAngle * Math.PI / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      // Row band → scanline at the center of the top/middle/bottom third (0=front, 1=middle,
      // 2=back). Default 8 → band 2 → botEdge-(botEdge-topEdge)/6, the legacy middle-of-bottom-1/3.
      const band = Math.floor((this._cloudTopPos - 1) / 3);
      const col  = (this._cloudTopPos - 1) % 3; // 0=left, 1=center, 2=right
      const rowY = tb.topEdge + (tb.botEdge - tb.topEdge) * (2 * band + 1) / 6;
      const row  = Math.min(tb.h - 1, Math.max(0, Math.round(rowY)));
      const lx = isFinite(tb.rowMinX[row]) ? tb.rowMinX[row] : tb.leftEdge;
      const rx = isFinite(tb.rowMaxX[row]) ? tb.rowMaxX[row] : tb.rightEdge;
      const px = col === 0 ? lx : col === 2 ? rx : (lx + rx) / 2;
      const ex = this.charXPx  + ((px - tcx) * cos - (row - tcy) * sin) * this.heroScale;
      const ey = this.charTopY + ((px - tcx) * sin + (row - tcy) * cos) * this.heroScale;
      this.topFlapFX.emitParticleAt(ex, ey, 1);
    }
  }

  // ── Obstacle management ────────────────────────────────────────────────────

  _spawnObstacle() {
    const steps = Math.floor(this.elapsedTime);   // tighten gaps every 1 second (was every 5 s)
    const decay = Math.pow(0.99, steps);           // −1% per second, floored at the dynamic minimum

    // Gaps are derived dynamically from the hero's measured opaque pixel size (per axis),
    // so they scale automatically with the 128px hero or any uploaded sprite:
    //   horizontal gap ← top-view hero's opaque WIDTH (it steers left/right there)
    //   vertical gap   ← side-view hero's opaque HEIGHT (it rises/falls there)
    // Gap = hero hitbox size × GAP_MULT_INITIAL, shrinking with `decay` toward a floor of
    // hero × GAP_MULT_MIN so it always remains passable.
    const S = this.hitboxScale;
    const heroFracX = this.charTopBounds.maxHalfW  * 2 * S / this.lW * GAP_X_SCALE; // hero hitbox width (×1.2) as left-panel fraction
    const heroFracY = this.charSideBounds.maxHalfH * 2 * S / this.pH; // hero hitbox height as panel-height fraction

    // A wall segment may be 0 (gap reaches the edge), but never a thin sliver: if a segment
    // lands in (0, MIN_SEG) px, snap it to 0 or MIN_SEG (whichever is nearer) by nudging that
    // gap edge. Operating on the STORED gap edges keeps draw + collision consistent. rng order
    // (gapX then gapY) is preserved so the seeded layout is unchanged.
    const MIN_SEG = 10;
    const snapEdges = (centerFrac, widthFrac, span) => {
      let lo = centerFrac * span - (widthFrac / 2) * span; // near edge (px from 0)
      let hi = centerFrac * span + (widthFrac / 2) * span; // far edge (px to span)
      if (lo > 0 && lo < MIN_SEG)               lo = lo < MIN_SEG / 2 ? 0 : MIN_SEG;
      const farW = span - hi;
      if (farW > 0 && farW < MIN_SEG)           hi = farW < MIN_SEG / 2 ? span : span - MIN_SEG;
      lo = Math.max(0, lo); hi = Math.min(span, hi);
      return { width: (hi - lo) / span, center: (lo + hi) / 2 / span };
    };

    const gapXraw  = this.rng.realInRange(0.18, 0.82); // rng #1
    const gapXWraw = Math.max(heroFracX * GAP_MULT_INITIAL * decay, heroFracX * GAP_MULT_MIN);
    const gx = snapEdges(gapXraw, gapXWraw, this.lW);

    const gapYraw  = this.rng.realInRange(0.18, 0.82); // rng #2
    const gapYHraw = Math.max(heroFracY * GAP_MULT_INITIAL * decay, heroFracY * GAP_MULT_MIN);
    const gy = snapEdges(gapYraw, gapYHraw, this.pH);

    this.obstacles.push({
      dist: this.obstacleSpawnDist,
      gapX: gx.center, gapXW: gx.width,
      gapY: gy.center, gapYH: gy.width,
      passed: false,
    });
  }

  // The texture keys whose silhouettes define this view's collision: the bundled idle frames
  // (base + _disp2..N) when it's the bundled hero, else just the resolved key (a single-frame
  // custom upload / static / procedural hero — nothing to average).
  _heroFrameKeys(baseKey, resolvedKey) {
    if (resolvedKey !== baseKey) return [resolvedKey];
    const keys = [baseKey];
    for (let i = 2; i <= HERO_ANIM_FRAMES; i++) {
      const dk = `${baseKey}_disp${i}`;
      if (this.textures.exists(dk)) keys.push(dk);
    }
    return keys;
  }

  // AVERAGE silhouette across the given frame textures: per row, the mean of each frame's left/
  // right opaque edge, INCLUDING the row only when a strict majority of frames have pixels there
  // (so transient extremities don't enlarge the hitbox). Edges/broad-phase extents are rebuilt
  // from the averaged profile. A single key just returns that frame's silhouette (no averaging).
  _averagedBounds(keys) {
    if (keys.length <= 1) return this._spriteBounds(keys[0]);
    const per = keys.map((k) => this._spriteBounds(k));
    const n = per.length;
    const w = per[0].w, h = per[0].h;
    const rowMinX = new Float32Array(h).fill(Infinity);
    const rowMaxX = new Float32Array(h).fill(-Infinity);
    for (let y = 0; y < h; y++) {
      let cnt = 0, sumMin = 0, sumMax = 0;
      for (let f = 0; f < n; f++) {
        const lo = per[f].rowMinX[y];
        if (isFinite(lo)) { cnt++; sumMin += lo; sumMax += per[f].rowMaxX[y]; }
      }
      if (cnt * 2 > n) { rowMinX[y] = sumMin / cnt; rowMaxX[y] = sumMax / cnt; } // strict majority
    }
    let topEdge = h, botEdge = -1, leftEdge = w, rightEdge = -1;
    for (let y = 0; y < h; y++) {
      if (rowMinX[y] < Infinity) {
        if (y < topEdge) topEdge = y;
        if (y > botEdge) botEdge = y;
        if (rowMinX[y] < leftEdge)  leftEdge  = rowMinX[y];
        if (rowMaxX[y] > rightEdge) rightEdge = rowMaxX[y];
      }
    }
    if (botEdge < 0) return per[0]; // degenerate (no shared rows) — fall back to frame 1
    const maxHalfW = Math.max(Math.abs(w / 2 - leftEdge), Math.abs(w / 2 - rightEdge));
    const maxHalfH = Math.max(Math.abs(h / 2 - topEdge),  Math.abs(h / 2 - botEdge));
    return { w, h, topEdge, botEdge, leftEdge, rightEdge, maxHalfW, maxHalfH, rowMinX, rowMaxX };
  }

  // Returns per-row X extents of non-transparent pixels (the only profile collision uses).
  // rowMinX[y] / rowMaxX[y] = leftmost/rightmost opaque pixel in sprite row y (Infinity if empty).
  // maxHalfW / maxHalfH = farthest opaque pixel from sprite center, for broad-phase overlap check.
  _spriteBounds(key) {
    const frame = this.textures.getFrame(key);
    const fallback = (w, h) => {
      const rowMinX = new Float32Array(h).fill(0);
      const rowMaxX = new Float32Array(h).fill(w - 1);
      return { w, h, topEdge: 0, botEdge: h - 1, leftEdge: 0, rightEdge: w - 1,
               maxHalfW: w / 2, maxHalfH: h / 2, rowMinX, rowMaxX };
    };
    if (!frame) return fallback(48, 48);

    const w = frame.realWidth, h = frame.realHeight;
    const rowMinX = new Float32Array(h).fill(Infinity);
    const rowMaxX = new Float32Array(h).fill(-Infinity);

    // Read every pixel's alpha in ONE getImageData call (a single GPU→CPU readback)
    // instead of per-pixel textures.getPixelAlpha(), which stalls the GPU once per
    // pixel — ~200x slower and the cause of the multi-minute hang on real devices.
    // The opaque-pixel result is identical; only the read primitive changes.
    let data;
    try {
      const src = this.textures.get(key).getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(src, 0, 0, w, h);
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      return fallback(w, h);
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 10) {
          if (x < rowMinX[y]) rowMinX[y] = x;
          if (x > rowMaxX[y]) rowMaxX[y] = x;
        }
      }
    }

    let topEdge = h, botEdge = -1, leftEdge = w, rightEdge = -1;
    for (let y = 0; y < h; y++) {
      if (rowMinX[y] < Infinity) {
        if (y < topEdge)          topEdge   = y;
        if (y > botEdge)          botEdge   = y;
        if (rowMinX[y] < leftEdge)  leftEdge  = rowMinX[y];
        if (rowMaxX[y] > rightEdge) rightEdge = rowMaxX[y];
      }
    }

    if (botEdge < 0) return fallback(w, h);

    // Maximum distance from sprite center to any opaque pixel edge, per axis
    const maxHalfW = Math.max(Math.abs(w / 2 - leftEdge), Math.abs(w / 2 - rightEdge));
    const maxHalfH = Math.max(Math.abs(h / 2 - topEdge),  Math.abs(h / 2 - botEdge));
    return { w, h, topEdge, botEdge, leftEdge, rightEdge, maxHalfW, maxHalfH, rowMinX, rowMaxX };
  }

  // ── Game over ──────────────────────────────────────────────────────────────

  _triggerGameOver(hitX, hitY) {
    if (this.isDying) return;
    this.isDying = true;
    this.isAlive = false;
    // Freeze the hero idle animation on the current frame (safe no-op if it wasn't animating).
    this.charTopSprite.stop();
    this.charSideSprite.stop();
    AudioSystem.playCrash();

    if (hitX !== undefined) {
      // Collision mark (a.k.a. hit mark) — uploadable sprite (default: red X). Drawn at 32px
      // to match its preferred 32×32 size.
      const hitKey = SpriteManager.resolveKey(this, SPRITE_KEYS.HIT_MARK);
      this.add.image(hitX, hitY, hitKey).setDisplaySize(32 * this.heroScale, 32 * this.heroScale).setDepth(10);

      // Debris burst at the impact point
      this.add.particles(0, 0, 'st_particle', {
        lifespan: 600,
        speed: { min: 60, max: 200 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffffff, 0xff8888, 0xffd54f],
        emitting: false,
      }).setDepth(11).explode(24, hitX, hitY);
    }

    this.cameras.main.shake(400, 0.018);
    this.cameras.main.flash(250, 255, 60, 60, false);
    this.time.delayedCall(1500, () => {
      Flow.go(this, 'gameOver', {
        score: this.wallsPassed,
        time:  this.elapsedTime,
      });
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _placeTile(x, y, w, h, tileOffsetX = 0) {
    let t = this._obstacleTiles[this._obstacleTileIdx];
    if (!t) { // pool ran dry — grow it so a wall segment can never be skipped (invisible-but-lethal)
      t = this.add.tileSprite(0, 0, 1, 1, this._obsKey).setDepth(2);
      this._obstacleTiles.push(t);
    }
    this._obstacleTileIdx++;
    t.setPosition(x + w / 2, y + h / 2).setSize(w, h).setTilePosition(tileOffsetX, 0).setVisible(true);
  }

  _renderObstacles() {
    this._obstacleTileIdx = 0;
    for (const t of this._obstacleTiles) t.setVisible(false);
    for (const obs of this.obstacles) {
      this._drawTopDownObstacle(obs);
      this._drawSideObstacle(obs);
    }
  }

  _drawTopDownObstacle(obs) {
    const screenY = this.charTopY - obs.dist * this.topScale;
    if (screenY < -this.wallT - 2 || screenY > this.pH + this.wallT + 2) return;

    const gapCX = obs.gapX * this.lW;
    const gapHW = (obs.gapXW / 2) * this.lW;
    const wallY = screenY - this.wallT / 2;

    const leftW = gapCX - gapHW;
    if (leftW > 0) this._placeTile(0, wallY, leftW, this.wallT);

    const rightStart = gapCX + gapHW;
    const rightW = this.lW - rightStart;
    if (rightW > 0) this._placeTile(rightStart, wallY, rightW, this.wallT);
  }

  _drawSideObstacle(obs) {
    const screenX  = this.charSideX + obs.dist * this.sideScale;
    const wallLeft = screenX - this.wallW / 2;
    if (wallLeft > this.rX + this.rW + 2 || wallLeft + this.wallW < this.rX - 2) return;

    const gapCY     = obs.gapY * this.pH;
    const gapHH     = (obs.gapYH / 2) * this.pH;
    const gapTop    = gapCY - gapHH;
    const gapBottom = gapCY + gapHH;

    const drawX      = Math.max(wallLeft, this.rX);
    const drawW      = Math.min(wallLeft + this.wallW, this.rX + this.rW) - drawX;
    if (drawW <= 0) return;
    const clipOffset = drawX - wallLeft; // keep texture aligned when left edge is clipped by divider

    if (gapTop > 0)          this._placeTile(drawX, 0,         drawW, gapTop,              clipOffset);
    if (gapBottom < this.pH) this._placeTile(drawX, gapBottom, drawW, this.pH - gapBottom, clipOffset);
  }

  // ── Touch hint overlay ─────────────────────────────────────────────────────

  // For the first 3 games (per page load), overlay the menu's gesture thumbs — left slides L/R
  // (steer), right taps up/down (rise) — for 3 seconds, then fade out fully. Gated on
  // gamesStarted (counted at PLAY/PLAY AGAIN, not in create), so a resize-driven restart shows
  // the hint again for the SAME game without consuming one of the three. No per-game text.
  _showStartThumbs() {
    if (gamesStarted > 3 || !this.textures.exists('thumb_hint')) return;

    const W = this.scale.width, H = this.scale.height;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const { objs } = addThumbHints(this, {
      leftX: this.lW / 2, rightX: this.rX + this.rW / 2, s, W, H, depthHand: 30, depthShadow: 29,
    });
    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: objs, alpha: 0, duration: 700, ease: 'Sine.easeIn',
        onComplete: () => objs.forEach((o) => { this.tweens.killTweensOf(o); o.destroy(); }),
      });
    });
  }

  // ── Main update loop ───────────────────────────────────────────────────────

  update(_, delta) {
    if (!this.isAlive) return;
    // Clamp dt so a long frame (tab/app backgrounded, GC pause, slow device) can't
    // integrate a giant physics step that teleports the bird through a wall or skips
    // an obstacle's collision band entirely (tunneling). Worst case the game briefly
    // runs in slow-motion instead of breaking.
    const dt = Math.min(delta / 1000, 1 / 30);

    this.elapsedTime += dt;
    this.speed = Math.min(BASE_SPEED + this.elapsedTime * SPEED_RAMP, MAX_SPEED);

    this.distTraveled += this.speed * dt;

    this.bgLeft.tilePositionY  -= this.speed * this.topScale  * dt;
    this.bgRight.tilePositionX     += this.speed * this.sideScale * dt;
    this.groundStrip.tilePositionX += this.speed * this.sideScale * dt;

    // Parallax layers scroll at 45% speed for a sense of depth
    this.bgLeftPara.tilePositionY  -= this.speed * this.topScale  * dt * 0.45;
    this.bgRightPara.tilePositionX += this.speed * this.sideScale * dt * 0.45;

    // ── Vertical physics (side view) ────────────────────────────────────────
    this.velY    += this.gravity * dt;
    this.charYPx += this.velY * dt;

    // Ceiling / floor — walk each row of the rotated side sprite to find true min/max world Y
    const S    = this.hitboxScale;
    const sb   = this.charSideBounds;
    const θ    = this.sideAngle * Math.PI / 180;
    const cosθ = Math.cos(θ);
    const sinθ = Math.sin(θ);
    const cosA = Math.abs(cosθ);
    const sinA = Math.abs(sinθ);
    const rotHalfW = (sb.maxHalfW * cosA + sb.maxHalfH * sinA) * S; // kept for broad-phase
    const cx = sb.w / 2, cy = sb.h / 2;

    let minWY = Infinity, maxWY = -Infinity, minWYx = this.charSideX, maxWYx = this.charSideX;
    for (let row = 0; row < sb.h; row++) {
      if (!isFinite(sb.rowMinX[row])) continue;
      const wxL = this.charSideX + ((sb.rowMinX[row] - cx) * cosθ - (row - cy) * sinθ) * S;
      const wyL = this.charYPx   + ((sb.rowMinX[row] - cx) * sinθ + (row - cy) * cosθ) * S;
      const wxR = this.charSideX + ((sb.rowMaxX[row] - cx) * cosθ - (row - cy) * sinθ) * S;
      const wyR = this.charYPx   + ((sb.rowMaxX[row] - cx) * sinθ + (row - cy) * cosθ) * S;
      if (wyL < minWY) { minWY = wyL; minWYx = wxL; }
      if (wyL > maxWY) { maxWY = wyL; maxWYx = wxL; }
      if (wyR < minWY) { minWY = wyR; minWYx = wxR; }
      if (wyR > maxWY) { maxWY = wyR; maxWYx = wxR; }
    }
    if (minWY < 0) {
      this.charYPx -= minWY;
      this._triggerGameOver(minWYx, 0); // hero's topmost pixel, at the ceiling
      return;
    }
    if (maxWY >= this.pH - GROUND_MARGIN) {
      this.charYPx -= maxWY - (this.pH - GROUND_MARGIN);
      this._triggerGameOver(maxWYx, this.pH - GROUND_MARGIN); // bottommost pixel, at the floor
      return;
    }

    // Top hero scales ±15% with the side hero's vertical position: side at the top of the
    // display → +15%, at the bottom → −15%. Visual only — the wall-hit collision
    // (charTopBounds × hitboxScale) is unaffected; the opaque-pixel clamp below multiplies
    // by this scale so the (now larger/smaller) visible pixels still respect the bounds.
    this.topVisScale = Phaser.Math.Clamp(1 + (0.5 - this.charYPx / this.pH) * 0.20, 0.90, 1.10);

    // ── Horizontal position (top-down, smooth follow finger) ────────────────
    this.charXPx = smooth(this.charXPx, this.targetCharXPx, 0.22, dt);

    // Constrain to the panel using the PRECOMPUTED extent (topClampMinOff/MaxOff = the opaque
    // reach at the push-tilt for each edge, computed in create). A constant boundary means
    // holding against an edge can't rattle (no live-angle feedback). Still scaled by ±10% size.
    //  • rightmost opaque pixel must not pass the left side of the center divider
    //  • leftmost opaque pixel must not pass the left edge of the screen
    {
      const vs = this.topVisScale;
      const minC = -this.topClampMinOff * vs;                  // leftmost opaque ≥ 0
      const maxC = (this.lW - 1.5) - this.topClampMaxOff * vs; // rightmost opaque ≤ divider's left edge
      this.charXPx = Phaser.Math.Clamp(this.charXPx, Math.min(minC, maxC), Math.max(minC, maxC));
    }

    // Shuffle SFX: one tick per ~40px of top-view movement (footstep feel; ignores jitter)
    if (Math.abs(this.charXPx - this._lastShuffleX) > 40) {
      AudioSystem.playShuffle();
      this._lastShuffleX = this.charXPx;
    }

    // ── Spawn obstacles ──────────────────────────────────────────────────────
    while (this.distTraveled >= this.nextSpawnDist) {
      const lvl = Math.floor(this.elapsedTime / 10);
      const interval = Math.max(SPAWN_DIST - lvl * 20, SPAWN_DIST * 0.6);
      this.nextSpawnDist += interval;
      this._spawnObstacle();
    }

    // ── Update obstacles + shaped silhouette collision ────────────────────────
    const tb   = this.charTopBounds;
    const θTop = this.topAngle * Math.PI / 180;
    const cosT = Math.cos(θTop);
    const sinT = Math.sin(θTop);
    const tcx  = tb.w / 2, tcy = tb.h / 2;
    const rotHalfH_top = (tb.maxHalfW * Math.abs(sinT) + tb.maxHalfH * Math.abs(cosT)) * S;

    for (const obs of this.obstacles) {
      obs.dist -= this.speed * dt;
      if (obs.passed) continue;

      const absDist     = Math.abs(obs.dist);
      const topOverlap  = absDist * this.topScale  < this.wallT / 2 + rotHalfH_top;
      const sideOverlap = absDist * this.sideScale < this.wallW / 2 + rotHalfW;

      if (topOverlap) {
        const wallSY   = this.charTopY - obs.dist * this.topScale;
        const wallTop  = wallSY - this.wallT / 2;
        const wallBot  = wallSY + this.wallT / 2;
        const gapLeft  = obs.gapX * this.lW - (obs.gapXW / 2) * this.lW;
        const gapRight = obs.gapX * this.lW + (obs.gapXW / 2) * this.lW;
        for (let row = 0; row < tb.h; row++) {
          if (!isFinite(tb.rowMinX[row])) continue;
          const py  = row;
          const wxL = this.charXPx  + ((tb.rowMinX[row]-tcx)*cosT - (py-tcy)*sinT) * S;
          const wyL = this.charTopY + ((tb.rowMinX[row]-tcx)*sinT + (py-tcy)*cosT) * S;
          const wxR = this.charXPx  + ((tb.rowMaxX[row]-tcx)*cosT - (py-tcy)*sinT) * S;
          const wyR = this.charTopY + ((tb.rowMaxX[row]-tcx)*sinT + (py-tcy)*cosT) * S;
          const rowMinWY = Math.min(wyL, wyR);
          const rowMaxWY = Math.max(wyL, wyR);
          if (rowMaxWY < wallTop || rowMinWY > wallBot) continue;
          // Clamp row X span to the portion overlapping the wall band in Y (track Y too)
          const dWY = wyR - wyL;
          let cwxL, cwxR, cwyL, cwyR;
          if (Math.abs(dWY) < 0.5) {
            cwxL = wxL; cwxR = wxR; cwyL = wyL; cwyR = wyR;
          } else {
            // Param range where the row's Y is inside [wallTop, wallBot]. dWY can be NEGATIVE
            // (hero tilted left, sin<0), so order the two crossings before clamping — otherwise
            // tT>tB skipped every row and the hero passed straight through walls while steering.
            const t1 = (wallTop - wyL) / dWY;
            const t2 = (wallBot - wyL) / dWY;
            const tLo = Math.max(0, Math.min(t1, t2));
            const tHi = Math.min(1, Math.max(t1, t2));
            if (tLo > tHi) continue;
            cwxL = wxL + tLo * (wxR - wxL); cwyL = wyL + tLo * dWY;
            cwxR = wxL + tHi * (wxR - wxL); cwyR = wyL + tHi * dWY;
          }
          const rowMinWX = Math.min(cwxL, cwxR);
          const rowMaxWX = Math.max(cwxL, cwxR);
          if (rowMinWX < gapLeft || rowMaxWX > gapRight) {
            // Mark the hero-outline endpoint that crossed the gap edge.
            let hx, hy;
            if (rowMinWX < gapLeft) {
              if (cwxL <= cwxR) { hx = cwxL; hy = cwyL; } else { hx = cwxR; hy = cwyR; }
            } else {
              if (cwxL >= cwxR) { hx = cwxL; hy = cwyL; } else { hx = cwxR; hy = cwyR; }
            }
            this._triggerGameOver(hx, hy);
            return;
          }
        }
      }

      if (sideOverlap) {
        const wallSX    = this.charSideX + obs.dist * this.sideScale;
        const wallLeft  = wallSX - this.wallW / 2;
        const wallRight = wallSX + this.wallW / 2;
        const gapTop    = obs.gapY * this.pH - (obs.gapYH / 2) * this.pH;
        const gapBottom = obs.gapY * this.pH + (obs.gapYH / 2) * this.pH;
        for (let row = 0; row < sb.h; row++) {
          if (!isFinite(sb.rowMinX[row])) continue;
          const py  = row;
          // World X span of this row when rotated (cosθ > 0 for |θ|<90°, so wxL ≤ wxR)
          const wxL = this.charSideX + ((sb.rowMinX[row]-cx)*cosθ - (py-cy)*sinθ) * S;
          const wxR = this.charSideX + ((sb.rowMaxX[row]-cx)*cosθ - (py-cy)*sinθ) * S;
          if (wxR < wallLeft || wxL > wallRight) continue;
          // World Y at left and right endpoints
          const wyL = this.charYPx + ((sb.rowMinX[row]-cx)*sinθ + (py-cy)*cosθ) * S;
          const wyR = this.charYPx + ((sb.rowMaxX[row]-cx)*sinθ + (py-cy)*cosθ) * S;
          // Clamp to the portion of the row that overlaps the wall band; track clipped endpoints
          const dWX = wxR - wxL;
          let cxL, cxR, cyL, cyR;
          if (dWX < 0.5) {
            cxL = wxL; cxR = wxR; cyL = wyL; cyR = wyR;
          } else {
            const tL = Math.max(0, (wallLeft  - wxL) / dWX);
            const tR = Math.min(1, (wallRight - wxL) / dWX);
            if (tL > tR) continue;
            cxL = wxL + tL * dWX; cxR = wxL + tR * dWX;
            cyL = wyL + tL * (wyR - wyL); cyR = wyL + tR * (wyR - wyL);
          }
          const rowMinWY = Math.min(cyL, cyR);
          const rowMaxWY = Math.max(cyL, cyR);
          if (rowMinWY < gapTop || rowMaxWY > gapBottom) {
            // Mark the hero-outline endpoint that crossed the gap edge.
            let hx, hy;
            if (rowMinWY < gapTop) {
              if (cyL <= cyR) { hx = cxL; hy = cyL; } else { hx = cxR; hy = cyR; }
            } else {
              if (cyL >= cyR) { hx = cxL; hy = cyL; } else { hx = cxR; hy = cyR; }
            }
            this._triggerGameOver(hx, hy);
            return;
          }
        }
      }

      if (!topOverlap && !sideOverlap && obs.dist < 0) {
        obs.passed = true;
        this.wallsPassed++;
      }
    }

    // Obstacles are ordered oldest-first (dist decreases uniformly);
    // remove from the front once they pass the off-screen cutoff
    while (this.obstacles.length > 0 && this.obstacles[0].dist <= -500) {
      this.obstacles.shift();
    }

    // ── Update visuals ───────────────────────────────────────────────────────

    // Side-view: smooth velY then detect apex crossing with hysteresis band (±15 px/s)
    this.smoothVelY = smooth(this.smoothVelY, this.velY, 0.25, dt);
    if (this.wasRising && this.smoothVelY > 15) {
      this.apexTime  = this.time.now;
      this.wasRising = false;
    }
    if (this.smoothVelY < -15) this.wasRising = true;

    let targetAngle = 0;
    if (this.hasTapped) {
      if (this.smoothVelY < -15) {
        targetAngle = -20;
      } else if (this.time.now - this.apexTime < 275) {
        targetAngle = 0;
      } else {
        targetAngle = 20;
      }
    }
    this.sideAngle = smooth(this.sideAngle, targetAngle, 0.30, dt);

    // Top-view: smooth velX then apply hysteresis (enter ±20 px/s, exit ±5 px/s)
    const rawVelX = (this.charXPx - this.prevCharXPx) / dt;
    this.prevCharXPx = this.charXPx;
    this.smoothVelX  = smooth(this.smoothVelX, rawVelX, 0.2, dt);
    if (this.topTiltState === 'none') {
      if (this.smoothVelX < -20)      this.topTiltState = 'left';
      else if (this.smoothVelX > 20)  this.topTiltState = 'right';
    } else if (this.topTiltState === 'left') {
      if (this.smoothVelX > -5)       this.topTiltState = 'none';
    } else {
      if (this.smoothVelX < 5)        this.topTiltState = 'none';
    }
    const topTarget = this.topTiltState === 'left' ? -20 : this.topTiltState === 'right' ? 20 : 0;
    this.topAngle = smooth(this.topAngle, topTarget, 0.30, dt);
    this.charTopSprite.setPosition(this.charXPx, this.charTopY).setAngle(this.topAngle).setScale(this.topVisScale * this.topDisplayScale);
    // Visual-only: scale the side hero ±15% with the top hero's horizontal position
    // (right = bigger, left = smaller). Collision uses charSideBounds × hitboxScale and is
    // never read from the sprite's display scale, so the hitbox is unaffected.
    const sideVisScale = Phaser.Math.Clamp(1 + (this.charXPx / this.lW - 0.5) * 0.20, 0.90, 1.10);
    this.charSideSprite.setPosition(this.charSideX, this.charYPx).setAngle(this.sideAngle).setScale(sideVisScale * this.sideDisplayScale);
    this.scoreWallsTxt.setText(`${this.wallsPassed} ${GT.scoreUnit}`);
    this.scoreTimeTxt.setText(`${this.elapsedTime.toFixed(2)}s`);

    // ── Debug collision outlines ─────────────────────────────────────────────
    // Draws the pixel-accurate silhouette used for collision detection.
    // To enable: set debugOutline = true in the variant's gametext.txt.
    if (this._debugOutline) {
      this.debugGfx.clear();
      this.debugGfx.lineStyle(2, 0x000000, 1);

      // Top-view: rotated per-row silhouette (matches topAngle and collision)
      const tLeftPts = [], tRightPts = [];
      for (let row = 0; row < tb.h; row++) {
        if (!isFinite(tb.rowMinX[row])) continue;
        const py = row;
        tLeftPts.push({
          x: this.charXPx  + ((tb.rowMinX[row]-tcx)*cosT - (py-tcy)*sinT) * S,
          y: this.charTopY + ((tb.rowMinX[row]-tcx)*sinT + (py-tcy)*cosT) * S,
        });
        tRightPts.push({
          x: this.charXPx  + ((tb.rowMaxX[row]-tcx)*cosT - (py-tcy)*sinT) * S,
          y: this.charTopY + ((tb.rowMaxX[row]-tcx)*sinT + (py-tcy)*cosT) * S,
        });
      }
      if (tLeftPts.length > 0) {
        this.debugGfx.beginPath();
        this.debugGfx.moveTo(tLeftPts[0].x, tLeftPts[0].y);
        for (let i = 1; i < tLeftPts.length; i++) this.debugGfx.lineTo(tLeftPts[i].x, tLeftPts[i].y);
        for (let i = tRightPts.length - 1; i >= 0; i--) this.debugGfx.lineTo(tRightPts[i].x, tRightPts[i].y);
        this.debugGfx.closePath();
        this.debugGfx.strokePath();
      }

      // Side-view: rotated per-row silhouette (matches actual sprite orientation)
      const sLeftPts = [], sRightPts = [];
      for (let row = 0; row < sb.h; row++) {
        if (!isFinite(sb.rowMinX[row])) continue;
        const py = row;
        sLeftPts.push({
          x: this.charSideX + ((sb.rowMinX[row]-cx)*cosθ - (py-cy)*sinθ) * S,
          y: this.charYPx   + ((sb.rowMinX[row]-cx)*sinθ + (py-cy)*cosθ) * S,
        });
        sRightPts.push({
          x: this.charSideX + ((sb.rowMaxX[row]-cx)*cosθ - (py-cy)*sinθ) * S,
          y: this.charYPx   + ((sb.rowMaxX[row]-cx)*sinθ + (py-cy)*cosθ) * S,
        });
      }
      if (sLeftPts.length > 0) {
        this.debugGfx.beginPath();
        this.debugGfx.moveTo(sLeftPts[0].x, sLeftPts[0].y);
        for (let i = 1; i < sLeftPts.length; i++) this.debugGfx.lineTo(sLeftPts[i].x, sLeftPts[i].y);
        for (let i = sRightPts.length - 1; i >= 0; i--) this.debugGfx.lineTo(sRightPts[i].x, sRightPts[i].y);
        this.debugGfx.closePath();
        this.debugGfx.strokePath();
      }
    }

    this._renderObstacles();
  }
}
