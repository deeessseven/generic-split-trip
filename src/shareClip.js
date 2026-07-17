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

  // Native shell → cache file + system share sheet via the Capacitor plugins.
  if (window.Capacitor?.isNativePlatform?.()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const written = await Filesystem.writeFile({
        path: name,
        data: await blobToBase64(clip.blob),
        directory: Directory.Cache,
      });
      await Share.share({ title, files: [written.uri] });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      // fall through to the web paths — better a download than nothing
    }
  }

  // Web share sheet (Android Chrome and other mobile browsers).
  try {
    const file = new File([clip.blob], name, { type: clip.mime });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    // fall through to download
  }

  try { download(clip, name); return 'downloaded'; } catch { return 'failed'; }
}
