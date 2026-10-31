/* Sharps Exchange service worker: lets the app install and open instantly. Live data always comes from the network. */
const CACHE = 'sharps-shell-v3';
const SHELL = ['./', 'index.html', 'sx3-manifest.webmanifest', 'sx3-icon-192.png', 'sx3-icon-512.png', 'sx3-apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;          // never touch the database, fonts or CDN
  if (r.mode === 'navigate') {                                                   // the page: newest from the network, cached copy if offline
    e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(hit => { const net = fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => hit); return hit || net; }));
});
