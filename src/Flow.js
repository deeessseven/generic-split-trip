// Centralized scene transitions. Core scenes call `Flow.go(this, intent, data)` instead of
// hardcoding a destination scene, so a variant can splice in NEW views by overriding an intent's
// target — without editing any shared scene. The DEFAULT routes below reproduce the base game's
// flow exactly, so with no variant overrides the behavior is byte-for-byte the current game.
//
// A variant overrides individual intents via its manifest `routes`, e.g. to show a story screen
// before gameplay:
//   routes: { play: 'StoryScene', storyDone: 'GameScene' }
// The PLAY button still calls GameScene.noteNewGame() then Flow.go(this, 'play') → StoryScene,
// and StoryScene ends with Flow.go(this, 'storyDone') → GameScene. (Use a NEW intent like
// 'storyDone' for the continue step — never reuse 'play', which now points at the story screen.)

const DEFAULT_ROUTES = {
  boot:         'MenuScene',     // BootScene, after asset setup
  play:         'GameScene',     // MenuScene PLAY
  gameOver:     'GameOverScene', // GameScene on death (carries { score, time })
  playAgain:    'GameScene',     // GameOverScene PLAY AGAIN
  mainMenu:     'MenuScene',     // GameOverScene MAIN MENU
  settings:     'SettingsScene', // MenuScene settings button
  settingsBack: 'MenuScene',     // SettingsScene BACK
};

let routes = { ...DEFAULT_ROUTES };

export const Flow = {
  // Install a variant's route overrides. Called once at boot from main.js. Unknown/omitted
  // intents fall back to the defaults, so a variant only lists the transitions it changes.
  configure(overrides) { routes = { ...DEFAULT_ROUTES, ...(overrides || {}) }; },

  // Start the scene mapped to `intent`, forwarding optional data (e.g. the game-over payload).
  // A route may be a scene-key STRING, or a FUNCTION (data) => sceneKey for conditional routing
  // (e.g. a variant that only shows a milestone scene when score >= N, else the normal screen).
  // Base uses only string routes, so this is identical to this.scene.start(key, data) for it.
  go(scene, intent, data) {
    let key = routes[intent];
    if (typeof key === 'function') key = key(data);
    if (!key) { console.warn('Flow: unknown intent', intent); return; }
    scene.scene.start(key, data);
  },
};
