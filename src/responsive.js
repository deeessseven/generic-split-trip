// Phaser scenes lay out their content once in create() and don't adapt when the game size
// changes (rotation, fullscreen engaging, address-bar collapse). Call relayoutOnResize(this)
// at the end of a scene's create() so the scene RESTARTS — re-running create() at the new size
// — whenever the game size actually changes. Debounced so a multi-step transition only re-lays
// out once, and cleaned up on shutdown so restarts don't stack listeners.
// `canRestart` (optional): a predicate the scene can supply to VETO a restart. Default null =
// always restart (unchanged behavior for the menu/settings/game-over scenes). GameScene passes one
// so it re-fits on the first-launch fullscreen transition but never restarts (and wipes) a run
// that's already underway.
export function relayoutOnResize(scene, canRestart = null) {
  const sizeKey = () => scene.scale.width + 'x' + scene.scale.height;
  const created = sizeKey();
  let timer = null;
  const onResize = () => {
    if (sizeKey() === created) return;          // back to the size we built for — ignore
    if (canRestart && !canRestart()) return;    // scene vetoed (e.g. a run is in progress)
    if (timer) timer.remove(false);
    timer = scene.time.delayedCall(250, () => { // wait for the size to settle, then re-layout
      if (scene.scene.isActive() && sizeKey() !== created && (!canRestart || canRestart())) scene.scene.restart();
    });
  };
  scene.scale.on('resize', onResize);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', onResize);
    if (timer) timer.remove(false);
  });
}
