// Share a recorded replay clip (see clipRecorder.js) via the best channel the platform has:
//   • Native app (Capacitor): write to the app cache + open the Android/iOS SYSTEM SHARE SHEET
//     with the video attached — WhatsApp/Instagram/TikTok/etc. all appear there. The two plugins
//     are dynamically imported so the web bundle only loads them inside the native shell.
//   • Mobile web: navigator.share({ files }) — the same system share sheet.
//   • Desktop / anything else: download the file.
// Returns 'shared' | 'downloaded' | 'cancelled' | 'failed' (callers may ignore it).

import { GT } from './data/GameText.js';

function fileName(ext) {
  const t = String(GT.gameTitle || '').replace(/\s*\n\s*/g, ' ').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${t || 'replay'}-replay.${ext}`;
}

function isCancel(e) {
  const s = `${e?.name || ''} ${e?.message || ''}`.toLowerCase();
  return s.includes('abort') || s.includes('cancel') || s.includes('dismiss');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || ''); // strip the data: prefix
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// The last failure, as "step: message" — surfaced in the game-over toast so a failure on the
// native app diagnoses itself on screen (no USB debugging available on David's setup).
let lastError = null;
export function getLastShareError() { return lastError; }

function noteError(step, e) {
  lastError = `${step}: ${e?.message || e?.errorMessage || e || 'unknown'}`.slice(0, 120);
  console.error(`[shareClip] ${step} failed:`, e);
}

// Write the clip into the app cache in slices — one writeFile per ~0.75 MB. A single
// multi-MB base64 string through the JS→native bridge is the most fragile link in the native
// share chain; slices keep each bridge message small and peak memory flat. CHUNK is a multiple
// of 3 so each slice base64-encodes independently and plain concatenation is valid.
const CHUNK = 768 * 1024;
async function writeClipToCache(Filesystem, Directory, blob, name) {
  let uri = null;
  for (let off = 0; off < blob.size; off += CHUNK) {
    const data = await blobToBase64(blob.slice(off, off + CHUNK));
    const opts = { path: name, data, directory: Directory.Cache };
    if (off === 0) uri = (await Filesystem.writeFile(opts)).uri;
    else await Filesystem.appendFile(opts);
  }
  if (!uri) throw new Error('empty clip');
  return uri;
}

function download(clip, name) {
  const url = URL.createObjectURL(clip.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // after the download has started
}

export async function shareClip(clip) {
  if (!clip || !clip.blob) return 'failed';
  const name = fileName(clip.ext);
  const title = String(GT.gameTitle || '').replace(/\s*\n\s*/g, ' ').trim();

  // Native shell → cache file + system share sheet via the Capacitor plugins. The web paths
  // below are dead ends inside the WebView (no navigator.share; the download anchor is a
  // no-op), so each step fails HARD here — recorded via noteError so the UI can say why.
  if (window.Capacitor?.isNativePlatform?.()) {
    lastError = null;
    let Filesystem, Directory, Share;
    try {
      [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
    } catch (e) { noteError('import', e); return 'failed'; }
    let uri;
    try {
      uri = await writeClipToCache(Filesystem, Directory, clip.blob, name);
    } catch (e) { noteError('write', e); return 'failed'; }
    try {
      await Share.share({ title, files: [uri] });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      // Retry once with the officially-documented single-file shape before giving up.
      try {
        await Share.share({ title, url: uri });
        return 'shared';
      } catch (e2) {
        if (isCancel(e2)) return 'cancelled';
        noteError('share', e2);
        return 'failed';
      }
    }
  }

  // Web share sheet (Android Chrome and other mobile browsers). The File must carry the PLAIN
  // container type — canShare() rejects a MIME with codec parameters (e.g. "video/mp4;codecs=…"),
  // which silently demoted every share to the download fallback.
  try {
    const plainMime = (clip.mime || '').split(';')[0].trim() || 'video/mp4';
    const file = new File([clip.blob], name, { type: plainMime });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    // fall through to download
  }

  // The download anchor is a silent no-op inside the native WebView (no download handler is
  // wired) — report failure there so callers can toast instead of pretending it worked.
  if (window.Capacitor?.isNativePlatform?.()) return 'failed';
  try { download(clip, name); return 'downloaded'; } catch { return 'failed'; }
}

// Share the GAME itself (title-screen button): system share sheet with a message + link —
// gametext's shareUrl (the Play Store for base Double Flap) or the page's own URL. Where no
// share sheet exists (desktop), copy the message to the clipboard instead.
// Returns 'shared' | 'copied' | 'cancelled' | 'failed'.
export async function shareGame() {
  const title = String(GT.gameTitle || '').replace(/\s*\n\s*/g, ' ').trim();
  const url = String(GT.shareUrl || '').trim()
    || (typeof location !== 'undefined' ? location.href : '');
  const text = `Play ${title}!`;

  if (window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      // fall through to the web paths
    }
  }

  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    // fall through to clipboard
  }

  try { await navigator.clipboard.writeText(`${text} ${url}`); return 'copied'; } catch { /* */ }
  return 'failed';
}
