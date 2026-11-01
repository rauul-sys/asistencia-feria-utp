// Guarda la app en el celular para que funcione sin internet en la feria.
// Al publicar cambios, sube el número de CACHE para que los celulares tomen la versión nueva.
const CACHE = 'asistencia-utp-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'carreras.js',
  'manifest.webmanifest',
  'lib/html5-qrcode.min.js',
  'lib/xlsx.mini.min.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Responde primero con lo guardado y actualiza en segundo plano cuando hay internet.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const fuentes = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!propio && !fuentes) return;

  const red = fetch(req)
    .then(async (res) => {
      if (res.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => null);
  e.waitUntil(red);

  e.respondWith(
    caches.match(req, { ignoreSearch: propio })
      .then((guardado) => guardado || red)
      .then((res) => res || (req.mode === 'navigate' ? caches.match('index.html') : null))
      .then((res) => res || Response.error()),
  );
});
