/* ============================================================
   CARRITO — Lógica corregida para Todo Golosina
   ============================================================ */

// ─── Estado del carrito (Clave única: tg_cart) ───────────────
let cart = JSON.parse(localStorage.getItem("tg_cart") || "[]");

// ─── Guardar en localStorage ───────────────────────────────────
function saveCart() {
  localStorage.setItem("tg_cart", JSON.stringify(cart));
}

// ─── Agregar producto (qty opcional: agrega N unidades de una vez) ──
function addToCart(product, qty) {
  qty = Math.max(1, parseInt(qty) || 1);
  const existing = cart.find((p) => p.id === product.id);
  if (existing) {
    // Check stock limit
    if (existing.permitir_sin_stock === false) {
      const maxAgregar = (existing.stock || 0) - existing.qty;
      if (maxAgregar <= 0) {
        alert("No hay más stock disponible para este producto.");
        return;
      }
      qty = Math.min(qty, maxAgregar);
    }
    existing.qty += qty;
  } else {
    // For new product, also check
    if (product.permitir_sin_stock === false && (product.stock || 0) <= 0) {
      alert("Producto agotado.");
      return;
    }
    cart.push({ ...product, qty });
  }
  saveCart();
  updateAllBadges();
  renderOffcanvas();
  showCartToast(product.name, qty);
}

