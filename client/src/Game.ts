import { GameEngine } from '@shared/GameEngine';
import { getDemoDirection } from '@shared/DemoAI';
import { TICK_RATE_MS } from '@shared/constants';
import { InputHandler } from './InputHandler';
import { Renderer } from './Renderer';
import { buildDebugPanel } from './DebugPanel';
import { sound } from './SoundEngine';
import { Leaderboard } from './Leaderboard';
import { isProfane } from './profanity';

const DEMO_IDLE_MS = 5000;
const DEMO_RESTART_MS = 1200;
const GAME_OVER_COOLDOWN_MS = 2000;

export class Game {
  private engine: GameEngine;
  private renderer: Renderer;
  private input: InputHandler;
  private lb: Leaderboard;

  private animFrameId = 0;
  private lastTickTime = 0;
  private lastInputTime = 0;
  private gameOverTime = -Infinity;
  private demoActive = false;
  private deathAnimating = false;
  private demoRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private baseTick = TICK_RATE_MS;
  private is3D = false;
  private newBestThisGame = false;
  private nameEntryShown = false;
  private nameSubmittedThisGame = false;
  private pendingScore = 0;
  private pendingName = '';

  private highScore: number;

  private scoreEl:           HTMLElement;
  private highScoreEl:       HTMLElement;
  private speedEl:           HTMLElement;
  private speedLineEl:       HTMLElement;
  private comboEl:           HTMLElement;
  private comboLineEl:       HTMLElement;
  private centerPanel:       HTMLElement;
  private gameTitle:         HTMLElement;
  private promptEl:          HTMLElement;
  private demoBadge:         HTMLElement;
  private gameScoreBigEl:    HTMLElement;
  private newBestBadgeEl:    HTMLElement;
  private cooldownBarEl:     HTMLElement;
  private nameEntryEl:       HTMLElement;
  private nameInputEl:       HTMLInputElement;
  private nameErrorEl:       HTMLElement;
  private nameSubmitEl:      HTMLButtonElement;
  private leaderboardEl:     HTMLElement;
  private leaderboardRowsEl: HTMLElement;
  private toastContainerEl:  HTMLElement;
  private viewToggleEl:      HTMLButtonElement;
  private floatPool:         HTMLElement[] = [];

  constructor(container: HTMLElement) {
    this.engine   = new GameEngine();
    this.renderer = new Renderer(container);
    this.input    = new InputHandler(
      dir => { this.engine.setDirection(dir); },
      () => this.onAnyKey(),
    );
    this.lb = new Leaderboard((name, score) => {
      this.showToast(`${name}  SCORED  ${score}`);
    });
    this.lb.subscribe();

    this.scoreEl           = document.getElementById('score')!;
    this.highScoreEl       = document.getElementById('high-score')!;
    this.speedEl           = document.getElementById('speed-mult')!;
    this.speedLineEl       = document.getElementById('speed-line')!;
    this.comboEl           = document.getElementById('combo-mult')!;
    this.comboLineEl       = document.getElementById('combo-line')!;
    this.centerPanel       = document.getElementById('center-panel')!;
    this.gameTitle         = document.getElementById('game-title')!;
    this.promptEl          = document.getElementById('prompt')!;
    this.demoBadge         = document.getElementById('demo-badge')!;
    this.gameScoreBigEl    = document.getElementById('game-score-big')!;
    this.newBestBadgeEl    = document.getElementById('new-best-badge')!;
    this.cooldownBarEl     = document.getElementById('cooldown-bar')!;
    this.nameEntryEl       = document.getElementById('name-entry')!;
    this.nameInputEl       = document.getElementById('name-input') as HTMLInputElement;
    this.nameErrorEl       = document.getElementById('name-error')!;
    this.nameSubmitEl      = document.getElementById('name-submit') as HTMLButtonElement;
    this.leaderboardEl     = document.getElementById('leaderboard')!;
    this.leaderboardRowsEl = document.getElementById('leaderboard-rows')!;
    this.toastContainerEl  = document.getElementById('toast-container')!;
    this.viewToggleEl      = document.getElementById('view-toggle') as HTMLButtonElement;

    this.highScore = parseInt(localStorage.getItem('snake-high-score') ?? '0', 10);
    this.highScoreEl.textContent = String(this.highScore);

    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'score-float';
      el.style.display = 'none';
      document.body.appendChild(el);
      this.floatPool.push(el);
    }

