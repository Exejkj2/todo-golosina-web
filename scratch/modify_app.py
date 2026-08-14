import re

with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Remove from Producto model
    if re.search(r'\b(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)\s*=\s*db\.Column', line):
        continue
    if '─── Descuento por Volumen / Mayorista ───' in line:
        continue
        
    # Remove from to_dict methods
    if re.search(r"'(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)':", line):
        continue

    # Remove assignments in sync functions
    if re.search(r'\b(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)\s*=\s*p_(local|nube)\.', line):
        continue
    if re.search(r'p_(local|nube)\.(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)\s*=\s*p_', line):
        continue
        
    # Remove from admin_add_product & admin_edit_product
    if 'precio_ant_str =' in line or 'precio_anterior =' in line or 'producto.precio_anterior =' in line:
        continue
    if 'imagen_url =' in line or 'producto.imagen_url =' in line:
        continue
    if 'favorito =' in line or 'producto.favorito =' in line:
        continue
    if 'descuento_volumen_activo =' in line or 'producto.descuento_volumen_activo =' in line:
        continue
    if 'cant_min_str =' in line or 'cantidad_minima_descuento =' in line or 'producto.cantidad_minima_descuento =' in line:
        continue
    if 'porc_desc_str =' in line or 'porcentaje_descuento_volumen =' in line or 'producto.porcentaje_descuento_volumen =' in line:
        continue
    if 'precio_anterior_historico =' in line or 'precio_anterior=precio_anterior_historico' in line:
        continue
    
    # Clean up kwargs in constructors
    line = re.sub(r'precio_anterior=precio_anterior,\s*', '', line)
    line = re.sub(r'imagen_url=imagen_url,\s*', '', line)
    line = re.sub(r'favorito=favorito,\s*', '', line)
    line = re.sub(r'descuento_volumen_activo=descuento_volumen_activo,\s*', '', line)
    line = re.sub(r'cantidad_minima_descuento=cantidad_minima_descuento,\s*', '', line)
    line = re.sub(r'porcentaje_descuento_volumen=porcentaje_descuento_volumen(,\s*)?', '', line)
    line = re.sub(r'imagen=p_local\.imagen,\s*', '', line)
    line = re.sub(r'imagen_url=p_local\.imagen_url,\s*', '', line)
    line = re.sub(r'imagen=p_nube\.imagen,\s*', '', line)
    line = re.sub(r'imagen_url=p_nube\.imagen_url,\s*', '', line)
    
    # Exclude the bulk discount block in /api/cart logic
    if 'Aplicar descuento de volumen si califica' in line:
        skip = 5 # skip this and next 4 lines
        
    if skip > 0:
        skip -= 1
        continue
        
    # Other miscellaneous traces
    if "'Link Imagen': p.imagen_url or p.imagen" in line:
        continue
    if "precio_anterior_historico = producto.precio_lista_1" in line:
        continue
    if "if abs(producto.precio_lista_1 - precio_anterior_historico) > 0.001:" in line:
        continue
        
    # the rest of the historical price block logic:
    if "precio_anterior=precio_anterior_historico," in line:
        continue

    new_lines.append(line)

with open('app.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Modifications done.")
