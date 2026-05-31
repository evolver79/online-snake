export const CANVAS_W  = 480;
export const CANVAS_H  = 270;
export const CELL      = 10;      // px per grid cell
export const MAP_W     = 48;      // cells wide
export const MAP_H     = 22;      // cells tall  (22×10 = 220px play area)
export const HUD_H     = 50;      // px for bottom HUD strip

export const INIT_SNAKE_LEN = 3;
export const INIT_LIVES     = 3;

// Ticks (at 60 fps) between moves — decreases with floor
export const SNAKE_MOVE_BASE  = 8;
export const SNAKE_MOVE_MIN   = 4;
export const ENEMY_MOVE_BASE  = 16;
export const ENEMY_MOVE_MIN   = 9;

export const INVINCIBLE_TICKS = 80;  // after losing a life

export const MIN_ROOMS = 4;
export const MAX_ROOMS = 7;
