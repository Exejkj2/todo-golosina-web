
import re

def check_div_balance(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    open_divs = len(re.findall(r'<div\b', content))
    close_divs = len(re.findall(r'</div\b', content))
    
    print(f"Open DIVs: {open_divs}")
    print(f"Close DIVs: {close_divs}")
    
    if open_divs != close_divs:
        print("ERROR: DIVs are NOT balanced!")
    else:
        print("SUCCESS: DIVs are balanced.")

if __name__ == "__main__":
    check_div_balance('templates/facturador.html')
