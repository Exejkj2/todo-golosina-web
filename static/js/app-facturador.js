// app-facturador.js - Lógica principal del Facturador (Versión CSP-Compliant)
// Todo Golosina POS System



// Global Variables
const horaCargaPantalla = new Date();
let salesTabs = [];
let activeTabId = null;
let cartSelectedIndex = -1;
let selectedProd = null;
let cobroModalOpen = false;
let currentSearchResults = [];
let searchSelectedIndex = -1;

let allClientes = [];
let currentCustResults = [];
let custSelectedIndex = -1;

let lastVentaId = null;
let lastVentaTotal = 0;
let postSaleSelectedIndex = 0;
let editingCustId = null;
let deudores = [];
let clienteIdAEliminar = null; // Para el modal de eliminación personalizado
let isProcessingVenta = false;
let procesandoMovimiento = false;

window.catalogoProductos = [];
window.cargandoCatalogo = false;
let currentCatalogoVersion = null;

async function verificarVersionCatalogo() {
  if (!navigator.onLine) return;
  try {
    const res = await fetch('/api/catalogo/version');
    if (!res.ok) return;
    const data = await res.json();
    if (currentCatalogoVersion === null) {
      currentCatalogoVersion = data.version;
    } else if (currentCatalogoVersion !== data.version) {
      currentCatalogoVersion = data.version;
      window.catalogoProductos = []; // Limpiamos caché
      await cargarCatalogoEnMemoria();
      const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true
      });
      Toast.fire({ icon: 'info', title: 'Catálogo actualizado' });
    }
  } catch(e) {
    console.error("Error verificando catálogo:", e);
  }
}
// Polling cada 2 minutos
setInterval(verificarVersionCatalogo, 120000);

async function cargarCatalogoEnMemoria(forceFull = false) {
  if (window.cargandoCatalogo) return;
  window.cargandoCatalogo = true;

  try {
    // 1. Si la memoria está vacía, restaurar de inmediato desde la caché local para carga instantánea
    if (!window.catalogoProductos || window.catalogoProductos.length === 0) {
      try {
        const localCached = JSON.parse(localStorage.getItem('catalogo_local_cache') || '[]');
        if (localCached.length > 0) {
          window.catalogoProductos = localCached;
          console.log(`Catálogo restaurado desde caché local: ${localCached.length} productos.`);
        }
      } catch (e) {}
    }

    // 2. Obtener fecha de última sincronización
    const ultimaSincro = forceFull ? null : localStorage.getItem('ultima_sincronizacion');
    let url = '/api/productos/catalogo_completo';
    if (ultimaSincro && window.catalogoProductos && window.catalogoProductos.length > 0) {
      url += `?ultima_fecha=${encodeURIComponent(ultimaSincro)}`;
    }

    const r = await fetch(url);
    const data = await r.json();

    if (data.ok && data.productos) {
      if (data.es_delta && window.catalogoProductos && window.catalogoProductos.length > 0) {
        console.log(`⚡ Sincronización Delta: ${data.productos.length} productos modificados/nuevos recibidos.`);
        
        // Mapa indexado para actualización eficiente O(1)
        const mapa = new Map(window.catalogoProductos.map(p => [p.id, p]));
        
        for (const item of data.productos) {
          if (item.activo === 0) {
            mapa.delete(item.id); // Producto eliminado o desactivado
          } else {
            mapa.set(item.id, item); // Insertar o actualizar
          }
        }
        window.catalogoProductos = Array.from(mapa.values());
      } else {
        // Carga completa inicial
        console.log(`📦 Carga Completa del Catálogo: ${data.productos.length} productos.`);
        window.catalogoProductos = data.productos.filter(p => p.activo !== 0);
      }

      // 3. Persistir en almacenamiento local y actualizar timestamp de sincronización
      try {
        localStorage.setItem('catalogo_local_cache', JSON.stringify(window.catalogoProductos));
        if (data.timestamp_servidor) {
          localStorage.setItem('ultima_sincronizacion', data.timestamp_servidor);
        }
      } catch (e) {
        console.warn("Aviso al guardar catálogo en LocalStorage:", e);
      }
    }

    // 4. Pre-instanciación asíncrona de modales en memoria (sin bloquear el hilo principal)
    setTimeout(precargarModalesEnMemoria, 50);
  } catch (err) {
    console.error("Error en sincronización de catálogo (Delta):", err);
  } finally {
    window.cargandoCatalogo = false;
  }
}

// ─── Instanciación y Caché en Memoria de Modales Bootstrap ───
window.modalCache = window.modalCache || {};

function precargarModalesEnMemoria() {
  const modalIds = [
    'searchModal',
    'cobroModal',
    'custModal',
    'editCustModal',
    'modalOpcionesVenta',
    'modal-nuevo-cliente-rapido',
    'modal-registrar-pago',
    'gastoModal',
    'modalEliminarCliente',
    'postSaleModal',
    'modal-descuento-articulo',
    'modal-abrir-caja',
    'modalExitoVenta'
  ];

  for (const id of modalIds) {
    if (!window.modalCache[id]) {
      const el = document.getElementById(id);
      if (el && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        window.modalCache[id] = new bootstrap.Modal(el);
      }
    }
  }
}

// Helper optimizado: Recupera directamente la instancia pre-cargada en memoria O(1)
function getModal(id) {
  if (window.modalCache && window.modalCache[id]) {
    return window.modalCache[id];
  }
  const el = document.getElementById(id);
  if (!el) {
    console.error(`Modal no encontrado: #${id}`);
    return null;
  }
  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    const instance = new bootstrap.Modal(el);
    window.modalCache[id] = instance;
    return instance;
  }
  return null;
}

// --- Network Status Handler ---
function updateNetworkStatus(isOnline) {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const offlineIndicator = document.getElementById('offline-indicator'); // Del offline-manager.js

  if (statusDot) {
    if (isOnline) {
      statusDot.classList.remove('status-dot-offline');
      statusDot.style.backgroundColor = '#198754'; // Verde
      statusDot.title = 'Conectado';
    } else {
      statusDot.classList.add('status-dot-offline');
      statusDot.style.removeProperty('background-color'); // Deja actuar al estilo .status-dot-offline (rojo parpadeante)
      statusDot.title = 'Trabajando Offline';
    }
  }

  if (statusText) {
    if (isOnline) {
      statusText.innerHTML = 'EN LÍNEA (NUBE)';
    } else {
      statusText.innerHTML = '<b>MODO OFFLINE (LOCAL)</b>';
    }
  }

  if (offlineIndicator) {
    if (isOnline) {
      offlineIndicator.className = 'badge bg-success';
      offlineIndicator.innerHTML = '<i class="bi bi-wifi"></i> Conectado';
    } else {
      offlineIndicator.className = 'badge bg-warning text-dark';
      offlineIndicator.innerHTML = '<i class="bi bi-wifi-off"></i> Trabajando Offline';
    }
  }

  // También actualizamos el switch de AFIP si existe
  const switchAfip = document.getElementById('toggleFacturaAfip');
  if (switchAfip) {
    if (!isOnline) {
      switchAfip.checked = false;
      switchAfip.disabled = true;
      switchAfip.closest('.form-check')?.querySelector('label')?.classList.add('text-muted');
    } else {
      switchAfip.disabled = false;
      switchAfip.closest('.form-check')?.querySelector('label')?.classList.remove('text-muted');
    }
  }
}

/**
 * Formatea un string a Title Case (Primera letra de cada palabra en Mayúscula)
 */
function toTitleCase(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}


// Initializations
function initApp() {
  console.log('Iniciando app (modales on-demand con getOrCreateInstance)...');

  try { initTabs(); } catch(e) { console.error("Error initTabs:", e); }
  try { loadAllClientes(); } catch(e) { console.error("Error loadAllClientes:", e); }
  try { cargarCatalogoEnMemoria(); } catch(e) { console.error("Error cargarCatalogoEnMemoria:", e); }

  updateClock();
  setInterval(updateClock, 1000);
  fetchWeather();
  cargarDashboard();
  setupEventListeners();
  verificarCaja();
  // Verificación inicial del estado de red al cargar la aplicación
  updateNetworkStatus(navigator.onLine);
}

// Tabs Management
function initTabs() {
  const saved = localStorage.getItem("todo_golosina_tabs");
  if (saved) {
    try {
      salesTabs = JSON.parse(saved);
      activeTabId = localStorage.getItem("todo_golosina_active_tab");
      if (!salesTabs.find((t) => t.id == activeTabId)) {
        activeTabId = salesTabs[0]?.id;
      }
    } catch (e) {
      console.error("Error cargando pestañas:", e);
      salesTabs = [];
    }
  }

  if (salesTabs.length === 0) {
    createNewTab(false);
  } else {
    renderTabs();
    renderCart();
  }
}

function createNewTab(shouldSwitch = true) {
  const id = Date.now().toString();
  const num = salesTabs.length + 1;
  const newTab = {
    id: id,
    name: `Venta ${num}`,
    cart: [],
    selectedCliente: {
      id: null,
      nombre: "Consumidor Final",
      iva: "CF",
      telefono: "",
    },
    generalDiscount: 0,
  };
  salesTabs.push(newTab);
  if (shouldSwitch) {
    activeTabId = id;
  } else if (!activeTabId) {
    activeTabId = id;
  }
  saveTabsToLocal();
  renderTabs();
  renderCart();
}

function switchTab(id) {
  activeTabId = id;
  saveTabsToLocal();
  renderTabs();
  renderCart();
  document.getElementById("scannerInput")?.focus();
}

async function closeTab(id, e) {
  if (e) e.stopPropagation();
  const tab = salesTabs.find((t) => t.id == id);
  if (tab.cart.length > 0) {
    const ok = confirm(`¿Cerrar venta?\nLa "${tab.name}" tiene productos cargados. Se perderán si la cerrás.`);
    if (!ok) return;
  }

  salesTabs = salesTabs.filter((t) => t.id != id);
  if (salesTabs.length === 0) {
    createNewTab();
  } else if (activeTabId == id) {
    activeTabId = salesTabs[salesTabs.length - 1].id;
  }
  saveTabsToLocal();
  renderTabs();
  renderCart();
}

function renderTabs() {
  const bar = document.getElementById("tabsBar");
  if (!bar) return;
  const tabsHtml = salesTabs
    .map((t) => {
      const isActive = t.id == activeTabId;
      return `
    <div class="sale-tab ${isActive ? "active" : ""}" data-action="switchTab" data-id="${t.id}">
      <i class="bi bi-receipt"></i>
      <span>${t.selectedCliente.id ? t.selectedCliente.nombre : t.name}</span>
      <div class="close-tab" data-action="closeTab" data-id="${t.id}">
        <i class="bi bi-x"></i>
      </div>
    </div>
  `;
    })
    .join("");

  bar.innerHTML =
    tabsHtml +
    '<button class="btn-add-tab" data-action="newTab"><i class="bi bi-plus-circle-fill"></i></button>';
}

function saveTabsToLocal() {
  localStorage.setItem("todo_golosina_tabs", JSON.stringify(salesTabs));
  localStorage.setItem("todo_golosina_active_tab", activeTabId);
}

function getActiveTab() {
  return salesTabs.find((t) => t.id == activeTabId);
}

// Customers Management
async function loadAllClientes() {
  const body = document.getElementById("tabla-clientes-body");
  if (body)
    body.innerHTML =
      '<tr><td colspan="6" class="text-center p-4 text-primary fw-bold"><i class="bi bi-hourglass-split me-2"></i> Cargando clientes...</td></tr>';

  try {
    const r = await fetch("/obtener_clientes");
    const d = await r.json();
    allClientes = d.clientes || [];
    renderCustManager();
    if (typeof renderCusts === "function") {
      currentCustResults = allClientes;
      renderCusts(currentCustResults);
    }
  } catch (e) {
    console.error("Error crítico cargando clientes:", e);
    if (body)
      body.innerHTML =
        '<tr><td colspan="6" class="text-center p-4 text-danger">Error al cargar clientes</td></tr>';
  }
}

