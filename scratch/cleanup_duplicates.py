
import sqlite3
import os

base_dir = os.path.abspath(os.path.dirname(__file__))
if base_dir.endswith('scratch'):
    base_dir = os.path.dirname(base_dir)

db_path = os.path.join(base_dir, 'database', 'tienda.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Borrar duplicados manteniendo el ID más bajo para cada CUIT (si no es vacío)
    cursor.execute("""
        DELETE FROM clientes 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM clientes 
            WHERE cuit != '' AND cuit IS NOT NULL
            GROUP BY cuit
        ) 
        AND cuit != '' AND cuit IS NOT NULL
    """)
    print(f"Borrados {conn.total_changes} registros duplicados.")
    conn.commit()
    conn.close()
