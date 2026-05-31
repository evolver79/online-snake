export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type GamePhase = 'start' | 'playing' | 'gameover';

export interface Cell {
  x: number;
  y: number;
}

export interface SnakeState {
  segments: Cell[];
  direction: Direction;
  nextDirection: Direction;
}

export interface FoodState {
  position: Cell;
  type: 'normal';
}

export interface PortalState {
  a: Cell;
  b: Cell;
}

export type DeathCause = 'boundary' | 'wall' | 'self';

export interface GameState {
  phase:      GamePhase;
  snake:      SnakeState;
  food:       FoodState;
  score:      number;
  tick:       number;
  combo:      number;       // current multiplier (1–4)
  comboTicks: number;       // ticks remaining in combo window (0 = expired)
  portals:    PortalState | null;
  portalUsed: boolean;      // true if a portal was traversed this tick
  walls:      Cell[];       // random interior obstacle positions
  deathCause: DeathCause | null;
}
