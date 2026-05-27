import os 
from flask import Flask, jsonify, request, abort, render_template, redirect, url_for, flash, send_file, session, send_from_directory, make_response
import io
import traceback
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text, or_
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import pandas as pd
from fpdf import FPDF
from datetime import datetime, time, date, timedelta
import json
import socket
from urllib.parse import urlparse

# --- Configuración de Zona Horaria (Argentina UTC-3: Naive approach) ---
def hora_argentina():
    return datetime.utcnow() - timedelta(hours=3)

ultima_actualizacion_precios = hora_argentina()

# ─── Configuración ────────────────────────────────────────────
DB_PATH = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'tienda.db')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'todo_golosina_secreto_super_seguro'
app.config['TEMPLATES_AUTO_RELOAD'] = True

def es_accesible_bd_nube(uri_nube):
    if not uri_nube: return False
    
    # 1. Comprobación ultra-rápida de red física (sin DNS) a una IP fija (Cloudflare DNS)
    # Esto falla inmediatamente en microsegundos si el cable de red o Wi-Fi está apagado.
    try:
        socket.setdefaulttimeout(1.0)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("1.1.1.1", 53))
        s.close()
    except Exception:
        print("[DETECTADO] Red física desconectada. Evitando bloqueos de DNS.")
        return False

    # 2. Resolución de DNS en un hilo secundario con un timeout de 1.5 segundos
    # para evitar que el gethostbyname síncrono de Windows congele el servidor Flask.
    import threading
    url = urlparse(uri_nube)
    hostname = url.hostname
    port = url.port or 5432
    if not hostname: return False
    
    dns_res = [None]
    def lookup():
        try:
            dns_res[0] = socket.gethostbyname(hostname)
        except Exception:
            pass
            
    t = threading.Thread(target=lookup)
    t.daemon = True
    t.start()
    t.join(timeout=1.5)
    
    if not dns_res[0]:
        print(f"[CONEXION] No se pudo resolver el host de la nube: {hostname}")
        return False
        
    # 3. Comprobación rápida de conexión TCP al puerto
    try:
        socket.create_connection((dns_res[0], port), timeout=1.5)
        return True
    except Exception as e:
        print(f"[CONEXION] Falló conexión TCP al host {dns_res[0]}:{port}: {e}")
        return False

# ─── Configuración de Base de Datos con Detección de Entorno Automática ───
uri_nube = os.environ.get('DATABASE_URL')
if uri_nube and uri_nube.startswith('postgres://'):
    uri_nube = uri_nube.replace('postgres://', 'postgresql://', 1)

# Detectar si estamos en el entorno de Render (producción)
is_render_production = os.environ.get('RENDER') == 'true'

try:
    if is_render_production:
        if not uri_nube:
            raise Exception("DATABASE_URL no definida en entorno de Render.")
        app.config['SQLALCHEMY_DATABASE_URI'] = uri_nube
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": {
                "connect_timeout": 3  # Timeout estricto de conexión de 3 segundos para Postgres
            }
        }
        print("[BACKEND] -> Conectado a PostgreSQL en Render (Nube)")
    else:
        # Modo híbrido local: intentar conectar a base de datos de Render si está disponible de forma rápida
        if not uri_nube or urlparse(uri_nube).hostname in ['localhost', '127.0.0.1'] or not es_accesible_bd_nube(uri_nube):
            raise Exception("DATABASE_URL remota no accesible o no configurada para el entorno local.")
        
        app.config['SQLALCHEMY_DATABASE_URI'] = uri_nube
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": {
                "connect_timeout": 3  # Timeout estricto de conexión de 3 segundos para Postgres
            }
        }
        print("[BACKEND] -> Conectado a PostgreSQL en Render (Nube)")
except Exception as e:
    # Asegurar fallback absoluto a SQLite
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {
            "timeout": 15  # SQLite busy_timeout de 15 segundos
        }
    }
    print(f"[BACKEND] -> ¡SIN INTERNET! Operando local con tienda.db (Detalle: {e})")

CORS(app)
db = SQLAlchemy(app)

def es_offline():
    return 'sqlite' in app.config.get('SQLALCHEMY_DATABASE_URI', '')

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = "Por favor, inicia sesión para acceder al panel."

# ─── Modelos SQLAlchemy ───────────────────────────────────────
class Usuario(UserMixin, db.Model):
    __tablename__ = 'Usuarios'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    def __init__(self, **kwargs):
        super(Usuario, self).__init__(**kwargs)

class Categoria(db.Model):
    __tablename__ = 'categoria'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False)

    def __init__(self, **kwargs):
        super(Categoria, self).__init__(**kwargs)

class Producto(db.Model):
    __tablename__ = '"Productos"'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(150), nullable=False)
    descripcion = db.Column(db.Text)
    precio_lista_1 = db.Column(db.Float, nullable=False) # Lista 1
    precio_lista_2 = db.Column(db.Float, nullable=True, default=0.0) # Lista 2
    precio_lista_3 = db.Column(db.Float, nullable=True, default=0.0) # Lista 3
    precio_anterior = db.Column(db.Float, nullable=True)
    imagen = db.Column(db.String(255), default='')
    imagen_url = db.Column(db.Text, default='')
    categoria_id = db.Column(db.Integer, db.ForeignKey('categoria.id'))
    categoria_rel = db.relationship('Categoria', backref='productos')
    stock = db.Column(db.Integer, default=0)
    activo = db.Column(db.Integer, default=1)
    
    favorito = db.Column(db.Boolean, default=False)
    permitir_sin_stock = db.Column(db.Boolean, default=True)
    ventas_totales = db.Column(db.Integer, default=0)
    codigo_barra = db.Column(db.String(100), nullable=True)

    # ─── Descuento por Volumen / Mayorista ───
    descuento_volumen_activo = db.Column(db.Boolean, default=False)
    cantidad_minima_descuento = db.Column(db.Integer, nullable=True)
    porcentaje_descuento_volumen = db.Column(db.Float, nullable=True)

    sincronizado = db.Column(db.Boolean, default=True, nullable=False)
    ultima_actualizacion = db.Column(db.DateTime, default=hora_argentina, onupdate=hora_argentina)

    def __init__(self, **kwargs):
        super(Producto, self).__init__(**kwargs)

    @property
    def precio(self):
        return self.precio_lista_1

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'descripcion': self.descripcion,
            'precio': self.precio_lista_1,
            'precio_lista_1': self.precio_lista_1,
            'precio_lista_2': self.precio_lista_2 or self.precio_lista_1,
            'precio_lista_3': self.precio_lista_3 or self.precio_lista_1,
            'precio_anterior': self.precio_anterior,
            'imagen': self.imagen_url or self.imagen,
            'imagen_url': self.imagen_url,
            'categoria': self.categoria_rel.nombre if self.categoria_rel else 'General',
            'stock': self.stock,
            'activo': self.activo,
            'favorito': self.favorito,
            'permitir_sin_stock': self.permitir_sin_stock,
            'ventas_totales': self.ventas_totales,
            'codigo_barra': self.codigo_barra or '',
            'descuento_volumen_activo': self.descuento_volumen_activo,
            'cantidad_minima_descuento': self.cantidad_minima_descuento,
            'porcentaje_descuento_volumen': self.porcentaje_descuento_volumen,
            'sincronizado': self.sincronizado,
            'ultima_actualizacion': self.ultima_actualizacion.isoformat() if self.ultima_actualizacion else None
        }

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Usuario, int(user_id))

# ─── Modelos de Clientes y Ventas ───────────────────────────────────────
class Cliente(db.Model):
    __tablename__ = 'clientes'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(150), nullable=False)
    cuit = db.Column(db.String(20), nullable=True, default='', unique=True)
    condicion_iva = db.Column(db.String(50), nullable=True, default='Consumidor Final')
    telefono = db.Column(db.String(30), nullable=True, default='')
    direccion = db.Column(db.String(255), nullable=True, default='')
    descuento = db.Column(db.Float, default=0.0)
    descuento_fijo = db.Column(db.Float, default=0.0)
    saldo = db.Column(db.Float, default=0.0)
    limite_credito = db.Column(db.Float, default=0.0)
    activo = db.Column(db.Integer, default=1)
    ventas = db.relationship('Venta', backref='cliente', lazy=True)

    def __init__(self, **kwargs):
        super(Cliente, self).__init__(**kwargs)

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'cuit': self.cuit or '',
            'condicion_iva': self.condicion_iva or 'CF',
            'telefono': self.telefono or '',
            'direccion': self.direccion or '',
            'descuento_fijo': self.descuento_fijo or 0.0,
            'descuento': self.descuento or 0.0,
            'saldo': self.saldo or 0.0,
            'limite_credito': self.limite_credito or 0.0
        }

class Venta(db.Model):
    __tablename__ = 'ventas'
    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=True)
    fecha = db.Column(db.DateTime, default=hora_argentina)
    total = db.Column(db.Float, default=0.0)
    detalle_json = db.Column(db.Text, default='[]')
    lista_precios = db.Column(db.Integer, default=1)
    tipo = db.Column(db.String(50), default='local')
    metodo_pago = db.Column(db.String(100), nullable=True)
    pago_efectivo = db.Column(db.Float, default=0.0)
    pago_transferencia = db.Column(db.Float, default=0.0)
    pago_debito = db.Column(db.Float, default=0.0)
    pago_cc = db.Column(db.Float, default=0.0)
    entregado = db.Column(db.Float, default=0.0)
    sincronizado = db.Column(db.Boolean, default=True, nullable=False)
    ultima_actualizacion = db.Column(db.DateTime, default=hora_argentina, onupdate=hora_argentina)

    def __init__(self, **kwargs):
        super(Venta, self).__init__(**kwargs)

class Gasto(db.Model):
    __tablename__ = 'gastos'
    id = db.Column(db.Integer, primary_key=True)
    descripcion = db.Column(db.String(255), nullable=False)
    monto = db.Column(db.Float, nullable=False)
    fecha = db.Column(db.DateTime, default=hora_argentina)
    categoria = db.Column(db.String(100), default='General')
    tipo = db.Column(db.String(20), default='Egreso') # 'Egreso' o 'Ingreso'

    def __init__(self, **kwargs):
        super(Gasto, self).__init__(**kwargs)

    def to_dict(self):
        f = self.fecha
        if isinstance(f, str):
            try:
                from datetime import datetime
                f = datetime.fromisoformat(f.replace('Z', '+00:00'))
            except:
                pass
        
        return {
            'id': self.id,
            'descripcion': self.descripcion,
            'monto': self.monto,
            'fecha': f.strftime('%H:%M') if hasattr(f, 'strftime') else '--:--',
            'categoria': self.categoria,
            'tipo': self.tipo
        }

