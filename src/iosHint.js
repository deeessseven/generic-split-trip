// One-time hint for iOS Safari users browsing in-tab: the ONLY way to get true fullscreen on
// iOS is "Add to Home Screen" — iPhone Safari has no Fullscreen API. Shows a small banner that
// the user can dismiss permanently (×) or that auto-hides after a few seconds. It strictly
// no-ops unless this really is iOS Safari running in-browser, so it never appears on Android,
// desktop, other iOS browsers, or when already launched standalone from the Home Screen.
//
// Safety: the banner itself is pointer-events:none — it can NEVER swallow a game tap. Only the
// small dismiss button opts back into pointer events. So it cannot regress input (Bug 1) or any
// gameplay handler.
import { isIOS } from './platform.js';

export function maybeShowIosInstallHint() {
  try {
    const ua = navigator.userAgent || '';
    if (!isIOS()) return;
    // Other iOS browsers are all WebKit but can't "Add to Home Screen" this way — Safari only.
    if (/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua)) return;
    // Already installed / running standalone → nothing to suggest.
    const standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (standalone) return;
    if (localStorage.getItem('doubleflap_ios_hint') === 'dismissed') return;
  } catch { return; }

  const banner = document.createElement('div');
  banner.setAttribute('role', 'note');
  // pointer-events:none so the banner never blocks a tap meant for the game canvas.
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'justify-content:center', 'gap:6px',
    'padding:calc(6px + env(safe-area-inset-top)) 12px 6px',
    'background:rgba(18,20,34,0.94)', 'color:#e6fbff',
    'font:600 13px/1.3 -apple-system,BlinkMacSystemFont,Arial,sans-serif', 'text-align:center',
    'pointer-events:none', '-webkit-user-select:none', 'user-select:none',
  ].join(';');

  const msg = document.createElement('span');
  msg.textContent = 'For fullscreen: tap Share, then “Add to Home Screen”.';
  msg.style.cssText = 'flex:1;min-width:0';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss');
  // Re-enable pointer events ONLY on the dismiss control.
  close.style.cssText = [
    'flex:none', 'pointer-events:auto', 'background:transparent', 'border:0',
    'color:#9fb4c6', 'font-size:17px', 'line-height:1', 'padding:4px 8px', 'cursor:pointer',
  ].join(';');

  const dismiss = () => {
    try { localStorage.setItem('doubleflap_ios_hint', 'dismissed'); } catch { /* ignore */ }
    banner.remove();
  };
  close.addEventListener('click', dismiss);

  banner.appendChild(msg);
  banner.appendChild(close);
  document.body.appendChild(banner);

  // Auto-hide after a while so it never lingers; this does NOT persist dismissal, so a returning
  // player who never tapped × sees it again next visit (until they install or dismiss it).
  setTimeout(() => { if (banner.isConnected) banner.remove(); }, 10000);
}
