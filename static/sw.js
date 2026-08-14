// Service Worker para Facturador POS - Todo Golosina
const CACHE_NAME = 'todo-golosina-pos-v1';

// Recursos esenciales que se pre-cachean durante la instalación
const STATIC_ASSETS = [
  '/',
  '/facturador',
  '/static/css/bootstrap.min.css',
  '/static/css/bootstrap-icons.min.css',
  '/static/js/offline-manager.js',
  '/static/js/app-facturador.js?v=2.0.0',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap'
];

// Instalación: Pre-cacheo de recursos críticos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-cacheando recursos estáticos...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Algunos recursos fallaron al pre-cachear:', err);
      });
    })
  );
});

// Activación: Limpieza de cachés obsoletos y toma de control inmediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antiguo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Ignorar peticiones que no sean GET (como POST de registrar_venta)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Ignorar peticiones a endpoints de SSE o APIs en tiempo real si aplica
  if (url.pathname.startsWith('/sse') || url.pathname.startsWith('/api/sync-events')) {
    return;
  }

  // 3. Estrategia: "Network First, falling back to cache" para Vistas/Navegación HTML
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html') || url.pathname === '/facturador') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] Red no disponible, buscando vista en caché:', request.url);
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          
          // Fallback a /facturador si navegaba a la raíz u otra ruta
          const fallback = await caches.match('/facturador');
          if (fallback) return fallback;
          
          return caches.match('/');
        })
    );
    return;
  }

  // 4. Estrategia: "Cache First, falling back to network" para Recursos Estáticos (CSS, JS, Fuentes, Imágenes)
  if (
    url.pathname.startsWith('/static/') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Si está en caché, lo servimos de inmediato y actualizamos en segundo plano
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
              }
            })
            .catch(() => {}); // Si falla en background no pasa nada
          return cachedResponse;
        }

        // Si no estaba en caché, vamos a la red y lo guardamos
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 5. Para el resto de peticiones GET (APIs de productos, etc.), intentar red y fallback a caché
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
