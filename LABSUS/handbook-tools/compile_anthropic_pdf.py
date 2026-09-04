import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import fitz

# Add pipeline script directory to path
skill_scripts = Path(r"C:\Users\zzy\Desktop\车辆工程学习笔记\.claude\skills\video-study-notes\scripts")
sys.path.insert(0, str(skill_scripts))
from pipeline import NOTE_CSS, PANDOC, _find_edge, _polish_html, _strip_img_fences

def fast_stamp_pdf(pdf_path: Path):
    doc = fitz.open(pdf_path)
    title = "车辆工程 · 全车底盘悬架力学与动力学工程全书"
    W, H = doc[0].rect.width, doc[0].rect.height
    y_line = H - 42
    line_c, ink_c = (0.80, 0.73, 0.65), (0.46, 0.41, 0.36)
    text = f"{title} · 车辆工程学习笔记"

    for idx, page in enumerate(doc):
        if idx == 0:
            continue  # 独立封面跳过页脚盖印
        page.draw_line(fitz.Point(40, y_line), fitz.Point(W - 40, y_line), color=line_c, width=0.6)
        page.insert_textbox(fitz.Rect(40, y_line + 3, W - 40, y_line + 18), text, fontsize=9.0, fontname="china-s", color=ink_c, align=fitz.TEXT_ALIGN_CENTER)

    tmp = pdf_path.with_suffix(".__stamped__.pdf")
    doc.save(str(tmp), incremental=False)
    doc.close()
    
    success = False
    for _ in range(5):
        try:
            if pdf_path.exists():
                pdf_path.unlink()
            tmp.replace(pdf_path)
            success = True
            break
        except Exception:
            time.sleep(0.5)
            
    if not success:
        fallback_pdf = pdf_path.parent / "全车底盘悬架力学与动力学工程全书.pdf"
        shutil.copy2(tmp, fallback_pdf)
        tmp.unlink(missing_ok=True)

