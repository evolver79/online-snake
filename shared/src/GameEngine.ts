import type { DungeonState, CellType, Enemy, EnemyType, Pickup, Point, Room, Direction } from './types';
import {
  MAP_W, MAP_H, INIT_SNAKE_LEN, INIT_LIVES,
  SNAKE_MOVE_BASE, SNAKE_MOVE_MIN, ENEMY_MOVE_BASE, ENEMY_MOVE_MIN,
  INVINCIBLE_TICKS, MIN_ROOMS, MAX_ROOMS,
  GEM_SCORE_BASE, BOSS_FLOOR_EVERY, MAX_LIVES,
} from './constants';

let _uid = 1;
const uid = (): number => _uid++;

const DELTA: Record<Direction, Point> = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
};

// ── Dungeon generation ────────────────────────────────────────────────────

function rng(seed: { v: number }): number {
  seed.v = (seed.v * 1664525 + 1013904223) & 0xffffffff;
  return (seed.v >>> 0) / 0xffffffff;
}

function roomCenter(r: Room): Point {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function generateFloor(floor: number): { grid: CellType[][]; rooms: Room[]; enemies: Enemy[]; pickups: Pickup[]; startPos: Point; exitPos: Point | null; isBossFloor: boolean } {
  const seed = { v: floor * 1337 + 42 };
  const grid: CellType[][] = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill('wall') as CellType[]);

  const roomCount = MIN_ROOMS + Math.floor(rng(seed) * (MAX_ROOMS - MIN_ROOMS + 1));
  const rooms: Room[] = [];

  // Place rooms
  for (let i = 0; i < roomCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const w = 5 + Math.floor(rng(seed) * 6);
      const h = 4 + Math.floor(rng(seed) * 4);
      const x = 1 + Math.floor(rng(seed) * (MAP_W - w - 2));
      const y = 1 + Math.floor(rng(seed) * (MAP_H - h - 2));
      const overlaps = rooms.some(r =>
        x < r.x + r.w + 2 && x + w + 2 > r.x &&
        y < r.y + r.h + 2 && y + h + 2 > r.y,
      );
      if (!overlaps) {
        rooms.push({ x, y, w, h });
        for (let gy = y; gy < y + h; gy++)
          for (let gx = x; gx < x + w; gx++)
            grid[gy][gx] = 'floor';
        placed = true;
      }
    }
  }

  // Connect rooms with 2-wide L-shaped corridors
  const carve = (x: number, y: number) => {
    if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) grid[y][x] = 'floor';
  };
  for (let i = 1; i < rooms.length; i++) {
    const a = roomCenter(rooms[i - 1]);
    const b = roomCenter(rooms[i]);
    const midX = rng(seed) < 0.5 ? a.x : b.x;
    for (let cx = Math.min(a.x, midX); cx <= Math.max(a.x, midX); cx++) { carve(cx, a.y); carve(cx, a.y + 1); }
    for (let cx = Math.min(midX, b.x); cx <= Math.max(midX, b.x); cx++) { carve(cx, b.y); carve(cx, b.y + 1); }
    for (let cy = Math.min(a.y, b.y); cy <= Math.max(a.y, b.y); cy++) { carve(midX, cy); carve(midX + 1, cy); }
  }

  // ── Enemies ──────────────────────────────────────────────────────────────
  const enemies: Enemy[] = [];
  const isBossFloor = floor % BOSS_FLOOR_EVERY === 0;

  if (isBossFloor) {
    // Boss lives in the last room
    const bossRoom = rooms[rooms.length - 1];
    enemies.push({
      id:       uid(),
      type:     'boss',
      pos:      roomCenter(bossRoom),
      roomIdx:  rooms.length - 1,
      hp:       5,
      segments: 10,
    });
  } else {
    const types: EnemyType[] = floor < 3 ? ['rat'] : floor < 5 ? ['rat', 'skeleton'] : ['rat', 'skeleton', 'demon'];
    for (let i = 1; i < rooms.length; i++) {
      const room  = rooms[i];
      const count = 1 + Math.floor(rng(seed) * Math.min(3, 1 + Math.floor(floor / 2)));
      for (let k = 0; k < count; k++) {
        const type: EnemyType = types[Math.floor(rng(seed) * types.length)];
        enemies.push({
          id:       uid(),
          type,
          pos: {
            x: room.x + 1 + Math.floor(rng(seed) * (room.w - 2)),
            y: room.y + 1 + Math.floor(rng(seed) * (room.h - 2)),
          },
          roomIdx:  i,
          hp:       type === 'demon' ? 2 : 1,
          segments: type === 'rat' ? 1 : type === 'skeleton' ? 2 : 3,
        });
      }
    }
  }

  // ── Pickups ───────────────────────────────────────────────────────────────
  const startPos = roomCenter(rooms[0]);
  const occupied = new Set(enemies.map(e => `${e.pos.x},${e.pos.y}`));
  occupied.add(`${startPos.x},${startPos.y}`);

  const pickups: Pickup[] = [];
  const tryPlacePickup = (type: Pickup['type'], roomIdx: number) => {
    const room = rooms[roomIdx];
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = room.x + 1 + Math.floor(rng(seed) * (room.w - 2));
      const y = room.y + 1 + Math.floor(rng(seed) * (room.h - 2));
      const key = `${x},${y}`;
      if (!occupied.has(key) && grid[y][x] === 'floor') {
        occupied.add(key);
        pickups.push({ id: uid(), type, pos: { x, y } });
        return;
      }
    }
  };

  // Gems: 2–4 spread across non-start rooms
  const gemCount = 2 + Math.floor(rng(seed) * 3);
  for (let i = 0; i < gemCount; i++) {
    const roomIdx = 1 + Math.floor(rng(seed) * (rooms.length - 1));
    tryPlacePickup('gem', roomIdx);
  }
  // Heart: one per floor with 60% chance (guaranteed on boss floors)
  if (isBossFloor || rng(seed) < 0.6) {
    const roomIdx = 1 + Math.floor(rng(seed) * (rooms.length - 1));
    tryPlacePickup('heart', roomIdx);
  }

  // Exit revealed once all enemies die
  const exitPos: Point | null = enemies.length === 0 ? roomCenter(rooms[rooms.length - 1]) : null;
  if (exitPos) grid[exitPos.y][exitPos.x] = 'exit';

  return { grid, rooms, enemies, pickups, startPos, exitPos, isBossFloor };
}

