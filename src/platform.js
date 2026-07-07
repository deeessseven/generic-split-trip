// Shared platform detection. Centralizes the iPhone/iPadOS check that was previously copy-pasted
// (with slight, drift-prone differences) in main.js, iosHint.js and iosAudioUnmute.js.
//
// Returns true for iPhone/iPod/iPad, INCLUDING iPadOS 13+ which masquerades as desktop Safari:
// its UA contains "Macintosh" and navigator.platform is "MacIntel", but it has a touch screen.
// BOTH the UA and the (deprecated) navigator.platform signals are accepted — a union of the three
// old call sites, so no device that was detected before stops being detected, and it stays correct
// if a browser drops navigator.platform. Real desktop Macs report maxTouchPoints 0, so the
// `> 1` gate excludes them; plain Android/Windows/desktop match nothing here.
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iP(hone|od|ad)/.test(ua)) return true;
  const desktopMacUA = /Macintosh/.test(ua) || navigator.platform === 'MacIntel';
  return desktopMacUA && (navigator.maxTouchPoints || 0) > 1;
}
