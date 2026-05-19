// facturador-core.js - Lógica principal del Facturador
// Todo Golosina POS System

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/service-worker.js')
      .then(reg => console.log('SW: Registrado'))
      .catch(err => console.log('SW: Error', err));
  });
}

// Global Variables
let salesTabs = [];
let activeTabId = null;
let cartSelectedIndex = -1;
let method = null;
let selectedProd = null;
let cobroModalOpen = false;
let currentSearchResults = [];
let searchSelectedIndex = -1;

let allClientes = [];
let currentCustResults = [];
let custSelectedIndex = -1;
let selectedCliente = {
  id: null,
  nombre: "Consumidor Final",
  iva: "CF",
  telefono: "",
};

let lastVentaId = null;
let lastVentaTotal = 0;
let postSaleSelectedIndex = 0;
let editingCustId = null;
let deudores = [];
let isProcessingVenta = false;
let procesandoMovimiento = false;


// Bootstrap Modal Instances
let modalProductos, cobroModal, custModal, postSaleModal, editCustModal, gastoModal;

// Initializations
function initApp() {
  modalProductos = new bootstrap.Modal(document.getElementById("searchModal"));
  cobroModal = new bootstrap.Modal(document.getElementById("cobroModal"));
  custModal = new bootstrap.Modal(document.getElementById("custModal"));
  postSaleModal = new bootstrap.Modal(document.getElementById("postSaleModal"));
  editCustModal = new bootstrap.Modal(document.getElementById("editCustModal"));
  gastoModal = new bootstrap.Modal(document.getElementById("gastoModal"));

  initTabs();
  loadAllClientes();
  updateClock();
  setInterval(updateClock, 1000);
  fetchWeather();
  cargarDashboard();
  setupEventListeners();
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
  // Buscamos el número más alto para el correlativo
  let maxNum = 0;
  salesTabs.forEach(t => {
    const m = t.name.match(/Venta (\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  });
  const num = maxNum + 1;

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
  
  if (shouldSwitch) {
    setTimeout(() => {
      const input = document.getElementById("scannerInput");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }
}

function switchTab(id) {
  activeTabId = id;
  saveTabsToLocal();
  renderTabs();
  renderCart();
  setTimeout(() => {
    const input = document.getElementById("scannerInput");
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

function cycleTabs() {
  if (salesTabs.length <= 1) return;
  const currentIndex = salesTabs.findIndex(t => t.id == activeTabId);
  const nextIndex = (currentIndex + 1) % salesTabs.length;
  switchTab(salesTabs[nextIndex].id);
}

async function closeTab(id, e) {
  if (e) e.stopPropagation();
  const tab = salesTabs.find((t) => t.id == id);
  if (tab.cart.length > 0) {
    const result = await Swal.fire({
      title: "¿Cerrar venta?",
      text: `La "${tab.name}" tiene productos cargados. Se perderán si la cerrás.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, cerrar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
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
      <span class="fw-bold">${t.name}</span>
      <div class="close-tab ms-2" data-action="closeTab" data-id="${t.id}" title="Cerrar">
        <i class="bi bi-x-circle-fill"></i>
      </div>
    </div>
  `;
    })
    .join("");

  bar.innerHTML =
    tabsHtml +
    '<button class="btn-add-tab" data-action="newTab" title="Nueva Venta (F7)"><i class="bi bi-plus-circle-fill"></i></button>';
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
    <td class="ps-4 fw-bold text-dark">${c.nombre}</td>
    <td class="text-muted">${c.cuit || "-"}</td>
    <td><span class="badge bg-light text-dark border">${c.condicion_iva || "CF"}</span></td>
    <td>${c.telefono || "-"}</td>
    <td class="text-center fw-bold text-primary">${c.descuento_fijo || 0}%</td>
    <td class="text-end pe-4">
      <div class="btn-group">
        <button class="btn btn-sm btn-outline-primary" data-action="editCust" data-json='${JSON.stringify(c).replace(/'/g, "&apos;")}' title="Editar">
          <i class="bi bi-pencil"></i> EDITAR
        </button>
        <button class="btn btn-sm btn-outline-danger" data-action="deleteCust" data-id="${c.id}" title="Eliminar">
          <i class="bi bi-trash"></i> ELIMINAR
        </button>
      </div>
      <button class="btn btn-sm btn-primary ms-2" data-action="selectCustVenta" data-json='${JSON.stringify(c).replace(/'/g, "&apos;")}'>Seleccionar</button>
    </td>
  </tr>
`,
    )
    .join("");
}

async function deleteCliente(id) {
  const result = await Swal.fire({
    title: "¿Eliminar cliente?",
    text: "Esta acción borrará al cliente permanentemente.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3483fa",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  if (result.isConfirmed) {
    try {
      const r = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) {
        Swal.fire("¡Eliminado!", "El cliente ha sido borrado.", "success");
        loadAllClientes();
      } else {
        Swal.fire("Error", d.mensaje || "No se pudo eliminar", "error");
      }
    } catch (e) {
      console.error(e);
    }
  }
}

function openEditCustModal(c = null) {
  editingCustId = c ? c.id : null;
  document.getElementById("editCustModalTitle").textContent = c ? "Editar Cliente" : "Nuevo Cliente";
  document.getElementById("ecName").value = c ? c.nombre : "";
  document.getElementById("ecCuit").value = c ? c.cuit : "";
  document.getElementById("ecPhone").value = c ? c.telefono : "";
  document.getElementById("ecDir").value = c ? c.direccion : "";
  document.getElementById("ecIva").value = c ? (c.condicion_iva || "Consumidor Final") : "Consumidor Final";
  document.getElementById("ecDesc").value = c ? (c.descuento_fijo || 0) : 0;
  editCustModal.show();
}

async function saveCustManager() {
  const data = {
    nombre: document.getElementById("ecName").value.trim(),
    cuit: document.getElementById("ecCuit").value.trim(),
    telefono: document.getElementById("ecPhone").value.trim(),
    direccion: document.getElementById("ecDir").value.trim(),
    condicion_iva: document.getElementById("ecIva").value,
    descuento_fijo: parseFloat(document.getElementById("ecDesc").value) || 0,
  };

  if (!data.nombre) {
    Swal.fire("Campo requerido", "El nombre del cliente es obligatorio.", "warning");
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
      editCustModal.hide();
      loadAllClientes();
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: isEditing ? "Cliente actualizado" : "Cliente creado",
        showConfirmButton: false,
        timer: 2500,
      });
    } else {
      Swal.fire("Error", d.mensaje || "Problema al procesar", "error");
    }
  } catch (e) {
    console.error(e);
    Swal.fire("Error de red", "No se pudo conectar", "error");
  }
}

async function openCustModal() {
  if (navigator.onLine) {
    if (allClientes.length === 0) await loadAllClientes();
  }
  currentCustResults = allClientes;
  custSelectedIndex = currentCustResults.length > 0 ? 0 : -1;
  renderCusts(currentCustResults);
  custModal.show();
  setTimeout(() => document.getElementById("custSearchIn").focus(), 500);
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
  custModal.hide();
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
      const gH = document.getElementById("dashGastosHoy");
      const bH = document.getElementById("dashBalance");
      if (vH && d.total_ventas !== undefined) vH.textContent = `$${Number(d.total_ventas).toLocaleString()}`;
      if (gH && d.total_gastos !== undefined) gH.textContent = `$${Number(d.total_gastos).toLocaleString()}`;
      if (bH && d.balance !== undefined) {
        bH.textContent = `$${Number(d.balance).toLocaleString()}`;
        bH.classList.remove("text-success", "text-danger");
        bH.classList.add(d.balance >= 0 ? "text-success" : "text-danger");
      }
    }
  } catch (e) { console.log("Dash data error", e); }
}

function switchSection(section, btn) {
  if (section === "venta" && window.innerWidth <= 768) section = "mobileWarning";
  document.querySelectorAll(".sidebar-item").forEach((el) => el.classList.remove("active"));
  if (btn) btn.classList.add("active");
  document.querySelectorAll(".section-container").forEach((el) => el.classList.remove("active"));
  const target = document.getElementById("section" + section.charAt(0).toUpperCase() + section.slice(1));
  if (target) target.classList.add("active");
  if (window.innerWidth <= 768) document.querySelector(".sidebar").classList.remove("active");

  if (section === "inicio") cargarDashboard();
  else if (section === "venta") setTimeout(() => document.getElementById("scannerInput").focus(), 100);
  else if (section === "ventas") cargarVentasDia();
  else if (section === "clientes") loadAllClientes();
  else if (section === "caja") cargarCajaPos();
  else if (section === "cobranzas") cargarDeudores();
}

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
          ${m.tipo === "Ingreso" ? "+" : "-"}$${m.monto.toLocaleString()}
        </td>
      </tr>
    `).join("");
  } catch (e) { console.error("Error cargando caja:", e); }
}

function openGastoModal() {
  document.getElementById("gastoDesc").value = "";
  document.getElementById("gastoMonto").value = "";
  gastoModal.show();
  setTimeout(() => document.getElementById("gastoDesc").focus(), 500);
}

async function saveGasto() {
  const btnGuardar = document.getElementById('btnSaveGasto');
  
  // 3. CANDADO GLOBAL: Si ya está guardando, rebotar.
  if (procesandoMovimiento) {
    console.warn("Doble envío bloqueado por estado global.");
    return;
  }

  const desc = document.getElementById("gastoDesc").value.trim();
  const monto = document.getElementById("gastoMonto").value;
  const cat = document.getElementById("gastoCat").value;
  if (!desc || !monto) { Swal.fire("Error", "Completá descripción y monto", "error"); return; }
  
  procesandoMovimiento = true;

  // 1. Deshabilitar para evitar doble clic
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Registrando...';
  }

  try {
    const res = await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descripcion: desc, monto: monto, categoria: cat }),
    });
    const d = await res.json();
    if (d.ok) {
      gastoModal.hide();
      cargarCajaPos();
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Gasto registrado", showConfirmButton: false, timer: 2000 });
    }
  } catch (e) { 
    console.error(e); 
  } finally {
    // 2. Volver a habilitar el botón pase lo que pase
    procesandoMovimiento = false;
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = 'Registrar Movimiento';
    }
  }
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
  const q = document.getElementById("searchDeudores").value.toLowerCase();
  const filtered = deudores.filter(c => c.nombre.toLowerCase().includes(q));
  renderDeudores(filtered);
}
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
  Swal.fire({
    title: `Registrar Pago de ${nombre}`,
    html: `<div class="text-start mb-2 small text-muted">Saldo actual: <strong>$${saldo.toLocaleString()}</strong></div>
           <input type="number" id="pagoMonto" class="swal2-input" placeholder="Monto" value="${saldo}">`,
    showCancelButton: true,
    confirmButtonText: 'Registrar',
    preConfirm: () => {
      const monto = document.getElementById('pagoMonto').value;
      if (!monto || monto <= 0) Swal.showValidationMessage('Monto inválido');
      return { id, monto };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const res = await fetch("/api/clientes/registrar_pago", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cliente_id: result.value.id, monto: result.value.monto })
        });
        const d = await res.json();
        if (d.ok) { Swal.fire("Éxito", `Nuevo saldo: $${d.nuevo_saldo.toLocaleString()}`, "success"); cargarDeudores(); }
      } catch (e) { Swal.fire("Error", "No se pudo procesar", "error"); }
    }
  });
}

