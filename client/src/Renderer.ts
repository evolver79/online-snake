import type { RunnerState, Obstacle, Fruit } from '@shared/types';
import {
  CANVAS_W, CANVAS_H, GROUND_Y, TILE_W, HEAD_X,
  SEG_SIZE, SEG_GAP, Y_HISTORY_SIZE, INVINCIBLE_FRAMES,
} from '@shared/constants';

const SKY        = '#120820';
const MOON_COL   = '#e8dfc0';
const CITY_FAR   = '#1e1030';
const CITY_MID   = '#190c28';
const CITY_NEAR  = '#120820';
const GROUND_TOP = '#4a3828';
const GROUND_MID = '#3a2c1e';
const GROUND_LOW = '#2c2016';
const SNAKE_BDR  = '#0d7a28';
const SNAKE_HEAD = '#33ff66';
const SNAKE_EYE  = '#ffffff';
const FRUIT_COL  = '#ff9922';
const SPIKE_COL  = '#cc2233';
const SPIKE_DRK  = '#881122';
const BAR_COL    = '#7a3a10';
const BAR_DRK    = '#4a2008';
const WALL_COL   = '#5a4030';
const WALL_DRK   = '#3a2820';
const HUD_COL    = '#33ff66';

interface Building { x: number; w: number; h: number; hasSpire: boolean; spireH: number; }
interface CityLayer { buildings: Building[]; totalW: number; parallax: number; color: string; yBase: number; }

function genCity(
  seed: number, count: number, minW: number, maxW: number,
  minH: number, maxH: number, parallax: number, color: string, yBase: number,
): CityLayer {
  let r = seed;
  const rng = (): number => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff; };
  const buildings: Building[] = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const w        = minW + Math.floor(rng() * (maxW - minW));
    const h        = minH + Math.floor(rng() * (maxH - minH));
    const hasSpire = rng() < 0.28;
    const spireH   = hasSpire ? 5 + Math.floor(rng() * 16) : 0;
    buildings.push({ x, w, h, hasSpire, spireH });
    x += w + Math.floor(rng() * 3);
  }
  return { buildings, totalW: x, parallax, color, yBase };
}

const CITIES: CityLayer[] = [
  genCity(42,   80, 6,  18, 18, 45,  0.06, CITY_FAR,  CANVAS_H - 36),
  genCity(137,  50, 12, 28, 35, 72,  0.18, CITY_MID,  CANVAS_H - 40),
  genCity(2053, 28, 20, 48, 55, 108, 0.40, CITY_NEAR, CANVAS_H - 46),
];

