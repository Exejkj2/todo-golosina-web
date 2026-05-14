import re

file_path = r'c:\Users\TodoGolosina\Desktop\todo-golosina-web\templates\facturador.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_num = i + 1
    # Very simple regex for tags
    tags = re.findall(r'<(/?div|/?script|/?body|/?html|/?head)(?:\s|>)', line)
    for tag in tags:
        if tag.startswith('/'):
            if not stack:
                print(f"Error: Unexpected closing tag <{tag}> at line {line_num}")
            else:
                last_tag = stack.pop()
                if last_tag != tag[1:]:
                    print(f"Error: Mismatched tags! <{last_tag}> closed by <{tag}> at line {line_num}")
        else:
            stack.append(tag)

if stack:
    print(f"Error: Unclosed tags remaining: {stack}")
else:
    print("All tags balanced!")
