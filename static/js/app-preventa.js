// app-preventa.js - Lógica principal de Preventa (Versión CSP-Compliant)
// Todo Golosina POS System

let prods = [];
let cart = [];
let cli = null;
let listaActual = 1;
let pendingFinalize = false;

// Initializations
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js');
  }
  fetchProds();
  buscarCli('');
  setupEventListeners();
});

// ═══ CLIENTES ═══
function abrirClientes() {
  document.getElementById('cliOverlay')?.classList.add('show');
  document.getElementById('buscCli')?.focus();
}

function cerrarClientes() {
  document.getElementById('cliOverlay')?.classList.remove('show');
}

async function buscarCli(q) {
  try {
    let clis;
    if (navigator.onLine) {
      const r = await fetch('/api/clientes?q=' + encodeURIComponent(q));
      const d = await r.json();
      clis = d.clientes || [];
    } else {
      if (typeof searchLocalClients === "function") {
        clis = await searchLocalClients(q);
      } else {
        clis = [];
      }
    }
    const b = document.getElementById('listaCli');
    if (!b) return;
    if (!clis.length) {
      b.innerHTML = '<div class="empty">Sin resultados. Creá un cliente nuevo abajo 👇</div>';
      return;
    }
    b.innerHTML = clis.map(c => `
      <div class="cli-item" data-action="selCli" data-id="${c.id}" data-nombre="${c.nombre.replace(/'/g, "")}" data-telefono="${(c.telefono || '').replace(/'/g, "")}">
        <div class="avatar">${c.nombre[0].toUpperCase()}</div>
        <div class="cli-item-info">
          <strong>${c.nombre}</strong>
          <small>${c.telefono || 'Sin teléfono'} ${c.cuit ? '• CUIT: ' + c.cuit : ''}</small>
        </div>
        <i class="bi bi-chevron-right text-muted"></i>
      </div>
    `).join('');
  } catch (e) { console.error(e) }
}

function selCli(id, n, t) {
  cli = { id, nombre: n, telefono: t };
  const banner = document.getElementById('cliBanner');
  if (banner) banner.innerHTML = `<i class="bi bi-person-check-fill"></i> Vendiendo a: <strong>${n}</strong>`;
  cerrarClientes();
  if (pendingFinalize && cart.length) {
    setTimeout(() => procesarVenta(), 300);
  }
}

async function crearCli() {
  const n = document.getElementById('ncNom').value.trim();
  if (!n) { alert('Ingresá el nombre del cliente'); return }
  const body = {
    nombre: n,
    telefono: document.getElementById('ncTel').value.trim(),
    cuit: document.getElementById('ncCuit').value.trim(),
    direccion: document.getElementById('ncDir').value.trim(),
    condicion_iva: document.getElementById('ncIva').value,
    descuento_fijo: document.getElementById('ncDesc').value || 0
  };
  try {
    const r = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) {
      selCli(d.cliente.id, d.cliente.nombre, d.cliente.telefono || '');
      ['ncNom', 'ncTel', 'ncCuit', 'ncDir', 'ncDesc'].forEach(x => {
          const el = document.getElementById(x);
          if (el) el.value = '';
      });
      const desc = document.getElementById('ncDesc');
      if (desc) desc.value = 0;
    if (d.ok) {
      console.log('Cliente guardado');
      buscarCli('');
      if (document.getElementById('newClientForm')) document.getElementById('newClientForm').classList.add('d-none');
    } else {
      alert('Error: ' + (d.mensaje || 'No se pudo guardar el cliente'));
    }
  } catch (e) { console.error(e); alert('Error de conexión'); }
}

// ═══ PRODUCTOS ═══
async function fetchProds() {
  try {
    if (navigator.onLine) {
      const r = await fetch('/api/productos');
      const d = await r.json();
      prods = d.productos || [];
    } else {
      if (typeof searchLocalProducts === "function") {
          prods = await searchLocalProducts('');
      } else {
          prods = [];
      }
    }
  } catch (e) { prods = [] }
  renderGrid(prods);
}

