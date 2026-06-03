// Game canvas base resolution; actual size is determined by RESIZE mode in main.js
export const GAME_W = 960;
export const GAME_H = 540;

// Physics
export const GRAVITY = 1150;       // px/s² downward
export const FLAP_VELOCITY = -350; // px/s upward on tap

// Difficulty
export const BASE_SPEED = 219;     // world units/s (starts here)
export const SPEED_RAMP = 10;      // additional world units/s per second elapsed
export const MAX_SPEED = 1500;     // cap so a fast frame can't skip a wall's collision band (anti-tunneling)
export const SPAWN_DIST = 1020;    // world units between obstacle spawns (+50% more breathing room)
export const VISIBLE_DIST = 920;   // world units of lookahead shown in each panel

// Obstacle gaps are sized dynamically from the hero's measured opaque pixels, per axis (see
// GameScene._spawnObstacle): gap = hero hitbox size × GAP_MULT_INITIAL, shrinking 1% per 1 s
// elapsed down to a floor of hero × GAP_MULT_MIN. This auto-scales with the 128px hero or any
// uploaded sprite — no fixed panel-fraction tuning.
export const GAP_MULT_INITIAL = 3.0;  // starting gap = 3× the hero's opaque size (per axis)
export const GAP_MULT_MIN     = 1.4;  // floor: gap never tightens below 1.4× the hero (always passable)
export const GAP_X_SCALE      = 1.5;  // extra widening for the horizontal gap only (+50%)

// Obstacle appearance
export const WALL_THICKNESS = 64;  // px — top-down horizontal wall height
export const WALL_WIDTH      = 64; // px — side-view wall width

// Character fixed positions inside their panels
export const CHAR_TOPDOWN_Y_FRAC = 0.70; // Y position in top-down panel (0=top, 1=bottom)
export const CHAR_SIDE_X_FRAC    = 0.22; // X position in side panel (0=left, 1=right)

// Side-view ground clearance (px from panel bottom where floor collision triggers)
export const GROUND_MARGIN = 18;

// Sprite texture keys
export const SPRITE_KEYS = {
  CHAR_TOP:  'char_top',
  CHAR_SIDE: 'char_side',
  BG_TOP:    'bg_top',
  BG_SIDE:   'bg_side',
  OBSTACLE:  'obstacle',
  HIT_MARK:  'hit_mark',
};
