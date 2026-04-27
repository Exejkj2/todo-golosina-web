import os
import re

base_dir = r"c:\Users\Exequiel\Desktop\TodoGolsoinas WEB 1.0\templates"
files = ["index.html", "productos.html", "nosotros.html", "contacto.html"]

whatsapp_btn = """
<!-- Botón WhatsApp Flotante -->
<a href="https://wa.me/5491100000000?text=¡Hola! Vengo de la tienda online de Todo Golosina y tengo una consulta..." 
   target="_blank" 
   class="tg-whatsapp-btn" 
   aria-label="Chat en WhatsApp">
  <i class="bi bi-whatsapp"></i>
</a>
"""

whatsapp_css = """
/* ============================================================
   WHATSAPP BUTTON
   ============================================================ */
.tg-whatsapp-btn {
  position: fixed;
  bottom: 2rem;
  left: 2rem; /* Se ajustó para no tapar el toast */
  background-color: #25d366;
  color: white;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  z-index: 1000;
  transition: transform 0.3s ease;
  text-decoration: none;
}
.tg-whatsapp-btn:hover {
  transform: scale(1.1);
  color: white;
}
"""

with open(os.path.join(r"c:\Users\Exequiel\Desktop\TodoGolsoinas WEB 1.0\static", "style.css"), "a", encoding="utf-8") as f:
    f.write(whatsapp_css)

footer_html = """
<!-- ===================== FOOTER DE CONFIANZA ===================== -->
<footer class="tg-footer" style="background-color: #F5F5F5; border-top: 1px solid rgba(0,0,0,0.1);">
  <div class="container">
    <div class="row py-5 text-center text-md-start">
      <!-- Columna 1: Medios de Pago -->
      <div class="col-md-4 mb-4 mb-md-0">
        <h5 class="fw-bold mb-3" style="color: #2D3277;"><i class="bi bi-credit-card me-2"></i>Medios de Pago</h5>
        <ul class="list-unstyled text-muted small d-flex flex-column gap-2">
          <li><i class="bi bi-check-circle-fill text-success me-2"></i>Mercado Pago</li>
          <li><i class="bi bi-check-circle-fill text-success me-2"></i>Transferencia Bancaria</li>
          <li><i class="bi bi-check-circle-fill text-success me-2"></i>Efectivo</li>
        </ul>
      </div>
      <!-- Columna 2: Logística -->
      <div class="col-md-4 mb-4 mb-md-0">
        <h5 class="fw-bold mb-3" style="color: #2D3277;"><i class="bi bi-truck me-2"></i>Envíos y Entregas</h5>
        <p class="text-muted small mb-0">
          Envíos a domicilio en <strong>Aguilares, Famaillá y Los Ralos</strong>.<br>
          Retiro por sucursal disponible.
        </p>
      </div>
      <!-- Columna 3: Redes Sociales -->
      <div class="col-md-4">
        <h5 class="fw-bold mb-3" style="color: #2D3277;"><i class="bi bi-phone me-2"></i>Seguinos</h5>
        <div class="d-flex justify-content-center justify-content-md-start gap-3">
          <a href="#" class="btn btn-outline-secondary rounded-circle" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"><i class="bi bi-instagram"></i></a>
          <a href="#" class="btn btn-outline-secondary rounded-circle" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"><i class="bi bi-facebook"></i></a>
        </div>
      </div>
    </div>
    <div class="text-center py-3 border-top border-secondary-subtle">
      <p class="mb-0 small text-muted">© 2026 Todo Golosina. Todos los derechos reservados.</p>
    </div>
  </div>
</footer>
"""

for file in files:
    path = os.path.join(base_dir, file)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace Footer
    content = re.sub(r'<footer class="tg-footer".*?</footer\s*>', footer_html, content, flags=re.DOTALL)
    
    # Inject WhatsApp button right before </body>
    if "tg-whatsapp-btn" not in content:
        content = content.replace("</body>", f"{whatsapp_btn}\n</body>")
    
    # Inject search bar in navbar
    search_input = """
        <li class="nav-item ms-lg-3 d-flex align-items-center">
          <input type="text" id="buscadorProductos" class="form-control form-control-sm rounded-pill px-3" placeholder="Buscar golosinas (ej: Hamlet)..." style="min-width: 220px; border: 1px solid #009EE3;">
        </li>
"""
    if "buscadorProductos" not in content:
        content = re.sub(r'(<ul class="navbar-nav mx-auto gap-lg-1">.*?)(</ul>)', r'\1' + search_input + r'\2', content, flags=re.DOTALL)

    # Inject search JS right before </body>
    search_js = """
<script>
  document.addEventListener('DOMContentLoaded', function() {
    const buscador = document.getElementById('buscadorProductos');
    if(buscador) {
      buscador.addEventListener('keyup', function(e) {
        const text = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.tg-product-card');
        cards.forEach(card => {
          const titleEl = card.querySelector('.tg-product-name');
          if(titleEl) {
            const title = titleEl.textContent.toLowerCase();
            const colParent = card.closest('.col-md-6, .col-lg-4, .col-6, .col-12, .col-md-3, .col-lg-3');
            if(title.includes(text)) {
              if(colParent) colParent.style.display = '';
              else card.style.display = '';
            } else {
              if(colParent) colParent.style.display = 'none';
              else card.style.display = 'none';
            }
          }
        });
      });
    }
  });
</script>
"""
    if "buscadorProductos" in content and "buscador.addEventListener('keyup'" not in content:
         content = content.replace("</body>", f"{search_js}\n</body>")
         
    new_price_logic = """
                {% if p.precio_anterior and p.precio_anterior > p.precio %}
                  <div class="d-flex flex-column">
                    <span class="text-decoration-line-through text-muted" style="font-size:0.85rem">${{ p.precio_anterior }}</span>
                    <div class="d-flex align-items-center gap-2">
                      <span class="tg-price text-success">${{ p.precio }}</span>
                      <span class="badge bg-success" style="font-size:0.7rem;">{{ ((p.precio_anterior - p.precio) / p.precio_anterior * 100)|round|int }}% OFF</span>
                    </div>
                  </div>
                {% else %}
                  <span class="tg-price">${{ p.precio }}</span>
                {% endif %}
"""
    content = content.replace('<span class="tg-price">${{ p.precio }}</span>', new_price_logic)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
print("Done modifying python files.")
