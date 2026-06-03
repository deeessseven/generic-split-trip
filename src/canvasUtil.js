// Draw any image source onto a square `size`×`size` canvas with high-quality smoothing,
// stretching non-square sources to fill. Returns the canvas. Shared by the boot-time sprite
// normalization, the Settings upload resize, and the resampler's browser fallback so the
// "draw onto a square canvas" logic lives in exactly one place.
export function squareCanvas(src, size) {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size, size);
  return canvas;
}
