// Make the game's audio play through the iPhone/iPad hardware mute (orange ring) switch.
//
// Why this is needed:
//   iOS routes Web Audio (which is ALL of this game's sound) through the "ambient" audio
//   session by default. The physical mute switch silences that session — so on the web build
//   (GitHub Pages, Safari/home-screen) the music and SFX go silent whenever the orange switch
//   is flipped, even though the in-game audio toggles are ON.
//
//   iOS only switches the page to the "playback" session — the one that IGNORES the mute
//   switch — while a real HTMLMediaElement (an <audio>/<video> tag) is actively playing. So we
//   keep a tiny, truly-silent <audio> clip looping in the background. That holds the playback
//   session open, and the game's Web Audio then stays audible with the mute switch on.
//
// Notes:
//   • iOS-only. No-op on Android/desktop (those have no such switch and respect Web Audio
//     directly), so the Capacitor/Android build is unaffected.
//   • The clip is digital silence, so nothing is ever actually heard from the tag itself.
//   • Must be (re)started inside a user gesture; we attach our own capture-phase listeners and
//     re-kick it whenever the page returns to the foreground or iOS pauses the tag.

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPhoneIPodIPad = /iP(hone|od|ad)/.test(ua);
  // iPadOS 13+ masquerades as desktop Safari ("MacIntel") but has a touch screen.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return iPhoneIPodIPad || iPadOS;
}

// Build a ~0.05s mono 8-bit PCM WAV of pure silence and hand back a blob URL. Generated at
// runtime so there's no giant base64 blob to embed and no asset file to ship.
function makeSilentWavUrl() {
  const sampleRate = 8000;
  const numSamples = 400;           // ~50ms; loops seamlessly since every sample is silence
  const dataSize = numSamples;      // 1 byte per sample (8-bit)
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);        // fmt chunk size
  v.setUint16(20, 1, true);         // PCM
  v.setUint16(22, 1, true);         // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate, true);// byte rate (sampleRate * blockAlign)
  v.setUint16(32, 1, true);         // block align
  v.setUint16(34, 8, true);         // bits per sample
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) v.setUint8(44 + i, 128); // 128 = silence for unsigned 8-bit
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let _installed = false;

export function enableIOSAudioThroughMuteSwitch() {
  if (_installed) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!isIOS()) return;
  _installed = true;

  const tag = document.createElement('audio');
  tag.setAttribute('playsinline', '');
  tag.setAttribute('webkit-playsinline', '');
  tag.loop = true;
  tag.preload = 'auto';
  tag.volume = 1;                   // content is silence; a muted tag may not flip the session
  tag.controls = false;
  try { tag.disableRemotePlayback = true; } catch { /* not supported everywhere */ }
  tag.src = makeSilentWavUrl();

  const kick = () => { const p = tag.play(); if (p && p.catch) p.catch(() => {}); };

  // Web Audio unlock requires a gesture anyway; play the holder in that same gesture.
  for (const e of ['touchend', 'pointerup', 'mousedown', 'keydown']) {
    document.addEventListener(e, kick, { capture: true, passive: true });
  }
  // iOS pauses the tag when the page is backgrounded; revive it on return so the session
  // (and thus mute-switch override) is restored. Never fight the OS while still hidden.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  tag.addEventListener('pause', () => { if (!document.hidden) kick(); });
}
