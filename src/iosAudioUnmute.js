// Make the game's audio play through the iPhone/iPad hardware mute (orange ring) switch, and
// unlock audio inside the WeChat in-app browser.
//
// Why this is needed:
//   iOS routes Web Audio (which is ALL of this game's sound) through the "ambient" audio
//   session by default. The physical mute switch silences that session — so on the web build
//   (GitHub Pages, Safari/home-screen) the music and SFX go silent whenever the orange switch
//   is flipped, even though the in-game audio toggles are ON.
//
//   iOS only switches the page to the "playback" session — the one that IGNORES the mute
//   switch — while a real HTMLMediaElement (an <audio>/<video> tag) is actively playing. So we
//   keep a tiny, truly-silent <audio> clip looping. That holds the playback session open, and
//   the game's Web Audio then stays audible with the mute switch on.
//
// The catch (and why this file also takes the AudioContext):
//   Starting that <audio> element makes iOS reconfigure the audio session, which momentarily
//   SUSPENDS the Web Audio context. The game only resumes its context on a tap, so if the tag
//   suspends it just after a tap was handled, the context can get stuck suspended and NOTHING
//   plays — even with the mute switch OFF. To prevent that, after the holder starts we re-resume
//   the game's context (and keep it resumed while the page is visible).
//
// Scope:
//   • The silent-<audio> holder is iOS-ONLY (only iOS has a mute switch to defeat). No-op on
//     Android/desktop Safari/Chrome, so the Capacitor/Android build is unaffected.
//   • The WeChat bridge unlock runs in the WeChat in-app browser on ANY platform (WeChat
//     throttles Web Audio until its JS bridge fires on Android too).
//   • The clip is digital silence, so nothing is ever actually heard from the tag itself.

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPhoneIPodIPad = /iP(hone|od|ad)/.test(ua);
  // iPadOS 13+ masquerades as desktop Safari ("MacIntel") but has a touch screen.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return iPhoneIPodIPad || iPadOS;
}

// Build ~1s of 16-bit mono 44.1kHz PCM silence and hand back a blob URL. 16-bit/44.1k is the
// most universally decodable WAV format on iOS (an 8-bit/8kHz clip could fail to decode, which
// leaves the audio session in a bad state). Generated at runtime — no asset file.
function makeSilentWavUrl() {
  const sampleRate = 44100;
  const numSamples = sampleRate;          // 1 second
  const dataSize = numSamples * 2;        // 2 bytes per sample (16-bit)
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);              // fmt chunk size
  v.setUint16(20, 1, true);               // PCM
  v.setUint16(22, 1, true);               // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);  // byte rate (sampleRate * blockAlign)
  v.setUint16(32, 2, true);               // block align
  v.setUint16(34, 16, true);              // bits per sample
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  // 16-bit PCM silence is all-zero samples — ArrayBuffer is already zeroed.
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let _installed = false;

// getContexts: optional () => (AudioContext | AudioContext[] | null). The game's live audio
// context(s) — re-resumed after the silent holder starts so iOS's session switch can't leave
// them stuck suspended.
export function enableIOSAudioThroughMuteSwitch(getContexts) {
  if (_installed) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const ios = isIOS();
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
  if (!ios && !isWeChat) return; // nothing to defeat on plain Android/desktop
  _installed = true;

  const resumeContexts = () => {
    if (!getContexts || document.hidden) return;
    let ctxs;
    try { ctxs = getContexts(); } catch { return; }
    if (!ctxs) return;
    for (const ctx of Array.isArray(ctxs) ? ctxs : [ctxs]) {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }
  };

  // The silent looping holder (iOS only). kick() plays it when present and keeps the game's
  // context resumed; it is cheap and idempotent, safe to call on every gesture.
  let tag = null;
  const kick = () => {
    if (tag) { const p = tag.play(); if (p && p.catch) p.catch(() => {}); }
    resumeContexts();
  };

  if (ios) {
    tag = document.createElement('audio');
    tag.setAttribute('playsinline', '');
    tag.setAttribute('webkit-playsinline', '');
    tag.loop = true;
    tag.preload = 'auto';
    tag.volume = 1;                   // content is silence; a muted tag may not flip the session
    tag.controls = false;
    try { tag.disableRemotePlayback = true; } catch { /* not supported everywhere */ }
    tag.src = makeSilentWavUrl();

    // Starting the holder can suspend the game's context; resume it once the holder is actually
    // playing, and again shortly after, so we win the race regardless of iOS's timing.
    tag.addEventListener('playing', () => { resumeContexts(); setTimeout(resumeContexts, 250); });
    // iOS pauses the tag when backgrounded; revive it (and the context) on return. Never fight
    // the OS while still hidden — the game suspends its audio on purpose there.
    tag.addEventListener('pause', () => { if (!document.hidden) kick(); });

    // Web Audio unlock requires a gesture anyway; play the holder in that same gesture.
    for (const e of ['touchend', 'pointerup', 'mousedown', 'keydown']) {
      document.addEventListener(e, kick, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  }

  // WeChat in-app browser (iOS AND Android): Web Audio stays "interrupted"/silent until WeChat's
  // JS bridge is ready and an invoke runs — even with a gesture. The getNetworkType invoke is a
  // harmless no-op whose side effect unlocks audio playback. This is why players opening the game
  // via WeChat can get NO sound at all (independent of the mute switch). Fires without needing a
  // tap, so audio can start as soon as WeChat allows it.
  if (isWeChat) {
    const wechatUnlock = () => {
      const bridge = window.WeixinJSBridge;
      if (!bridge) return;
      try { bridge.invoke('getNetworkType', {}, () => kick()); } catch { kick(); }
    };
    if (window.WeixinJSBridge) wechatUnlock();
    else document.addEventListener('WeixinJSBridgeReady', wechatUnlock, false);
  }
}
