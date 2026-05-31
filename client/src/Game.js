import { GameEngine } from '@shared/GameEngine';
import { Renderer } from './Renderer';
import { InputHandler } from './InputHandler';
import { sound } from './SoundEngine';
import { Leaderboard } from './Leaderboard';
import { isProfane } from './profanity';
export class Game {
    constructor(container) {
        this.rafId = 0;
        this.lastTime = 0;
        this.accum = 0;
        this.STEP = 1000 / 60; // 60 fps fixed step
        this.phase = 'start';
        this.highScore = 0;
        this.nameShown = false;
        this.nameSubmitted = false;
        this.pendingScore = 0;
        this.pendingName = '';
        this.loop = (time) => {
            this.rafId = requestAnimationFrame(this.loop);
            const dt = Math.min(time - this.lastTime, 50);
            this.lastTime = time;
            if (this.phase === 'playing') {
                this.accum += dt;
                while (this.accum >= this.STEP) {
                    this.accum -= this.STEP;
                    this.engine.tick();
                    const state = this.engine.getState();
                    if (state.phase === 'dead') {
                        this.showDead(state.score);
                        break;
                    }
                }
            }
            const state = this.engine.getState();
            this.renderer.render(state, time);
        };
        this.engine = new GameEngine();
        this.renderer = new Renderer(container);
        this.input = new InputHandler(p => this.engine.setJump(p), p => this.engine.setSlide(p), () => this.onAnyKey());
        this.lb = new Leaderboard((name, score) => {
            this.showToast(`${name}  ${score}`);
        });
        this.lb.subscribe();
        this.overlay = document.getElementById('overlay');
        this.overlayTitle = document.getElementById('overlay-title');
        this.overlayScore = document.getElementById('overlay-score');
        this.overlaySub = document.getElementById('overlay-sub');
        this.nameEntry = document.getElementById('name-entry');
        this.nameInput = document.getElementById('name-input');
        this.nameError = document.getElementById('name-error');
        this.nameSubmit = document.getElementById('name-submit');
        this.lbEl = document.getElementById('leaderboard');
        this.lbRows = document.getElementById('leaderboard-rows');
        this.toastEl = document.getElementById('toast-container');
        this.highScore = parseInt(localStorage.getItem('snake-runner-hs') ?? '0', 10);
        this.nameSubmit.addEventListener('click', () => this.submitName());
        this.nameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                this.submitName();
            }
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.skipName();
            }
        });
        this.showStart();
        this.fetchLb();
        this.rafId = requestAnimationFrame(this.loop);
    }
    onAnyKey() {
        if (!this.nameEntry.classList.contains('hidden'))
            return;
        if (this.phase === 'start') {
            this.startGame();
            return;
        }
        if (this.phase === 'dead' && this.nameSubmitted) {
            this.startGame();
        }
    }
    startGame() {
        this.phase = 'playing';
        this.nameShown = false;
        this.nameSubmitted = false;
        this.pendingScore = 0;
        this.pendingName = '';
        this.nameInput.value = '';
        this.nameError.textContent = '';
        this.nameSubmit.disabled = false;
        this.overlay.classList.add('hidden');
        this.lbEl.classList.add('hidden');
        this.nameEntry.classList.add('hidden');
        this.engine.start();
        sound.uiClick();
    }
    showStart() {
        this.phase = 'start';
        this.overlay.classList.remove('hidden');
        this.overlayTitle.textContent = 'SNAKE RUNNER';
        this.overlayScore.textContent = '';
        this.overlaySub.textContent = 'PRESS ANY KEY TO START';
        this.nameEntry.classList.add('hidden');
    }
    showDead(score) {
        this.phase = 'dead';
        this.pendingScore = score;
        if (score > this.highScore) {
            this.highScore = score;
            localStorage.setItem('snake-runner-hs', String(score));
        }
        this.overlay.classList.remove('hidden');
        this.overlayTitle.textContent = 'GAME OVER';
        this.overlayScore.textContent = String(score);
        this.overlaySub.textContent = '';
        this.nameEntry.classList.add('hidden');
        sound.death();
        this.fetchLb();
        // Show name entry after 1.5 s
        setTimeout(() => {
            if (this.phase !== 'dead')
                return;
            this.nameShown = true;
            this.nameEntry.classList.remove('hidden');
            this.nameInput.focus();
        }, 1500);
    }
    async submitName() {
        const name = this.nameInput.value.trim().toUpperCase().slice(0, 12);
        if (!name) {
            this.skipName();
            return;
        }
        if (isProfane(name.toLowerCase())) {
            this.nameError.textContent = 'NAME NOT ALLOWED';
            this.nameInput.value = '';
            return;
        }
        this.nameError.textContent = '';
        this.nameSubmit.disabled = true;
        try {
            await this.lb.submit(name, this.pendingScore);
            this.pendingName = name;
        }
        catch { /* non-critical */ }
        this.finishName();
        await this.fetchLb(this.pendingScore, this.pendingName);
    }
    skipName() { this.finishName(); }
    finishName() {
        this.nameSubmitted = true;
        this.nameEntry.classList.add('hidden');
        this.nameInput.blur();
        this.overlaySub.textContent = 'PRESS ANY KEY TO RESTART';
    }
    async fetchLb(hs, hn) {
        try {
            const rows = await this.lb.fetchTop(10);
            this.lbRows.innerHTML = '';
            if (rows.length === 0) {
                const li = document.createElement('li');
                li.textContent = 'NO SCORES YET';
                li.style.opacity = '0.3';
                this.lbRows.appendChild(li);
            }
            else {
                rows.forEach((r, i) => {
                    const li = document.createElement('li');
                    if (hs !== undefined && r.score === hs && r.name === hn)
                        li.className = 'highlight';
                    const rank = document.createElement('span');
                    rank.className = 'lb-rank';
                    rank.textContent = String(i + 1);
                    const name = document.createElement('span');
                    name.className = 'lb-name';
                    name.textContent = r.name;
                    const score = document.createElement('span');
                    score.className = 'lb-score';
                    score.textContent = String(r.score);
                    li.append(rank, name, score);
                    this.lbRows.appendChild(li);
                });
            }
            this.lbEl.classList.remove('hidden');
        }
        catch { /* non-critical */ }
    }
    showToast(msg) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        this.toastEl.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }
    destroy() {
        cancelAnimationFrame(this.rafId);
        this.lb.unsubscribe();
        this.renderer.destroy();
        this.input.destroy();
    }
}
