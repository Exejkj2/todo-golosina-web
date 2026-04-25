import os
import sqlalchemy
from sqlalchemy import create_all, text

def migrate():
    uri = os.environ.get('DATABASE_URL')
    if not uri:
        print("Error: DATABASE_URL no encontrada.")
        return

    if uri.startswith('postgres://'):
        uri = uri.replace('postgres://', 'postgresql://', 1)

    engine = sqlalchemy.create_engine(uri)
    
    with engine.connect() as conn:
        print("Ejecutando migración de columna imagen_url...")
        # Usamos comillas dobles para el nombre de la tabla porque tiene mayúsculas
        conn.execute(text('ALTER TABLE "Productos" ALTER COLUMN imagen_url TYPE TEXT;'))
        conn.commit()
        print("¡Migración completada con éxito!")

if __name__ == "__main__":
    migrate()
