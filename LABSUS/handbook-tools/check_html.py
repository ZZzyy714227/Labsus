import sys
from pathlib import Path

html = Path(r'c:\Users\zzy\Desktop\New_suspension\LABSUS\test_anthropic.html')
if not html.exists():
    print("HTML not found")
    sys.exit(1)

text = html.read_text(encoding='utf-8')
print(f"HTML size: {html.stat().st_size / 1024:.1f} KB")
print("Cover block present:", '<div class="cover">' in text)
print("h2 count:", text.count('<h2'))
print("h3 count:", text.count('<h3'))
print("tag count:", text.count('class="tag'))

body_start = text.find('<body')
print("\n--- Body Beginning (first 1000 chars) ---")
print(text[body_start:body_start+1000])
