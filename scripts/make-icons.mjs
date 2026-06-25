// Generate square home-screen / bookmark icons from a hero sprite (sprites/heroSide1.png).
//
// iOS "Add to Home Screen" and Android install need a SQUARE icon with no transparency (iOS paints
// black behind transparent pixels). The hero sprites are square RGBA with a transparent background,
// so we composite the sprite over a solid color and emit the standard icon sizes. Pure Node +
// built-in zlib — no image deps.
//
// Usage:  node scripts/make-icons.mjs [srcSpritePng] [outDir] [bgHex]
// Defaults to the base game's heroSide1.png → public/ (vite then copies these into docs/).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public', 'sprites', 'heroSide1.png');
const BG = [0x1a, 0x1a, 0x2e]; // #1a1a2e — the game's theme color
// apple-touch-icon.png = iOS Home Screen (index.html references it by that exact name);
// icon-192/512.png = Android/PWA manifest icons.
const OUTPUTS = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-1024.png', 1024]];

// ── CRC32 (PNG chunk checksums) ──────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// ── Decode an 8-bit, non-interlaced PNG → { width, height, rgba } ────────────
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (!channels) throw new Error('unsupported colorType ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x++) {
      const rb = raw[p++];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = rb; break;
        case 1: v = rb + a; break;
        case 2: v = rb + b; break;
        case 3: v = rb + ((a + b) >> 1); break;
        case 4: v = rb + paeth(a, b, c); break;
        default: throw new Error('bad filter ' + filter);
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r, g, b, a = 255;
    if (colorType === 6) { r = px[s]; g = px[s + 1]; b = px[s + 2]; a = px[s + 3]; }
    else if (colorType === 2) { r = px[s]; g = px[s + 1]; b = px[s + 2]; }
    else { r = g = b = px[s]; if (colorType === 4) a = px[s + 1]; }
    const d = i * 4;
    rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
  }
  return { width, height, rgba };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// "Contain" the image on a square, solid-color canvas (pad, never crop) and flatten alpha over
// the background so the result is fully opaque.
function containOnBg(rgba, w, h, bg) {
  const side = Math.max(w, h);
  const out = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const d = i * 4; out[d] = bg[0]; out[d + 1] = bg[1]; out[d + 2] = bg[2]; out[d + 3] = 255;
  }
  const ox = Math.floor((side - w) / 2), oy = Math.floor((side - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const a = rgba[s + 3] / 255;
      const d = ((oy + y) * side + (ox + x)) * 4;
      out[d]     = Math.round(rgba[s]     * a + bg[0] * (1 - a));
      out[d + 1] = Math.round(rgba[s + 1] * a + bg[1] * (1 - a));
      out[d + 2] = Math.round(rgba[s + 2] * a + bg[2] * (1 - a));
      out[d + 3] = 255;
    }
  }
  return { rgba: out, side };
}

function resize(src, sw, sh, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * sh / dh - 0.5;
    const y0 = clamp(Math.floor(sy), 0, sh - 1), y1 = clamp(y0 + 1, 0, sh - 1), fy = clamp(sy - Math.floor(sy), 0, 1);
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * sw / dw - 0.5;
      const x0 = clamp(Math.floor(sx), 0, sw - 1), x1 = clamp(x0 + 1, 0, sw - 1), fx = clamp(sx - Math.floor(sx), 0, 1);
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c], p10 = src[(y0 * sw + x1) * 4 + c];
        const p01 = src[(y1 * sw + x0) * 4 + c], p11 = src[(y1 * sw + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx, bot = p01 + (p11 - p01) * fx;
        dst[(y * dw + x) * 4 + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return dst;
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

// Build a maskable variant: the hero scaled into the center safe zone (~80%) on the solid
// background, so Android's adaptive-icon crop only eats the padding, never the character.
function padToMaskable(square, side, bg, scale = 0.8) {
  const inner = Math.max(1, Math.round(side * scale));
  const innerImg = resize(square, side, side, inner, inner);
  const out = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) { const d = i * 4; out[d] = bg[0]; out[d + 1] = bg[1]; out[d + 2] = bg[2]; out[d + 3] = 255; }
  const off = Math.floor((side - inner) / 2);
  for (let yy = 0; yy < inner; yy++) for (let xx = 0; xx < inner; xx++) {
    const s = (yy * inner + xx) * 4, a = innerImg[s + 3] / 255;
    const d = ((off + yy) * side + (off + xx)) * 4;
    out[d]     = Math.round(innerImg[s]     * a + bg[0] * (1 - a));
    out[d + 1] = Math.round(innerImg[s + 1] * a + bg[1] * (1 - a));
    out[d + 2] = Math.round(innerImg[s + 2] * a + bg[2] * (1 - a));
    out[d + 3] = 255;
  }
  return out;
}

// ── API ───────────────────────────────────────────────────────────────────────
// Composite srcSpritePng over the background color and write the icon set (incl. maskable
// variants icon-maskable-192/512.png) into outDir.
export function makeIcons(srcSpritePng, outDir, bg = BG) {
  const { width, height, rgba } = decodePNG(readFileSync(srcSpritePng));
  const { rgba: square, side } = containOnBg(rgba, width, height, bg);
  for (const [name, size] of OUTPUTS) {
    writeFileSync(join(outDir, name), encodePNG(size, size, resize(square, side, side, size, size)));
  }
  // Maskable (Android adaptive icon): hero at ~80% on the same background.
  const mask = padToMaskable(square, side, bg);
  for (const size of [192, 512]) {
    writeFileSync(join(outDir, `icon-maskable-${size}.png`), encodePNG(size, size, resize(mask, side, side, size, size)));
  }
  return { side };
}

// ── Diagonal split icon (base game) ─────────────────────────────────────────────
// A white 45° line from the bottom-left corner to the top-right corner makes two triangles:
// heroTop1 fits the upper-left triangle, heroSide1 fits the lower-right triangle, both over the
// solid background. Reuses decode/resize/encode/composite above — still no image deps.
function opaqueBBox(rgba, w, h, thresh = 16) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > thresh) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h }; // fully transparent → use whole image
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropRGBA(rgba, w, bx, by, bw, bh) {
  const out = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    const from = ((by + y) * w + bx) * 4;
    rgba.copy(out, y * bw * 4, from, from + bw * 4);
  }
  return out;
}

