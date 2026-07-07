// jd — Jackie & David's anniversary edition. Same engine + sprites as the base game; adds
// two celebration views. All their text lives in this variant's gametext.txt (variants/
// jd/gametext.txt), which is appended onto the base gametext at build time. The
// base game registers none of this and is unaffected.
import { GT } from '../../data/GameText.js';
import { CelebrationScene } from '../shared/scenes/CelebrationScene.js';
import { MilestoneCelebrationScene } from '../shared/scenes/MilestoneCelebrationScene.js';

export default {
  id: 'jd',
  scenes: [CelebrationScene, MilestoneCelebrationScene],
  routes: {
    // View 1: PLAY (from the title menu only) → birthday celebration → tap → the game.
    // PLAY AGAIN keeps the default (straight to GameScene), so it skips the intro celebration.
    play: 'CelebrationScene',
    startGame: 'GameScene',

    // View 2: on a crash, show the milestone celebration ONLY if this run passed >= celebN walls;
    // otherwise the normal Game Over screen. The data ({ score, time }) flows through either way.
    gameOver: (data) => {
      const n = parseInt(GT.celebN, 10);
      return data && Number.isFinite(n) && data.score >= n
        ? 'MilestoneCelebrationScene'
        : 'GameOverScene';
    },
    // The milestone's "tap to continue" → the normal Game Over screen (carrying the score).
    afterMilestone: 'GameOverScene',
  },
};
