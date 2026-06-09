// Build the base game, then build each variant into its own self-contained docs/<id>/ folder.
//
// A variant is the SAME engine + content as the base game, differing only by the extra scenes /
// route overrides declared in its manifest (src/variants/<id>/variant.js). Selection is build-time
// via the VITE_VARIANT env var, which vite.config.js turns into a per-variant outDir plus an inlined
// __VARIANT_ID__ — so each build contains only its own variant's code, and the base build is left
// byte-for-byte the current game.
//
// Optional content overrides: if a variant wants different text/sprites, drop a gametext.txt and/or
// sprites/ under variants/<id>/ (repo root) and they are overlaid after that variant's build.
// andrianas-split-trip uses base content, so it has no override folder.
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

  // Optional content overlay (omit to inherit base text/sprites — andrianas does).
  const ov = join(CONTENT_OVERRIDES, id);
  if (existsSync(ov)) {
    const gametext = join(ov, 'gametext.txt');
    if (existsSync(gametext)) cpSync(gametext, join(DOCS, id, 'gametext.txt'));
    const sprites = join(ov, 'sprites');
    if (existsSync(sprites)) cpSync(sprites, join(DOCS, id, 'sprites'), { recursive: true });
  }
  console.log(`✓ ${id}`);
}

console.log(`\nDone. base + ${ids.length} variant(s): ${ids.join(', ') || '(none)'}`);
