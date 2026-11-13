// Bump this on any sw.js change so browsers install the new worker.
const CACHE_VERSION = 'v4-owncaches';
const CACHE_NAME = `ballengine-cache-${self.location.hostname}-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Evict only this worker's own older caches. The page keeps caches of its own on this
          // origin (emp-video-cache-v2 for the review queue, ballengine-hero-media for the hero
          // reels), and deleting everything that is not CACHE_NAME wiped those on every update.
          const ours = cacheName.startsWith('ballengine-cache-') || cacheName.startsWith('fun-circle-cache-');
          if (ours && cacheName !== CACHE_NAME) {
            console.log('SW: Deleting outdated/cross-host cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Is this a hashed build asset whose response MUST be JS/CSS?
function isHashedAsset(pathname) {
  return /^\/assets\/.+\.(?:js|mjs|css)$/.test(pathname);
}

self.addEventListener('fetch', (event) => {
  // Only intercept same-origin requests to avoid security/CORS blocks on external CDNs (e.g., Paddle, PayPal)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return; // Bypass Service Worker
  }

  // Bypass for local development to avoid blocking Vite HMR or local requests
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return; // Bypass Service Worker
  }

  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Only GET requests are ever cacheable/healable. NEVER intercept POST/PUT/PATCH/DELETE — these
  // are dynamic writes (video-publish uploads, scheduler jobs, auth). Re-issuing an upload POST
  // through the SW's fetch-wrap can corrupt/drop the request body and surface as "Failed to fetch",
  // and the catch-all below would otherwise mask the real server response with a synthetic 408.
  if (event.request.method !== 'GET') {
    return; // Bypass Service Worker — let the browser send the request natively
  }

  // Never route API calls through the SW either. They are dynamic and must never be cached; the
  // browser handles them (and their errors) far better than our passthrough wrapper.
  if (url.pathname.startsWith('/api/')) {
    return; // Bypass Service Worker
  }

  // ── Poisoned-asset self-heal ──────────────────────────────────────────────
  // A deploy-propagation race can make an /assets/*.{js,css} request transiently
  // return the SPA-fallback HTML. Because those assets are served immutable/1y, the
  // browser then caches that HTML *as the JS/CSS for a year*, so every later module
  // import gets HTML → fails (undefined default) → the whole app shows "Couldn't load
  // this page", and it never revalidates. The client index.html heal only covers
  // <script>/<link> tags, not dynamic-import chunks. Here we cover ALL of them:
  // fetch normally, and if a hashed asset comes back as HTML, re-fetch it bypassing
  // the HTTP cache (cache:'reload') to pull fresh bytes from the origin and overwrite
  // the poisoned entry. Non-poisoned assets keep their fast immutable cache path.
  if (isHashedAsset(url.pathname)) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(event.request);
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          return await fetch(event.request, { cache: 'reload' });
        }
        return resp;
      } catch (err) {
        try {
          return await fetch(event.request, { cache: 'reload' });
        } catch (e) {
          return new Response('Network error occurred', { status: 408, statusText: 'Network Error' });
        }
      }
    })());
    return;
  }

  event.respondWith(
    fetch(event.request).catch(err => {
      console.warn('SW fetch failed:', err);
      return new Response('Network error occurred', { status: 408, statusText: 'Network Error' });
    })
  );
});
