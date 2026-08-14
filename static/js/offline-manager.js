/**
 * Todo Golosina - Gestor Offline PWA (IndexedDB + Service Worker + Auto-Sync)
 */
const DB_NAME = 'TodoGolosinaDB';
const DB_VERSION = 1;

let db = null;

// 1. Inicialización de IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB no es soportado en este navegador. Se usará LocalStorage como fallback.');
      return resolve(null);
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains('productos')) {
        dbInstance.createObjectStore('productos', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('clientes')) {
        dbInstance.createObjectStore('clientes', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('ventas_pendientes')) {
        dbInstance.createObjectStore('ventas_pendientes', { autoIncrement: true });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => {
      console.error('Error al abrir IndexedDB:', e);
      resolve(null);
    };
  });
}

// 2. Guardar Venta en Cola Offline (IndexedDB con fallback a LocalStorage)
async function guardarVentaOffline(saleData) {
  return new Promise((resolve, reject) => {
    saleData.offline = true;
    saleData.fecha_local = saleData.fecha_local || new Date().toISOString();

    if (db) {
      try {
        const tx = db.transaction('ventas_pendientes', 'readwrite');
        const store = tx.objectStore('ventas_pendientes');
        const req = store.add(saleData);
        req.onsuccess = () => {
          console.log('✅ Venta guardada en IndexedDB (Cola Offline):', saleData);
          actualizarContadorOfflineUI();
          resolve(true);
        };
        req.onerror = (e) => {
          console.error('Error guardando en IndexedDB, usando fallback:', e);
          guardarVentaLocalStorage(saleData);
          resolve(true);
        };
      } catch (err) {
        guardarVentaLocalStorage(saleData);
        resolve(true);
      }
    } else {
      guardarVentaLocalStorage(saleData);
      resolve(true);
    }
  });
}

// Fallback LocalStorage
function guardarVentaLocalStorage(saleData) {
  try {
    const queue = JSON.parse(localStorage.getItem('ventas_pendientes_backup') || '[]');
    queue.push(saleData);
    localStorage.setItem('ventas_pendientes_backup', JSON.stringify(queue));
    console.log('✅ Venta guardada en LocalStorage (Fallback)');
    actualizarContadorOfflineUI();
  } catch (e) {
    console.error('Error al guardar en LocalStorage:', e);
  }
}

// Guardar registro de ventas fallidas permanentemente (auditoría / no bucle)
function guardarVentaConError(saleData, razonError) {
  try {
    const errorLog = JSON.parse(localStorage.getItem('ventas_error_log') || '[]');
    errorLog.push({
      fecha_intento: new Date().toISOString(),
      error: razonError,
      venta: saleData
    });
    // Mantener solo los últimos 50 errores
    if (errorLog.length > 50) errorLog.shift();
    localStorage.setItem('ventas_error_log', JSON.stringify(errorLog));
  } catch (e) {}
}

// Alias para compatibilidad con código existente
window.queueSale = guardarVentaOffline;
window.guardarVentaOffline = guardarVentaOffline;
window.guardarVentaConError = guardarVentaConError;

