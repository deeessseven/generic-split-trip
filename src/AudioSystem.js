// Procedural audio (Web Audio API) — no asset files.
//  • A warm, gentle "adventure" theme: soft pad + bass + a melodic lead over an 8-bar
//    loop (I–V–vi–IV in C major). Triangle/sine voices through a lowpass bus with smooth
//    ADSR envelopes — deliberately mellow, not a buzzy chiptune.
//  • SFX: jump (rising blip, side-view flap) and shuffle (soft noise tick, top-view move).
//  • Music and SFX toggle independently and persist in localStorage.
// All guarded: if Web Audio is unavailable, every method no-ops safely.

// Note frequencies (Hz)
const N = {
  C2: 65.41, F2: 87.31, G2: 98.00, A2: 110.00,
  C3: 130.81, D3: 146.83, E3: 164.81,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
};

// Build a song as a flat, beat-sorted event list: { b: startBeat, d: durBeats, f, v }.
// Tempo (bpm) and loop length (beats) live per-track in TRACKS below; songs are in beats.
function buildSong() {
  const ev = [];

  // Pad — sustained chord tones, one event per note (close voicings for smooth changes).
  // Section A (bars 1-8): C G Am F | C G F G.  Section B (bars 9-16): Am F C G | Am F G G.
  const chords = [
    [0,  ['C4', 'E4', 'G4']], [4,  ['D4', 'G4', 'B4']],
    [8,  ['C4', 'E4', 'A4']], [12, ['C4', 'F4', 'A4']],
    [16, ['C4', 'E4', 'G4']], [20, ['D4', 'G4', 'B4']],
    [24, ['C4', 'F4', 'A4']], [28, ['D4', 'G4', 'B4']],
    [32, ['C4', 'E4', 'A4']], [36, ['C4', 'F4', 'A4']],
    [40, ['C4', 'E4', 'G4']], [44, ['D4', 'G4', 'B4']],
    [48, ['C4', 'E4', 'A4']], [52, ['C4', 'F4', 'A4']],
    [56, ['D4', 'G4', 'B4']], [60, ['D4', 'G4', 'B4']],
    // Section C (bars 17-24): F G Am G | F G C G
    [64, ['C4', 'F4', 'A4']], [68, ['D4', 'G4', 'B4']],
    [72, ['C4', 'E4', 'A4']], [76, ['D4', 'G4', 'B4']],
    [80, ['C4', 'F4', 'A4']], [84, ['D4', 'G4', 'B4']],
    [88, ['C4', 'E4', 'G4']], [92, ['D4', 'G4', 'B4']],
  ];
  for (const [b, notes] of chords) for (const f of notes) ev.push({ b, d: 3.8, f, v: 'pad' });

  // Bass — root on beats 1 and 3 of each bar.
  const roots = ['C2', 'G2', 'A2', 'F2', 'C2', 'G2', 'F2', 'G2',
                 'A2', 'F2', 'C2', 'G2', 'A2', 'F2', 'G2', 'G2',
                 'F2', 'G2', 'A2', 'G2', 'F2', 'G2', 'C2', 'G2'];
  roots.forEach((f, i) => {
    ev.push({ b: i * 4,     d: 1.6, f, v: 'bass' });
    ev.push({ b: i * 4 + 2, d: 1.6, f, v: 'bass' });
  });

  // Light off-beat "bounce" (the fifth of each root) on beats 2 and 4 — adds upbeat lift.
  const fifths = ['G2', 'D3', 'E3', 'C3', 'G2', 'D3', 'C3', 'D3',
                  'E3', 'C3', 'G2', 'D3', 'E3', 'C3', 'D3', 'D3',
                  'C3', 'D3', 'E3', 'D3', 'C3', 'D3', 'G2', 'D3'];
  fifths.forEach((f, i) => {
    ev.push({ b: i * 4 + 1, d: 0.6, f, v: 'bounce' });
    ev.push({ b: i * 4 + 3, d: 0.6, f, v: 'bounce' });
  });

  // Lead. Section A (bars 1-8) is the original phrase, UNCHANGED. Section B (bars 9-16) is
  // a new, higher/brighter phrase so the loop is less repetitive (~25s before it repeats).
  const lead = [
    // Section A — original melody (do not change)
    [0, 1, 'E4'], [1, 1, 'G4'], [2, 2, 'C5'],
    [4, 1.5, 'B4'], [5.5, 0.5, 'A4'], [6, 2, 'G4'],
    [8, 1, 'A4'], [9, 1, 'C5'], [10, 2, 'B4'],
    [12, 2, 'A4'], [14, 2, 'G4'],
    [16, 1, 'E4'], [17, 1, 'G4'], [18, 2, 'E5'],
    [20, 1.5, 'D5'], [21.5, 0.5, 'B4'], [22, 2, 'G4'],
    [24, 1, 'A4'], [25, 1, 'C5'], [26, 1, 'F5'], [27, 1, 'C5'],
    [28, 2, 'D5'], [30, 1, 'B4'],
    // Section B — brighter continuation (new)
    [32, 1, 'A4'], [33, 1, 'C5'], [34, 2, 'E5'],
    [36, 1.5, 'F5'], [37.5, 0.5, 'E5'], [38, 2, 'C5'],
    [40, 1, 'G4'], [41, 1, 'C5'], [42, 2, 'E5'],
    [44, 2, 'D5'], [46, 2, 'B4'],
    [48, 1, 'A4'], [49, 1, 'C5'], [50, 2, 'E5'],
    [52, 1.5, 'F5'], [53.5, 0.5, 'E5'], [54, 2, 'C5'],
    [56, 1, 'D5'], [57, 1, 'B4'], [58, 2, 'G4'],
    [60, 2, 'D5'], [62, 2, 'G4'],
    // Section C — descending-then-rising contrast (new)
    [64, 1, 'C5'], [65, 1, 'A4'], [66, 2, 'F4'],
    [68, 1, 'D5'], [69, 1, 'B4'], [70, 2, 'G4'],
    [72, 1.5, 'E5'], [73.5, 0.5, 'C5'], [74, 2, 'A4'],
    [76, 2, 'D5'], [78, 2, 'B4'],
    [80, 1, 'C5'], [81, 1, 'F5'], [82, 2, 'A4'],
    [84, 1, 'B4'], [85, 1, 'D5'], [86, 2, 'G4'],
    [88, 1, 'C5'], [89, 1, 'E5'], [90, 2, 'G4'],
    [92, 2, 'D5'], [94, 2, 'G4'],
  ];
  for (const [b, d, f] of lead) ev.push({ b, d, f, v: 'lead' });

  ev.sort((a, b) => a.b - b.b);
  return ev;
}