function renderCustManager() {
  const q = document.getElementById("custManagerSearch")?.value.toLowerCase() || "";
  const body = document.getElementById("tabla-clientes-body");
  if (!body) return;
  const filtered = allClientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(q) ||
      (c.cuit && c.cuit.includes(q)) ||
      (c.telefono && c.telefono.includes(q)),
  );

  body.innerHTML = filtered
    .map(
      (c) => `
  <tr>
    <td class="ps-4 py-3 fw-bold text-dark">${c.nombre}</td>
    <td class="py-3 text-muted">${c.cuit || "-"}</td>
    <td class="py-3"><span class="badge bg-light text-dark border">${c.condicion_iva || "CF"}</span></td>
    <td class="py-3">${c.telefono || "-"}</td>
    <td class="py-3 text-center fw-bold text-primary">${c.descuento_fijo || 0}%</td>
    <td class="text-end pe-4 py-3">
      <div class="d-flex justify-content-end gap-2">
        <button class="btn btn-sm btn-outline-primary border-0" data-action="editCust" data-json='${JSON.stringify(c).replace(/'/g, "&apos;")}' title="Editar">
          <i class="bi bi-pencil-square fs-5"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger border-0" data-action="deleteCust" data-id="${c.id}" title="Eliminar">
          <i class="bi bi-trash fs-5"></i>
        </button>
      </div>
    </td>
  </tr>
`,
    )
    .join("");
}

async function deleteCliente(id) {
  clienteIdAEliminar = id;
  getModal('modalEliminarCliente')?.show();
}

// Ejecuta la eliminación real (llamada desde el listener del botón del modal)
async function ejecutarEliminacionCliente() {
  if (!clienteIdAEliminar) return;
  
  try {
    const r = await fetch(`/api/clientes/${clienteIdAEliminar}`, { method: "DELETE" });
    const d = await r.json();
    
    getModal('modalEliminarCliente')?.hide();
    
    if (d.ok) {
      Swal.fire({
        icon: 'success',
        title: '¡Eliminado!',
        text: 'El cliente ha sido borrado permanentemente.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      loadAllClientes();
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: d.mensaje || "No se pudo eliminar" });
    }
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo conectar con el servidor' });
  } finally {
    clienteIdAEliminar = null;
  }
}

function openEditCustModal(c = null) {
  editingCustId = c ? c.id : null;
  const title = document.getElementById("editCustModalTitle");
  if (title) title.textContent = c ? "Editar Cliente" : "Nuevo Cliente";
  
  const fields = {
    "ecName": c ? c.nombre : "",
    "ecCuit": c ? c.cuit : "",
    "ecPhone": c ? c.telefono : "",
    "ecDir": c ? c.direccion : "",
    "ecIva": c ? (c.condicion_iva || "Consumidor Final") : "Consumidor Final",
    "ecDesc": c ? (c.descuento_fijo || 0) : 0
  };

  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
  
  getModal('editCustModal')?.show();
}

async function saveCustManager() {
  const data = {
    nombre: toTitleCase(document.getElementById("ecName").value.trim()),
    cuit: document.getElementById("ecCuit").value.trim(),
    telefono: document.getElementById("ecPhone").value.trim(),
    direccion: document.getElementById("ecDir").value.trim(),
    condicion_iva: document.getElementById("ecIva").value,
    descuento_fijo: parseFloat(document.getElementById("ecDesc").value) || 0,
  };

  if (!data.nombre) {
    alert("Campo requerido: El nombre del cliente es obligatorio.");
    return;
  }

  const isEditing = editingCustId !== null;
  const url = isEditing ? `/api/clientes/${editingCustId}` : "/api/clientes";
  const method = isEditing ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (d.ok) {
      getModal('editCustModal')?.hide();
      loadAllClientes();
      
      Swal.fire({
        icon: 'success',
        title: isEditing ? '💾 ¡Cambios guardados correctamente!' : '✅ ¡Cliente guardado exitosamente!',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: d.mensaje || "Problema al procesar" });
    }
  } catch (e) {
    console.error(e);
    alert("Error de red: No se pudo conectar");
  }
}

async function openCustModal() {
  currentCustResults = allClientes || [];
  custSelectedIndex = currentCustResults.length > 0 ? 0 : -1;
  renderCusts(currentCustResults);
  getModal('custModal')?.show();
  const cInput = document.getElementById("custSearchIn");
  if (cInput) {
    cInput.value = "";
    setTimeout(() => cInput.focus(), 20);
  }
  if (navigator.onLine && allClientes.length === 0) {
    loadAllClientes().then(() => {
      currentCustResults = allClientes;
      renderCusts(currentCustResults);
    });
  }
}

function renderCusts(list) {
  const b = document.getElementById("custResults");
  if (!b) return;
  b.innerHTML = list
    .map(
      (c, i) => `
  <tr data-action="selectCust" data-json='${JSON.stringify(c).replace(/'/g, "&apos;")}' 
      style="cursor:pointer; ${i === custSelectedIndex ? "background-color: #e2e8f0;" : ""}" 
      class="${i === custSelectedIndex ? "table-active" : ""}">
    <td class="ps-3 fw-bold">${c.nombre}</td>
    <td>${c.cuit || "-"}</td>
    <td><span class="badge bg-light text-dark border">${c.condicion_iva || "CF"}</span></td>
  </tr>
`,
    )
    .join("");

  const selectedRow = b.querySelector(".table-active");
  if (selectedRow) selectedRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function selectCust(c) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.selectedCliente = {
    id: c.id,
    nombre: c.nombre,
    iva: c.condicion_iva || "CF",
    telefono: c.telefono || "",
  };
  saveTabsToLocal();
  renderCart();
  getModal('custModal')?.hide();
}

async function saveNewCust() {
  // Función legada: podrías redirigirla a saveQuickCust o mantenerla
  const name = document.getElementById("newCustName")?.value.trim();
  if (!name) return;
  // ... lógica anterior ...
}

async function saveQuickCust(e) {
  if (e) e.preventDefault();
  const data = {
    nombre: toTitleCase(document.getElementById("qcName").value.trim()),
    cuit: document.getElementById("qcCuit").value.trim(),
    telefono: document.getElementById("qcPhone").value.trim(),
    direccion: document.getElementById("qcDir").value.trim(),
    condicion_iva: document.getElementById("qcIva").value,
    descuento_fijo: parseFloat(document.getElementById("qcDesc").value) || 0,
  };

  if (!data.nombre) { alert("Error: El nombre es obligatorio."); return; }

  try {
    const res = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (d.ok) {
      getModal('modal-nuevo-cliente-rapido')?.hide();
      await loadAllClientes(); 
      selectCust({ id: d.id, nombre: data.nombre, condicion_iva: data.condicion_iva });
      document.getElementById("quickCustForm").reset();
      
      Swal.fire({
        icon: 'success',
        title: '✅ ¡Cliente guardado exitosamente!',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });

      document.getElementById("scannerInput")?.focus();
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: d.mensaje || "Problema al crear cliente" });
    }
  } catch (e) {
    console.error(e);
    alert("Error de red");
  }
}

// UI Helpers
function updateClock() {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const hhmm = h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0");
  const hhmmss = hhmm + ":" + s.toString().padStart(2, "0");

  const clockH = document.getElementById("clockHeader");
  const bigC = document.getElementById("bigClock");
  if (clockH) clockH.textContent = hhmm;
  if (bigC) bigC.textContent = hhmmss;

  let greeting = "¡Hola!";
  if (h >= 5 && h < 13) greeting = "¡Buen día!";
  else if (h >= 13 && h < 20) greeting = "¡Buenas tardes!";
  else greeting = "¡Buenas noches!";

  const greetMsg = document.getElementById("greetingMsg");
  if (greetMsg) greetMsg.textContent = greeting;

  const options = { weekday: "long", day: "numeric", month: "long" };
  const fullD = document.getElementById("fullDate");
  if (fullD) fullD.textContent = d.toLocaleDateString("es-ES", options);
}

async function fetchWeather() {
  if (!navigator.onLine) return; // No intentar si no hay internet
  try {
    const res = await fetch("https://wttr.in/Aguilares,Tucuman?format=j1");
    const data = await res.json();
    const current = data.current_condition[0];
    const tempEl = document.getElementById("weatherTemp");
    const descEl = document.getElementById("weatherDesc");
    if (tempEl) tempEl.textContent = current.temp_C + "°";
    if (descEl) descEl.textContent = current.lang_es ? current.lang_es[0].value : current.weatherDesc[0].value;
  } catch (e) { console.log("Weather error", e); }
}

async function cargarDashboard() {
  try {
    const r = await fetch("/api/ventas_hoy");
    const d = await r.json();
    if (d.ok) {
      const vH = document.getElementById("dashVentasHoy");
      const tH = document.getElementById("dashTicketsHoy");
      const cH = document.getElementById("dashClientesHoy");
      const sH = document.getElementById("dashAlertasStock");

      if (vH && d.total_ventas !== undefined) vH.textContent = `$${Number(d.total_ventas).toLocaleString()}`;
      if (tH && d.tickets_hoy !== undefined) tH.textContent = d.tickets_hoy;
      if (cH && d.clientes_hoy !== undefined) cH.textContent = d.clientes_hoy;
      if (sH && d.alertas_stock !== undefined) {
        sH.textContent = d.alertas_stock;
        sH.parentElement.classList.toggle("text-danger", d.alertas_stock > 0);
      }
    }
  } catch (e) { console.log("Dash data error", e); }
}

function switchSection(section, btn) {
  if (section === "venta" && window.innerWidth <= 768) section = "mobileWarning";
  document.querySelectorAll(".sidebar-item").forEach((el) => el.classList.remove("active"));
  if (btn) btn.classList.add("active");
  document.querySelectorAll(".section-container, .section").forEach((el) => el.classList.remove("active"));
  const target = document.getElementById("section" + section.charAt(0).toUpperCase() + section.slice(1));
  if (target) target.classList.add("active");
  if (window.innerWidth <= 768) document.querySelector(".sidebar")?.classList.remove("active");

  if (section === "inicio") cargarDashboard();
  else if (section === "venta") setTimeout(() => document.getElementById("scannerInput")?.focus(), 100);
  else if (section === "ventas") cargarVentasDia();
  else if (section === "clientes") loadAllClientes();
  else if (section === "caja") cargarCajaPos();
  else if (section === "cobranzas") cargarDeudores();
}

// Sales & Cash Management
// Sales & Cash Management
async function cargarVentasDia() {
  const b = document.getElementById("ventasDiaBody");
  if (!b) return;
  b.innerHTML = '<tr><td colspan="4" class="text-center p-4">Cargando ventas...</td></tr>';
  
  let url = "/api/ventas_hoy";
  const fInicio = document.getElementById("fechaInicio")?.value;
  const fFin = document.getElementById("fechaFin")?.value;
  
  if (fInicio && fFin) {
      url += `?inicio=${fInicio}&fin=${fFin}`;
  }
  
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (d.ventas && d.ventas.length > 0) {
      b.innerHTML = d.ventas
        .map((v) => `
        <tr style="cursor: pointer;" onclick="seleccionarVenta(${v.id}, this)">
          <td class="ps-3 fw-bold">#${v.id}</td>
          <td>${v.hora} hs</td>
          <td><span class="badge bg-light text-dark border">${v.metodo_pago}</span></td>
          <td class="text-end pe-3 fw-bold">$${Number(v.total).toLocaleString()}</td>
        </tr>
      `).join("");
    } else {
      b.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-muted">No hay ventas registradas en el período seleccionado</td></tr>';
    }
  } catch (e) { 
    console.error(e);
    b.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-danger">Error al cargar</td></tr>'; 
  }
}

let ventaSeleccionadaId = null;

