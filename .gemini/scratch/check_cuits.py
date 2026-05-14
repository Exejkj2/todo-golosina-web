
from app import db, Cliente, app
with app.app_context():
    clientes = Cliente.query.all()
    for c in clientes:
        print(f"NAME:{c.nombre}, CUIT:'{c.cuit}'")