// ── Engine ────────────────────────────────────────────────────────────────

export class GameEngine {
  private state!: DungeonState;

  constructor() { this.resetToStart(); }

  private resetToStart(): void {
    _uid = 1;
    this.state = this.buildState(1, INIT_LIVES, 0);
    this.state.phase = 'start';
  }

  private buildState(floor: number, lives: number, score: number): DungeonState {
    const { grid, rooms, enemies, pickups, startPos, exitPos, isBossFloor } = generateFloor(floor);
    const segments: Point[] = [];
    for (let i = 0; i < INIT_SNAKE_LEN; i++) {
      segments.push({ x: startPos.x - i, y: startPos.y });
    }

    const isBoss = isBossFloor;
    return {
      phase:         'playing',
      grid,
      rooms,
      snake:         { segments, dir: 'RIGHT', nextDir: 'RIGHT' },
      enemies,
      pickups,
      floor,
      score,
      lives,
      tick:          0,
      snakeMoveTick: 0,
      enemyMoveTick: 0,
      invincible:    0,
      exitPos,
      isBossFloor:   isBoss,
      message:       isBoss ? 'BOSS FLOOR' : (floor === 1 ? '' : `FLOOR  ${floor}`),
      messageTick:   isBoss ? 120             : (floor === 1 ? 0  : 90),
    };
  }

  start(): void {
    _uid = 1;
    this.state = this.buildState(1, INIT_LIVES, 0);
  }