async function seleccionarVenta(id, element) {
  if (element) {
    document.querySelectorAll("#ventasDiaBody tr").forEach(tr => tr.classList.remove("table-active"));
    element.classList.add("table-active");
  }
  
  ventaSeleccionadaId = id;
  
  const msgPlaceholder = document.getElementById("mensajePlaceholder");
  const papelTicket = document.getElementById("papelTicket");
  const tkNumero = document.getElementById("tkNumero");
  const tkFecha = document.getElementById("tkFecha");
  const tkDetalles = document.getElementById("tkDetalles");
  const tkTotal = document.getElementById("tkTotal");
  
  const btnReimprimir = document.getElementById("btnReimprimir");
  const btnWA = document.getElementById("btnWAHistorialAislado");
  
  if (msgPlaceholder) msgPlaceholder.style.display = "none";
  if (papelTicket) papelTicket.style.display = "block";
  
  if (tkNumero) tkNumero.textContent = id;
  if (tkFecha) tkFecha.textContent = "Cargando...";
  if (tkDetalles) tkDetalles.innerHTML = '<div class="text-center py-3 text-muted">Obteniendo detalles de venta...</div>';
  if (tkTotal) tkTotal.textContent = "...";
  
  if (btnReimprimir) btnReimprimir.disabled = true;
  if (btnWA) btnWA.disabled = true;
  
  fetch(`/api/ventas/${id}`)
    .then(res => {
        if (!res.ok) throw new Error('Error en el servidor');
        return res.json();
    })
    .then(data => {
        // Llenar cabecera y total
        document.getElementById('tkNumero').textContent = data.id;
        document.getElementById('tkFecha').textContent = data.fecha;
        document.getElementById('tkTotal').textContent = data.total.toFixed(2);
        
        // Llenar detalles
        const contenedorDetalles = document.getElementById('tkDetalles');
        contenedorDetalles.innerHTML = ''; // Limpiar anteriores
        
        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                contenedorDetalles.innerHTML += `
                    <div class="d-flex justify-content-between" style="font-size: 0.9em;">
                        <span>${item.cantidad}x ${item.nombre}</span>
                        <span>$${item.subtotal.toFixed(2)}</span>
                    </div>
                `;
            });
        } else {
            contenedorDetalles.innerHTML = '<div class="text-center text-muted">Detalle de artículos no disponible (Venta antigua)</div>';
        }
        
        // Habilitar botones de acción
        document.getElementById('btnReimprimir').disabled = false;
        
        // Armar texto con saltos de línea literales (\n)
        let textoTicket = `*TODO GOLOSINA - Comprobante de Venta*\n\n`;
        textoTicket += `Ticket #${data.id} - Fecha: ${data.fecha}\n\n`;

        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                textoTicket += `- ${item.cantidad}x ${item.nombre} ($${item.subtotal.toFixed(2)})\n`;
            });
        } else {
            textoTicket += `- Detalle no disponible\n`;
        }
        textoTicket += `\n*TOTAL: $${data.total.toFixed(2)}*\n\n¡Gracias por tu compra!`;

        // Seleccionar el nuevo botón, inyectarle el texto pre-codificado y habilitarlo
        const btnWA = document.getElementById('btnWAHistorialAislado');
        if (btnWA) {
            btnWA.setAttribute('data-mensaje', encodeURIComponent(textoTicket));
            btnWA.disabled = false;
        }
    })
    .catch(error => {
        document.getElementById('tkDetalles').innerHTML = `<div class="text-danger text-center">${error.message}</div>`;
    });
}

function reimprimirTicket(id) {
  printTicket(id);
}

async function enviarTicketWA(id) {
  if (!id) return;
  try {
    const res = await fetch(`/api/ventas/${id}`);
    const data = await res.json();
    
    if (data && data.id) {
      const { value: typedPhone } = await Swal.fire({
        title: '📲 WhatsApp del Cliente',
        input: 'text',
        inputLabel: 'Número de teléfono (con código de área, ej: 3865123456)',
        inputPlaceholder: '3865123456',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Enviar'
      });
      
      if (typedPhone) {
        let numero = typedPhone.trim();
        if (numero.length === 10) {
          numero = '549' + numero;
        } else if (numero.length === 12 && numero.startsWith('54')) {
          // Ok
        } else if (numero.length === 13 && numero.startsWith('+54')) {
          numero = numero.replace('+', '');
        } else if (!numero.startsWith('54')) {
          numero = '54' + numero;
        }
        
        let textoTicket = `*TODO GOLOSINA - Comprobante de Venta* %0A%0A`;
        textoTicket += `*Ticket #:* ${data.id}%0A`;
        textoTicket += `*Fecha:* ${data.fecha}%0A`;
        textoTicket += `-----------------------------------%0A`;
        
        if (data.items && data.items.length > 0) {
          data.items.forEach(item => {
            textoTicket += `- ${item.cantidad}x ${item.nombre.toUpperCase()} ($${Number(item.subtotal).toLocaleString()})%0A`;
          });
        }
        
        textoTicket += `-----------------------------------%0A`;
        textoTicket += `*TOTAL: $${Number(data.total).toLocaleString()}*%0A%0A`;
        textoTicket += `¡Muchas gracias por su compra! 🍭🍬`;
        
        const url = `https://wa.me/${numero}?text=${textoTicket}`;
        window.open(url, '_blank');
      }
    } else {
      Swal.fire('Error', 'No se pudieron cargar los detalles de la venta', 'error');
    }
  } catch (error) {
    console.error("Error al enviar WhatsApp:", error);
    Swal.fire('Error', 'Hubo un error de conexión', 'error');
  }
}

async function cargarCajaPos() {
  try {
    const r = await fetch("/api/ventas_hoy");
    const d = await r.json();
    const cI = document.getElementById("cajaIngresos");
    const cE = document.getElementById("cajaEgresos");
    const cB = document.getElementById("cajaBalance");
    if (cI) cI.textContent = "$" + (d.total_ventas || 0).toLocaleString();
    if (cE) cE.textContent = "$" + (d.total_gastos || 0).toLocaleString();
    if (cB) {
      cB.textContent = "$" + (d.balance || 0).toLocaleString();
      if ((d.balance || 0) < 0) cB.classList.add("text-danger");
      else cB.classList.remove("text-danger");
    }

    const b = document.getElementById("cajaMovBody");
    if (!b) return;
    const movs = [];
    if (d.ventas) d.ventas.forEach((v) => movs.push({ tipo: "Ingreso", desc: `Venta #${v.id} (${v.metodo_pago})`, monto: v.total, hora: v.hora }));
    if (d.gastos) d.gastos.forEach((g) => movs.push({ tipo: "Egreso", desc: g.descripcion, monto: g.monto, hora: g.fecha }));
    movs.sort((a, b) => b.hora.localeCompare(a.hora));

    b.innerHTML = movs.map((m) => `
      <tr>
        <td class="ps-4">
          <span class="badge ${m.tipo === "Ingreso" ? "bg-success" : "bg-danger"}">${m.tipo}</span>
          <small class="text-muted ms-2">${m.hora}</small>
        </td>
        <td>${m.desc}</td>
        <td class="text-end pe-4 fw-bold ${m.tipo === "Ingreso" ? "text-success" : "text-danger"}">
          ${m.tipo === "Ingreso" ? "+" : "-"}$${Number(m.monto).toLocaleString()}
        </td>
      </tr>
    `).join("");
  } catch (e) { console.error("Error cargando caja:", e); }
}

function openGastoModal() {
  document.getElementById("gastoDesc").value = "";
  document.getElementById("gastoMonto").value = "";
  getModal('gastoModal')?.show();
  setTimeout(() => document.getElementById("gastoDesc")?.focus(), 500);
}

async function saveGasto() {
  const desc = document.getElementById("gastoDesc").value.trim();
  const monto = document.getElementById("gastoMonto").value;
  const cat = document.getElementById("gastoCat").value;
  if (!desc || !monto) { alert("Error: Completá descripción y monto"); return; }
  try {
    const res = await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descripcion: desc, monto: monto, categoria: cat }),
    });
    const d = await res.json();
    if (d.ok) {
      getModal('gastoModal')?.hide();
      cargarCajaPos();
      console.log("Gasto registrado");
    }
  } catch (e) { console.error(e); }
}