def export_anthropic_pdf(md_path: Path, out_path: Path):
    md = md_path.resolve()
    out = out_path.resolve()
    
    _strip_img_fences(md)
    edge = _find_edge()
    if not edge:
        sys.exit("❌ 未找到 Edge 打印引擎")
        
    tmpdir = Path(tempfile.gettempdir()).resolve()
    html = tmpdir / f"_note_{md.stem}.html"
    style = tmpdir / f"_note_{md.stem}.style.html"
    edge_profile = tmpdir / f"_edge_pdf_{md.stem}"
    
    # Custom Full-Width Super-Readable Anthropic CSS
    # Typography: 中文宋体 (SimSun/Songti SC)，英文和数字 Times New Roman (新罗马体)，字号放大至 13pt
    enhanced_css = """
<style>
:root {
  --clay: #CC785C;
  --clay-deep: #9E5A41;
  --clay-tint: #F3EBE1;
  --cream: #FBF6EF;
  --paper: #FFFFFF;
  --ink: #2A2420;
  --ink-soft: #5C524B;
  --line: #E7DCD0;
  /* 英文与数字优先匹配 Times New Roman，中文字符回退至宋体 */
  --font-main: "Times New Roman", "SimSun", "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", "STSong", serif;
  --mono: "JetBrains Mono", Consolas, "Courier New", monospace;
}

* { 
  -webkit-print-color-adjust: exact !important; 
  print-color-adjust: exact !important; 
  box-sizing: border-box; 
}

/* 彻底清除 PDF 打印时的所有滚动条，严禁使用 * { overflow: visible } 避免触发 Chromium 全局缩小 */
::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

table {
  table-layout: fixed !important;
  width: 100% !important;
  max-width: 100% !important;
  word-break: break-word !important;
}

pre, code {
  white-space: pre-wrap !important;
  word-break: break-all !important;
  max-width: 100% !important;
}

math {
  max-width: 100% !important;
}
math[display="block"] {
  max-width: 100% !important;
  overflow-x: hidden !important;
}
mtable {
  max-width: 100% !important;
}

@page {
  size: A4;
  margin: 16mm 16mm 20mm 16mm;
  background-color: #FBF6EF;
}

html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  background-color: #FBF6EF !important;
}

body {
  font-family: var(--font-main);
  font-size: 13pt;
  line-height: 1.95;
  color: var(--ink);
  background: var(--cream);
  padding-bottom: 8mm;
  -webkit-font-smoothing: antialiased;
}

p { margin: 0.85em 0; font-size: 13pt; line-height: 1.95; }

h1, h2, h3, h4 { font-family: var(--font-main); color: var(--ink); font-weight: 600; width: 100%; }
h1 { font-size: 26pt; line-height: 1.28; margin: 0 0 0.45em; page-break-before: always; }
h1:first-of-type { page-break-before: avoid !important; }
h2 { font-size: 18.5pt; margin: 1.7em 0 0.55em; padding: 0 0 8px; border-bottom: 2px solid var(--line); page-break-after: avoid; }
h2::before { content: ""; display: inline-block; width: 7px; height: 0.95em; background: var(--clay); border-radius: 3.5px; margin-right: 10px; vertical-align: -2px; }
h3 { font-size: 15pt; margin: 1.4em 0 0.45em; page-break-after: avoid; color: var(--clay-deep); }
h4 { font-size: 13pt; margin: 1.1em 0 0.35em; color: var(--ink); }

/* ===== 独立封面整页布局 ===== */
.cover-page {
  page-break-after: always !important;
  page-break-before: avoid !important;
  page-break-inside: avoid !important;
  margin: 0 !important;
  padding: 0 !important;
}
.cover-page .cover {
  margin: 0 0 3mm 0 !important;
  padding: 0 0 8px 0 !important;
  border-bottom: 2px solid #CC785C !important;
  page-break-after: avoid !important;
  text-align: center !important;
}
.cover-page .cover h1 {
  font-size: 25pt !important;
  font-weight: bold !important;
  text-align: center !important;
  margin: 0 0 5px 0 !important;
  color: #2A2420 !important;
  line-height: 1.25 !important;
}
.cover-page .cover blockquote {
  border: none !important;
  background: none !important;
  padding: 0 !important;
  margin: 0 !important;
  font-size: 11.5pt !important;
  color: #9E5A41 !important;
  text-align: center !important;
  line-height: 1.6 !important;
}
.cover-page figure {
  margin: 5mm 0 2mm 0 !important;
  padding: 0 !important;
  text-align: center !important;
  page-break-inside: avoid !important;
}
.cover-page figure img {
  width: 350px !important;
  height: 466px !important;
  max-width: 95% !important;
  object-fit: contain !important;
  border-radius: 8px !important;
  border: 1.5px solid #E7DCD0 !important;
  box-shadow: 0 4px 16px rgba(74,30,19,0.08) !important;
  margin: 0 auto !important;
  display: block !important;
}
.cover-page figure figcaption {
  font-size: 9pt !important;
  color: #5C524B !important;
  text-align: center !important;
  margin-top: 2.5mm !important;
}
.cover-page blockquote.cover-author-card {
  margin: 14mm 0 0 0 !important;
  background: #F3EBE1 !important;
  border-left: 5px solid #CC785C !important;
  border-radius: 8px !important;
  padding: 12px 20px !important;
  font-size: 11pt !important;
  line-height: 1.85 !important;
  box-shadow: 0 2px 10px rgba(74,30,19,0.05) !important;
  color: #2A2420 !important;
}
.cover-page blockquote.cover-author-card p {
  margin: 0 !important;
  font-size: 11pt !important;
  line-height: 1.85 !important;
}
.cover-page blockquote.cover-author-card strong {
  color: #9E5A41 !important;
  font-size: 11.5pt !important;
}

blockquote {
  border-left: 3.5px solid var(--clay);
  background: var(--clay-tint);
  border-radius: 0 10px 10px 0;
  margin: 1.1em 0;
  padding: 10px 18px;
  font-size: 12pt;
  line-height: 1.88;
}
ul, ol { padding-left: 1.6em; margin: 0.8em 0; }
li { margin: 0.35em 0; font-size: 12.5pt; line-height: 1.9; }
li::marker { color: var(--clay); font-weight: bold; }

/* ===== 表格：自适应满版，高对比度表头 === */
table {
  table-layout: auto !important;
  width: 100% !important;
  border-collapse: separate;
  border-spacing: 0;
  margin: 1.3em 0;
  font-size: 11.5pt;
  line-height: 1.75;
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 8px;
}
colgroup, col { width: auto !important; }
thead, th { background-color: #EBD9CE !important; }
th { color: #4A1E13 !important; font-weight: 700; font-size: 11.5pt; padding: 10px 14px; border-bottom: 2px solid var(--clay) !important; text-align: left; }
td { padding: 9px 14px; border-top: 1px solid var(--line); vertical-align: top; font-size: 11.5pt; }
tr:nth-child(even) td { background-color: #F8F2EC !important; }

/* ===== 代码块：深色底与亮色字 === */
div.sourceCode, pre, pre.sourceCode {
  background-color: #25201D !important;
  color: #F7EFE8 !important;
  padding: 14px 18px;
  border-radius: 8px;
  font-size: 10.5pt;
  line-height: 1.7;
  margin: 1.2em 0;
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
}
code { font-family: var(--mono); font-size: 10.5pt; background: #F1E8DF; padding: 1.5px 5.5px; border-radius: 4px; border: 1px solid var(--line); color: var(--ink); }
pre code, pre.sourceCode code { background: none !important; border: none; padding: 0; color: inherit; font-size: 10.5pt; }

/* Pandoc 语法高亮深色适配 */
.sourceCode .kw { color: #F28C28; font-weight: bold; }
.sourceCode .dt { color: #F28C28; }
.sourceCode .st { color: #A8C776; }
.sourceCode .co { color: #8C8C8C; font-style: italic; }
.sourceCode .dv { color: #68B0CC; }
.sourceCode .fu { color: #E8C06E; }
.sourceCode .op { color: #F7EFE8; }
.sourceCode .va { color: #F7EFE8; }

/* ===== MathML 公式放大 === */
math { font-size: 1.25em !important; line-height: 1.6; }
.math.display, div.math.display, p > math[display="block"] {
  font-size: 1.28em !important;
  margin: 1.2em 0 !important;
  padding: 0.35em 0;
  text-align: center;
  white-space: normal !important;
}
math mtable { font-size: 1.18em !important; }

strong { color: var(--clay-deep); font-weight: 700; }
em { color: var(--ink); font-style: italic; }
hr { border: none; border-top: 1.5px solid var(--line); margin: 1.7em 0; }

.tag { display: inline-block; font-size: 9.5pt; font-weight: 600; padding: 2.5px 10px; border-radius: 999px; margin: 0 4px; vertical-align: 1.5px; }
.tag-qz { background: #F3EBE1; color: #9E5A41; border: 1px solid #E8DCD0; }
.tag-dz { background: #F0D9CC; color: #9E5A41; border: 1px solid #E0C7B8; }
.tag-zj { background: #EAE6DF; color: #5C524B; border: 1px solid #D8CFC4; }
.tag-tz { background: #F2E7C9; color: #927117; border: 1px solid #E0D3A8; }
.tag-cz { background: #EBD3C7; color: #A23E22; border: 1px solid #DCBAA8; }
.tag-tl { background: #ECD9C9; color: #B5673A; border: 1px solid #DFC4B0; }
.tag-ys { background: #F3EBE1; color: #9E5A41; border: 1px solid #E8DCD0; }
.tag-al { background: #F3DCDA; color: #B0402E; border: 1px solid #E8BDB8; }
.tag-ks { background: #ECE3D2; color: #8A6D3B; border: 1px solid #D8C7A8; }
</style>
    """
    
    style.write_text(enhanced_css, encoding="utf-8")
    
    cover_img_src = md.parent / "cover_illustration_vertical.jpg"
    dst_img = tmpdir / "cover_illustration_vertical.jpg"
    if cover_img_src.exists() and not dst_img.exists():
        try:
            shutil.copy2(cover_img_src, dst_img)
        except Exception:
            pass
    
    # Run Pandoc with espresso dark theme highlighting
    cmd = [
        PANDOC, "-s", "-H", str(style), "--embed-resources", "--mathml",
        "--highlight-style", "espresso", 
        "--resource-path", str(md.parent), "-o", str(html), str(md)
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0 or not html.exists():
        sys.exit(f"❌ Pandoc 失败: {r.stderr[-400:]}")
        
    raw_html = html.read_text(encoding="utf-8")
    polished_html = _polish_html(raw_html)
    
    pat_cover = r'(<div class="cover">.*?</div>\s*<figure>.*?</figure>\s*)<blockquote>(.*?)</blockquote>'
    m_cover = re.search(pat_cover, polished_html, flags=re.S)
    print(f"=== COVER REGEX MATCHED: {bool(m_cover)} ===")
    if m_cover:
        wrapped_cover = f'<div class="cover-page">\n{m_cover.group(1)}<blockquote class="cover-author-card">{m_cover.group(2)}</blockquote>\n</div>'
        polished_html = polished_html[:m_cover.start()] + wrapped_cover + polished_html[m_cover.end():]
        print(f"=== INJECTED COVER PAGE: {len(wrapped_cover)} bytes ===")
        
    html.write_text(polished_html, encoding="utf-8")
    
    raw_pdf = tmpdir / f"_raw_{md.stem}.pdf"
    shutil.rmtree(edge_profile, ignore_errors=True)
    pdf_cmd = [
        edge, "--headless=new", "--disable-gpu",
        "--no-pdf-header-footer",
        f"--user-data-dir={edge_profile}",
        f"--print-to-pdf={raw_pdf}",
        html.resolve().as_uri()
    ]
    pr = subprocess.run(pdf_cmd, capture_output=True, text=True, encoding="utf-8", timeout=600)
    
    fast_stamp_pdf(raw_pdf)
    
    success = False
    for _ in range(5):
        try:
            if out.exists():
                out.unlink()
            shutil.copy2(raw_pdf, out)
            success = True
            break
        except Exception:
            time.sleep(0.5)
            
    final_target = out if success else (out.parent / "全车底盘悬架力学与动力学工程全书.pdf")
    if not success:
        shutil.copy2(raw_pdf, final_target)
    
    style.unlink(missing_ok=True)
    html.unlink(missing_ok=True)
    raw_pdf.unlink(missing_ok=True)
    shutil.rmtree(edge_profile, ignore_errors=True)
    size_mb = final_target.stat().st_size / (1024 * 1024)
    print(f"🎉 独立封面配图+独立目录高精 PDF 导出成功: {final_target} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    md_in = Path(r"c:\Users\zzy\Desktop\New_suspension\LABSUS\handbook\全车底盘悬架力学与动力学工程全书.md")
    pdf_out = Path(r"c:\Users\zzy\Desktop\New_suspension\LABSUS\全车底盘悬架力学与动力学工程全书.pdf")
    export_anthropic_pdf(md_in, pdf_out)
