// Reads the device's CSS safe-area insets (env(safe-area-inset-*)) in px. These are exposed
// by the browser when the viewport meta has viewport-fit=cover, and reflect notches, camera
// cutouts and home indicators. NOTE: many rounded-corner-only phones report 0 here, so treat
// these as the "cutout" component and add your own proportional corner clearance on top.
//
// env() doesn't resolve when read straight off a CSS custom property in some browsers, so we
// apply it to a hidden probe element's padding and read the computed px back — that always
// resolves.
let _probe = null;

export function safeInsets() {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (!_probe) {
    _probe = document.createElement('div');
    _probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(_probe);
  }
  const cs = getComputedStyle(_probe);
  return {
    top:    parseFloat(cs.paddingTop)    || 0,
    right:  parseFloat(cs.paddingRight)  || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left:   parseFloat(cs.paddingLeft)   || 0,
  };
}