// Debt Collection
async function cargarDeudores() {
  const body = document.getElementById("deudoresBody");
  if (!body) return;
  body.innerHTML = '<tr><td colspan="4" class="text-center p-4">Cargando...</td></tr>';
  try {
    const r = await fetch("/api/clientes/deudores");
    const d = await r.json();
    if (d.ok) {
      deudores = d.clientes;
      renderDeudores(deudores);
      const total = deudores.reduce((acc, c) => acc + (c.saldo || 0), 0);
      const badge = document.getElementById("totalDeudaBadge");
      if (badge) badge.textContent = `Deuda Total Clientes: $${total.toLocaleString()}`;
    }
  } catch (e) { body.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-danger">Error</td></tr>'; }
}

function filtrarDeudores() {
  const q = document.getElementById("searchDeudores")?.value.toLowerCase() || "";
  const filtered = deudores.filter(c => c.nombre.toLowerCase().includes(q));
  renderDeudores(filtered);
}

function renderDeudores(list) {
  const body = document.getElementById("deudoresBody");
  if (!body) return;
  if (list.length === 0) { body.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-muted">No hay deudores</td></tr>'; return; }
  body.innerHTML = list.map(c => `
    <tr>
      <td class="ps-4 fw-bold">${c.nombre}</td>
      <td class="text-danger fw-black">$${(c.saldo || 0).toLocaleString()}</td>
      <td class="text-muted small">$${(c.limite_credito || 0).toLocaleString()}</td>
      <td class="text-end pe-4">
        <button class="btn btn-sm btn-success fw-bold" data-action="payDebt" data-id="${c.id}" data-nombre="${c.nombre.replace(/'/g, "")}" data-saldo="${c.saldo}">
          <i class="bi bi-cash-coin me-1"></i> REGISTRAR PAGO
        </button>
      </td>
    </tr>
  `).join('');
}

function abrirPagoModal(id, nombre, saldo) {
  const modalEl = document.getElementById("modal-registrar-pago");
  if (!modalEl) return;
  
  document.getElementById("pagoCustId").value = id;
  document.getElementById("pagoCustName").textContent = nombre;
  document.getElementById("pagoCustSaldo").textContent = `$${Number(saldo).toLocaleString()}`;
  document.getElementById("inputMontoPago").value = saldo; 
  
  getModal("modal-registrar-pago")?.show();
  setTimeout(() => {
    const input = document.getElementById("inputMontoPago");
    if (input) { input.focus(); input.select(); }
  }, 500);
}

async function registrarPagoCobranza() {
  const id = document.getElementById("pagoCustId").value;
  const nombre = document.getElementById("pagoCustName").textContent;
  const monto = parseFloat(document.getElementById("inputMontoPago").value);
  
  if (isNaN(monto) || monto <= 0) {
    Swal.fire({ icon: 'error', title: 'Monto inválido', text: 'Por favor ingrese un monto mayor a 0.' });
    return;
  }

  try {
    const res = await fetch("/api/clientes/registrar_pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: id, monto: monto })
    });
    const d = await res.json();
    if (d.ok) {
      getModal("modal-registrar-pago")?.hide();
      
      Swal.fire({
        icon: 'success',
        title: '💰 ¡Pago registrado con éxito!',
        text: `Nuevo saldo de ${nombre}: $${d.nuevo_saldo.toLocaleString()}`,
        timer: 3000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      
      agregarAlHistorialPagos(nombre, monto);
      cargarDeudores();
      
      setTimeout(() => document.getElementById("searchDeudores")?.focus(), 500);
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: d.mensaje || "No se pudo registrar el pago" });
    }
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo conectar con el servidor.' });
  }
}

function agregarAlHistorialPagos(nombre, monto) {
  const body = document.getElementById("pagosRecientesBody");
  if (!body) return;
  
  if (body.innerHTML.includes("No se registraron pagos")) {
    body.innerHTML = "";
  }
  
  const now = new Date();
  const fecha = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="ps-4 py-3 small text-muted">${fecha}</td>
    <td class="py-3 fw-bold text-dark">${nombre}</td>
    <td class="py-3 text-end pe-4 fw-black text-success">+$${Number(monto).toLocaleString()}</td>
  `;
  
  body.insertBefore(tr, body.firstChild);
}

// Cart & Scanning Logic
function addItem(p, qty) {
  const tab = getActiveTab();
  if (!tab) return;
  const ex = tab.cart.find((x) => x.id === p.id);
  if (ex) { 
    ex.qty += qty; 
    cartSelectedIndex = tab.cart.indexOf(ex); 
  } else { 
    tab.cart.push({ id: p.id, nombre: p.nombre, price: p.precio_lista_1, qty: qty, discount: 0 }); 
    cartSelectedIndex = tab.cart.length - 1; 
  }
  saveTabsToLocal();
  renderCart();
}

function remItem(id) {
  const tab = getActiveTab();
  if (!tab) return;
  // Usamos != para comparar string con number si es necesario
  tab.cart = tab.cart.filter(i => i.id != id);
  if (cartSelectedIndex >= tab.cart.length) cartSelectedIndex = tab.cart.length - 1;
  saveTabsToLocal();
  renderCart();
}

function eliminarItem(index) {
  const tab = getActiveTab();
  if (!tab || !tab.cart[index]) return;
  
  tab.cart.splice(index, 1);
  
  if (cartSelectedIndex >= tab.cart.length) {
    cartSelectedIndex = tab.cart.length - 1;
  }
  
  saveTabsToLocal();
  renderCart();
}

function updQty(id, qty) {
  const tab = getActiveTab();
  if (!tab) return;
  const item = tab.cart.find(i => i.id === id);
  if (item) {
    item.qty = Math.max(1, parseInt(qty) || 1);
    saveTabsToLocal();
    renderCart();
  }
}

function updDiscount(id, val) {
  const tab = getActiveTab();
  if (!tab) return;
  const item = tab.cart.find(i => i.id === id);
  if (item) {
    item.discount = Math.max(0, parseFloat(val) || 0);
    saveTabsToLocal();
    renderCart();
  }
}

function updGeneralDiscount(val) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.generalDiscount = Math.max(0, parseFloat(val) || 0);
  saveTabsToLocal();
  calcTotal();
}

function renderCart() {
  const tab = getActiveTab();
  if (!tab) return;
  const cN = document.getElementById("custName");
  const cI = document.getElementById("custIva");
  if (cN) cN.value = tab.selectedCliente.nombre;
  if (cI) cI.value = tab.selectedCliente.iva;

  const b = document.getElementById("cartBody");
  if (!b) return;
  b.innerHTML = tab.cart.map((item, i) => {
    const discountPerc = item.discount || 0;
    const montoDescuentoFila = item.price * (discountPerc / 100);
    const nuevoPrecioUnitario = item.price - montoDescuentoFila;
    const subtotalFila = nuevoPrecioUnitario * item.qty;

    return `
    <tr class="${i === cartSelectedIndex ? "table-active" : ""}" style="${i === cartSelectedIndex ? "background-color: #e2e8f0;" : ""}" data-index="${i}">
      <td class="text-muted text-start" style="font-size: 11px;">#${i + 1}</td>
      <td class="text-start">${toTitleCase(item.nombre)}</td>
      <td class="text-end">
        <input type="number" class="qty-input text-end" value="${item.qty}" min="1" data-action="updQty" data-id="${item.id}">
      </td>
      <td class="text-end price-text">
        ${discountPerc > 0 ? `<del class="text-muted small d-block">$${item.price.toLocaleString()}</del>` : ""}
        <span class="fw-bold">$${nuevoPrecioUnitario.toLocaleString()}</span>
      </td>
      <td class="text-end">
        <input type="number" class="qty-input w-100 text-end" value="${discountPerc}" min="0" max="100" data-action="updDiscount" data-id="${item.id}">
        ${discountPerc > 0 ? `<small class="text-success d-block" style="font-size: 0.7rem">-$${(montoDescuentoFila * item.qty).toLocaleString()}</small>` : ""}
      </td>
      <td class="text-end subtotal-text">$${subtotalFila.toLocaleString()}</td>
      <td class="text-center">
        <button class="btn btn-sm text-danger btn-light" data-action="eliminarItem" data-index="${i}" title="Eliminar artículo">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
  }).join("");

  const inputGD = document.getElementById("inputGeneralDiscount");
  if (inputGD) inputGD.value = tab.generalDiscount || 0;

  calcTotal();
  renderTabs();

  const cartSec = document.querySelector(".cart-section");
  if (cartSelectedIndex >= 0) {
    const rows = b.querySelectorAll("tr");
    if (rows[cartSelectedIndex]) rows[cartSelectedIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else if (cartSec) { cartSec.scrollTop = cartSec.scrollHeight; }
}

function calcTotal() {
  const tab = getActiveTab();
  if (!tab) return;
  
  const subtotalGeneral = tab.cart.reduce((acc, item) => {
    const nuevoPrecioUnit = item.price - (item.price * ((item.discount || 0) / 100));
    return acc + (nuevoPrecioUnit * item.qty);
  }, 0);

  const montoDescuentoGral = subtotalGeneral * ((tab.generalDiscount || 0) / 100);
  const tot = Math.max(0, subtotalGeneral - montoDescuentoGral);
  
  const gT = document.getElementById("grandTotal");
  if (gT) gT.textContent = `$${tot.toLocaleString()}`;

  const infoGral = document.getElementById("generalSavingsInfo");
  const spanGral = document.getElementById("monto-descuento-general");
  if (infoGral && spanGral) {
    if (tab.generalDiscount > 0) {
      infoGral.classList.remove("d-none");
      spanGral.textContent = `-$${montoDescuentoGral.toLocaleString()}`;
    } else {
      infoGral.classList.add("d-none");
    }
  }
}

function openCobro() {
  const tab = getActiveTab();
  if (!tab || tab.cart.length === 0) { alert("Carrito vacío: Agregá productos primero"); return; }

  const subtotalGeneral = tab.cart.reduce((acc, item) => {
    const nuevoPrecioUnit = item.price - (item.price * ((item.discount || 0) / 100));
    return acc + (nuevoPrecioUnit * item.qty);
  }, 0);
  const montoDescuentoGral = subtotalGeneral * ((tab.generalDiscount || 0) / 100);
  const tot = Math.max(0, subtotalGeneral - montoDescuentoGral);

  const mGT = document.getElementById("modalGrandTotal");
  if (mGT) mGT.textContent = `$${tot.toLocaleString()}`;

  // Reset inputs (multi-payment IDs from templates)
  const inputs = ["payEf", "payTr", "payDb", "payCc"];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  
  // Credit limit handle
  const payCc = document.getElementById("payCc");
  const ccWrap = payCc?.closest(".p-2");
  if (tab.selectedCliente.id) {
    if (ccWrap) ccWrap.classList.remove("opacity-50");
    if (payCc) payCc.disabled = false;
  } else {
    if (ccWrap) ccWrap.classList.add("opacity-50");
    if (payCc) { payCc.disabled = true; payCc.value = ""; }
  }

  calcMultiPago();
  cobroModalOpen = true;
  getModal('cobroModal')?.show();
  setTimeout(() => document.getElementById("payEf")?.focus(), 400);
}

function calcMultiPago() {
  const tab = getActiveTab();
  if (!tab) return;

  const subtotalGeneral = tab.cart.reduce((acc, item) => {
    const nuevoPrecioUnit = item.price - (item.price * ((item.discount || 0) / 100));
    return acc + (nuevoPrecioUnit * item.qty);
  }, 0);
  const montoDescuentoGral = subtotalGeneral * ((tab.generalDiscount || 0) / 100);
  const tot = Math.max(0, subtotalGeneral - montoDescuentoGral);
  
  const ef = parseFloat(document.getElementById("payEf")?.value) || 0;
  const tr = parseFloat(document.getElementById("payTr")?.value) || 0;
  const db = parseFloat(document.getElementById("payDb")?.value) || 0;
  const cc = parseFloat(document.getElementById("payCc")?.value) || 0;
  
  const sum = ef + tr + db + cc;
  const diferencia = sum - tot; // positivo = vuelto, negativo = resta

  const restaLabel = document.getElementById("restaLabel");
  const restaEl = document.getElementById("modalResta");
  const restaWrap = document.getElementById("restaWrap");

  if (!restaEl) return;

  if (diferencia < 0) {
    // Falta dinero — RESTA
    if (restaLabel) restaLabel.textContent = "Resta:";
    restaEl.textContent = `$${Math.abs(diferencia).toLocaleString()}`;
    restaEl.className = "m-0 fw-black text-danger";
    if (restaWrap) { restaWrap.style.background = "#fff8e1"; restaWrap.style.borderColor = "#ffd54f"; }
  } else if (diferencia > 0) {
    // Sobra dinero — VUELTO
    if (restaLabel) restaLabel.textContent = "Vuelto:";
    restaEl.textContent = `$${diferencia.toLocaleString()}`;
    restaEl.className = "m-0 fw-black text-success";
    if (restaWrap) { restaWrap.style.background = "#e8f5e9"; restaWrap.style.borderColor = "#66bb6a"; }
  } else {
    // Exacto
    if (restaLabel) restaLabel.textContent = "Resta:";
    restaEl.textContent = "$0";
    restaEl.className = "m-0 fw-black text-success";
    if (restaWrap) { restaWrap.style.background = "#fff8e1"; restaWrap.style.borderColor = "#ffd54f"; }
  }
}

const originalBtnConfirmar = document.getElementById("btnConfirmVenta");
if (originalBtnConfirmar) {
  const newBtn = originalBtnConfirmar.cloneNode(true);
  originalBtnConfirmar.replaceWith(newBtn);

  newBtn.addEventListener("click", async function(e) {
    if (e) e.preventDefault();
    if (isProcessingVenta) {
      console.log("⚠️ Intento de doble envío bloqueado por estado global.");
      return;
    }
    isProcessingVenta = true;
    
    // Deshabilitar botón para prevenir doble submit
    const originalBtnText = newBtn.innerHTML;
    newBtn.disabled = true;
    newBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Procesando...';

    try {
      const tab = getActiveTab();
      if (!tab || tab.cart.length === 0) return;

      const subtotalGeneral = tab.cart.reduce((acc, item) => {
        const nuevoPrecioUnit = item.price - (item.price * ((item.discount || 0) / 100));
        return acc + (nuevoPrecioUnit * item.qty);
      }, 0);
      const montoDescuentoGral = subtotalGeneral * ((tab.generalDiscount || 0) / 100);
      const tot = Math.max(0, subtotalGeneral - montoDescuentoGral);
      
      const ef = parseFloat(document.getElementById("payEf")?.value) || 0;
      const tr = parseFloat(document.getElementById("payTr")?.value) || 0;
      const db = parseFloat(document.getElementById("payDb")?.value) || 0;
      let cc = parseFloat(document.getElementById("payCc")?.value) || 0;
      
      // No permitir montos negativos
      if (ef < 0 || tr < 0 || db < 0 || cc < 0) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se permiten montos negativos.' });
        return;
      }

      const sumTotal = ef + tr + db + cc;

      // Lógica de Cuenta Corriente Automática
      let deudaCC = 0;
      if (sumTotal < tot) {
        if (!tab.selectedCliente.id) {
          // 1. Secuencia de Cierre: Ocultar modal de cobro para evitar solapamientos
          getModal('cobroModal')?.hide();

          // 2. Alerta de Error con Target y Z-Index de seguridad
          Swal.fire({
            icon: 'error',
            title: '⚠️ Cliente Requerido',
            text: 'Para vender a cuenta corriente debe identificar al comprador.',
            target: 'body',
            confirmButtonColor: '#fe3994'
          }).then(() => {
            // 3. Apertura Automática del selector de clientes
            getModal('custModal')?.show();
            
            // 4. Foco automático en el buscador para rapidez UX
            setTimeout(() => {
              document.getElementById("custSearchIn")?.focus();
            }, 500);
          });
          return;
        }
        deudaCC = tot - sumTotal;
        cc += deudaCC; // Sumamos la diferencia al pago por cuenta corriente
      }

      const switchAfip = document.getElementById('toggleFacturaAfip');
      // Seguridad: Si el indicador está en rojo (clase offline), forzamos quiereFactura a false
      const isActuallyOffline = document.getElementById('status-dot')?.classList.contains('status-dot-offline');
      const quiereFactura = (switchAfip && !isActuallyOffline) ? switchAfip.checked : false;

      const payload = {
        tipo: "Local",
        cliente_id: tab.selectedCliente.id,
        lista_precios: tab.selectedLista || 1,
        total_venta: tot,            // Total real de la venta (suma de artículos con descuentos)
        total: tot,                  // Alias mantenido por compatibilidad con rutas antiguas
        items: tab.cart.map((i) => {
          const nuevoPrecioUnit = i.price - (i.price * ((i.discount || 0) / 100));
          return { id: i.id, qty: i.qty, discount_perc: i.discount || 0, price_final: nuevoPrecioUnit };
        }),
        detalle: tab.cart.map((i) => {
          const nuevoPrecioUnit = i.price - (i.price * ((i.discount || 0) / 100));
          return { nombre: i.nombre, qty: i.qty, precio_unit: nuevoPrecioUnit, discount_perc: i.discount || 0, subtotal: nuevoPrecioUnit * i.qty };
        }),
        // pagos: montos REALES por medio de pago (el backend recortará el efectivo al total real)
        pagos: { efectivo: ef, transferencia: tr, debito: db, cc: cc },
        monto_entregado: ef + tr + db + cc, // Total físico entregado por el cliente (solo informativo)
        general_discount_perc: tab.generalDiscount || 0,
        general_savings: montoDescuentoGral,
        facturar_afip: quiereFactura
      };

      // Si no hay conexión detectada de antemano
      if (!navigator.onLine) {
        payload.offline = true;
        payload.fecha_local = new Date().toISOString();
        if (typeof guardarVentaOffline === "function") {
          await guardarVentaOffline(payload);
        } else if (typeof queueSale === "function") {
          await queueSale(payload);
        }
        Swal.fire({
          icon: 'info',
          title: 'Modo Offline',
          text: 'Venta guardada localmente (Modo Offline). Se sincronizará automáticamente cuando regrese internet.'
        });
        getModal('cobroModal')?.hide();
        resetFacturador();
        return;
      }

      try {
        const res = await fetch("/api/registrar_venta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const contentType = res.headers.get("content-type") || "";
          let errDetail = `Error HTTP ${res.status}`;
          if (contentType.includes("application/json")) {
            const errData = await res.json();
            errDetail = errData.error || errData.mensaje || errDetail;
          } else {
            const errText = await res.text();
            errDetail = `Error del servidor: ${errText.substring(0, 80)}...`;
          }
          
          if (res.status === 400) {
            Swal.fire({ icon: 'error', title: 'Producto no disponible', text: errDetail });
            if (typeof cargarCatalogoEnMemoria === 'function') {
              cargarCatalogoEnMemoria(true);
            }
          } else {
            Swal.fire({ icon: 'error', title: 'Error del Servidor', text: errDetail });
          }
          return;
        }

        const d = await res.json();
        if (d.ok || d.success) {
          getModal('cobroModal')?.hide();
          lastVentaId = d.venta_id; 
          lastVentaTotal = tot;
          
          // Notificación de éxito con detalle de CC si corresponde
          let successMsg = `Venta por $${tot.toLocaleString()} finalizada.`;
          if (deudaCC > 0) {
            successMsg = `✅ Venta completada. $${deudaCC.toLocaleString()} cargados a la cuenta corriente de ${tab.selectedCliente.nombre}.`;
          }

          Swal.fire({
            icon: 'success',
            title: '¡Venta Exitosa!',
            text: successMsg,
            timer: 4000,
            showConfirmButton: false
          });

          document.body.style.backgroundColor = "#dcfce7";
          setTimeout(() => (document.body.style.backgroundColor = ""), 300);
          
          // Abrir Modal de Opciones (Restaurado)
          getModal('modalOpcionesVenta')?.show();
          
          cargarDashboard(); 
        } else { 
          Swal.fire({ icon: 'error', title: 'Error', text: d.mensaje || d.error || 'Error al procesar la venta' });
        }
      } catch (fetchErr) {
        console.warn("Fallo de conexión en el envío de venta, guardando en cola offline...", fetchErr);
        payload.offline = true;
        payload.fecha_local = new Date().toISOString();
        if (typeof guardarVentaOffline === "function") {
          await guardarVentaOffline(payload);
        } else if (typeof queueSale === "function") {
          await queueSale(payload);
        }
        Swal.fire({
          icon: 'info',
          title: 'Modo Offline',
          text: 'Venta guardada localmente (Modo Offline). Se sincronizará automáticamente cuando regrese internet.'
        });
        getModal('cobroModal')?.hide();
        resetFacturador();
      }
    } catch (e) {
      console.error("Error general en el proceso de cobro:", e);
    } finally {
      isProcessingVenta = false;
      newBtn.disabled = false;
      newBtn.innerHTML = '<i class="bi bi-check-circle-fill me-2"></i> CONFIRMAR';
    }
  });
}

