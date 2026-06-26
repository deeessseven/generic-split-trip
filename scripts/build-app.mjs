// Build ONE app target (base game or a single variant) into a lean, gitignored www/ for the
// Capacitor native store apps. Each store app wraps exactly one variant — NOT the full docs/ tree
// (which also contains every other variant). GitHub Pages still uses docs/ (see build-variants.mjs);
// this is only for the iOS/Android app bundles.
//
// It mirrors the docs/<id> overlay used for Pages: after Vite emits www/, it copies the variant's
// complete gametext.txt + sprites/ over www/ so the packaged app's text/art match its build.
//
// Usage:
//   node scripts/build-app.mjs            → base game            → www/
//   node scripts/build-app.mjs <variant>  → that variant (e.g. adri, jd) → www/

import { execSync } from 'node:child_process';
import { existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW     = join(ROOT, 'www');
const CONTENT = join(ROOT, 'variants'); // repo-root per-variant text/sprite overrides

const variant = (process.argv[2] || '').trim(); // '' = base game

// Guard: a named variant must exist, so a typo fails loudly instead of silently building base.
if (variant) {
  const manifest = join(ROOT, 'src', 'variants', variant, 'variant.js');
  if (!existsSync(manifest)) {
    console.error(`✖ Unknown variant "${variant}" — no src/variants/${variant}/variant.js`);
    process.exit(1);
  }
}

const env = { ...process.env, APP_BUILD: '1' };
if (variant) env.VITE_VARIANT = variant;

console.log(`▶ app build (${variant || 'base'}) → www/`);
execSync('npm run build:vite', { stdio: 'inherit', cwd: ROOT, env });

// Overlay the variant's complete gametext + sprites (same as the docs/<id> overlay), so the
// packaged app matches the variant. Base needs no overlay (Vite already copied public/).
if (variant) {
  const gametext = join(CONTENT, variant, 'gametext.txt');
  if (existsSync(gametext)) cpSync(gametext, join(WWW, 'gametext.txt'));
  const sprites = join(CONTENT, variant, 'sprites');
  if (existsSync(sprites)) cpSync(sprites, join(WWW, 'sprites'), { recursive: true });
}

console.log(`✓ www/ ready (${variant || 'base'}) — run "npx cap sync" next`);
