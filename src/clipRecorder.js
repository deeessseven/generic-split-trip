// Rolling gameplay clip recorder — captures the last ~3-6 seconds of a run (plus the crash)
// as a shareable video, with the game title + live score burned in as a watermark.
//
// HOW IT WORKS
//   • A hidden COMPOSITE 2D canvas (~720p) is redrawn from the game canvas on every Phaser
//     POST_RENDER (the only moment a WebGL backbuffer is guaranteed readable without
//     preserveDrawingBuffer). The watermark is drawn on top, so it is baked into the video.
//   • The composite's captureStream() is recorded by TWO alternating MediaRecorders, each
//     restarted every ROT_MS on a stagger — MediaRecorder can't trim, so "the last N seconds"
//     is approximated by always having one recorder that is 1×-2× ROT_MS old. Hardware-encoded,
//     so memory/CPU stay small. MP4 (H.264) is preferred — social apps want it — with WebM fallback.
//   • Audio comes from AudioSystem's record tap (see AudioSystem.getRecordStream): the FULL mix
//     (music + SFX) regardless of the player's Music/Sound toggles — the toggles only mute the
//     speaker path while a capture session is active. The shared clip always has sound.
//   • On a crash, captureCrash() lets the recorder run ~1.2s more (inside GameScene's existing
//     1.5s death delay) so the impact/particles/shake land in frame — with a "TOP 10 · #N!"
//     stamp burned into those final frames when the run provisionally makes the board.
//   • The finished clip lives HERE (module store), not in scene data, so it survives the
//     GameOver → Leaderboard → GameOver round-trip and variant milestone detours. It is
//     cleared when the next run starts.
//
// Every entry point is try/caught: a recording failure can never break gameplay — the feature
// just silently disappears for the session (runtimeOk = false → no replay buttons).

import { AudioSystem } from './AudioSystem.js';
import { GT } from './data/GameText.js';

const ENABLED_KEY = 'doubleflap_replay';   // 'off' disables; anything else = on (default on)
const ROT_MS      = 3000;                  // recorder rotation — oldest is always 3-6s deep
const TAIL_MS     = 1200;                  // post-crash recording (< GameScene's 1.5s delay)
const MAX_W       = 1280;                  // composite width cap (≈720p for a 2:1 canvas)

// (mime, extension) candidates, best first. MP4/H.264 shares cleanly to social apps and is
// supported by Chromium/WebView ≈126+; older WebViews fall back to WebM.
const MIME_CANDIDATES = [
  ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9,opus', 'webm'],
  ['video/webm;codecs=vp8,opus', 'webm'],
  ['video/webm', 'webm'],
];

let session    = null;  // active recording session (one per run)
let latestClip = null;  // { blob, mime, ext } of the last finished capture
let runtimeOk  = true;  // flipped false on any recorder error — feature hides for the session

function pickMime() {
  try {
    for (const [mime, ext] of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
    }
  } catch { /* fall through */ }
  return null;
}

