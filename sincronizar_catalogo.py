import csv
import sys
import os
from app import app, db, Producto, hora_argentina

def procesar_csv(ruta_csv):
    if not os.path.exists(ruta_csv):
        print(f"Error: No se encontró el archivo {ruta_csv}")
        return

    with app.app_context():
        print("Iniciando sincronización masiva...")
        
        # Obtenemos todos los productos actuales
        productos_actuales = Producto.query.all()
        productos_por_id = {str(p.id): p for p in productos_actuales}
        productos_por_codigo = {str(p.codigo_barra).strip(): p for p in productos_actuales if p.codigo_barra}
        
        ids_procesados = set()
        
        with open(ruta_csv, 'r', encoding='utf-8') as f:
            # Detectamos el delimitador
            muestra = f.read(1024)
            f.seek(0)
            delimitador = ';' if ';' in muestra else ','
            
            reader = csv.DictReader(f, delimiter=delimitador)
            
            # Normalizamos nombres de columnas para ser flexibles
            headers = [h.strip().lower() for h in reader.fieldnames or []]
            
            for i, row in enumerate(reader):
                # Extraemos datos básicos normalizando las claves
                row_norm = {k.strip().lower(): v for k, v in row.items() if k}
                
                # Buscar identificadores
                prod_id = str(row_norm.get('id', '')).strip()
                codigo_barra = str(row_norm.get('codigo_barra', row_norm.get('cod. barra', row_norm.get('codigo', '')))).strip()
                nombre = str(row_norm.get('nombre', row_norm.get('producto', row_norm.get('articulo', '')))).strip()
                
                if not nombre:
                    continue # Sin nombre no podemos insertar
                
                # Extraer precios
                try:
                    p1_str = str(row_norm.get('precio_lista_1', row_norm.get('lista 1', row_norm.get('precio', '0')))).replace('$', '').replace(',', '.').strip()
                    precio_1 = float(p1_str) if p1_str else 0.0
                except:
                    precio_1 = 0.0
                    
                # Extraer stock
                try:
                    stock_str = str(row_norm.get('stock', row_norm.get('cantidad', '0'))).strip()
                    stock = int(float(stock_str)) if stock_str else 0
                except:
                    stock = 0
                
                # Buscar si el producto existe
                producto = None
                if prod_id and prod_id in productos_por_id:
                    producto = productos_por_id[prod_id]
                elif codigo_barra and codigo_barra in productos_por_codigo:
                    producto = productos_por_codigo[codigo_barra]
                
                if producto:
                    # UPSERT: Actualizar existente
                    producto.nombre = nombre
                    producto.precio_lista_1 = precio_1
                    if codigo_barra:
                        producto.codigo_barra = codigo_barra
                    producto.stock = stock
                    producto.activo = 1
                    ids_procesados.add(producto.id)
                else:
                    # INSERT: Crear nuevo
                    nuevo = Producto(
                        nombre=nombre,
                        precio_lista_1=precio_1,
                        codigo_barra=codigo_barra,
                        stock=stock,
                        activo=1,
                        sincronizado=True,
                        ultima_actualizacion=hora_argentina()
                    )
                    db.session.add(nuevo)
                    db.session.flush() # Para obtener el ID
                    ids_procesados.add(nuevo.id)
                    
        # BORRADO LÓGICO para los que no estaban en el CSV
        desactivados = 0
        for p in productos_actuales:
            if p.id not in ids_procesados and p.activo:
                p.activo = 0
                p.ultima_actualizacion = hora_argentina()
                desactivados += 1
                
        db.session.commit()
        
        # Intentar actualizar la variable global si es posible (solo afectará este script si está en proceso separado)
        try:
            import requests
            # Hacemos una petición local al endpoint para avisarle al worker de Gunicorn/Waitress que actualice su variable
            requests.post('http://127.0.0.1:5000/api/catalogo/version/update', timeout=2)
        except:
            pass

        print(f"Sincronización completada con éxito.")
        print(f"Productos procesados/insertados: {len(ids_procesados)}")
        print(f"Productos desactivados (Borrado Lógico): {desactivados}")

if __name__ == '__main__':
    ruta = 'todo_golosinas_backup.csv'
    if len(sys.argv) > 1:
        ruta = sys.argv[1]
    procesar_csv(ruta)
