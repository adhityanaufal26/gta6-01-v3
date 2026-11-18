// Palmera Bay — procedural WebAudio: engine hum, sirens, gunshots, radio loops.
// No audio files anywhere: every sound is synthesized with oscillators and noise.
import { STATIONS, TALK_LINES } from './config.js';

export class SoundBank {
  constructor() {
    this.ctx = null; this.muted = false; this.master = null;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOn = false; this.sirenOsc = null; this.sirenGain = null;
    this.station = 0; this.radioTimer = null; this.radioStep = 0;
    this.radioGain = null; this.talkIdx = 0;
    this.onTalkLine = null; // (line) => void, set by UI
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startEngine(); this._startSiren(); this._startRadio();
    } catch (e) { /* audio unavailable: game stays silent */ }
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
  _startEngine() {
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.03 + speed01 * 0.05 : 0.0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(38 + speed01 * 110, t, 0.08);
  }
  _startSiren() {
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo = this.ctx.createOscillator(); this.sirenLfo.frequency.value = 0.55;
    const lg = this.ctx.createGain(); lg.gain.value = 220;
    this.sirenLfo.connect(lg); lg.connect(this.sirenOsc.frequency); this.sirenLfo.start();
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }
  blip(freq = 880, dur = 0.07, vol = 0.12) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  gunshot() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = this.ctx.createGain(); g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  crash() { this.blip(90, 0.25, 0.25); this.blip(60, 0.3, 0.2); }
  cash() { this.blip(1320, 0.09, 0.12); setTimeout(() => this.blip(1760, 0.12, 0.12), 90); }
  _startRadio() {
    this.radioGain = this.ctx.createGain(); this.radioGain.gain.value = 0.0;
    this.radioGain.connect(this.master);
    this.radioTimer = setInterval(() => this._radioTick(), 60);
  }
  _note(freq, when, dur, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.radioGain); o.start(when); o.stop(when + dur + 0.05);
  }
  _radioTick() {
    if (!this.ctx || this.radioGain.gain.value < 0.01) return;
    const st = STATIONS[this.station];
    if (!st || st.bpm === 0) return; // talk station: no music bed
    const now = this.ctx.currentTime + 0.05;
    const stepDur = 60 / st.bpm / 2; // eighth notes
    const s = this.radioStep++;
    const bassNotes = [1, 1, 1.5, 1, 1, 1.333, 1.5, 1.782];
    const leadScale = [2, 2.378, 2.828, 3.174, 4, 4.757];
    if (s % 2 === 0) this._note(st.root * bassNotes[(s / 2) % 8 | 0], now, stepDur * 1.8, st.wave, 0.16);
    if (s % 4 === 2) this._note(st.root * 2, now, stepDur * 0.9, 'square', 0.05); // hat-ish tick
    if (s % 16 === 8 || s % 16 === 14) {
      const n = leadScale[(s * 7 + 3) % leadScale.length];
      this._note(st.root * n, now, stepDur * 3, 'sine', 0.12);
    }
  }
  setStation(i, inCar) {
    this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    if (!this.ctx) return STATIONS[this.station];
    const t = this.ctx.currentTime;
    this.radioGain.gain.setTargetAtTime(inCar ? 0.16 : 0, t, 0.1);
    if (STATIONS[this.station].id === 'talk' && this.onTalkLine) {
      this.onTalkLine(TALK_LINES[this.talkIdx++ % TALK_LINES.length]);
    }
    return STATIONS[this.station];
  }
  setRadioAudible(inCar) {
    if (!this.ctx) return;
    this.radioGain.gain.setTargetAtTime(inCar ? 0.16 : 0, this.ctx.currentTime, 0.15);
  }
  talkTick() {
    if (STATIONS[this.station].id === 'talk' && this.onTalkLine && Math.random() < 0.25) {
      this.onTalkLine(TALK_LINES[this.talkIdx++ % TALK_LINES.length]);
    }
  }
}