// Menu theme — slow and happy: gentle major progression (C F C G | C F G C), longer notes,
// no off-beat drive. Written in beats; plays at the menu tempo defined in TRACKS.
function buildMenuSong() {
  const ev = [];
  const chords = [
    [0,  ['C4', 'E4', 'G4']], [4,  ['C4', 'F4', 'A4']], [8,  ['C4', 'E4', 'G4']], [12, ['D4', 'G4', 'B4']],
    [16, ['C4', 'E4', 'G4']], [20, ['C4', 'F4', 'A4']], [24, ['D4', 'G4', 'B4']], [28, ['C4', 'E4', 'G4']],
  ];
  for (const [b, notes] of chords) for (const f of notes) ev.push({ b, d: 3.9, f, v: 'pad' });
  ['C2', 'F2', 'C2', 'G2', 'C2', 'F2', 'G2', 'C2'].forEach((f, i) => ev.push({ b: i * 4, d: 3.6, f, v: 'bass' }));
  const lead = [
    [0, 2, 'G4'], [2, 2, 'E4'], [4, 2, 'A4'], [6, 2, 'F4'], [8, 2, 'G4'], [10, 2, 'C5'],
    [12, 2, 'B4'], [14, 2, 'D5'], [16, 2, 'C5'], [18, 2, 'G4'], [20, 2, 'A4'], [22, 2, 'F4'],
    [24, 2, 'G4'], [26, 2, 'B4'], [28, 4, 'C5'],
  ];
  for (const [b, d, f] of lead) ev.push({ b, d, f, v: 'lead' });
  ev.sort((a, b) => a.b - b.b);
  return ev;
}

// Per-track tempo (bpm) and loop length (beats). Songs themselves are written in beats.
const TRACKS = {
  game: { song: buildSong(),     bpm: 200, loopBeats: 96 }, // upbeat A+B+C gameplay theme
  menu: { song: buildMenuSong(), bpm: 96,  loopBeats: 32 }, // slow, happy menu theme
};