class CajaDiaria(db.Model):
    __tablename__ = 'cajas_diarias'
    id = db.Column(db.Integer, primary_key=True)
    fecha_apertura = db.Column(db.DateTime, default=hora_argentina)
    monto_inicial = db.Column(db.Float, nullable=False)
    monto_final = db.Column(db.Float, nullable=True)
    fecha_cierre = db.Column(db.DateTime, nullable=True)
    estado = db.Column(db.String(20), default='Abierta') # 'Abierta' o 'Cerrada'
    
    def to_dict(self):
        return {
            'id': self.id,
            'monto_inicial': self.monto_inicial,
            'monto_final': self.monto_final,
            'estado': self.estado,
            'fecha_apertura': self.fecha_apertura.strftime('%Y-%m-%d %H:%M') if self.fecha_apertura else '',
            'fecha_cierre': self.fecha_cierre.strftime('%Y-%m-%d %H:%M') if self.fecha_cierre else ''
        }

# ─── INICIALIZACIÓN CRÍTICA (Render/Gunicorn compatible) ──────
with app.app_context():
    db.create_all()
    # Migración PostgreSQL para Render: Agregar columna descuento si no existe
    try:
        db.session.execute(text('ALTER TABLE clientes ADD COLUMN descuento FLOAT DEFAULT 0;'))
        db.session.commit()
        print("Columna 'descuento' agregada con éxito a 'clientes'.")
    except Exception as e:
        db.session.rollback()
        print(f"Migración omitida (probablemente la columna ya existe): {e}")

    # Migración PostgreSQL para Render: Agregar columna tipo en ventas si no existe
    try:
        db.session.execute(text("ALTER TABLE ventas ADD COLUMN tipo VARCHAR(50) DEFAULT 'local';"))
        db.session.commit()
        print("Columna 'tipo' agregada con éxito a 'ventas'.")
    except Exception as e:
        db.session.rollback()
        print(f"Migración de ventas omitida (probablemente la columna ya existe): {e}")


    print("Base de datos y tablas inicializadas correctamente.")

