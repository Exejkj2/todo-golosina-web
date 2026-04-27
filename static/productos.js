/* ============================================================
   PRODUCTOS.JS — Catálogo que consume la API Flask
   GET http://localhost:5000/api/productos
   Depende de cart.js (cargado antes en el HTML)
   ============================================================ */

const API_URL = '/api';

// ─── Estado ────────────────────────────────────────────────────
let todosLosProductos = [];   // copia completa desde la API
let activeFilter = 'all';
let activeSort   = 'default';

// ══════════════════════════════════════════════════════════════
//  FETCH DESDE LA API
// ══════════════════════════════════════════════════════════════

async function fetchProductos() {
  mostrarSkeleton();
  try {
    const res  = await fetch(`${API_URL}/productos`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    todosLosProductos = data.productos;
    renderProducts();
    await fetchCategorias();    // actualizar filtros según DB
  } catch (err) {
    console.warn('API no disponible, usando catálogo local.', err);
    todosLosProductos = FALLBACK_PRODUCTS;
    renderProducts();
    mostrarAlertaAPI();
  }
}

async function fetchCategorias() {
  try {
    const res  = await fetch(`${API_URL}/categorias`);
    const data = await res.json();
    if (data.ok) renderFiltrosDinamicos(data.categorias);
  } catch (_) { /* silencioso */ }
}

// ──────────────────────────────────────────────────────────────
//  RENDER DE CARDS
// ──────────────────────────────────────────────────────────────

const CATEGORY_ICONS = {
  gummies:      '🐻', chupetines: '🍭', chocolates:   '🍫',
  marshmallows: '☁️', acidos:     '⚡', caramelos:    '🍡',
  giftbox:      '🎁', general:    '🍬',
};
const CATEGORY_LABELS = {
  gummies:      '🐻 Gummies',    chupetines: '🍭 Chupetines',
  chocolates:   '🍫 Chocolates', marshmallows:'☁️ Marshmallows',
  acidos:       '⚡ Ácidos',     caramelos:  '🍡 Caramelos',
  giftbox:      '🎁 Gift Boxes', general:    '🍬 General',
};

function renderProducts() {
  const grid  = document.getElementById('productsGrid');
  const count = document.getElementById('resultsCount');

  // 1. Filtrar
  let filtered = activeFilter === 'all'
    ? [...todosLosProductos]
    : todosLosProductos.filter(p => p.categoria === activeFilter);

  // 2. Ordenar
  if (activeSort === 'precio_asc')  filtered.sort((a, b) => a.precio - b.precio);
  if (activeSort === 'precio_desc') filtered.sort((a, b) => b.precio - a.precio);
  if (activeSort === 'nombre')      filtered.sort((a, b) => a.nombre.localeCompare(b.nombre));

  count.textContent = `Mostrando ${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <div style="font-size:3.5rem">🔍</div>
        <p class="tg-text-muted mt-3">No encontramos productos en esta categoría.</p>
        <button class="btn tg-filter-btn active mt-2" onclick="resetFiltros()">Ver todos</button>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((p, i) => cardHTML(p, i)).join('');

  // Stagger animation
  grid.querySelectorAll('.tg-pc').forEach((el, i) => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(22px)';
    el.style.transition = `opacity .4s ease ${i * 0.04}s, transform .4s ease ${i * 0.04}s`;
    requestAnimationFrame(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0)';
    });
  });
}

function cardHTML(p, i) {
  const emoji    = CATEGORY_ICONS[p.categoria] || '🍬';
  const catLabel = CATEGORY_LABELS[p.categoria] || p.categoria;
  const precio   = Number(p.precio).toLocaleString('es-AR');
  const stockBadge = p.stock <= 5 && p.stock > 0
    ? `<span class="tg-pc-badge tg-badge--hot">⚠️ Últimas ${p.stock}</span>`
    : p.stock === 0
    ? `<span class="tg-pc-badge" style="background:rgba(100,100,100,.6)">Sin stock</span>`
    : '';

  // Escapamos comillas para usar en atributo onclick
  const nombre = p.nombre.replace(/'/g, "\\'");
  const imgEsc = (p.imagen || '').replace(/'/g, "\\'");
  const imgSrc = p.imagen ? (p.imagen.startsWith('http') || p.imagen.startsWith('/static/') ? p.imagen : `/static/${p.imagen}`) : '';

  // Lógica de precio tachado / descuento
  let precioHTML;
  if (p.precio_anterior && p.precio_anterior > p.precio) {
    const precioAnt = Number(p.precio_anterior).toLocaleString('es-AR');
    const descPct   = Math.round((p.precio_anterior - p.precio) / p.precio_anterior * 100);
    precioHTML = `
      <span style="text-decoration:line-through; color:#94a3b8; font-size:0.8rem; font-weight:400; display:block;">$${precioAnt}</span>
      <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
        <span style="color:#16a34a; font-weight:700; font-size:1rem;">$${precio}</span>
        <span style="background:#16a34a; color:#fff; font-size:0.65rem; font-weight:700; padding:0.15rem 0.45rem; border-radius:99px; white-space:nowrap;">${descPct}% OFF</span>
      </div>`;
  } else {
    precioHTML = `$${precio}<small>por unidad</small>`;
  }

  return `
    <div class="col-sm-6 col-lg-4 col-xl-3">
      <div class="tg-pc" id="card-${p.id}">
        <div class="tg-pc-img">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${p.nombre}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=tg-pc-emoji-placeholder>${emoji}</div>'">`
            : `<div class="tg-pc-emoji-placeholder">${emoji}</div>`}
          ${stockBadge}
          <button class="tg-pc-wish ${wishlist.has(p.id) ? 'active' : ''}"
                  onclick="toggleWish(${p.id}, this)" aria-label="Favorito">
            <i class="bi bi-heart${wishlist.has(p.id) ? '-fill' : ''}"></i>
          </button>
        </div>
        <div class="tg-pc-body">
          <span class="tg-pc-category">${catLabel}</span>
          <h3 class="tg-pc-name">${p.nombre}</h3>
          <p class="tg-pc-desc">${p.descripcion || ''}</p>
          <div class="tg-pc-footer">
            <div class="tg-pc-price">
              ${precioHTML}
            </div>
            <button class="tg-pc-btn"
                    id="btn-${p.id}"
                    onclick="handleAddToCart(${p.id}, '${nombre}', ${p.precio}, '${emoji}', '${imgEsc}', ${p.stock}, ${p.permitir_sin_stock ? 'true' : 'false'}, this)"
                    ${(p.stock <= 0 && !p.permitir_sin_stock) ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
              <i class="bi bi-bag-plus"></i> ${(p.stock <= 0 && !p.permitir_sin_stock) ? 'Agotado' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────
//  FILTROS DINÁMICOS (desde API)
// ──────────────────────────────────────────────────────────────

function renderFiltrosDinamicos(categorias) {
  const bar = document.getElementById('filterBtns');
  const cats = categorias.map(c => `
    <button class="btn tg-filter-btn ${activeFilter === c.categoria ? 'active' : ''}"
            data-filter="${c.categoria}">
      ${CATEGORY_ICONS[c.categoria] || '🍬'} ${c.categoria.charAt(0).toUpperCase() + c.categoria.slice(1)}
      <span class="tg-filter-count">${c.cantidad}</span>
    </button>`).join('');

  bar.innerHTML = `
    <button class="btn tg-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">
      🍭 Todos
    </button>
    ${cats}`;
}

function resetFiltros() {
  activeFilter = 'all';
  document.querySelectorAll('.tg-filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-filter="all"]')?.classList.add('active');
  renderProducts();
}

// ──────────────────────────────────────────────────────────────
//  CARRITO
// ──────────────────────────────────────────────────────────────

function handleAddToCart(id, nombre, precio, emoji, img, stock, permitir_sin_stock, btn) {
  addToCart({ id: `${id}`, name: nombre, price: Number(precio), emoji, img, stock, permitir_sin_stock });

  btn.innerHTML = '<i class="bi bi-check-lg"></i> ¡Listo!';
  btn.classList.add('added');
  setTimeout(() => {
    btn.innerHTML = '<i class="bi bi-bag-plus"></i> Agregar';
    btn.classList.remove('added');
  }, 1600);
}

// ──────────────────────────────────────────────────────────────
//  WISHLIST
// ──────────────────────────────────────────────────────────────

const wishlist = new Set(JSON.parse(localStorage.getItem('tg_wishes') || '[]'));

function toggleWish(id, btn) {
  if (wishlist.has(id)) {
    wishlist.delete(id);
    btn.classList.remove('active');
    btn.innerHTML = '<i class="bi bi-heart"></i>';
  } else {
    wishlist.add(id);
    btn.classList.add('active');
    btn.innerHTML = '<i class="bi bi-heart-fill"></i>';
  }
  localStorage.setItem('tg_wishes', JSON.stringify([...wishlist]));
}

// ──────────────────────────────────────────────────────────────
//  SKELETON LOADER
// ──────────────────────────────────────────────────────────────

function mostrarSkeleton() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = Array(8).fill(0).map(() => `
    <div class="col-sm-6 col-lg-4 col-xl-3">
      <div class="tg-pc tg-skeleton">
        <div class="tg-skeleton-img"></div>
        <div class="tg-pc-body">
          <div class="tg-skeleton-line w-30"></div>
          <div class="tg-skeleton-line w-70 mt-1"></div>
          <div class="tg-skeleton-line w-90 mt-1"></div>
          <div class="tg-skeleton-line w-50 mt-2"></div>
        </div>
      </div>
    </div>`).join('');
}

// ──────────────────────────────────────────────────────────────
//  ALERTA API OFFLINE
// ──────────────────────────────────────────────────────────────

function mostrarAlertaAPI() {
  const existing = document.getElementById('apiAlert');
  if (existing) return;
  const alert = document.createElement('div');
  alert.id = 'apiAlert';
  alert.className = 'tg-api-alert';
  alert.innerHTML = `
    <i class="bi bi-exclamation-triangle me-2"></i>
    <span>No se pudo conectar con el servidor. Mostrando catálogo de respaldo.</span>
    <button onclick="this.parentElement.remove()" class="tg-api-alert-close">✕</button>`;
  document.querySelector('.tg-filters-bar')?.insertAdjacentElement('afterend', alert);
}

// ──────────────────────────────────────────────────────────────
//  FALLBACK (catálogo local si la API no responde)
// ──────────────────────────────────────────────────────────────

const FALLBACK_PRODUCTS = [
  { id:1,  nombre:'Ositos Gummies Premium',       descripcion:'Los clásicos en versión XL. 20 sabores distintos.',            precio:1200, imagen:'assets/product_gummies.png',      categoria:'gummies',      stock:150 },
  { id:2,  nombre:'Chupetines Arcoíris',           descripcion:'Espirales de colores con sabores frutales intensos.',          precio:800,  imagen:'assets/product_lollipops.png',    categoria:'chupetines',   stock:200 },
  { id:3,  nombre:'Bombones Artesanales',          descripcion:'Bombones de chocolatería fina con rellenos únicos.',           precio:2500, imagen:'assets/product_chocolates.png',   categoria:'chocolates',   stock:80  },
  { id:4,  nombre:'Marshmallows Esponjosos',       descripcion:'Suaves y esponjosos en colores pastel.',                      precio:950,  imagen:'assets/product_marshmallows.png', categoria:'marshmallows', stock:120 },
  { id:5,  nombre:'Gomitas Ácidas Neon',           descripcion:'Gusanitos y anillos ácidos con cobertura de azúcar.',         precio:1100, imagen:'',                                categoria:'acidos',       stock:90  },
  { id:6,  nombre:'Caramelos Surtidos Importados', descripcion:'Selección de caramelos duros de todo el mundo.',              precio:1400, imagen:'',                                categoria:'caramelos',    stock:60  },
  { id:7,  nombre:'Caja Sorpresa Personalizada',   descripcion:'Armamos la caja perfecta para tu ocasión especial.',          precio:4000, imagen:'',                                categoria:'giftbox',      stock:30  },
  { id:8,  nombre:'Gummies Osos Gigantes',         descripcion:'Versión jumbo de los clásicos ositos.',                       precio:1600, imagen:'',                                categoria:'gummies',      stock:75  },
];

// ──────────────────────────────────────────────────────────────
//  EVENTOS
// ──────────────────────────────────────────────────────────────

document.getElementById('filterBtns').addEventListener('click', e => {
  const btn = e.target.closest('.tg-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.tg-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderProducts();
});

document.getElementById('sortSelect').addEventListener('change', e => {
  activeSort = e.target.value;
  renderProducts();
});

// Navbar scroll
const navbar = document.getElementById('mainNavbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ──────────────────────────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  fetchProductos();

  // Actualizar select de orden con los mismos keys que la API
  document.getElementById('sortSelect').innerHTML = `
    <option value="default">Destacados</option>
    <option value="precio_asc">Precio: menor a mayor</option>
    <option value="precio_desc">Precio: mayor a menor</option>
    <option value="nombre">Nombre A-Z</option>`;
});
