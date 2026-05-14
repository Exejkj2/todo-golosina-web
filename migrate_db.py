import sqlite3
import os

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), 'database', 'tienda.db')
    print(f"Migrating {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # List tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"Existing tables: {tables}")
    
    # Ensure tables exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT
    )
    """)
    
    # Refresh tables list
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    
    # Check clientes table
    cursor.execute("PRAGMA table_info(clientes)")
    columns = [row[1] for row in cursor.fetchall()]
    
    required_clientes = [
        ('cuit', 'TEXT'),
        ('telefono', 'TEXT'),
        ('direccion', 'TEXT'),
        ('condicion_iva', 'TEXT'),
        ('descuento', 'REAL'),
        ('descuento_fijo', 'REAL')
    ]
    
    for col_name, col_type in required_clientes:
        if col_name not in columns:
            print(f"Adding column {col_name} to clientes...")
            try:
                cursor.execute(f"ALTER TABLE clientes ADD COLUMN {col_name} {col_type}")
            except Exception as e:
                print(f"Error adding {col_name}: {e}")

    # Check ventas table
    cursor.execute("PRAGMA table_info(ventas)")
    columns = [row[1] for row in cursor.fetchall()]
    
    required_ventas = [
        ('total', 'REAL'),
        ('detalle_json', 'TEXT'),
        ('lista_precios', 'INTEGER'),
        ('tipo', 'TEXT'),
        ('metodo_pago', 'TEXT'),
        ('cliente_id', 'INTEGER')
    ]
    
    for col_name, col_type in required_ventas:
        if col_name not in columns:
            print(f"Adding column {col_name} to ventas...")
            try:
                cursor.execute(f"ALTER TABLE ventas ADD COLUMN {col_name} {col_type}")
            except Exception as e:
                print(f"Error adding {col_name}: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == '__main__':
    migrate()
