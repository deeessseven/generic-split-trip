// Procedural audio (Web Audio API) — no asset files.
//  • A cheerful, looping "adventure" theme (I–V–vi–IV in C major).
//  • SFX: jump (rising blip, side-view flap) and shuffle (soft noise tick, top-view move).
//  • Music and SFX can be toggled independently; both persist in localStorage.
// Everything is guarded: if Web Audio is unavailable, all methods no-op safely.

// Note frequencies (Hz)
const N = {
  C2: 65.41, F2: 87.31, G2: 98.00, A2: 110.00,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25,
};

// Four bars: C major, G major, A minor, F major. Each bar = 8 eighth-note lead steps.
const BARS = [
  { bass: 'C2', lead: ['C4', 'E4', 'G4', 'E4', 'C5', 'G4', 'E4', 'G4'] },
  { bass: 'G2', lead: ['D4', 'G4', 'B4', 'G4', 'D5', 'B4', 'G4', 'B4'] },
  { bass: 'A2', lead: ['E4', 'A4', 'C5', 'A4', 'E5', 'C5', 'A4', 'C5'] },
  { bass: 'F2', lead: ['C4', 'F4', 'A4', 'F4', 'C5', 'A4', 'F4', 'A4'] },
];

const BPM = 132;
const EIGHTH = 60 / BPM / 2;   // seconds per eighth note
const STEPS = BARS.length * 8; // 32

export const AudioSystem = {
  ctx: null,
  musicEnabled: true,
  sfxEnabled: true,
  _inited: false,
  _musicOn: false,
  _timer: null,
  _step: 0,
  _nextNoteTime: 0,
  _master: null,
  _musicGain: null,
  _noise: null,

  // Build the audio graph and load saved preferences. Safe to call repeatedly.
  init() {
    if (this._inited) return;
    this._inited = true;
    try {
      this.musicEnabled = localStorage.getItem('splittrip_music') !== 'off';
      this.sfxEnabled   = localStorage.getItem('splittrip_sfx')   !== 'off';
    } catch { /* ignore */ }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this._master = this.ctx.createGain();
        this._master.gain.value = 0.45;
        this._master.connect(this.ctx.destination);
        this._musicGain = this.ctx.createGain();
        this._musicGain.gain.value = 0.5;
        this._musicGain.connect(this._master);
      }
    } catch { this.ctx = null; }
  },

  // Call on a user gesture (audio contexts start suspended until then).
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicEnabled && !this._musicOn) this.startMusic();
  },

  isMusicEnabled() { this.init(); return this.musicEnabled; },
  isSfxEnabled()   { this.init(); return this.sfxEnabled; },

  setMusicEnabled(on) {
    this.init();
    this.musicEnabled = on;
    try { localStorage.setItem('splittrip_music', on ? 'on' : 'off'); } catch { /* ignore */ }
    if (on) this.startMusic(); else this.stopMusic();
  },

  setSfxEnabled(on) {
    this.init();
    this.sfxEnabled = on;
    try { localStorage.setItem('splittrip_sfx', on ? 'on' : 'off'); } catch { /* ignore */ }
  },

  // ── Music loop ──────────────────────────────────────────────────────────────
  startMusic() {
    this.init();
    if (!this.ctx || !this.musicEnabled || this._musicOn) return;
    const begin = () => {
      if (this._musicOn || !this.musicEnabled) return;
      this._musicOn = true;
      this._step = 0;
      this._nextNoteTime = this.ctx.currentTime + 0.1;
      this._timer = setInterval(() => this._tick(), 25);
    };
    if (this.ctx.state === 'running') begin();
    else this.ctx.resume().then(begin).catch(() => {});
  },

  stopMusic() {
    this._musicOn = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  // Scheduler: queue any notes due within the lookahead window.
  _tick() {
    if (!this.ctx || !this._musicOn) return;
    const ahead = 0.12;
    while (this._nextNoteTime < this.ctx.currentTime + ahead) {
      const step = this._step;
      const bar = Math.floor(step / 8);
      const pos = step % 8;
      const b = BARS[bar];
      this._note(N[b.lead[pos]], this._nextNoteTime, 0.18, 'square', 0.10);
      if (pos % 2 === 0) this._note(N[b.bass], this._nextNoteTime, 0.42, 'triangle', 0.16);
      this._nextNoteTime += EIGHTH;
      this._step = (step + 1) % STEPS;
    }
  },

  _note(freq, t, dur, type, gain) {
    if (!freq) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this._musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  // ── SFX (routed past the music gain so the music toggle doesn't affect them) ──
  playJump() {
    if (!this.sfxEnabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g);
    g.connect(this._master);
    o.start(t);
    o.stop(t + 0.18);
  },

  playShuffle() {
    if (!this.sfxEnabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp);
    bp.connect(g);
    g.connect(this._master);
    src.start(t);
    src.stop(t + 0.1);
  },

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const len = Math.floor(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  },
};
