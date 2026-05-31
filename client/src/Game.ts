import { GameEngine } from '@shared/GameEngine';
import { Renderer } from './Renderer';
import { InputHandler } from './InputHandler';
import { sound } from './SoundEngine';
import { Leaderboard } from './Leaderboard';
import { isProfane } from './profanity';

export class Game {
  private engine:   GameEngine;
  private renderer: Renderer;
  private input:    InputHandler;
  private lb:       Leaderboard;

  private rafId     = 0;
  private highScore = 0;

  private nameSubmitted = false;
  private pendingScore  = 0;
  private pendingName   = '';

  private overlay:    HTMLElement;
  private ovTitle:    HTMLElement;
  private ovScore:    HTMLElement;
  private ovSub:      HTMLElement;
  private nameEntry:  HTMLElement;
  private nameInput:  HTMLInputElement;
  private nameError:  HTMLElement;
  private nameSubmit: HTMLButtonElement;
  private lbEl:       HTMLElement;
  private lbRows:     HTMLElement;
  private toastEl:    HTMLElement;
  private hintsEl:    HTMLElement;

  constructor(container: HTMLElement) {
    this.engine   = new GameEngine();
    this.renderer = new Renderer(container);
    this.input    = new InputHandler(
      d  => this.engine.setDirection(d),
      () => this.onAnyKey(),
    );
    this.lb = new Leaderboard((name, score) => this.showToast(`${name}  ${score}`));
    this.lb.subscribe();

    this.overlay    = document.getElementById('overlay')!;
    this.ovTitle    = document.getElementById('overlay-title')!;
    this.ovScore    = document.getElementById('overlay-score')!;
    this.ovSub      = document.getElementById('overlay-sub')!;
    this.nameEntry  = document.getElementById('name-entry')!;
    this.nameInput  = document.getElementById('name-input') as HTMLInputElement;
    this.nameError  = document.getElementById('name-error')!;
    this.nameSubmit = document.getElementById('name-submit') as HTMLButtonElement;
    this.lbEl       = document.getElementById('leaderboard')!;
    this.lbRows     = document.getElementById('leaderboard-rows')!;
    this.toastEl    = document.getElementById('toast-container')!;
    this.hintsEl    = document.getElementById('controls-hint')!;

    this.highScore = parseInt(localStorage.getItem('snake-dungeon-hs') ?? '0', 10);

    this.nameSubmit.addEventListener('click', () => this.submitName());
    this.nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.stopPropagation(); this.submitName(); }
      if (e.key === 'Escape') { e.stopPropagation(); this.skipName(); }
    });

    this.showStart();
    this.fetchLb();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private onAnyKey(): void {
    if (!this.nameEntry.classList.contains('hidden')) return;
    const phase = this.engine.getState().phase;
    if (phase === 'start')   { this.startGame(); return; }
    if (phase === 'respawn') { this.engine.resume(); return; }
    if (phase === 'dead' && this.nameSubmitted) { this.startGame(); }
  }

  private startGame(): void {
    this.nameSubmitted = false;
    this.pendingScore  = 0;
    this.pendingName   = '';
    this.nameInput.value = '';
    this.nameError.textContent = '';
    this.nameSubmit.disabled = false;
    this.overlay.classList.add('hidden');
    this.lbEl.classList.add('hidden');
    this.nameEntry.classList.add('hidden');
    this.hintsEl.classList.add('hidden');
    this.lastTickTime = performance.now();
    this.engine.start();
    sound.uiClick();
  }

  private showStart(): void {
    this.overlay.classList.remove('hidden');
    this.ovTitle.textContent = 'SNAKE DUNGEON';
    this.ovScore.textContent = '';
    this.ovSub.textContent   = 'PRESS ANY KEY TO START';
    this.nameEntry.classList.add('hidden');
    this.hintsEl.classList.remove('hidden');
  }

  private showDead(score: number): void {
    this.pendingScore = score;
    if (score > this.highScore) {
      this.highScore = score;
      localStorage.setItem('snake-dungeon-hs', String(score));
    }
    this.overlay.classList.remove('hidden');
    this.ovTitle.textContent = 'GAME OVER';
    this.ovScore.textContent = String(score);
    this.ovSub.textContent   = '';
    this.nameEntry.classList.add('hidden');
    this.hintsEl.classList.remove('hidden');
    sound.death();
    this.fetchLb();
    setTimeout(() => {
      if (this.engine.getState().phase !== 'dead') return;
      this.nameEntry.classList.remove('hidden');
      this.nameInput.focus();
    }, 1200);
  }

  private async submitName(): Promise<void> {
    const name = this.nameInput.value.trim().toUpperCase().slice(0, 12);
    if (!name) { this.skipName(); return; }
    if (isProfane(name.toLowerCase())) {
      this.nameError.textContent = 'NAME NOT ALLOWED';
      this.nameInput.value = '';
      return;
    }
    this.nameError.textContent = '';
    this.nameSubmit.disabled = true;
    try { await this.lb.submit(name, this.pendingScore); this.pendingName = name; } catch { /**/ }
    this.finishName();
    await this.fetchLb(this.pendingScore, this.pendingName);
  }

  private skipName(): void { this.finishName(); }

  private finishName(): void {
    this.nameSubmitted = true;
    this.nameEntry.classList.add('hidden');
    this.nameInput.blur();
    this.ovSub.textContent = 'PRESS ANY KEY TO RESTART';
  }

  private async fetchLb(hs?: number, hn?: string): Promise<void> {
    try {
      const rows = await this.lb.fetchTop(10);
      this.lbRows.innerHTML = '';
      if (rows.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'NO SCORES YET'; li.style.opacity = '0.3';
        this.lbRows.appendChild(li);
      } else {
        rows.forEach((r, i) => {
          const li    = document.createElement('li');
          if (hs !== undefined && r.score === hs && r.name === hn) li.className = 'highlight';
          const rank  = document.createElement('span'); rank.className  = 'lb-rank';  rank.textContent = String(i + 1);
          const name  = document.createElement('span'); name.className  = 'lb-name';  name.textContent = r.name;
          const score = document.createElement('span'); score.className = 'lb-score'; score.textContent = String(r.score);
          li.append(rank, name, score);
          this.lbRows.appendChild(li);
        });
      }
      this.lbEl.classList.remove('hidden');
    } catch { /**/ }
  }

  private showToast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    this.toastEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  private prevPhase = 'start';
  private lastTickTime = 0;
  private readonly TICK_MS = 1000 / 60; // fixed 60 logic-ticks/sec regardless of display Hz

  private loop = (time: number): void => {
    this.rafId = requestAnimationFrame(this.loop);

    if (this.engine.getState().phase === 'playing') {
      const elapsed = time - this.lastTickTime;
      const steps   = Math.floor(elapsed / this.TICK_MS);
      if (steps > 0) {
        this.lastTickTime = time - (elapsed % this.TICK_MS);
        for (let i = 0; i < steps; i++) {
          this.engine.tick();
          const next = this.engine.getState();
          if (next.phase === 'dead' && this.prevPhase === 'playing') {
            this.showDead(next.score);
          }
          this.prevPhase = next.phase;
          if (next.phase !== 'playing') break; // 'respawn' also pauses ticking
        }
      }
    }

    this.renderer.render(this.engine.getState(), time);
  };

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.lb.unsubscribe();
    this.renderer.destroy();
    this.input.destroy();
  }
}