  setDirection(dir: Direction): void {
    if (this.state.phase === 'respawn') {
      // Queue the chosen direction so the snake heads that way on resume
      if (dir !== OPPOSITE[this.state.snake.dir]) this.state.snake.nextDir = dir;
      return;
    }
    if (this.state.phase !== 'playing') return;
    if (dir === OPPOSITE[this.state.snake.dir]) return;
    this.state.snake.nextDir = dir;
  }

  resume(): void {
    if (this.state.phase === 'respawn') {
      this.state.phase = 'playing';
      this.state.snakeMoveTick = 0; // give a full move interval before first step
    }
  }

  tick(): DungeonState {
    const s = this.state;
    if (s.phase !== 'playing') return s;

    s.tick++;
    if (s.messageTick > 0) s.messageTick--;
    if (s.invincible > 0)  s.invincible--;

    const floor          = s.floor;
    const snakeMoveEvery = Math.max(SNAKE_MOVE_MIN, SNAKE_MOVE_BASE - Math.floor(floor / 2));
    const enemyMoveEvery = Math.max(ENEMY_MOVE_MIN, ENEMY_MOVE_BASE - floor);

    // ── Snake move ───────────────────────────────────────────────────────
    s.snakeMoveTick++;
    if (s.snakeMoveTick >= snakeMoveEvery) {
      s.snakeMoveTick = 0;
      this.moveSnake();
      if (s.phase !== 'playing') return s;
    }

    // ── Enemy move ───────────────────────────────────────────────────────
    s.enemyMoveTick++;
    if (s.enemyMoveTick >= enemyMoveEvery) {
      s.enemyMoveTick = 0;
      this.moveEnemies();
    }

    return s;
  }

  private moveSnake(): void {
    const s    = this.state;
    const sn   = s.snake;
    sn.dir     = sn.nextDir;
    const d    = DELTA[sn.dir];
    const head = sn.segments[0];
    const next: Point = { x: head.x + d.x, y: head.y + d.y };

    // Wall collision
    if (next.x < 0 || next.x >= MAP_W || next.y < 0 || next.y >= MAP_H || s.grid[next.y][next.x] === 'wall') {
      this.die();
      return;
    }

    // Self collision (tail frees its cell this tick)
    const bodyCheck = sn.segments.slice(0, -1);
    if (bodyCheck.some(p => p.x === next.x && p.y === next.y)) {
      this.die();
      return;
    }

    // Enemy collision — head kills enemy
    const hitEnemy = s.enemies.find(e => e.pos.x === next.x && e.pos.y === next.y);
    if (hitEnemy) {
      hitEnemy.hp--;
      if (hitEnemy.hp <= 0) {
        s.enemies = s.enemies.filter(e => e.id !== hitEnemy.id);
        s.score  += hitEnemy.segments * s.floor;
        // Grow snake
        for (let i = 0; i < hitEnemy.segments; i++) {
          const tail = sn.segments[sn.segments.length - 1];
          sn.segments.push({ ...tail });
        }
        // Reveal exit when last enemy dies
        if (s.enemies.length === 0) {
          const exitRoom = s.rooms[s.rooms.length - 1];
          const ep       = roomCenter(exitRoom);
          s.exitPos = ep;
          s.grid[ep.y][ep.x] = 'exit';
          s.message    = 'DUNGEON CLEARED';
          s.messageTick = 90;
        }
      }
    }

    // Pickup collection
    const hitPickup = s.pickups.find(p => p.pos.x === next.x && p.pos.y === next.y);
    if (hitPickup) {
      s.pickups = s.pickups.filter(p => p.id !== hitPickup.id);
      if (hitPickup.type === 'heart') {
        s.lives = Math.min(s.lives + 1, MAX_LIVES);
        s.message = 'EXTRA LIFE';  s.messageTick = 60;
      } else {
        s.score += GEM_SCORE_BASE * s.floor;
        s.message = 'GEM';  s.messageTick = 40;
      }
    }

    // Exit — advance floor
    if (s.grid[next.y][next.x] === 'exit') {
      sn.segments.unshift(next);
      this.nextFloor();
      return;
    }

    sn.segments.unshift(next);
    if (!hitEnemy) sn.segments.pop(); // only pop if didn't grow
  }

