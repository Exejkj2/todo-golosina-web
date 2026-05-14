import ast

def check_duplicate_kwargs(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        tree = ast.parse(f.read())
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            keywords = [k.arg for k in node.keywords if k.arg is not None]
            if len(keywords) != len(set(keywords)):
                duplicates = [k for k in set(keywords) if keywords.count(k) > 1]
                print(f"Call at line {node.lineno}: Duplicated keyword arguments: {duplicates}")

if __name__ == "__main__":
    check_duplicate_kwargs('app.py')
