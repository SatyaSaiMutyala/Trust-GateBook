/* TruSentinel service worker: shows web push alerts and opens the right page when one is tapped. */

/** Where a notification opens, from its `data { type, id }`. */
function urlFor(data) {
  const id = encodeURIComponent(data?.id ?? '');
  switch (data?.type) {
    case 'incident':
      return `/incidents?open=${id}`;
    case 'expected':
      return `/expected?q=${id}`;
    case 'material':
      return '/material';
    case 'patrol':
      return '/patrol';
    case 'gen':
      return '/generator';
    case 'key':
      return '/keys';
    default:
      return '/notifications';
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg;
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: 'TruSentinel', body: event.data ? event.data.text() : '' };
  }
  const data = msg.data ?? {};
  event.waitUntil(
    self.registration.showNotification(msg.title || 'TruSentinel', {
      body: msg.body || '',
      icon: '/logo.png',
      badge: '/favicon.png',
      tag: data.notificationId || undefined,
      requireInteraction: !!msg.alarm,
      vibrate: msg.alarm ? [600, 200, 600, 200, 900] : [200],
      data: { ...data, url: urlFor(data) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          w.postMessage({ type: 'open', url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
