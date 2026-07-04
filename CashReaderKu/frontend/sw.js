const CACHE_NAME = 'cashreader-v2';
const ASSETS = [
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

// Tahap Install: Menyimpan aset penting ke dalam cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Tahap Fetch: Mengambil data dari cache jika sedang offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