function filtrar(q) {
  q = q.toLowerCase().trim();
  renderGrid(prods.filter(p => p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q)))
}

function renderGrid(list) {
  const g = document.getElementById('grid');
  if (!g) return;
  if (!list.length) { g.innerHTML = '<div class="empty">🔍 Sin productos</div>'; return }
  g.innerHTML = list.map(p => {
    const img = (p.imagen && (p.imagen.startsWith('http') || p.imagen.startsWith('/static/'))) ? `<img src="${p.imagen}" onerror="this.parentElement.textContent='🍬'">` : '🍬';
    const precioU = listaActual == 3 ? p.precio_lista_3 : (listaActual == 2 ? p.precio_lista_2 : p.precio_lista_1);
    const pr = Number(precioU).toLocaleString('es-AR');
    const tag = (p.descuento_volumen_activo && p.cantidad_minima_descuento && p.porcentaje_descuento_volumen) ? `<span class="item-tag">x${p.cantidad_minima_descuento}+ → ${Math.round(p.porcentaje_descuento_volumen)}%</span>` : '';
    const off = (p.stock <= 0 && !p.permitir_sin_stock); 
    const dis = off ? 'disabled' : '';
    return `<div class="item">
      <div class="item-img">${img}</div>
      <div class="item-body">
        <span class="item-cat">${p.categoria || ''}</span>
        <p class="item-name">${p.nombre}</p>
        <div class="item-meta"><span class="item-price">$${pr}</span>${tag}</div>
      </div>
      <div class="item-actions">
        <input type="number" class="qty-in" value="1" min="1" ${(!p.permitir_sin_stock && p.stock > 0) ? `max="${p.stock}"` : ''} inputmode="numeric" pattern="[0-9]*" id="qi${p.id}" ${dis} data-id="${p.id}">
        <button class="btn-add" id="qb${p.id}" ${dis} data-action="agregar" data-id="${p.id}" aria-label="Agregar">
          ${off ? '<i class="bi bi-x-lg"></i>' : '<i class="bi bi-plus-lg"></i>'}
        </button>
      </div>
    </div>`}).join('');
}

function cambiarLista(v) {
  listaActual = parseInt(v);
  cart.forEach(item => {
    const p = prods.find(x => x.id === item.id);
    if (p) {
      item.price = listaActual == 3 ? p.precio_lista_3 : (listaActual == 2 ? p.precio_lista_2 : p.precio_lista_1);
    }
  });
  renderGrid(prods);
  updFab();
  if (document.getElementById('cartPanel')?.classList.contains('show')) renderCart();
}

// ═══ CARRITO ═══
function ep(i) { return (i.da && i.dm && i.dp && i.qty >= i.dm) ? i.price * (1 - i.dp / 100) : i.price }

function agregar(id) {
  const p = prods.find(x => x.id == id);
  if (!p) return;
  const price = listaActual == 3 ? p.precio_lista_3 : (listaActual == 2 ? p.precio_lista_2 : p.precio_lista_1);
  const inp = document.getElementById('qi' + id);
  const qty = Math.max(1, parseInt(inp?.value) || 1);
  const ex = cart.find(x => x.id === id);
  if (ex) { 
      ex.qty += qty; 
      ex.price = price;
  } else { 
      cart.push({ id, name: p.nombre, price, stock: p.stock, pss: !!p.permitir_sin_stock, da: !!p.descuento_volumen_activo, dm: p.cantidad_minima_descuento, dp: p.porcentaje_descuento_volumen, qty }) 
  }
  if (inp) inp.value = 1;
  const b = document.getElementById('qb' + id);
  if (b) { 
      b.innerHTML = '<i class="bi bi-check-lg"></i>'; 
      b.classList.add('ok'); 
      setTimeout(() => { 
          b.innerHTML = '<i class="bi bi-plus-lg"></i>'; 
          b.classList.remove('ok') 
      }, 1000) 
  }
  updFab();
}

function setQ(id, v) { 
    const i = cart.find(x => x.id === id); 
    if (!i) return; 
    v = parseInt(v); 
    if (isNaN(v) || v < 1) return; 
    i.qty = v; 
    updFab(); 
    updCartPrices() 
}

