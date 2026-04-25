import os

replacements = {
    "{{ url_for('static', filename='style.css') }}": "style.css",
    "{{ url_for('static', filename='productos.css') }}": "productos.css",
    "{{ url_for('static', filename='cart.js') }}": "cart.js",
    "{{ url_for('static', filename='productos.js') }}": "productos.js",
    "{{ url_for('index') }}": "index.html",
    "{{ url_for('productos') }}": "productos.html",
    "{{ url_for('nosotros') }}": "nosotros.html",
    "{{ url_for('contacto') }}": "contacto.html",
    "{{ url_for('login') }}": "login.html"
}

files = ['contacto.html', 'productos.html', 'nosotros.html']

for file in files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        for old, new in replacements.items():
            content = content.replace(old, new)
            
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

print("Replacement complete.")