# Rutina de migración automática
def migrate_db():
    with app.app_context():
        # Columnas para 'ventas'
        ventas_cols = {
            'metodo_pago': 'VARCHAR(100)',
            'pago_efectivo': 'FLOAT DEFAULT 0.0',
            'pago_transferencia': 'FLOAT DEFAULT 0.0',
            'pago_debito': 'FLOAT DEFAULT 0.0',
            'pago_cc': 'FLOAT DEFAULT 0.0',
            'entregado': 'FLOAT DEFAULT 0.0',
            'lista_precios': 'INTEGER DEFAULT 1',
            'tipo': 'VARCHAR(20) DEFAULT "Local"',
            'subtotal': 'FLOAT DEFAULT 0.0',
            'descuento': 'FLOAT DEFAULT 0.0'
        }
        
        # Intentar con y sin comillas para máxima compatibilidad
        for table in ['ventas', '"ventas"']:
            for col, type_ in ventas_cols.items():
                try:
                    db.session.execute(db.text(f"ALTER TABLE {table} ADD COLUMN {col} {type_}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()

        # Columnas para 'clientes'
        clientes_cols = {
            'cuit': 'VARCHAR(20)',
            'telefono': 'VARCHAR(50)',
            'direccion': 'VARCHAR(200)',
            'condicion_iva': 'VARCHAR(50) DEFAULT "Consumidor Final"',
            'descuento_fijo': 'FLOAT DEFAULT 0.0',
            'descuento': 'FLOAT DEFAULT 0.0',
            'limite_credito': 'FLOAT DEFAULT 0.0',
            'saldo': 'FLOAT DEFAULT 0.0'
        }
        for table in ['clientes', '"clientes"']:
            for col, type_ in clientes_cols.items():
                try:
                    db.session.execute(db.text(f"ALTER TABLE {table} ADD COLUMN {col} {type_}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()
        # Columnas para 'gastos'
        gastos_cols = {
            'tipo': 'VARCHAR(20) DEFAULT "Egreso"'
        }
        for table in ['gastos', '"gastos"']:
            for col, type_ in gastos_cols.items():
                try:
                    db.session.execute(db.text(f"ALTER TABLE {table} ADD COLUMN {col} {type_}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()

migrate_db()

@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# ─── API REST (Para el Frontend) ─────────────────────────────
@app.route('/api/estado_conexion', methods=['GET'])
def estado_conexion():
    return jsonify({"online": not es_offline()})

# ─── RUTA TEMPORAL DE MIGRACIÓN (Eliminar después de usar) ────
@app.route('/forzar-migracion-db')
def forzar_migracion_db():
    import psycopg2
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return "<h1>Error: DATABASE_URL no configurada en el entorno.</h1>", 500
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    conn = None
    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = True
        cursor = conn.cursor()
        cursor.execute('ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS sincronizado BOOLEAN DEFAULT TRUE;')
        cursor.execute('ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;')
        cursor.close()
        return "<h1>&#10004; ¡Base de datos inyectada con éxito! Ya puedes usar el panel.</h1><p>Columnas 'sincronizado' y 'ultima_actualizacion' verificadas/creadas en la tabla Productos.</p><p><b>IMPORTANTE:</b> Elimina esta ruta del código después de confirmar que todo funciona.</p>", 200
    except Exception as e:
        return f"<h1>Error al inyectar: {str(e)}</h1>", 500
    finally:
        if conn:
            conn.close()


@app.route('/api/productos', methods=['GET'])
def get_productos():
    if es_offline():
        print("[SERVIDO LOCAL] -> Ejecutando consulta en tienda.db offline (api/productos)")
    categoria_nombre = request.args.get('categoria', '').strip()
    buscar    = request.args.get('buscar', '').strip()
    orden     = request.args.get('orden', 'id')

    query = Producto.query.filter_by(activo=1)

    if categoria_nombre:
        cat = Categoria.query.filter_by(nombre=categoria_nombre).first()
        if cat:
            query = query.filter_by(categoria_id=cat.id)
        else:
            query = query.filter_by(id=0) # Fuerza vacío si no existe

    if buscar:
        query = query.filter(Producto.nombre.ilike(f'%{buscar}%') | Producto.descripcion.ilike(f'%{buscar}%'))

    if orden == 'precio_asc':
        query = query.order_by(Producto.precio_lista_1.asc())
    elif orden == 'ventas':
        query = query.order_by(Producto.ventas_totales.desc())
    else:
        query = query.order_by(Producto.id.desc())

    productos = query.all()
    return jsonify({"productos": [p.to_dict() for p in productos]})

@app.route('/buscar_productos')
def buscar_productos():
    if es_offline():
        print("[SERVIDO LOCAL] -> Ejecutando consulta en tienda.db offline (buscar_productos)")
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({"productos": []})
    
    # Búsqueda insensible a mayúsculas con ILIKE
    prods = Producto.query.filter(
        Producto.nombre.ilike(f'%{q}%'),
        Producto.activo == 1
    ).limit(30).all()
    
    return jsonify({
        "productos": [p.to_dict() for p in prods]
    })

@app.route('/buscar_por_codigo/<codigo>')
def buscar_por_codigo(codigo):
    if es_offline():
        print(f"[SERVIDO LOCAL] -> Buscando código '{codigo}' en tienda.db offline (buscar_por_codigo)")
    codigo = codigo.strip()
    
    # Búsqueda multi-variante (coma-separated barcodes)
    try:
        # Filtro rápido en BD para traer candidatos potenciales
        candidatos = Producto.query.filter(
            Producto.codigo_barra.ilike(f'%{codigo}%'),
            Producto.activo == 1
        ).all()
        
        producto_encontrado = None
        # Validación estricta en Python
        for p in candidatos:
            if not p.codigo_barra: continue
            lista_codigos = [c.strip() for c in p.codigo_barra.split(',') if c.strip()]
            if codigo in lista_codigos:
                producto_encontrado = p
                break
        
        p = producto_encontrado
    except Exception:
        p = None
        
    # Fallback: buscar por ID if el código es numérico
    if not p and codigo.isdigit():
        p = Producto.query.filter_by(id=int(codigo), activo=1).first()
        
    if p:
        return jsonify({"ok": True, "producto": p.to_dict()})
    else:
        return jsonify({"ok": False, "mensaje": "Producto no encontrado"}), 404

@app.route('/api/productos/<int:producto_id>', methods=['GET'])
def get_producto(producto_id):
    if es_offline():
        print(f"[SERVIDO LOCAL] -> Consultando producto ID {producto_id} en tienda.db offline (get_producto)")
    producto = Producto.query.filter_by(id=producto_id, activo=1).first()
    if not producto:
        abort(404, description="Producto no encontrado")
    return jsonify({"ok": True, "producto": producto.to_dict()})

@app.route('/api/categorias', methods=['GET'])
def get_categorias():
    categorias = db.session.query(Categoria.nombre, db.func.count(Producto.id))\
        .join(Producto, Producto.categoria_id == Categoria.id)\
        .filter(Producto.activo == 1)\
        .group_by(Categoria.nombre).all()
    return jsonify({
        "ok": True,
        "categorias": [{"categoria": c[0], "cantidad": c[1]} for c in categorias]
    })

@app.route('/api/registrar_venta', methods=['POST'])
def registrar_venta():
    import json as _json
    data = request.json
    if not data:
        return jsonify({"ok": False, "mensaje": "Datos inválidos"}), 400

    # Capturamos la decisión del usuario (por defecto False)
    facturar_afip = data.get('facturar_afip', False) if isinstance(data, dict) else False

    afip_ok = False
    mensaje_afip = ""

    if facturar_afip:
        try:
            # Simulación de llamada a AFIP (Aquí iría afip.py)
            # Si no hay internet, esto lanzará una excepción por timeout
            print("📡 Intentando conectar con servidores de AFIP...")
            # check_afip_status() ...
            afip_ok = True
        except Exception as e:
            print(f"⚠️ Error de conexión AFIP: {e}")
            afip_ok = False
            mensaje_afip = " (Modo Offline: Pendiente de CAE)"

    tipo_comprobante = "Factura C" if afip_ok else "Ticket No Fiscal"
    
    # Acepta dos formatos:
    # A) Lista directa (uso original del carrito público): [{id, qty}, ...]
    # B) Objeto con cliente: {cliente_id, items:[{id,qty,name,precio_unit}], total}
    if isinstance(data, list):
        items = data
        cliente_id = None
        total_venta = 0.0
        detalle = []
        lista_sel = 1
    else:
        items = data.get('items', [])
        cliente_id = data.get('cliente_id')
        total_venta = float(data.get('total', 0))
        detalle = data.get('detalle', [])
        lista_sel = data.get('lista_precios', 1)

    if not items or len(items) == 0:
        return jsonify({"ok": False, "mensaje": "No se puede registrar una venta sin productos."}), 400

    from datetime import timedelta
    tiempo_limite = hora_argentina() - timedelta(seconds=60)
    venta_fantasma = Venta.query.filter(
        Venta.total == total_venta,
        Venta.fecha >= tiempo_limite
    ).first()

    if venta_fantasma:
        print(f"✅ Eco masivo bloqueado (Patovica 60s): Venta de ${total_venta}")
        return jsonify({"ok": True, "mensaje": "Venta procesada (eco bloqueado)", "venta_id": venta_fantasma.id}), 200

    for item in items:
        producto_id = item.get('id')
        qty = item.get('qty', 0)
        if producto_id and qty > 0:
            producto = db.session.get(Producto, int(producto_id))
            if producto:
                producto.ventas_totales += qty
                if producto.stock >= qty:
                    producto.stock -= qty
                else:
                    producto.stock = 0

    venta_id = None
    if detalle or items:
        if not detalle:
            detalle = []
            for item in items:
                p = db.session.get(Producto, int(item.get('id', 0)))
                if p:
                    precio_u = p.precio_lista_3 if lista_sel == 3 else (p.precio_lista_2 if lista_sel == 2 else p.precio)
                    detalle.append({'nombre': p.nombre, 'qty': item.get('qty', 1), 'precio_unit': precio_u})
        
        # Soporte para medios de pago múltiples
        pagos = data.get('pagos', {})
        p_ef = float(pagos.get('efectivo', 0))
        p_tr = float(pagos.get('transferencia', 0))
        p_db = float(pagos.get('debito', 0))
        p_cc = float(pagos.get('cc', 0))

        # Fallback para modo simple (un solo método)
        if not pagos and data.get('metodo_pago'):
            m = data.get('metodo_pago')
            if m == 'Efectivo': p_ef = total_venta
            elif m in ['Mercado Pago', 'Transferencia']: p_tr = total_venta
            elif m == 'Débito': p_db = total_venta
            elif m == 'Cuenta Corriente': p_cc = total_venta

        if p_cc > 0 and cliente_id:
            cliente = db.session.get(Cliente, cliente_id)
            if cliente:
                if cliente.limite_credito > 0 and (cliente.saldo + p_cc) > cliente.limite_credito:
                    return jsonify({"ok": False, "mensaje": f"Límite de crédito excedido. Saldo: ${cliente.saldo:.2f}, Límite: ${cliente.limite_credito:.2f}"}), 403
                cliente.saldo += p_cc

        venta = Venta(
            cliente_id=cliente_id,
            total=total_venta,
            detalle_json=_json.dumps(detalle, ensure_ascii=False),
            lista_precios=lista_sel,
            tipo=data.get('tipo', 'Preventa'),
            metodo_pago=data.get('metodo_pago', 'Varios'),
            pago_efectivo=p_ef,
            pago_transferencia=p_tr,
            pago_debito=p_db,
            pago_cc=p_cc,
            fecha=hora_argentina(),
            sincronizado=not es_offline(),
            ultima_actualizacion=hora_argentina()
        )
        db.session.add(venta)
        db.session.commit()
        venta_id = venta.id
    else:
        db.session.commit()

    return jsonify({"ok": True, "mensaje": f"Venta registrada con éxito{mensaje_afip}", "venta_id": venta_id})

# ─── Rutas del Frontend (La Vidriera) ────────────────────────
# ─── Utilidades ────────────────────────────────────────────────────────
def to_title_case(text):
    if not text:
        return ""
    import re
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), text.lower())

@app.route('/api/sincronizar', methods=['POST', 'GET'])
def api_sincronizar():
    uri_nube = os.environ.get('DATABASE_URL')
    if not uri_nube:
        return jsonify({"ok": False, "mensaje": "DATABASE_URL no configurada en el servidor"}), 400
        
    clean_uri_nube = uri_nube
    if clean_uri_nube.startswith('postgres://'):
        clean_uri_nube = clean_uri_nube.replace('postgres://', 'postgresql://', 1)
        
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        
        # 1. Conectar a ambas bases de datos de forma explícita
        engine_local = create_engine(f'sqlite:///{DB_PATH}')
        SessionLocal = sessionmaker(bind=engine_local)
        session_local = SessionLocal()
        
        engine_nube = create_engine(clean_uri_nube, connect_args={'connect_timeout': 3})
        SessionNube = sessionmaker(bind=engine_nube)
        session_nube = SessionNube()
        
        # Verificar la conexión con Render
        session_nube.execute(text("SELECT 1"))
        
        # 2. Paso 1 (Subida): Productos modificados localmente a la nube
        productos_local_no_sinc = session_local.query(Producto).filter(
            (Producto.sincronizado == False) | (Producto.sincronizado == 0)
        ).all()
        
        for p_local in productos_local_no_sinc:
            p_nube = session_nube.query(Producto).filter(Producto.id == p_local.id).first()
            subir_cambio = True
            
            if p_nube:
                t_local = p_local.ultima_actualizacion.replace(tzinfo=None) if p_local.ultima_actualizacion else datetime.min
                t_nube = p_nube.ultima_actualizacion.replace(tzinfo=None) if p_nube.ultima_actualizacion else datetime.min
                
                if t_nube > t_local:
                    subir_cambio = False
                    print(f"[SYNC] Producto ID {p_local.id} '{p_local.nombre}' omitido para subir: Nube es más reciente.")
            
            if subir_cambio:
                if not p_nube:
                    p_nube = Producto(
                        id=p_local.id,
                        nombre=p_local.nombre,
                        descripcion=p_local.descripcion,
                        precio_lista_1=p_local.precio_lista_1,
                        precio_lista_2=p_local.precio_lista_2,
                        precio_lista_3=p_local.precio_lista_3,
                        precio_anterior=p_local.precio_anterior,
                        imagen=p_local.imagen,
                        imagen_url=p_local.imagen_url,
                        categoria_id=p_local.categoria_id,
                        stock=p_local.stock,
                        activo=p_local.activo,
                        favorito=p_local.favorito,
                        permitir_sin_stock=p_local.permitir_sin_stock,
                        ventas_totales=p_local.ventas_totales,
                        codigo_barra=p_local.codigo_barra,
                        descuento_volumen_activo=p_local.descuento_volumen_activo,
                        cantidad_minima_descuento=p_local.cantidad_minima_descuento,
                        porcentaje_descuento_volumen=p_local.porcentaje_descuento_volumen,
                        sincronizado=True,
                        ultima_actualizacion=p_local.ultima_actualizacion
                    )
                    session_nube.add(p_nube)
                else:
                    p_nube.nombre = p_local.nombre
                    p_nube.descripcion = p_local.descripcion
                    p_nube.precio_lista_1 = p_local.precio_lista_1
                    p_nube.precio_lista_2 = p_local.precio_lista_2
                    p_nube.precio_lista_3 = p_local.precio_lista_3
                    p_nube.precio_anterior = p_local.precio_anterior
                    p_nube.imagen = p_local.imagen
                    p_nube.imagen_url = p_local.imagen_url
                    p_nube.categoria_id = p_local.categoria_id
                    p_nube.stock = p_local.stock
                    p_nube.activo = p_local.activo
                    p_nube.favorito = p_local.favorito
                    p_nube.permitir_sin_stock = p_local.permitir_sin_stock
                    p_nube.ventas_totales = p_local.ventas_totales
                    p_nube.codigo_barra = p_local.codigo_barra
                    p_nube.descuento_volumen_activo = p_local.descuento_volumen_activo
                    p_nube.cantidad_minima_descuento = p_local.cantidad_minima_descuento
                    p_nube.porcentaje_descuento_volumen = p_local.porcentaje_descuento_volumen
                    p_nube.sincronizado = True
                    p_nube.ultima_actualizacion = p_local.ultima_actualizacion
            
            p_local.sincronizado = True
            
        session_nube.commit()
        session_local.commit()
        
        # Reiniciar secuencias de seriales de IDs en Postgres (Productos)
        try:
            session_nube.execute(text("SELECT setval(pg_get_serial_sequence('\"Productos\"', 'id'), COALESCE(MAX(id), 1)) FROM \"Productos\""))
            session_nube.commit()
        except Exception as seq_err:
            session_nube.rollback()
            print(f"[SYNC] No se pudo reiniciar secuencia de Productos: {seq_err}")
            
        # 3. Paso 1b (Subida): Ventas locales no sincronizadas a la nube
        ventas_local_no_sinc = session_local.query(Venta).filter(
            (Venta.sincronizado == False) | (Venta.sincronizado == 0)
        ).order_by(Venta.id.asc()).all()
        
        for v_local in ventas_local_no_sinc:
            v_nube = session_nube.query(Venta).filter(Venta.id == v_local.id).first()
            if not v_nube:
                v_nube = Venta(
                    id=v_local.id,
                    cliente_id=v_local.cliente_id,
                    fecha=v_local.fecha,
                    total=v_local.total,
                    detalle_json=v_local.detalle_json,
                    lista_precios=v_local.lista_precios,
                    tipo=v_local.tipo,
                    metodo_pago=v_local.metodo_pago,
                    pago_efectivo=v_local.pago_efectivo,
                    pago_transferencia=v_local.pago_transferencia,
                    pago_debito=v_local.pago_debito,
                    pago_cc=v_local.pago_cc,
                    entregado=v_local.entregado,
                    sincronizado=True,
                    ultima_actualizacion=v_local.ultima_actualizacion
                )
                session_nube.add(v_nube)
                
            v_local.sincronizado = True
            
        session_nube.commit()
        session_local.commit()
        
        # Reiniciar secuencias de seriales de IDs en Postgres (Ventas)
        try:
            session_nube.execute(text("SELECT setval(pg_get_serial_sequence('ventas', 'id'), COALESCE(MAX(id), 1)) FROM ventas"))
            session_nube.commit()
        except Exception as seq_err:
            session_nube.rollback()
            print(f"[SYNC] No se pudo reiniciar secuencia de Ventas: {seq_err}")
            
        # 4. Paso 2 (Bajada): Sincronizar categorías primero
        categorias_nube = session_nube.query(Categoria).all()
        for cat_nube in categorias_nube:
            cat_local = session_local.query(Categoria).filter(Categoria.id == cat_nube.id).first()
            if not cat_local:
                cat_local = Categoria(id=cat_nube.id, nombre=cat_nube.nombre)
                session_local.add(cat_local)
            else:
                cat_local.nombre = cat_nube.nombre
        session_local.commit()
        
        # Obtener el tiempo de la última sincronización local
        res = session_local.query(db.func.max(Producto.ultima_actualizacion)).filter(
            (Producto.sincronizado == True) | (Producto.sincronizado == 1)
        ).scalar()
        max_local_time = res if res else datetime.min
        
        # 5. Paso 2b (Bajada): Productos nuevos/actualizados en la nube a SQLite
        productos_nube_nuevos = session_nube.query(Producto).filter(
            Producto.ultima_actualizacion > max_local_time
        ).all()
        
        for p_nube in productos_nube_nuevos:
            p_local = session_local.query(Producto).filter(Producto.id == p_nube.id).first()
            t_nube = p_nube.ultima_actualizacion.replace(tzinfo=None) if p_nube.ultima_actualizacion else datetime.min
            actualizar_local = True
            
            if p_local:
                t_local = p_local.ultima_actualizacion.replace(tzinfo=None) if p_local.ultima_actualizacion else datetime.min
                if t_local > t_nube:
                    actualizar_local = False
                    print(f"[SYNC] Producto ID {p_nube.id} '{p_nube.nombre}' omitido para bajar: Local es más reciente.")
            
            if actualizar_local:
                if not p_local:
                    p_local = Producto(
                        id=p_nube.id,
                        nombre=p_nube.nombre,
                        descripcion=p_nube.descripcion,
                        precio_lista_1=p_nube.precio_lista_1,
                        precio_lista_2=p_nube.precio_lista_2,
                        precio_lista_3=p_nube.precio_lista_3,
                        precio_anterior=p_nube.precio_anterior,
                        imagen=p_nube.imagen,
                        imagen_url=p_nube.imagen_url,
                        categoria_id=p_nube.categoria_id,
                        stock=p_nube.stock,
                        activo=p_nube.activo,
                        favorito=p_nube.favorito,
                        permitir_sin_stock=p_nube.permitir_sin_stock,
                        ventas_totales=p_nube.ventas_totales,
                        codigo_barra=p_nube.codigo_barra,
                        descuento_volumen_activo=p_nube.descuento_volumen_activo,
                        cantidad_minima_descuento=p_nube.cantidad_minima_descuento,
                        porcentaje_descuento_volumen=p_nube.porcentaje_descuento_volumen,
                        sincronizado=True,
                        ultima_actualizacion=t_nube
                    )
                    session_local.add(p_local)
                else:
                    p_local.nombre = p_nube.nombre
                    p_local.descripcion = p_nube.descripcion
                    p_local.precio_lista_1 = p_nube.precio_lista_1
                    p_local.precio_lista_2 = p_nube.precio_lista_2
                    p_local.precio_lista_3 = p_nube.precio_lista_3
                    p_local.precio_anterior = p_nube.precio_anterior
                    p_local.imagen = p_nube.imagen
                    p_local.imagen_url = p_nube.imagen_url
                    p_local.categoria_id = p_nube.categoria_id
                    p_local.stock = p_nube.stock
                    p_local.activo = p_nube.activo
                    p_local.favorito = p_nube.favorito
                    p_local.permitir_sin_stock = p_nube.permitir_sin_stock
                    p_local.ventas_totales = p_nube.ventas_totales
                    p_local.codigo_barra = p_nube.codigo_barra
                    p_local.descuento_volumen_activo = p_nube.descuento_volumen_activo
                    p_local.cantidad_minima_descuento = p_nube.cantidad_minima_descuento
                    p_local.porcentaje_descuento_volumen = p_nube.porcentaje_descuento_volumen
                    p_local.sincronizado = True
                    p_local.ultima_actualizacion = t_nube
                    
        session_local.commit()
        return jsonify({"ok": True, "mensaje": "Sincronización bidireccional completada con éxito"}), 200
        
    except Exception as e:
        import traceback
        print(f"[SYNC FATAL ERROR] {e}\n{traceback.format_exc()}")
        return jsonify({"ok": False, "mensaje": f"Error de sincronización: {str(e)}"}), 500
    finally:
        if 'session_local' in locals():
            session_local.close()
        if 'session_nube' in locals():
            session_nube.close()

@app.route('/imprimir_ticket/')
@app.route('/imprimir_ticket/<int:id>')
def endpoint_imprimir_ticket(id=None):
    if id is None:
        return "ID de ticket no proporcionado", 400
    try:
        venta = Venta.query.get_or_404(id)
        import json
        detalle = json.loads(venta.detalle_json or '[]')
        
        # Formatear nombres para el ticket (Title Case)
        for item in detalle:
            item['nombre'] = to_title_case(item.get('nombre', ''))
            
        # Regla de Privacidad: Título genérico y ocultar cliente si es CF
        es_venta_rapida = True
        cliente_nombre = ""
        if venta.cliente and venta.cliente.nombre != "Consumidor Final":
            cliente_nombre = to_title_case(venta.cliente.nombre)
            es_venta_rapida = False
            
        return render_template('ticket.html', 
                             venta=venta, 
                             detalle=detalle, 
                             cliente_nombre=cliente_nombre,
                             es_venta_rapida=es_venta_rapida)
    except Exception as e:
        return f"Error al generar el ticket: {str(e)}", 500

@app.route('/')
def index():
    destacados = Producto.query.filter_by(favorito=True, activo=1).all()
    return render_template('index.html', destacados=destacados)

@app.route('/dashboard')
@login_required
def dashboard_admin():
    return redirect(url_for('admin_dashboard'))

# ─── Preventa: protección por contraseña ──────────────────────
PREVENTA_PASSWORD = 'todo2026'

@app.route('/preventa/login', methods=['GET', 'POST'])
def preventa_login():
    if request.method == 'POST':
        clave = request.form.get('clave', '').strip()
        if clave == PREVENTA_PASSWORD:
            session['preventa_auth'] = True
            return redirect('/preventa')
        return render_template('preventa_login.html', error='Contraseña incorrecta')
    return render_template('preventa_login.html', error=None)

@app.route('/preventa')
def preventa():
    if not session.get('preventa_auth'):
        return redirect('/preventa/login')
    try:
        # Prueba de conexión simple
        Producto.query.first()
        return render_template('preventa.html')
    except Exception as e:
        return f"<h1>Error de Base de Datos</h1><p>{str(e)}</p><hr><p>Verificá si las columnas precio_lista_1/2/3 existen en la tabla 'Productos'.</p>"

# ─── Facturador: protección por usuario/contraseña ────────────────
FACTU_USER = 'factu'
FACTU_PASS = 'factu2026'

@app.route('/login-facturador', methods=['GET', 'POST'])
def facturador_login():
    if request.method == 'POST':
        user = request.form.get('usuario', '').strip()
        clave = request.form.get('clave', '').strip()
        if user == FACTU_USER and clave == FACTU_PASS:
            session['facturador_auth'] = True
            return redirect('/facturador')
        return render_template('facturador_login.html', error='Usuario o contraseña incorrectos')
    return render_template('facturador_login.html', error=None)

@app.route('/facturador')
def facturador():
    if not session.get('facturador_auth'):
        return redirect('/login-facturador')
    return render_template('facturador.html')

@app.route('/logout-facturador')
def logout_facturador():
    session.pop('facturador_auth', None)
    return redirect('/')

@app.route('/ticket/<int:venta_id>')
def endpoint_ticket_legacy(venta_id):
    return endpoint_imprimir_ticket(venta_id)

@app.route('/descargar_factura/<int:venta_id>')
def descargar_factura(venta_id):
    venta = db.session.get(Venta, venta_id)
    if not venta:
        abort(404, description="Venta no encontrada")
        
    import json
    detalle = json.loads(venta.detalle_json or '[]')
    
    # Calcular altura dinámica: 70mm base + 10mm por item + 40mm pie
    item_count = len(detalle)
    page_height = 80 + (item_count * 8) + 40
    
    # FPDF(orientation, unit, format)
    # format=(ancho, alto) en mm
    pdf = FPDF('P', 'mm', (80, page_height))
    pdf.add_page()
    pdf.set_auto_page_break(False)
    
    # Encabezado
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(0, 8, 'TODO GOLOSINA', 0, 1, 'C')
    pdf.set_font('Arial', '', 8)
    pdf.cell(0, 4, 'Alberdi 950, Aguilares - Tucuman', 0, 1, 'C')
    pdf.cell(0, 4, '----------------------------------------------------------', 0, 1, 'C')
    
    pdf.ln(2)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(0, 6, f'TICKET #000-{venta.id}', 0, 1, 'C')
    pdf.set_font('Arial', '', 8)
    pdf.cell(0, 4, f"Fecha: {venta.fecha.strftime('%d/%m/%Y %H:%M')}", 0, 1, 'C')
    pdf.ln(3)
    
    # Tabla de Productos
    pdf.set_font('Arial', 'B', 8)
    pdf.cell(8, 6, 'Cant', 'B', 0, 'C')
    pdf.cell(37, 6, 'Producto', 'B', 0, 'L')
    pdf.cell(15, 6, 'Subtotal', 'B', 1, 'R')
    
    pdf.set_font('Arial', '', 8)
    for item in detalle:
        # Truncar nombre si es muy largo
        nombre = item.get('nombre', 'Prod')[:22]
        pdf.cell(8, 7, f"{item['qty']}", 0, 0, 'C')
        pdf.cell(37, 7, nombre, 0, 0, 'L')
        sub = item['qty'] * item['precio_unit']
        pdf.cell(15, 7, f"${sub:,.0f}".replace(',', '.'), 0, 1, 'R')
    
    pdf.ln(2)
    pdf.cell(0, 0, '', 'T', 1)
    pdf.ln(2)
    
    # Totales
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(35, 8, 'TOTAL:', 0, 0, 'L')
    pdf.cell(25, 8, f"${venta.total:,.2f}", 0, 1, 'R')
    
    pdf.ln(2)
    pdf.set_font('Arial', 'B', 8)
    pdf.cell(0, 5, 'MEDIOS DE PAGO:', 0, 1, 'L')
    pdf.set_font('Arial', '', 8)
    if venta.pago_efectivo > 0: pdf.cell(0, 4, f"- Efectivo: ${venta.pago_efectivo:,.2f}", 0, 1, 'L')
    if venta.pago_transferencia > 0: pdf.cell(0, 4, f"- Transf/MP: ${venta.pago_transferencia:,.2f}", 0, 1, 'L')
    if venta.pago_debito > 0: pdf.cell(0, 4, f"- Débito: ${venta.pago_debito:,.2f}", 0, 1, 'L')
    if venta.pago_cc > 0: pdf.cell(0, 4, f"- A Cuenta: ${venta.pago_cc:,.2f}", 0, 1, 'L')

    if venta.pago_cc > 0 and venta.cliente:
        pdf.ln(1)
        pdf.set_font('Arial', 'B', 9)
        pdf.cell(0, 5, f"Deuda Total Actual: ${venta.cliente.saldo:,.2f}", 0, 1, 'L')
    
    pdf.ln(5)
    pdf.set_font('Arial', 'I', 8)
    pdf.cell(0, 5, '¡Gracias por su compra!', 0, 1, 'C')
    pdf.cell(0, 5, 'www.todogolosina.com', 0, 1, 'C')

    # Generar salida
    output = io.BytesIO()
    # fpdf.output returns the pdf content as a string (py2) or bytes (py3) in dest='S'
    pdf_content = pdf.output(dest='S')
    if isinstance(pdf_content, str):
        pdf_content = pdf_content.encode('latin-1')
    
    output.write(pdf_content)
    output.seek(0)
    
    return send_file(
        output,
        mimetype='application/pdf',
        download_name=f'Ticket_TodoGolosina_{venta_id}.pdf',
        as_attachment=True
    )

@app.route('/logout')
def logout():
    logout_user()
    session.clear()
    flash("Sesión cerrada correctamente.", "info")
    return redirect(url_for('index'))

@app.route('/api/clientes/<int:id>', methods=['DELETE'])
def delete_cliente(id):
    try:
        cliente = Cliente.query.get(id)
        if not cliente:
            return jsonify({"ok": False, "mensaje": "Cliente no encontrado"}), 404
        db.session.delete(cliente)
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        print(f"Error al eliminar cliente: {e}")
        return jsonify({'error': str(e)}), 500

# ─── API Clientes ────────────────────────────────────────────────────────────────
@app.route('/api/clientes', methods=['GET'])
@app.route('/buscar_clientes', methods=['GET'])
@app.route('/obtener_clientes', methods=['GET'])
def get_clientes():
    try:
        buscar = request.args.get('q', '').strip()
        query = Cliente.query.filter_by(activo=1)
        if buscar:
            query = query.filter(Cliente.nombre.ilike(f'%{buscar}%'))
        clientes = query.order_by(Cliente.nombre.asc()).all()
        return jsonify({"ok": True, "clientes": [c.to_dict() for c in clientes]})
    except Exception as e:
        return jsonify({"error_interno": str(e), "detalle": traceback.format_exc()}), 500

@app.route('/api/clientes', methods=['POST'])
@app.route('/guardar_cliente', methods=['POST'])
def add_cliente():
    try:
        data = request.json or {}
        nombre = data.get('nombre', '').strip()
        cuit = data.get('cuit', '').strip()
        if not nombre:
            return jsonify({"ok": False, "mensaje": "El nombre es obligatorio"}), 400
        
        # Validación de Duplicados (DNI/CUIT)
        if cuit:
            existente = Cliente.query.filter_by(cuit=cuit).first()
            if existente:
                return jsonify({"ok": False, "mensaje": "Este cliente ya está registrado con ese DNI/CUIT"}), 400
        else:
            # Si no hay CUIT, validamos por nombre exacto para evitar duplicados basura
            existente_nombre = Cliente.query.filter(Cliente.nombre.ilike(nombre)).first()
            if existente_nombre:
                return jsonify({"ok": False, "mensaje": f"Ya existe un cliente registrado con el nombre '{nombre}'"}), 400

        cliente = Cliente(
            nombre=nombre,
            cuit=cuit,
            condicion_iva=data.get('condicion_iva', 'Consumidor Final').strip(),
            telefono=data.get('telefono', '').strip(),
            direccion=data.get('direccion', '').strip(),
            descuento_fijo=float(data.get('descuento_fijo', 0.0))
        )
        db.session.add(cliente)
        db.session.commit()
        return jsonify({"ok": True, "cliente": cliente.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error_interno": str(e), "detalle": traceback.format_exc()}), 500

@app.route('/api/clientes/<int:id>', methods=['PUT'])
@app.route('/editar_cliente/<int:id>', methods=['POST', 'PUT'])
def edit_cliente(id):
    cliente = db.session.get(Cliente, id)
    if not cliente:
        return jsonify({"ok": False, "mensaje": "Cliente no encontrado"}), 404

    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    cuit   = data.get('cuit', '').strip()

    if not nombre:
        return jsonify({"ok": False, "mensaje": "El nombre es obligatorio"}), 400

    # ── Validación inteligente: excluye al cliente actual ──
    if cuit:
        duplicado = Cliente.query.filter(
            Cliente.cuit == cuit,
            Cliente.id != id
        ).first()
        if duplicado:
            return jsonify({"ok": False, "mensaje": f"Ya existe otro cliente con ese DNI/CUIT ({duplicado.nombre})"}), 400

    try:
        # ── Actualizar todos los campos ──
        cliente.nombre        = nombre
        cliente.cuit          = cuit
        cliente.condicion_iva = data.get('condicion_iva', cliente.condicion_iva or 'Consumidor Final').strip()
        cliente.telefono      = data.get('telefono', '').strip()
        cliente.direccion     = data.get('direccion', '').strip()
        cliente.descuento_fijo = float(data.get('descuento_fijo', cliente.descuento_fijo or 0.0))

        db.session.commit()
        return jsonify({"ok": True, "cliente": cliente.to_dict()})
    except Exception as e:
        db.session.rollback()
        print(f"ERROR AL EDITAR CLIENTE: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/clientes/deudores', methods=['GET'])
def get_clientes_deudores():
    try:
        clientes = Cliente.query.filter(Cliente.saldo > 0, Cliente.activo == 1).order_by(Cliente.saldo.desc()).all()
        return jsonify({"ok": True, "clientes": [c.to_dict() for c in clientes]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clientes/registrar_pago', methods=['POST'])
def registrar_pago():
    data = request.json or {}
    cliente_id = data.get('cliente_id')
    monto = float(data.get('monto', 0))
    if not cliente_id or monto <= 0:
        return jsonify({"ok": False, "mensaje": "Datos inválidos"}), 400
    
    cliente = db.session.get(Cliente, cliente_id)
    if not cliente:
        return jsonify({"ok": False, "mensaje": "Cliente no encontrado"}), 404
        
    try:
        cliente.saldo -= monto
        # Registrar como ingreso en caja
        pago_mov = Gasto(
            descripcion=f"Cobranza: {cliente.nombre}",
            monto=monto,
            categoria="Cobranza",
            tipo="Ingreso"
        )
        db.session.add(pago_mov)
        db.session.commit()
        return jsonify({"ok": True, "nuevo_saldo": cliente.saldo})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/caja/estado', methods=['GET'])
def get_caja_estado():
    hoy = date.today()
    # Buscamos si hay una caja abierta
    caja = CajaDiaria.query.filter_by(estado='Abierta').order_by(CajaDiaria.id.desc()).first()
    if caja:
        return jsonify({"ok": True, "abierta": True, "caja": caja.to_dict()})
    return jsonify({"ok": True, "abierta": False})

@app.route('/api/caja/abrir', methods=['POST'])
def abrir_caja():
    data = request.json or {}
    monto = float(data.get('monto_inicial', 0))
    # Cerrar cualquier caja que haya quedado abierta por error antes de abrir una nueva?
    # O simplemente no permitir abrir si ya hay una.
    existente = CajaDiaria.query.filter_by(estado='Abierta').first()
    if existente:
        return jsonify({"ok": False, "mensaje": "Ya existe una caja abierta"}), 400
    
    try:
        nueva = CajaDiaria(monto_inicial=monto, estado='Abierta')
        db.session.add(nueva)
        db.session.commit()
        return jsonify({"ok": True, "caja": nueva.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "mensaje": str(e)}), 500

@app.route('/api/caja/cerrar', methods=['POST'])
def cerrar_caja():
    caja = CajaDiaria.query.filter_by(estado='Abierta').order_by(CajaDiaria.id.desc()).first()
    if not caja:
        return jsonify({"ok": False, "mensaje": "No hay una caja abierta para cerrar"}), 400
    
    try:
        # Aquí se podrían calcular totales finales y guardarlos si el modelo tuviera esos campos
        caja.estado = 'Cerrada'
        caja.fecha_cierre = hora_argentina()
        db.session.commit()
        return jsonify({"ok": True, "mensaje": "Caja cerrada correctamente"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "mensaje": str(e)}), 500

@app.route('/api/ventas_hoy', methods=['GET'])
def get_ventas_hoy():
    try:
        fecha_inicio_str = request.args.get('inicio')
        fecha_fin_str = request.args.get('fin')
        
        caja = CajaDiaria.query.filter_by(estado='Abierta').order_by(CajaDiaria.id.desc()).first()

        if fecha_inicio_str and fecha_fin_str:
            inicio_rango = datetime.strptime(fecha_inicio_str, '%Y-%m-%d')
            fin_rango = datetime.strptime(fecha_fin_str + " 23:59:59", '%Y-%m-%d %H:%M:%S')
            ventas = Venta.query.filter(Venta.fecha >= inicio_rango, Venta.fecha <= fin_rango).order_by(Venta.fecha.desc()).all()
            gastos = Gasto.query.filter(Gasto.fecha >= inicio_rango, Gasto.fecha <= fin_rango).all()
        else:
            if caja:
                inicio_rango = caja.fecha_apertura
            else:
                inicio_rango = datetime.combine(date.today(), time.min)

            ventas = Venta.query.filter(Venta.fecha >= inicio_rango).order_by(Venta.fecha.desc()).all()
            gastos = Gasto.query.filter(Gasto.fecha >= inicio_rango).all()
        
        m_ef = sum((v.pago_efectivo or 0.0) for v in ventas)
        m_tr = sum((v.pago_transferencia or 0.0) for v in ventas)
        m_db = sum((v.pago_debito or 0.0) for v in ventas)
        m_cc = sum((v.pago_cc or 0.0) for v in ventas)
        
        total_ventas = sum((v.total or 0.0) for v in ventas)
        
        ingresos_extra = sum((g.monto or 0.0) for g in gastos if g.tipo == 'Ingreso' and g.categoria != 'Cobranza')
        cobranzas = sum((g.monto or 0.0) for g in gastos if g.tipo == 'Ingreso' and g.categoria == 'Cobranza')
        egresos = sum((g.monto or 0.0) for g in gastos if g.tipo == 'Egreso')
        
        monto_inicial = caja.monto_inicial if caja else 0.0
        # Efectivo Real = Inicio + Ventas Efectivo + Cobranzas + Ingresos Extra - Egresos
        efectivo_real = monto_inicial + m_ef + cobranzas + ingresos_extra - egresos

        # Métricas extra para el Dashboard
        tickets_hoy = len(ventas)
        clientes_hoy = len(set(v.cliente_id for v in ventas if v.cliente_id))
        alertas_stock = Producto.query.filter(Producto.activo == 1, Producto.stock <= 5).count()

        return jsonify({
            "ok": True,
            "caja_abierta": True if caja else False,
            "monto_inicial": monto_inicial,
            "total_ventas": total_ventas,
            "tickets_hoy": tickets_hoy,
            "clientes_hoy": clientes_hoy,
            "alertas_stock": alertas_stock,
            "metodos": {
                "efectivo": m_ef,
                "transferencia": m_tr,
                "debito": m_db,
                "cc": m_cc
            },
            "ingresos_extra": ingresos_extra,
            "cobranzas": cobranzas,
            "egresos": egresos,
            "efectivo_real": efectivo_real,
            "ventas": [{
                "id": v.id,
                "hora": v.fecha.strftime('%H:%M') if hasattr(v.fecha, 'strftime') else (str(v.fecha)[:16] if v.fecha else '--:--'),
                "metodo_pago": getattr(v, 'metodo_pago', 'No especificado') or 'No especificado',
                "total": v.total or 0.0
            } for v in ventas],
            "gastos": [g.to_dict() for g in gastos]
        })
    except Exception as e:
        return jsonify({"error_interno": str(e), "detalle": traceback.format_exc()}), 500

@app.route('/api/venta/<int:id>', methods=['GET'])
def get_venta_detalle(id):
    try:
        venta = db.session.get(Venta, id)
        if not venta:
            return jsonify({"ok": False, "mensaje": "Venta no encontrada"}), 404
        
        import json
        detalle = json.loads(venta.detalle_json or '[]')
        
        for item in detalle:
            item['nombre'] = to_title_case(item.get('nombre', ''))
            
        cliente_nombre = "Consumidor Final"
        if venta.cliente:
            cliente_nombre = to_title_case(venta.cliente.nombre)
            
        return jsonify({
            "ok": True,
            "id": venta.id,
            "fecha": venta.fecha.strftime('%d/%m/%Y %H:%M:%S') if hasattr(venta.fecha, 'strftime') else str(venta.fecha),
            "metodo_pago": getattr(venta, 'metodo_pago', 'No especificado') or 'No especificado',
            "total": venta.total or 0.0,
            "cliente_nombre": cliente_nombre,
            "detalle": detalle
        }), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/api/ventas/<int:id_venta>', methods=['GET'])
def obtener_detalle_venta(id_venta):
    venta = Venta.query.get_or_404(id_venta)
    
    items_vendidos = []
    
    # 1. Intentar obtener de la relación de base de datos si existe
    if hasattr(venta, 'detalles') and venta.detalles: 
        for detalle in venta.detalles:
            items_vendidos.append({
                "cantidad": detalle.cantidad,
                "nombre": to_title_case(detalle.producto.nombre if detalle.producto else "Producto Eliminado"),
                "precio": detalle.precio_unitario,
                "subtotal": detalle.cantidad * detalle.precio_unitario
            })
            
    # 2. Si no hay relación o está vacía, deserializar desde detalle_json
    if not items_vendidos and hasattr(venta, 'detalle_json') and venta.detalle_json:
        try:
            import json
            detalle = json.loads(venta.detalle_json or '[]')
            for item in detalle:
                qty = item.get('qty') or item.get('cantidad') or 1
                precio = item.get('precio_unit') or item.get('precio_unitario') or item.get('precio') or 0.0
                nombre = to_title_case(item.get('nombre') or "Producto")
                items_vendidos.append({
                    "cantidad": qty,
                    "nombre": nombre,
                    "precio": precio,
                    "subtotal": qty * precio
                })
        except Exception:
            pass
            
    return jsonify({
        "id": venta.id,
        "fecha": venta.fecha.strftime('%d/%m/%Y %H:%M') if (venta.fecha and hasattr(venta.fecha, 'strftime')) else "",
        "total": venta.total,
        "items": items_vendidos
    }), 200

@app.route('/api/gastos', methods=['POST'])
def add_gasto():
    data = request.json or {}
    descripcion = data.get('descripcion', '').strip()
    monto = data.get('monto', 0)
    if not descripcion or not monto:
        return jsonify({"ok": False, "mensaje": "Descripción y monto son obligatorios"}), 400
    
    from datetime import timedelta
    tiempo_limite = hora_argentina() - timedelta(seconds=15)
    
    # Buscar si hay un movimiento idéntico reciente
    mov_fantasma = Gasto.query.filter(
        Gasto.monto == float(monto),
        Gasto.descripcion == descripcion,
        Gasto.tipo == data.get('tipo', 'Egreso'),
        Gasto.fecha >= tiempo_limite
    ).first()
    
    if mov_fantasma:
        return jsonify({"ok": True, "mensaje": "Movimiento procesado (eco bloqueado)"}), 200
    
    try:
        gasto = Gasto(
            descripcion=descripcion, 
            monto=float(monto), 
            categoria=data.get('categoria', 'General'),
            tipo=data.get('tipo', 'Egreso')
        )
        db.session.add(gasto)
        db.session.commit()
        return jsonify({"ok": True, "gasto": gasto.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "mensaje": str(e)}), 500

@app.route('/api/ventas', methods=['GET'])
def get_ventas_general():
    import json as _json
    buscar = request.args.get('q', '').strip()
    query = Venta.query.outerjoin(Cliente, Venta.cliente_id == Cliente.id)
    if buscar:
        query = query.filter(Cliente.nombre.ilike(f'%{buscar}%'))
    
    ventas = query.order_by(Venta.fecha.desc()).limit(100).all()
    
    return jsonify({
        "ok": True,
        "ventas": [{
            "id": v.id,
            "fecha": v.fecha.strftime('%d/%m/%Y %H:%M') if v.fecha else '',
            "cliente_nombre": v.cliente.nombre if v.cliente else 'N/A',
            "total": v.total,
            "detalle": _json.loads(v.detalle_json or '[]')
        } for v in ventas]
    })

@app.route('/api/ventas-cliente/<int:cliente_id>', methods=['GET'])
def get_ventas_cliente(cliente_id):
    import json as _json
    cliente = db.session.get(Cliente, cliente_id)
    if not cliente:
        return jsonify({"ok": False, "mensaje": "Cliente no encontrado"}), 404
    ventas = Venta.query.filter_by(cliente_id=cliente_id).order_by(Venta.fecha.desc()).limit(20).all()
    return jsonify({
        "ok": True,
        "cliente": cliente.to_dict(),
        "ventas": [{
            "id": v.id,
            "fecha": v.fecha.strftime('%d/%m/%Y %H:%M') if v.fecha else '',
            "total": v.total,
            "detalle": _json.loads(v.detalle_json or '[]')
        } for v in ventas]
    })

@app.route('/productos')
def productos():
    productos = Producto.query.filter_by(activo=1).order_by(Producto.id.desc()).all()
    return render_template('productos.html', productos=productos)

@app.route('/producto/<int:id>')
def producto_detalle(id):
    producto = db.session.get(Producto, id)
    if not producto or producto.activo == 0:
        from flask import abort
        abort(404)
    relacionados = []
    if producto.categoria_id:
        relacionados = Producto.query.filter(
            Producto.categoria_id == producto.categoria_id, 
            Producto.id != producto.id,
            Producto.activo == 1
        ).order_by(db.func.random()).limit(4).all()
    return render_template('detalle.html', producto=producto, relacionados=relacionados)



@app.route('/contacto')
def contacto():
    return render_template('contacto.html')

# ─── Panel de Administración ─────────────────────────────────
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('admin_dashboard'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = Usuario.query.filter_by(username=username).first()

        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return redirect(url_for('admin_dashboard'))
        else:
            flash('Usuario o contraseña incorrectos.', 'danger')

    return render_template('login.html')

@app.route('/admin')
@login_required
def admin_dashboard():
    search = request.args.get('q')
    query = Producto.query.filter_by(activo=1)
    if search:
        query = query.filter(Producto.nombre.ilike(f'%{search}%'))
    productos = query.order_by(Producto.id.desc()).all()
    categorias = Categoria.query.all()
    return render_template('admin.html', productos=productos, categorias=categorias, search=search)

@app.route('/admin/producto/add', methods=['POST'])
@login_required
def admin_add_product():
    nombre = request.form.get('nombre')
    
    precio_str = request.form.get('precio', '0').strip().replace(',', '.')
    try:
        precio = float(precio_str) if precio_str else 0.0
    except ValueError:
        precio = 0.0
        
    precio_ant_str = request.form.get('precio_anterior', '').strip().replace(',', '.')
    try:
        precio_anterior = float(precio_ant_str) if precio_ant_str else None
    except ValueError:
        precio_anterior = None
        
    descripcion = request.form.get('descripcion', '')
    imagen_url = request.form.get('imagen_url', '')
    categoria_id_str = request.form.get('categoria_id')
    categoria_id = int(categoria_id_str) if categoria_id_str and categoria_id_str.isdigit() else None
    
    stock_str = request.form.get('stock', '0').strip()
    try:
        stock = int(stock_str) if stock_str else 0
    except ValueError:
        stock = 0

    favorito = True if request.form.get('favorito') else False
    permitir_sin_stock = True if request.form.get('permitir_sin_stock') else False

    # Triple Lista de Precios
    precio_1_str = request.form.get('precio', '0').strip().replace(',', '.')
    precio_2_str = request.form.get('precio_2', '').strip().replace(',', '.')
    precio_3_str = request.form.get('precio_3', '').strip().replace(',', '.')
    
    try:
        precio_lista_1 = float(precio_1_str) if precio_1_str else 0.0
    except ValueError:
        precio_lista_1 = 0.0

    try:
        precio_lista_2 = float(precio_2_str) if precio_2_str else precio_lista_1
    except ValueError:
        precio_lista_2 = precio_lista_1
    try:
        precio_lista_3 = float(precio_3_str) if precio_3_str else precio_lista_1
    except ValueError:
        precio_lista_3 = precio_lista_1

    # Descuento por volumen
    descuento_volumen_activo = True if request.form.get('descuento_volumen_activo') else False
    cant_min_str = request.form.get('cantidad_minima_descuento', '').strip()
    porc_desc_str = request.form.get('porcentaje_descuento_volumen', '').strip()
    try:
        cantidad_minima_descuento = int(cant_min_str) if cant_min_str else None
    except ValueError:
        cantidad_minima_descuento = None
    try:
        porcentaje_descuento_volumen = float(porc_desc_str) if porc_desc_str else None
    except ValueError:
        porcentaje_descuento_volumen = None

    codigo_barra = request.form.get('codigo_barra', '').strip()
    if codigo_barra:
        # Validación multi-variante: separar por comas y verificar cada uno
        nuevos_codigos = [c.strip() for c in codigo_barra.split(',') if c.strip()]
        filtros = [Producto.codigo_barra.ilike(f'%{c}%') for c in nuevos_codigos]
        posibles_duplicados = Producto.query.filter(or_(*filtros), Producto.activo == 1).all()

        for p in posibles_duplicados:
            codigos_existentes = [c.strip() for c in p.codigo_barra.split(',') if c.strip()]
            for nc in nuevos_codigos:
                if nc in codigos_existentes:
                     return jsonify({"error": f"El código '{nc}' ya está registrado en el producto: {p.nombre}"}), 400

    nuevo = Producto(
        nombre=nombre, precio_lista_1=precio_lista_1, precio_lista_2=precio_lista_2, precio_lista_3=precio_lista_3,
        precio_anterior=precio_anterior, descripcion=descripcion,
        imagen_url=imagen_url, categoria_id=categoria_id, stock=stock,
        favorito=favorito, permitir_sin_stock=permitir_sin_stock,
        codigo_barra=codigo_barra,
        descuento_volumen_activo=descuento_volumen_activo,
        cantidad_minima_descuento=cantidad_minima_descuento,
        porcentaje_descuento_volumen=porcentaje_descuento_volumen,
        sincronizado=not es_offline(),
        ultima_actualizacion=hora_argentina()
    )
    db.session.add(nuevo)
    db.session.commit()
    flash('Producto agregado exitosamente.', 'success')
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/producto/edit/<int:id>', methods=['POST'])
@login_required
def admin_edit_product(id):
    producto = db.session.get(Producto, id)
    if not producto:
        flash('Producto no encontrado.', 'danger')
        return redirect(url_for('admin_dashboard'))

    producto.nombre = request.form.get('nombre')
        
    precio_ant_str = request.form.get('precio_anterior', '').strip().replace(',', '.')
    try:
        producto.precio_anterior = float(precio_ant_str) if precio_ant_str else None
    except ValueError:
        producto.precio_anterior = None
        
    producto.descripcion = request.form.get('descripcion', '')
    producto.imagen_url = request.form.get('imagen_url', '')
    
    cat_id_str = request.form.get('categoria_id')
    producto.categoria_id = int(cat_id_str) if cat_id_str and cat_id_str.isdigit() else None
    
    stock_str = request.form.get('stock', '0').strip()
    try:
        producto.stock = int(stock_str) if stock_str else 0
    except ValueError:
        producto.stock = 0

    producto.favorito = True if request.form.get('favorito') else False
    producto.permitir_sin_stock = True if request.form.get('permitir_sin_stock') else False
    producto.codigo_barra = request.form.get('codigo_barra', '').strip()

    # Descuento por volumen
    producto.descuento_volumen_activo = True if request.form.get('descuento_volumen_activo') else False
    cant_min_str = request.form.get('cantidad_minima_descuento', '').strip()
    porc_desc_str = request.form.get('porcentaje_descuento_volumen', '').strip()
    try:
        producto.cantidad_minima_descuento = int(cant_min_str) if cant_min_str else None
    except ValueError:
        producto.cantidad_minima_descuento = None
    try:
        producto.porcentaje_descuento_volumen = float(porc_desc_str) if porc_desc_str else None
    except ValueError:
        producto.porcentaje_descuento_volumen = None

    # Validación de Duplicados en Edición (Multi-variante)
    nuevo_codigo_str = request.form.get('codigo_barra', '').strip()
    if nuevo_codigo_str:
        nuevos_codigos = [c.strip() for c in nuevo_codigo_str.split(',') if c.strip()]
        filtros = [Producto.codigo_barra.ilike(f'%{c}%') for c in nuevos_codigos]
        # Buscamos en OTROS productos
        posibles_duplicados = Producto.query.filter(or_(*filtros), Producto.id != id, Producto.activo == 1).all()

        for p in posibles_duplicados:
            codigos_existentes = [c.strip() for c in p.codigo_barra.split(',') if c.strip()]
            for nc in nuevos_codigos:
                if nc in codigos_existentes:
                     return jsonify({"error": f"El código '{nc}' ya está registrado en el producto: {p.nombre}"}), 400

    try:
        # Triple Lista de Precios
        p1_str = request.form.get('precio', '0').strip().replace(',', '.')
        p2_str = request.form.get('precio_2', '').strip().replace(',', '.')
        p3_str = request.form.get('precio_3', '').strip().replace(',', '.')
        try:
            producto.precio_lista_1 = float(p1_str) if p1_str else 0.0
        except ValueError:
            producto.precio_lista_1 = 0.0
        try:
            producto.precio_lista_2 = float(p2_str) if p2_str else producto.precio_lista_1
        except ValueError:
            producto.precio_lista_2 = producto.precio_lista_1
        try:
            producto.precio_lista_3 = float(p3_str) if p3_str else producto.precio_lista_1
        except ValueError:
            producto.precio_lista_3 = producto.precio_lista_1

        producto.sincronizado = not es_offline()
        producto.ultima_actualizacion = hora_argentina()
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({"ok": True, "mensaje": "Producto editado correctamente."})
            
        flash('Producto editado correctamente.', 'info')
        return redirect(url_for('admin_dashboard'))
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({"error": f"Error de integridad: {str(e)}"}), 500
        flash(f'Error al editar producto: {str(e)}', 'danger')
        return redirect(url_for('admin_dashboard'))

@app.route('/admin/producto/delete/<int:id>', methods=['POST'])
@login_required
def admin_delete_product(id):
    producto = db.session.get(Producto, id)
    if producto:
        producto.activo = 0 # Soft delete
        producto.sincronizado = not es_offline()
        producto.ultima_actualizacion = hora_argentina()
        db.session.commit()
        flash('Producto eliminado.', 'warning')
    return redirect(url_for('admin_dashboard'))

# ─── CRUD de Categorías ──────────────────────────────────────
@app.route('/admin/categorias')
@login_required
def admin_categorias():
    categorias = Categoria.query.all()
    return render_template('admin_categorias.html', categorias=categorias)

@app.route('/admin/categoria/add', methods=['POST'])
@login_required
def admin_add_categoria():
    nombre = request.form.get('nombre')
    if nombre:
        nueva = Categoria(nombre=nombre)
        db.session.add(nueva)
        try:
            db.session.commit()
            flash('Categoría agregada exitosamente.', 'success')
        except:
            db.session.rollback()
            flash('Error: La categoría ya existe u ocurrió un error.', 'danger')
    return redirect(url_for('admin_categorias'))

@app.route('/admin/categoria/edit/<int:id>', methods=['POST'])
@login_required
def admin_edit_categoria(id):
    categoria = db.session.get(Categoria, id)
    nombre = request.form.get('nombre')
    if categoria and nombre:
        categoria.nombre = nombre
        try:
            db.session.commit()
            flash('Categoría editada exitosamente.', 'info')
        except:
            db.session.rollback()
            flash('Error: La categoría ya existe.', 'danger')
    return redirect(url_for('admin_categorias'))

@app.route('/admin/categoria/delete/<int:id>', methods=['POST'])
@login_required
def admin_delete_categoria(id):
    categoria = db.session.get(Categoria, id)
    if categoria:
        if Producto.query.filter_by(categoria_id=categoria.id, activo=1).first():
            flash('No se puede eliminar la categoría porque tiene productos activos.', 'danger')
        else:
            db.session.delete(categoria)
            db.session.commit()
            flash('Categoría eliminada.', 'warning')
    return redirect(url_for('admin_categorias'))

# ─── Importación Masiva ──────────────────────────────────────
@app.route('/admin/importar', methods=['POST'])
@login_required
def admin_importar():
    if 'excel_file' not in request.files:
        flash('No se subió ningún archivo.', 'danger')
        return redirect(url_for('admin_dashboard'))
    
    file = request.files['excel_file']
    if file.filename == '':
        flash('Ningún archivo seleccionado.', 'danger')
        return redirect(url_for('admin_dashboard'))

    stats = {'actualizados_ok': 0, 'no_encontrados': 0, 'leidos_como_cero': 0}
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file, data_only=True)
        hoja = wb.active
        
        # Crear un diccionario: {'nombre de columna': indice}
        encabezados = {}
        for i, celda in enumerate(hoja[1]):
            if celda.value:
                encabezados[str(celda.value).strip().lower()] = i

        # Buscar las columnas clave permitiendo sinónimos
        idx_precio = encabezados.get('precio lista 1') or encabezados.get('precio')
        idx_codigo = encabezados.get('código de barras') or encabezados.get('codigo de barras') or encabezados.get('codigo') or encabezados.get('código')
        idx_nombre = encabezados.get('nombre')

        if idx_precio is None:
            return jsonify({"error": "El Excel no tiene la columna 'Precio Lista 1' ni 'Precio'."}), 400
        if idx_codigo is None:
            return jsonify({"error": "El Excel no tiene la columna 'Código de barras'."}), 400

        # Índices opcionales
        idx_cat = encabezados.get('categoría') or encabezados.get('categoria')
        idx_p2 = encabezados.get('precio_lista_2')
        idx_p3 = encabezados.get('precio_lista_3')
        idx_stock = encabezados.get('stock')
        idx_img = encabezados.get('link imagen') or encabezados.get('url imagen')
        idx_destacado = encabezados.get('destacado') or encabezados.get('favorito')
        idx_sinstock = encabezados.get('venta sin stock')

        def limpiar_precio(valor_celda):
            if valor_celda is None:
                return 0.0
            
            valor_str = str(valor_celda).strip()
            if valor_str.lower() in ['nan', 'none', '']:
                return 0.0
            
            # Eliminamos signo pesos, puntos de miles o espacios comunes en formatos de moneda
            valor_str = valor_str.replace('$', '').replace(' ', '')
            
            # Si el Excel usa coma para decimales (ej: 150,50), la cambiamos por punto para Python
            if ',' in valor_str and '.' not in valor_str:
                valor_str = valor_str.replace(',', '.')
            elif ',' in valor_str and '.' in valor_str:
                # Si tiene ambos (ej: 1,500.00), quitamos la coma de miles
                valor_str = valor_str.replace(',', '')
                
            try:
                return float(valor_str)
            except ValueError:
                return 0.0

        for fila in hoja.iter_rows(min_row=2):
            if fila[idx_codigo].value is None and (idx_nombre is None or fila[idx_nombre].value is None):
                continue
                
            valor_precio_crudo = fila[idx_precio].value
            precio_final = limpiar_precio(valor_precio_crudo)
            
            # LOG PARA RENDER: Imprimir qué está leyendo el sistema
            print(f"Fila {fila[0].row} - Crudo: '{valor_precio_crudo}' -> Convertido a: {precio_final}")
            
            codigo_crudo = fila[idx_codigo].value
            if not codigo_crudo:
                continue
            
            # Convertir a string, quitar espacios y si excel le metió un '.0' al final, sacarlo
            codigo_excel = str(codigo_crudo).strip()
            if codigo_excel.endswith('.0'):
                codigo_excel = codigo_excel[:-2]
                
            val_nombre = str(fila[idx_nombre].value).strip() if (idx_nombre is not None and fila[idx_nombre].value is not None) else ''
            
            # Buscar el producto donde el campo codigo_barra contenga el código del Excel
            prod = Producto.query.filter(Producto.codigo_barra.ilike(f'%{codigo_excel}%')).first()
                
            if not prod and val_nombre:
                prod = Producto.query.filter(Producto.nombre.ilike(val_nombre)).first()
                
            if not prod:
                stats['no_encontrados'] += 1
                if not val_nombre:
                    continue # No se puede crear si no hay nombre
                prod = Producto(nombre=val_nombre)
                db.session.add(prod)
            else:
                if precio_final <= 0:
                    stats['leidos_como_cero'] += 1
                else:
                    stats['actualizados_ok'] += 1
                
            # Actualización en la Base de Datos
            prod.precio_lista_1 = precio_final
            prod.sincronizado = not es_offline()
            prod.ultima_actualizacion = hora_argentina()
            if prod.id: # Si el producto ya existe en la BD
                print(f"Actualizado: {prod.nombre} -> ${precio_final}")
            
            if codigo_excel and codigo_excel not in (prod.codigo_barra or ''):
                prod.codigo_barra = codigo_excel
                
            if idx_cat is not None and fila[idx_cat].value is not None:
                cat_name = str(fila[idx_cat].value).strip()
                if cat_name and cat_name.lower() not in ['nan', 'none']:
                    categoria = Categoria.query.filter(Categoria.nombre.ilike(cat_name)).first()
                    if not categoria:
                        categoria = Categoria(nombre=cat_name)
                        db.session.add(categoria)
                        db.session.commit()
                    prod.categoria_id = categoria.id

            if idx_p2 is not None and fila[idx_p2].value is not None:
                prod.precio_lista_2 = limpiar_precio(fila[idx_p2].value)
            else:
                prod.precio_lista_2 = precio_final
                
            if idx_p3 is not None and fila[idx_p3].value is not None:
                prod.precio_lista_3 = limpiar_precio(fila[idx_p3].value)
            else:
                prod.precio_lista_3 = precio_final
                
            if idx_stock is not None and fila[idx_stock].value is not None:
                try:
                    prod.stock = int(fila[idx_stock].value)
                except:
                    pass
                    
            if idx_img is not None and fila[idx_img].value is not None:
                img_val = str(fila[idx_img].value).strip()
                if img_val and img_val.lower() not in ['nan', 'none']:
                    prod.imagen_url = img_val
                    
            if idx_destacado is not None and fila[idx_destacado].value is not None:
                dest = str(fila[idx_destacado].value).strip().upper()
                prod.favorito = True if dest == 'SI' else False
                
            if idx_sinstock is not None and fila[idx_sinstock].value is not None:
                ss = str(fila[idx_sinstock].value).strip().upper()
                prod.permitir_sin_stock = True if ss == 'SI' else False
                
        db.session.commit()
        global ultima_actualizacion_precios
        ultima_actualizacion_precios = hora_argentina()
        reporte = f"✅ Éxito: {stats['actualizados_ok']} | ❌ No encontrados: {stats['no_encontrados']} | ⚠️ Precios rotos ($0): {stats['leidos_como_cero']}"
        return jsonify({"mensaje": reporte}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/verificar_precios', methods=['GET'])
def verificar_precios():
    # Si no existe la variable, manda la hora argentina actual como default
    ultima = globals().get('ultima_actualizacion_precios', hora_argentina())
    return jsonify({"ultima_actualizacion": ultima.isoformat()}), 200

# ─── Exportación a Excel ───────────────────────────────────────
@app.route('/admin/exportar')
@login_required
def admin_exportar():
    productos = Producto.query.all()
    data = []
    for p in productos:
        data.append({
            'ID': p.id,
            'Nombre': p.nombre,
            'Precio Lista 1': p.precio_lista_1,
            'Precio Lista 2': p.precio_lista_2,
            'Precio Lista 3': p.precio_lista_3,
            'Código de Barras': p.codigo_barra,
            'Stock': p.stock,
            'Categoria': p.categoria_rel.nombre if p.categoria_rel else 'General',
            'Favorito': 'SI' if p.favorito else 'NO',
            'Venta sin Stock': 'SI' if p.permitir_sin_stock else 'NO',
            'Link Imagen': p.imagen_url or p.imagen,
            'Activo': 'SI' if p.activo == 1 else 'NO'
        })
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Inventario')
    output.seek(0)
    
    return send_file(
        output,
        download_name='Inventario_Todo_Golosina.xlsx',
        as_attachment=True,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

# ─── Estadísticas de Ventas ──────────────────────────────────
@app.route('/admin/estadisticas')
@login_required
def admin_estadisticas():
    top_vendidos = Producto.query.filter_by(activo=1).order_by(Producto.ventas_totales.desc()).limit(5).all()
    peor_vendidos = Producto.query.filter_by(activo=1).order_by(Producto.ventas_totales.asc()).limit(5).all()
    
    en_stock = Producto.query.filter(Producto.activo==1, Producto.stock > 0).count()
    sin_stock = Producto.query.filter(Producto.activo==1, Producto.stock <= 0).count()
    total_productos = en_stock + sin_stock
    
    stock_porc = (en_stock / total_productos * 100) if total_productos > 0 else 0
    sin_stock_porc = (sin_stock / total_productos * 100) if total_productos > 0 else 0

    return render_template(
        'admin_estadisticas.html', 
        top_vendidos=top_vendidos,
        peor_vendidos=peor_vendidos,
        en_stock=en_stock,
        sin_stock=sin_stock,
        total_productos=total_productos,
        stock_porc=stock_porc,
        sin_stock_porc=sin_stock_porc
    )

# ─── Configuración inicial de Base de Datos ──────────────────
@app.route('/api/finalizar-pedido', methods=['POST'])
def finalizar_pedido():
    return jsonify({
        "ok": True, 
        "mensaje": "Pedido recibido con éxito. ¡Gracias por tu compra!"
    })

from sqlalchemy import text

def setup_database():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with app.app_context():
        db.create_all()
        
        # Intentar añadir la columna de código de barras de manera segura por si la tabla ya existe
        try:
            db.session.execute(text('ALTER TABLE "Productos" ADD COLUMN codigo_barra VARCHAR(100);'))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Agregar columnas de sincronización en Productos de manera segura
        try:
            db.session.execute(text('ALTER TABLE "Productos" ADD COLUMN sincronizado BOOLEAN DEFAULT TRUE;'))
            db.session.commit()
        except Exception:
            db.session.rollback()

        try:
            db.session.execute(text('ALTER TABLE "Productos" ADD COLUMN ultima_actualizacion TIMESTAMP;'))
            db.session.commit()
        except Exception:
            db.session.rollback()
        
        # Columnas nuevas para Clientes (MIGRACIÓN PASO A PASO)
        columnas_clientes = [
            ('cuit', 'VARCHAR(20)'),
            ('condicion_iva', 'VARCHAR(50)'),
            ('descuento_fijo', 'FLOAT DEFAULT 0.0'),
            ('saldo', 'FLOAT DEFAULT 0.0'),
            ('limite_credito', 'FLOAT DEFAULT 0.0')
        ]
        for col, tip in columnas_clientes:
            try:
                db.session.execute(text(f'ALTER TABLE "clientes" ADD COLUMN {col} {tip};'))
                db.session.commit()
            except Exception:
                db.session.rollback()
        
        # Columnas nuevas para Ventas
        columnas_ventas = [
            ('pago_efectivo', 'FLOAT DEFAULT 0.0'),
            ('pago_transferencia', 'FLOAT DEFAULT 0.0'),
            ('pago_debito', 'FLOAT DEFAULT 0.0'),
            ('pago_cc', 'FLOAT DEFAULT 0.0'),
            ('sincronizado', 'BOOLEAN DEFAULT TRUE'),
            ('ultima_actualizacion', 'TIMESTAMP')
        ]
        for col, tip in columnas_ventas:
            try:
                db.session.execute(text(f'ALTER TABLE "ventas" ADD COLUMN {col} {tip};'))
                db.session.commit()
            except Exception:
                db.session.rollback()

        if Categoria.query.count() == 0:
            for cat_name in ['General', 'Gummies', 'Chocolates', 'Chupetines', 'Marshmallows', 'Ácidos', 'Caramelos', 'Gift Boxes']:
                db.session.add(Categoria(nombre=cat_name))
            db.session.commit()
            
            cat_general = Categoria.query.filter_by(nombre='General').first()
            for p in Producto.query.all():
                if not p.categoria_id:
                    p.categoria_id = cat_general.id
            db.session.commit()

        if not Usuario.query.filter_by(username='admin').first():
            admin = Usuario(username='admin', password_hash=generate_password_hash('admin123'))
            db.session.add(admin)
            db.session.commit()

# ─── Inicialización de la Base de Datos ──────────────────────
# Llamamos a esta función aquí para que se ejecute al importar 'app' en Render/Gunicorn
setup_database()

@app.route('/reportes')
def reportes_view():
    if not session.get('facturador_auth'):
        return redirect('/login-facturador')
    return render_template('reportes.html')

@app.route('/api/reportes', methods=['GET'])
def api_reportes():
    from datetime import datetime, time
    import json
    
    fecha_desde_str = request.args.get('desde')
    fecha_hasta_str = request.args.get('hasta')
    
    query = Venta.query
    
    if fecha_desde_str:
        try:
            fecha_desde = datetime.strptime(fecha_desde_str, '%Y-%m-%d')
            query = query.filter(Venta.fecha >= datetime.combine(fecha_desde, time.min))
        except ValueError:
            pass
    
    if fecha_hasta_str:
        try:
            fecha_hasta = datetime.strptime(fecha_hasta_str, '%Y-%m-%d')
            query = query.filter(Venta.fecha <= datetime.combine(fecha_hasta, time.max))
        except ValueError:
            pass
        
    ventas = query.all()
    
    resumen = {
        "Efectivo": 0.0,
        "Transferencia": 0.0,
        "Débito": 0.0,
        "Total": 0.0
    }
    
    clientes_reporte = {}
    
    for v in ventas:
        resumen["Efectivo"] += (v.pago_efectivo or 0.0)
        resumen["Transferencia"] += (v.pago_transferencia or 0.0)
        resumen["Débito"] += (v.pago_debito or 0.0)
        resumen["Total"] += v.total
        
        # Reporte por Clientes
        c_id = v.cliente_id or 0
        c_nombre = v.cliente.nombre if v.cliente else 'Consumidor Final'
        
        if c_id not in clientes_reporte:
            clientes_reporte[c_id] = {"nombre": c_nombre, "total": 0.0}
        
        clientes_reporte[c_id]["total"] += v.total
        
    clientes_lista = sorted(
        [{"id": cid, "nombre": data["nombre"], "total": data["total"]} for cid, data in clientes_reporte.items()],
        key=lambda x: x["total"],
        reverse=True
    )
    
    return jsonify({
        "ok": True,
        "resumen": resumen,
        "clientes": clientes_lista
    })

@app.route('/manifest.json')
def send_manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def send_sw():
    response = make_response(send_from_directory('static', 'sw.js'))
    response.headers['Content-Type'] = 'application/javascript'
    return response

if __name__ == '__main__':
    app.run(debug=True, port=5000)
