// @capacitor/assets rewrites the Android adaptive-icon XMLs with a 16.7% inset on BOTH layers, which
// leaves a transparent border so the background no longer reaches the rounded edge. This strips the
// insets so each layer fills the full adaptive canvas (full-bleed background; the foreground PNG is
// already pre-padded into the safe zone by scripts/make-icons.mjs). Idempotent — safe to re-run.
// Chained after `capacitor-assets generate` in the "assets" npm script.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26');
const FULL_BLEED = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

let patched = 0;
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = join(DIR, f);
  if (!existsSync(p)) continue;
  if (readFileSync(p, 'utf8') !== FULL_BLEED) { writeFileSync(p, FULL_BLEED); patched++; }
}
console.log(`✓ adaptive-icon full-bleed (${patched} file(s) updated)`);
