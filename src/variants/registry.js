// The active variant's manifest. '@active-variant' is a Vite alias that resolves at build time to
// exactly one variant's variant.js (see vite.config.js) — the selected VITE_VARIANT, or base when
// unset. Importing only the one means the other variants' scene code is never in this build's
// bundle: the base build is free of variant code, each variant build carries only its own.
import variant from '@active-variant';

export { variant };
