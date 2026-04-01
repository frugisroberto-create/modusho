// ModusHO Service Worker — PWA + Push Notification

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification ricevuta
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'ModusHO', {
        body: data.body || '',
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        data: data.data || {},
        tag: data.data?.contentId || 'modusho',
      })
    );
  } catch (e) {
    console.error('[sw] Error parsing push data:', e);
  }
});

// Click su notifica — apre la SOP
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se c'è già una finestra aperta, naviga lì
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Altrimenti apri una nuova finestra
      return self.clients.openWindow(url);
    })
  );
});
