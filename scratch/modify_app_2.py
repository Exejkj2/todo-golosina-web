import re

with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # We want to remove assignments of the form:
    # p_local.precio_anterior = p_nube.precio_anterior
    # p_nube.precio_anterior = p_local.precio_anterior
    # producto.precio_anterior = ...
    # precio_anterior=...
    # (same for others)
    
    if re.search(r'\.(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)\b\s*=', line):
        continue
    
    if re.search(r'\b(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)=', line):
        # We need to be careful with things like: precio_anterior=precio_anterior_historico
        # Wait, if we just remove the `kwarg=value,` from the string:
        line = re.sub(r'\b(precio_anterior|imagen|imagen_url|favorito|descuento_volumen_activo|cantidad_minima_descuento|porcentaje_descuento_volumen)=[^,]+,?\s*', '', line)

    new_lines.append(line)

with open('app.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Modifications done.")