// ─── Editar cantidad directamente en el carrito ────────────────
function setQtyInCart(id, newQty) {
  newQty = parseInt(newQty);
  if (isNaN(newQty) || newQty < 1) return; // ignorar valores inválidos mientras escribe
  const item = cart.find((p) => p.id === id);
  if (!item) return;
  // Respetar stock si no permite sin stock
  if (item.permitir_sin_stock === false && newQty > (item.stock || 0)) {
    newQty = item.stock || 1;
    // Actualizar visualmente el input
    const input = document.getElementById(`qty-input-${id}`);
    if (input) input.value = newQty;
  }
  item.qty = newQty;
  saveCart();
  updateAllBadges();
  // Re-render solo el subtotal y total sin destruir el foco del input
  _updateCartPricesOnly();
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

// ─── Precio efectivo (con descuento por volumen si aplica) ────
function getEffectivePrice(p) {
  if (
    p.descuento_volumen_activo &&
    p.cantidad_minima_descuento &&
    p.porcentaje_descuento_volumen &&
    p.qty >= p.cantidad_minima_descuento
  ) {
    return p.price * (1 - p.porcentaje_descuento_volumen / 100);
  }
  return p.price;
}

// ─── Totales ───────────────────────────────────────────────────
function cartTotalItems() {
  return cart.reduce((acc, p) => acc + p.qty, 0);
}

function cartTotalPrice() {
  return cart.reduce((acc, p) => acc + getEffectivePrice(p) * p.qty, 0);
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
    .map((p) => {
      const precioEfectivo = getEffectivePrice(p);
      const subtotal = (precioEfectivo * p.qty).toLocaleString('es-AR');
      const descInfo = (
        p.descuento_volumen_activo &&
        p.cantidad_minima_descuento &&
        p.porcentaje_descuento_volumen &&
        p.qty >= p.cantidad_minima_descuento
      ) ? ` 🎉 ${Math.round(p.porcentaje_descuento_volumen)}% desc. mayorista` : '';
      return `• ${p.name} x${p.qty}${descInfo} → $${subtotal}`;
    })
    .join('\n');

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
    .map((p) => {
        const precioEfectivo = getEffectivePrice(p);
        const subtotal = (precioEfectivo * p.qty).toLocaleString('es-AR');
        const tieneDescuento = (
          p.descuento_volumen_activo &&
          p.cantidad_minima_descuento &&
          p.porcentaje_descuento_volumen &&
          p.qty >= p.cantidad_minima_descuento
        );
        const mayoristaBadge = tieneDescuento
          ? `<span style="background:#009EE3;color:#fff;font-size:0.65rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:99px;white-space:nowrap;">🎉 ${Math.round(p.porcentaje_descuento_volumen)}% OFF mayorista</span>`
          : '';
        const precioDisplay = tieneDescuento
          ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:0.8rem;">$${(p.price * p.qty).toLocaleString('es-AR')}</span> <strong style="color:#16a34a;" id="subtotal-${p.id}">$${subtotal}</strong>`
          : `<span id="subtotal-${p.id}">$${subtotal}</span>`;
        const maxStock = (!p.permitir_sin_stock && p.stock > 0) ? p.stock : 9999;
        return `
    <div class="tg-cart-item">
      <div class="tg-cart-item-info">
        <span class="tg-cart-item-name">${p.name}</span>
        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
          <span class="tg-cart-item-price">${precioDisplay}</span>
          ${mayoristaBadge}
        </div>
      </div>
      <div class="tg-cart-item-controls">
        <button class="tg-qty-btn" onclick="removeFromCart('${p.id}')"><i class="bi bi-dash"></i></button>
        <input
          type="number"
          id="qty-input-${p.id}"
          class="tg-qty-input"
          value="${p.qty}"
          min="1"
          max="${maxStock}"
          oninput="setQtyInCart('${p.id}', this.value)"
          onblur="_cleanQtyInput('${p.id}', this)"
        >
        <button class="tg-qty-btn" onclick="addToCart({id:'${p.id}',name:'${p.name}',price:${p.price},img:'${p.img}',stock:${p.stock},permitir_sin_stock:${p.permitir_sin_stock},descuento_volumen_activo:${p.descuento_volumen_activo},cantidad_minima_descuento:${p.cantidad_minima_descuento},porcentaje_descuento_volumen:${p.porcentaje_descuento_volumen}})" ${(!p.permitir_sin_stock && p.qty >= (p.stock || 0)) ? 'disabled style="opacity:0.5"' : ''}><i class="bi bi-plus"></i></button>
        <button class="tg-qty-btn text-danger" onclick="deleteFromCart('${p.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>`;
    })
    .join('');

  _renderCartFooter();
}

// ─── Actualiza precios/subtotales SIN re-renderizar todo (preserva foco) ─────
function _updateCartPricesOnly() {
  cart.forEach((p) => {
    const precioEfectivo = getEffectivePrice(p);
    const subtotal = (precioEfectivo * p.qty).toLocaleString('es-AR');
    const tieneDescuento = (
      p.descuento_volumen_activo &&
      p.cantidad_minima_descuento &&
      p.porcentaje_descuento_volumen &&
      p.qty >= p.cantidad_minima_descuento
    );
    const el = document.getElementById(`subtotal-${p.id}`);
    if (el) {
      el.textContent = tieneDescuento ? `$${subtotal}` : `$${subtotal}`;
      // Actualizar el precio tachado si existe
      const parent = el.closest('.tg-cart-item-price')?.parentElement;
      if (parent && tieneDescuento) {
        const tachado = parent.querySelector('span[style*="line-through"]');
        if (tachado) tachado.textContent = `$${(p.price * p.qty).toLocaleString('es-AR')}`;
      }
    }
    // Actualizar input si el valor no coincide (por ej. stock truncado)
    const input = document.getElementById(`qty-input-${p.id}`);
    if (input && document.activeElement !== input) {
      input.value = p.qty;
    }
    // Habilitar/deshabilitar botón '+'
    const controls = input?.closest('.tg-cart-item-controls');
    if (controls) {
      const plusBtn = controls.querySelectorAll('.tg-qty-btn')[1];
      if (plusBtn && !p.permitir_sin_stock) {
        plusBtn.disabled = p.qty >= (p.stock || 0);
        plusBtn.style.opacity = plusBtn.disabled ? '0.5' : '1';
      }
    }
  });
  _renderCartFooter();
}

function _renderCartFooter() {
  const footer = document.getElementById('cartFooter');
  if (!footer) return;
  const total = cartTotalPrice();
  footer.innerHTML = `
    <div class="tg-cart-total d-flex justify-content-between fw-bold p-3">
      <span>Total</span>
      <span id="cart-total-display">$${total.toLocaleString('es-AR')}</span>
    </div>
    <button class="btn btn-success w-100 mb-2" onclick="enviarPedidoWsp()">
      <i class="bi bi-whatsapp me-2"></i>Finalizar Pedido
    </button>
    <button class="btn btn-outline-secondary btn-sm w-100" onclick="clearCart()">
      Vaciar Carrito
    </button>`;
}

// ─── Limpia el input al perder el foco (si quedó vacío, restaura a 1) ────────
function _cleanQtyInput(id, input) {
  const val = parseInt(input.value);
  if (isNaN(val) || val < 1) {
    const item = cart.find(p => p.id === id);
    const restore = (item?.qty) || 1;
    input.value = restore;
    setQtyInCart(id, restore);
  }
}

function showCartToast(name, qty) {
  const toast = document.getElementById("cartToast");
  const msg = document.getElementById("toastMsg");
  if (!toast || !msg) return;
  msg.textContent = qty > 1 ? `${qty}x "${name}" agregados` : `"${name}" agregado`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  updateAllBadges();
  renderOffcanvas();
});