// One-line watermark helpers — white fill over a dark stroke reads on any footage.
function drawTag(ctx, text, x, y, px, align, color = '#ffffff') {
  ctx.font = `bold ${px}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = Math.max(2, Math.round(px / 6));
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function makeRecorder(sess) {
  const rec = { mr: null, chunks: [], startedAt: performance.now() };
  const mr = new MediaRecorder(sess.stream, {
    mimeType: sess.mime,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  });
  mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) rec.chunks.push(e.data); };
  mr.onerror = () => disable();
  mr.start(); // no timeslice — one full blob arrives on stop()
  rec.mr = mr;
  return rec;
}

function stopQuietly(rec) {
  if (!rec || !rec.mr) return;
  try { rec.mr.ondataavailable = null; rec.mr.onstop = null; } catch { /* */ }
  try { if (rec.mr.state !== 'inactive') rec.mr.stop(); } catch { /* */ }
  rec.chunks = [];
}

// Hard-disable for the rest of the session (recorder error): tear down and hide the feature.
function disable() {
  runtimeOk = false;
  teardown(true);
  latestClip = null;
}

// Stop everything belonging to the current session. keepCapture=false also aborts a pending
// post-crash capture (early scene restart); the default preserves it (normal death flow).
function teardown(force = false) {
  const s = session;
  if (!s) return;
  if (s.rotTimer) { clearInterval(s.rotTimer); s.rotTimer = null; }
  if (s.onVis) { document.removeEventListener('visibilitychange', s.onVis); s.onVis = null; }
  if (!s.done || force) {
    // No capture in flight (or forced): stop recorders, stop drawing, release audio.
    for (const r of s.recs) stopQuietly(r);
    s.recs = [];
    detachDraw(s);
    AudioSystem.endCapture();
    session = null;
  }
  // else: a crash capture is pending — finishCapture() completes the teardown.
}

function detachDraw(s) {
  if (s.drawFn && s.game) { try { s.game.events.off('postrender', s.drawFn); } catch { /* */ } }
  s.drawFn = null;
}

export const ClipRecorder = {
  isSupported() {
    try {
      return runtimeOk
        && typeof MediaRecorder !== 'undefined'
        && typeof HTMLCanvasElement !== 'undefined'
        && !!HTMLCanvasElement.prototype.captureStream
        && !!pickMime();
    } catch { return false; }
  },

  enabled() {
    try { return localStorage.getItem(ENABLED_KEY) !== 'off'; } catch { return true; }
  },

  setEnabled(on) {
    try { localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (!on) { teardown(true); latestClip = null; }
  },

  // Begin the rolling capture for a new run. Call from GameScene.create(); cleans itself up on
  // the scene's shutdown. getHud() must return { walls, time } for the live watermark.
  start(scene, getHud) {
    teardown(true);        // a resize-restart mid-run must not leak the old session
    latestClip = null;     // a new run invalidates the previous run's clip
    if (!this.isSupported() || !this.enabled()) return;

    try {
      const gameCanvas = scene.game.canvas;
      const gw = gameCanvas.width, gh = gameCanvas.height;
      if (!gw || !gh) return;

      const picked = pickMime();
      if (!picked) return;

      // Composite canvas: fixed dimensions for the whole session (encoders dislike mid-stream
      // size changes) with even values (required by H.264 4:2:0 chroma subsampling).
      const cw = Math.min(MAX_W, gw) & ~1;
      const ch = Math.round(cw * gh / gw) & ~1;
      const comp = document.createElement('canvas');
      comp.width = cw; comp.height = ch;
      const cctx = comp.getContext('2d');

      // Full-mix audio tap (music + SFX even when the speaker toggles are off) — see AudioSystem.
      AudioSystem.beginCapture();
      const audio = AudioSystem.getRecordStream();
      const stream = comp.captureStream(30);
      if (audio) for (const t of audio.getAudioTracks()) stream.addTrack(t);

      const title = String(GT.gameTitle || '').replace(/\s*\n\s*/g, ' ').trim();
      const s = {
        game: scene.game, getHud, comp, cctx, stream,
        mime: picked.mime, ext: picked.ext,
        recs: [], rotTimer: null, rotNext: 1, drawFn: null, onVis: null,
        rank: null, done: false, capture: null,
      };
      session = s;

      // Per-frame composite: game frame + watermark. Runs on the GAME's postrender so the WebGL
      // backbuffer is still valid; ~one scaled drawImage + 2 text draws per frame.
      s.drawFn = () => {
        try {
          cctx.drawImage(gameCanvas, 0, 0, cw, ch);
          const px = Math.max(12, Math.round(ch * 0.042));
          const m = Math.round(ch * 0.025);
          if (title) drawTag(cctx, title, m, ch - m, px, 'left');
          const hud = getHud();
          if (hud) {
            const t = `${hud.walls} ${GT.scoreUnit} · ${hud.time.toFixed(1)}s`;
            drawTag(cctx, t, cw - m, ch - m, px, 'right');
          }
          if (s.rank) {
            drawTag(cctx, `${GT.replayRankPrefix}${s.rank}!`, cw / 2, Math.round(ch * 0.30),
              Math.round(px * 1.9), 'center', '#ffd54f');
          }
        } catch { /* a draw failure must never break the render loop */ }
      };
      s.game.events.on('postrender', s.drawFn);

      // Two alternating recorders: both start now; every ROT_MS the older one restarts, so the
      // oldest is always ROT_MS-2×ROT_MS deep. On death the older one carries "the last seconds".
      s.recs = [makeRecorder(s), makeRecorder(s)];
      s.rotTimer = setInterval(() => {
        try {
          const idx = s.rotNext; s.rotNext ^= 1;
          stopQuietly(s.recs[idx]);
          s.recs[idx] = makeRecorder(s);
        } catch { disable(); }
      }, ROT_MS);

      // Backgrounding stalls frames but recorder timelines keep running — a clip spanning the
      // pause would open on seconds of frozen frames. Start both recorders over on return.
      s.onVis = () => {
        if (document.hidden || !session || session.done) return;
        try {
          for (let i = 0; i < s.recs.length; i++) { stopQuietly(s.recs[i]); s.recs[i] = makeRecorder(s); }
        } catch { disable(); }
      };
      document.addEventListener('visibilitychange', s.onVis);

      scene.events.once('shutdown', () => { if (session === s) teardown(); });
    } catch {
      disable();
    }
  },

  // Crash: keep recording TAIL_MS more (impact + particles + shake, plus the rank stamp when the
  // run provisionally makes the Top 10), then finalize the older recorder into the stored clip.
  captureCrash(rank) {
    const s = session;
    if (!s || s.done) return;
    s.done = true;
    s.rank = Number.isFinite(rank) && rank >= 1 ? rank : null;
    if (s.rotTimer) { clearInterval(s.rotTimer); s.rotTimer = null; }

    // Keep whichever recorder has the most history; discard the other immediately.
    let rec = null;
    for (const r of s.recs) {
      if (r.mr && r.mr.state === 'recording' && (!rec || r.startedAt < rec.startedAt)) rec = r;
    }
    for (const r of s.recs) if (r !== rec) stopQuietly(r);
    s.recs = rec ? [rec] : [];

    s.capture = new Promise((resolve) => {
      const finish = (clip) => {
        latestClip = clip;
        detachDraw(s);
        for (const r of s.recs) stopQuietly(r); // no-op for the one that just stopped
        s.recs = [];
        if (s.onVis) { document.removeEventListener('visibilitychange', s.onVis); s.onVis = null; }
        AudioSystem.endCapture();
        if (session === s) session = null;
        resolve(clip);
      };
      if (!rec) { finish(null); return; }
      setTimeout(() => {
        try {
          rec.mr.onstop = () => {
            try {
              const blob = new Blob(rec.chunks, { type: s.mime });
              finish(blob.size > 0 ? { blob, mime: s.mime, ext: s.ext } : null);
            } catch { finish(null); }
          };
          rec.mr.stop();
        } catch { finish(null); }
      }, TAIL_MS);
    });
  },

  // The finished clip of the most recent run (null if none / recording off / failed).
  getClip() { return latestClip; },

  // True while a clip exists OR a post-crash capture is still finalizing — lets the game-over
  // panel reserve button space before the (≤ TAIL_MS-later) blob resolves.
  mightHaveClip() { return !!latestClip || !!(session && session.done && session.capture); },

  // Resolves with the clip (or null) once any pending capture settles. Safe to call anytime.
  whenReady() {
    if (session && session.done && session.capture) return session.capture;
    return Promise.resolve(latestClip);
  },
};
