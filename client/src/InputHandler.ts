import type { Direction } from '@shared/types';

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  w: 'UP', W: 'UP',
  s: 'DOWN', S: 'DOWN',
  a: 'LEFT', A: 'LEFT',
  d: 'RIGHT', D: 'RIGHT',
};

export class InputHandler {
  private onDirection: (dir: Direction) => void;
  private onAnyKey: () => void;

  constructor(onDirection: (dir: Direction) => void, onAnyKey: () => void) {
    this.onDirection = onDirection;
    this.onAnyKey = onAnyKey;
    window.addEventListener('keydown', this.handleKey);
  }

  private handleKey = (e: KeyboardEvent): void => {
    const dir = KEY_TO_DIR[e.key];
    if (dir) {
      e.preventDefault();
      this.onDirection(dir);
    }
    this.onAnyKey();
  };

  destroy(): void {
    window.removeEventListener('keydown', this.handleKey);
  }
}