function drawCity(ctx: CanvasRenderingContext2D, layer: CityLayer, scroll: number): void {
  ctx.fillStyle = layer.color;
  const off = (scroll * layer.parallax) % layer.totalW;
  for (let rep = 0; rep < 3; rep++) {
    const dx = -off + rep * layer.totalW;
    for (const b of layer.buildings) {
      const bx = Math.floor(dx + b.x);
      const by = layer.yBase - b.h;
      ctx.fillRect(bx, by, b.w, b.h);
      if (b.hasSpire) {
        const cx = bx + Math.floor(b.w / 2);
        ctx.beginPath();
        ctx.moveTo(cx, by - b.spireH);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + b.w, by);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

const STARS: { x: number; y: number; r: number }[] = (() => {
  let rs = 999;
  const rng = (): number => { rs = (rs * 1664525 + 1013904223) & 0xffffffff; return (rs >>> 0) / 0xffffffff; };
  return Array.from({ length: 55 }, () => ({
    x: Math.floor(rng() * CANVAS_W),
    y: Math.floor(rng() * (GROUND_Y - 60)),
    r: rng() < 0.18 ? 1 : 0,
  }));
})();

const PIXEL_GLYPHS: Record<string, number[]> = {
  '0':[0xe,0xa,0xa,0xa,0xe],'1':[0x4,0xc,0x4,0x4,0xe],'2':[0xe,0x2,0xe,0x8,0xe],
  '3':[0xe,0x2,0x6,0x2,0xe],'4':[0xa,0xa,0xe,0x2,0x2],'5':[0xe,0x8,0xe,0x2,0xe],
  '6':[0xe,0x8,0xe,0xa,0xe],'7':[0xe,0x2,0x2,0x2,0x2],'8':[0xe,0xa,0xe,0xa,0xe],
  '9':[0xe,0xa,0xe,0x2,0xe],'M':[0xa,0xe,0xa,0xa,0xa],
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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

    this.overlay = document.createElement('canvas');
    this.overlay.width  = CANVAS_W;
    this.overlay.height = CANVAS_H;
    const oc = this.overlay.getContext('2d')!;
    oc.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < CANVAS_H; y += 2) oc.fillRect(0, y, CANVAS_W, 1);
    const g = oc.createRadialGradient(CANVAS_W/2, CANVAS_H/2, CANVAS_H*0.22, CANVAS_W/2, CANVAS_H/2, CANVAS_H*0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.50)');
    oc.fillStyle = g;
    oc.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  render(state: RunnerState, _time: number): void {
    const ctx   = this.ctx;
    const flash = state.invincible > 0 && Math.floor(state.invincible / 5) % 2 === 0;

    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = 'rgba(255,255,220,0.65)';
    for (const s of STARS) ctx.fillRect(s.x, s.y, s.r + 1, s.r + 1);

    ctx.fillStyle = MOON_COL;
    ctx.beginPath(); ctx.arc(CANVAS_W - 70, 42, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SKY;
    ctx.beginPath(); ctx.arc(CANVAS_W - 62, 38, 17, 0, Math.PI * 2); ctx.fill();

    for (const layer of CITIES) drawCity(ctx, layer, state.totalScroll);

    this.drawGround(ctx, state);

    for (const f of state.fruits) if (!f.collected) this.drawFruit(ctx, f, state.tick);
    for (const o of state.obstacles)               this.drawObstacle(ctx, o);

    if (!flash) this.drawSnake(ctx, state);

    if (state.invincible > INVINCIBLE_FRAMES - 10) {
      ctx.fillStyle = 'rgba(255,50,50,0.40)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    this.drawHUD(ctx, state);
    ctx.drawImage(this.overlay, 0, 0);
  }

  private drawGround(ctx: CanvasRenderingContext2D, state: RunnerState): void {
    for (const t of state.ground) {
      if (!t.solid) continue;
      const x = Math.floor(t.x);
      const h = CANVAS_H - GROUND_Y;
      ctx.fillStyle = GROUND_MID; ctx.fillRect(x, GROUND_Y + 3, TILE_W, h - 3);
      ctx.fillStyle = GROUND_TOP; ctx.fillRect(x, GROUND_Y, TILE_W, 3);
      ctx.fillStyle = GROUND_LOW; ctx.fillRect(x, CANVAS_H - 4, TILE_W, 4);
      ctx.fillStyle = GROUND_LOW; ctx.fillRect(x + TILE_W - 1, GROUND_Y + 3, 1, h - 3);
    }
  }

  private drawFruit(ctx: CanvasRenderingContext2D, f: Fruit, tick: number): void {
    const x   = Math.floor(f.x);
    const bob = Math.floor(Math.sin(tick * 0.12 + f.id) * 2);
    const y   = Math.floor(f.y) + bob;
    ctx.fillStyle = 'rgba(255,100,0,0.18)'; ctx.fillRect(x - 6, y - 6, 15, 15);
    ctx.fillStyle = FRUIT_COL;              ctx.fillRect(x - 3, y - 3, 10, 10);
    ctx.fillStyle = '#ffcc66';              ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#226600';              ctx.fillRect(x, y - 6, 2, 3);
  }

  private drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle): void {
    const x = Math.floor(o.x);
    if (o.type === 'spike') {
      const cx = x + Math.floor(o.w / 2);
      ctx.fillStyle = SPIKE_COL;
      for (let row = 0; row < o.h; row++) {
        const span = Math.max(1, Math.floor((row / o.h) * o.w));
        ctx.fillRect(cx - Math.floor(span / 2), o.y + row, span, 1);
      }
      ctx.fillStyle = SPIKE_DRK; ctx.fillRect(cx, o.y, 1, o.h);
    } else if (o.type === 'bar') {
      ctx.fillStyle = BAR_DRK; ctx.fillRect(x, 0, o.w, o.h);
      ctx.fillStyle = BAR_COL; ctx.fillRect(x + 1, 0, o.w - 2, o.h - 2);
      ctx.fillStyle = BAR_DRK; ctx.fillRect(x + Math.floor(o.w / 2) - 1, o.h - 4, 3, 6);
    } else {
      ctx.fillStyle = WALL_DRK; ctx.fillRect(x, o.y, o.w, o.h);
      ctx.fillStyle = WALL_COL; ctx.fillRect(x + 1, o.y + 1, o.w - 2, o.h - 2);
      ctx.fillStyle = WALL_DRK;
      for (let ry = o.y; ry < o.y + o.h; ry += 5) ctx.fillRect(x + 1, ry, o.w - 2, 1);
    }
  }

  private drawSnake(ctx: CanvasRenderingContext2D, state: RunnerState): void {
    const scroll   = Math.floor(state.totalScroll);
    const segCount = state.segments;

    for (let i = segCount - 1; i >= 0; i--) {
      const scrollAtSeg = scroll - (i + 1) * SEG_GAP;
      const histIdx     = ((scrollAtSeg % Y_HISTORY_SIZE) + Y_HISTORY_SIZE) % Y_HISTORY_SIZE;
      const segY        = scrollAtSeg < 0 ? GROUND_Y : state.yHistory[histIdx];
      const segX        = HEAD_X - (i + 1) * SEG_GAP;
      if (segX < -SEG_SIZE || segX > CANVAS_W) continue;

      const segH = (i === 0 && state.sliding) ? Math.ceil(SEG_SIZE * 0.45) : SEG_SIZE;
      const dx   = Math.floor(segX) - Math.floor(SEG_SIZE / 2);
      const dy   = Math.floor(segY) - segH;
      const g    = Math.floor(204 - (i / segCount) * 60);

      ctx.fillStyle = SNAKE_BDR;           ctx.fillRect(dx, dy, SEG_SIZE, segH);
      ctx.fillStyle = `rgb(26,${g},68)`;   ctx.fillRect(dx + 1, dy + 1, SEG_SIZE - 2, segH - 2);
    }

    const headH = state.sliding ? Math.ceil(SEG_SIZE * 0.45) : SEG_SIZE;
    const hx    = HEAD_X - Math.floor(SEG_SIZE / 2);
    const hy    = Math.floor(state.headY) - headH;

    ctx.fillStyle = SNAKE_BDR;  ctx.fillRect(hx, hy, SEG_SIZE, headH);
    ctx.fillStyle = SNAKE_HEAD; ctx.fillRect(hx + 1, hy + 1, SEG_SIZE - 2, headH - 2);
    if (!state.sliding) {
      ctx.fillStyle = SNAKE_EYE; ctx.fillRect(hx + SEG_SIZE - 3, hy + 2, 2, 2);
    }

    if (state.tick % 22 < 11) {
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(hx + SEG_SIZE,     hy + Math.floor(headH / 2) - 1, 3, 1);
      ctx.fillRect(hx + SEG_SIZE + 3, hy + Math.floor(headH / 2) - 2, 1, 1);
      ctx.fillRect(hx + SEG_SIZE + 3, hy + Math.floor(headH / 2),     1, 1);
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D, state: RunnerState): void {
    ctx.fillStyle = HUD_COL;
    const scoreStr = `${state.score}`;
    const distStr  = `${state.distance}M`;
    this.pixelText(ctx, scoreStr, CANVAS_W - 6 - scoreStr.length * 6, 7);
    this.pixelText(ctx, distStr,  CANVAS_W - 6 - distStr.length * 6,  16);
    for (let i = 0; i < state.lives; i++) this.drawHeart(ctx, 6 + i * 10, 6);
  }

  private pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    let cx = x;
    for (const ch of text) {
      const rows = PIXEL_GLYPHS[ch];
      if (rows) {
        for (let row = 0; row < rows.length; row++)
          for (let col = 0; col < 4; col++)
            if (rows[row] & (1 << (3 - col))) ctx.fillRect(cx + col, y + row, 1, 1);
      }
      cx += 6;
    }
  }

  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#dd2244';
    const shape = [0b0110110, 0b1111111, 0b1111111, 0b0111110, 0b0011100, 0b0001000];
    for (let row = 0; row < shape.length; row++)
      for (let col = 0; col < 7; col++)
        if (shape[row] & (1 << (6 - col))) ctx.fillRect(x + col, y + row, 1, 1);
  }

  destroy(): void { this.canvas.remove(); }
}
