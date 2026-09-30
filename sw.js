/* Piyu service worker: works offline, but never serves an old app while online. Network first (a 304 is tiny), the cached copy only if the network fails or is slower than 2.5 s. */
const V = 'piyu-v3', F = ['./', 'index.html', 'style.css', 'core.js', 'store.js', 'mind.js', 'translit.js', 'voicekit.js', 'ocr.js', 'media.js', 'i18n.js', 'native.js', 'app.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(F)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/tts' || u.pathname.startsWith('/apk/')) return;   // data and voice always go to the server
  e.respondWith(new Promise(res => {
    let done = false; const fromCache = () => caches.match(r).then(h => { if (h && !done) { done = true; res(h); } });
    const t = setTimeout(fromCache, 2500);
    fetch(r).then(n => { clearTimeout(t); if (done) return; done = true; if (n.ok) { const c = n.clone(); caches.open(V).then(x => x.put(r, c)); } res(n); })
      .catch(() => { clearTimeout(t); caches.match(r).then(h => { if (!done) { done = true; res(h || Response.error()); } }); });
  }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('./'))); });
