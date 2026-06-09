// Build-time variant selection. __VARIANT_ID__ is replaced with a string literal by Vite at build
// time (see vite.config.js `define`), set from the VITE_VARIANT env var (default 'base'). Because
// it's a compile-time constant, the ternary below is constant-folded and the UNMATCHED variant's
// import (and all of its scene code) is tree-shaken out — so the base build contains zero variant
// code, and each variant build contains only its own.
//
// To add a variant: create ./<id>/variant.js, import it here, and add a branch to the ternary.
import base from './base/variant.js';
import adrianas from './adrianas-split-trip/variant.js';

/* global __VARIANT_ID__ */
const ID = __VARIANT_ID__;

export const variant =
  ID === 'adrianas-split-trip' ? adrianas :
  base;