function del(id) { 
    cart = cart.filter(x => x.id !== id); 
    updFab(); 
    renderCart() 
}

function vaciar() { 
    if (!confirm('¿Vaciar pedido?')) return; 
    cart = []; 
    updFab(); 
    renderCart() 
}

function updFab() {
  const tot = cart.reduce((a, p) => a + ep(p) * p.qty, 0); 
  const n = cart.reduce((a, p) => a + p.qty, 0);
  const fab = document.getElementById('fab'), fc = document.getElementById('fabCart');
  if (!fab || !fc) return;
  if (!cart.length) { fab.style.display = 'none'; fc.style.display = 'none'; return }
  fab.style.display = 'flex'; fc.style.display = 'flex';
  const fabN = document.getElementById('fabN');
  const fabT = document.getElementById('fabT');
  if (fabN) fabN.textContent = n;
  if (fabT) fabT.textContent = '$' + tot.toLocaleString('es-AR');
}

function abrirCart() { 
    renderCart(); 
    document.getElementById('cartOvl')?.classList.add('show'); 
    document.getElementById('cartPanel')?.classList.add('show') 
}

function cerrarCart() { 
    document.getElementById('cartOvl')?.classList.remove('show'); 
    document.getElementById('cartPanel')?.classList.remove('show') 
}

function renderCart() {
  const b = document.getElementById('cartB'), f = document.getElementById('cartF');
  if (!b || !f) return;
  if (!cart.length) { b.innerHTML = '<div class="empty">Pedido vacío</div>'; f.innerHTML = ''; return }
  const tot = cart.reduce((a, p) => a + ep(p) * p.qty, 0);
  b.innerHTML = cart.map(p => {
    const s = (ep(p) * p.qty).toLocaleString('es-AR');
    const dc = (p.da && p.dm && p.dp && p.qty >= p.dm) ? `<span class="desc-badge">🎉${Math.round(p.dp)}%</span>` : '';
    return `<div class="ci">
      <div style="max-width:60%; flex-shrink:0;">
        <span class="ci-name">${p.name}${dc}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end;">
        <div style="display:flex; align-items:center; gap:2px">
          <small class="text-muted" style="font-weight:700">x</small>
          <input type="number" class="ci-qty" value="${p.qty}" min="1" inputmode="numeric" pattern="[0-9]*" id="cq${p.id}" data-action="setQ" data-id="${p.id}" style="width:40px; height:35px;">
        </div>
        <span class="ci-sub" id="cs${p.id}" style="font-size:0.85rem; font-weight:800; min-width:65px; text-align:right;">$${s}</span>
        <button class="ci-del" data-action="del" data-id="${p.id}" aria-label="Eliminar" style="min-width:35px; height:35px;"><i class="bi bi-trash3" style="font-size:0.9rem"></i></button>
      </div>
    </div>`
  }).join('');
  f.innerHTML = `<div class="total-box">
      <span style="font-weight:700;font-size:1rem;color:var(--dark)">Total del Pedido</span>
      <span style="font-weight:900;font-size:1.4rem;color:var(--blue)" id="cartTot">$${tot.toLocaleString('es-AR')}</span>
    </div>
    <button class="btn-wsp" data-action="finalizar"><i class="bi bi-whatsapp" style="font-size:1.2rem"></i>Finalizar y enviar por WhatsApp</button>
    <button class="btn-clear" data-action="vaciar">Vaciar pedido</button>`;
}

function updCartPrices() {
  cart.forEach(p => { const el = document.getElementById('cs' + p.id); if (el) el.textContent = '$' + (ep(p) * p.qty).toLocaleString('es-AR') });
  const tot = cart.reduce((a, p) => a + ep(p) * p.qty, 0);
  const tEl = document.getElementById('cartTot'); if (tEl) tEl.textContent = '$' + tot.toLocaleString('es-AR');
}

async function finalizar() {
  if (!cart.length) { alert('Pedido vacío'); return }
  if (!cli) {
    cerrarCart();
    pendingFinalize = true;
    abrirClientes();
    return;
  }
  await procesarVenta();
}

