import type { Direction, GameState, Cell } from './types';
import { GRID_SIZE } from './constants';

const DIRECTION_DELTA: Record<Direction, Cell> = {
  UP:    { x: 0,  y: 1  },
  DOWN:  { x: 0,  y: -1 },
  LEFT:  { x: -1, y: 0  },
  RIGHT: { x: 1,  y: 0  },
};

const CLOCKWISE: Direction[] = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

function turnRight(d: Direction): Direction {
  return CLOCKWISE[(CLOCKWISE.indexOf(d) + 1) % 4];
}

function turnLeft(d: Direction): Direction {
  return CLOCKWISE[(CLOCKWISE.indexOf(d) + 3) % 4];
}

function isSafe(next: Cell, segments: Cell[]): boolean {
  if (next.x < 0 || next.x >= GRID_SIZE || next.y < 0 || next.y >= GRID_SIZE) return false;
  // Tail will vacate its cell this tick, so exclude it from collision check
  const bodyWithoutTail = segments.slice(0, -1);
  return !bodyWithoutTail.some(s => s.x === next.x && s.y === next.y);
}

function advance(head: Cell, dir: Direction): Cell {
  const d = DIRECTION_DELTA[dir];
  return { x: head.x + d.x, y: head.y + d.y };
}

export function getDemoDirection(state: GameState): Direction {
  const head = state.snake.segments[0];
  const dir = state.snake.direction;
  const food = state.food.position;

  // Candidates in priority order: straight, right turn, left turn
  const candidates: Direction[] = [dir, turnRight(dir), turnLeft(dir)];

  const safe = candidates.filter(d => isSafe(advance(head, d), state.snake.segments));

  if (safe.length === 0) return dir; // doomed — go straight

  // Among safe moves, prefer the one that decreases Manhattan distance to food
  safe.sort((a, b) => {
    const na = advance(head, a);
    const nb = advance(head, b);
    const da = Math.abs(na.x - food.x) + Math.abs(na.y - food.y);
    const db = Math.abs(nb.x - food.x) + Math.abs(nb.y - food.y);
    return da - db;
  });

  return safe[0];
}
