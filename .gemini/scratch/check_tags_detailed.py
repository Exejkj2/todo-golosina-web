import re

file_path = r'c:\Users\TodoGolosina\Desktop\todo-golosina-web\templates\facturador.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_num = i + 1
    tags = re.findall(r'<(/?div|/?script|/?body|/?html|/?head)(?:\s|>)', line)
    for tag in tags:
        if tag.startswith('/'):
            if not stack:
                print(f"Error: Unexpected closing tag <{tag}> at line {line_num}")
            else:
                last_tag, start_line = stack.pop()
                if last_tag != tag[1:]:
                    print(f"Error: Mismatched tags! <{last_tag}> from line {start_line} closed by <{tag}> at line {line_num}")
                    # Push back the mismatched tag to keep track? No, just report.
        else:
            stack.append((tag, line_num))

if stack:
    print(f"Error: Unclosed tags remaining:")
    for tag, line in stack:
        print(f"  <{tag}> from line {line}")
else:
    print("All tags balanced!")
