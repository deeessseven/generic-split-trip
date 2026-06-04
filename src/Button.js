import { fitText } from './fitText.js';

export function makeButton(scene, x, y, w, h, label, fill, hover, cb, fontSize = '16px') {
  const bg = scene.add.rectangle(x, y, w, h, fill).setInteractive({ useHandCursor: true });
  // Shrink the label to stay inside the button so long custom gametext labels don't spill out.
  fitText(scene.add.text(x, y, label, {
    fontSize, fontFamily: '"Arial Black", Arial', color: '#ffffff',
  }).setOrigin(0.5), w * 0.9, h * 0.8);
  bg.on('pointerover',  () => bg.setFillStyle(hover));
  bg.on('pointerout',   () => bg.setFillStyle(fill));
  bg.on('pointerdown',  () => bg.setFillStyle(hover));
  bg.on('pointerup',    cb);
  return bg;
}
