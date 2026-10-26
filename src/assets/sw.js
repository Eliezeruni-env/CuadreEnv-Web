// CuadreEnv POS - Service Worker v2.1 (Estrategia Freshness para APIs y Cache de Assets)
const CACHE_NAME = 'cuadreenv-pwa-v2.1';

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/manifest.webmanifest',
  '/favicon.ico',
  '/assets/brand/favicon-32x32.png',
  '/assets/brand/apple-touch-icon.png',
  '/assets/brand/android-chrome-192x192.png',
  '/assets/brand/android-chrome-512x512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of STATIC_PRECACHE) {
        try {
          await cache.add(url);
        } catch (err) {
          // Permite continuar aunque falle un recurso opcional en desarrollo
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Escuchar mensaje desde la app para activar nueva versión cuando el usuario confirma
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Ignorar peticiones no-HTTP(S) o que no sean GET (como chrome-extension://, moz-extension://)
  if (!event.request || event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  // 1. REGLA CRÍTICA DE FRESHNESS: APIs y llamadas dinámicas NUNCA se cachean en SW
  // (Las ventas offline se manejan en IndexedDB con pos-offline-sync.service)
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/v1') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.includes('/hub') ||
    url.pathname.includes('signalr')
  ) {
    return; // Bypass directo a red
  }

  // 2. Navegación SPA: servir index.html si está offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // 3. Assets estáticos (Scripts, estilos, imágenes, fuentes): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // En background actualizar cache si hay red
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse).catch(() => {});
            });
          }
        }).catch(() => {/* offline */});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache).catch(() => {});
        });
        return networkResponse;
      }).catch(() => {
        // Fallback básico para imágenes
        if (event.request.destination === 'image') {
          return caches.match('/assets/brand/favicon-32x32.png');
        }
      });
    })
  );
});
