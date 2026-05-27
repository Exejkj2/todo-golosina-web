
      // Script para previsualizar imagen en Agregar
      const addUrlInput = document.getElementById("addImgUrl");
      const addImgPreview = document.getElementById("addImgPreview");
      addUrlInput.addEventListener("input", function () {
        if (this.value) {
          addImgPreview.src = this.value;
          addImgPreview.style.display = "inline-block";
        } else {
          addImgPreview.style.display = "none";
        }
      });

      // Script para previsualizar imágenes en Editar
      document.querySelectorAll(".edit-img-input").forEach((input) => {
        input.addEventListener("input", function () {
          const imgContainer = this.nextElementSibling;
          const img = imgContainer.querySelector("img");
          if (this.value) {
            img.src = this.value;
            img.style.display = "inline-block";
          } else {
            img.style.display = "none";
          }
        });
      });

      // ─── UX: mostrar/ocultar campos de descuento por volumen ───
      function toggleDescuentoFields(containerId, checkbox) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.style.display = checkbox.checked ? 'block' : 'none';
      }

      /**
       * Formatea un string a Title Case (Primera letra de cada palabra en Mayúscula)
       */
      function toTitleCase(str) {
        if (!str) return "";
        return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      }

      // Aplicar Capitalize a los nombres de productos antes de enviar
      document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function() {
          const nombreInput = this.querySelector('input[name="nombre"]');
          if (nombreInput) {
            nombreInput.value = toTitleCase(nombreInput.value.trim());
          }
        });
      });

      // --- Atajo de teclado F4 para Nuevo Producto ---
      document.addEventListener('keydown', function(e) {
        if (e.key === 'F4') {
          e.preventDefault();
          // Intentamos clickear el botón para aprovechar el data-bs-toggle si ya está inicializado, 
          // o usamos la API de Bootstrap.
          const btn = document.getElementById('btnNuevoProducto');
          if (btn) btn.click();
        }
      });

      // --- Auto-focus Inteligente (UX) ---
      const addModalEl = document.getElementById('addModal');
      if (addModalEl) {
        addModalEl.addEventListener('shown.bs.modal', function () {
          // El usuario prefiere el foco en el Nombre
          const nameInput = document.getElementById('add_nombre');
          if (nameInput) {
            nameInput.focus();
          }
        });
      }

      // --- Manejo de Envío de Formulario con AJAX (Senior UX) ---
      const addForm = document.querySelector('#addModal form');
      if (addForm) {
        addForm.addEventListener('submit', async function(e) {
          e.preventDefault();
          
          // Primero aplicamos el Capitalize que ya estaba
          const nombreInput = this.querySelector('input[name="nombre"]');
          if (nombreInput) {
            nombreInput.value = toTitleCase(nombreInput.value.trim());
          }

          const formData = new FormData(this);
          const errorContainer = document.getElementById('error-container-add');
          const errorAlert = errorContainer.querySelector('.alert');

          try {
            const response = await fetch(this.action, {
              method: 'POST',
              body: formData,
              headers: {
                'X-Requested-With': 'XMLHttpRequest'
              }
            });

            if (response.ok) {
              // Si todo bien, recargamos para ver el nuevo producto
              window.location.reload();
            } else {
              const data = await response.json();
              if (data.error) {
                errorAlert.textContent = data.error;
                errorContainer.style.display = 'block';
                // Scroll al error si es necesario
                errorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          } catch (err) {
            console.error('Error al guardar producto:', err);
            errorAlert.textContent = 'Ocurrió un error inesperado al guardar el producto.';
            errorContainer.style.display = 'block';
          }
        });
      }

      // Limpiar errores cuando se cierra o abre el modal
      if (addModalEl) {
        addModalEl.addEventListener('hidden.bs.modal', function() {
          const errorContainer = document.getElementById('error-container-add');
          if (errorContainer) errorContainer.style.display = 'none';
        });
      }

      // --- Manejo de Envío de Formulario de EDICIÓN con AJAX ---
      document.querySelectorAll('form[action*="/admin/producto/edit/"]').forEach(editForm => {
        editForm.addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const nombreInput = this.querySelector('input[name="nombre"]');
          if (nombreInput) {
            nombreInput.value = toTitleCase(nombreInput.value.trim());
          }

          const formData = new FormData(this);
          const modal = this.closest('.modal');
          const productId = modal.id.replace('editModal', '');
          const errorContainer = document.getElementById('error-container-edit-' + productId);
          const errorAlert = errorContainer ? errorContainer.querySelector('.alert') : null;

          try {
            const response = await fetch(this.action, {
              method: 'POST',
              body: formData,
              headers: {
                'X-Requested-With': 'XMLHttpRequest'
              }
            });

            if (response.ok) {
              window.location.reload();
            } else {
              const data = await response.json();
              if (data.error && errorAlert) {
                errorAlert.textContent = data.error;
                errorContainer.style.display = 'block';
                errorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          } catch (err) {
            console.error('Error al editar producto:', err);
            if (errorAlert) {
              errorAlert.textContent = 'Ocurrió un error inesperado al editar.';
              errorContainer.style.display = 'block';
            }
          }
        });
      });

      // Limpiar errores en modales de edición al cerrarse
      document.querySelectorAll('.modal[id^="editModal"]').forEach(m => {
        m.addEventListener('hidden.bs.modal', function() {
          const productId = this.id.replace('editModal', '');
          const errorContainer = document.getElementById('error-container-edit-' + productId);
          if (errorContainer) errorContainer.style.display = 'none';
        });
      });
      // --- Lógica de Tags para Códigos de Barras (Scanner UX) ---
      function setupBarcodeManager(inputId, hiddenId, containerId) {
        const inputEl = document.getElementById(inputId);
        const hiddenEl = document.getElementById(hiddenId);
        const containerEl = document.getElementById(containerId);
        
        if (!inputEl || !hiddenEl || !containerEl) return;

        let codigosArray = hiddenEl.value ? hiddenEl.value.split(',').filter(c => c.trim()) : [];

        function renderizarCodigos() {
          containerEl.innerHTML = '';
          codigosArray.forEach((codigo, index) => {
            const badge = document.createElement('span');
            badge.className = 'badge bg-primary d-flex align-items-center gap-2 px-3 py-2 rounded-pill';
            badge.style.fontSize = '0.85rem';
            badge.innerHTML = `
              ${codigo}
              <i class="bi bi-x-circle-fill cursor-pointer" style="cursor:pointer;" onclick="window.removeBarcode('${hiddenId}', ${index})"></i>
            `;
            containerEl.appendChild(badge);
          });
          hiddenEl.value = codigosArray.join(',');
        }

        // Exponer la función de remoción globalmente para que el onclick funcione
        window.removeBarcode = function(hId, idx) {
          // Buscamos el hidden correspondiente y actualizamos su array
          const hEl = document.getElementById(hId);
          if (!hEl) return;
          let arr = hEl.value.split(',').filter(c => c.trim());
          arr.splice(idx, 1);
          hEl.value = arr.join(',');
          // Re-renderizamos usando el contenedor correspondiente
          const cId = hId.includes('edit') ? hId.replace('hidden', 'input').replace('edit_codigo_barra_input_', 'edit_contenedor_codigos_') : 'add_contenedor_codigos';
          // Como necesitamos una forma de volver a llamar renderizarCodigos, 
          // simplificamos re-inicializando o disparando un evento.
          // Por simplicidad en este entorno, llamamos a una versión que busque el contenedor.
          const currentContainer = hId.includes('edit') 
            ? document.getElementById('edit_contenedor_codigos_' + hId.split('_').pop())
            : document.getElementById('add_contenedor_codigos');
          
          if (currentContainer) {
            currentContainer.innerHTML = '';
            arr.forEach((c, i) => {
              const b = document.createElement('span');
              b.className = 'badge bg-primary d-flex align-items-center gap-2 px-3 py-2 rounded-pill';
              b.style.fontSize = '0.85rem';
              b.innerHTML = `${c} <i class="bi bi-x-circle-fill cursor-pointer" style="cursor:pointer;" onclick="window.removeBarcode('${hId}', ${i})"></i>`;
              currentContainer.appendChild(b);
            });
          }
        };

        inputEl.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault(); // BLOQUEO CRÍTICO: Evitar envío de formulario
            
            const val = this.value.trim();
            if (val && !codigosArray.includes(val) && codigosArray.length < 10) {
              codigosArray.push(val);
              this.value = '';
              renderizarCodigos();
            } else if (val) {
              this.value = ''; // Limpiar si ya existe o límite alcanzado
            }
          }
        });

        // Inicializar vista
        renderizarCodigos();
      }

      // Inicializar para el modal de Alta
      const addModal = document.getElementById('addModal');
      if (addModal) {
        addModal.addEventListener('shown.bs.modal', function() {
          setupBarcodeManager('add_codigo_barra_input', 'add_codigo_barra_hidden', 'add_contenedor_codigos');
          // UX: El usuario prefiere tipear primero el nombre antes de escanear
          const nameInput = document.getElementById('add_nombre');
          if (nameInput) nameInput.focus();
        });
      }

      // Inicializar para todos los modales de Edición (cuando se abren)
      document.querySelectorAll('.modal[id^="editModal"]').forEach(modal => {
        modal.addEventListener('shown.bs.modal', function() {
          const productId = this.id.replace('editModal', '');
      // --- Manejo de Envío de Formulario con AJAX (Senior UX) ---
      const addForm = document.querySelector('#addModal form');
      if (addForm) {
        addForm.addEventListener('submit', async function(e) {
          e.preventDefault();
          
          // Primero aplicamos el Capitalize que ya estaba
          const nombreInput = this.querySelector('input[name="nombre"]');
          if (nombreInput) {
            nombreInput.value = toTitleCase(nombreInput.value.trim());
          }

          const formData = new FormData(this);
          const errorContainer = document.getElementById('error-container-add');
          const errorAlert = errorContainer.querySelector('.alert');

          try {
            const response = await fetch(this.action, {
              method: 'POST',
              body: formData,
              headers: {
                'X-Requested-With': 'XMLHttpRequest'
              }
            });

            if (response.ok) {
              // Si todo bien, recargamos para ver el nuevo producto
              window.location.reload();
            } else {
              const data = await response.json();
              if (data.error) {
                errorAlert.textContent = data.error;
                errorContainer.style.display = 'block';
                // Scroll al error si es necesario
                errorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          } catch (err) {
            console.error('Error al guardar producto:', err);
            errorAlert.textContent = 'Ocurrió un error inesperado al guardar el producto.';
            errorContainer.style.display = 'block';
          }
        });
      }

      // Limpiar errores cuando se cierra o abre el modal
      if (addModalEl) {
        addModalEl.addEventListener('hidden.bs.modal', function() {
          const errorContainer = document.getElementById('error-container-add');
          if (errorContainer) errorContainer.style.display = 'none';
        });
      }

      // --- Manejo de Envío de Formulario de EDICIÓN con AJAX ---
      document.querySelectorAll('form[action*="/admin/producto/edit/"]').forEach(editForm => {
        editForm.addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const nombreInput = this.querySelector('input[name="nombre"]');
          if (nombreInput) {
            nombreInput.value = toTitleCase(nombreInput.value.trim());
          }

          const formData = new FormData(this);
          const modal = this.closest('.modal');
          const productId = modal.id.replace('editModal', '');
          const errorContainer = document.getElementById('error-container-edit-' + productId);
          const errorAlert = errorContainer ? errorContainer.querySelector('.alert') : null;

          try {
            const response = await fetch(this.action, {
              method: 'POST',
              body: formData,
              headers: {
                'X-Requested-With': 'XMLHttpRequest'
              }
            });

            if (response.ok) {
              window.location.reload();
            } else {
              const data = await response.json();
              if (data.error && errorAlert) {
                errorAlert.textContent = data.error;
                errorContainer.style.display = 'block';
                errorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          } catch (err) {
            console.error('Error al editar producto:', err);
            if (errorAlert) {
              errorAlert.textContent = 'Ocurrió un error inesperado al editar.';
              errorContainer.style.display = 'block';
            }
          }
        });
      });

      // Limpiar errores en modales de edición al cerrarse
      document.querySelectorAll('.modal[id^="editModal"]').forEach(m => {
        m.addEventListener('hidden.bs.modal', function() {
          const productId = this.id.replace('editModal', '');
          const errorContainer = document.getElementById('error-container-edit-' + productId);
          if (errorContainer) errorContainer.style.display = 'none';
        });
      });
      // --- Lógica de Tags para Códigos de Barras (Scanner UX) ---
      function setupBarcodeManager(inputId, hiddenId, containerId) {
        const inputEl = document.getElementById(inputId);
        const hiddenEl = document.getElementById(hiddenId);
        const containerEl = document.getElementById(containerId);
        
        if (!inputEl || !hiddenEl || !containerEl) return;

        let codigosArray = hiddenEl.value ? hiddenEl.value.split(',').filter(c => c.trim()) : [];

        function renderizarCodigos() {
          containerEl.innerHTML = '';
          codigosArray.forEach((codigo, index) => {
            const badge = document.createElement('span');
            badge.className = 'badge bg-primary d-flex align-items-center gap-2 px-3 py-2 rounded-pill';
            badge.style.fontSize = '0.85rem';
            badge.innerHTML = `
              ${codigo}
              <i class="bi bi-x-circle-fill cursor-pointer" style="cursor:pointer;" onclick="window.removeBarcode('${hiddenId}', ${index})"></i>
            `;
            containerEl.appendChild(badge);
          });
          hiddenEl.value = codigosArray.join(',');
        }

        // Exponer la función de remoción globalmente para que el onclick funcione
        window.removeBarcode = function(hId, idx) {
          // Buscamos el hidden correspondiente y actualizamos su array
          const hEl = document.getElementById(hId);
          if (!hEl) return;
          let arr = hEl.value.split(',').filter(c => c.trim());
          arr.splice(idx, 1);
          hEl.value = arr.join(',');
          // Re-renderizamos usando el contenedor correspondiente
          const cId = hId.includes('edit') ? hId.replace('hidden', 'input').replace('edit_codigo_barra_input_', 'edit_contenedor_codigos_') : 'add_contenedor_codigos';
          // Como necesitamos una forma de volver a llamar renderizarCodigos, 
          // simplificamos re-inicializando o disparando un evento.
          // Por simplicidad en este entorno, llamamos a una versión que busque el contenedor.
          const currentContainer = hId.includes('edit') 
            ? document.getElementById('edit_contenedor_codigos_' + hId.split('_').pop())
            : document.getElementById('add_contenedor_codigos');
          
          if (currentContainer) {
            currentContainer.innerHTML = '';
            arr.forEach((c, i) => {
              const b = document.createElement('span');
              b.className = 'badge bg-primary d-flex align-items-center gap-2 px-3 py-2 rounded-pill';
              b.style.fontSize = '0.85rem';
              b.innerHTML = `${c} <i class="bi bi-x-circle-fill cursor-pointer" style="cursor:pointer;" onclick="window.removeBarcode('${hId}', ${i})"></i>`;
              currentContainer.appendChild(b);
            });
          }
        };

        inputEl.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault(); // BLOQUEO CRÍTICO: Evitar envío de formulario
            
            const val = this.value.trim();
            if (val && !codigosArray.includes(val) && codigosArray.length < 10) {
              codigosArray.push(val);
              this.value = '';
              renderizarCodigos();
            } else if (val) {
              this.value = ''; // Limpiar si ya existe o límite alcanzado
            }
          }
        });

        // Inicializar vista
        renderizarCodigos();
      }

      // Inicializar para el modal de Alta
      const addModal = document.getElementById('addModal');
      if (addModal) {
        addModal.addEventListener('shown.bs.modal', function() {
          setupBarcodeManager('add_codigo_barra_input', 'add_codigo_barra_hidden', 'add_contenedor_codigos');
          // UX: El usuario prefiere tipear primero el nombre antes de escanear
          const nameInput = document.getElementById('add_nombre');
          if (nameInput) nameInput.focus();
        });
      }

      // Inicializar para todos los modales de Edición (cuando se abren)
      document.querySelectorAll('.modal[id^="editModal"]').forEach(modal => {
        modal.addEventListener('shown.bs.modal', function() {
          const productId = this.id.replace('editModal', '');
          setupBarcodeManager(
            `edit_codigo_barra_input_${productId}`,
            `edit_codigo_barra_hidden_${productId}`,
            `edit_contenedor_codigos_${productId}`
          );
          document.getElementById(`edit_codigo_barra_input_${productId}`).focus();
        });
      });

      // Bloqueo Global de Enter en formularios (excepto el form de búsqueda)
      document.querySelectorAll('form').forEach(form => {
        // Excluir el formulario de búsqueda del admin para que Enter pueda enviar al backend
        if (form.id === 'form_busqueda_admin' || (form.querySelector('#buscador_admin'))) return;
        form.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            if (!e.target.classList.contains('barcode-tag-input')) {
              e.preventDefault();
            }
          }
        });
      });

      // --- Live Search + Navegación por Teclado + Búsqueda Backend ---
      let filasVisibles = [];
      let indiceSeleccionado = -1;

      function resaltarFilaSeleccionada() {
        document.querySelectorAll('#tabla_productos tbody tr').forEach(f => f.classList.remove('table-active'));
        if (indiceSeleccionado >= 0 && filasVisibles[indiceSeleccionado]) {
          const fila = filasVisibles[indiceSeleccionado];
          fila.classList.add('table-active');
          fila.scrollIntoView({ block: 'nearest' });
        }
      }

      const inputBuscador = document.getElementById('buscador_admin');
      if (inputBuscador) {
        // Filtrado visual instantáneo sobre las filas ya cargadas
        inputBuscador.addEventListener('input', function(e) {
          const termino = e.target.value.toLowerCase();
          const filas = document.querySelectorAll('#tabla_productos tbody tr');
          filas.forEach(fila => {
            fila.classList.remove('table-active');
            fila.style.display = fila.textContent.toLowerCase().includes(termino) ? '' : 'none';
          });
          indiceSeleccionado = -1;
          filasVisibles = Array.from(filas).filter(f => f.style.display === '');
        });

        // Navegación con flechas + Enter inteligente
        inputBuscador.addEventListener('keydown', function(e) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (indiceSeleccionado < filasVisibles.length - 1) {
              indiceSeleccionado++;
              resaltarFilaSeleccionada();
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (indiceSeleccionado > 0) {
              indiceSeleccionado--;
              resaltarFilaSeleccionada();
            }
          } else if (e.key === 'Enter') {
            // Prioridad 1: fila seleccionada con flechas → abrir modal
            if (indiceSeleccionado >= 0 && filasVisibles[indiceSeleccionado]) {
              e.preventDefault();
              const btn = filasVisibles[indiceSeleccionado].querySelector('button[data-bs-target^="#editModal"]');
              if (btn) btn.click();
            // Prioridad 2: exactamente 1 fila visible sin navegación → abrir modal
            } else if (filasVisibles.length === 1 && indiceSeleccionado < 0) {
              e.preventDefault();
              const btn = filasVisibles[0].querySelector('button[data-bs-target^="#editModal"]');
              if (btn) btn.click();
            }
            // Prioridad 3: sin coincidencia única → dejar que el form envíe GET /admin?q=...
          }
        });
        // No se bloquea el submit: botón "Buscar" y Enter (sin fila única seleccionada)
        // envían la petición GET al backend correctamente.
      }

      // --- Manejo de Importación Masiva con Reporte AJAX ---
      const formImportar = document.getElementById('formImportarExcel');
      if (formImportar) {
        formImportar.addEventListener('submit', async function(e) {
          e.preventDefault();
          const btn = this.querySelector('button[type="submit"]');
          const originalText = btn.innerHTML;
          btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';
          btn.disabled = true;
          try {
            const formData = new FormData(this);
            const response = await fetch(this.action, {
              method: 'POST',
              body: formData,
              headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const data = await response.json();
            if (response.ok) {
              alert(data.mensaje);
              window.location.reload();
            } else {
              alert('Error: ' + (data.error || 'Ocurrió un error en el servidor.'));
            }
          } catch (err) {
            console.error('Error en importación:', err);
            alert('Error crítico de conexión al procesar el archivo.');
          } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
          }
        });
      }
    