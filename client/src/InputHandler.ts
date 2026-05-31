const JUMP_KEYS  = new Set(['ArrowUp', 'w', 'W', ' ']);
const SLIDE_KEYS = new Set(['ArrowDown', 's', 'S']);

export class InputHandler {
  private onJump:   (pressed: boolean) => void;
  private onSlide:  (pressed: boolean) => void;
  private onAnyKey: () => void;

  constructor(
    onJump:   (pressed: boolean) => void,
    onSlide:  (pressed: boolean) => void,
    onAnyKey: () => void,
  ) {
    this.onJump   = onJump;
    this.onSlide  = onSlide;
    this.onAnyKey = onAnyKey;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup',   this.onUp);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (JUMP_KEYS.has(e.key))  { e.preventDefault(); this.onJump(true); }
    if (SLIDE_KEYS.has(e.key)) { e.preventDefault(); this.onSlide(true); }
    this.onAnyKey();
  };

  private onUp = (e: KeyboardEvent): void => {
    if (JUMP_KEYS.has(e.key))  this.onJump(false);
    if (SLIDE_KEYS.has(e.key)) this.onSlide(false);
  };

  destroy(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup',   this.onUp);
  }
}