function abrirModalProductos() {
  selectedProd = null;
  searchSelectedIndex = -1;
  currentSearchResults = [];
  
  const dialog = document.querySelector("#searchModal .modal-dialog");
  if (dialog) {
    dialog.classList.remove("modal-xl");
    dialog.style.maxWidth = "550px";
  }
  document.getElementById("stepSearch")?.classList.remove("d-none");
  document.getElementById("stepQty")?.classList.add("d-none");
  
  const mS = document.getElementById("modalSearchIn");
  if (mS) {
    mS.value = "";
  }

  // Apertura instantánea 0ms
  getModal('searchModal')?.show();
  if (mS) {
    setTimeout(() => mS.focus(), 20);
  }

  // Renderizado ultrarrápido inicial (máx 25 elementos para no saturar el DOM)
  if (window.catalogoProductos && window.catalogoProductos.length > 0) {
    renderizarResultadosLocales(window.catalogoProductos.slice(0, 25));
  } else {
    const results = document.getElementById("modalResults");
    if (results) {
      results.innerHTML = '<tr><td colspan="2" class="text-center p-4"><span class="spinner-border spinner-border-sm me-2"></span>Cargando catálogo...</td></tr>';
    }
    cargarCatalogoEnMemoria().then(() => {
      if (window.catalogoProductos && window.catalogoProductos.length > 0) {
        renderizarResultadosLocales(window.catalogoProductos.slice(0, 25));
      }
    });
  }
}

function askQty(p) {
  selectedProd = p;
  const nameEl = document.getElementById("qtyProdName");
  if (nameEl) nameEl.textContent = p.nombre;
  
  const dialog = document.querySelector("#searchModal .modal-dialog");
  if (dialog) {
    dialog.classList.remove("modal-xl");
    dialog.style.maxWidth = "350px";
  }
  document.getElementById("stepSearch")?.classList.add("d-none");
  document.getElementById("stepQty")?.classList.remove("d-none");
  
  const mQ = document.getElementById("modalQtyIn");
  if (mQ) {
    mQ.value = 1;
    setTimeout(() => { mQ.focus(); mQ.select(); }, 100);
  }
}

function updateSearchHighlight() {
  const results = document.getElementById("modalResults");
  if (!results) return;
  const rows = results.querySelectorAll("tr");
  rows.forEach((r, i) => {
    if (i === searchSelectedIndex) {
      r.classList.add("table-active");
      r.style.backgroundColor = "#e2e8f0";
      r.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      r.classList.remove("table-active");
      r.style.backgroundColor = "";
    }
  });
}

function postAction(action) {
  if (action === "print") {
    printTicket(lastVentaId);
    finalizarVentaUX();
  } else if (action === "whatsapp") {
    document.getElementById("waForm")?.classList.remove("d-none");
    document.getElementById("waPhone")?.focus();
  } else if (action === "finish") {
    finalizarVentaUX();
  }
}

function finalizarVentaUX() {
  // Cerrar todos los modales de la cadena
  getModal('postSaleModal')?.hide();
  getModal('modal-opciones-cobro')?.hide();
  getModal('modal-vista-previa-ticket')?.hide();
  getModal('cobroModal')?.hide();
  
  const tab = getActiveTab();
  if (!tab) return;
  const currentTabId = tab.id;

  // Resetear la pestaña actual (Limpiar Carrito)
  tab.cart = [];
  tab.selectedCliente = { id: null, nombre: "Consumidor Final", iva: "CF", telefono: "" };
  saveTabsToLocal();
  renderCart();

  // Si hay múltiples pestañas, cerrar la actual y saltar a la primera
  if (salesTabs.length > 1) {
    setTimeout(() => {
      const isFirst = salesTabs[0].id === currentTabId;
      closeTab(currentTabId);
      if (isFirst && salesTabs.length > 0) switchTab(salesTabs[0].id);
    }, 150);
  }

  // FOCO IMÁN: Siempre al lector de barras
  setTimeout(() => {
    const scanner = document.getElementById("scannerInput");
    if (scanner) {
      scanner.focus();
      scanner.select();
    }
  }, 400);
}

// FUNCIONES CADENA DE MODALES
function imprimirTicketDirecto() {
  const tab = getActiveTab();
  if (!tab) return;

  const now = new Date();
  const fechaStr = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let itemsHtml = tab.cart.map(item => {
    const priceFinal = item.price - (item.price * (item.discount || 0) / 100);
    return `
      <tr>
        <td style="padding: 1mm 0;">
          <div style="font-weight: bold;">${item.nombre.toUpperCase()}</div>
          <div style="font-size: 11px;">${item.qty} x $${item.price.toLocaleString()} ${item.discount > 0 ? `(-${item.discount}%)` : ""}</div>
        </td>
        <td style="text-align: right; vertical-align: middle;">$${(priceFinal * item.qty).toLocaleString()}</td>
      </tr>
    `;
  }).join("");

  const subtotalGeneral = tab.cart.reduce((acc, item) => {
    const priceFinal = item.price - (item.price * (item.discount || 0) / 100);
    return acc + (priceFinal * item.qty);
  }, 0);
  const montoDescuentoGral = subtotalGeneral * ((tab.generalDiscount || 0) / 100);
  const total = subtotalGeneral - montoDescuentoGral;

  const ticketHtml = `
    <html>
    <head>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Montserrat', sans-serif; font-size: 13px; line-height: 1.4; color: #000; width: 80mm; margin: 0; padding: 5mm; }
        .ticket-header { text-align: center; margin-bottom: 5mm; }
        .ticket-logo { font-size: 22px; font-weight: 900; letter-spacing: -1px; }
        .ticket-info { font-size: 12px; margin-bottom: 4mm; border-bottom: 1px dashed #ccc; padding-bottom: 3mm; }
        .ticket-table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
        .ticket-table th { text-align: left; border-bottom: 1px solid #000; padding: 2mm 0; font-size: 11px; text-transform: uppercase; }
        .ticket-table td { padding: 2mm 0; vertical-align: top; border-bottom: 0.5px solid #f0f0f0; }
        .ticket-total { margin-top: 4mm; border-top: 2px solid #000; padding-top: 3mm; font-weight: 800; font-size: 16px; text-align: right; }
        .ticket-footer { text-align: center; margin-top: 6mm; font-size: 11px; border-top: 1px dashed #ccc; padding-top: 4mm; }
        @media print { @page { margin: 0; } }
      </style>
    </head>
    <body onload="window.print();">
      <div class="ticket-header">
        <div class="ticket-logo">TODO GOLOSINA</div>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Golosinas & Snacks</div>
      </div>
      <div class="ticket-info">
        <div><strong>FECHA:</strong> ${fechaStr}</div>
        <div><strong>TICKET:</strong> #${lastVentaId || '---'}</div>
        <div><strong>CLIENTE:</strong> ${tab.selectedCliente.nombre.toUpperCase()}</div>
      </div>
      <table class="ticket-table">
        <thead><tr><th>DESCRIPCIÓN</th><th style="text-align: right;">TOTAL</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="ticket-total">
        ${tab.generalDiscount > 0 ? `<div style="font-size: 12px; font-weight: normal;">DESC. GRAL (${tab.generalDiscount}%): -$${montoDescuentoGral.toLocaleString()}</div>` : ""}
        <div style="font-size: 20px; margin-top: 2mm;">TOTAL: $${total.toLocaleString()}</div>
      </div>
      <div class="ticket-footer">
        <div style="font-weight: bold; margin-bottom: 1mm;">¡GRACIAS POR SU COMPRA!</div>
        <div>Aguilares, Tucumán</div>
      </div>
    </body>
    </html>
  `;

  // Imprimir vía Iframe Oculto
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.bottom = '0';
  iframe.style.right = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(ticketHtml);
  doc.close();

  // Se elimina el iframe tras un tiempo prudencial
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 3000);
}

function finalizarYLimpiarVenta() {
  resetFacturador();
  getModal('modalOpcionesVenta')?.hide();
  
  // Feedback visual de éxito
  const modalExito = getModal('modalExitoVenta');
  modalExito?.show();
  
  setTimeout(() => {
    modalExito?.hide();
    document.getElementById("scannerInput")?.focus();
  }, 1500);
}

