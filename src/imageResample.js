// Sprite downscaling (gamma-correct / linear-light for all paths). Heroes use the configured
// kernel (RESAMPLE_MODE, currently Lanczos-3); the tiled sprites — backgrounds / wall / hit mark —
// pass mode='triangle' (tent/bilinear, ring-free) so a tiled texture can't get seam halos, and
// it stays smooth when a small procedural fallback has to be UPscaled rather than down.
//
// A hero is scaled in TWO stages:
//   1) This one-time CPU resample from the source art down to the 128px (gameplay) and
//      512px (title) square textures — that is what the algorithms below control.
//   2) The per-frame GPU bilinear sampler that draws those textures on screen (your ±15%
//      scaling, device pixel ratio, etc.) — fixed by WebGL, can't be swapped.
//
// Flip RESAMPLE_MODE to A/B the stage-1 algorithm (sharpest → smoothest):
//   'bicubic-sharper' — Keys cubic, sharpening coefficient (Photoshop "Bicubic Sharper").
//   'lanczos'         — Lanczos-3 (windowed sinc, 6-tap): sharp, detail-preserving.
//   'lanczos2'        — Lanczos-2 (4-tap): a bit softer, fewer halos than Lanczos-3.
//   'catmull-rom'     — interpolating cubic: sharp-ish, mild ringing.
//   'mitchell'        — Mitchell-Netravali: best-balanced sharp/smooth, minimal halos.
//   'box'             — area average: no ringing at all, soft (good for big reductions).
//   'triangle'        — bilinear (widened): soft.
//   'magic-kernel-sharp' — Magic Kernel (quadratic B-spline) + Sharp correction pass; the
//                       Facebook/Instagram downscaler: sharp and clean with no ringing halos.
//   'browser'         — canvas imageSmoothingQuality 'high' (sRGB, NOT gamma-correct; fallback only).
//
// NOTE: bundled sprites in public/sprites/ are resampled at every boot, so a mode change
// takes effect on reload. UPLOADED heroes are baked at upload time, so re-upload to compare
// modes on those.

export const RESAMPLE_MODE = 'lanczos';

// ── Kernels ──────────────────────────────────────────────────────────────────
function lanczosA(x, a) {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}
function lanczos3(x) { return lanczosA(x, 3); }
function lanczos2(x) { return lanczosA(x, 2); }

function bicubicSharper(x) {
  // Keys cubic convolution. a = -1.0 gives stronger negative lobes (edge overshoot) than the
  // usual -0.5 / -0.75, approximating Photoshop's "Bicubic Sharper" crispening on downscale.
  const a = -1.0;
  x = Math.abs(x);
  if (x < 1) return (a + 2) * x * x * x - (a + 3) * x * x + 1;
  if (x < 2) return a * x * x * x - 5 * a * x * x + 8 * a * x - 4 * a;
  return 0;
}

