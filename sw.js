// Preview-only neutral service worker.
// The captured original site's offline cache can otherwise keep serving
// authenticated SPA screens after a guest-mode update.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
