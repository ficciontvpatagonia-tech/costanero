// Offline: la carta, las boyas y la app quedan guardadas; la situación del río se pide fresca y si no hay señal se usa la última.
const V = 'costanero-v13';
const BASE = ['./', 'index.html', 'estilo.css', 'app.js', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png',
  'datos/carta.geojson', 'datos/rios.geojson', 'datos/boyas.json', 'datos/clubes.json', 'datos/veriles.json', 'datos/pasos_mitre.json', 'datos/referencias.json', 'datos/profundidad.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(BASE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const fresco = e.request.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html') || u.pathname.endsWith('.js') || u.pathname.endsWith('.css') || u.pathname.endsWith('.webmanifest') || (u.pathname.includes('/datos/') && !u.pathname.endsWith('carta.geojson') && !u.pathname.endsWith('profundidad.json')) || u.hostname.includes('open-meteo');
  if (fresco) { // red primero, cache si no hay señal
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  } else { // cache primero (carta, app, fuentes)
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })));
  }
});