// General cubic with Mitchell-Netravali B,C parameters. Catmull-Rom = (0, 0.5);
// Mitchell = (1/3, 1/3); B-spline = (1, 0).
function cubicBC(x, B, C) {
  x = Math.abs(x); const x2 = x * x, x3 = x2 * x;
  if (x < 1) return ((12 - 9 * B - 6 * C) * x3 + (-18 + 12 * B + 6 * C) * x2 + (6 - 2 * B)) / 6;
  if (x < 2) return ((-B - 6 * C) * x3 + (6 * B + 30 * C) * x2 + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
  return 0;
}
function mitchell(x)   { return cubicBC(x, 1 / 3, 1 / 3); }
function catmullRom(x) { return cubicBC(x, 0, 0.5); }
function triangle(x)   { x = Math.abs(x); return x < 1 ? 1 - x : 0; }
function box(x)        { return Math.abs(x) < 0.5 ? 1 : 0; }

// Magic Kernel (Costella) = the centered quadratic B-spline; support 3/2. On its own it's
// soft, so "Magic Kernel Sharp" follows the resample with the Sharp correction pass below.
function magicKernel(x) {
  x = Math.abs(x);
  if (x < 0.5) return 0.75 - x * x;
  if (x < 1.5) { const t = 1.5 - x; return 0.5 * t * t; }
  return 0;
}

// Sharp 2013 correction: separable 3-tap [-1/4, 3/2, -1/4] (sums to 1) applied to the
// resampled image to undo the Magic Kernel's blur. Operates in-place-style on a premult
// RGBA float buffer with edge clamping; returns a new buffer.
function sharpenMKS(buf, w, h) {
  const a = -0.25, b = 1.5;
  const tmp = new Float32Array(buf.length);
  for (let y = 0; y < h; y++) {            // horizontal
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const oL = row + (x > 0 ? x - 1 : 0) * 4;
      const oC = row + x * 4;
      const oR = row + (x < w - 1 ? x + 1 : w - 1) * 4;
      for (let c = 0; c < 4; c++) tmp[oC + c] = a * buf[oL + c] + b * buf[oC + c] + a * buf[oR + c];
    }
  }
  const out = new Float32Array(buf.length);
  for (let y = 0; y < h; y++) {            // vertical
    const oU = (y > 0 ? y - 1 : 0) * w * 4;
    const oCrow = y * w * 4;
    const oD = (y < h - 1 ? y + 1 : h - 1) * w * 4;
    for (let x = 0; x < w; x++) {
      const cx4 = x * 4;
      for (let c = 0; c < 4; c++) out[oCrow + cx4 + c] = a * tmp[oU + cx4 + c] + b * tmp[oCrow + cx4 + c] + a * tmp[oD + cx4 + c];
    }
  }
  return out;
}

// Map the active mode to its kernel function + support radius (in source pixels).
function pickKernel(mode) {
  switch (mode) {
    case 'lanczos':     return { kernel: lanczos3,      support: 3 };
    case 'lanczos2':    return { kernel: lanczos2,      support: 2 };
    case 'catmull-rom': return { kernel: catmullRom,    support: 2 };
    case 'mitchell':    return { kernel: mitchell,      support: 2 };
    case 'box':         return { kernel: box,           support: 0.5 };
    case 'triangle':    return { kernel: triangle,      support: 1 };
    case 'magic-kernel-sharp': return { kernel: magicKernel, support: 1.5, sharpen: true };
    case 'bicubic-sharper':
    default:            return { kernel: bicubicSharper, support: 2 };
  }
}

// For each destination index, precompute which source samples contribute and their
// normalized weights. When downscaling we widen the kernel (filterScale) so each output
// pixel averages the right span of source pixels — this is what removes aliasing.
function contributions(srcSize, dstSize, kernel, support) {
  const scale = dstSize / srcSize;
  const filterScale = scale < 1 ? 1 / scale : 1;
  const fSupport = support * filterScale;
  const list = new Array(dstSize);
  for (let d = 0; d < dstSize; d++) {
    const center = (d + 0.5) / scale - 0.5;
    const lo = Math.max(0, Math.floor(center - fSupport));
    const hi = Math.min(srcSize - 1, Math.ceil(center + fSupport));
    const idx = []; const wts = []; let sum = 0;
    for (let s = lo; s <= hi; s++) {
      const w = kernel((center - s) / filterScale);
      if (w === 0) continue;
      idx.push(s); wts.push(w); sum += w;
    }
    if (sum !== 0) for (let i = 0; i < wts.length; i++) wts[i] /= sum;
    list[d] = { idx, wts };
  }
  return list;
}

// Horizontal pass: (sw × sh) → (dw × sh), RGBA float in/out.
function passX(src, sw, sh, dw, contrib) {
  const out = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const rowIn = y * sw * 4;
    const rowOut = y * dw * 4;
    for (let x = 0; x < dw; x++) {
      const c = contrib[x]; const idx = c.idx; const wts = c.wts;
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < idx.length; i++) {
        const o = rowIn + idx[i] * 4; const w = wts[i];
        r += src[o] * w; g += src[o + 1] * w; b += src[o + 2] * w; a += src[o + 3] * w;
      }
      const o = rowOut + x * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  return out;
}

