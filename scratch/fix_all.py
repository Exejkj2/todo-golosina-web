import sqlite3, os

db = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database', 'tienda.db')
conn = sqlite3.connect(db)
c = conn.cursor()

# 1. Borrar duplicados por CUIT (mantener el ID más bajo)
c.execute("""
    DELETE FROM clientes WHERE id NOT IN (
        SELECT MIN(id) FROM clientes 
        WHERE cuit IS NOT NULL AND cuit != ''
        GROUP BY cuit
    ) AND cuit IS NOT NULL AND cuit != ''
""")
print(f"Duplicados por CUIT borrados: {conn.total_changes}")

# 2. Borrar duplicados por nombre (sin CUIT)
c.execute("""
    DELETE FROM clientes WHERE id NOT IN (
        SELECT MIN(id) FROM clientes 
        WHERE (cuit IS NULL OR cuit = '')
        GROUP BY nombre
    ) AND (cuit IS NULL OR cuit = '')
""")
print(f"Duplicados por nombre borrados: {conn.total_changes}")

conn.commit()

# 3. Mostrar resultado final
c.execute("SELECT id, nombre, cuit, telefono, activo FROM clientes")
print("\nClientes finales:")
for r in c.fetchall():
    print(f"  {r}")

# 4. Intentar crear indice unico en cuit (si no existe)
try:
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_cuit_unique ON clientes(cuit) WHERE cuit IS NOT NULL AND cuit != ''")
    conn.commit()
    print("\nIndice UNIQUE en cuit creado OK")
except Exception as e:
    print(f"\nNo se pudo crear indice: {e}")

conn.close()