async function prepararWA() {
  getModal('modal-opciones-cobro')?.hide();
  const tab = getActiveTab();
  let phone = tab?.selectedCliente?.telefono || "";
  
  if (!phone) {
    const { value: typedPhone } = await Swal.fire({
      title: 'WhatsApp del Cliente',
      input: 'text',
      inputLabel: 'Número (sin 0 ni 15)',
      inputPlaceholder: '3816123456',
      showCancelButton: true
    });
    if (typedPhone) phone = typedPhone;
  }
  
  if (phone) {
    const text = `¡Hola! Gracias por tu compra en Todo Golosina. Ticket #${lastVentaId}. Total: $${lastVentaTotal.toLocaleString()}`;
    const url = `https://wa.me/54${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }
  getModal('postSaleModal')?.show();
}

function soloRegistrar() {
  getModal('modal-opciones-cobro')?.hide();
  getModal('postSaleModal')?.show();
}

function printTicket(id) {
  if (!id) return;
  const printWin = window.open('/imprimir_ticket/' + id, '_blank', 'width=400,height=600');
  
  // FOCO IMÁN: Devolver el foco a la ventana principal y al scannerInput
  setTimeout(() => {
    window.focus();
    const scanner = document.getElementById("scannerInput");
    if (scanner) {
      scanner.focus();
      scanner.select();
    }
  }, 300);
}

function sendWA() {
  const phone = document.getElementById("waPhone")?.value.trim();
  if (!phone) {
    alert("Campo requerido: Ingresá un número de WhatsApp");
    return;
  }
  const text = `¡Hola! Gracias por tu compra en Todo Golosina. Ticket #00${lastVentaId}. Total: $${lastVentaTotal.toLocaleString()}`;
  const url = `https://wa.me/54${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
  getModal('postSaleModal')?.hide();
}

// Event Listeners Setup
function setupEventListeners() {
  // Sidebar items
  document.querySelectorAll(".sidebar-item").forEach(item => {
    item.addEventListener("click", function() {
      const section = this.getAttribute("data-section");
      if (section) switchSection(section, this);
    });
  });

  // Global Keydown
  window.addEventListener("keydown", handleGlobalShortcuts);

  // Control de Estado de Red (Eventos y Heartbeat)
  window.addEventListener('online', () => checkRealConnection());
  window.addEventListener('offline', () => updateNetworkStatus(false));
  
  async function checkRealConnection() {
    if (!navigator.onLine) {
      updateNetworkStatus(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('/api/estado_conexion', { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);
      const data = await res.json();
      updateNetworkStatus(!!data.online);
    } catch (e) {
      updateNetworkStatus(false);
    }
  }

  // Verificación inicial de red física y lógica al cargar
  checkRealConnection();
  
  // Re-verificar cada 10 segundos
  setInterval(checkRealConnection, 10000);

  // 🧲 IMÁN DE FOCO: Retornar al lector al cerrar cualquier modal
  document.addEventListener("hidden.bs.modal", () => {
    const enVenta = document.getElementById("sectionVenta")?.classList.contains("active");
    if (enVenta) {
      // Pequeño delay para asegurar que el modal se ocultó y no hay otros elementos capturando el foco
      setTimeout(() => {
        const active = document.activeElement;
        const isTypingIntentional = active && (active.id === "custSearchIn" || active.id === "modalSearchIn" || active.id === "modalQtyIn" || active.id === "input-desc-art-porc");
        if (!isTypingIntentional) document.getElementById("scannerInput")?.focus();
      }, 50);
    }
  });

  // 🧲 IMÁN DE FOCO: Click en áreas vacías
  document.addEventListener("click", (e) => {
    // Si el click no es en un elemento interactivo (input, botón, etc.)
    const interactive = e.target.closest("input, textarea, select, button, a, [data-action], .modal-content, .sidebar");
    if (!interactive) {
      const enVenta = document.getElementById("sectionVenta")?.classList.contains("active");
      if (enVenta) document.getElementById("scannerInput")?.focus();
    }
  });

  // Cash Management listeners
  document.getElementById("btnAbrirCaja")?.addEventListener("click", abrirCaja);
  document.getElementById("btnFinalizarDia")?.addEventListener("click", cerrarCaja);
  document.getElementById("btnGastoTrigger")?.addEventListener("click", () => getModal('gastoModal')?.show());
  
  const btnViejo = document.getElementById('btnSaveGasto');
  if (btnViejo) {
    // 1. Clonar para purgar cualquier evento fantasma acumulado
    const btnNuevo = btnViejo.cloneNode(true);
    btnViejo.replaceWith(btnNuevo);

    // 2. Asignar el evento exclusivamente vía .onclick
    btnNuevo.onclick = async function(e) {
      if (e) e.preventDefault();

      // 3. CANDADO GLOBAL: Si ya está guardando, rebotar.
      if (procesandoMovimiento) {
        console.warn("Doble envío bloqueado por estado global.");
        return;
      }

      const desc = document.getElementById("gastoDesc").value.trim();
      const monto = parseFloat(document.getElementById("gastoMonto").value) || 0;
      const cat = document.getElementById("gastoCat").value;
      const tipo = document.getElementById("gastoTipo").value;

      if (!desc || monto <= 0) {
        Swal.fire("Error", "Descripción y monto son obligatorios", "error");
        return;
      }

      procesandoMovimiento = true;

      // Feedback visual de bloqueo
      btnNuevo.disabled = true;
      btnNuevo.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Registrando...';

      try {
        const res = await fetch("/api/gastos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descripcion: desc, monto, categoria: cat, tipo })
        });
        const d = await res.json();
        if (d.ok) {
          Swal.fire({ icon: 'success', title: 'Movimiento guardado', timer: 1500, showConfirmButton: false });
          getModal('gastoModal')?.hide();
          document.getElementById("gastoDesc").value = "";
          document.getElementById("gastoMonto").value = "";
          cargarCajaPos();
        }
      } catch (err) {
        console.error(err);
      } finally {
        // 4. LIBERAR EL CANDADO Y EL BOTÓN SIEMPRE AL FINAL
        procesandoMovimiento = false;
        btnNuevo.disabled = false;
        btnNuevo.innerHTML = 'Registrar Movimiento';
      }
    };
  }

  // Search Results Delegation
  document.getElementById("modalResults")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (row && currentSearchResults.length > 0) {
      const index = Array.from(row.parentNode.children).indexOf(row);
      if (index >= 0) askQty(currentSearchResults[index]);
    }
  });

  // TabsBar Delegation
  document.getElementById("tabsBar")?.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (action === "switchTab") switchTab(id);
    else if (action === "closeTab") closeTab(id, e);
    else if (action === "newTab") createNewTab();
  });

  // Cart Delegation
  document.getElementById("cartBody")?.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    const index = target.getAttribute("data-index");

    if (action === "remItem") remItem(id);
    else if (action === "eliminarItem") eliminarItem(parseInt(index));
  });

  document.getElementById("cartBody")?.addEventListener("change", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (action === "updQty") updQty(id, target.value);
    else if (action === "updDiscount") updDiscount(id, target.value);
  });

  // Client Manager Search
  document.getElementById("custManagerSearch")?.addEventListener("input", renderCustManager);

  // Other buttons
  document.getElementById("btnNewCust")?.addEventListener("click", () => openEditCustModal());
  document.getElementById("btnSelectCust")?.addEventListener("click", openCustModal);
  document.getElementById("btnResetFacturador")?.addEventListener("click", resetFacturador);
  document.getElementById("btnOpenCobro")?.addEventListener("click", openCobro);
  document.getElementById("btnUpdateVentas")?.addEventListener("click", cargarVentasDia);
  document.getElementById("btnBuscarHistorial")?.addEventListener("click", cargarVentasDia);
  
  // Setear fechas por defecto a hoy
  const hoyStr = new Date().toISOString().split("T")[0];
  const fInicio = document.getElementById("fechaInicio");
  const fFin = document.getElementById("fechaFin");
  if (fInicio) fInicio.value = hoyStr;
  if (fFin) fFin.value = hoyStr;
  // confirm sale is attached inline via cloneNode
  document.getElementById("btnGasto")?.addEventListener("click", openGastoModal);
  // btnSaveGasto is handled above via cloneNode + onclick to avoid stacking
  document.getElementById("btnSaveNewCust")?.addEventListener("click", saveNewCust);
  document.getElementById("btnConfirmarPago")?.addEventListener("click", registrarPagoCobranza);
  document.getElementById("btnConfirmarEliminar")?.addEventListener("click", ejecutarEliminacionCliente);

  // Maestro-Detalle Ticket action buttons
  document.getElementById("btnReimprimir")?.addEventListener("click", () => {
    if (ventaSeleccionadaId) reimprimirTicket(ventaSeleccionadaId);
  });


  // Listeners Modal Opciones Post-Venta (Restaurados)
  document.getElementById("btnImprimirTicket")?.addEventListener("click", () => {
    imprimirTicketDirecto();
    finalizarYLimpiarVenta();
  });

  document.getElementById("btnEnviarWhatsApp")?.addEventListener("click", function(e) {
    e.preventDefault();
    let numero = document.getElementById("inputTelefonoCliente")?.value.trim();
    if (!numero) {
        alert("Por favor, ingrese el número del cliente.");
        return;
    }
    
    // Normalizar número para Argentina
    if (numero.length === 10) {
        numero = '549' + numero;
    }
    
    const tab = getActiveTab();
    const totalVenta = lastVentaTotal || 0;
    
    // Construir el texto del ticket basado en el carrito actual
    let textoTicket = "*TODO GOLOSINA - Comprobante de Venta* %0A%0A";
    
    if (tab && tab.cart) {
        tab.cart.forEach(item => {
            const priceFinal = item.price - (item.price * (item.discount || 0) / 100);
            textoTicket += `- ${item.qty}x ${item.nombre} ($${priceFinal}) %0A`;
        });
    }
    
    textoTicket += `%0A*TOTAL: $${totalVenta}* %0A%0A¡Gracias por tu compra!`;
    
    // Abrir WhatsApp Web o App
    let url = `https://wa.me/${numero}?text=${textoTicket}`;
    window.open(url, '_blank');
    
    finalizarYLimpiarVenta();
  });

  document.getElementById("btnSoloRegistrar")?.addEventListener("click", (e) => {
    e.preventDefault();
    finalizarYLimpiarVenta();
    getModal('modalOpcionesVenta')?.hide();
  });

  // General Discount listener
  document.getElementById("inputGeneralDiscount")?.addEventListener("input", (e) => {
    updGeneralDiscount(e.target.value);
  });
  document.getElementById("inputGeneralDiscount")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      updGeneralDiscount(e.target.value);
      document.getElementById("scannerInput")?.focus();
    }
  });
  
  // Search inputs
  document.getElementById("searchDeudores")?.addEventListener("input", filtrarDeudores);
  
  // Form submission
  document.getElementById("custForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveCustManager();
  });
  
  const openQuickCust = () => {
    getModal("modal-nuevo-cliente-rapido")?.show();
    setTimeout(() => document.getElementById("qcName")?.focus(), 500);
  };
  // Solo escuchamos al botón de la pantalla principal
  document.getElementById("btnOpenQuickCustMain")?.addEventListener("click", openQuickCust);
  document.getElementById("quickCustForm")?.addEventListener("submit", saveQuickCust);
  
  // Post-Sale Options
  document.querySelectorAll(".post-opt").forEach((btn) => {
    btn.addEventListener("click", function() {
      const action = this.getAttribute("data-action");
      if (action) postAction(action);
    });
  });

  // WhatsApp
  document.getElementById("btnSendWA")?.addEventListener("click", sendWA);

  // Modal specific
  document.getElementById("modalSearchIn")?.addEventListener("input", handleSearchInput);
  document.getElementById("modalQtyIn")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && selectedProd) {
      const qty = parseInt(e.target.value) || 1;
      addItem(selectedProd, qty);
      getModal('searchModal')?.hide();
    }
  });

  document.getElementById("input-desc-art-porc")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = parseFloat(e.target.value) || 0;
      const tab = getActiveTab();
      if (tab && cartSelectedIndex >= 0) {
        const item = tab.cart[cartSelectedIndex];
        if (item) {
          item.discount = Math.min(100, Math.max(0, val));
          saveTabsToLocal();
          renderCart();
          getModal('modal-descuento-articulo')?.hide();
          document.getElementById("scannerInput")?.focus();
        }
      }
    }
  });

  document.getElementById("custSearchIn")?.addEventListener("input", () => {
    const q = document.getElementById("custSearchIn").value.toLowerCase();
    currentCustResults = allClientes.filter(c => c.nombre.toLowerCase().includes(q) || (c.cuit && c.cuit.includes(q)));
    custSelectedIndex = currentCustResults.length > 0 ? 0 : -1;
    renderCusts(currentCustResults);
  });

  // Scanner
  const scannerInput = document.getElementById("scannerInput");
  let isScannerProcessing = false;
  if (scannerInput) {
    scannerInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (isScannerProcessing) return;
        isScannerProcessing = true;
        
        const code = scannerInput.value.trim();
        scannerInput.value = "";
        
        // Liberar el candado en 300ms (debounce)
        setTimeout(() => { isScannerProcessing = false; }, 300);
        
        if (!code) return;
        
        // Búsqueda local instantánea a la velocidad de la luz en memoria
        const producto = window.catalogoProductos.find(p => {
          if (!p.codigo_barra) return false;
          // Soporta múltiples códigos de barra separados por coma
          return p.codigo_barra.split(',').map(c => c.trim()).includes(code);
        });

        if (producto) {
          addItem(producto, 1);
          document.body.style.backgroundColor = "#dcfce7";
          setTimeout(() => (document.body.style.backgroundColor = ""), 200);
          scannerInput.focus();
        } else {
          // Producto no encontrado
          document.body.style.backgroundColor = "#fee2e2";
          setTimeout(() => (document.body.style.backgroundColor = ""), 300);
          
          Swal.fire({
            icon: 'error',
            title: '❌ Código no encontrado',
            text: `El código "${code}" no existe en el inventario.`,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#ef4444'
          }).then(() => {
              scannerInput.focus();
          });
        }
      }
    });
  }

  // Multi-payment inputs
  ["payEf", "payTr", "payDb", "payCc"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", calcMultiPago);
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("btnConfirmVenta")?.click();
            }
        });
    }
  });

  // Delegation for dynamically created buttons (like printTicket in sales history)
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");

    if (action === "printTicket") printTicket(id);
    else if (action === "payDebt") {
      const nombre = target.getAttribute("data-nombre");
      const saldo = parseFloat(target.getAttribute("data-saldo")) || 0;
      abrirPagoModal(id, nombre, saldo);
    } else if (action === "editCust") {
        try {
            const data = JSON.parse(target.getAttribute("data-json"));
            openEditCustModal(data);
        } catch(err) {}
    } else if (action === "deleteCust") {
        deleteCliente(id);
    } else if (action === "selectCustVenta") {
        try {
            const data = JSON.parse(target.getAttribute("data-json"));
            selectCust(data);
        } catch(err) {}
    } else if (action === "selectCust") {
        try {
            const data = JSON.parse(target.getAttribute("data-json"));
            selectCust(data);
        } catch(err) {}
    }
  });
}

