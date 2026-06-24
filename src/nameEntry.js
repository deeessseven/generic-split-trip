// Name-entry overlay for a qualifying leaderboard run. A real DOM modal (not Phaser text) so the
// native mobile keyboard works — same reasoning as the SettingsScene file <input>.
//
// promptName(defaultName) → Promise<string|null>: resolves with the typed name, or null if the
// player skips/cancels. Caller decides what to do (submit vs. ignore).

import { GT } from './data/GameText.js';

const NAME_MAX = 12;

export function promptName(defaultName = '') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      try { document.body.removeChild(overlay); } catch { /* already gone */ }
      window.removeEventListener('keydown', onKey, true);
      resolve(val);
    };

    // Full-screen dim backdrop.
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.72)',
      'font-family:Arial,Helvetica,sans-serif',
      'padding:16px', 'box-sizing:border-box',
    ].join(';');

    // Card.
    const card = document.createElement('div');
    card.style.cssText = [
      'background:#0d1117', 'border:2px solid #29b6f6', 'border-radius:14px',
      'padding:22px 20px', 'width:min(360px,92vw)', 'box-sizing:border-box',
      'text-align:center', 'box-shadow:0 10px 40px rgba(0,0,0,0.5)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = GT.lbNamePrompt;
    title.style.cssText = 'color:#ffd54f;font-weight:900;font-size:20px;margin-bottom:6px;';

    const sub = document.createElement('div');
    sub.textContent = GT.lbNameSub;
    sub.style.cssText = 'color:#b0bec5;font-size:14px;margin-bottom:14px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = NAME_MAX;
    input.value = defaultName || '';
    input.placeholder = 'Anon';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.style.cssText = [
      'width:100%', 'box-sizing:border-box', 'text-align:center',
      'font-size:22px', 'font-weight:700', 'padding:10px 12px',
      'border-radius:10px', 'border:2px solid #37474f', 'outline:none',
      'background:#161b22', 'color:#ffffff', 'margin-bottom:16px',
    ].join(';');
    input.addEventListener('focus', () => { input.style.borderColor = '#29b6f6'; });
    input.addEventListener('blur',  () => { input.style.borderColor = '#37474f'; });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';

    const mkBtn = (label, bg, color) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        'flex:1', 'cursor:pointer', 'font-size:16px', 'font-weight:700',
        'padding:11px 8px', 'border-radius:10px', 'border:none',
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

    row.appendChild(skipBtn);
    row.appendChild(okBtn);
    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(input);
    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Try to focus (and select) so the keyboard opens. On iOS this may need the player to tap the
    // field (no active gesture after a crash) — the visible field handles that naturally.
    try { input.focus(); input.select(); } catch { /* ignore */ }
  });
}
