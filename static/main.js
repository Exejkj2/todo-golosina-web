/* ============================================================
   MAIN.JS — Lógica específica de index.html
   El carrito lo maneja cart.js (cargado antes)
   ============================================================ */

/* ── Navbar scroll ─────────────────────────────────────────── */
const navbar = document.getElementById('mainNavbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── Active nav link al hacer scroll ──────────────────────── */
const sections   = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.tg-nav-link');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 130) current = sec.id;
  });
  navAnchors.forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === `#${current}`);
  });
}, { passive: true });

/* ── Scroll reveal ─────────────────────────────────────────── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity   = '1';
      e.target.style.transform = 'translateY(0)';
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.tg-product-card, .tg-testimonial-card, .tg-feature-item, .tg-contact-link, .tg-icon-cell'
).forEach(el => {
  el.style.opacity    = '0';
  el.style.transform  = 'translateY(28px)';
  el.style.transition = 'opacity .55s ease, transform .55s ease';
  revealObs.observe(el);
});

/* ── Botones "Agregar al carrito" del hero/products en index ─ */
document.querySelectorAll('[onclick*="addToCart"]').forEach(btn => {
  // Los botones de index usan data-product como texto, los envolvemos
  // para que pasen un objeto compatible con cart.js
  btn.removeAttribute('onclick');
  btn.addEventListener('click', () => {
    const name  = btn.dataset.product || 'Golosina';
    const price = parseInt(btn.dataset.price || '1000', 10);
    const id    = btn.dataset.id || name.toLowerCase().replace(/\s+/g, '-');
    addToCart({ id, name, price, emoji: '🍬', img: '' });
  });
});

/* ── Botones .tg-btn-small con data-product en index.html ──── */
document.querySelectorAll('.tg-btn-small').forEach(btn => {
  btn.addEventListener('click', () => {
    const name  = btn.dataset.product || btn.closest('.tg-product-body')
                      ?.querySelector('.tg-product-name')?.textContent || 'Golosina';
    const priceEl = btn.closest('.tg-product-body')?.querySelector('.tg-price');
    const price   = priceEl
      ? parseInt(priceEl.textContent.replace(/\D/g,''), 10)
      : 1000;
    const id = name.toLowerCase().replace(/\s+/g,'-');
    addToCart({ id, name, price, emoji: '🍬', img: '' });

    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> ¡Listo!';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });
});

