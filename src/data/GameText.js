export const GT = {
  // ── Identity ──────────────────────────────────────────────────────────────
  gameTitle:        'Double Flap',
  gameSubtitle:     'Control two dimensions — survive both views',
  // Auto-generated from gameTitle in applyText() as "© 2026 <Title>"; this is just the fallback.
  copyright:        '© 2026 Double Flap',

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

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  leaderboardTitle: 'LEADERBOARD',
  leaderboardBtn:   'Leaderboard',
  lbLoading:        'Loading…',
  lbEmpty:          'No scores yet — be the first!',
  lbOffline:        'Offline — couldn’t load the leaderboard',
  lbHeaderName:     'NAME',
  lbHeaderWalls:    'WALLS',
  lbHeaderTime:     'TIME',
  lbHeaderDate:     'DATE',
  lbNamePrompt:     'You made the Top 10!',
  lbNameSub:        'Enter a name for the leaderboard:',
  lbNameSubmit:     'Submit',
  lbNameSkip:       'Skip',
  lbNewRank:        'New high score — rank #', // followed by the number
  lbSubmitted:      'Score submitted!',
  lbPendingNote:    'Saved — will post when you’re back online',

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

  // ── Course ──────────────────────────────────────────────────────────────────
  // Obstacle RNG seed — hashed to a fixed sequence of gap positions (deterministic course).
  // Overridable in gametext.txt; change it for a different wall layout.
  seed:             'dacquery',

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
  // Collapse a multi-line gametext title (\n) to a single line for places that need one line.
  const t = (GT.gameTitle || '').replace(/\s*\n\s*/g, ' ').trim();

  // Copyright auto-follows the game's title: "© <year> <Title>". This keeps each variant's menu
  // copyright in sync with its own title — no separate per-game copyright field to maintain.
  if (t) GT.copyright = `© 2026 ${t}`;

  // Reflect the configured title into the browser tab AND the iOS "Add to Home Screen" label.
  if (typeof document !== 'undefined' && t) {
    document.title = t;
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute('content', t);
  }
}
