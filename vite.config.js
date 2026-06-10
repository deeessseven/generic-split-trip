import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Build-time variant selection. With no VITE_VARIANT (the normal `npm run build`), this is the
// base game: outDir 'docs', emptyOutDir true. With VITE_VARIANT=<id> (used by
// scripts/build-variants.mjs), it builds that variant into docs/<id>/ WITHOUT emptying docs/.
//
// The '@active-variant' alias resolves to ONLY the selected variant's manifest, so the registry
// imports just that one. The other variants' manifests (and their scene code) are never in the
// import graph for this build — so the base bundle contains zero variant code, and each variant
// bundle contains only its own. (A plain ternary over both static imports does NOT strip them:
// `class X extends Phaser.Scene` reads Phaser.Scene at module-eval, which Rollup treats as a side
// effect and keeps. The alias avoids importing the unselected manifest in the first place.)
const VARIANT = process.env.VITE_VARIANT || '';
// APP_BUILD=1 (set by scripts/build-app.mjs) → lean single-variant build into a gitignored www/
// for the Capacitor native store apps. Unset → the GitHub Pages output (docs/, docs/<id>/) exactly
// as before. This flag ONLY affects outDir/emptyOutDir below; everything else is shared.
const APP_BUILD = process.env.APP_BUILD === '1';
const activeVariant = fileURLToPath(new URL(
  VARIANT ? `./src/variants/${VARIANT}/variant.js` : './src/variants/base/variant.js',
  import.meta.url,
));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@active-variant': activeVariant,
    },
  },
  build: {
    outDir: APP_BUILD ? 'www' : (VARIANT ? `docs/${VARIANT}` : 'docs'),
    emptyOutDir: APP_BUILD ? true : !VARIANT,
    assetsDir: 'assets',
    target: 'es2015',
  },
  server: {
    port: 3000,
    open: true,
  },
});
