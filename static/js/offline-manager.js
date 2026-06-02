const DB_NAME = 'TodoGolosinaDB';
const DB_VERSION = 1;

let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('productos')) db.createObjectStore('productos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('clientes')) db.createObjectStore('clientes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ventas_pendientes')) db.createObjectStore('ventas_pendientes', { autoIncrement: true });
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e);
  });
}

async function syncData() {
  if (!navigator.onLine) return;
  try {
    const [resProds, resClis] = await Promise.all([
      fetch('/api/productos').then(r => r.json()),
      fetch('/obtener_clientes').then(r => r.json())
    ]);

    if (resProds.productos) {
      const tx = db.transaction('productos', 'readwrite');
      const store = tx.objectStore('productos');
      store.clear();
      resProds.productos.forEach(p => store.add(p));
    }
    if (resClis.clientes) {
      const tx = db.transaction('clientes', 'readwrite');
      const store = tx.objectStore('clientes');
      store.clear();
      resClis.clientes.forEach(c => store.add(c));
    }
    console.log('Offline Sync: Data updated');
  } catch (e) {
    console.error('Offline Sync Error:', e);
  }
}

async function searchLocalProducts(q) {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result;
      const filtered = all.filter(p => 
        p.nombre.toLowerCase().includes(q.toLowerCase()) || 
        (p.codigo_barra && p.codigo_barra.includes(q))
      ).slice(0, 30);
      resolve(filtered);
    };
  });
}

async function searchLocalClients(q) {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const tx = db.transaction('clientes', 'readonly');
    const store = tx.objectStore('clientes');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result;
      const filtered = all.filter(c => 
        c.nombre.toLowerCase().includes(q.toLowerCase()) || 
        (c.cuit && c.cuit.includes(q))
      );
      resolve(filtered);
    };
  });
}

async function getLocalClientById(id) {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    const tx = db.transaction('clientes', 'readonly');
    const store = tx.objectStore('clientes');
    const request = store.get(parseInt(id));
    request.onsuccess = () => resolve(request.result);
  });
}

async function queueSale(saleData) {
  const tx = db.transaction('ventas_pendientes', 'readwrite');
  const store = tx.objectStore('ventas_pendientes');
  store.add(saleData);
  console.log('Venta guardada localmente (Offline)');
}

async function syncPendingSales() {
  if (!navigator.onLine) return;

  const getPending = () => new Promise((resolve) => {
    const tx = db.transaction('ventas_pendientes', 'readonly');
    const store = tx.objectStore('ventas_pendientes');
    const items = [];
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        items.push({ key: cursor.key, val: cursor.value });
        cursor.continue();
      } else {
        resolve(items);
      }
    };
  });

  const pending = await getPending();
  if (pending.length === 0) return;

  console.log(`Sincronizando ${pending.length} ventas pendientes...`);

  for (const item of pending) {
    const sale = item.val;
    const key = item.key;

    // Prevención de colisión de IDs
    delete sale.id;
    delete sale.ticket_number;

    try {
      const res = await fetch('/api/registrar_venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sale)
      });
      
      if (res.ok) {
        // Limpieza segura de la cola local
        const txDel = db.transaction('ventas_pendientes', 'readwrite');
        txDel.objectStore('ventas_pendientes').delete(key);
      } else {
        console.warn("Error del servidor, se reintentará luego:", await res.text());
        continue;
      }
    } catch (e) {
      console.error("Error de red sincronizando venta individual:", e);
      continue;
    }
    
    // Retraso para no saturar el servidor
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('Proceso de sincronización finalizado');
}

window.addEventListener('online', () => {
  const ind = document.getElementById('offline-indicator');
  if (ind) {
    ind.className = 'badge bg-success';
    ind.innerHTML = '<i class="bi bi-wifi"></i> Conectado';
  }
  syncPendingSales();
  syncData();
});

window.addEventListener('offline', () => {
  const ind = document.getElementById('offline-indicator');
  if (ind) {
    ind.className = 'badge bg-warning text-dark';
    ind.innerHTML = '<i class="bi bi-wifi-off"></i> Trabajando Offline';
  }
});

// Inicialización
initDB().then(() => {
  syncData();
  syncPendingSales();
});
