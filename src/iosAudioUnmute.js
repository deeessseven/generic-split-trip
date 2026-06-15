// Make the game's audio play through the iPhone/iPad hardware mute (orange ring) switch, and
// unlock audio inside the WeChat in-app browser — WITHOUT any media element, so iOS shows no
// "Now Playing" / Dynamic Island indicator.
//
// How:
//   • iOS 16.4+ exposes the Audio Session API. Setting navigator.audioSession.type = 'playback'
//     puts the page's Web Audio in the "playback" category, which keeps playing when the silent
//     switch is on. Because there is NO <audio>/<video> element, iOS shows no media indicator
//     (the bubble / expanded Dynamic Island pill came from a playing <audio> element we used to
//     keep alive — that approach is gone).
//   • Where the API is absent (older iOS), we simply don't override — audio respects the mute
//     switch — and there is still no indicator.
//   • Also keeps the game's AudioContext resumed on gesture / when returning to the foreground,
//     and runs the WeChat JS-bridge unlock (WeChat throttles Web Audio until then). Neither
//     involves a media element.
//
// iOS-only for the mute-switch part; the WeChat unlock runs in WeChat on any platform. No-op on
// plain Android/desktop, so the Capacitor/Android build is unaffected.

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPhoneIPodIPad = /iP(hone|od|ad)/.test(ua);
  // iPadOS 13+ masquerades as desktop Safari ("MacIntel") but has a touch screen.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return iPhoneIPodIPad || iPadOS;
}

let _installed = false;

// getContexts: optional () => (AudioContext | AudioContext[] | null). The game's live audio
// context(s) — resumed on gesture / when the page returns to the foreground.
export function enableIOSAudioThroughMuteSwitch(getContexts) {
  if (_installed) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const ios = isIOS();
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
  if (!ios && !isWeChat) return; // nothing to do on plain Android/desktop
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

  // Put Web Audio in the "playback" category so it ignores the mute switch. No media element →
  // no Now Playing / Dynamic Island indicator. No-op where the Audio Session API doesn't exist.
  const setPlaybackSession = () => {
    try {
      const s = navigator.audioSession;
      if (s && s.type !== 'playback') s.type = 'playback';
    } catch { /* unsupported / blocked → leave default (audio respects the mute switch) */ }
  };

  const sync = () => { setPlaybackSession(); resumeContexts(); };

  if (ios) {
    setPlaybackSession();
    // Re-assert + resume on the user's first gestures (and when returning to the foreground).
    for (const e of ['touchend', 'pointerup', 'mousedown', 'keydown']) {
      document.addEventListener(e, sync, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  }

  if (isWeChat) {
    // WeChat in-app browser (iOS AND Android): Web Audio stays interrupted/silent until WeChat's
    // JS bridge is ready and an invoke runs. getNetworkType is a harmless no-op whose side effect
    // unlocks audio playback. Fires without needing a tap.
    const wechatUnlock = () => {
      const bridge = window.WeixinJSBridge;
      if (!bridge) return;
      try { bridge.invoke('getNetworkType', {}, () => sync()); } catch { sync(); }
    };
    if (window.WeixinJSBridge) wechatUnlock();
    else document.addEventListener('WeixinJSBridgeReady', wechatUnlock, false);
  }
}
