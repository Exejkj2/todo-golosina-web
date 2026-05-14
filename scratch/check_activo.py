
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
    cursor.execute("SELECT id, nombre, activo FROM clientes")
    rows = cursor.fetchall()
    print("Clientes in DB:")
    for row in rows:
        print(row)
    conn.close()
