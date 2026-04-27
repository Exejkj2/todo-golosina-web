import os
from flask import Flask, jsonify, request, abort, render_template, redirect, url_for, flash, send_file
import io
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import pandas as pd

# ─── Configuración ────────────────────────────────────────────
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH  = os.path.join(BASE_DIR, 'database', 'tienda.db')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'todo_golosina_secreto_super_seguro'

# Configuración de Base de Datos (PostgreSQL en Render / SQLite local)
uri = os.environ.get('DATABASE_URL')
if uri and uri.startswith('postgres://'):
    uri = uri.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = uri or f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)
db = SQLAlchemy(app)

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

class Categoria(db.Model):
    __tablename__ = 'categoria'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False)

class Producto(db.Model):
    __tablename__ = 'Productos'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(150), nullable=False)
    descripcion = db.Column(db.Text)
    precio = db.Column(db.Float, nullable=False)
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

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'descripcion': self.descripcion,
            'precio': self.precio,
            'precio_anterior': self.precio_anterior,
            'imagen': self.imagen_url or self.imagen,
            'imagen_url': self.imagen_url,
            'categoria': self.categoria_rel.nombre if self.categoria_rel else 'General',
            'stock': self.stock,
            'activo': self.activo,
            'favorito': self.favorito,
            'permitir_sin_stock': self.permitir_sin_stock,
            'ventas_totales': self.ventas_totales
        }

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Usuario, int(user_id))

# ─── API REST (Para el Frontend) ─────────────────────────────
@app.route('/api/productos', methods=['GET'])
def get_productos():
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
        query = query.order_by(Producto.precio.asc())
    elif orden == 'precio_desc':
        query = query.order_by(Producto.precio.desc())
    elif orden == 'nombre':
        query = query.order_by(Producto.nombre.asc())
    else:
        query = query.order_by(Producto.id.asc())

    productos = query.all()
    return jsonify({
        "ok": True,
        "total": len(productos),
        "productos": [p.to_dict() for p in productos]
    })

@app.route('/api/productos/<int:producto_id>', methods=['GET'])
def get_producto(producto_id):
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
    data = request.json
    if not data or not isinstance(data, list):
        return jsonify({"ok": False, "mensaje": "Datos inválidos"}), 400
        
    for item in data:
        producto_id = item.get('id')
        qty = item.get('qty', 0)
        if producto_id and qty > 0:
            producto = db.session.get(Producto, producto_id)
            if producto:
                producto.ventas_totales += qty
                if producto.stock >= qty:
                    producto.stock -= qty
                else:
                    producto.stock = 0
    db.session.commit()
    return jsonify({"ok": True, "mensaje": "Venta registrada con éxito"})

# ─── Rutas del Frontend (La Vidriera) ────────────────────────
@app.route('/')
def index():
    destacados = Producto.query.filter_by(favorito=True, activo=1).all()
    # To easily allow template to use p.imagen_url or p.imagen without logic inside the template
    return render_template('index.html', destacados=destacados)

@app.route('/productos')
def productos():
    return render_template('productos.html')

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

@app.route('/nosotros')
def nosotros():
    return render_template('nosotros.html')

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

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

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

    nuevo = Producto(
        nombre=nombre, precio=precio, precio_anterior=precio_anterior, descripcion=descripcion,
        imagen_url=imagen_url, categoria_id=categoria_id, stock=stock,
        favorito=favorito, permitir_sin_stock=permitir_sin_stock
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
    
    precio_str = request.form.get('precio', '0').strip().replace(',', '.')
    try:
        producto.precio = float(precio_str) if precio_str else 0.0
    except ValueError:
        producto.precio = 0.0
        
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
        
    db.session.commit()
    flash('Producto editado correctamente.', 'info')
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/producto/delete/<int:id>', methods=['POST'])
@login_required
def admin_delete_product(id):
    producto = db.session.get(Producto, id)
    if producto:
        producto.activo = 0 # Soft delete
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

    try:
        df = pd.read_excel(file)
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        for index, row in df.iterrows():
            nombre = str(row.get('nombre', '')).strip()
            if not nombre or nombre == 'nan':
                continue
            
            cat_name = str(row.get('categoría', row.get('categoria', 'General'))).strip()
            if cat_name == 'nan' or not cat_name:
                cat_name = 'General'
            
            categoria = Categoria.query.filter(Categoria.nombre.ilike(cat_name)).first()
            if not categoria:
                categoria = Categoria(nombre=cat_name)
                db.session.add(categoria)
                db.session.commit()
            
            precio = 0.0
            try:
                precio = float(row.get('precio', 0))
            except:
                pass
                
            stock = 0
            try:
                stock = int(row.get('stock', 0))
            except:
                pass
                
            img_url = str(row.get('link imagen', row.get('url imagen', ''))).strip()
            if img_url == 'nan':
                img_url = ''
                
            destacado_val = str(row.get('destacado', row.get('favorito', 'NO'))).strip().upper()
            favorito = True if destacado_val == 'SI' else False
            
            sin_stock_val = str(row.get('venta sin stock', 'NO')).strip().upper()
            permitir_sin_stock = True if sin_stock_val == 'SI' else False
            
            prod = Producto.query.filter(Producto.nombre.ilike(nombre)).first()
            if not prod:
                # Si no existe, lo creamos con todos los datos
                prod = Producto(nombre=nombre)
                db.session.add(prod)
                prod.precio = precio
                prod.stock = stock
                prod.categoria_id = categoria.id
                if img_url:
                    prod.imagen_url = img_url
                prod.favorito = favorito
                prod.permitir_sin_stock = permitir_sin_stock
            else:
                # Si existe, actualizamos solo precio, stock y link de imagen
                prod.precio = precio
                prod.stock = stock
                if img_url:
                    prod.imagen_url = img_url
            
        db.session.commit()
        flash('Importación completada con éxito.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error procesando Excel: {str(e)}', 'danger')

    return redirect(url_for('admin_dashboard'))

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
            'Precio': p.precio,
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

def setup_database():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with app.app_context():
        db.create_all()
        
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
