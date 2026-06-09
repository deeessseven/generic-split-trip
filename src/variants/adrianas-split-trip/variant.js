// adrianas-split-trip — SAME engine, SAME text (gametext.txt), SAME sprites as the base game.
// It differs from base only by the NEW VIEWS you add here. Until you add one, this variant is
// identical to base.
//
// To add a view (e.g. a story screen before gameplay):
//   1. Create ./scenes/StoryScene.js — `export class StoryScene extends Phaser.Scene` with
//      super('StoryScene'). Use relayoutOnResize(this), read GT.* for text, makeButton(...) for
//      buttons (copy SettingsScene as a skeleton). End it with Flow.go(this, 'storyDone').
//   2. Import it here and list it in `scenes`.
//   3. Splice it into the flow via `routes` (see example below).
//
// import { StoryScene } from './scenes/StoryScene.js';
//
export default {
  id: 'adrianas-split-trip',
  scenes: [],   // e.g. [StoryScene]
  routes: {},   // e.g. { play: 'StoryScene', storyDone: 'GameScene' }
};
