import { defineConfig } from 'vite';

// Build-time variant selection. With no VITE_VARIANT (the normal `npm run build`), this is the
// base game: outDir 'docs', emptyOutDir true — byte-for-byte the current build. With
// VITE_VARIANT=<id> (used by scripts/build-variants.mjs), it builds that variant into docs/<id>/
// WITHOUT emptying docs/ (so the base build sitting there is preserved). __VARIANT_ID__ is
// inlined into the bundle so src/variants/registry.js can tree-shake to just the selected variant.
const VARIANT = process.env.VITE_VARIANT || '';

export default defineConfig({
  base: './',
  define: {
    __VARIANT_ID__: JSON.stringify(VARIANT || 'base'),
  },
  build: {
    outDir: VARIANT ? `docs/${VARIANT}` : 'docs',
    emptyOutDir: !VARIANT,
    assetsDir: 'assets',
    target: 'es2015',
  },
  server: {
    port: 3000,
    open: true,
  },
});
