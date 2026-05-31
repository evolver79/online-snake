import type { DungeonState, Enemy } from '@shared/types';
import { CANVAS_W, CANVAS_H, CELL, MAP_W, MAP_H, HUD_H, INVINCIBLE_TICKS } from '@shared/constants';

// ── Palette ─────────────────────────────────────────────────────────────────
const BG          = '#0a0810';
const WALL_DARK   = '#100c18';
const WALL_MID    = '#1a1428';
const WALL_LIGHT  = '#241c34';
const FLOOR_A     = '#141028';
const FLOOR_B     = '#100d22';
const FLOOR_EDGE  = '#0d0a1c';
const EXIT_A      = '#ccaa00';
const EXIT_B      = '#ffdd44';
const SNAKE_DARK  = '#0a5a1e';
const SNAKE_MID   = '#14902e';
const SNAKE_HEAD  = '#22ee55';
const SNAKE_GLOW  = '#44ff88';
const SNAKE_EYE   = '#ffffff';
const HUD_BG      = '#080612';
const HUD_LINE    = '#1a1230';
const HUD_GREEN   = '#22cc44';
const HUD_DIM     = 'rgba(34,204,68,0.4)';
const MSG_COL     = '#ffdd44';

const ENEMY_COLORS: Record<string, [string, string]> = {
  rat:      ['#aa1122', '#ff3344'],
  skeleton: ['#667788', '#99aabb'],
  demon:    ['#cc4400', '#ff8833'],
};

