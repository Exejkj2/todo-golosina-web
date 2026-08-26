from app import app, db
from sqlalchemy import text

def patch_database():
    with app.app_context():
        try:
            # En PostgreSQL, el booleano por defecto se declara con FALSE en lugar de 0
            sql = "ALTER TABLE ventas ADD COLUMN anulada BOOLEAN DEFAULT FALSE;"
            db.session.execute(text(sql))
            db.session.commit()
            print("✅ ÉXITO: La columna 'anulada' fue agregada correctamente a la tabla 'ventas'.")
        except Exception as e:
            db.session.rollback()
            # Si el error indica que la columna ya existe, está todo bien.
            if "already exists" in str(e).lower():
                print("⚠️ AVISO: La columna 'anulada' ya existe en la base de datos.")
            else:
                print(f"❌ ERROR al modificar la base de datos: {e}")

if __name__ == '__main__':
    patch_database()