export const AudioSystem = {
  ctx: null,
  musicEnabled: true,
  sfxEnabled: true,
  _inited: false,
  _musicOn: false,
  _timer: null,
  _evIdx: 0,
  _loopStart: 0,
  _trackName: null, // 'game' | 'menu' — the currently selected track
  _song: null,
  _beat: 0.3,
  _loopBeats: 96,
  _master: null,
  _musicGain: null,
  _musicLP: null,
  _noise: null,
  _gameOverVoices: null,
  _musicVoices: null, // voices of the current loop, so a stop/toggle can hard-cut them

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
        this._master.gain.value = 0.5;
        this._master.connect(this.ctx.destination);
        // Music bus: gain -> gentle lowpass (warmth, tames harsh harmonics) -> master.
        this._musicGain = this.ctx.createGain();
        this._musicGain.gain.value = 0.4;
        this._musicLP = this.ctx.createBiquadFilter();
        this._musicLP.type = 'lowpass';
        this._musicLP.frequency.value = 4200;
        this._musicLP.Q.value = 0.6;
        this._musicGain.connect(this._musicLP);
        this._musicLP.connect(this._master);
        // Defense: if the browser/OS auto-resumes the context while the page is hidden
        // (common on screen lock / backgrounding), force it back to suspended + muted so
        // audio can't leak out.
        this.ctx.onstatechange = () => {
          if (this.ctx && this.ctx.state === 'running' &&
              typeof document !== 'undefined' && document.hidden) {
            this.stopMusic();
            if (this._master) this._master.gain.value = 0;
            this.ctx.suspend().catch(() => {});
          }
        };
      }
    } catch { this.ctx = null; }
  },

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicEnabled && !this._musicOn) this.startMusic();
  },

  isMusicEnabled() { this.init(); return this.musicEnabled; },
  isSfxEnabled()   { this.init(); return this.sfxEnabled; },

  // Called when the page is hidden/blurred/minimized/screen-locked: halt the music loop
  // and suspend the whole context so nothing plays in the background.
  pauseForBackground() {
    this.stopMusic();
    this.stopGameOver();
    if (this._master) this._master.gain.value = 0; // hard-mute even if suspend is ignored
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  },

  // Called when the page becomes visible/focused again: resume and restart music if on.
  resumeFromBackground() {
    if (!this.ctx) return;
    if (typeof document !== 'undefined' && document.hidden) return; // still hidden — stay paused
    if (this._master) this._master.gain.value = 0.5;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicEnabled) this.startMusic();
  },

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
  // Start (or switch to) a track: 'game' or 'menu'. Omit `which` to (re)start the current
  // track — used by unlock/resume so they don't change which theme is playing.
  startMusic(which) {
    this.init();
    this.stopGameOver(); // any restart hard-cuts the game-over tune
    const track = which || this._trackName || 'menu';
    if (!this.ctx || !this.musicEnabled) { this._trackName = track; return; }
    if (this._musicOn && this._trackName === track) return; // already playing this track
    this.stopMusic();
    this._trackName = track;
    const cfg = TRACKS[track] || TRACKS.game;
    this._song = cfg.song;
    this._beat = 60 / cfg.bpm;
    this._loopBeats = cfg.loopBeats;
    const begin = () => {
      if (!this.musicEnabled || this._trackName !== track) return; // switched while resuming
      this._musicOn = true;
      this._evIdx = 0;
      this._loopStart = this.ctx.currentTime + 0.15;
      this._timer = setInterval(() => this._tick(), 25);
    };
    if (this.ctx.state === 'running') begin();
    else this.ctx.resume().then(begin).catch(() => {});
  },

  stopMusic() {
    this._musicOn = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // Hard-cut every note currently sounding/scheduled. Long menu pads ring for ~2s, so
    // just stopping the scheduler isn't enough — disconnect each voice from the bus so the
    // music goes silent the instant it's toggled off (and cleanly between track switches).
    if (this._musicVoices) {
      for (const v of this._musicVoices) {
        try { v.g.gain.cancelScheduledValues(0); v.g.gain.value = 0; } catch { /* */ }
        try { v.g.disconnect(); } catch { /* */ }
        try { v.o.stop(); } catch { /* not started yet */ }
      }
      this._musicVoices = null;
    }
  },

  // Schedule any events due within the lookahead window, looping at LOOP_BEATS.
  _tick() {
    if (!this.ctx || !this._musicOn || !this._song) return;
    if (typeof document !== 'undefined' && document.hidden) return; // never schedule while hidden
    const ahead = 0.2;
    let guard = 0;
    while (guard++ < 256) {
      const ev = this._song[this._evIdx];
      const evTime = this._loopStart + ev.b * this._beat;
      if (evTime >= this.ctx.currentTime + ahead) break;
      this._playEvent(ev, evTime);
      this._evIdx++;
      if (this._evIdx >= this._song.length) {
        this._evIdx = 0;
        this._loopStart += this._loopBeats * this._beat;
      }
    }
  },

  _playEvent(ev, t) {
    const freq = N[ev.f];
    if (!freq) return;
    const d = ev.d * this._beat;
    let v;
    if (ev.v === 'pad')         v = this._voice(freq, t, d, 'triangle', 0.045, 0.12, 0.45);
    else if (ev.v === 'bass')   v = this._voice(freq, t, d, 'sine',     0.12,  0.01, 0.12);
    else if (ev.v === 'bounce') v = this._voice(freq, t, d, 'triangle', 0.06,  0.01, 0.08);
    else                        v = this._voice(freq, t, d, 'triangle', 0.12,  0.02, 0.14);
    // Track so a toggle/stop can hard-cut it; prune finished notes so the list stays small.
    if (!this._musicVoices) this._musicVoices = [];
    this._musicVoices.push(v);
    if (this._musicVoices.length > 80) {
      const now = this.ctx.currentTime;
      this._musicVoices = this._musicVoices.filter((x) => (x.endAt || 0) > now);
    }
  },

  // One enveloped note (attack / hold / release) into the music bus.
  _voice(freq, t, dur, type, peak, attack, release) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const rel = Math.min(release, dur * 0.5);
    const holdEnd = Math.max(t + attack, t + dur - rel);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, holdEnd);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this._musicGain);
    o.start(t);
    o.stop(t + dur + 0.03);
    return { o, g, endAt: t + dur + 0.03 };
  },

  // ── SFX (routed past the music bus so the music toggle doesn't affect them) ──
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
    g.gain.linearRampToValueAtTime(0.08, t + 0.01); // 50% quieter than before
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g);
    g.connect(this._master);
    o.start(t);
    o.stop(t + 0.18);
  },

  // Wind whoosh — looped noise band-limited to low frequencies (highpass to cut rumble,
  // lowpass swept in a LOW range to cut the harsh highs that sound like a rattle), with a
  // soft attack/decay. Triggered by top-view horizontal motion.
  playShuffle() {
    if (!this.sfxEnabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1150, t + 0.16);
    lp.frequency.linearRampToValueAtTime(420, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.09);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this._master);
    src.start(t);
    src.stop(t + 0.42);
  },

  // Collision/death impact: a low filtered-noise thud layered with a descending tone.
  playCrash() {
    if (!this.sfxEnabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;

    // Thud — looped noise through a lowpass that sweeps down.
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.3, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(lp); lp.connect(ng); ng.connect(this._master);
    src.start(t); src.stop(t + 0.42);

    // Descending tone for a "fail" impact.
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.35);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.16, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(og); og.connect(this._master);
    o.start(t); o.stop(t + 0.4);
  },

  // Short, non-repeating "sad" melody for the game-over screen. Stops the looping theme
  // first so they don't overlap. Gated on the music toggle (it's a tune, not an SFX).
  playGameOver() {
    this.init();
    if (!this.ctx || !this.musicEnabled) return;
    this.stopMusic();
    this.stopGameOver();        // clear any previous tune
    this._gameOverVoices = [];  // collect this tune's voices so a restart can hard-cut them
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime + 0.05;
    const add = (...args) => this._gameOverVoices.push(this._voice(...args));

    // Descending A-minor lament (lead).
    const lead = [
      [0.0, 0.5, 'A4'], [0.5, 0.5, 'G4'], [1.0, 0.5, 'F4'], [1.5, 1.0, 'E4'],
      [2.5, 0.5, 'D4'], [3.0, 0.5, 'C4'], [3.5, 0.5, 'D4'], [4.0, 1.6, 'C4'],
    ];
    for (const [bt, d, f] of lead) add(N[f], t + bt, d, 'triangle', 0.13, 0.03, 0.22);

    // Sustained minor pad (Am → F) + low bass underneath.
    const pad = [[0.0, 2.5, ['C4', 'E4', 'A4']], [2.5, 3.1, ['C4', 'F4', 'A4']]];
    for (const [bt, d, notes] of pad) for (const f of notes) add(N[f], t + bt, d, 'triangle', 0.04, 0.2, 0.5);
    add(N.A2, t,       2.5, 'sine', 0.11, 0.02, 0.4);
    add(N.F2, t + 2.5, 3.1, 'sine', 0.11, 0.02, 0.4);
  },

  // Hard-cut the game-over tune (called on restart / background). Disconnecting each voice
  // from the bus gives instant, total silence — including notes scheduled to start LATER in
  // the tune, which a gain-ramp/stop alone doesn't reliably mute on a running context.
  stopGameOver() {
    if (!this._gameOverVoices) { this._gameOverVoices = null; return; }
    for (const v of this._gameOverVoices) {
      try { v.g.gain.cancelScheduledValues(0); v.g.gain.value = 0; } catch { /* */ }
      try { v.g.disconnect(); } catch { /* */ } // sever from the music bus → silent now
      try { v.o.stop(); } catch { /* not started yet */ }
    }
    this._gameOverVoices = null;
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
