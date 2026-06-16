export const GT = {
  // ── Identity ──────────────────────────────────────────────────────────────
  gameTitle:        'SPLIT TRIP',
  gameSubtitle:     'Control two dimensions — survive both views',
  copyright:        '© 2026 Split Trip',

  // ── Menu tips ─────────────────────────────────────────────────────────────
  tipLeftLabel:     'LEFT PANEL',
  tipLeftDesc:      '←→ Drag finger left/right to steer (top-down view)',
  tipRightLabel:    'RIGHT PANEL',
  tipRightDesc:     'Tap to fly up — release and you fall (side view)',
  tipSurviveLabel:  'SURVIVE',
  tipSurviveDesc:   'Go through the gaps in both panels',

  // ── In-game labels ────────────────────────────────────────────────────────
  labelTopView:     'TOP VIEW',
  labelTopHint:     '← drag →',
  labelSideView:    'SIDE VIEW',
  labelSideHint:    'tap to rise',
  hintSteer:        '↔ Drag to steer',
  hintRise:         'Tap to rise ↑',

  // ── Score ─────────────────────────────────────────────────────────────────
  scoreUnit:        'walls',
  scoreBest:        'Best',
  scoreSurvived:    's survived',

  // ── Game Over ─────────────────────────────────────────────────────────────
  gameOverTitle:    'GAME OVER',
  btnPlayAgain:     'PLAY AGAIN',
  btnMainMenu:      'MAIN MENU',

  // ── Settings ──────────────────────────────────────────────────────────────
  // Toggle for the "Customize Sprites" button (main menu) AND its upload page (SettingsScene).
  // 'true' shows the button and lets players open the page to upload custom image sprites;
  // 'false' hides the button and disables the page. Flip this in a game's gametext.txt to easily
  // enable/disable custom sprite uploads.
  showCustomizeSprites: 'false',
  settingsTitle:    'CUSTOMIZE SPRITES',
  settingsSubtitle: 'Tap to upload a custom image — tap [reset] to restore default',
  slotCharTop:      'Character\nTop View',
  slotCharSide:     'Character\nSide View',
  slotBgTop:        'Background\nTop View',
  slotBgSide:       'Background\nSide View',
  slotObstacle:     'Obstacle\nTexture',
  slotHitMark:      'Collision\nMark', // "Collision Mark" === HIT_MARK sprite (preferred 32×32)
  btnBack:          'BACK',
  toastSpriteSaved: 'Sprite saved! It will apply next game.',
  toastUploadError: 'Could not read that image — try another file.',

  // ── Story / variant identity (empty by default — fill in gametext.txt) ────
  heroName:         '',
  heroDescription:  '',
  storyLine1:       '',
  storyLine2:       '',
  storyLine3:       '',

  // ── Celebration scenes (variant-only; empty in base, filled by a variant's gametext.txt) ──
  // View 1 — shown after PLAY, before gameplay.
  celebTitle:       '',
  celebMsg1:        '',
  celebMsg2:        '',
  celebMsg3:        '',
  celebTapStart:    '',
  // View 2 — shown after a crash IF walls passed >= celebN. Lines may use the tokens
  // {N} {Nth} {walls} {seconds}: N=celebN, Nth=celebNth, walls=this run's walls, seconds=survived.
  celebN:           '',  // number, e.g. "13" — also the crash threshold
  celebNth:         '',  // ordinal, e.g. "13th"
  milestoneTitle:   '',
  milestoneMsg1:    '',
  milestoneMsg2:    '',
  milestoneTapContinue: '',

  // ── Flap puff ("cloud") placement ───────────────────────────────────────────
  // Where the soft white flap puff appears, per view. Stored as strings; parsed to ints.
  cloudTopPos:      '8',  // 1..9 grid over the top-view hero: 1-3 front, 4-6 middle, 7-9 back; cols L/C/R. 5=center, 8=back-center (default)
  cloudSidePos:     '2',  // 1..5 across the side-view hero's width: 1=left, 3=center, 5=right

  // ── Debug ─────────────────────────────────────────────────────────────────
  debugOutline:     'false',  // 'true' draws the collision silhouette over sprites (per variant)
};

export function applyText(raw) {
  if (!raw) return;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    // Own-property check only, so inherited names (toString, constructor, ...) can't be clobbered.
    if (Object.prototype.hasOwnProperty.call(GT, key)) GT[key] = val.replace(/\\n/g, '\n');
  }
  // Reflect the configured title into the browser tab AND the iOS "Add to Home Screen" label.
  // gametext may use \n for an in-game two-line title; collapse to one line for these.
  if (typeof document !== 'undefined' && GT.gameTitle) {
    const t = GT.gameTitle.replace(/\s*\n\s*/g, ' ').trim();
    document.title = t;
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute('content', t);
  }
}
