export type Direction    = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type DungeonPhase = 'start' | 'playing' | 'respawn' | 'dead';
export type CellType     = 'wall' | 'floor' | 'exit';
export type EnemyType    = 'rat' | 'skeleton' | 'demon' | 'boss';
export type PickupType   = 'heart' | 'gem';

export interface Pickup { id: number; type: PickupType; pos: Point; }

export interface Point { x: number; y: number; }

export interface Room {
  x: number; y: number;
  w: number; h: number;
}

export interface Enemy {
  id:       number;
  type:     EnemyType;
  pos:      Point;
  roomIdx:  number;
  hp:       number;
  segments: number;  // tail growth when killed
}

export interface DungeonState {
  phase:         DungeonPhase;
  grid:          CellType[][];
  rooms:         Room[];
  snake:         { segments: Point[]; dir: Direction; nextDir: Direction; };
  enemies:       Enemy[];
  pickups:       Pickup[];
  floor:         number;
  score:         number;
  lives:         number;
  tick:          number;
  snakeMoveTick: number;
  enemyMoveTick: number;
  invincible:    number;
  exitPos:       Point | null;
  isBossFloor:   boolean;
  message:       string;
  messageTick:   number;
}
