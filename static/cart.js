/* ============================================================
   CARRITO — Lógica corregida para Todo Golosina
   ============================================================ */

// ─── Estado del carrito (Clave única: tg_cart) ───────────────
let cart = JSON.parse(localStorage.getItem("tg_cart") || "[]");

// ─── Guardar en localStorage ───────────────────────────────────
function saveCart() {
  localStorage.setItem("tg_cart", JSON.stringify(cart));
}

// ─── Agregar producto ──────────────────────────────────────────
function addToCart(product) {
  const existing = cart.find((p) => p.id === product.id);
  if (existing) {
    // Check stock limit
    if (existing.permitir_sin_stock === false && existing.qty >= (existing.stock || 0)) {
      alert("No hay más stock disponible para este producto.");
      return;
    }
    existing.qty++;
  } else {
    // For new product, also check
    if (product.permitir_sin_stock === false && (product.stock || 0) <= 0) {
      alert("Producto agotado.");
      return;
    }
    cart.push({ ...product, qty: 1 });
  }
  saveCart();
  updateAllBadges();
  renderOffcanvas();
  showCartToast(product.name);
}

// ─── Quitar una unidad ─────────────────────────────────────────
function removeFromCart(id) {
  const idx = cart.findIndex((p) => p.id === id);
  if (idx === -1) return;
  if (cart[idx].qty > 1) {
    cart[idx].qty--;
  } else {
    cart.splice(idx, 1);
  }
  saveCart();
  updateAllBadges();
  renderOffcanvas();
}

// ─── Eliminar producto completo ────────────────────────────────
function deleteFromCart(id) {
  cart = cart.filter((p) => p.id !== id);
  saveCart();
  updateAllBadges();
  renderOffcanvas();
}

// ─── Vaciar carrito ────────────────────────────────────────────
function clearCart() {
  cart = [];
  saveCart();
  updateAllBadges();
  renderOffcanvas();
}

// ─── Totales ───────────────────────────────────────────────────
function cartTotalItems() {
  return cart.reduce((acc, p) => acc + p.qty, 0);
}

function cartTotalPrice() {
  return cart.reduce((acc, p) => acc + p.price * p.qty, 0);
}

// ─── Enviar pedido por WhatsApp (CORREGIDO) ───────────────────
function enviarPedidoWsp() {
  if (cart.length === 0) {
    alert("Tu carrito está vacío. ¡Agregá productos antes de pedir!");
    return;
  }

  const PHONE = "543865860093";

  // 1. Armamos el mensaje PRIMERO mientras el carrito aún tiene datos
  const lineas = cart
    .map(
      (p) => `• ${p.name} x${p.qty} → $${(p.price * p.qty).toLocaleString("es-AR")}`
    )
    .join("\n");

  const total = cartTotalPrice().toLocaleString("es-AR");

  const mensaje =
    `¡Hola Todo Golosina! 🍬 Quiero realizar el siguiente pedido:\n\n` +
    `${lineas}\n\n` +
    `💰 *Total: $${total}*\n\n` +
    `¡Quedo esperando confirmación. Gracias! 😊`;

  // 2. Registramos la venta en el backend
  const payload = cart.map(p => ({id: p.id, qty: p.qty}));
  fetch('/api/registrar_venta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.error('Error al registrar venta:', err));

  // 3. AHORA SI vaciamos el carrito (después de generar el mensaje)
  cart = [];
  saveCart(); // Esto limpia el localStorage con la clave correcta 'tg_cart'
  updateAllBadges();
  renderOffcanvas();

  // 3. Abrimos WhatsApp
  const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(mensaje)}`;
  
  const offcanvasEl = document.getElementById("cartOffcanvas");
  if (offcanvasEl) {
    bootstrap.Offcanvas.getInstance(offcanvasEl)?.hide();
  }

  window.open(url, "_blank");
}

// ─── Interfaz ──────────────────────────────────────────────────
function updateAllBadges() {
  const count = cartTotalItems();
  document.querySelectorAll(".tg-cart-badge").forEach((el) => {
    el.textContent = count;
  });
}

function renderOffcanvas() {
  const body = document.getElementById("cartBody");
  const footer = document.getElementById("cartFooter");
  if (!body) return;

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="tg-cart-empty">
        <div class="tg-cart-empty-icon">🛒</div>
        <p>Tu carrito está vacío</p>
      </div>`;
    if (footer) footer.innerHTML = "";
    return;
  }

  body.innerHTML = cart
    .map(
      (p) => `
    <div class="tg-cart-item">
      <div class="tg-cart-item-info">
        <span class="tg-cart-item-name">${p.name}</span>
        <span class="tg-cart-item-price">$${(p.price * p.qty).toLocaleString("es-AR")}</span>
      </div>
      <div class="tg-cart-item-controls">
        <button class="tg-qty-btn" onclick="removeFromCart('${p.id}')"><i class="bi bi-dash"></i></button>
        <span class="tg-qty-num">${p.qty}</span>
        <button class="tg-qty-btn" onclick="addToCart({id:'${p.id}',name:'${p.name}',price:${p.price},img:'${p.img}', stock:${p.stock}, permitir_sin_stock:${p.permitir_sin_stock}})" ${(!p.permitir_sin_stock && p.qty >= (p.stock || 0)) ? 'disabled style="opacity: 0.5"' : ''}><i class="bi bi-plus"></i></button>
        <button class="tg-qty-btn text-danger" onclick="deleteFromCart('${p.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>`
    )
    .join("");

  const total = cartTotalPrice();
  if (footer) {
    footer.innerHTML = `
      <div class="tg-cart-total d-flex justify-content-between fw-bold p-3">
        <span>Total</span>
        <span>$${total.toLocaleString("es-AR")}</span>
      </div>
      <button class="btn btn-success w-100 mb-2" onclick="enviarPedidoWsp()">
        <i class="bi bi-whatsapp me-2"></i>Finalizar Pedido
      </button>
      <button class="btn btn-outline-secondary btn-sm w-100" onclick="clearCart()">
        Vaciar Carrito
      </button>`;
  }
}

function showCartToast(name) {
  const toast = document.getElementById("cartToast");
  const msg = document.getElementById("toastMsg");
  if (!toast || !msg) return;
  msg.textContent = `"${name}" agregado`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  updateAllBadges();
  renderOffcanvas();
});