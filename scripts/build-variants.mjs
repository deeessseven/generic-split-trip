// Build the base game, then build each variant into its own self-contained docs/<id>/ folder.
//
// A variant is the SAME engine + content as the base game, differing only by the extra scenes /
// route overrides declared in its manifest (src/variants/<id>/variant.js). Selection is build-time
// via the VITE_VARIANT env var, which vite.config.js turns into a per-variant outDir plus an inlined
// __VARIANT_ID__ — so each build contains only its own variant's code, and the base build is left
// byte-for-byte the current game.
//
// Optional content overrides under variants/<id>/ (repo root), overlaid after that variant's build:
//   - gametext.txt : a COMPLETE gametext (full base copy + the variant's overrides/additions). If
//                    present it REPLACES the base gametext.txt in docs/<id>/, so the variant has one
//                    fully-editable file (identity, tips, labels, celebration text — everything).
//   - sprites/     : copied over the base sprites (only the files you provide are replaced).
//
// Per-variant Home Screen / install icon + title (derived, not overlaid):
//   - icon          : built from the variant's heroSide1.png (or base) → docs/<id>/apple-touch-icon.png
//                     + icon-192/512.png  (see scripts/make-icons.mjs).
//   - install label : the variant's gametext `gameTitle` baked into the manifest name/short_name
//                     (Android install label). The web tab + iOS label come from gametext at runtime
//                     (GameText.js applyText), so they update without a rebuild; the Android install
//                     name is baked here and only changes on a rebuild.
//
// Usage:  npm run build:variants

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIcons } from './make-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const PUBLIC = join(ROOT, 'public');
const SRC_VARIANTS = join(ROOT, 'src', 'variants');
const CONTENT_OVERRIDES = join(ROOT, 'variants'); // optional per-variant text/sprite overrides
const SW_VERSION = String(Date.now()); // stamped into each deployed sw.js → a redeploy purges old caches
// This site's GitHub Pages base path, used as each app's manifest `id` (origin-relative). Gives
// base + every variant a DISTINCT PWA identity — otherwise, with no explicit id, the base app's
// scope (/generic-split-trip/) swallows the variants' nested paths and installs get conflated.
// Each id equals the path the browser already derives from start_url, so existing correct installs
// are NOT orphaned.
const REPO_BASE = '/generic-split-trip/';

// Stamp the build version into a folder's service worker (replaces the __SW_VERSION__ placeholder).
function stampSW(dir) {
  const p = join(dir, 'sw.js');
  if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace(/__SW_VERSION__/g, SW_VERSION));
}

// Read `gameTitle` from a gametext.txt, collapsing the in-game \n two-line marker to one line.
function readGameTitle(gametextPath) {
  if (!existsSync(gametextPath)) return null;
  const m = readFileSync(gametextPath, 'utf8').match(/^\s*gameTitle\s*=\s*(.+?)\s*$/m);
  return m ? m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

// Bake the install label (name/short_name) and a stable per-app `id` into the (content-hashed)
// manifest vite emitted under docs<...>/assets/. `title` may be null (then only `id` is set).
function patchManifestName(docsDir, title, appId) {
  const assets = join(docsDir, 'assets');
  if (!existsSync(assets)) return;
  const file = readdirSync(assets).find((f) => /^manifest-.*\.json$/.test(f));
  if (!file) return;
  const p = join(assets, file);
  const m = JSON.parse(readFileSync(p, 'utf8'));
  if (title) { m.name = title; m.short_name = title; }
  if (appId) m.id = appId;
  writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}

// 1. Base build → docs/ (emptyOutDir true clears any stale variant subfolders first).
console.log('▶ base → docs/');
execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
// Regenerate base icons from current source (so a base-art change can't leave a stale base icon),
// then bake the base title into the manifest.
makeIcons(join(PUBLIC, 'sprites', 'heroSide1.png'), DOCS);
stampSW(DOCS);
const baseTitle = readGameTitle(join(PUBLIC, 'gametext.txt'));
patchManifestName(DOCS, baseTitle, REPO_BASE);

// 2. Every variant under src/variants/ that has a variant.js → docs/<id>/ (emptyOutDir false leaves
//    docs/). Excludes base and helper folders like shared/ (which hold only reusable scenes).
const ids = readdirSync(SRC_VARIANTS).filter(
  (id) =>
    id !== 'base' &&
    statSync(join(SRC_VARIANTS, id)).isDirectory() &&
    existsSync(join(SRC_VARIANTS, id, 'variant.js')),
);

for (const id of ids) {
  console.log(`▶ variant ${id} → docs/${id}/`);
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT, env: { ...process.env, VITE_VARIANT: id } });

  const ov = join(CONTENT_OVERRIDES, id);
  // Optional content overlay (omit a file to inherit base text/sprites).
  if (existsSync(ov)) {
    const gametext = join(ov, 'gametext.txt');
    if (existsSync(gametext)) {
      // The variant's gametext.txt is a complete file — REPLACE the base gametext vite copied in.
      cpSync(gametext, join(DOCS, id, 'gametext.txt'));
    }
    const sprites = join(ov, 'sprites');
    if (existsSync(sprites)) cpSync(sprites, join(DOCS, id, 'sprites'), { recursive: true });
  }

  // Home Screen / install icon from this variant's heroSide1.png (falls back to base).
  const heroSrc = existsSync(join(ov, 'sprites', 'heroSide1.png'))
    ? join(ov, 'sprites', 'heroSide1.png')
    : join(PUBLIC, 'sprites', 'heroSide1.png');
  makeIcons(heroSrc, join(DOCS, id));
  stampSW(join(DOCS, id));

  // Android install label = this variant's gameTitle (falls back to base).
  const title = readGameTitle(join(ov, 'gametext.txt')) || baseTitle;
  patchManifestName(join(DOCS, id), title, REPO_BASE + id + '/');

  console.log(`✓ ${id}`);
}

console.log(`\nDone. base + ${ids.length} variant(s): ${ids.join(', ') || '(none)'}`);