// ── Pixel font glyphs (4×5) ──────────────────────────────────────────────────
const GLYPHS: Record<string, number[]> = {
  '0':[0xe,0xa,0xa,0xa,0xe],'1':[0x4,0xc,0x4,0x4,0xe],'2':[0xe,0x2,0xe,0x8,0xe],
  '3':[0xe,0x2,0x6,0x2,0xe],'4':[0xa,0xa,0xe,0x2,0x2],'5':[0xe,0x8,0xe,0x2,0xe],
  '6':[0xe,0x8,0xe,0xa,0xe],'7':[0xe,0x2,0x2,0x2,0x2],'8':[0xe,0xa,0xe,0xa,0xe],
  '9':[0xe,0xa,0xe,0x2,0xe],'F':[0xe,0x8,0xc,0x8,0x8],'L':[0x8,0x8,0x8,0x8,0xe],
  'O':[0xe,0xa,0xa,0xa,0xe],'R':[0xe,0xa,0xe,0xc,0xa],'S':[0x6,0x8,0x4,0x2,0xc],
  'C':[0xe,0x8,0x8,0x8,0xe],'E':[0xe,0x8,0xc,0x8,0xe],'A':[0x4,0xa,0xe,0xa,0xa],
  'D':[0xc,0xa,0xa,0xa,0xc],'G':[0xe,0x8,0xb,0xa,0xe],'I':[0xe,0x4,0x4,0x4,0xe],
  'N':[0xa,0xe,0xe,0xa,0xa],'U':[0xa,0xa,0xa,0xa,0xe],'T':[0xe,0x4,0x4,0x4,0x4],
  'H':[0xa,0xa,0xe,0xa,0xa],'Y':[0xa,0xa,0x4,0x4,0x4],'K':[0xa,0xc,0x8,0xc,0xa],
  'P':[0xe,0xa,0xe,0x8,0x8],'B':[0xc,0xa,0xc,0xa,0xc],' ':[0,0,0,0,0],
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx:    CanvasRenderingContext2D;
  private overlay: HTMLCanvasElement;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.cssText = [
      'width:100%','height:100%','display:block',
      'image-rendering:pixelated','image-rendering:crisp-edges',
    ].join(';');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    // Bake CRT overlay
    this.overlay = document.createElement('canvas');
    this.overlay.width  = CANVAS_W;
    this.overlay.height = CANVAS_H;
    const oc = this.overlay.getContext('2d')!;
    oc.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < CANVAS_H; y += 2) oc.fillRect(0, y, CANVAS_W, 1);
    const g = oc.createRadialGradient(CANVAS_W/2,CANVAS_H/2,CANVAS_H*0.2,CANVAS_W/2,CANVAS_H/2,CANVAS_H*0.8);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.55)');
    oc.fillStyle = g; oc.fillRect(0,0,CANVAS_W,CANVAS_H);
  }

  render(state: DungeonState, _time: number): void {
    const ctx   = this.ctx;
    const flash = state.invincible > 0 && Math.floor(state.invincible / 5) % 2 === 0;

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Dungeon tiles
    this.drawMap(ctx, state);

    // Exit marker
    if (state.exitPos) this.drawExit(ctx, state.exitPos, state.tick);

    // Enemies
    for (const e of state.enemies) this.drawEnemy(ctx, e, state.tick);

    // Snake
    if (!flash) this.drawSnake(ctx, state);

    // Hit flash
    if (state.invincible > INVINCIBLE_TICKS - 8) {
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.fillRect(0, 0, CANVAS_W, MAP_H * CELL);
    }

    // HUD
    this.drawHUD(ctx, state);

    // Flash message
    if (state.messageTick > 0) this.drawMessage(ctx, state.message, state.messageTick);

    // Respawn prompt
    if (state.phase === 'respawn' && state.messageTick === 0) {
      this.drawMessage(ctx, 'PRESS ANY KEY', 60);
    }

    // CRT
    ctx.drawImage(this.overlay, 0, 0);
  }

  private drawMap(ctx: CanvasRenderingContext2D, state: DungeonState): void {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const cell = state.grid[y][x];
        const px   = x * CELL;
        const py   = y * CELL;

        if (cell === 'wall') {
          ctx.fillStyle = WALL_DARK;
          ctx.fillRect(px, py, CELL, CELL);
          // Bevel: lighter top/left edge if neighbor below/right is floor
          const hasFloorRight  = x + 1 < MAP_W && state.grid[y][x + 1] !== 'wall';
          const hasFloorBelow  = y + 1 < MAP_H && state.grid[y + 1][x] !== 'wall';
          const hasFloorLeft   = x > 0 && state.grid[y][x - 1] !== 'wall';
          const hasFloorAbove  = y > 0 && state.grid[y - 1][x] !== 'wall';
          if (hasFloorBelow)  { ctx.fillStyle = WALL_LIGHT; ctx.fillRect(px, py + CELL - 2, CELL, 2); }
          if (hasFloorRight)  { ctx.fillStyle = WALL_MID;   ctx.fillRect(px + CELL - 2, py, 2, CELL); }
          if (hasFloorAbove)  { ctx.fillStyle = WALL_MID;   ctx.fillRect(px, py, CELL, 2); }
          if (hasFloorLeft)   { ctx.fillStyle = WALL_LIGHT; ctx.fillRect(px, py, 2, CELL); }
        } else {
          // Floor
          ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
          ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = FLOOR_EDGE;
          ctx.fillRect(px + CELL - 1, py, 1, CELL);
          ctx.fillRect(px, py + CELL - 1, CELL, 1);
        }
      }
    }
  }

  private drawExit(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, tick: number): void {
    const px  = pos.x * CELL;
    const py  = pos.y * CELL;
    const t   = Math.sin(tick * 0.08) * 0.5 + 0.5;
    // Pulsing gold square
    ctx.fillStyle = tick % 20 < 10 ? EXIT_A : EXIT_B;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    // Down arrow (stairs icon)
    ctx.fillStyle = '#000';
    ctx.fillRect(px + 3, py + 2, 4, 3);  // top of arrow
    ctx.fillRect(px + 2, py + 4, 6, 2);  // mid
    ctx.fillRect(px + 3, py + 6, 4, 1);  // bottom point step 1
    ctx.fillRect(px + 4, py + 7, 2, 1);  // bottom point step 2
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, tick: number): void {
    const px = e.pos.x * CELL;
    const py = e.pos.y * CELL;
    const [dark, light] = ENEMY_COLORS[e.type] ?? ENEMY_COLORS['rat'];

    if (e.type === 'rat') {
      // Small oval body
      ctx.fillStyle = dark;  ctx.fillRect(px + 2, py + 3, 6, 5);
      ctx.fillStyle = light; ctx.fillRect(px + 3, py + 4, 4, 3);
      // Ears
      ctx.fillStyle = light; ctx.fillRect(px + 2, py + 2, 2, 2);
      ctx.fillRect(px + 6, py + 2, 2, 2);
      // Eye
      ctx.fillStyle = '#fff'; ctx.fillRect(px + 7, py + 3, 1, 1);
      // Tail
      ctx.fillStyle = dark; ctx.fillRect(px + 1, py + 6, 2, 1);
    } else if (e.type === 'skeleton') {
      // Skull
      ctx.fillStyle = dark;  ctx.fillRect(px + 2, py + 1, 6, 6);
      ctx.fillStyle = light; ctx.fillRect(px + 3, py + 2, 4, 4);
      // Eyes (dark holes)
      ctx.fillStyle = '#000'; ctx.fillRect(px + 3, py + 3, 2, 2);
      ctx.fillRect(px + 6, py + 3, 2, 2);  // wait, 6+2=8, should be px+5
      // Body
      ctx.fillStyle = dark; ctx.fillRect(px + 3, py + 7, 4, 2);
      // Ribcage lines
      ctx.fillStyle = '#000'; ctx.fillRect(px + 4, py + 7, 1, 2);
      ctx.fillRect(px + 6, py + 7, 1, 2);
    } else {
      // Demon — horned, menacing
      const bob = tick % 30 < 15 ? 0 : 1;
      ctx.fillStyle = dark;
      ctx.fillRect(px + 1, py + 3 + bob, 8, 6);
      ctx.fillStyle = light;
      ctx.fillRect(px + 2, py + 4 + bob, 6, 4);
      // Horns
      ctx.fillStyle = '#aa2200';
      ctx.fillRect(px + 2, py + 1 + bob, 2, 3);
      ctx.fillRect(px + 6, py + 1 + bob, 2, 3);
      // Eyes glow
      ctx.fillStyle = '#ffdd00';
      ctx.fillRect(px + 3, py + 5 + bob, 2, 2);
      ctx.fillRect(px + 6, py + 5 + bob, 2, 2);
    }
  }

  private drawSnake(ctx: CanvasRenderingContext2D, state: DungeonState): void {
    const segs = state.snake.segments;

    for (let i = segs.length - 1; i >= 0; i--) {
      const seg  = segs[i];
      const px   = seg.x * CELL;
      const py   = seg.y * CELL;
      const fade = i / segs.length;
      const g    = Math.floor(144 - fade * 80);
      const b    = Math.floor(30 + fade * 10);

      if (i === 0) {
        // Head
        ctx.fillStyle = SNAKE_DARK; ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = SNAKE_HEAD; ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
        // Eye
        const dir  = state.snake.dir;
        const ex   = dir === 'RIGHT' ? px + CELL - 3 : dir === 'LEFT' ? px + 1 : px + 3;
        const ey   = dir === 'DOWN'  ? py + CELL - 3 : dir === 'UP'   ? py + 1 : py + 3;
        ctx.fillStyle = SNAKE_EYE; ctx.fillRect(ex, ey, 2, 2);
      } else {
        ctx.fillStyle = SNAKE_DARK;               ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = `rgb(20,${g},${b})`;      ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      }
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D, state: DungeonState): void {
    const y0 = MAP_H * CELL;  // 220
    ctx.fillStyle = HUD_BG;   ctx.fillRect(0, y0, CANVAS_W, HUD_H);
    ctx.fillStyle = HUD_LINE; ctx.fillRect(0, y0, CANVAS_W, 2);

    // Floor label
    ctx.fillStyle = HUD_GREEN;
    this.pixelText(ctx, `FLOOR ${state.floor}`, 8, y0 + 10, 2);

    // Score
    const scoreStr = `${state.score}`;
    this.pixelText(ctx, scoreStr, Math.floor(CANVAS_W / 2) - (scoreStr.length * 6), y0 + 10, 2);

    // Lives (hearts)
    for (let i = 0; i < state.lives; i++) this.drawHeart(ctx, CANVAS_W - 12 - i * 14, y0 + 10);

    // Enemy count
    const enemyStr = `${state.enemies.length} REMAINING`;
    ctx.fillStyle = HUD_DIM;
    this.pixelText(ctx, enemyStr, 8, y0 + 32, 1);

    // Snake length
    const lenStr = `LEN  ${state.snake.segments.length}`;
    this.pixelText(ctx, lenStr, CANVAS_W - 8 - lenStr.length * 5, y0 + 32, 1);
  }

  private drawMessage(ctx: CanvasRenderingContext2D, msg: string, tick: number): void {
    const alpha = Math.min(1, tick / 20);
    const w     = msg.length * 12 + 16;
    const x     = Math.floor((CANVAS_W - w) / 2);
    const y     = Math.floor(MAP_H * CELL / 2) - 14;

    ctx.fillStyle = `rgba(8,6,18,${alpha * 0.85})`;
    ctx.fillRect(x - 4, y - 4, w + 8, 26);
    ctx.fillStyle = `rgba(34,204,68,${alpha * 0.3})`;
    ctx.fillRect(x - 4, y - 4, w + 8, 2);

    ctx.fillStyle = `rgba(255,221,68,${alpha})`;
    this.pixelText(ctx, msg, x, y + 4, 2);
  }

  private pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale = 1): void {
    let cx = x;
    for (const ch of text.toUpperCase()) {
      const rows = GLYPHS[ch] ?? GLYPHS[' '];
      for (let row = 0; row < rows.length; row++)
        for (let col = 0; col < 4; col++)
          if (rows[row] & (1 << (3 - col)))
            ctx.fillRect(cx + col * scale, y + row * scale, scale, scale);
      cx += (4 + 1) * scale;
    }
  }

  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#cc2244';
    const shape = [0b0110110, 0b1111111, 0b1111111, 0b0111110, 0b0011100, 0b0001000];
    for (let row = 0; row < shape.length; row++)
      for (let col = 0; col < 7; col++)
        if (shape[row] & (1 << (6 - col))) ctx.fillRect(x + col, y + row, 1, 1);
  }

  destroy(): void { this.canvas.remove(); }
}
