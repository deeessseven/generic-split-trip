// The base game: no extra scenes, no route overrides. This is the current base game (Double Flap), unchanged.
export default {
  id: 'base',
  scenes: [],   // extra Phaser.Scene classes registered on top of the core scenes
  routes: {},   // intent → scene-key overrides for Flow (none = default flow)
};
