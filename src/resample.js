// Dependency-free separable Lanczos-3 resampler.
//
// Why: canvas `imageSmoothingQuality:'high'` is bilinear/box on most browsers, which
// softens large downscales (our hero sources are ~555-840px -> 100px). Lanczos is a
// windowed-sinc low-pass that keeps far more edge detail at the same output resolution.
//
// Alpha is premultiplied before filtering and unpremultiplied after, so semi/transparent
// edges don't pull in the (usually black) RGB of fully transparent pixels as a dark halo.
//
// Separable: resize width first (one pass), then height (second pass) — O(n) per axis
// instead of a full 2D kernel. Runs once per sprite at boot / on upload, so the one-time
// CPU cost (tens of ms) is fine; the result is cached as a texture.

function lanczos(x, a) {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

// For each destination index, precompute the source window [left..] and normalized weights.
function buildWeights(srcSize, dstSize, a) {
  const ratio = srcSize / dstSize;
  const filterScale = Math.max(1, ratio); // widen the kernel when downscaling (anti-alias)
  const support = a * filterScale;
  const table = [];
  for (let d = 0; d < dstSize; d++) {
    const center = (d + 0.5) * ratio - 0.5;
    const left = Math.max(0, Math.floor(center - support));
    const right = Math.min(srcSize - 1, Math.ceil(center + support));
    const weights = new Float32Array(right - left + 1);
    let sum = 0;
    for (let s = left; s <= right; s++) {
      const w = lanczos((s - center) / filterScale, a);
      weights[s - left] = w;
      sum += w;
    }
    if (sum !== 0) for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    table.push({ left, weights });
  }
  return table;
}

// Resize an HTMLImageElement or canvas to a dst×dst square; returns a canvas.
// Falls back to a high-quality canvas downscale if pixel data can't be read.
export function lanczosResizeSquare(src, dst, a = 3) {
  try {
    const sw = src.naturalWidth || src.width;
    const sh = src.naturalHeight || src.height;

    const sc = document.createElement('canvas');
    sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d');
    sctx.drawImage(src, 0, 0, sw, sh);
    const sdata = sctx.getImageData(0, 0, sw, sh).data;

    // Premultiply: RGB scaled by alpha fraction, alpha kept in 0..255.
    const srcBuf = new Float32Array(sw * sh * 4);
    for (let i = 0; i < sw * sh; i++) {
      const al = sdata[i * 4 + 3] / 255;
      srcBuf[i * 4]     = sdata[i * 4]     * al;
      srcBuf[i * 4 + 1] = sdata[i * 4 + 1] * al;
      srcBuf[i * 4 + 2] = sdata[i * 4 + 2] * al;
      srcBuf[i * 4 + 3] = sdata[i * 4 + 3];
    }

    // Horizontal pass: (sw × sh) -> (dst × sh)
    const xw = buildWeights(sw, dst, a);
    const hBuf = new Float32Array(dst * sh * 4);
    for (let y = 0; y < sh; y++) {
      const rowOff = y * sw * 4;
      for (let x = 0; x < dst; x++) {
        const { left, weights } = xw[x];
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = 0; k < weights.length; k++) {
          const p = rowOff + (left + k) * 4;
          const w = weights[k];
          r += srcBuf[p] * w; g += srcBuf[p + 1] * w; b += srcBuf[p + 2] * w; al += srcBuf[p + 3] * w;
        }
        const o = (y * dst + x) * 4;
        hBuf[o] = r; hBuf[o + 1] = g; hBuf[o + 2] = b; hBuf[o + 3] = al;
      }
    }

    // Vertical pass: (dst × sh) -> (dst × dst), then unpremultiply into output.
    const yw = buildWeights(sh, dst, a);
    const out = document.createElement('canvas');
    out.width = dst; out.height = dst;
    const octx = out.getContext('2d');
    const imgData = octx.createImageData(dst, dst);
    const od = imgData.data;
    for (let x = 0; x < dst; x++) {
      for (let y = 0; y < dst; y++) {
        const { left, weights } = yw[y];
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = 0; k < weights.length; k++) {
          const p = ((left + k) * dst + x) * 4;
          const w = weights[k];
          r += hBuf[p] * w; g += hBuf[p + 1] * w; b += hBuf[p + 2] * w; al += hBuf[p + 3] * w;
        }
        const aClamped = Math.max(0, Math.min(255, al));
        const inv = aClamped > 0 ? 255 / aClamped : 0; // unpremultiply
        const o = (y * dst + x) * 4;
        od[o]     = Math.max(0, Math.min(255, r * inv));
        od[o + 1] = Math.max(0, Math.min(255, g * inv));
        od[o + 2] = Math.max(0, Math.min(255, b * inv));
        od[o + 3] = Math.round(aClamped);
      }
    }
    octx.putImageData(imgData, 0, 0);
    return out;
  } catch (e) {
    // Fallback: best-effort canvas downscale (e.g. if getImageData is blocked).
    const c = document.createElement('canvas');
    c.width = dst; c.height = dst;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, dst, dst);
    return c;
  }
}