// 3. Sincronización de Ventas Offline hacia el Backend
let isSyncing = false;
async function sincronizarVentasOffline() {
  if (!navigator.onLine || isSyncing) return;
  isSyncing = true;

  console.log('🔄 Iniciando sincronización de ventas offline...');
  let totalSincronizadas = 0;

  // A. Sincronizar desde IndexedDB
  if (db) {
    const getPending = () => new Promise((resolve) => {
      try {
        const tx = db.transaction('ventas_pendientes', 'readonly');
        const store = tx.objectStore('ventas_pendientes');
        const items = [];
        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            items.push({ key: cursor.key, val: cursor.value });
            cursor.continue;
          } else {
            resolve(items);
          }
        };
      } catch (e) {
        resolve([]);
      }
    });

    const pending = await getPending();
    for (const item of pending) {
      const sale = { ...item.val };
      const key = item.key;

      delete sale.id;
      delete sale.ticket_number;

      try {
        const res = await fetch('/api/registrar_venta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sale)
        });

        if (res.ok) {
          const txDel = db.transaction('ventas_pendientes', 'readwrite');
          txDel.objectStore('ventas_pendientes').delete(key);
          totalSincronizadas++;
        } else {
          // Si el servidor responde con 4xx o 5xx (error del backend o de validación, no de red)
          let errorDetalle = `HTTP ${res.status}`;
          try {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const errData = await res.json();
              errorDetalle = errData.error || errData.mensaje || errorDetalle;
            } else {
              const rawText = await res.text();
              errorDetalle = `Error del servidor: ${rawText.substring(0, 60)}...`;
            }
          } catch (parseErr) {
            errorDetalle = `Error HTTP ${res.status}`;
          }

          console.error(`❌ [SYNC] Venta rechazada por el servidor (${errorDetalle}). Removiendo de cola activa para evitar bucle.`);
          
          // Eliminar de la cola de reintentos para romper el bucle infinito
          const txDel = db.transaction('ventas_pendientes', 'readwrite');
          txDel.objectStore('ventas_pendientes').delete(key);
          
          // Guardar en cola de errores permanentes para auditoría
          guardarVentaConError(sale, errorDetalle);
        }
      } catch (err) {
        // Solo un error de red real (sin conexión) detiene la sincronización para reintentar luego
        console.warn('⚠️ Fallo de red (sin conexión) durante la sincronización:', err.message || err);
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // B. Sincronizar desde LocalStorage fallback
  try {
    const queue = JSON.parse(localStorage.getItem('ventas_pendientes_backup') || '[]');
    if (queue.length > 0) {
      const remaining = [];
      for (const sale of queue) {
        try {
          const res = await fetch('/api/registrar_venta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sale)
          });
          if (res.ok) {
            totalSincronizadas++;
          } else {
            let errorDetalle = `HTTP ${res.status}`;
            try {
              const contentType = res.headers.get('content-type') || '';
              if (contentType.includes('application/json')) {
                const errData = await res.json();
                errorDetalle = errData.error || errData.mensaje || errorDetalle;
              } else {
                const rawText = await res.text();
                errorDetalle = `Error del servidor: ${rawText.substring(0, 60)}...`;
              }
            } catch (e) {}
            console.error(`❌ [SYNC-LS] Venta rechazada (${errorDetalle}). Removiendo de cola.`);
            guardarVentaConError(sale, errorDetalle);
          }
        } catch (e) {
          // Error de red real
          remaining.push(sale);
        }
      }
      localStorage.setItem('ventas_pendientes_backup', JSON.stringify(remaining));
    }
  } catch (e) {
    console.error('Error sincronizando fallback LocalStorage:', e);
  }

  isSyncing = false;
  actualizarContadorOfflineUI();

  if (totalSincronizadas > 0) {
    console.log(`✅ ${totalSincronizadas} ventas offline sincronizadas con éxito.`);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `✅ Sincronización exitosa: ${totalSincronizadas} venta(s) enviadas al servidor.`,
        showConfirmButton: false,
        timer: 4000
      });
    }
    // Si existe la función de cargar dashboard o reportes, actualizar
    if (typeof cargarDashboard === 'function') {
      cargarDashboard();
    }
  }
}

window.sincronizarVentasOffline = sincronizarVentasOffline;
window.syncPendingSales = sincronizarVentasOffline;

// 4. Actualizar Indicador Visual en la interfaz
async function actualizarContadorOfflineUI() {
  const ind = document.getElementById('offline-indicator');
  let pendientesCount = 0;

  if (db) {
    try {
      pendientesCount = await new Promise((resolve) => {
        const tx = db.transaction('ventas_pendientes', 'readonly');
        const req = tx.objectStore('ventas_pendientes').count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
    } catch (e) {}
  }

  try {
    const lsCount = JSON.parse(localStorage.getItem('ventas_pendientes_backup') || '[]').length;
    pendientesCount += lsCount;
  } catch (e) {}

  if (ind) {
    if (!navigator.onLine) {
      ind.className = 'badge bg-warning text-dark px-3 py-2';
      ind.innerHTML = `<i class="bi bi-wifi-off me-1"></i> Modo Offline ${pendientesCount > 0 ? `(${pendientesCount} pendientes)` : ''}`;
    } else if (pendientesCount > 0) {
      ind.className = 'badge bg-info text-dark px-3 py-2';
      ind.innerHTML = `<i class="bi bi-cloud-arrow-up me-1"></i> Sincronizando (${pendientesCount} pendientes)...`;
    } else {
      ind.className = 'badge bg-success px-3 py-2';
      ind.innerHTML = '<i class="bi bi-wifi me-1"></i> En línea';
    }
  }
}

// 5. Escuchar eventos de Conectividad en tiempo real
window.addEventListener('online', () => {
  console.log('🟢 Conexión a Internet restablecida.');
  actualizarContadorOfflineUI();
  sincronizarVentasOffline();
  if (typeof syncData === 'function') syncData();
});

window.addEventListener('offline', () => {
  console.warn('🔴 Conexión a Internet perdida. Activando modo offline...');
  actualizarContadorOfflineUI();
});

// 6. Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('✅ Service Worker registrado con éxito. Scope:', reg.scope);
      })
      .catch((err) => {
        console.error('❌ Error al registrar el Service Worker:', err);
      });
  });
}

// 7. Inicialización en carga de página
initDB().then(() => {
  actualizarContadorOfflineUI();
  if (navigator.onLine) {
    sincronizarVentasOffline();
  }
});
