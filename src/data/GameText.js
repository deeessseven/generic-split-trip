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

  // ── Story / variant identity (empty by default — fill in gametext.txt) ────
  heroName:         '',
  heroDescription:  '',
  storyLine1:       '',
  storyLine2:       '',
  storyLine3:       '',
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
}
