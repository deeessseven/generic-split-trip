import {
  GRAVITY, FLAP_VELOCITY,
  BASE_SPEED, SPEED_RAMP,
  SPAWN_DIST, VISIBLE_DIST,
  GAP_X_WIDTH, GAP_Y_HEIGHT,
  WALL_THICKNESS, WALL_WIDTH,
  CHAR_TOPDOWN_Y_FRAC, CHAR_SIDE_X_FRAC,
  SPRITE_KEYS, GROUND_MARGIN,
} from '../constants.js';
import { SpriteManager } from '../SpriteManager.js';
import { GT } from '../data/GameText.js';

// ── Debug flag ────────────────────────────────────────────────────────────────
// Set to true to draw the pixel-accurate collision silhouette over each sprite.
// Keep false in production — the black outline is visible to players.
const DEBUG_OUTLINE = false;
// ─────────────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  // Reload custom sprites each time the game starts so Settings changes take effect
  preload() {
    SpriteManager.preloadCustom(this);
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Panel layout ──────────────────────────────────────────────────────────
    this.lW = W / 2;
    this.rX = W / 2;
    this.rW = W / 2;
    this.pH = H;

    this.charTopY  = CHAR_TOPDOWN_Y_FRAC * H;
    this.charSideX = this.rX + CHAR_SIDE_X_FRAC * this.rW;

    this.topScale  = this.charTopY / VISIBLE_DIST;
    this.sideScale = (this.rW * (1 - CHAR_SIDE_X_FRAC)) / VISIBLE_DIST;

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

    // ── Seeded RNG — fixed seed produces identical wall layout every run ──────
    this.rng = new Phaser.Math.RandomDataGenerator(['splittrip-v1']);

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

    // ── Input tracking ────────────────────────────────────────────────────────
    this.leftPointerId = -1;

    // ── Visual objects ────────────────────────────────────────────────────────
    const bgTopKey  = SpriteManager.resolveKey(this, SPRITE_KEYS.BG_TOP);
    const bgSideKey = SpriteManager.resolveKey(this, SPRITE_KEYS.BG_SIDE);
    this.bgLeft  = this.add.tileSprite(this.lW / 2, H / 2, this.lW, H, bgTopKey);
    this.bgRight = this.add.tileSprite(this.rX + this.rW / 2, H / 2, this.rW, H, bgSideKey);

    // Ground strip at bottom of side view — 40px tall so custom texture is recognisable
    this.groundStrip = this.add.tileSprite(this.rX + this.rW / 2, H - 10, this.rW, 20, bgTopKey).setDepth(2.5);

    // Obstacle TileSprite pool — 16 tiles handles up to 4 simultaneous obstacles × 4 tiles each
    // (at high difficulty the spawn interval shrinks enough that 4 obstacles can be active at once)
    const obsKey = SpriteManager.resolveKey(this, SPRITE_KEYS.OBSTACLE);
    this._obstacleTiles = Array.from({ length: 16 }, () =>
      this.add.tileSprite(0, 0, 1, 1, obsKey).setDepth(2).setVisible(false)
    );
    this._obstacleTileIdx = 0;

    // Gap indicator graphics — drawn each frame on top of wall tiles, below characters
    this.gapGfx = this.add.graphics().setDepth(2.5);

    // Debug collision outline — only created when DEBUG_OUTLINE is enabled
    this.debugGfx = DEBUG_OUTLINE ? this.add.graphics().setDepth(20) : null;

    // Character sprites (on top of obstacles and gap indicator)
    const ctKey = SpriteManager.resolveKey(this, SPRITE_KEYS.CHAR_TOP);
    const csKey = SpriteManager.resolveKey(this, SPRITE_KEYS.CHAR_SIDE);
    this.charTopSprite  = this.add.image(this.charXPx, this.charTopY,  ctKey).setDepth(3);
    this.charSideSprite = this.add.image(this.charSideX, this.charYPx, csKey).setDepth(3);

    // Scan sprite pixels to build per-row/per-col silhouette profiles for shaped collision
    this.hitboxScale    = 0.85;
    this.charTopBounds  = this._spriteBounds(ctKey);
    this.charSideBounds = this._spriteBounds(csKey);

    // Static center divider — drawn once, never needs to be redrawn
    this.add.rectangle(W / 2, H / 2, 3, H, 0x546e7a, 0.9).setDepth(5);

    // Score text
    this.scoreTxt = this.add.text(W / 2, 6, `0s  |  0 ${GT.scoreUnit}`, {
      fontSize: '18px',
      fontFamily: '"Arial Black", Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(6);

    // Panel labels
    this.add.text(6, 6, `${GT.labelTopView}\n${GT.labelTopHint}`, {
      fontSize: '11px', fontFamily: 'Arial', color: '#eceff1',
      alpha: 0.7,
    }).setDepth(6);
    this.add.text(W - 6, 6, `${GT.labelSideView}\n${GT.labelSideHint}`, {
      fontSize: '11px', fontFamily: 'Arial', color: '#eceff1', align: 'right',
      alpha: 0.7,
    }).setOrigin(1, 0).setDepth(6);

    // Touch indicator overlays
    this._showTouchHints();

    // ── Input ─────────────────────────────────────────────────────────────────
    this.input.on('pointerdown',      this._onDown, this);
    this.input.on('pointermove',      this._onMove, this);
    this.input.on('pointerup',        this._onUp,   this);
    this.input.on('pointerupoutside', this._onUp,   this);
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
      this.velY = FLAP_VELOCITY;
      this.sideAngle = -20; // snap CCW immediately on tap
      this.hasTapped = true;
      this.wasRising = true;
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

  // ── Obstacle management ────────────────────────────────────────────────────

  _spawnObstacle() {
    const steps = Math.floor(this.elapsedTime / 5);
    const decay = Math.pow(0.99, steps);

    // Minimum gap that guarantees the hero sprite can physically fit through
    const S = this.hitboxScale;
    const minGapX = this.charTopBounds.maxHalfW  * 2 * S / this.lW + 0.04;
    const minGapY = this.charSideBounds.maxHalfH * 2 * S / this.pH + 0.04;

    this.obstacles.push({
      dist:   VISIBLE_DIST,
      gapX:   this.rng.realInRange(0.18, 0.82),
      gapXW:  Math.max(GAP_X_WIDTH  * decay, minGapX),
      gapY:   this.rng.realInRange(0.18, 0.82),
      gapYH:  Math.max(GAP_Y_HEIGHT * decay, minGapY),
      passed: false,
    });
  }

  // Returns per-row X extents and per-col Y extents of non-transparent pixels.
  // rowMinX[y] / rowMaxX[y] = leftmost/rightmost opaque pixel in sprite row y (Infinity if empty).
  // colMinY[x] / colMaxY[x] = topmost/bottommost opaque pixel in sprite col x (Infinity if empty).
  // maxHalfW / maxHalfH = farthest opaque pixel from sprite center, for broad-phase overlap check.
  _spriteBounds(key) {
    const frame = this.textures.getFrame(key);
    const fallback = (w, h) => {
      const rowMinX = new Float32Array(h).fill(0);
      const rowMaxX = new Float32Array(h).fill(w - 1);
      const colMinY = new Float32Array(w).fill(0);
      const colMaxY = new Float32Array(w).fill(h - 1);
      return { w, h, topEdge: 0, botEdge: h - 1, maxHalfW: w / 2, maxHalfH: h / 2,
               rowMinX, rowMaxX, colMinY, colMaxY };
    };
    if (!frame) return fallback(48, 48);

    const w = frame.realWidth, h = frame.realHeight;
    const rowMinX = new Float32Array(h).fill(Infinity);
    const rowMaxX = new Float32Array(h).fill(-Infinity);
    const colMinY = new Float32Array(w).fill(Infinity);
    const colMaxY = new Float32Array(w).fill(-Infinity);

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
          if (y < colMinY[x]) colMinY[x] = y;
          if (y > colMaxY[x]) colMaxY[x] = y;
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
    return { w, h, topEdge, botEdge, maxHalfW, maxHalfH, rowMinX, rowMaxX, colMinY, colMaxY };
  }

  // ── Game over ──────────────────────────────────────────────────────────────

  _triggerGameOver(hitX, hitY) {
    if (this.isDying) return;
    this.isDying = true;
    this.isAlive = false;

    if (hitX !== undefined) {
      const g = this.add.graphics().setDepth(10);
      const r = 10;
      g.lineStyle(3, 0xff1111, 1);
      g.lineBetween(hitX - r, hitY - r, hitX + r, hitY + r);
      g.lineBetween(hitX + r, hitY - r, hitX - r, hitY + r);
      g.lineStyle(2, 0xff4444, 0.6);
      g.strokeCircle(hitX, hitY, r + 4);
    }

    this.cameras.main.shake(400, 0.018);
    this.cameras.main.flash(250, 255, 60, 60, false);
    this.time.delayedCall(900, () => {
      this.scene.start('GameOverScene', {
        score: this.wallsPassed,
        time:  Math.floor(this.elapsedTime),
      });
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _placeTile(x, y, w, h, tileOffsetX = 0) {
    const t = this._obstacleTiles[this._obstacleTileIdx++];
    if (!t) return;
    t.setPosition(x + w / 2, y + h / 2).setSize(w, h).setTilePosition(tileOffsetX, 0).setVisible(true);
  }

  _renderObstacles() {
    this._obstacleTileIdx = 0;
    for (const t of this._obstacleTiles) t.setVisible(false);
    this.gapGfx.clear();
    for (const obs of this.obstacles) {
      this._drawTopDownObstacle(obs);
      this._drawSideObstacle(obs);
    }
  }

  _drawTopDownObstacle(obs) {
    const screenY = this.charTopY - obs.dist * this.topScale;
    if (screenY < -WALL_THICKNESS - 2 || screenY > this.pH + WALL_THICKNESS + 2) return;

    const gapCX = obs.gapX * this.lW;
    const gapHW = (obs.gapXW / 2) * this.lW;
    const wallY = screenY - WALL_THICKNESS / 2;

    const leftW = gapCX - gapHW;
    if (leftW > 0) this._placeTile(0, wallY, leftW, WALL_THICKNESS);

    const rightStart = gapCX + gapHW;
    const rightW = this.lW - rightStart;
    if (rightW > 0) this._placeTile(rightStart, wallY, rightW, WALL_THICKNESS);

    // Subtle gap indicator so players can see where to aim in the top-down view
    this.gapGfx.lineStyle(1, 0xffffff, 0.12);
    this.gapGfx.lineBetween(gapCX - gapHW, screenY, gapCX + gapHW, screenY);
  }

  _drawSideObstacle(obs) {
    const screenX  = this.charSideX + obs.dist * this.sideScale;
    const wallLeft = screenX - WALL_WIDTH / 2;
    if (wallLeft > this.rX + this.rW + 2 || wallLeft + WALL_WIDTH < this.rX - 2) return;

    const gapCY     = obs.gapY * this.pH;
    const gapHH     = (obs.gapYH / 2) * this.pH;
    const gapTop    = gapCY - gapHH;
    const gapBottom = gapCY + gapHH;

    const drawX      = Math.max(wallLeft, this.rX);
    const drawW      = Math.min(wallLeft + WALL_WIDTH, this.rX + this.rW) - drawX;
    if (drawW <= 0) return;
    const clipOffset = drawX - wallLeft; // keep texture aligned when left edge is clipped by divider

    if (gapTop > 0)          this._placeTile(drawX, 0,         drawW, gapTop,              clipOffset);
    if (gapBottom < this.pH) this._placeTile(drawX, gapBottom, drawW, this.pH - gapBottom, clipOffset);
  }

  // ── Touch hint overlay ─────────────────────────────────────────────────────

  _showTouchHints() {
    this.leftHint = this.add.text(this.lW / 2, this.pH * 0.88, GT.hintSteer, {
      fontSize: '13px', fontFamily: 'Arial', color: '#b2dfdb',
    }).setOrigin(0.5).setDepth(7).setAlpha(0.75);

    this.rightHint = this.add.text(this.rX + this.rW / 2, this.pH * 0.88, GT.hintRise, {
      fontSize: '13px', fontFamily: 'Arial', color: '#b2dfdb',
    }).setOrigin(0.5).setDepth(7).setAlpha(0.75);

    // Flag prevents two simultaneous fade tweens if both triggers fire near-simultaneously
    let hintsActive = true;
    const fadeOut = (duration) => {
      if (!hintsActive) return;
      hintsActive = false;
      this.tweens.add({ targets: [this.leftHint, this.rightHint], alpha: 0, duration });
    };

    this.time.delayedCall(3000, () => fadeOut(1000));
    this.input.once('pointerdown', () => fadeOut(400));
  }

  // ── Main update loop ───────────────────────────────────────────────────────

  update(_, delta) {
    if (!this.isAlive) return;
    const dt = delta / 1000;

    this.elapsedTime += dt;
    this.speed = BASE_SPEED + this.elapsedTime * SPEED_RAMP;

    this.distTraveled += this.speed * dt;

    this.bgLeft.tilePositionY  -= this.speed * this.topScale  * dt;
    this.bgRight.tilePositionX     += this.speed * this.sideScale * dt;
    this.groundStrip.tilePositionX += this.speed * this.sideScale * dt;

    // ── Vertical physics (side view) ────────────────────────────────────────
    this.velY    += GRAVITY * dt;
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

    let minWY = Infinity, maxWY = -Infinity;
    for (let row = 0; row < sb.h; row++) {
      if (!isFinite(sb.rowMinX[row])) continue;
      const wyL = this.charYPx + ((sb.rowMinX[row] - cx) * sinθ + (row - cy) * cosθ) * S;
      const wyR = this.charYPx + ((sb.rowMaxX[row] - cx) * sinθ + (row - cy) * cosθ) * S;
      if (wyL < minWY) minWY = wyL;
      if (wyL > maxWY) maxWY = wyL;
      if (wyR < minWY) minWY = wyR;
      if (wyR > maxWY) maxWY = wyR;
    }
    if (minWY < 0) {
      this.charYPx -= minWY;
      this._triggerGameOver(this.charSideX, 0);
      return;
    }
    if (maxWY >= this.pH - GROUND_MARGIN) {
      this.charYPx -= maxWY - (this.pH - GROUND_MARGIN);
      this._triggerGameOver(this.charSideX, this.pH - GROUND_MARGIN);
      return;
    }

    // ── Horizontal position (top-down, smooth follow finger) ────────────────
    this.charXPx = Phaser.Math.Linear(this.charXPx, this.targetCharXPx, 0.22);

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
      const topOverlap  = absDist * this.topScale  < WALL_THICKNESS / 2 + rotHalfH_top;
      const sideOverlap = absDist * this.sideScale < WALL_WIDTH     / 2 + rotHalfW;

      if (topOverlap) {
        const wallSY   = this.charTopY - obs.dist * this.topScale;
        const wallTop  = wallSY - WALL_THICKNESS / 2;
        const wallBot  = wallSY + WALL_THICKNESS / 2;
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
          // Clamp row X span to the portion overlapping the wall band in Y
          const dWY = wyR - wyL;
          let cwxL, cwxR;
          if (Math.abs(dWY) < 0.5) {
            cwxL = wxL; cwxR = wxR;
          } else {
            const tT = Math.max(0, (wallTop - wyL) / dWY);
            const tB = Math.min(1, (wallBot - wyL) / dWY);
            if (tT > tB) continue;
            cwxL = wxL + tT * (wxR - wxL); cwxR = wxL + tB * (wxR - wxL);
          }
          const rowMinWX = Math.min(cwxL, cwxR);
          const rowMaxWX = Math.max(cwxL, cwxR);
          if (rowMinWX < gapLeft || rowMaxWX > gapRight) {
            this._triggerGameOver(rowMinWX < gapLeft ? gapLeft : gapRight, wallSY);
            return;
          }
        }
      }

      if (sideOverlap) {
        const wallSX    = this.charSideX + obs.dist * this.sideScale;
        const wallLeft  = wallSX - WALL_WIDTH / 2;
        const wallRight = wallSX + WALL_WIDTH / 2;
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
            // Hit point: midpoint of where the silhouette row overlaps the wall band (X),
            // at the gap edge that was violated (Y) — stays close to the sprite outline
            this._triggerGameOver((cxL + cxR) / 2, rowMinWY < gapTop ? gapTop : gapBottom);
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
    this.smoothVelY = Phaser.Math.Linear(this.smoothVelY, this.velY, 0.25);
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
    this.sideAngle = Phaser.Math.Linear(this.sideAngle, targetAngle, 0.30);

    // Top-view: smooth velX then apply hysteresis (enter ±20 px/s, exit ±5 px/s)
    const rawVelX = (this.charXPx - this.prevCharXPx) / dt;
    this.prevCharXPx = this.charXPx;
    this.smoothVelX  = Phaser.Math.Linear(this.smoothVelX, rawVelX, 0.2);
    if (this.topTiltState === 'none') {
      if (this.smoothVelX < -20)      this.topTiltState = 'left';
      else if (this.smoothVelX > 20)  this.topTiltState = 'right';
    } else if (this.topTiltState === 'left') {
      if (this.smoothVelX > -5)       this.topTiltState = 'none';
    } else {
      if (this.smoothVelX < 5)        this.topTiltState = 'none';
    }
    const topTarget = this.topTiltState === 'left' ? -20 : this.topTiltState === 'right' ? 20 : 0;
    this.topAngle = Phaser.Math.Linear(this.topAngle, topTarget, 0.30);
    this.charTopSprite.setPosition(this.charXPx, this.charTopY).setAngle(this.topAngle);
    this.charSideSprite.setPosition(this.charSideX, this.charYPx).setAngle(this.sideAngle);
    this.scoreTxt.setText(`${Math.floor(this.elapsedTime)}s  |  ${this.wallsPassed} ${GT.scoreUnit}`);

    // ── Debug collision outlines ─────────────────────────────────────────────
    // Draws the pixel-accurate silhouette used for collision detection.
    // To enable: set DEBUG_OUTLINE = true at the top of this file.
    if (DEBUG_OUTLINE) {
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
