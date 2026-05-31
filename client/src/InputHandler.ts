import type { Direction } from '@shared/types';

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: 'UP', w: 'UP', W: 'UP',
  ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
  ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
  ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
};

export class InputHandler {
  constructor(
    private onDir:    (d: Direction) => void,
    private onAnyKey: () => void,
  ) {
    window.addEventListener('keydown', this.handle);
  }

  private handle = (e: KeyboardEvent): void => {
    const dir = KEY_DIR[e.key];
    if (dir) { e.preventDefault(); this.onDir(dir); }
    this.onAnyKey();
  };

  destroy(): void { window.removeEventListener('keydown', this.handle); }
}
