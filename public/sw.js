// Offline service worker for the GitHub Pages web build. Registered from registerSW.js (web only;
// skipped inside Capacitor). Deliberately conservative so it can NEVER serve stale content online:
//
//   • Network-first for the page (HTML), gametext.txt and manifest.json  →  online always fresh;
//     offline falls back to the last cached copy.
//   • Cache-first for everything else in this folder (the content-hashed JS/CSS bundle, icons,
//     sprites)  →  fast repeat loads + offline, and hashed filenames make stale impossible.
//   • One versioned cache. build-variants stamps a fresh VERSION into every deployed copy, so each
//     redeploy activates a new worker that purges the old cache (no unbounded growth, no staleness).
//   • Scoped to THIS folder only (each variant ships its own sw.js), so variants never collide.
//
// If anything goes wrong (offline + uncached, unsupported API), it fails exactly as it would with
// no service worker at all.

const VERSION = '__SW_VERSION__';
const CACHE = `app-${VERSION}`;
const SCOPE_PATH = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

// HTML / gametext / manifest are mutable across deploys → always try the network first.
function isMutable(url, request) {
  const p = url.pathname;
  return request.mode === 'navigate'
    || p.endsWith('/')
    || p.endsWith('.html')
    || p.endsWith('/gametext.txt')
    || p.endsWith('/manifest.json');
}

// Only store clean, same-origin, non-redirected 200s (caching a redirected/opaque response throws).
function cacheable(res) {
  return res && res.ok && res.type === 'basic' && !res.redirected;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const idx = (await cache.match('index.html')) || (await cache.match('./'));
      if (idx) return idx;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheable(res)) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // never touch cross-origin
  if (!url.pathname.startsWith(SCOPE_PATH)) return;   // only our own folder
  if (url.pathname.endsWith('/sw.js')) return;        // never cache the worker itself
  event.respondWith(isMutable(url, request) ? networkFirst(request) : cacheFirst(request));
});
