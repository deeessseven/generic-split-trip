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
// Usage:  npm run build:variants

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const SRC_VARIANTS = join(ROOT, 'src', 'variants');
const CONTENT_OVERRIDES = join(ROOT, 'variants'); // optional per-variant text/sprite overrides

// 1. Base build → docs/ (emptyOutDir true clears any stale variant subfolders first).
console.log('▶ base → docs/');
execSync('npm run build', { stdio: 'inherit', cwd: ROOT });

// 2. Every variant under src/variants/ except base → docs/<id>/ (emptyOutDir false leaves docs/).
const ids = readdirSync(SRC_VARIANTS).filter(
  (id) => id !== 'base' && statSync(join(SRC_VARIANTS, id)).isDirectory(),
);

for (const id of ids) {
  console.log(`▶ variant ${id} → docs/${id}/`);
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT, env: { ...process.env, VITE_VARIANT: id } });

  // Optional content overlay (omit a file to inherit base text/sprites).
  const ov = join(CONTENT_OVERRIDES, id);
  if (existsSync(ov)) {
    const gametext = join(ov, 'gametext.txt');
    if (existsSync(gametext)) {
      // The variant's gametext.txt is a complete file — REPLACE the base gametext vite copied in.
      cpSync(gametext, join(DOCS, id, 'gametext.txt'));
    }
    const sprites = join(ov, 'sprites');
    if (existsSync(sprites)) cpSync(sprites, join(DOCS, id, 'sprites'), { recursive: true });
  }
  console.log(`✓ ${id}`);
}

console.log(`\nDone. base + ${ids.length} variant(s): ${ids.join(', ') || '(none)'}`);
