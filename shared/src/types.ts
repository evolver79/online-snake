export type RunnerPhase = 'start' | 'playing' | 'dead';

export interface Obstacle {
  id:   number;
  x:    number;   // screen X (decreases as world scrolls)
  y:    number;   // screen Y (top of obstacle)
  w:    number;
  h:    number;
  type: 'spike' | 'bar' | 'wall';
}

export interface Fruit {
  id:        number;
  x:         number;
  y:         number;
  collected: boolean;
}

export interface GroundTile {
  x:     number;   // screen X of tile left edge
  solid: boolean;  // false = gap
}

export interface RunnerState {
  phase:       RunnerPhase;
  headY:       number;      // head Y in screen space
  vy:          number;      // vertical velocity
  onGround:    boolean;
  sliding:     boolean;
  slideTicks:  number;
  invincible:  number;      // frames of invincibility remaining after hit
  yHistory:    number[];    // circular buffer: head Y indexed by scroll distance
  totalScroll: number;      // accumulated scroll distance (px)
  segments:    number;      // body segment count (grows on eat)
  ground:      GroundTile[];
  obstacles:   Obstacle[];
  fruits:      Fruit[];
  score:       number;
  distance:    number;      // meters (totalScroll / 10, rounded)
  scrollSpeed: number;
  tick:        number;
  lives:       number;
  jumpQueued:  boolean;     // jump buffering: input arrived just before landing
}