    this.viewToggleEl.addEventListener('click', () => {
      this.is3D = !this.is3D;
      this.renderer.set3DMode(this.is3D);
      this.viewToggleEl.textContent = this.is3D ? '3D' : '2D';
    });

    this.nameSubmitEl.addEventListener('click', () => this.submitName());
    this.nameInputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.stopPropagation(); this.submitName(); }
      if (e.key === 'Escape') { e.stopPropagation(); this.skipNameEntry(); }
    });

    this.showStartScreen();
    this.lastInputTime = performance.now();
    this.fetchAndRenderLeaderboard();

    if (import.meta.env.DEV) {
      buildDebugPanel({
        onCamera:    (el, az, z) => this.renderer.setCamera(el, az, z),
        onFov:       fov         => this.renderer.setFov(fov),
        onBoxHeight: m           => this.renderer.setBoxHeight(m),
        onBloom:     (str, thr)  => this.renderer.setBloom(str, thr),
        onBaseTick:  ms          => { this.baseTick = ms; },
      });
    }

    this.loop(0);
  }

  private onAnyKey(): void {
    if (this.deathAnimating) return;

    const phase = this.engine.getState().phase;

    // Don't restart while name entry form is open
    if (phase === 'gameover' && !this.nameEntryEl.classList.contains('hidden')) return;

    if (this.demoActive) {
      this.stopDemo();
      this.startGame();
      return;
    }

    if (phase === 'gameover') {
      if (performance.now() - this.gameOverTime < GAME_OVER_COOLDOWN_MS) return;
      this.startGame();
      return;
    }

    if (phase === 'start') {
      this.startGame();
    }
  }

  private async submitName(): Promise<void> {
    const name = this.nameInputEl.value.trim().toUpperCase().slice(0, 12);

    if (!name) {
      this.skipNameEntry();
      return;
    }

    if (isProfane(name.toLowerCase())) {
      this.nameErrorEl.textContent = 'NAME NOT ALLOWED';
      this.nameInputEl.value = '';
      return;
    }

    this.nameErrorEl.textContent = '';
    this.nameSubmitEl.disabled = true;

    try {
      await this.lb.submit(name, this.pendingScore);
      this.pendingName = name;
    } catch {
      // Non-critical — leaderboard submit failure doesn't break the game
    }

    this.finishNameEntry();
    await this.fetchAndRenderLeaderboard(this.pendingScore, this.pendingName);
  }

  private skipNameEntry(): void {
    this.finishNameEntry();
  }

  private finishNameEntry(): void {
    this.nameSubmittedThisGame = true;
    this.nameEntryEl.classList.add('hidden');
    this.nameInputEl.blur();
    this.promptEl.textContent = 'PRESS ANY KEY';
  }

  private async fetchAndRenderLeaderboard(highlightScore?: number, highlightName?: string): Promise<void> {
    try {
      const rows = await this.lb.fetchTop(10);
      this.leaderboardRowsEl.innerHTML = '';
      rows.forEach((row, i) => {
        const li = document.createElement('li');
        if (highlightScore !== undefined && row.score === highlightScore && row.name === highlightName) {
          li.className = 'highlight';
        }
        const rank  = document.createElement('span'); rank.className  = 'lb-rank';  rank.textContent = String(i + 1);
        const name  = document.createElement('span'); name.className  = 'lb-name';  name.textContent = row.name;
        const score = document.createElement('span'); score.className = 'lb-score'; score.textContent = String(row.score);
        li.append(rank, name, score);
        this.leaderboardRowsEl.appendChild(li);
      });
      this.leaderboardEl.classList.remove('hidden');
    } catch {
      // Silently fail — leaderboard is not critical
    }
  }

  private showToast(message: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toastContainerEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  private startGame(): void {
    this.newBestThisGame = false;
    this.nameEntryShown = false;
    this.nameSubmittedThisGame = false;
    this.pendingScore = 0;
    this.pendingName = '';
    this.nameInputEl.value = '';
    this.nameErrorEl.textContent = '';
    this.nameSubmitEl.disabled = false;
    this.lastInputTime = performance.now();
    this.engine.start();
    this.centerPanel.classList.add('hidden');
    this.demoBadge.classList.add('hidden');
    this.leaderboardEl.classList.add('hidden');
    this.nameEntryEl.classList.add('hidden');
    this.gameTitle.classList.remove('game-over');
    this.gameScoreBigEl.classList.add('hidden');
    this.newBestBadgeEl.classList.add('hidden');
    this.cooldownBarEl.classList.remove('active');
    this.cooldownBarEl.classList.add('hidden');
    this.speedLineEl.classList.remove('hidden');
    this.comboLineEl.classList.add('hidden');
    sound.uiClick();
  }

  private startDemo(): void {
    this.demoActive = true;
    this.engine.start();
    this.demoBadge.classList.remove('hidden');
    this.centerPanel.classList.remove('hidden');
    this.leaderboardEl.classList.add('hidden');
    this.gameTitle.textContent = 'DEMO';
    this.promptEl.textContent  = 'PRESS ANY KEY TO PLAY';
    this.speedLineEl.classList.add('hidden');
  }

  private stopDemo(): void {
    this.demoActive = false;
    if (this.demoRestartTimer !== null) {
      clearTimeout(this.demoRestartTimer);
      this.demoRestartTimer = null;
    }
    this.demoBadge.classList.add('hidden');
  }

  private showStartScreen(): void {
    this.centerPanel.classList.remove('hidden');
    this.gameTitle.textContent = 'SNAKE';
    this.gameTitle.classList.remove('game-over');
    this.promptEl.textContent  = 'PRESS ANY KEY TO START';
    this.gameScoreBigEl.classList.add('hidden');
    this.newBestBadgeEl.classList.add('hidden');
    this.cooldownBarEl.classList.remove('active');
    this.cooldownBarEl.classList.add('hidden');
    this.speedLineEl.classList.add('hidden');
  }

  private showGameOver(score: number): void {
    this.gameOverTime  = performance.now();
    this.pendingScore  = score;
    this.centerPanel.classList.remove('hidden');
    this.gameTitle.textContent = 'GAME OVER';
    this.gameTitle.classList.add('game-over');
    this.gameScoreBigEl.textContent = String(score);
    this.gameScoreBigEl.classList.remove('hidden');
    this.promptEl.textContent = '';
    this.speedLineEl.classList.add('hidden');
    this.comboLineEl.classList.add('hidden');

    if (this.newBestThisGame) {
      this.newBestBadgeEl.classList.remove('hidden');
    }

    this.cooldownBarEl.classList.remove('hidden', 'active');
    void this.cooldownBarEl.offsetWidth;
    this.cooldownBarEl.classList.add('active');

    this.fetchAndRenderLeaderboard();
  }

  private loop = (time: number): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const state = this.engine.getState();

    if (state.phase === 'start' && !this.demoActive) {
      if (time - this.lastInputTime >= DEMO_IDLE_MS) {
        this.startDemo();
      }
    }

    const score    = this.engine.getState().score;
    const tickRate = Math.max(45, this.baseTick * Math.pow(0.95, score));

    if (state.phase === 'playing' && time - this.lastTickTime >= tickRate) {
      this.lastTickTime = time;

      if (this.demoActive) {
        this.engine.setDirection(getDemoDirection(this.engine.getState()));
      }

      const prevState = this.engine.getState();
      const prevScore = prevState.score;
      const prevCombo = prevState.combo;
      const prevFood  = { ...prevState.food.position };
      this.engine.tick();
      const next = this.engine.getState();

      if (!this.demoActive) {
        const speedFactor = this.baseTick / tickRate;
        if (next.score > prevScore) {
          sound.eat(next.score);
          const pts = next.score - prevScore;
          this.spawnScoreFloat(prevFood.x, prevFood.y, `+${pts}`, prevCombo > 1);
          this.scoreEl.classList.remove('score-pop');
          void this.scoreEl.offsetWidth;
          this.scoreEl.classList.add('score-pop');
        } else if (next.phase === 'playing') {
          sound.move(speedFactor);
        }
      }

      if (next.portalUsed && !this.demoActive) sound.portal();

      if (next.phase === 'gameover') {
        if (this.demoActive) {
          this.demoRestartTimer = setTimeout(() => {
            if (this.demoActive) this.startDemo();
          }, DEMO_RESTART_MS);
        } else {
          const finalScore = next.score;
          if (finalScore > this.highScore) {
            this.highScore       = finalScore;
            this.newBestThisGame = true;
            localStorage.setItem('snake-high-score', String(this.highScore));
            this.highScoreEl.textContent = String(this.highScore);
            this.highScoreEl.classList.remove('best-new');
            void this.highScoreEl.offsetWidth;
            this.highScoreEl.classList.add('best-new');
          }
          if (next.deathCause === 'wall' || next.deathCause === 'boundary') {
            sound.wallHit();
          }
          sound.death();
          this.deathAnimating = true;
          this.renderer.explodeSnakeDeath(next.snake.segments, () => {
            this.deathAnimating = false;
            if (this.newBestThisGame) sound.highScore();
            this.showGameOver(finalScore);
          });
        }
      }
    }

    const currentState = this.engine.getState();
    if (!this.demoActive) {
      this.scoreEl.textContent = String(currentState.score);
      if (currentState.phase === 'playing') {
        const speedFactor = this.baseTick / tickRate;
        this.speedEl.textContent = `×${speedFactor.toFixed(1)}`;
        if (currentState.combo > 1) {
          this.comboEl.textContent = `×${currentState.combo}`;
          this.comboLineEl.classList.remove('hidden');
        } else {
          this.comboLineEl.classList.add('hidden');
        }
      }
    }

    // After cooldown, show name entry once
    if (currentState.phase === 'gameover' && !this.demoActive && !this.nameEntryShown) {
      const elapsed = performance.now() - this.gameOverTime;
      if (elapsed >= GAME_OVER_COOLDOWN_MS) {
        this.nameEntryShown = true;
        this.nameEntryEl.classList.remove('hidden');
        this.nameInputEl.focus();
      }
    }

    this.renderer.render(currentState, time);
  };

  private spawnScoreFloat(cx: number, cy: number, text: string, combo: boolean): void {
    const free = this.floatPool.find(e => e.style.display === 'none');
    if (!free) return;
    const { x, y } = this.renderer.projectCell(cx, cy);
    free.textContent = text;
    free.className   = combo ? 'score-float combo' : 'score-float';
    free.style.left  = `${x}px`;
    free.style.top   = `${y}px`;
    free.style.display   = 'block';
    free.style.animation = 'none';
    void free.offsetWidth;
    free.style.animation = '';
    const hide = () => { free.style.display = 'none'; free.removeEventListener('animationend', hide); };
    free.addEventListener('animationend', hide);
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
    if (this.demoRestartTimer !== null) clearTimeout(this.demoRestartTimer);
    this.lb.unsubscribe();
    this.renderer.destroy();
    this.input.destroy();
    for (const el of this.floatPool) el.remove();
  }
}
