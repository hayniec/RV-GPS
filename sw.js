/**
 * RV SafeNavigate - Progressive Web App Service Worker
 * Provides offline application shell caching and offline map persistence
 */

const CACHE_NAME = 'rv-safenav-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './config.js',
    './native.js',
    './auth.js',
    './weather.js',
    './app.js',
    './router.js',
    './parking.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline app shell');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[ServiceWorker] Some assets could not be cached immediately:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && key !== 'rv-offline-tiles') {
                        console.log('[ServiceWorker] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass live APIs from service worker interception
    if (url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('rainviewer.com') ||
        url.hostname.includes('stadiamaps.com') ||
        url.hostname.includes('openstreetmap.org')) {
        return;
    }

    // Network-first for HTML / Navigation so UI updates load immediately
    if (event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/') {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const cloned = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match('./index.html') || caches.match('/');
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached shell, update in background if online
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {/* Offline */});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                return networkResponse;
            }).catch(() => {
                // If offline and requesting navigation, return index.html
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
