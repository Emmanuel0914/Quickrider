const CACHE_NAME = 'quickrider-v1';

// Install the service worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Intercept network requests (Keeps the app from crashing if the network drops)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return new Response("Network anomaly. Please check your connection.");
        })
    );
});