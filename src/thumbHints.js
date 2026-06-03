// Animated gesture-hint thumbs, shared by the menu (persistent demo) and the first few
// gameplay starts (timed overlay). A shaded emoji-yellow thumb (skin gradient, fingernail,
// knuckle creases) drawn once to the 'thumb_hint' texture; then two animated copies:
//   • LEFT  (mirrored) slides L/R   → top-down steer
//   • RIGHT taps up/down, 20% larger at its lifted peak (depth) → side-view rise
// Each has a tinted cast shadow; the right shadow grows/softens when lifted and tightens/
// darkens when pressed.

// Build (or rebuild) the 'thumb_hint' canvas texture in the given scene's texture manager.
export function buildThumbTexture(scene) {
  const thumbKey = 'thumb_hint';
  if (scene.textures.exists(thumbKey)) scene.textures.remove(thumbKey);
  const CW = 224, CH = 224;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const x = c.getContext('2d');
  const mx = 112, w = 200, r = w / 2, top = 18, bottom = CH; // wide+short; tip up, flat bottom at edge
  x.beginPath();
  x.moveTo(mx - r, bottom);
  x.lineTo(mx - r, top + r);
  x.arc(mx, top + r, r, Math.PI, 0, false); // round tip
  x.lineTo(mx + r, bottom);
  x.closePath();
  const g = x.createLinearGradient(mx - r, 0, mx + r, 0); // emoji-yellow skin
  g.addColorStop(0, '#ffe082'); g.addColorStop(0.55, '#ffcb4d'); g.addColorStop(1, '#f2a93b');
  x.fillStyle = g;
  x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 6; x.shadowOffsetX = 3;
  x.fill();
  x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetX = 0;
  x.lineWidth = 5; x.strokeStyle = 'rgba(150,95,20,0.5)'; x.stroke();
  // fingernail: larger, its top arch CONCENTRIC with the thumb tip (matching curvature, a
  // 16px skin margin inside), closed by a base line. Subtle gradient fill.
  const nr = 80, ncy = top + r, nBot = 162; // ncy = thumb-tip center → matching curvature (nail −5%)
  x.beginPath();
  x.moveTo(mx - nr, nBot);
  x.lineTo(mx - nr, ncy);
  x.arc(mx, ncy, nr, Math.PI, 0, false);
  x.lineTo(mx + nr, nBot);
  x.closePath();
  const ng = x.createLinearGradient(mx - nr, 0, mx + nr, 0);
  ng.addColorStop(0, '#fffdf2'); ng.addColorStop(0.55, '#fff0c8'); ng.addColorStop(1, '#f3d79a');
  x.fillStyle = ng; x.fill();
  x.lineWidth = 3; x.strokeStyle = 'rgba(150,100,30,0.55)'; x.stroke();
  // knuckle creases across the body (below the nail)
  x.lineWidth = 4; x.strokeStyle = 'rgba(150,100,30,0.38)';
  x.beginPath(); x.moveTo(mx - 80, 188); x.quadraticCurveTo(mx, 204, mx + 80, 188); x.stroke();
  x.beginPath(); x.moveTo(mx - 78, 210); x.quadraticCurveTo(mx, 224, mx + 78, 210); x.stroke();
  scene.textures.addCanvas(thumbKey, c);
}

// Create the two animated thumbs (+ shadows) centered on leftX / rightX, bottoms flush to the
// screen edge. `s` is the UI scale, W/H the panel size, depthHand/depthShadow the render depths.
// Returns the four objects (and an `objs` array) so the caller can later fade/destroy them.
export function addThumbHints(scene, { leftX, rightX, s, W, H, depthHand, depthShadow }) {
  const key = 'thumb_hint';
  const thumbW = Math.round(88 * s), thumbH = Math.round(86 * s);
  const baseY = H - thumbH / 2;             // image bottom flush with the screen's bottom edge
  const slideAmp = Math.round(W * 0.06);
  const tapAmp = Math.round(28 * s);
  const shDX = Math.round(14 * s), shDY = Math.round(7 * s); // shadow offset (light from upper-left)
  const ease = 'Sine.easeInOut';

  // Left hand (mirrored) + cast shadow: slides L/R; bottom stays on the screen edge.
  const leftShadow = scene.add.image(leftX - slideAmp + shDX, baseY + shDY, key)
    .setDepth(depthShadow).setDisplaySize(thumbW, thumbH).setFlipX(true).setTint(0x000000).setAlpha(0.36);
  const leftHand = scene.add.image(leftX - slideAmp, baseY, key)
    .setDepth(depthHand).setDisplaySize(thumbW, thumbH).setFlipX(true);
  scene.tweens.add({ targets: leftHand,   x: leftX + slideAmp,        duration: 1100, yoyo: true, repeat: -1, ease });
  scene.tweens.add({ targets: leftShadow, x: leftX + slideAmp + shDX, duration: 1100, yoyo: true, repeat: -1, ease });

  // Right hand: taps DOWNWARD and is 20% LARGER at its lifted peak (depth). Its shadow grows +
  // softens when lifted, and tightens + darkens as it presses the screen.
  const rightHand = scene.add.image(rightX, baseY, key).setDepth(depthHand).setDisplaySize(thumbW, thumbH);
  const rsx = rightHand.scaleX, rsy = rightHand.scaleY; // normal (pressed) scale
  rightHand.setScale(rsx * 1.2, rsy * 1.2);             // start lifted (peak) — 20% larger
  const rightShadow = scene.add.image(rightX + shDX * 2, baseY + shDY * 2, key)
    .setDepth(depthShadow).setDisplaySize(thumbW, thumbH).setTint(0x000000).setScale(rsx * 1.35, rsy * 1.35).setAlpha(0.2);
  scene.tweens.add({ targets: rightHand, y: baseY + tapAmp, scaleX: rsx, scaleY: rsy, duration: 650, yoyo: true, repeat: -1, ease });
  scene.tweens.add({ targets: rightShadow, x: rightX + Math.round(shDX * 0.5), y: baseY + tapAmp + Math.round(shDY * 0.5), scaleX: rsx, scaleY: rsy, alpha: 0.5, duration: 650, yoyo: true, repeat: -1, ease });

  return { leftHand, leftShadow, rightHand, rightShadow, objs: [leftShadow, leftHand, rightShadow, rightHand] };
}
