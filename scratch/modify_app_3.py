import re

with open('app.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Producto Model Columns
content = re.sub(r'    precio_anterior = db\.Column\(db\.Float, nullable=True\)\n', '', content)
content = re.sub(r"    imagen = db\.Column\(db\.String\(255\), default=''\)\n", '', content)
content = re.sub(r"    imagen_url = db\.Column\(db\.Text, default=''\)\n", '', content)
content = re.sub(r'    favorito = db\.Column\(db\.Boolean, default=False\)\n', '', content)
content = re.sub(r'    # ─── Descuento por Volumen / Mayorista ───\n', '', content)
content = re.sub(r'    descuento_volumen_activo = db\.Column\(db\.Boolean, default=False\)\n', '', content)
content = re.sub(r'    cantidad_minima_descuento = db\.Column\(db\.Integer, nullable=True\)\n', '', content)
content = re.sub(r'    porcentaje_descuento_volumen = db\.Column\(db\.Float, nullable=True\)\n', '', content)

# 2. to_dict method
content = re.sub(r"            'precio_anterior': self\.precio_anterior,\n", '', content)
content = re.sub(r"            'imagen': self\.imagen_url or self\.imagen,\n", '', content)
content = re.sub(r"            'imagen_url': self\.imagen_url,\n", '', content)
content = re.sub(r"            'favorito': self\.favorito,\n", '', content)
content = re.sub(r"            'descuento_volumen_activo': self\.descuento_volumen_activo,\n", '', content)
content = re.sub(r"            'cantidad_minima_descuento': self\.cantidad_minima_descuento,\n", '', content)
content = re.sub(r"            'porcentaje_descuento_volumen': self\.porcentaje_descuento_volumen,\n", '', content)

# 3. Synchronize block assignments
content = re.sub(r'                        precio_anterior=p_local\.precio_anterior,\n', '', content)
content = re.sub(r'                        imagen=p_local\.imagen,\n', '', content)
content = re.sub(r'                        imagen_url=p_local\.imagen_url,\n', '', content)
content = re.sub(r'                        favorito=p_local\.favorito,\n', '', content)
content = re.sub(r'                        descuento_volumen_activo=p_local\.descuento_volumen_activo,\n', '', content)
content = re.sub(r'                        cantidad_minima_descuento=p_local\.cantidad_minima_descuento,\n', '', content)
content = re.sub(r'                        porcentaje_descuento_volumen=p_local\.porcentaje_descuento_volumen,\n', '', content)

content = re.sub(r'                    p_nube\.precio_anterior = p_local\.precio_anterior\n', '', content)
content = re.sub(r'                    p_nube\.imagen = p_local\.imagen\n', '', content)
content = re.sub(r'                    p_nube\.imagen_url = p_local\.imagen_url\n', '', content)
content = re.sub(r'                    p_nube\.favorito = p_local\.favorito\n', '', content)
content = re.sub(r'                    p_nube\.descuento_volumen_activo = p_local\.descuento_volumen_activo\n', '', content)
content = re.sub(r'                    p_nube\.cantidad_minima_descuento = p_local\.cantidad_minima_descuento\n', '', content)
content = re.sub(r'                    p_nube\.porcentaje_descuento_volumen = p_local\.porcentaje_descuento_volumen\n', '', content)

content = re.sub(r'                        precio_anterior=p_nube\.precio_anterior,\n', '', content)
content = re.sub(r'                        imagen=p_nube\.imagen,\n', '', content)
content = re.sub(r'                        imagen_url=p_nube\.imagen_url,\n', '', content)
content = re.sub(r'                        favorito=p_nube\.favorito,\n', '', content)
content = re.sub(r'                        descuento_volumen_activo=p_nube\.descuento_volumen_activo,\n', '', content)
content = re.sub(r'                        cantidad_minima_descuento=p_nube\.cantidad_minima_descuento,\n', '', content)
content = re.sub(r'                        porcentaje_descuento_volumen=p_nube\.porcentaje_descuento_volumen,\n', '', content)

content = re.sub(r'                    p_local\.precio_anterior = p_nube\.precio_anterior\n', '', content)
content = re.sub(r'                    p_local\.imagen = p_nube\.imagen\n', '', content)
content = re.sub(r'                    p_local\.imagen_url = p_nube\.imagen_url\n', '', content)
content = re.sub(r'                    p_local\.favorito = p_nube\.favorito\n', '', content)
content = re.sub(r'                    p_local\.descuento_volumen_activo = p_nube\.descuento_volumen_activo\n', '', content)
content = re.sub(r'                    p_local\.cantidad_minima_descuento = p_nube\.cantidad_minima_descuento\n', '', content)
content = re.sub(r'                    p_local\.porcentaje_descuento_volumen = p_nube\.porcentaje_descuento_volumen\n', '', content)

# 4. admin_add_product
content = re.sub(r"    precio_ant_str = request\.form\.get\('precio_anterior', ''\)\.strip\(\)\.replace\(',', '\.'\)\n    try:\n        precio_anterior = float\(precio_ant_str\) if precio_ant_str else None\n    except ValueError:\n        precio_anterior = None\n\n", '', content)
content = re.sub(r"    imagen_url = request\.form\.get\('imagen_url', ''\)\n", '', content)
content = re.sub(r"    favorito = True if request\.form\.get\('favorito'\) else False\n", '', content)
content = re.sub(r"    # Descuento por volumen\n    descuento_volumen_activo = True if request\.form\.get\('descuento_volumen_activo'\) else False\n    cant_min_str = request\.form\.get\('cantidad_minima_descuento', ''\)\.strip\(\)\n    porc_desc_str = request\.form\.get\('porcentaje_descuento_volumen', ''\)\.strip\(\)\n    try:\n        cantidad_minima_descuento = int\(cant_min_str\) if cant_min_str else None\n    except ValueError:\n        cantidad_minima_descuento = None\n    try:\n        porcentaje_descuento_volumen = float\(porc_desc_str\) if porc_desc_str else None\n    except ValueError:\n        porcentaje_descuento_volumen = None\n", '', content)

content = re.sub(r'precio_anterior=precio_anterior, ', '', content)
content = re.sub(r'imagen_url=imagen_url, ', '', content)
content = re.sub(r'favorito=favorito, ', '', content)
content = re.sub(r'descuento_volumen_activo=descuento_volumen_activo,\n\s*cantidad_minima_descuento=cantidad_minima_descuento,\n\s*porcentaje_descuento_volumen=porcentaje_descuento_volumen,', '', content)
content = re.sub(r'descuento_volumen_activo=descuento_volumen_activo, ', '', content)
content = re.sub(r'cantidad_minima_descuento=cantidad_minima_descuento, ', '', content)
content = re.sub(r'porcentaje_descuento_volumen=porcentaje_descuento_volumen, ', '', content)

# 5. admin_edit_product
content = re.sub(r"    precio_ant_str = request\.form\.get\('precio_anterior', ''\)\.strip\(\)\.replace\(',', '\.'\)\n    try:\n        producto\.precio_anterior = float\(precio_ant_str\) if precio_ant_str else None\n    except ValueError:\n        producto\.precio_anterior = None\n", '', content)
content = re.sub(r"    producto\.imagen_url = request\.form\.get\('imagen_url', ''\)\n", '', content)
content = re.sub(r"    producto\.favorito = True if request\.form\.get\('favorito'\) else False\n", '', content)
content = re.sub(r"    producto\.descuento_volumen_activo = True if request\.form\.get\('descuento_volumen_activo'\) else False\n    cant_min_str = request\.form\.get\('cantidad_minima_descuento', ''\)\.strip\(\)\n    porc_desc_str = request\.form\.get\('porcentaje_descuento_volumen', ''\)\.strip\(\)\n    try:\n        producto\.cantidad_minima_descuento = int\(cant_min_str\) if cant_min_str else None\n    except ValueError:\n        producto\.cantidad_minima_descuento = None\n    try:\n        producto\.porcentaje_descuento_volumen = float\(porc_desc_str\) if porc_desc_str else None\n    except ValueError:\n        producto\.porcentaje_descuento_volumen = None\n", '', content)


with open('app.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Modifications done using regex blocks.")
