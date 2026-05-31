import { CANVAS_W, CANVAS_H, GROUND_Y, TILE_W, GRAVITY, JUMP_FORCE, SLIDE_FRAMES, INIT_SPEED, MAX_SPEED, SPEED_ACCEL, INIT_LIVES, INVINCIBLE_FRAMES, SPAWN_X, Y_HISTORY_SIZE, HEAD_X, SEG_SIZE, DIFF_1, DIFF_2, DIFF_3, } from './constants';
let _nextId = 1;
const uid = () => _nextId++;
const SPIKE_W = 10;
const SPIKE_H = 14;
const BAR_W = 12;
const BAR_H = 40; // hangs from top — must slide under
const WALL_W = 12;
const WALL_H = 50; // shorter wall — must jump over
export class GameEngine {
    constructor() {
        this.jumpHeld = false;
        this.slideHeld = false;
        this.nextObstX = SPAWN_X + 120; // X at which to spawn next obstacle
        this.nextFruitX = SPAWN_X + 60; // X at which to spawn next fruit
        this.groundRight = 0; // rightmost x of spawned ground tiles
        this.minObstGap = 110; // min px between obstacles (shrinks with difficulty)
        this.reset();
    }
    reset() {
        _nextId = 1;
        const ground = this.buildInitialGround();
        this.groundRight = CANVAS_W + TILE_W * 8;
        this.nextObstX = SPAWN_X + 200;
        this.nextFruitX = SPAWN_X + 80;
        this.minObstGap = 110;
        this.state = {
            phase: 'start',
            headY: GROUND_Y,
            vy: 0,
            onGround: true,
            sliding: false,
            slideTicks: 0,
            invincible: 0,
            yHistory: new Array(Y_HISTORY_SIZE).fill(GROUND_Y),
            totalScroll: 0,
            segments: 3,
            ground,
            obstacles: [],
            fruits: [],
            score: 0,
            distance: 0,
            scrollSpeed: INIT_SPEED,
            tick: 0,
            lives: INIT_LIVES,
            jumpQueued: false,
        };
    }
    buildInitialGround() {
        const tiles = [];
        // Start with plenty of solid ground
        for (let x = -TILE_W * 2; x < CANVAS_W + TILE_W * 10; x += TILE_W) {
            tiles.push({ x, solid: true });
        }
        return tiles;
    }
    start() {
        this.reset();
        this.state.phase = 'playing';
    }
    setJump(pressed) {
        if (pressed && !this.jumpHeld) {
            if (this.state.phase === 'playing') {
                if (this.state.onGround) {
                    this.state.vy = -JUMP_FORCE;
                    this.state.onGround = false;
                    this.state.sliding = false;
                }
                else {
                    this.state.jumpQueued = true;
                }
            }
        }
        this.jumpHeld = pressed;
    }
    setSlide(pressed) {
        this.slideHeld = pressed;
        if (this.state.phase !== 'playing')
            return;
        if (pressed && this.state.onGround && !this.state.sliding) {
            this.state.sliding = true;
            this.state.slideTicks = SLIDE_FRAMES;
        }
        if (!pressed && this.state.sliding) {
            this.state.sliding = false;
            this.state.slideTicks = 0;
        }
    }
    tick() {
        if (this.state.phase !== 'playing')
            return this.state;
        const s = this.state;
        s.tick += 1;
        s.scrollSpeed = Math.min(MAX_SPEED, s.scrollSpeed + SPEED_ACCEL);
        const scroll = s.scrollSpeed;
        // ── Scroll ground tiles ──────────────────────────────────────────────
        for (const t of s.ground)
            t.x -= scroll;
        s.ground = s.ground.filter(t => t.x > -TILE_W * 2);
        this.spawnGround(scroll);
        // ── Scroll obstacles & fruits ────────────────────────────────────────
        for (const o of s.obstacles)
            o.x -= scroll;
        for (const f of s.fruits)
            f.x -= scroll;
        s.obstacles = s.obstacles.filter(o => o.x > -40);
        s.fruits = s.fruits.filter(f => f.x > -20 && !f.collected);
        // ── Spawn obstacles & fruits ─────────────────────────────────────────
        this.nextObstX -= scroll;
        this.nextFruitX -= scroll;
        if (this.nextObstX <= CANVAS_W)
            this.spawnObstacle();
        if (this.nextFruitX <= CANVAS_W)
            this.spawnFruit();
        // ── Difficulty ───────────────────────────────────────────────────────
        const dist = s.totalScroll;
        this.minObstGap = dist > DIFF_3 ? 70 : dist > DIFF_2 ? 85 : dist > DIFF_1 ? 100 : 110;
        // ── Slide timer ──────────────────────────────────────────────────────
        if (s.sliding) {
            s.slideTicks--;
            if (s.slideTicks <= 0) {
                s.sliding = false;
                s.slideTicks = 0;
            }
        }
        // ── Gravity & vertical movement ──────────────────────────────────────
        if (!s.onGround) {
            s.vy += GRAVITY;
            s.headY += s.vy;
        }
        // ── Ground collision ─────────────────────────────────────────────────
        const tileUnder = this.tileAt(HEAD_X);
        const onSolid = tileUnder !== null && tileUnder.solid;
        if (s.headY >= GROUND_Y && onSolid) {
            s.headY = GROUND_Y;
            s.vy = 0;
            s.onGround = true;
            // Consume buffered jump
            if (s.jumpQueued) {
                s.jumpQueued = false;
                s.vy = -JUMP_FORCE;
                s.onGround = false;
            }
        }
        else if (!onSolid && s.headY >= GROUND_Y) {
            // Over a gap — fall
            s.onGround = false;
        }
        // Fell off bottom
        if (s.headY > CANVAS_H + 20) {
            this.loseLife();
            return this.state;
        }
        // Can't go above ceiling
        if (s.headY < 10) {
            s.headY = 10;
            s.vy = Math.max(0, s.vy);
        }
        // ── Record Y history ─────────────────────────────────────────────────
        s.totalScroll += scroll;
        const idx = Math.floor(s.totalScroll) % Y_HISTORY_SIZE;
        s.yHistory[idx] = s.headY;
        s.distance = Math.floor(s.totalScroll / 10);
        // ── Invincibility countdown ──────────────────────────────────────────
        if (s.invincible > 0)
            s.invincible--;
        // ── Obstacle collision ───────────────────────────────────────────────
        if (s.invincible === 0) {
            const headRect = this.headRect();
            for (const o of s.obstacles) {
                if (rectsOverlap(headRect, { x: o.x, y: o.y, w: o.w, h: o.h })) {
                    this.loseLife();
                    return this.state;
                }
            }
        }
        // ── Fruit collection ─────────────────────────────────────────────────
        const headRect = this.headRect();
        for (const f of s.fruits) {
            if (!f.collected && rectsOverlap(headRect, { x: f.x - 6, y: f.y - 6, w: 12, h: 12 })) {
                f.collected = true;
                s.score += 1;
                s.segments = Math.min(s.segments + 1, 40);
            }
        }
        return s;
    }
    tileAt(screenX) {
        return this.state.ground.find(t => screenX >= t.x && screenX < t.x + TILE_W) ?? null;
    }
    headRect() {
        const s = this.state;
        const h = s.sliding ? Math.floor(SEG_SIZE * 0.5) : SEG_SIZE;
        return { x: HEAD_X - 4, y: s.headY - h + 2, w: 8, h: h - 2 };
    }
    loseLife() {
        const s = this.state;
        s.lives--;
        if (s.lives <= 0) {
            s.phase = 'dead';
            return;
        }
        // Respawn: reset to ground, short snake, invincibility
        s.headY = GROUND_Y;
        s.vy = 0;
        s.onGround = true;
        s.sliding = false;
        s.slideTicks = 0;
        s.invincible = INVINCIBLE_FRAMES;
        s.segments = Math.max(3, Math.floor(s.segments / 2));
        // Clear nearby obstacles so the respawn isn't immediately lethal
        s.obstacles = s.obstacles.filter(o => o.x > HEAD_X + 80 || o.x < HEAD_X - 20);
    }
    // ── Spawning ─────────────────────────────────────────────────────────────
    spawnGround(scroll) {
        const dist = this.state.totalScroll;
        // Gap probability: 0 at start, rises with difficulty
        const gapChance = dist < 400 ? 0 :
            dist < DIFF_1 ? 0.08 :
                dist < DIFF_2 ? 0.13 :
                    dist < DIFF_3 ? 0.18 : 0.22;
        const maxGapTiles = dist < DIFF_1 ? 1 : dist < DIFF_2 ? 2 : 3;
        while (this.groundRight < CANVAS_W + TILE_W * 10) {
            const x = this.groundRight;
            if (Math.random() < gapChance) {
                const gapLen = 1 + Math.floor(Math.random() * maxGapTiles);
                for (let i = 0; i < gapLen; i++) {
                    this.state.ground.push({ x: x + i * TILE_W, solid: false });
                }
                this.groundRight += gapLen * TILE_W;
                // Always add solid after gap
                this.state.ground.push({ x: this.groundRight, solid: true });
                this.groundRight += TILE_W;
            }
            else {
                this.state.ground.push({ x, solid: true });
                this.groundRight += TILE_W;
            }
        }
        this.groundRight -= scroll;
    }
    spawnObstacle() {
        const dist = this.state.totalScroll;
        const solid = this.solidAhead(SPAWN_X);
        // Don't spawn directly over a gap in ground
        if (!solid) {
            this.nextObstX = SPAWN_X + 30;
            return;
        }
        // Pick type based on difficulty
        const r = Math.random();
        let type;
        if (dist < DIFF_1) {
            type = 'spike';
        }
        else if (dist < DIFF_2) {
            type = r < 0.6 ? 'spike' : r < 0.8 ? 'bar' : 'wall';
        }
        else {
            type = r < 0.5 ? 'spike' : r < 0.75 ? 'bar' : 'wall';
        }
        let o;
        if (type === 'spike') {
            o = { id: uid(), x: SPAWN_X, y: GROUND_Y - SPIKE_H, w: SPIKE_W, h: SPIKE_H, type };
        }
        else if (type === 'bar') {
            o = { id: uid(), x: SPAWN_X, y: 0, w: BAR_W, h: BAR_H, type };
        }
        else {
            o = { id: uid(), x: SPAWN_X, y: GROUND_Y - WALL_H, w: WALL_W, h: WALL_H, type };
        }
        this.state.obstacles.push(o);
        const gap = this.minObstGap + Math.floor(Math.random() * 60);
        this.nextObstX = SPAWN_X + gap;
    }
    spawnFruit() {
        const dist = this.state.totalScroll;
        const solid = this.solidAhead(SPAWN_X);
        if (!solid) {
            this.nextFruitX = SPAWN_X + 40;
            return;
        }
        // Fruit Y: on ground or floating
        const floating = dist > DIFF_1 && Math.random() < 0.35;
        const y = floating
            ? GROUND_Y - 30 - Math.floor(Math.random() * 30)
            : GROUND_Y - 8;
        this.state.fruits.push({ id: uid(), x: SPAWN_X, y, collected: false });
        const gap = 90 + Math.floor(Math.random() * 80);
        this.nextFruitX = SPAWN_X + gap;
    }
    solidAhead(screenX) {
        const tile = this.state.ground.find(t => screenX >= t.x && screenX < t.x + TILE_W);
        return tile?.solid ?? true;
    }
    getState() {
        return this.state;
    }
}
function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y;
}
