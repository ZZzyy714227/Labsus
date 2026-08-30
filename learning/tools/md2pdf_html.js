#!/usr/bin/env node
/* 全链手册 Markdown → HTML（纯 SVG 公式内联，供 weasyprint 离线转 PDF）
 *
 * 依赖 mathjax-full（临时目录安装，不污染仓库）：
 *   npm install --no-save --prefix %TEMP%/md2pdf mathjax-full@3
 *
 * usage: node md2pdf_html.js <in.md> <out.html> [mathjax_dir]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const src = process.argv[2];
const out = process.argv[3];
const mjDir = process.argv[4] || path.join(os.tmpdir(), 'md2pdf', 'node_modules', 'mathjax-full');
if (!src || !out) { console.error('usage: md2pdf_html.js <in.md> <out.html>'); process.exit(1); }

const md = fs.readFileSync(src, 'utf8');

// ── MathJax SVG 渲染器 ──
const { mathjax } = require(path.join(mjDir, 'js', 'mathjax.js'));
const { TeX } = require(path.join(mjDir, 'js', 'input', 'tex.js'));
const { SVG } = require(path.join(mjDir, 'js', 'output', 'svg.js'));
const { liteAdaptor } = require(path.join(mjDir, 'js', 'adaptors', 'liteAdaptor.js'));
const { RegisterHTMLHandler } = require(path.join(mjDir, 'js', 'handlers', 'html.js'));
const { AllPackages } = require(path.join(mjDir, 'js', 'input', 'tex', 'AllPackages.js'));

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'local' });
const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

function renderTeX(texSrc, display) {
  try {
    const node = doc.convert(texSrc, { display });
    const html = adaptor.outerHTML(node);
    // R-0830-5 修复：merror 检测——MathJax 对语法错误输出 merror 而【不抛异常】，
    // 旧版只 catch 异常导致初检"渲染失败=0"假阴性（实际渲染成黑条）。
    if (html.includes('data-mjx-error') || html.includes('merror')) {
      const err = (html.match(/data-mjx-error="([^"]*)"/) || [])[1] || 'unknown';
      console.error(`  [公式错误] ${err} :: ${texSrc.slice(0, 60)}`);
      process.exitCode = 2;   // 标记失败（主流程末尾检查）
      errors.push(err + ' @ ' + texSrc.slice(0, 80));
    }
    return html;
  } catch (e) {
    console.error(`  [公式抛出] ${e.message} :: ${texSrc.slice(0, 60)}`);
    process.exitCode = 2;
    errors.push(e.message + ' @ ' + texSrc.slice(0, 80));
    return `<span style="color:#f85149">[公式渲染失败: ${texSrc}]</span>`;
  }
}
const errors = [];

// ── Markdown 结构转换（够用方案：标题/表格/列表/引用/代码/段落）──
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function inline(s) {
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\$([^$\n]+)\$/g, (_, q) => renderTeX(q.trim(), false));
  return s;
}

const lines = md.split('\n');
const html = [];
let tableRows = [], inList = null, inQuote = false;

function flushTable() {
  if (!tableRows.length) return;
  const bodyStart = (tableRows.length > 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(tableRows[1])) ? 2 : 1;
  let h = '<table><thead><tr>';
  tableRows[0].split('|').filter((c, i, a) => !(i === 0 && c.trim() === '')).forEach(c => h += '<th>' + inline(c.trim()) + '</th>');
  h += '</tr></thead><tbody>';
  for (let i = bodyStart; i < tableRows.length; i++) {
    const cells = tableRows[i].split('|').filter((c, idx, arr) => !(idx === 0 && c.trim() === ''));
    h += '<tr>';
    cells.forEach(c => h += '<td>' + inline(c.trim()) + '</td>');
    h += '</tr>';
  }
  h += '</tbody></table>';
  html.push(h);
  tableRows = [];
}

for (const raw of lines) {
  const line = raw.replace(/\r$/, '');
  const t = line.trim();
  if (t.startsWith('|')) { tableRows.push(t); continue; }
  if (tableRows.length) { flushTable(); }
  if (t.startsWith('```')) { html.push('<pre>' + esc(t) + '</pre>'); continue; }
  let m = t.match(/^(#{1,6})\s+(.*)$/);
  if (m) {
    const lv = m[1].length;
    html.push(lv === 1 ? `<h1>${inline(m[2])}</h1>` : lv === 2 ? `<h2>${inline(m[2])}</h2>` : `<h3>${inline(m[2])}</h3>`);
    continue;
  }
  m = t.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (m) {
    const bullet = m[2] === '-' || m[2] === '*';
    if (inList !== bullet) {
      if (inList !== null) html.push(bullet ? '</ol>' : '</ul>');
      html.push(bullet ? '<ul>' : '<ol>');
      inList = bullet;
    }
    html.push('<li>' + inline(m[3]) + '</li>');
    continue;
  }
  if (inList !== null) { html.push(inList ? '</ul>' : '</ol>'); inList = null; }
  if (t.startsWith('>')) {
    if (!inQuote) { html.push('<blockquote>'); inQuote = true; }
    html.push(inline(t.slice(1).trim()));
    continue;
  }
  if (inQuote) { html.push('</blockquote>'); inQuote = false; }
  if (/^-{3,}$/.test(t)) { html.push('<hr>'); continue; }
  if (t === '') continue;
  m = t.match(/^\$\$(.+)\$\$$/);
  if (m) { html.push('<div class="math-block">' + renderTeX(m[1].trim(), true) + '</div>'); continue; }
  html.push('<p>' + inline(line) + '</p>');
}
if (tableRows.length) flushTable();
if (inList !== null) html.push(inList ? '</ul>' : '</ol>');
if (inQuote) html.push('</blockquote>');

const body = html.join('\n');
const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<style>
body{max-width:900px;margin:0 auto;padding:36px 28px;font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.75;color:#1f2328;background:#fff}
h1{font-size:25px;border-bottom:3px solid #0969da;padding-bottom:10px;color:#000}
h2{font-size:18px;color:#0969da;border-left:4px solid #0969da;padding-left:10px;margin-top:30px}
h3{font-size:15px;color:#24292f}
code{background:#f3f4f6;padding:1px 5px;border-radius:4px;color:#cf222e;font-size:0.88em;font-family:"Cascadia Code",Consolas,monospace}
pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow-x:auto;border:1px solid #d8dee4}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}
th,td{padding:8px 12px;text-align:left;border:1px solid #d8dee4}
th{background:#f6f8fa;font-weight:600}
blockquote{border-left:4px solid #bf8700;background:#fff8e5;padding:8px 14px;margin:12px 0;border-radius:0 6px 6px 0;color:#4a3a00}
hr{border:none;border-top:2px solid #d8dee4;margin:22px 0}
.math-block{text-align:center;margin:10px 0}
mjx-container{vertical-align:middle}
@media print{body{padding:0}table,pre,blockquote{page-break-inside:avoid}h1,h2{page-break-after:avoid}}
</style></head><body>
${body}
</body></html>`;
fs.writeFileSync(out, page);
if (errors.length) {
  console.error(`FAIL: ${errors.length} 个公式渲染错误，HTML 已生成但请勿使用：`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(2);
}
console.log('OK: ' + path.basename(out) + ' 生成（' + body.length + ' bytes body，公式全部渲染成功）');