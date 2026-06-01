import type { Direction } from '@shared/types';

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: 'UP', w: 'UP', W: 'UP',
  ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
  ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
  ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
};

export class InputHandler {
  constructor(
    private onDir:       (d: Direction) => void,
    private onAnyKey:    () => void,
    private onToggleLb:  () => void,
  ) {
    window.addEventListener('keydown', this.handle);
    window.addEventListener('pointerup', this.handleClick);
  }

  private handle = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') { e.preventDefault(); this.onToggleLb(); return; }
    // Don't intercept keys when a text input is focused (name entry etc.)
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const dir = KEY_DIR[e.key];
    if (dir) { e.preventDefault(); this.onDir(dir); }
    this.onAnyKey();
  };

  private handleClick = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a')) return;
    if (target.closest('#leaderboard'))  { this.onToggleLb(); return; }
    this.onAnyKey();
  };

  destroy(): void {
    window.removeEventListener('keydown', this.handle);
    window.removeEventListener('pointerup', this.handleClick);
  }
}
