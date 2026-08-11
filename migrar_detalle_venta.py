from app import app, db, Venta, DetalleVenta, Producto
import json

def migrar_detalles_ventas():
    with app.app_context():
        # Obtener todas las ventas que ya existen
        ventas = Venta.query.all()
        print(f"Iniciando migración de {len(ventas)} ventas...")
        
        migradas = 0
        errores = 0
        
        for venta in ventas:
            # Si ya tiene detalles, puede que ya haya sido migrada parcialmente
            detalles_existentes = DetalleVenta.query.filter_by(venta_id=venta.id).count()
            if detalles_existentes > 0:
                continue
                
            try:
                if not venta.detalle_json:
                    continue
                    
                detalle = json.loads(venta.detalle_json)
                for item in detalle:
                    qty = item.get('qty') or item.get('cantidad') or 1
                    precio = item.get('precio_unit') or item.get('precio_unitario') or item.get('precio') or 0.0
                    nombre = item.get('nombre') or "Producto"
                    
                    # Intentar buscar el producto_id si coincide con el nombre (ya que el json viejo no guardaba ID siempre)
                    p = Producto.query.filter_by(nombre=nombre).first()
                    prod_id = p.id if p else None
                    
                    det = DetalleVenta(
                        venta_id=venta.id,
                        producto_id=prod_id,
                        nombre_producto=nombre,
                        cantidad=qty,
                        precio_unitario=precio,
                        subtotal=qty * precio
                    )
                    db.session.add(det)
                    
                migradas += 1
            except Exception as e:
                errores += 1
                print(f"Error procesando Venta ID {venta.id}: {e}")
                
        try:
            db.session.commit()
            print(f"Migración finalizada con éxito. Ventas migradas: {migradas}. Errores: {errores}.")
        except Exception as e:
            db.session.rollback()
            print(f"Error guardando los cambios en DB: {e}")

if __name__ == '__main__':
    migrar_detalles_ventas()