function handleGlobalShortcuts(e) {
  // Prevent default for F-keys always (avoid browser help menus, etc.)
  if (["F1", "F2", "F3"].includes(e.key)) e.preventDefault();

  // Detect if user is actively typing in a form field
  const activeTag = document.activeElement?.tagName;
  const isTyping = (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT");

  // ─── BLOQUE 1: Modal Post-Venta ────────────────────────────────────────────
  if (document.getElementById("postSaleModal")?.classList.contains("show")) {
    const opts = document.querySelectorAll(".post-opt");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      postSaleSelectedIndex = (postSaleSelectedIndex + 1) % opts.length;
      updatePostOptions();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      postSaleSelectedIndex = (postSaleSelectedIndex - 1 + opts.length) % opts.length;
      updatePostOptions();
    } else if (e.key === "Enter") {
      e.preventDefault();
      opts[postSaleSelectedIndex]?.click();
    } else if (e.key === "Escape") {
      postAction("finish");
    }
    return;
  }

  // ─── BLOQUE 2: Modal Cobro ──────────────────────────────────────────────────
  if (cobroModalOpen && document.getElementById("cobroModal")?.classList.contains("show")) {
    if (e.key === "Escape") {
      getModal("cobroModal")?.hide();
      cobroModalOpen = false;
    } else if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btnConfirmVenta")?.click();
    }
    return;
  }

  // ─── BLOQUE 3: Modal de Búsqueda de Productos ──────────────────────────────
  // Se procesa ANTES del guard de isTyping para que las flechas funcionen
  // incluso cuando el foco está dentro de #modalSearchIn.
  if (document.getElementById("searchModal")?.classList.contains("show")) {
    const stepQty = document.getElementById("stepQty");
    const enStepQty = stepQty && !stepQty.classList.contains("d-none");

    if (!enStepQty) {
      // Estamos en el paso de búsqueda → navegar resultados con flechas
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentSearchResults.length > 0) {
          searchSelectedIndex = Math.min(searchSelectedIndex + 1, currentSearchResults.length - 1);
          updateSearchHighlight();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentSearchResults.length > 0) {
          searchSelectedIndex = Math.max(searchSelectedIndex - 1, 0);
          updateSearchHighlight();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (searchSelectedIndex >= 0 && currentSearchResults[searchSelectedIndex]) {
          askQty(currentSearchResults[searchSelectedIndex]);
        }
      }
    }
    // En el paso qty, el listener del input #modalQtyIn maneja el Enter directamente.
    return;
  }
  // ─── BLOQUE 3.3: Cadena de Modales de Cierre ───────────────────────────
  if (document.getElementById("modal-vista-previa-ticket")?.classList.contains("show")) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmarImpresion();
    }
    return;
  }
  if (document.getElementById("postSaleModal")?.classList.contains("show")) {
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      finalizarVentaUX();
    }
    return;
  }

  // ─── BLOQUE 3.5: Modal de Selección de Clientes ───────────────────────────
  if (document.getElementById("custModal")?.classList.contains("show")) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentCustResults.length > 0) {
        custSelectedIndex = Math.min(custSelectedIndex + 1, currentCustResults.length - 1);
        renderCusts(currentCustResults);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentCustResults.length > 0) {
        custSelectedIndex = Math.max(custSelectedIndex - 1, 0);
        renderCusts(currentCustResults);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (custSelectedIndex >= 0 && currentCustResults[custSelectedIndex]) {
        selectCust(currentCustResults[custSelectedIndex]);
      }
    }
    return;
  }


  // ─── GUARD: No activar atajos globales si el usuario está escribiendo ───────
  // Excepción: Teclas de función, Flechas y Modificadores (+, -, *, /) permitidos en #scannerInput.
  const isFKey = ["F1", "F2", "F3", "F5", "F7", "F8", "F10", "F12"].includes(e.key);
  const isArrowKey = ["ArrowUp", "ArrowDown"].includes(e.key);
  const isModKey = ["+", "-", "*", "/"].includes(e.key) || ["NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide"].includes(e.code);
  const isScanner = document.activeElement?.id === "scannerInput";
  
  if (isTyping && !isFKey && !((isArrowKey || isModKey) && isScanner)) return;

  // ─── Bloquear si hay cualquier otro modal abierto (excepto postSaleModal para F7/F8) ───────────────────────────
  if (document.querySelector(".modal.show") && !document.getElementById("postSaleModal")?.classList.contains("show")) return;

  // Teclas de función que funcionan SIEMPRE (desde cualquier sección)
  if (e.key === "F1") {
    e.preventDefault();
    const btnVenta = document.querySelector('.sidebar-item[data-section="venta"]');
    if (btnVenta) switchSection("venta", btnVenta);
    return;
  }

  // Atajos de Pestañas (F7 / F8)
  if (e.key === "F7") {
    e.preventDefault();
    // Asegurarse de estar en la sección de venta primero
    const btnVenta = document.querySelector('.sidebar-item[data-section="venta"]');
    if (btnVenta && !document.getElementById("sectionVenta")?.classList.contains("active")) {
      switchSection("venta", btnVenta);
    }
    createNewTab();
    return;
  }
  if (e.key === "F8") {
    e.preventDefault();
    cycleTabs();
    return;
  }

  // ─── BLOQUE 4: Teclas de función globales ──────────────────────────────────
  // Validación de Vista: Solo si el contenedor del facturador está activo
  const enVenta = document.getElementById("sectionVenta")?.classList.contains("active");
  if (!enVenta) return;

  if (e.key === "F5") { e.preventDefault(); abrirModalProductos(); }
  if (e.key === "F12") { e.preventDefault(); openCobro(); }
  if (e.key === "F2") { e.preventDefault(); openCustModal(); }
  if (e.key === "F10") { 
    e.preventDefault(); 
    const inGD = document.getElementById("inputGeneralDiscount");
    if (inGD) { inGD.focus(); inGD.select(); }
  }

  // ─── BLOQUE 5: Navegación y modificadores en el carrito ────────────────────
  const tab = getActiveTab();
  if (!tab || tab.cart.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    cartSelectedIndex = Math.min(cartSelectedIndex + 1, tab.cart.length - 1);
    renderCart();
    // Mantenemos foco en scanner si ya estaba ahí o si no estamos escribiendo en otro lado
    if (document.activeElement?.id === "scannerInput" || document.activeElement?.tagName === "BODY") {
        document.getElementById("scannerInput")?.focus();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cartSelectedIndex = Math.max(cartSelectedIndex - 1, 0);
    renderCart();
    if (document.activeElement?.id === "scannerInput" || document.activeElement?.tagName === "BODY") {
        document.getElementById("scannerInput")?.focus();
    }
  } else if (e.key === "+" || e.code === "NumpadAdd") {
    if (cartSelectedIndex >= 0) {
      e.preventDefault();
      const item = tab.cart[cartSelectedIndex];
      if (item) {
          updQty(item.id, item.qty + 1);
          document.getElementById("scannerInput")?.focus();
      }
    }
  } else if (e.key === "-" || e.code === "NumpadSubtract") {
    if (cartSelectedIndex >= 0) {
      e.preventDefault();
      const item = tab.cart[cartSelectedIndex];
      if (item && item.qty > 1) {
          updQty(item.id, item.qty - 1);
          document.getElementById("scannerInput")?.focus();
      }
    }
  } else if (e.key === "*" || e.code === "NumpadMultiply") {
    if (cartSelectedIndex >= 0) {
      e.preventDefault();
      const item = tab.cart[cartSelectedIndex];
      if (item) {
        Swal.fire({
          title: "Nueva Cantidad",
          input: "number",
          inputValue: item.qty,
          showCancelButton: true,
          confirmButtonText: "Actualizar",
          cancelButtonText: "Cancelar",
          inputAttributes: { min: 1, step: 1 }
        }).then((result) => {
          if (result.isConfirmed && result.value) {
            updQty(item.id, result.value);
            document.getElementById("scannerInput")?.focus();
          }
        });
      }
    }
  } else if (e.key === "/" || e.code === "NumpadDivide") {
    if (cartSelectedIndex >= 0) {
      e.preventDefault();
      const input = document.getElementById("input-desc-art-porc");
      const item = tab.cart[cartSelectedIndex];
      if (input && item) {
        input.value = item.discount || 0;
        getModal("modal-descuento-articulo")?.show();
        setTimeout(() => input.select(), 400);
      }
    }
  }
}

function renderizarResultadosLocales(productos) {
  const resultsBody = document.getElementById("modalResults");
  if (!resultsBody) return;
  
  currentSearchResults = productos;
  
  if (productos.length > 0) {
    searchSelectedIndex = 0;
    const itemsToRender = productos.slice(0, 30);
    resultsBody.innerHTML = itemsToRender.map((p, i) => `
      <tr data-index="${i}" style="cursor: pointer; ${i === 0 ? 'background-color: #e2e8f0;' : ''}" class="${i === 0 ? 'table-active fila-seleccionada' : ''}">
        <td style="text-transform: capitalize; font-size: 14px;"><strong>${p.nombre.toLowerCase()}</strong></td>
        <td class="text-end fw-bold pe-4">$${(p.precio_lista_1 || 0).toLocaleString()}</td>
      </tr>
    `).join('');
  } else {
    resultsBody.innerHTML = '<tr><td colspan="2" class="text-center p-4 text-muted">No se encontraron productos</td></tr>';
  }
}

async function handleSearchInput(e) {
  const q = e.target.value.trim().toLowerCase();
  
  if (q.length === 0) {
    renderizarResultadosLocales((window.catalogoProductos || []).slice(0, 30));
    return;
  }
  
  const terminos = q.split(/\s+/);
  const filtrados = (window.catalogoProductos || []).filter(p => {
    const nombreLower = (p.nombre || '').toLowerCase();
    const catLower = (p.categoria || "General").toLowerCase();
    const barcode = (p.codigo_barra || '');
    return terminos.every(t => nombreLower.includes(t) || catLower.includes(t) || barcode.includes(t));
  });
  
  renderizarResultadosLocales(filtrados.slice(0, 30));
}

function updatePostOptions() {
  const opts = document.querySelectorAll(".post-opt");
  opts.forEach((btn, i) => {
    if (i === postSaleSelectedIndex) {
      btn.classList.add("active-opt", "btn-primary");
      btn.classList.remove("btn-outline-primary", "btn-outline-success", "btn-outline-secondary");
      if (i === 1) btn.classList.replace("btn-primary", "btn-success");
      if (i === 2) btn.classList.replace("btn-primary", "btn-secondary");
    } else {
      btn.classList.remove("active-opt", "btn-primary", "btn-success", "btn-secondary");
      if (i === 0) btn.classList.add("btn-outline-primary");
      if (i === 1) btn.classList.add("btn-outline-success");
      if (i === 2) btn.classList.add("btn-outline-secondary");
    }
  });
}

