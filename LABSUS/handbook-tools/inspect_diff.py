import tempfile, subprocess, re, sys
from pathlib import Path

skill_scripts = Path(r"C:\Users\zzy\Desktop\车辆工程学习笔记\.claude\skills\video-study-notes\scripts")
sys.path.insert(0, str(skill_scripts))
# 2026-09-04：脚本自仓库根迁入 handbook-tools/，补上自身目录以便定位同伴脚本
_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))
from pipeline import NOTE_CSS, PANDOC, _polish_html

tmpdir = Path(tempfile.gettempdir()).resolve()
md_full = Path(r"c:\Users\zzy\Desktop\New_suspension\LABSUS\handbook\全车底盘悬架力学与动力学工程全书.md")

# Let's inspect compile_anthropic_pdf
import compile_anthropic_pdf

# Run export on 50 lines
md_50 = tmpdir / "debug_50.md"
md_50.write_text('\n'.join(md_full.read_text(encoding="utf-8").splitlines()[:50]), encoding="utf-8")
pdf_50 = tmpdir / "debug_50.pdf"

# We want to see the HTML before Edge renders it for BOTH!
# Let's write a hook or run Pandoc directly
style = tmpdir / "debug_style.html"
# Extract enhanced_css by reading compile_anthropic_pdf.py
txt = (_here / "compile_anthropic_pdf.py").read_text(encoding="utf-8")
s_idx = txt.find('enhanced_css = f"""')
e_idx = txt.find('style.write_text(enhanced_css', s_idx)
scope = {"NOTE_CSS": NOTE_CSS}
exec(txt[s_idx:e_idx], scope)
style.write_text(scope["enhanced_css"], encoding="utf-8")

# Convert md_50
html_50 = tmpdir / "debug_50.html"
subprocess.run([PANDOC, "-s", "-H", str(style), "--embed-resources", "--mathml", "--highlight-style", "espresso", "--resource-path", str(md_full.parent), "-o", str(html_50), str(md_50)], check=True)
p_50 = _polish_html(html_50.read_text(encoding="utf-8"))
pat_cover = r'(<div class="cover">.*?</div>\s*<figure>.*?</figure>\s*)<blockquote>(.*?)</blockquote>'
m = re.search(pat_cover, p_50, flags=re.S)
if m:
    p_50 = p_50[:m.start()] + f'<div class="cover-page">\n{m.group(1)}<blockquote class="cover-author-card">{m.group(2)}</blockquote>\n</div>' + p_50[m.end():]
html_50.write_text(p_50, encoding="utf-8")

# Convert md_full
html_full = tmpdir / "debug_full.html"
subprocess.run([PANDOC, "-s", "-H", str(style), "--embed-resources", "--mathml", "--highlight-style", "espresso", "--resource-path", str(md_full.parent), "-o", str(html_full), str(md_full)], check=True)
p_full = _polish_html(html_full.read_text(encoding="utf-8"))
m_f = re.search(pat_cover, p_full, flags=re.S)
if m_f:
    p_full = p_full[:m_f.start()] + f'<div class="cover-page">\n{m_f.group(1)}<blockquote class="cover-author-card">{m_f.group(2)}</blockquote>\n</div>' + p_full[m_f.end():]
html_full.write_text(p_full, encoding="utf-8")

print("Saved debug_50.html and debug_full.html!")

# Now check the first 2500 chars of body for both:
b50 = html_50.read_text(encoding="utf-8")
bfull = html_full.read_text(encoding="utf-8")

pos_b50 = b50.find('<div class="cover-page">')
pos_bfull = bfull.find('<div class="cover-page">')
print(f"cover-page pos 50: {pos_b50}, full: {pos_bfull}")

print("=== 50 COVER-PAGE ===")
print(b50[pos_b50:pos_b50+800])
print("=== FULL COVER-PAGE ===")
print(bfull[pos_bfull:pos_bfull+800])
