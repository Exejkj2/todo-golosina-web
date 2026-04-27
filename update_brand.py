import os

templates_dir = r'c:\Users\Exequiel\Desktop\TodoGolsoinas WEB 1.0\templates'
public_files = ['index.html', 'productos.html', 'nosotros.html', 'contacto.html', 'detalle.html']
admin_files = ['admin.html', 'admin_categorias.html', 'admin_estadisticas.html']

montserrat_import = '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap" rel="stylesheet"/>'

# Update public files: add Montserrat to existing fonts or before style.css
for filename in public_files:
    path = os.path.join(templates_dir, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Look for fonts.googleapis.com and add Montserrat
        if 'family=Montserrat:wght@800' not in content:
            if 'family=Outfit' in content:
                content = content.replace('family=Outfit', 'family=Montserrat:wght@800&family=Outfit')
            elif 'family=Roboto' in content:
                content = content.replace('family=Roboto', 'family=Montserrat:wght@800&family=Roboto')
            else:
                # Fallback: insert before style.css link
                content = content.replace('<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'style.css\') }}"/>', 
                                          montserrat_import + '\n  <link rel="stylesheet" href="{{ url_for(\'static\', filename=\'style.css\') }}"/>')
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)

# Update admin files: add CSS and font import
admin_css = """
      .tg-brand-name {
        font-family: 'Montserrat', sans-serif;
        font-weight: 800;
        font-size: 1.5rem;
        color: white;
        letter-spacing: -0.02em;
        text-transform: none;
      }
"""

for filename in admin_files:
    path = os.path.join(templates_dir, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Add import
        if 'family=Montserrat:wght@800' not in content:
            if 'family=Roboto' in content:
                content = content.replace('family=Roboto', 'family=Montserrat:wght@800&family=Roboto')
            else:
                content = content.replace('</head>', montserrat_import + '\n  </head>')
        
        # Add CSS to style block
        if '.tg-brand-name' not in content:
            content = content.replace('</style>', admin_css + '    </style>')
        
        # Wrap text in span
        if 'Todo Golosina</h4>' in content:
            content = content.replace('Todo Golosina</h4>', '<span class="tg-brand-name">Todo Golosina</span></h4>')
        elif '><br />Todo Golosina' in content:
            content = content.replace('><br />Todo Golosina', '><br /><span class="tg-brand-name">Todo Golosina</span>')
            
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

print('Templates updated successfully with Montserrat font.')