function resetFacturador() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.cart = [];
  tab.selectedCliente = { id: null, nombre: "Consumidor Final", iva: "CF", telefono: "" };
  tab.generalDiscount = 0;
  
  saveTabsToLocal();
  renderCart();

  const switchAfip = document.getElementById('toggleFacturaAfip');
  if (switchAfip) switchAfip.checked = false;

  // Limpiar inputs de descuento visualmente
  const inputGD = document.getElementById("inputGeneralDiscount");
  if (inputGD) inputGD.value = "";
  const infoGral = document.getElementById("generalSavingsInfo");
  if (infoGral) infoGral.classList.add("d-none");

  document.getElementById("scannerInput")?.focus();
}

// --- CAJA DIARIA PROFESIONAL ---
async function verificarCaja() {
    try {
        const res = await fetch("/api/caja/estado");
        const d = await res.json();

        const modalEl = document.getElementById('modal-abrir-caja');
        const modalObj = getModal('modal-abrir-caja');

        if (d.abierta || (d.ok && d.abierta)) {
            // Si la caja ya está abierta, ocultar el modal y permitir cobro
            modalObj?.hide();
            if (modalEl) {
                modalEl.classList.remove('show');
                modalEl.style.display = 'none';
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('padding-right');
            }
            const elemMonto = document.getElementById("cajaInicio");
            if (elemMonto && d.monto_inicial !== undefined) {
                elemMonto.textContent = `$${parseFloat(d.monto_inicial).toLocaleString()}`;
            }
        } else {
            // Si la caja está cerrada, mostrar el modal de apertura
            modalObj?.show();
        }
    } catch(err) {
        console.error("Error verificando estado de la caja:", err);
    }
}

async function abrirCaja() {
    const monto = parseFloat(document.getElementById("inputInicioCaja").value) || 0;
    try {
        const res = await fetch("/api/caja/abrir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ monto_inicial: monto })
        });
        const d = await res.json();
        if (d.ok) {
            Swal.fire({ icon: 'success', title: 'Caja Abierta', text: `Iniciaste con $${monto.toLocaleString()}`, timer: 2000, showConfirmButton: false });
            getModal('modal-abrir-caja')?.hide();
            cargarCajaPos();
        } else {
            Swal.fire({ icon: 'error', title: 'Error', text: d.mensaje });
        }
    } catch(err) { console.error(err); }
}

async function cerrarCaja() {
    const result = await Swal.fire({
        title: '¿Finalizar Jornada?',
        text: "Se guardará el resumen y se cerrará la caja actual para el inicio de mañana.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, finalizar día',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await fetch("/api/caja/cerrar", { method: "POST" });
            const d = await res.json();
            if (d.ok) {
                Swal.fire('¡Cerrado!', 'La jornada ha finalizado correctamente.', 'success').then(() => {
                    location.reload(); 
                });
            }
        } catch(err) { console.error(err); }
    }
}

async function cargarCajaPos() {
    try {
        const r = await fetch("/api/ventas_hoy");
        const d = await r.json();
        if (!d.ok) return;

        // Dashboard
        document.getElementById("cajaInicio").textContent = `$${d.monto_inicial.toLocaleString()}`;
        document.getElementById("cajaVentasTotal").textContent = `$${d.total_ventas.toLocaleString()}`;
        document.getElementById("cajaEgresos").textContent = `$${d.egresos.toLocaleString()}`;
        document.getElementById("cajaEfectivoReal").textContent = `$${d.efectivo_real.toLocaleString()}`;

        // Desglose
        document.getElementById("detEf").textContent = `$${d.metodos.efectivo.toLocaleString()}`;
        document.getElementById("detTr").textContent = `$${d.metodos.transferencia.toLocaleString()}`;
        document.getElementById("detDb").textContent = `$${d.metodos.debito.toLocaleString()}`;
        document.getElementById("detCc").textContent = `$${d.metodos.cc.toLocaleString()}`;
        document.getElementById("detCob").textContent = `$${d.cobranzas.toLocaleString()}`;
        document.getElementById("detExt").textContent = `$${d.ingresos_extra.toLocaleString()}`;

        // Movimientos
        const body = document.getElementById("cajaMovBody");
        if (body) {
            if (d.gastos.length === 0) {
                body.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">Sin movimientos registrados</td></tr>';
            } else {
                body.innerHTML = d.gastos.map(g => `
                    <tr>
                        <td class="ps-4">
                            <span class="badge ${g.tipo === 'Ingreso' ? 'bg-success' : 'bg-danger'}">${g.tipo}</span>
                        </td>
                        <td>
                            <div class="fw-bold text-dark">${g.descripcion}</div>
                            <small class="text-muted">${g.fecha}hs - ${g.categoria}</small>
                        </td>
                        <td class="text-end pe-4 fw-black ${g.tipo === 'Ingreso' ? 'text-success' : 'text-danger'}">
                            ${g.tipo === 'Ingreso' ? '+' : '-'} $${g.monto.toLocaleString()}
                        </td>
                    </tr>
                `).join("");
            }
        }

    } catch (err) { console.error(err); }
}

// Verificar actualizaciones de precios en tiempo real vía Polling
function chequearPreciosNuevos() {
    fetch('/api/verificar_precios')
        .then(res => res.json())
        .then(data => {
            const ultimaActualizacionServer = new Date(data.ultima_actualizacion);
            if (ultimaActualizacionServer > horaCargaPantalla) {
                mostrarAlertaListaNueva();
            }
        })
        .catch(err => console.log("Error al verificar precios:", err));
}

function mostrarAlertaListaNueva() {
    if (document.getElementById("alerta-nueva-lista-precios")) return; // Evitar duplicados

    const alertDiv = document.createElement("div");
    alertDiv.id = "alerta-nueva-lista-precios";
    alertDiv.style.position = "fixed";
    alertDiv.style.top = "25px";
    alertDiv.style.right = "25px";
    alertDiv.style.zIndex = "99999";
    alertDiv.style.maxWidth = "420px";
    alertDiv.style.background = "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)";
    alertDiv.style.borderLeft = "6px solid #d97706";
    alertDiv.style.borderRadius = "16px";
    alertDiv.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
    alertDiv.style.padding = "20px";
    alertDiv.style.fontFamily = "'Outfit', 'Inter', sans-serif";
    alertDiv.style.color = "#92400e";
    alertDiv.style.display = "flex";
    alertDiv.style.flexDirection = "column";
    alertDiv.style.gap = "12px";
    alertDiv.style.animation = "slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards";
    
    if (!document.getElementById("animacion-alerta-precios")) {
        const style = document.createElement("style");
        style.id = "animacion-alerta-precios";
        style.textContent = `
            @keyframes slideInRight {
                0% { transform: translateX(120%); opacity: 0; }
                100% { transform: translateX(0); opacity: 1; }
            }
            .btn-reload-precios {
                background: #d97706;
                color: white;
                border: none;
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                text-decoration: none;
                font-size: 13.5px;
            }
            .btn-reload-precios:hover {
                background: #b45309;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(217, 119, 6, 0.2);
            }
            .btn-reload-precios:active {
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    alertDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 24px; line-height: 1;">⚠️</span>
            <div style="flex-grow: 1;">
                <h5 style="margin: 0 0 4px 0; font-weight: 800; font-size: 16px; color: #b45309;">¡Precios actualizados!</h5>
                <p style="margin: 0; font-size: 14px; line-height: 1.5; font-weight: 500;">
                    ⚠️ ¡Lista nueva de precios cargada! Por favor, actualiza la pantalla (F5) para vender con los valores correctos.
                </p>
            </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <button class="btn-reload-precios" onclick="window.location.reload();">
                <i class="bi bi-arrow-clockwise"></i> Actualizar pantalla (F5)
            </button>
        </div>
    `;

    document.body.appendChild(alertDiv);
}

// Ejecutar la verificación cada 30 segundos
setInterval(chequearPreciosNuevos, 30000);

// Start the app
document.addEventListener("DOMContentLoaded", () => {
    try {
        if (typeof bootstrap === 'undefined') return;
        initApp();
    } catch(e) { console.error('Error fatal:', e); }
});

const btnWA_Historial = document.getElementById('btnWAHistorialAislado');
if (btnWA_Historial) {
    btnWA_Historial.onclick = function() {
        const mensajePreArmado = this.getAttribute('data-mensaje');
        if (!mensajePreArmado) return;

        let numero = prompt("Ingrese el celular del cliente (Ej: 3865123456):");
        if (!numero) return; 

        numero = numero.trim();
        if (numero.length === 10) {
            numero = '549' + numero;
        }

        window.open(`https://wa.me/${numero}?text=${mensajePreArmado}`, '_blank');
    };
}

// Listener para limpiar facturador cuando se cierra el modal de opciones post-venta
const modalPostVenta = document.getElementById('modalOpcionesVenta');
if (modalPostVenta) {
    modalPostVenta.addEventListener('hidden.bs.modal', function () {
        // Llama aquí a tu función existente de limpiar/vaciar carrito
        resetFacturador(); 
        
        // Resetear switch de AFIP si existe
        const switchAfip = document.getElementById('toggleFacturaAfip');
        if (switchAfip) switchAfip.checked = false;
    });
}

// ─── Sincronización Automática con la Nube (Render) ───
async function sincronizarDatosConNube() {
    Swal.fire({
        title: '📡 Sincronización',
        text: 'Sincronizando datos locales con la nube...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const response = await fetch('/api/sincronizar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        
        if (data.ok) {
            Swal.fire({
                icon: 'success',
                title: '¡Sincronización Completada!',
                text: data.mensaje || 'Los datos locales se han impactado en la nube correctamente.',
                timer: 3500,
                showConfirmButton: true,
                confirmButtonColor: '#10b981'
            }).then(() => {
                if (typeof cargarCajaPos === 'function') cargarCajaPos();
            });
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Aviso de Sincronización',
                text: data.mensaje || 'No se pudo completar toda la sincronización.',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#f59e0b'
            });
        }
    } catch (error) {
        console.error('Error durante la sincronización:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error de Conexión',
            text: 'Se restableció la red, pero el servidor de sincronización no está respondiendo.',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#ef4444'
        });
    }
}

window.addEventListener('online', () => {
    sincronizarDatosConNube();
});

// ─── AUTO-FOCUS PERSISTENTE PARA ESCÁNER Y SSE ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const scannerInput = document.getElementById('scannerInput');
  if (scannerInput) {
    // Foco inicial al cargar
    setTimeout(() => {
      scannerInput.focus();
    }, 100);

    // Listener global para clics
    document.addEventListener('click', (e) => {
      // Excepción: Si el usuario hace clic en otro input, textarea o select, no interrumpimos
      const targetTag = e.target.tagName.toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) {
        return;
      }
      
      // Regresar foco inmediatamente al escáner
      scannerInput.focus();
    });
  }

  // Inicializar Conexión SSE
  try {
    const eventSource = new EventSource('/api/stream-actualizaciones');
    eventSource.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.tipo === "actualizacion_precios" && data.modificados && data.modificados.length > 0) {
          
          let listHtml = "<ul style='text-align: left; max-height: 200px; overflow-y: auto;'>";
          data.modificados.forEach(item => {
            listHtml += `<li>${item}</li>`;
          });
          listHtml += "</ul>";

          Swal.fire({
            title: '¡ATENCIÓN! Se actualizaron precios',
            html: `Los siguientes artículos fueron modificados:<br><br>${listHtml}<br>Presiona OK para actualizar el catálogo local.`,
            icon: 'warning',
            allowOutsideClick: false,
            allowEscapeKey: false,
            confirmButtonText: 'OK, Actualizar',
            confirmButtonColor: '#3085d6'
          }).then((result) => {
            if (result.isConfirmed) {
              // Recargar la página o volver a llamar a la función que descarga el catálogo
              window.location.reload(true);
            }
          });
        }
      } catch (err) {
        console.error("Error al procesar mensaje SSE:", err);
      }
    };
    eventSource.onerror = function(err) {
      console.error("Error en conexión SSE (Reconectando automáticamente...)", err);
    };
  } catch (err) {
    console.error("No se pudo inicializar EventSource", err);
  }
});
