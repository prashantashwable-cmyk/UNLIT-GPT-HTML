/* Offline support when the app is served over https (for example GitHub Pages).
   Opening AIEC-Elevator-OS.html directly from the phone works without this file. */
const CACHE = 'aiec-os-v27';
const NOTIFY = 'aiec-notify';
const SHELL = ['./', './index.html', './AIEC-Elevator-OS.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== NOTIFY).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* network first so updates arrive, cache when offline */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('./AIEC-Elevator-OS.html')))
  );
});

/* tapping a notification opens the app on the task list */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => 'focus' in x);
    if (c) { c.postMessage({ aiec: 'openTasks' }); return c.focus(); }
    return self.clients.openWindow('./AIEC-Elevator-OS.html');
  }));
});

/* background check (installed app, when the phone allows it): the app saves the times when waiting work
   moves up a level; here we show the ones that have passed. The phone decides how often this runs. */
self.addEventListener('periodicsync', e => { if (e.tag === 'aiec-check') e.waitUntil(showDue()); });
async function showDue() {
  const c = await caches.open(NOTIFY), r = await c.match('./aiec-notify.json');
  if (!r) return;
  const d = await r.json(), now = Date.now();
  const open = await self.clients.matchAll({ type: 'window' });
  if (open.some(x => x.visibilityState === 'visible')) return; /* the open app plays its own sound */
  let changed = false;
  for (const x of d.items || []) {
    if (x.shown || x.at > now) continue;
    await self.registration.showNotification(x.title, { body: x.body, tag: 'aiec-' + x.id, icon: 'icon-192.png', badge: 'icon-192.png', renotify: true, requireInteraction: x.kind === 'alarm', vibrate: x.kind === 'alarm' ? [400, 150, 400, 150, 800] : [200, 100, 200] });
    x.shown = true; changed = true;
  }
  if (changed) await c.put('./aiec-notify.json', new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } }));
}
