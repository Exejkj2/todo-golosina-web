// c:\Users\Exequiel\Desktop\todo-golosina-web\static\sw.js

const CACHE_NAME = 'todo-golosina-cache-v1';

// Lista de URLs estáticas que quieres cachear para acceso offline.
// Asegúrate de que estas rutas sean correctas y existan en tu proyecto.
// Las rutas relativas se resuelven desde la raíz del dominio.
const urlsToCache = [
  '/', // La página principal, si es estática o si quieres cachear la primera carga
  '/facturador', // La página del facturador
  '/static/css/bootstrap.min.css',
  '/static/js/sweetalert2.all.min.js',
  '/static/js/app-facturador.js',
  // Agrega aquí cualquier otro recurso estático crítico (CSS, JS, imágenes, fuentes)
  // Por ejemplo, si usas Bootstrap Icons localmente:
  // '/static/bootstrap-icons/bootstrap-icons.css',
  // '/static/bootstrap-icons/fonts/bootstrap-icons.woff',
  // '/static/bootstrap-icons/fonts/bootstrap-icons.woff2',
  // Si tienes un archivo style.css global:
  // '/static/css/style.css',
];

self.addEventListener('install', event => {
  console.log('SW: Evento de instalación.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Cache abierto, agregando URLs estáticas.');
        return cache.addAll(urlsToCache).catch(error => {
          console.error('SW: Fallo al cachear algunas URLs durante la instalación:', error);
          // Un fallo aquí no es crítico, el SW seguirá funcionando para otras URLs.
        });
      })
  );
});

self.addEventListener('activate', event => {
  console.log('SW: Evento de activación.');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Eliminando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // 1. BYPASS EN LOCALHOST
  // Si la petición es a 'localhost' o '127.0.0.1', el Service Worker NO la intercepta.
  // Esto es CRÍTICO para que el navegador se comunique directamente con tu servidor Flask local.
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    console.log(`SW: Bypass para petición local: ${requestUrl.href}`);
    return; // El Service Worker no responde, dejando que el navegador maneje la petición directamente.
  }

  // 2. MANEJO DE ERRORES OFFLINE para otras peticiones (ej. CDNs, APIs externas)
  // Para todas las demás peticiones (que no sean a localhost),
  // implementamos una estrategia de "Cache-First, Network-Fallback".
  // Primero intentamos servir desde la caché. Si no está, vamos a la red.
  // Si la red falla (estamos offline), el `catch` evita que el Service Worker se rompa.
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(error => {
        console.error(`SW: Fallo de red para ${requestUrl.href}. No hay caché disponible.`, error);
        // Puedes devolver una respuesta de fallback aquí si lo deseas,
        // por ejemplo, una página offline o un recurso de placeholder.
        // Para evitar que la aplicación se "rompa", devolvemos una respuesta de error 503.
        return new Response(null, { status: 503, statusText: 'Service Unavailable (Offline)' });
      })
  );
});