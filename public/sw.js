const CACHE_NAME = 'go-toolkit-mobile-v1';
const ASSETS = [
    './mobile',
    './styles/style.css',
    './js/scan.js',
    './js/config.js',
    './js/ia-config.js',
    './js/ia-client.js',
    './js/share-worker-client.js',
    './js/voice-transcript.js',
    './data/prompt.js',
    './img/logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Use cache.addAll but catch individual errors if one asset fails
            return Promise.allSettled(ASSETS.map(asset =>
                fetch(asset).then(response => {
                    if (!response.ok) throw new Error(`Offline asset error: ${asset}`);
                    return cache.put(asset, response);
                })
            ));
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests and same-origin or specific assets
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) return response;
            return fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./mobile');
                }
                return new Response('', { status: 504 });
            });
        })
    );
});
