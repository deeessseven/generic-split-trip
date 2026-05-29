export function makeButton(scene, x, y, w, h, label, fill, hover, cb, fontSize = '16px') {
  const bg = scene.add.rectangle(x, y, w, h, fill).setInteractive({ useHandCursor: true });
  scene.add.text(x, y, label, {
    fontSize, fontFamily: '"Arial Black", Arial', color: '#ffffff',
  }).setOrigin(0.5);
  bg.on('pointerover',  () => bg.setFillStyle(hover));
  bg.on('pointerout',   () => bg.setFillStyle(fill));
  bg.on('pointerdown',  () => bg.setFillStyle(hover));
  bg.on('pointerup',    cb);
  return bg;
}
