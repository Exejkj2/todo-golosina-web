import sqlite3
import os

def actualizar_base():
    db_path = 'tienda.db'
    if not os.path.exists(db_path):
        print(f"Error: No se encontró el archivo de base de datos '{db_path}' en la raíz del proyecto.")
        return

    print(f"Conectando a la base de datos local '{db_path}'...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Definir las alteraciones a realizar en cada tabla
    # Intentamos alterar las tablas usando variaciones con y sin comillas dobles
    # para asegurar compatibilidad total con SQLite y SQLAlchemy
    migraciones = [
        # Tabla Productos (con sus variantes de escape para SQLite)
        ('"""Productos"""', 'sincronizado', 'BOOLEAN DEFAULT 1'),
        ('"""Productos"""', 'ultima_actualizacion', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        ('"Productos"', 'sincronizado', 'BOOLEAN DEFAULT 1'),
        ('"Productos"', 'ultima_actualizacion', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        ('Productos', 'sincronizado', 'BOOLEAN DEFAULT 1'),
        ('Productos', 'ultima_actualizacion', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        
        # Tabla Ventas
        ('ventas', 'sincronizado', 'BOOLEAN DEFAULT 1'),
        ('ventas', 'ultima_actualizacion', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        ('ventas', 'enviado_afip', 'BOOLEAN DEFAULT 0'),
        ('"ventas"', 'sincronizado', 'BOOLEAN DEFAULT 1'),
        ('"ventas"', 'ultima_actualizacion', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        ('"ventas"', 'enviado_afip', 'BOOLEAN DEFAULT 0'),
    ]

    for tabla, columna, tipo in migraciones:
        try:
            sql = f'ALTER TABLE {tabla} ADD COLUMN {columna} {tipo};'
            cursor.execute(sql)
            conn.commit()
            print(f"[ÉXITO] Columna '{columna}' agregada a la tabla {tabla}.")
        except sqlite3.OperationalError as e:
            err_msg = str(e)
            if "duplicate column name" in err_msg or "already exists" in err_msg:
                print(f"[OMITIDO] La columna '{columna}' ya existe en la tabla {tabla}.")
            elif "non-constant default" in err_msg:
                # Si falla por default no constante, intentamos agregarla sin el default
                try:
                    tipo_limpio = tipo.split('DEFAULT')[0].strip()
                    sql_fallback = f'ALTER TABLE {tabla} ADD COLUMN {columna} {tipo_limpio};'
                    cursor.execute(sql_fallback)
                    conn.commit()
                    print(f"[ÉXITO - FALLBACK] Columna '{columna}' agregada a la tabla {tabla} (sin valor por defecto).")
                except sqlite3.OperationalError as e_fallback:
                    err_fallback = str(e_fallback)
                    if "duplicate column name" in err_fallback or "already exists" in err_fallback:
                        print(f"[OMITIDO] La columna '{columna}' ya existe en la tabla {tabla}.")
                    else:
                        print(f"[ERROR - FALLBACK] No se pudo alterar {tabla} para '{columna}': {err_fallback}")
            elif "no such table" in err_msg:
                # Es normal que falle si intentamos variaciones que no coinciden exactamente
                pass
            else:
                print(f"[INFO] No se pudo alterar {tabla} para la columna '{columna}': {err_msg}")
        except Exception as e:
            print(f"[ERROR] Error inesperado en {tabla}.{columna}: {e}")

    # Mostrar la estructura final de las tablas clave para verificar los cambios
    print("\nVerificando estructura final de las tablas:")
    tablas_a_verificar = [
        ('Productos', '"""Productos"""'),
        ('ventas', 'ventas')
    ]
    for label, query_name in tablas_a_verificar:
        try:
            cursor.execute(f"PRAGMA table_info({query_name});")
            columnas = [row[1] for row in cursor.fetchall()]
            if columnas:
                print(f" - Tabla '{label}': {', '.join(columnas)}")
            else:
                print(f" - Tabla '{label}' ({query_name}) no tiene columnas o no existe.")
        except Exception as e:
            print(f" - No se pudo verificar la tabla {label}: {e}")

    conn.close()
    print("\n¡Base de datos local actualizada con éxito!")

if __name__ == '__main__':
    actualizar_base()
