// Procedural sound effects via Web Audio API — no audio files needed
export class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }
    getCtx() {
        if (!this.ctx) {
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.4;
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended')
            this.ctx.resume();
        return this.ctx;
    }
    // ── Eat food: short bright blip, pitch rises with score ─────────────────
    eat(score) {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440 + Math.min(score * 18, 760), t);
        osc.frequency.exponentialRampToValueAtTime(osc.frequency.value * 1.5, t + 0.06);
        env.gain.setValueAtTime(0.3, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(env);
        env.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.13);
    }
    // ── Move tick: noise burst through bandpass, pitch rises with speed ──────
    move(speed = 1.0) {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        const bufLen = Math.floor(ctx.sampleRate * 0.045);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++)
            data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const env = ctx.createGain();
        noise.buffer = buf;
        filter.type = 'bandpass';
        // Pitch shifts from ~110 Hz at ×1.0 up to ~300 Hz at max speed
        filter.frequency.setValueAtTime(Math.min(110 * speed, 300), t);
        filter.Q.value = 9;
        env.gain.setValueAtTime(0.20, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        noise.connect(filter);
        filter.connect(env);
        env.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.045);
    }
    // ── Death: descending noise burst, dramatic ──────────────────────────────
    death() {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 0.8;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++)
            data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        const noiseEnv = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        noise.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.8);
        filter.Q.value = 1.5;
        noiseEnv.gain.setValueAtTime(0.6, t);
        noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        noise.connect(filter);
        filter.connect(noiseEnv);
        noiseEnv.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.85);
        const boom = ctx.createOscillator();
        const boomEnv = ctx.createGain();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(120, t);
        boom.frequency.exponentialRampToValueAtTime(30, t + 0.5);
        boomEnv.gain.setValueAtTime(0.5, t);
        boomEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        boom.connect(boomEnv);
        boomEnv.connect(this.masterGain);
        boom.start(t);
        boom.stop(t + 0.55);
    }
    // ── New high score: ascending 4-note arpeggio ────────────────────────────
    highScore() {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        const notes = [440, 554, 659, 880];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t + i * 0.09);
            env.gain.setValueAtTime(0, t + i * 0.09);
            env.gain.linearRampToValueAtTime(0.18, t + i * 0.09 + 0.01);
            env.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.14);
            osc.connect(env);
            env.connect(this.masterGain);
            osc.start(t + i * 0.09);
            osc.stop(t + i * 0.09 + 0.15);
        });
    }
    // ── Portal warp: quick ascending sweep ──────────────────────────────────
    portal() {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(900, t + 0.14);
        env.gain.setValueAtTime(0.22, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(env);
        env.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }
    // ── Wall hit: hard metallic thud, short and sharp ───────────────────────
    wallHit() {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        // Two detuned metallic oscillators — clang quality
        const freqs = [320, 410];
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.18, t + 0.22);
            env.gain.setValueAtTime(0.0, t);
            env.gain.linearRampToValueAtTime(0.35 - i * 0.08, t + 0.004);
            env.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
            osc.connect(env);
            env.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.28);
        });
        // Thud: low-pass noise punch
        const bufLen = Math.floor(ctx.sampleRate * 0.06);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++)
            data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        const lp = ctx.createBiquadFilter();
        const nEnv = ctx.createGain();
        noise.buffer = buf;
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + 0.06);
        nEnv.gain.setValueAtTime(0.5, t);
        nEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        noise.connect(lp);
        lp.connect(nEnv);
        nEnv.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.07);
    }
    // ── UI: small click for menu interactions ───────────────────────────────
    uiClick() {
        if (this.muted)
            return;
        const ctx = this.getCtx();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
        env.gain.setValueAtTime(0.15, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(env);
        env.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.11);
    }
    setMuted(m) {
        this.muted = m;
        if (this.masterGain) {
            this.masterGain.gain.value = m ? 0 : 0.4;
        }
    }
    get isMuted() { return this.muted; }
}
export const sound = new SoundEngine();
