// ModusHO Service Worker — predisposizione PWA
// Non attivare cache o intercettazione fetch in questa versione
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
