const CACHE_NAME = 'go-toolkit-hub-v1';
const ASSETS = [
  'hub.html',
  'styles/style.css',
  'js/scan.js',
  'js/config.js',
  'js/ia-config.js',
  'js/ia-client.js',
  'js/share-worker-client.js',
  'js/voice-transcript.js',
  'img/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
