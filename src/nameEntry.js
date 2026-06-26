// Name-entry overlay for a qualifying leaderboard run. A real DOM modal (not Phaser text) so the
// native mobile keyboard works — same reasoning as the SettingsScene file <input>.
//
// promptName(defaultName) → Promise<string|null>: resolves with the typed name, or null if the
// player skips/cancels. Caller decides what to do (submit vs. ignore).
//
// Mobile keyboard handling: in landscape the on-screen keyboard covers most of the screen, so the
// card is pinned to the TOP of the *visible* area (the strip above the keyboard) via the
// VisualViewport API, the card is compact, and the overlay scrolls as a last-resort fallback.

import { GT } from './data/GameText.js';

const NAME_MAX = 24;

// At most one prompt on screen at a time. If a new prompt opens (e.g. GameOverScene restarts on a
// resize/orientation change while the box is up), the stale one is closed first so overlays can't
// stack or leak. closeActivePrompt() lets a scene tear it down on shutdown.
let activeClose = null;
export function closeActivePrompt() { if (activeClose) activeClose(); }

export function promptName(defaultName = '') {
  if (activeClose) activeClose(); // close any stale prompt before opening a new one
  return new Promise((resolve) => {
    let done = false;
    const vv = window.visualViewport;
    const finish = (val) => {
      if (done) return;
      done = true;
      if (activeClose === close) activeClose = null;
      try { document.body.removeChild(overlay); } catch { /* already gone */ }
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', fit);
      if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
      resolve(val);
    };
    const close = () => finish(null);
    activeClose = close;

    // Full-screen dim backdrop. overflow-y:auto is the scroll fallback if the card is ever taller
    // than the keyboard-free strip; top/height get reset to the visible area in fit().
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.72)',
      'font-family:Arial,Helvetica,sans-serif',
      'padding:10px', 'box-sizing:border-box',
      'overflow-y:auto', 'overscroll-behavior:contain',
    ].join(';');

    // Card — compact so it fits in the short strip above a landscape keyboard.
    const card = document.createElement('div');
    card.style.cssText = [
      'background:#0d1117', 'border:2px solid #29b6f6', 'border-radius:14px',
      'padding:14px 18px', 'width:min(360px,92vw)', 'box-sizing:border-box',
      'text-align:center', 'box-shadow:0 10px 40px rgba(0,0,0,0.5)', 'flex:0 0 auto',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = GT.lbNamePrompt;
    title.style.cssText = 'color:#ffd54f;font-weight:900;font-size:18px;margin-bottom:4px;';

    const sub = document.createElement('div');
    sub.textContent = GT.lbNameSub;
    sub.style.cssText = 'color:#b0bec5;font-size:13px;margin-bottom:10px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = NAME_MAX;
    input.value = defaultName || '';
    input.placeholder = 'Anon';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.style.cssText = [
      'width:100%', 'box-sizing:border-box', 'text-align:center',
      'font-size:20px', 'font-weight:700', 'padding:8px 12px',
      'border-radius:10px', 'border:2px solid #37474f', 'outline:none',
      'background:#161b22', 'color:#ffffff', 'margin-bottom:10px',
    ].join(';');
    input.addEventListener('focus', () => { input.style.borderColor = '#29b6f6'; });
    input.addEventListener('blur',  () => { input.style.borderColor = '#37474f'; });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';

    const mkBtn = (label, bg, color) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        'flex:1', 'cursor:pointer', 'font-size:15px', 'font-weight:700',
        'padding:10px 8px', 'border-radius:10px', 'border:none',
        `background:${bg}`, `color:${color}`,
      ].join(';');
      return b;
    };
    const skipBtn = mkBtn(GT.lbNameSkip, '#37474f', '#cfd8dc');
    const okBtn = mkBtn(GT.lbNameSubmit, '#29b6f6', '#ffffff');
    skipBtn.addEventListener('click', () => finish(null));
    okBtn.addEventListener('click', () => finish(input.value));

    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    };
    window.addEventListener('keydown', onKey, true);

    // Keep the overlay clamped to the VISIBLE viewport (the area above the keyboard), and pin the
    // card to the top of that area when the keyboard (or any chrome) has shrunk it — otherwise
    // center it. Re-runs whenever the keyboard opens/closes or the viewport scrolls.
    const fit = () => {
      if (done) return;
      const w  = vv ? vv.width      : window.innerWidth;
      const h  = vv ? vv.height     : window.innerHeight;
      const ox = vv ? vv.offsetLeft : 0;
      const oy = vv ? vv.offsetTop  : 0;
      overlay.style.left = ox + 'px';
      overlay.style.top = oy + 'px';
      overlay.style.width = w + 'px';
      overlay.style.height = h + 'px';
      const tight = h < window.innerHeight - 80 || h < 340;
      overlay.style.alignItems = tight ? 'flex-start' : 'center';
    };
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    window.addEventListener('resize', fit);

    row.appendChild(skipBtn);
    row.appendChild(okBtn);
    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(input);
    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    fit();

    // Try to focus (and select) so the keyboard opens. On iOS this may need the player to tap the
    // field (no active gesture after a crash) — the visible field handles that naturally. Re-fit
    // shortly after, since the keyboard animates in and VisualViewport may settle a beat later.
    try { input.focus(); input.select(); } catch { /* ignore */ }
    setTimeout(fit, 150);
    setTimeout(fit, 400);
  });
}
