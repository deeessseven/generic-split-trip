// Register the offline service worker for the GitHub Pages web build.
//   • Web only: skipped inside the Capacitor native app (window.Capacitor present).
//   • Relative 'sw.js' → the worker is scoped to THIS folder, so each variant gets its own copy.
//   • updateViaCache:'none' → the browser always re-checks sw.js, so a redeployed version is
//     picked up promptly (each deploy stamps a new VERSION; activating it purges the old cache).
//   • Fully guarded: where service workers are unavailable (some in-app browsers) this just no-ops.
if (typeof window !== 'undefined' && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator && !window.Capacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