async function procesarVenta() {
  const tot = cart.reduce((a, p) => a + ep(p) * p.qty, 0);
  const det = cart.map(p => ({ nombre: p.name, qty: p.qty, precio_unit: ep(p), subtotal: ep(p) * p.qty }));

  if (!navigator.onLine) {
    const saleData = {
      cliente_id: cli.id,
      items: cart.map(p => ({ id: p.id, qty: p.qty })),
      total: tot,
      detalle: det,
      lista_precios: listaActual,
      offline: true,
      fecha_offline: new Date().toISOString()
    };
    if (typeof queueSale === "function") await queueSale(saleData);
    alert('Venta Offline: El pedido se guardó localmente y se enviará al recuperar conexión');
  } else {
    try { await fetch('/api/registrar_venta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: cli.id, items: cart.map(p => ({ id: p.id, qty: p.qty })), total: tot, detalle: det, lista_precios: listaActual }) }) } catch (e) { console.error(e) }
  }

  const lineas = cart.map(p => { const s = (ep(p) * p.qty).toLocaleString('es-AR'); const di = (p.da && p.dm && p.dp && p.qty >= p.dm) ? ` 🎉${Math.round(p.dp)}%desc.` : ''; return `• ${p.name} x${p.qty}${di} → $${s}` }).join('\n');
  const msg = `🍬 *Todo Golosina — Pedido*\n👤 Cliente: *${cli.nombre}*\n📋 Lista: *${listaActual}*\n\n${lineas}\n\n💰 *Total: $${tot.toLocaleString('es-AR')}*\n\n¡Gracias! 😊`;
  const ph = cli.telefono ? cli.telefono.replace(/\D/g, '') : '543865860093';
  const url = `https://wa.me/${ph.startsWith('54') ? ph : '54' + ph}?text=${encodeURIComponent(msg)}`;
  cart = []; cli = null; pendingFinalize = false;
  const banner = document.getElementById('cliBanner');
  if (banner) banner.innerHTML = '<i class="bi bi-person-circle"></i> Seleccioná un cliente';
  updFab(); cerrarCart(); window.open(url, '_blank');
}

// ═══ HISTORIAL ═══
function abrirHist() { cargarHist(); document.getElementById('histOvl')?.classList.add('show'); document.getElementById('histPanel')?.classList.add('show') }
function cerrarHist() { document.getElementById('histOvl')?.classList.remove('show'); document.getElementById('histPanel')?.classList.remove('show') }

async function cargarHist(q = '') {
  const b = document.getElementById('histB');
  if (!b) return;
  b.innerHTML = '<div class="empty">Cargando...</div>';
  try {
    const r = await fetch(`/api/ventas?q=${encodeURIComponent(q)}`); const d = await r.json();
    if (!d.ventas?.length) { b.innerHTML = '<div class="empty">No hay ventas registradas</div>'; return }
    b.innerHTML = d.ventas.map(v => `
      <div class="ci" data-action="verDetalle" data-json='${JSON.stringify(v).replace(/'/g, "&#39;")}' style="cursor:pointer">
        <div style="flex:1; min-width:0; padding-right:10px">
          <small class="text-muted d-block" style="font-size:0.65rem">${v.fecha}</small>
          <span class="ci-name" style="display:block; font-size:0.9rem">${v.cliente_nombre}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-weight:800; color:var(--blue)">$${v.total.toLocaleString('es-AR')}</span>
          <i class="bi bi-chevron-right text-muted"></i>
        </div>
      </div>`).join('');
  } catch (e) { b.innerHTML = '<div class="empty text-danger">Error al cargar historial</div>' }
}

function verDetalle(v) {
  const b = document.getElementById('detB');
  if (!b) return;
  const itemsHtml = (v.detalle || []).map(i => `
    <div class="ci">
      <div style="max-width:70%; flex-shrink:0;">
        <span class="ci-name" style="font-size:0.8rem">${i.nombre}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex:1; justify-content:flex-end;">
        <small class="text-muted">x${i.qty}</small>
        <span style="font-size:0.8rem; font-weight:700">$${(i.subtotal || 0).toLocaleString('es-AR')}</span>
      </div>
    </div>`).join('');

  b.innerHTML = `
    <div style="padding:10px 0; border-bottom:2px dashed var(--border); margin-bottom:10px">
      <h6 style="margin:0; font-weight:800">${v.cliente_nombre}</h6>
      <small class="text-muted"><i class="bi bi-calendar-event me-1"></i>${v.fecha}</small>
    </div>
    <div style="margin-bottom:20px">${itemsHtml}</div>
    <div class="total-box">
      <span style="font-weight:700">Total Venta</span>
      <span style="font-weight:900; font-size:1.3rem; color:var(--blue)">$${v.total.toLocaleString('es-AR')}</span>
    </div>`;

  document.getElementById('detOvl')?.classList.add('show');
  document.getElementById('detPanel')?.classList.add('show');
}
function cerrarDetalle() { document.getElementById('detOvl')?.classList.remove('show'); document.getElementById('detPanel')?.classList.remove('show') }

// Event Delegation & Setup
function setupEventListeners() {
    // Delegation for everything
    document.addEventListener('click', (e) => {
        const target = e.target.closest("[data-action]");
        if (!target) return;
        const action = target.getAttribute("data-action");
        const id = target.getAttribute("data-id");

        if (action === "agregar") agregar(id);
        else if (action === "del") del(parseInt(id));
        else if (action === "vaciar") vaciar();
        else if (action === "finalizar") finalizar();
        else if (action === "selCli") {
            const nombre = target.getAttribute("data-nombre");
            const telefono = target.getAttribute("data-telefono");
            selCli(parseInt(id), nombre, telefono);
        } else if (action === "verDetalle") {
            try {
                const data = JSON.parse(target.getAttribute("data-json"));
                verDetalle(data);
            } catch(err) {}
        }
    });

    document.addEventListener('input', (e) => {
        const target = e.target.closest("[data-action]");
        if (!target) return;
        const action = target.getAttribute("data-action");
        const id = target.getAttribute("data-id");

        if (action === "setQ") setQ(parseInt(id), target.value);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const target = e.target.closest(".qty-in");
            if (target) {
                const id = target.getAttribute("data-id");
                document.getElementById('qb' + id)?.click();
                document.getElementById('buscProd')?.focus();
            }
        }
    });

    // Specific listeners for static elements
    document.getElementById('buscProd')?.addEventListener('input', (e) => filtrar(e.target.value));
    document.getElementById('selLista')?.addEventListener('change', (e) => cambiarLista(e.target.value));
    document.getElementById('buscCli')?.addEventListener('input', (e) => buscarCli(e.target.value));
    document.getElementById('buscHist')?.addEventListener('input', (e) => cargarHist(e.target.value));
    
    document.getElementById('btnAbrirHist')?.addEventListener('click', abrirHist);
    document.getElementById('btnAbrirCli')?.addEventListener('click', abrirClientes);
    document.getElementById('btnCerrarCli')?.addEventListener('click', cerrarClientes);
    document.getElementById('btnCrearCli')?.addEventListener('click', crearCli);
    document.getElementById('btnCerrarCart')?.addEventListener('click', cerrarCart);
    document.getElementById('btnCerrarHist')?.addEventListener('click', cerrarHist);
    document.getElementById('btnCerrarDet')?.addEventListener('click', cerrarDetalle);
    document.getElementById('btnCerrarDetalle')?.addEventListener('click', cerrarDetalle);
    document.getElementById('fab')?.addEventListener('click', abrirCart);
    document.getElementById('fabCart')?.addEventListener('click', abrirCart);
    
    document.getElementById('cartOvl')?.addEventListener('click', cerrarCart);
    document.getElementById('histOvl')?.addEventListener('click', cerrarHist);
    document.getElementById('detOvl')?.addEventListener('click', cerrarDetalle);
    document.getElementById('cliOverlay')?.addEventListener('click', (e) => {
        if(e.target.id === 'cliOverlay') cerrarClientes();
    });
}
