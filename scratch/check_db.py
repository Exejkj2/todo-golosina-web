
import sqlite3
import os

base_dir = os.path.abspath(os.path.dirname(__file__))
# Si se corre desde scratch/, retroceder un nivel
if base_dir.endswith('scratch'):
    base_dir = os.path.dirname(base_dir)

db_path = os.path.join(base_dir, 'database', 'tienda.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(clientes)")
    columns = cursor.fetchall()
    print("Columns in 'clientes' table:")
    for col in columns:
        print(col)
    conn.close()