// Alpha-blend a src image (sw×sh RGBA) onto the opaque canvas (side×side) at (dx,dy).
function blit(canvas, side, src, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const cy = dy + y; if (cy < 0 || cy >= side) continue;
    for (let x = 0; x < sw; x++) {
      const cx = dx + x; if (cx < 0 || cx >= side) continue;
      const s = (y * sw + x) * 4, a = src[s + 3] / 255; if (a <= 0) continue;
      const d = (cy * side + cx) * 4;
      canvas[d]     = Math.round(src[s]     * a + canvas[d]     * (1 - a));
      canvas[d + 1] = Math.round(src[s + 1] * a + canvas[d + 1] * (1 - a));
      canvas[d + 2] = Math.round(src[s + 2] * a + canvas[d + 2] * (1 - a));
      canvas[d + 3] = 255;
    }
  }
}

// Fit a sprite's opaque content into a square box of side `boxSide`, centered at (cx,cy).
function placeFitted(canvas, side, spritePng, cx, cy, boxSide) {
  const { width, height, rgba } = decodePNG(readFileSync(spritePng));
  const bb = opaqueBBox(rgba, width, height);
  const cropped = cropRGBA(rgba, width, bb.x, bb.y, bb.w, bb.h);
  const scale = Math.min(boxSide / bb.w, boxSide / bb.h);
  const dw = Math.max(1, Math.round(bb.w * scale)), dh = Math.max(1, Math.round(bb.h * scale));
  const resized = resize(cropped, bb.w, bb.h, dw, dh);
  blit(canvas, side, resized, dw, dh, Math.round(cx - dw / 2), Math.round(cy - dh / 2));
}

// White anti-aliased line along x+y=side (bottom-left corner → top-right corner), thickness `w`.
function drawDiagonal(canvas, side, w) {
  const half = w / 2, inv = 1 / Math.SQRT2;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const cov = clamp(half - Math.abs(x + y - side) * inv + 0.5, 0, 1);
    if (cov <= 0) continue;
    const d = (y * side + x) * 4;
    canvas[d]     = Math.round(255 * cov + canvas[d]     * (1 - cov));
    canvas[d + 1] = Math.round(255 * cov + canvas[d + 1] * (1 - cov));
    canvas[d + 2] = Math.round(255 * cov + canvas[d + 2] * (1 - cov));
    canvas[d + 3] = 255;
  }
}

function buildDiagonalMaster(topPng, sidePng, bg, side = 1024) {
  const canvas = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) { const d = i * 4; canvas[d] = bg[0]; canvas[d + 1] = bg[1]; canvas[d + 2] = bg[2]; canvas[d + 3] = 255; }
  const box = Math.round(side * 0.42);
  placeFitted(canvas, side, topPng,  Math.round(side * 0.27), Math.round(side * 0.27), box); // upper-left triangle
  placeFitted(canvas, side, sidePng, Math.round(side * 0.73), Math.round(side * 0.73), box); // lower-right triangle
  drawDiagonal(canvas, side, Math.max(2, Math.round(side * 0.03)));
  return { rgba: canvas, side };
}

// Base-game icon set from the diagonal composite. Writes the SAME filenames as makeIcons() (so the
// manifest/index references are unchanged) PLUS icon-1024.png (store master).
export function makeDiagonalIcons(topPng, sidePng, outDir, bg = BG) {
  const { rgba: square, side } = buildDiagonalMaster(topPng, sidePng, bg);
  for (const [name, size] of OUTPUTS) {
    writeFileSync(join(outDir, name), encodePNG(size, size, resize(square, side, side, size, size)));
  }
  const mask = padToMaskable(square, side, bg);
  for (const size of [192, 512]) {
    writeFileSync(join(outDir, `icon-maskable-${size}.png`), encodePNG(size, size, resize(mask, side, side, size, size)));
  }
  return { side };
}

// ── CLI ────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('make-icons.mjs')) {
  const args = process.argv.slice(2);
  if (args[0] === '--diagonal') {
    // node scripts/make-icons.mjs --diagonal [heroTopPng] [heroSidePng] [outDir]
    const top = args[1] || join(ROOT, 'public', 'sprites', 'heroTop1.png');
    const side = args[2] || SRC;
    const outDir = args[3] || join(ROOT, 'public');
    for (const f of [top, side]) if (!existsSync(f)) { console.error('missing', f); process.exit(1); }
    makeDiagonalIcons(top, side, outDir);
    console.log(`✓ diagonal icons (heroTop ◤ / heroSide ◢) → ${outDir}`);
  } else {
    const src = args[0] || SRC;
    const outDir = args[1] || join(ROOT, 'public');
    if (!existsSync(src)) { console.error('missing', src); process.exit(1); }
    const { side } = makeIcons(src, outDir);
    console.log(`✓ icons (${side}×${side} contain over #${BG.map((n) => n.toString(16).padStart(2, '0')).join('')}) → ${outDir}`);
  }
}
