export type Direction   = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type DungeonPhase = 'start' | 'playing' | 'respawn' | 'dead';
export type CellType    = 'wall' | 'floor' | 'exit';
export type EnemyType   = 'rat' | 'skeleton' | 'demon';

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
  floor:         number;
  score:         number;
  lives:         number;
  tick:          number;
  snakeMoveTick: number;
  enemyMoveTick: number;
  invincible:    number;
  exitPos:       Point | null;   // null until all enemies dead
  message:       string;         // flash message ("FLOOR 2", "BOSS SLAIN")
  messageTick:   number;
}
