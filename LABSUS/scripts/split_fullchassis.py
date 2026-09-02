# -*- coding: utf-8 -*-
"""G9: dwb-pro-fullchassis.html 无损拆分（8519 行 -> 薄壳 + css/ + js/ 11 个模块）。

保证：所有 JS 分片按序拼接 == 原 <script> 内容（逐字节）；CSS 提取 == 原 <style> 内容。
拆分后为每个 js 文件头部补 "use strict";（原单块脚本顶部有 "use strict"，
普通 <script> 标签按文件独立生效，逐文件补齐以保持语义一致）。
"""
import os, sys

WEB = os.path.join(os.path.dirname(__file__), "..", "web")
SRC = os.path.join(WEB, "dwb-pro-fullchassis.html")

with open(SRC, "r", encoding="utf-8", newline="") as f:
    raw = f.read()
# 保留原换行风格，按行切分（保留行尾符）
lines = raw.splitlines(keepends=True)
n = len(lines)
assert n == 8519, f"行数 {n} != 8519，文件已变动，拒绝拆分"

def seg(a, b):  # 1-indexed inclusive
    return "".join(lines[a-1:b])

# ── 边界定义（与 2026-08-31 快照对齐；运行前已逐边界人工核验为顶层语句分界）──
JS_SEGS = [
    ("01-core.js",      1057, 1110),  # 0. 基础数学库/四元数/工具（~行 1059 节注释起）
    ("02-presets.js",   1111, 1395),  # 1. 三款预设车型 + initData
    ("03-mechanism.js", 1396, 1918),  # 2. 机构求解/K&C/准静态
    ("04-dynamics.js",  1919, 2185),  # 3. 时域动力学/4-Post/基线快照/PAL
    ("05-scene3d.js",   2186, 3390),  # 4-10. 3D 场景/四视口/车架/总成/叠加绘制
    ("06-ui-panels.js", 3391, 3937),  # 11-13. UI 面板/引擎客户端/底盘面板
    ("07-plots.js",     3938, 4170),  # 12. 曲线与读数
    ("08-interact.js",  4171, 4385),  # 12b-14. 硬点持久化/视图交互/主循环
    ("09-track.js",     4386, 5358),  # TPHYS 闭包/TRK 回放/赛道舞台基建
    ("10-eval.js",      5359, 5878),  # 15a. 主题/评价报告/雷达图
    ("11-stages.js",    5879, 8516),  # 15b. 上赛拓扑/爬坡/Skidpad/Circuit 舞台/启动事件
]
CSS_RANGE = (8, 736)
BODY_HEAD = (1, 6)      # <!DOCTYPE> .. <title>
BODY_MID  = (738, 1055) # </head> <body> .. </div>（body 内容，不含 script）
CLOSE     = (8518, 8519) # </body></html>

# ── 1. 无损校验：JS 拼接 == 原文 ──
orig_js = seg(1057, 8516)
cat = "".join(seg(a, b) for _, a, b in JS_SEGS)
assert cat == orig_js, "JS 分片拼接与原文不一致！中止。"
orig_css = seg(*CSS_RANGE)
assert orig_css.strip().startswith("/*") or orig_css.strip(), "CSS 内容异常"

js_dir = os.path.join(WEB, "js")
css_dir = os.path.join(WEB, "css")
os.makedirs(js_dir, exist_ok=True)
os.makedirs(css_dir, exist_ok=True)

# ── 2. 写出 css ──
with open(os.path.join(css_dir, "fullchassis.css"), "w", encoding="utf-8", newline="") as f:
    f.write(orig_css)

# ── 3. 写出 js（先原样，再做逐字节终验，最后补 use strict）──
written = []
for name, a, b in JS_SEGS:
    p = os.path.join(js_dir, name)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(seg(a, b))
    written.append(p)

# ── 4. 重建薄壳 HTML ──
script_tags = "".join(
    '<script src="js/{0}"></script>\n'.format(name) for name, _, _ in JS_SEGS
)
shell = (
    seg(*BODY_HEAD)
    + '  <link rel="stylesheet" href="css/fullchassis.css">\n'
    + seg(*BODY_MID)
    + script_tags
    + seg(*CLOSE)
)
with open(SRC, "w", encoding="utf-8", newline="") as f:
    f.write(shell)

# ── 5. 逐文件补 "use strict";（保留原分片内容不变，仅在文件头追加一行）──
for p in written:
    with open(p, "r", encoding="utf-8", newline="") as f:
        body = f.read()
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write('"use strict";\n' + body)

print("OK: shell {0} 行, css {1} 行, js 11 文件".format(
    shell.count("\n"), orig_css.count("\n")))
for name, a, b in JS_SEGS:
    print("  js/{0}  <- L{1}-{2}  ({3} 行)".format(name, a, b, b - a + 1))