// Cart & Scanning Logic
function addItem(p, qty) {
  const tab = getActiveTab();
  if (!tab) return;
  const ex = tab.cart.find((x) => x.id === p.id);
  if (ex) { ex.qty += qty; cartSelectedIndex = tab.cart.indexOf(ex); }
  else { tab.cart.push({ id: p.id, nombre: p.nombre, price: p.precio_lista_1, qty: qty }); cartSelectedIndex = tab.cart.length - 1; }
  saveTabsToLocal();
  renderCart();
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
  b.innerHTML = tab.cart.map((item, i) => `
    <tr class="${i === cartSelectedIndex ? "table-active" : ""}" style="${i === cartSelectedIndex ? "background-color: #e2e8f0;" : ""}" data-index="${i}">
      <td class="text-muted" style="font-size: 11px;">#${i + 1}</td>
      <td>${item.nombre}</td>
      <td class="text-center">
        <input type="number" class="qty-input" value="${item.qty}" min="1" data-action="updQty" data-id="${item.id}">
      </td>
      <td class="text-end price-text">$${item.price.toLocaleString()}</td>
      <td class="text-end subtotal-text">$${(item.price * item.qty).toLocaleString()}</td>
      <td class="text-end">
        <button class="btn btn-sm p-0 text-danger" data-action="remItem" data-id="${item.id}"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join("");
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
  const tot = tab.cart.reduce((a, b) => a + b.price * b.qty, 0);
  const gT = document.getElementById("grandTotal");
  if (gT) gT.textContent = `$${tot.toLocaleString()}`;
}

function openCobro() {
  const tab = getActiveTab();
  if (!tab || tab.cart.length === 0) { Swal.fire("Carrito vacío", "Agregá productos primero", "warning"); return; }
  const tot = tab.cart.reduce((a, b) => a + b.price * b.qty, 0);
  const mGT = document.getElementById("modalGrandTotal");
  if (mGT) mGT.textContent = `$${tot.toLocaleString()}`;

  document.getElementById("payEf").value = "";
  document.getElementById("payTr").value = "";
  document.getElementById("payDb").value = "";
  document.getElementById("payCc").value = "";
  
  const ccWrap = document.getElementById("ccPayWrap");
  const payCc = document.getElementById("payCc");
  if (tab.selectedCliente.id) { ccWrap.classList.remove("opacity-50"); payCc.disabled = false; }
  else { ccWrap.classList.add("opacity-50"); payCc.disabled = true; payCc.value = ""; }

  calcMultiPago();
  cobroModal.show();
  setTimeout(() => document.getElementById("payEf").focus(), 400);
}

function calcMultiPago() {
  const tab = getActiveTab();
  const tot = tab.cart.reduce((a, b) => a + b.price * b.qty, 0);
  const ef = parseFloat(document.getElementById("payEf").value) || 0;
  const tr = parseFloat(document.getElementById("payTr").value) || 0;
  const db = parseFloat(document.getElementById("payDb").value) || 0;
  const cc = parseFloat(document.getElementById("payCc").value) || 0;
  const sum = ef + tr + db + cc;
  const resta = tot - sum;
  const restaEl = document.getElementById("modalResta");
  const vWrap = document.getElementById("vueltoWrap");
  const vEl = document.getElementById("modalVuelto");

  if (resta > 0) {
    restaEl.textContent = `$${resta.toLocaleString()}`;
    restaEl.classList.replace("text-success", "text-danger");
    vWrap.classList.add("d-none");
  } else {
    restaEl.textContent = "$0";
    restaEl.classList.replace("text-danger", "text-success");
    if (sum > tot) { vWrap.classList.remove("d-none"); vEl.textContent = `$${(sum - tot).toLocaleString()}`; }
    else { vWrap.classList.add("d-none"); }
  }
}

const originalBtnConfirmar = document.getElementById("btnConfirmVenta");
if (originalBtnConfirmar) {
  // Forzar limpieza absoluta de cualquier evento anterior
  const newBtn = originalBtnConfirmar.cloneNode(true);
  originalBtnConfirmar.replaceWith(newBtn);

  newBtn.addEventListener("click", async function(e) {
    if (e) e.preventDefault();

    if (isProcessingVenta) {
      console.log("⚠️ Intento de doble envío bloqueado por estado global.");
      return;
    }
    isProcessingVenta = true; // Activar escudo

    try {
      const tab = getActiveTab();
      if (!tab || tab.cart.length === 0) return;
      const tot = tab.cart.reduce((a, b) => a + b.price * b.qty, 0);
      const ef = parseFloat(document.getElementById("payEf").value) || 0;
      const tr = parseFloat(document.getElementById("payTr").value) || 0;
      const db = parseFloat(document.getElementById("payDb").value) || 0;
      const cc = parseFloat(document.getElementById("payCc").value) || 0;
      const sumTotal = ef + tr + db + cc;

      if (sumTotal < tot) { Swal.fire("Incompleto", `Faltan $${(tot - sumTotal).toLocaleString()}`, "warning"); return; }

      const payload = {
        tipo: "Local",
        cliente_id: tab.selectedCliente.id,
        total: tot,
        items: [...tab.cart].map((i) => ({ id: i.id, qty: i.qty })),
        detalle: [...tab.cart].map((i) => ({ nombre: i.nombre, qty: i.qty, precio_unit: i.price, subtotal: i.price * i.qty })),
        pagos: { efectivo: ef, transferencia: tr, debito: db, cc: cc }
      };

      // 3. Vaciar el carrito global al instante
      tab.cart = [];
      saveTabsToLocal();
      renderCart();

      if (!navigator.onLine) {
        payload.offline = true;
        payload.fecha = new Date().toISOString();
        await queueSale(payload);
        Swal.fire("Guardado Offline", "Se sincronizará luego.", "success");
        cobroModal.hide(); resetFacturador(); return;
      }

      const res = await fetch("/api/registrar_venta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) {
        cobroModal.hide();
        lastVentaId = d.venta_id; lastVentaTotal = tot;
        document.body.style.backgroundColor = "#dcfce7";
        setTimeout(() => (document.body.style.backgroundColor = ""), 300);
        document.getElementById("postSaleInfo").textContent = `Venta por $${tot.toLocaleString()}`;
        document.getElementById("waForm").classList.add("d-none");
        postSaleSelectedIndex = 0; updatePostOptions();
        postSaleModal.show(); resetFacturador();
      } else { Swal.fire("Error", d.mensaje, "error"); }
    } finally {
      isProcessingVenta = false; // Resetear estado para próxima venta
    }
  });
}

// Product Search Modal
function abrirModalProductos() {
  selectedProd = null;
  searchSelectedIndex = -1;
  currentSearchResults = [];
  const dialog = document.querySelector("#searchModal .modal-dialog");
  dialog.classList.add("modal-xl");
  dialog.style.maxWidth = "";
  document.getElementById("stepSearch").classList.remove("d-none");
  document.getElementById("stepQty").classList.add("d-none");
  document.getElementById("modalResults").innerHTML = "";
  const mS = document.getElementById("modalSearchIn");
  mS.value = "";
  modalProductos.show();
  setTimeout(() => mS.focus(), 500);
}

function askQty(p) {
  selectedProd = p;
  document.getElementById("qtyProdName").textContent = p.nombre;
  const dialog = document.querySelector("#searchModal .modal-dialog");
  dialog.classList.remove("modal-xl");
  dialog.style.maxWidth = "350px";
  document.getElementById("stepSearch").classList.add("d-none");
  document.getElementById("stepQty").classList.remove("d-none");
  const mQ = document.getElementById("modalQtyIn");
  mQ.value = 1;
  setTimeout(() => { mQ.focus(); mQ.select(); }, 100);
}

function updateSearchHighlight() {
  const rows = document.getElementById("modalResults").querySelectorAll("tr");
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

// Event Listeners Setup
function setupEventListeners() {
  // Sidebar items
  document.querySelectorAll(".sidebar-item").forEach(item => {
    item.addEventListener("click", function() {
      const section = this.getAttribute("data-section");
      switchSection(section, this);
    });
  });

  // Global Keydown
  window.addEventListener("keydown", handleGlobalShortcuts);

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
    const id = parseInt(target.getAttribute("data-id"));
    if (action === "remItem") remItem(id);
  });

  document.getElementById("cartBody")?.addEventListener("change", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const id = parseInt(target.getAttribute("data-id"));
    if (action === "updQty") updQty(id, target.value);
  });

  // Client Manager Search
  document.getElementById("custManagerSearch")?.addEventListener("input", renderCustManager);

  // Other buttons
  document.getElementById("btnNewCust")?.addEventListener("click", () => openEditCustModal());
  document.getElementById("btnSaveCust")?.addEventListener("click", saveCustManager);
  document.getElementById("btnSelectCust")?.addEventListener("click", openCustModal);
  document.getElementById("btnResetFacturador")?.addEventListener("click", resetFacturador);
  document.getElementById("btnOpenCobro")?.addEventListener("click", openCobro);
  document.getElementById("btnUpdateVentas")?.addEventListener("click", cargarVentasDia);
  
  // Maestro-Detalle Ticket action buttons
  document.getElementById("btnReimprimir")?.addEventListener("click", () => {
    if (ventaSeleccionadaId) reimprimirTicket(ventaSeleccionadaId);
  });

  document.getElementById("btnUpdateDeudores")?.addEventListener("click", cargarDeudores);
  const btnConfirmVentaSetup = document.getElementById("btnConfirmVenta");
  if (btnConfirmVentaSetup && !btnConfirmVentaSetup.onclick) {
    // handled above via inline assignment
  }
  document.getElementById("btnGasto")?.addEventListener("click", openGastoModal);
  const btnViejoGasto = document.getElementById("btnSaveGasto");
  if (btnViejoGasto) {
    const btnNuevoGasto = btnViejoGasto.cloneNode(true);
    btnViejoGasto.replaceWith(btnNuevoGasto);
    btnNuevoGasto.onclick = function(e) {
      if (e) e.preventDefault();
      saveGasto();
    };
  }
  document.getElementById("btnNewCustSimple")?.addEventListener("click", () => document.getElementById("addCustForm").classList.toggle("d-none"));
  document.getElementById("btnSaveNewCust")?.addEventListener("click", saveNewCust);
  
  // Search inputs
  document.getElementById("searchDeudores")?.addEventListener("input", filtrarDeudores);
  document.getElementById("custManagerSearch")?.addEventListener("input", renderCustManager);
  
  // Form submission
  document.getElementById("custForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveCustManager();
  });
  
  // Post-Sale Options
  document.querySelectorAll(".post-opt").forEach((btn, i) => {
    btn.addEventListener("click", function() {
      const action = this.getAttribute("data-action");
      postAction(action);
    });
  });

  // WhatsApp
  document.getElementById("btnSendWA")?.addEventListener("click", sendWA);

  // Modal specific
  document.getElementById("modalSearchIn")?.addEventListener("input", handleSearchInput);
  document.getElementById("custSearchIn")?.addEventListener("input", () => {
    const q = document.getElementById("custSearchIn").value.toLowerCase();
    currentCustResults = allClientes.filter(c => c.nombre.toLowerCase().includes(q) || (c.cuit && c.cuit.includes(q)));
    custSelectedIndex = currentCustResults.length > 0 ? 0 : -1;
    renderCusts(currentCustResults);
  });

  // Scanner
  const scannerInput = document.getElementById("scannerInput");
  if (scannerInput) {
    scannerInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const code = scannerInput.value.trim();
        scannerInput.value = "";
        if (!code) return;
        try {
          const res = await fetch(`/buscar_por_codigo/${encodeURIComponent(code)}`);
          const data = await res.json();
          if (data.ok && data.producto) {
            addItem(data.producto, 1);
            document.body.style.backgroundColor = "#dcfce7";
            setTimeout(() => (document.body.style.backgroundColor = ""), 200);
          } else {
            document.body.style.backgroundColor = "#fee2e2";
            setTimeout(() => (document.body.style.backgroundColor = ""), 300);
            alert("No encontrado: " + code);
          }
        } catch (err) { console.error(err); }
        scannerInput.focus();
      }
    });
  }

  // Multi-payment inputs
  ["payEf", "payTr", "payDb", "payCc"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcMultiPago);
  });
}

function handleGlobalShortcuts(e) {
  if (["F1", "F2", "F3"].includes(e.key)) e.preventDefault();
  if (postSaleModal?._element?.classList.contains("show")) {
    const opts = document.querySelectorAll(".post-opt");
    if (e.key === "ArrowDown") { e.preventDefault(); postSaleSelectedIndex = (postSaleSelectedIndex + 1) % opts.length; updatePostOptions(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); postSaleSelectedIndex = (postSaleSelectedIndex - 1 + opts.length) % opts.length; updatePostOptions(); }
    else if (e.key === "Enter") { e.preventDefault(); opts[postSaleSelectedIndex].click(); }
    else if (e.key === "Escape") postAction("finish");
    return;
  }
  if (cobroModalOpen) {
    if (e.key === "Escape") cobroModal.hide();
    else if (e.key === "Enter") { e.preventDefault(); document.getElementById("btnConfirmVenta")?.click(); }
    return;
  }
  if (modalProductos?._element?.classList.contains("show")) {
    if (e.key === "Escape") modalProductos.hide();
    return;
  }
  if (document.querySelector(".modal.show")) return;

  if (e.key === "F1") abrirModalProductos();
  if (e.key === "F2") openCobro();
  if (e.key === "F3") openCustModal();

  const tab = getActiveTab();
  if (!tab) return;
  if (e.key === "ArrowDown") { e.preventDefault(); cartSelectedIndex++; if (cartSelectedIndex >= tab.cart.length) cartSelectedIndex = tab.cart.length - 1; renderCart(); }
  if (e.key === "ArrowUp") { e.preventDefault(); cartSelectedIndex--; if (cartSelectedIndex < 0) cartSelectedIndex = 0; renderCart(); }
}

async function handleSearchInput(e) {
  const q = e.target.value.trim();
  const resultsBody = document.getElementById("modalResults");
  searchSelectedIndex = -1;
  currentSearchResults = [];
  if (q.length < 2) { resultsBody.innerHTML = ""; return; }
  try {
    const r = await fetch(`/buscar_productos?q=${encodeURIComponent(q)}`);
    const data = await r.json();
    resultsBody.innerHTML = "";
    if (data.productos && data.productos.length > 0) {
      currentSearchResults = data.productos;
      searchSelectedIndex = 0;
      data.productos.forEach((p, i) => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        if (i === 0) { tr.classList.add("table-active"); tr.style.backgroundColor = "#e2e8f0"; }
        tr.innerHTML = `
          <td><strong>${p.nombre}</strong><br><small>${p.categoria || "General"}</small></td>
          <td class="text-center"><span class="badge ${p.stock > 0 ? "bg-success" : "bg-danger"}">${p.stock}</span></td>
          <td class="text-end fw-bold">$${p.precio_lista_1.toLocaleString()}</td>
          <td class="text-end text-muted small">$${p.precio_lista_2.toLocaleString()}</td>
          <td class="text-end text-muted small">$${p.precio_lista_3.toLocaleString()}</td>
        `;
        resultsBody.appendChild(tr);
      });
    } else { resultsBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">No encontrado</td></tr>'; }
  } catch (err) { console.error(err); }
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
  saveTabsToLocal();
  renderCart();
}

// Start the app
document.addEventListener("DOMContentLoaded", initApp);

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
