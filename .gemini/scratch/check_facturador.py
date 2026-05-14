import re
from collections import Counter

file_path = r'c:\Users\TodoGolosina\Desktop\todo-golosina-web\templates\facturador.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Check for duplicate IDs
ids = re.findall(r'id="([^"]*)"', content)
duplicates = [item for item, count in Counter(ids).items() if count > 1]
print(f"Duplicate IDs: {duplicates}")

# Extract script content
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
for i, script in enumerate(scripts):
    print(f"--- Script {i} ---")
    # Basic brace matching
    open_braces = script.count('{')
    close_braces = script.count('}')
    open_parens = script.count('(')
    close_parens = script.count(')')
    print(f"Braces: {open_braces} open, {close_braces} close")
    print(f"Parens: {open_parens} open, {close_parens} close")
    if open_braces != close_braces:
        print("ERROR: Unbalanced braces!")
    if open_parens != close_parens:
        print("ERROR: Unbalanced parens!")
