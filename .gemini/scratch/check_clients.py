
from app import db, Cliente, app
with app.app_context():
    count = Cliente.query.count()
    print(f"CLIENT_COUNT:{count}")
    # Also print the first one if exists
    c = Cliente.query.first()
    if c:
        print(f"FIRST_CLIENT:{c.to_dict()}")
