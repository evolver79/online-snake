const JUMP_KEYS = new Set(['ArrowUp', 'w', 'W', ' ']);
const SLIDE_KEYS = new Set(['ArrowDown', 's', 'S']);
export class InputHandler {
    constructor(onJump, onSlide, onAnyKey) {
        this.onDown = (e) => {
            if (JUMP_KEYS.has(e.key)) {
                e.preventDefault();
                this.onJump(true);
            }
            if (SLIDE_KEYS.has(e.key)) {
                e.preventDefault();
                this.onSlide(true);
            }
            this.onAnyKey();
        };
        this.onUp = (e) => {
            if (JUMP_KEYS.has(e.key))
                this.onJump(false);
            if (SLIDE_KEYS.has(e.key))
                this.onSlide(false);
        };
        this.onJump = onJump;
        this.onSlide = onSlide;
        this.onAnyKey = onAnyKey;
        window.addEventListener('keydown', this.onDown);
        window.addEventListener('keyup', this.onUp);
    }
    destroy() {
        window.removeEventListener('keydown', this.onDown);
        window.removeEventListener('keyup', this.onUp);
    }
}
