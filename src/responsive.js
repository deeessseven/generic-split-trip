// Phaser scenes lay out their content once in create() and don't adapt when the game size
// changes (rotation, fullscreen engaging, address-bar collapse). Call relayoutOnResize(this)
// at the end of a scene's create() so the scene RESTARTS — re-running create() at the new size
// — whenever the game size actually changes. Debounced so a multi-step transition only re-lays
// out once, and cleaned up on shutdown so restarts don't stack listeners.
export function relayoutOnResize(scene) {
  const sizeKey = () => scene.scale.width + 'x' + scene.scale.height;
  const created = sizeKey();
  let timer = null;
  const onResize = () => {
    if (sizeKey() === created) return;          // back to the size we built for — ignore
    if (timer) timer.remove(false);
    timer = scene.time.delayedCall(250, () => { // wait for the size to settle, then re-layout
      if (scene.scene.isActive() && sizeKey() !== created) scene.scene.restart();
    });
  };
  scene.scale.on('resize', onResize);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', onResize);
    if (timer) timer.remove(false);
  });
}
