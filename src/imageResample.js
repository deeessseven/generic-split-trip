// Hero-sprite downscaling.
//
// A hero is scaled in TWO stages:
//   1) This one-time CPU resample from the source art down to the 100px (gameplay) and
//      400px (title) square textures — that is what the algorithms below control.
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
//   'browser'         — canvas imageSmoothingQuality 'high' (the previous default).
// (Magic Kernel Sharp is also available on request — it needs an extra sharpen pass.)
//
// NOTE: bundled sprites in public/sprites/ are resampled at every boot, so a mode change
// takes effect on reload. UPLOADED heroes are baked at upload time, so re-upload to compare
// modes on those.
export const RESAMPLE_MODE = 'mitchell';

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

// Map the active mode to its kernel function + support radius (in source pixels).
function pickKernel() {
  switch (RESAMPLE_MODE) {
    case 'lanczos':     return { kernel: lanczos3,      support: 3 };
    case 'lanczos2':    return { kernel: lanczos2,      support: 2 };
    case 'catmull-rom': return { kernel: catmullRom,    support: 2 };
    case 'mitchell':    return { kernel: mitchell,      support: 2 };
    case 'box':         return { kernel: box,           support: 0.5 };
    case 'triangle':    return { kernel: triangle,      support: 1 };
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

function clamp8(v) { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; }

function browserCanvas(src, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size, size);
  return canvas;
}

// Resample any image source onto a `size`×`size` canvas using RESAMPLE_MODE; returns the
// canvas. Falls back to browser smoothing for mode 'browser' or if pixels can't be read
// (tainted canvas). Stretches non-square sources into the square, matching the old path.
export function resampleToCanvas(src, size) {
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  if (RESAMPLE_MODE === 'browser' || !sw || !sh) return browserCanvas(src, size);

  let data;
  try {
    const sc = document.createElement('canvas');
    sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d');
    sctx.drawImage(src, 0, 0);
    data = sctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return browserCanvas(src, size); // cross-origin / tainted — can't read pixels
  }

  // To premultiplied-alpha float, so filtering can't bleed color across transparent edges
  // (otherwise you get dark/colored halos around the hero's silhouette).
  const fsrc = new Float32Array(sw * sh * 4);
  for (let i = 0, n = sw * sh; i < n; i++) {
    const o = i * 4; const al = data[o + 3] / 255;
    fsrc[o] = data[o] * al; fsrc[o + 1] = data[o + 1] * al; fsrc[o + 2] = data[o + 2] * al;
    fsrc[o + 3] = data[o + 3];
  }

  const { kernel, support } = pickKernel();
  const cx = contributions(sw, size, kernel, support);
  const cy = contributions(sh, size, kernel, support);
  const mid = passX(fsrc, sw, sh, size, cx);
  const fin = passY(mid, size, sh, size, cy);

  // Unpremultiply + clamp back to 8-bit.
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const octx = canvas.getContext('2d');
  const img = octx.createImageData(size, size);
  const out = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    const o = i * 4;
    let a = fin[o + 3];
    a = a < 0 ? 0 : a > 255 ? 255 : a;
    if (a > 0) {
      const inv = 255 / a;
      out[o]     = clamp8(fin[o] * inv);
      out[o + 1] = clamp8(fin[o + 1] * inv);
      out[o + 2] = clamp8(fin[o + 2] * inv);
    } else { out[o] = out[o + 1] = out[o + 2] = 0; }
    out[o + 3] = Math.round(a);
  }
  octx.putImageData(img, 0, 0);
  return canvas;
}
