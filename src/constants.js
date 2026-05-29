// Game canvas base resolution; actual size is determined by RESIZE mode in main.js
export const GAME_W = 960;
export const GAME_H = 540;

// Physics
export const GRAVITY = 1150;       // px/s² downward
export const FLAP_VELOCITY = -350; // px/s upward on tap

// Difficulty
export const BASE_SPEED = 219;     // world units/s (starts here)
export const SPEED_RAMP = 5;       // additional world units/s per second elapsed
export const SPAWN_DIST = 680;     // world units between obstacle spawns
export const VISIBLE_DIST = 920;   // world units of lookahead shown in each panel

// Obstacle gaps (fractions of panel dimension) — starting values, shrink 1% per 5 s elapsed
export const GAP_X_WIDTH  = 0.57;  // horizontal gap as fraction of left-panel width
export const GAP_Y_HEIGHT = 0.63;  // vertical gap as fraction of panel height

// Obstacle appearance
export const WALL_THICKNESS = 26;  // px — top-down horizontal wall height
export const WALL_WIDTH      = 52; // px — side-view wall width

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
};
