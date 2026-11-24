'use strict';
// Service worker : le site reste ouvert sans réseau (formulaire, marché, méthode déjà visités).
// Réseau d'abord, copie locale en secours. Jamais de mise en cache des API ni des pages privées.
const CACHE = 'valometra-v1';
const PRIVATE = ['/api/', '/gestion', '/mes-demandes', '/admin', '/my-requests', '/signin'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (PRIVATE.some(prefix => url.pathname.startsWith(prefix))) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate')
          return (await caches.match('/index.html')) ?? Response.error();
        return Response.error();
      }),
  );
});
