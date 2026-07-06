'use strict';
/* ============ audio.js — Web Audio API procedural sounds & ambient music ============ */
const Sound = {
  ctx: null, master: null, musicT: 0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = Game.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  setVolume(v) { if (this.master) this.master.gain.value = v; },
  tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  },
  noise(dur, vol = 0.2, freq = 800) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  break() { this.noise(0.15, 0.3, 900); },
  place() { this.tone(220, 0.08, 'square', 0.12, -60); },
  hurt() { this.tone(320, 0.25, 'sawtooth', 0.2, -180); },
  mobHurt() { this.tone(260, 0.2, 'square', 0.12, -120); },
  eat() { this.noise(0.1, 0.15, 400); this.tone(500, 0.06, 'square', 0.06); },
  pickup() { this.tone(700, 0.07, 'sine', 0.14, 300); },
  explode() { this.noise(0.9, 0.6, 240); this.tone(60, 0.6, 'sawtooth', 0.25, -30); },
  click() { this.tone(880, 0.03, 'square', 0.06); },
  thunder() { this.noise(1.6, 0.5, 160); },
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'sine', 0.12), i * 90)); },
  ambient(dt, biomeNight) {
    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = 25 + Math.random() * 40;
      if (!this.ctx) return;
      const scale = biomeNight ? [220, 261, 311, 349] : [261, 329, 392, 440, 523];
      let d = 0;
      for (let i = 0; i < 4 + Math.random() * 4; i++) {
        const f = scale[Math.random() * scale.length | 0];
        setTimeout(() => this.tone(f, 1.4, 'sine', 0.05), d);
        d += 500 + Math.random() * 700;
      }
    }
  }
};
