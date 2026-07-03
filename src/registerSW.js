// Register the offline service worker for the GitHub Pages web build.
//   • Web only: skipped inside the Capacitor NATIVE app. NOTE: checked via
//     isNativePlatform() inside the load handler — the Capacitor global appears on the
//     web too as soon as any @capacitor/* plugin is bundled (this exact presence-check
//     silently disabled generic-quest's web SW when its back-button work bundled
//     @capacitor/app). split-trip doesn't bundle one today; this is future-proofing.
//   • Relative 'sw.js' → the worker is scoped to THIS folder, so each variant gets its own copy.
//   • updateViaCache:'none' → the browser always re-checks sw.js, so a redeployed version is
//     picked up promptly (each deploy stamps a new VERSION; activating it purges the old cache).
//   • Fully guarded: where service workers are unavailable (some in-app browsers) this just no-ops.
if (typeof window !== 'undefined' && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNative) return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
