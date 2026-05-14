
import re

with open(r'c:\Users\TodoGolosina\Desktop\todo-golosina-web\templates\facturador.html', 'r', encoding='utf-8') as f:
    content = f.read()

div_opens = len(re.findall(r'<div\b', content))
div_closes = len(re.findall(r'</div>', content))

print(f"Divs abiertos: {div_opens}")
print(f"Divs cerrados: {div_closes}")

# Check specific sections if possible
# But simpler: just count.
