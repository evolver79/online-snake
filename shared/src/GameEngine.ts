import type { Direction, GameState, Cell, PortalState, DeathCause } from './types';
import {
  GRID_SIZE, INITIAL_SNAKE_LENGTH,
  COMBO_WINDOW_TICKS, PORTAL_SPAWN_EAT, PORTAL_RESPAWN_EVERY, WALL_COUNT,
} from './constants';

const DIRECTION_DELTA: Record<Direction, Cell> = {
  UP:    { x: 0,  y: 1  },
  DOWN:  { x: 0,  y: -1 },
  LEFT:  { x: -1, y: 0  },
  RIGHT: { x: 1,  y: 0  },
};

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
};

export class GameEngine {
  private state: GameState;
  private eatCount = 0;

  constructor() {
    this.state = this.buildInitialState();
  }

  private occupiedKey(c: Cell): string { return `${c.x},${c.y}`; }

  private buildInitialState(): GameState {
    const midX = Math.floor(GRID_SIZE / 2);
    const midY = Math.floor(GRID_SIZE / 2);
    const segments: Cell[] = [];
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
      segments.push({ x: midX - i, y: midY });
    }

    // Reserve a clear zone around the snake start so walls don't trap it
    const clearZone = new Set<string>();
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        clearZone.add(`${midX + dx},${midY + dy}`);
      }
    }

    const walls = this.spawnWalls(segments, clearZone);
    const food  = this.spawnCell([...segments, ...walls]);

    return {
      phase:      'start',
      snake:      { segments, direction: 'RIGHT', nextDirection: 'RIGHT' },
      food:       { position: food, type: 'normal' },
      score:      0,
      tick:       0,
      combo:      1,
      comboTicks: 0,
      portals:    null,
      portalUsed: false,
      walls,
      deathCause: null,
    };
  }

  // Spawn N random wall cells, avoiding occupied cells and a clear zone
  private spawnWalls(occupied: Cell[], clearZone: Set<string>): Cell[] {
    const taken = new Set([...occupied.map(c => this.occupiedKey(c)), ...clearZone]);
    const walls: Cell[] = [];
    let attempts = 0;
    while (walls.length < WALL_COUNT && attempts < 2000) {
      attempts++;
      const c = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const k = this.occupiedKey(c);
      if (!taken.has(k)) {
        taken.add(k);
        walls.push(c);
      }
    }
    return walls;
  }

  // Spawn a single cell not on any of the given occupied positions
  private spawnCell(occupied: Cell[], extra: Cell[] = []): Cell {
    const taken = new Set([
      ...occupied.map(c => this.occupiedKey(c)),
      ...extra.map(c => this.occupiedKey(c)),
    ]);
    let pos: Cell;
    do {
      pos = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (taken.has(this.occupiedKey(pos)));
    return pos;
  }

  private spawnPortals(occupied: Cell[], food: Cell): PortalState {
    const taken = new Set([
      ...occupied.map(c => this.occupiedKey(c)),
      this.occupiedKey(food),
    ]);
    const pick = (): Cell => {
      let p: Cell;
      do {
        p = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
      } while (taken.has(this.occupiedKey(p)));
      taken.add(this.occupiedKey(p));
      return p;
    };
    return { a: pick(), b: pick() };
  }

  start(): void {
    this.eatCount = 0;
    this.state    = this.buildInitialState();
    this.state.phase = 'playing';
  }

  setDirection(dir: Direction): void {
    if (this.state.phase !== 'playing') return;
    if (dir === OPPOSITE[this.state.snake.direction]) return;
    this.state.snake.nextDirection = dir;
  }

  tick(): GameState {
    if (this.state.phase !== 'playing') return this.state;

    const { snake, food } = this.state;
    snake.direction       = snake.nextDirection;
    this.state.portalUsed = false;

    // Tick down combo window; reset combo if window closes
    if (this.state.comboTicks > 0) {
      this.state.comboTicks -= 1;
      if (this.state.comboTicks === 0) this.state.combo = 1;
    }

    const head  = snake.segments[0];
    const delta = DIRECTION_DELTA[snake.direction];
    const newHead: Cell = { x: head.x + delta.x, y: head.y + delta.y };

    // Portal teleport — check before wall/self collision
    const portal = this.state.portals;
    if (portal) {
      if (newHead.x === portal.a.x && newHead.y === portal.a.y) {
        newHead.x = portal.b.x; newHead.y = portal.b.y;
        this.state.portalUsed = true;
      } else if (newHead.x === portal.b.x && newHead.y === portal.b.y) {
        newHead.x = portal.a.x; newHead.y = portal.a.y;
        this.state.portalUsed = true;
      }
    }

    const die = (cause: DeathCause): GameState => {
      this.state.phase = 'gameover';
      this.state.deathCause = cause;
      return this.state;
    };

    // Boundary collision
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      return die('boundary');
    }

    // Wall obstacle collision
    if (this.state.walls.some(w => w.x === newHead.x && w.y === newHead.y)) {
      return die('wall');
    }

    // Self collision — tail vacates its cell this tick so exclude it
    const bodyToCheck = snake.segments.slice(0, -1);
    if (bodyToCheck.some(s => s.x === newHead.x && s.y === newHead.y)) {
      return die('self');
    }

    const ate = newHead.x === food.position.x && newHead.y === food.position.y;

    snake.segments.unshift(newHead);

    if (ate) {
      this.state.score    += this.state.combo;
      this.eatCount       += 1;
      this.state.combo     = Math.min(this.state.combo + 1, 4);
      this.state.comboTicks = COMBO_WINDOW_TICKS;

      food.position = this.spawnCell(
        [...snake.segments, ...this.state.walls],
        portal ? [portal.a, portal.b] : [],
      );

      // Spawn / respawn portals at eat milestones
      const sinceFirst = this.eatCount - PORTAL_SPAWN_EAT;
      if (sinceFirst >= 0 && sinceFirst % PORTAL_RESPAWN_EVERY === 0) {
        this.state.portals = this.spawnPortals(
          [...snake.segments, ...this.state.walls],
          food.position,
        );
      }
    } else {
      snake.segments.pop();
    }

    this.state.tick += 1;
    return this.state;
  }

  getState(): GameState {
    return this.state;
  }
}