  private moveEnemies(): void {
    const s    = this.state;
    const head = s.snake.segments[0];

    const bodySet = new Set(s.snake.segments.map(p => `${p.x},${p.y}`));
    const enemySet = new Set(s.enemies.map(e => `${e.pos.x},${e.pos.y}`));

    for (const enemy of s.enemies) {
      const room    = s.rooms[enemy.roomIdx];
      const inRoom  = head.x >= room.x && head.x < room.x + room.w &&
                      head.y >= room.y && head.y < room.y + room.h;
      const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

      let moved = false;

      if (inRoom) {
        // Chase: move toward head
        const preferred: Direction[] = dirs.sort((a, b) => {
          const na = { x: enemy.pos.x + DELTA[a].x, y: enemy.pos.y + DELTA[a].y };
          const nb = { x: enemy.pos.x + DELTA[b].x, y: enemy.pos.y + DELTA[b].y };
          const da = Math.abs(na.x - head.x) + Math.abs(na.y - head.y);
          const db = Math.abs(nb.x - head.x) + Math.abs(nb.y - head.y);
          return da - db;
        });
        for (const dir of preferred) {
          const np = { x: enemy.pos.x + DELTA[dir].x, y: enemy.pos.y + DELTA[dir].y };
          if (this.enemyCanMove(np, room, bodySet, enemySet, enemy.id)) {
            enemySet.delete(`${enemy.pos.x},${enemy.pos.y}`);
            enemy.pos = np;
            enemySet.add(`${np.x},${np.y}`);
            moved = true;
            break;
          }
        }
      }

      if (!moved) {
        // Patrol: random move within room
        const shuffled = [...dirs].sort(() => Math.random() - 0.5);
        for (const dir of shuffled) {
          const np = { x: enemy.pos.x + DELTA[dir].x, y: enemy.pos.y + DELTA[dir].y };
          if (this.enemyCanMove(np, room, bodySet, enemySet, enemy.id)) {
            enemySet.delete(`${enemy.pos.x},${enemy.pos.y}`);
            enemy.pos = np;
            enemySet.add(`${np.x},${np.y}`);
            break;
          }
        }
      }

      // Enemy stepped onto snake head
      if (enemy.pos.x === head.x && enemy.pos.y === head.y && s.invincible === 0) {
        this.die();
        return;
      }
    }
  }

  private enemyCanMove(np: Point, room: Room, bodySet: Set<string>, enemySet: Set<string>, selfId: number): boolean {
    if (np.x < room.x || np.x >= room.x + room.w) return false;
    if (np.y < room.y || np.y >= room.y + room.h) return false;
    if (this.state.grid[np.y][np.x] === 'wall') return false;
    if (bodySet.has(`${np.x},${np.y}`)) return false;
    if (enemySet.has(`${np.x},${np.y}`)) return false;
    return true;
  }

  private die(): void {
    const s = this.state;
    s.lives--;
    if (s.lives <= 0) {
      s.phase = 'dead';
      return;
    }
    // Respawn at start room — always reset to starting length so segments stay within the room
    const start      = roomCenter(s.rooms[0]);
    s.snake.segments = Array.from({ length: INIT_SNAKE_LEN }, (_, i) => ({ x: start.x - i, y: start.y }));
    s.snake.dir      = 'RIGHT';
    s.snake.nextDir  = 'RIGHT';
    s.invincible     = INVINCIBLE_TICKS;
    s.message        = 'LIFE LOST';
    s.messageTick    = 60;
    s.phase          = 'respawn'; // frozen until player presses a key
  }

  private nextFloor(): void {
    const s        = this.state;
    const nextFloor = s.floor + 1;
    const prevLen   = s.snake.segments.length;
    const newState  = this.buildState(nextFloor, s.lives, s.score);
    // Carry snake length into next floor
    const startPos  = roomCenter(newState.rooms[0]);
    newState.snake.segments = Array.from({ length: prevLen }, (_, i) => ({ x: startPos.x - i, y: startPos.y }));
    this.state = newState;
  }

  getState(): DungeonState { return this.state; }
}
