// Shared celebratory effects for the variant's two birthday scenes: looping firework bursts,
// falling confetti, and a {token} substitution helper. Procedural — reuses the global 'st_particle'
// texture (made in BootScene) plus a tiny generated confetti square, so no image assets are needed.
import Phaser from 'phaser';

const COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffab40, 0xffffff];

// One-time 8×8 white square texture for confetti (tinted per-particle below).
function ensureConfettiTexture(scene) {
  if (scene.textures.exists('confetti_sq')) return;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 8, 8);
  scene.textures.addCanvas('confetti_sq', c);
}

// Continuous confetti drifting down across the full width. Returns the emitter (auto-cleaned on
// scene shutdown by Phaser). Depth is high so it falls in front of the art.
export function startConfetti(scene, W, H) {
  ensureConfettiTexture(scene);
  return scene.add.particles(0, 0, 'confetti_sq', {
    x: { min: 0, max: W },
    y: -20,
    quantity: 2,
    frequency: 90,
    lifespan: { min: 3500, max: 6500 },
    speedY: { min: 70, max: 180 },
    speedX: { min: -45, max: 45 },
    gravityY: 45,
    scale: { min: 0.6, max: 1.7 },
    rotate: { start: 0, end: 360 },
    tint: COLORS,
    alpha: { start: 1, end: 0.9 },
  }).setDepth(40);
}

// Repeating firework bursts in the upper area. Returns { emitter, timer }; the timer is registered
// on the scene clock, so it stops automatically when the scene shuts down.
export function startFireworks(scene, W, H) {
  const emitter = scene.add.particles(0, 0, 'st_particle', {
    lifespan: 950,
    speed: { min: 90, max: 280 },
    scale: { start: 1.2, end: 0 },
    alpha: { start: 1, end: 0 },
    gravityY: 130,
    tint: COLORS,
    blendMode: 'ADD',
    emitting: false,
  }).setDepth(39);

  const boom = () => {
    const x = Phaser.Math.Between(Math.round(W * 0.15), Math.round(W * 0.85));
    const y = Phaser.Math.Between(Math.round(H * 0.12), Math.round(H * 0.50));
    emitter.explode(Phaser.Math.Between(26, 42), x, y);
  };
  boom();
  const timer = scene.time.addEvent({ delay: 650, loop: true, callback: boom });
  return { emitter, timer };
}

// Replace {N} {Nth} {walls} {seconds} tokens in a gametext string. Global-regex replace (not
// String.replaceAll, which esbuild won't polyfill for the es2015 target → would break old WebKit).
export function fillTokens(str, { N, Nth, walls, seconds }) {
  const sub = (v) => (v == null ? '' : String(v));
  return String(str || '')
    .replace(/\{Nth\}/g, sub(Nth))
    .replace(/\{N\}/g, sub(N))
    .replace(/\{walls\}/g, sub(walls))
    .replace(/\{seconds\}/g, sub(seconds));
}