// Vertical pass: (w × sh) → (w × dh), RGBA float in/out.
function passY(src, w, sh, dh, contrib) {
  const out = new Float32Array(w * dh * 4);
  for (let y = 0; y < dh; y++) {
    const c = contrib[y]; const idx = c.idx; const wts = c.wts;
    const rowOut = y * w * 4;
    for (let x = 0; x < w; x++) {
      const colOff = x * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < idx.length; i++) {
        const o = idx[i] * w * 4 + colOff; const wt = wts[i];
        r += src[o] * wt; g += src[o + 1] * wt; b += src[o + 2] * wt; a += src[o + 3] * wt;
      }
      const o = rowOut + colOff;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  return out;
}

// sRGB ↔ linear-light conversion for GAMMA-CORRECT resampling. Averaging sRGB-encoded bytes
// directly darkens a downscaled image and crushes fine-detail contrast; filtering must happen in
// linear light. Decode is an exact 256-entry sRGB LUT; encode uses a fine 4096-step LUT (well
// below 8-bit banding) so there's no per-pixel pow() in the hot loop.
const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return t;
})();
const LIN_TO_SRGB = (() => {
  const N = 4096; const t = new Uint8ClampedArray(N + 1);
  for (let i = 0; i <= N; i++) { const v = i / N; const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; t[i] = Math.round(s * 255); }
  return t;
})();
function linToSrgb8(v) { return v <= 0 ? 0 : v >= 1 ? 255 : LIN_TO_SRGB[(v * 4096 + 0.5) | 0]; }

// Browser-smoothing fallback: draw any source onto a square canvas with high-quality smoothing.
// Used for mode 'browser' and when pixels can't be read (cross-origin / tainted canvas). NOT
// gamma-correct — it's only the fallback path; the main path above is linear-light.
function squareCanvas(src, size) {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size, size);
  return canvas;
}

// Resample any image source onto a `size`×`size` canvas using RESAMPLE_MODE; returns the
// canvas. Falls back to browser smoothing (squareCanvas) for mode 'browser' or if pixels can't
// be read (tainted canvas). Stretches non-square sources into the square, matching the old path.
export function resampleToCanvas(src, size, mode = RESAMPLE_MODE) {
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  if (mode === 'browser' || !sw || !sh) return squareCanvas(src, size);

  let data;
  try {
    const sc = document.createElement('canvas');
    sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d');
    sctx.drawImage(src, 0, 0);
    data = sctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return squareCanvas(src, size); // cross-origin / tainted — can't read pixels
  }

  // To premultiplied LINEAR-light float: decode sRGB→linear (gamma-correct downscaling preserves
  // the brightness and contrast of fine detail), then premultiply by alpha so filtering can't
  // bleed color across transparent edges (no dark/colored halos around the silhouette). Alpha is
  // already linear; keep it 0..1.
  const fsrc = new Float32Array(sw * sh * 4);
  for (let i = 0, n = sw * sh; i < n; i++) {
    const o = i * 4; const a = data[o + 3] / 255;
    fsrc[o]     = SRGB_TO_LINEAR[data[o]]     * a;
    fsrc[o + 1] = SRGB_TO_LINEAR[data[o + 1]] * a;
    fsrc[o + 2] = SRGB_TO_LINEAR[data[o + 2]] * a;
    fsrc[o + 3] = a;
  }

  const { kernel, support, sharpen } = pickKernel(mode);
  const cx = contributions(sw, size, kernel, support);
  const cy = contributions(sh, size, kernel, support);
  const mid = passX(fsrc, sw, sh, size, cx);
  let fin = passY(mid, size, sh, size, cy);
  if (sharpen) fin = sharpenMKS(fin, size, size); // Magic Kernel Sharp: undo the resample blur

  // Unpremultiply, then encode linear→sRGB back to 8-bit.
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const octx = canvas.getContext('2d');
  const img = octx.createImageData(size, size);
  const out = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    const o = i * 4;
    let a = fin[o + 3];                       // alpha 0..1
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a > 0) {
      const inv = 1 / a;                       // unpremultiply, then linear→sRGB
      out[o]     = linToSrgb8(fin[o]     * inv);
      out[o + 1] = linToSrgb8(fin[o + 1] * inv);
      out[o + 2] = linToSrgb8(fin[o + 2] * inv);
    } else { out[o] = out[o + 1] = out[o + 2] = 0; }
    out[o + 3] = Math.round(a * 255);
  }
  octx.putImageData(img, 0, 0);
  return canvas;
}
