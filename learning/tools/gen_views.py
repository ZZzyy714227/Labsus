"""第 1 章教学图生成器 —— 从 DEFAULT_DWB_POINTS 真实正交投影计算生成。

用法：python learning/tools/gen_views.py
输出：learning/explainers/figs/ch01_{top,front,side}.svg + stdout 派生量。

投影定义（LABSUS 坐标系 X=外侧 / Y=向前 / Z=上，单位 mm）：
  俯视 top  : 屏幕横 = X, 屏幕纵(上) = Y   —— 两侧（右=定义侧 + 左=镜像）
  前视 front: 屏幕横 = X, 屏幕纵(上) = Z   —— 右角 + 臂延长线交点（瞬心预览，真实计算）
  侧视 side : 屏幕横 = Y, 屏幕纵(上) = Z   —— 右角（+Y 向右）

每个视图两轴同比例（k px/mm），100mm 网格 —— 图上能量尺寸。
"""
from __future__ import annotations

import math
import os
import sys

_ENGINE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "LABSUS", "engine"))
for _p in (os.path.join(_ENGINE, "src"), _ENGINE):        # 与 server.py 同款注入
    if _p not in sys.path:
        sys.path.insert(0, _p)
from src.api.v3service import DEFAULT_DWB_POINTS  # noqa: E402  单一真源

P = {k: (float(v[0]), float(v[1]), float(v[2])) for k, v in DEFAULT_DWB_POINTS.items()}
TIRE = 325.0
OUT = os.path.join(os.path.dirname(__file__), "..", "explainers", "figs")
os.makedirs(OUT, exist_ok=True)

# ── 拓扑连接（传力路径分组，与第 1 章三路径对应）───────────────────────
LINKS = [
    ("LCA",  "b98a4f", [("LCA_F", "LCA_R"), ("LCA_F", "LBJ"), ("LCA_R", "LBJ")]),
    ("UCA",  "c98c65", [("UCA_F", "UCA_R"), ("UCA_F", "UBJ"), ("UCA_R", "UBJ")]),
    ("KNK",  "a66b58", [("LBJ", "UBJ"), ("UBJ", "WC"), ("LBJ", "WC"), ("LBJ", "TRO"), ("UBJ", "TRO")]),
    ("TIE",  "7a8c7e", [("RACK", "TRO")]),
    ("PSR",  "8f988a", [("STRUT_OUT", "STRUT_IN")]),
    ("RCK",  "b9c2c9", [("RCK_AX_A", "STRUT_IN"), ("RCK_AX_A", "RCK_DMP"), ("RCK_AX_A", "RCK_AX_B")]),
    ("DMP",  "d9b98a", [("RCK_DMP", "DMP_BODY")]),
]
BODY_NODES = {"LCA_F", "LCA_R", "UCA_F", "UCA_R", "RCK_AX_A", "RCK_AX_B", "DMP_BODY", "RACK"}
C_FIXED, C_JOINT, C_WC = "#943948", "#e8dcc4", "#8fb0d4"
C_MUT, C_GRID, C_GRID5 = "#7a8595", "#1e2632", "#28313e"
NAME_ZH = {"LCA": "下控制臂", "UCA": "上控制臂", "KNK": "转向节", "TIE": "横拉杆",
           "PSR": "推杆", "RCK": "摇臂", "DMP": "减振器"}


def mirror(pts):
    return {k: (-v[0], v[1], v[2]) for k, v in pts.items()}


def dist(a, b):
    return math.dist(a, b)


def axis_at_y(a, b, y):
    t = (y - a[1]) / (b[1] - a[1])
    return (a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t)


def isect2(p1, d1, p2, d2):
    det = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(det) < 1e-12:
        return None
    t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / det
    return (p1[0] + d1[0] * t, p1[1] + d1[1] * t)


# ── 真实派生量（stdout 打印 + 图上标注）──────────────────────────────
lp = axis_at_y(P["LCA_F"], P["LCA_R"], P["WC"][1])       # 下臂轴线 @ 轮心站位
up = axis_at_y(P["UCA_F"], P["UCA_R"], P["WC"][1])
ic = isect2((lp[0], lp[2]), (P["LBJ"][0] - lp[0], P["LBJ"][2] - lp[2]),
            (up[0], up[2]), (P["UBJ"][0] - up[0], P["UBJ"][2] - up[2]))
cp_z = P["WC"][2] - TIRE                                  # 设计位接地点高度
rc_prev = None
if ic is not None:                                        # RC 高度预览：接地点→IC 连线交中面
    t = (0.0 - P["WC"][0]) / (ic[0] - P["WC"][0])
    rc_prev = 0.0 + (ic[1] - 0.0) * t
FACTS = {
    "LCA 枢轴间距": dist(P["LCA_F"], P["LCA_R"]),
    "UCA 枢轴间距": dist(P["UCA_F"], P["UCA_R"]),
    "LCA 有效臂长(枢轴中点→LBJ)": dist(tuple((a + b) / 2 for a, b in zip(P["LCA_F"], P["LCA_R"])), P["LBJ"]),
    "UCA 有效臂长(枢轴中点→UBJ)": dist(tuple((a + b) / 2 for a, b in zip(P["UCA_F"], P["UCA_R"])), P["UBJ"]),
    "TRO.z 在 LBJ→UBJ 的高度比例": (P["TRO"][2] - P["LBJ"][2]) / (P["UBJ"][2] - P["LBJ"][2]),
    "设计位接地点 z = WC.z − 轮胎半径": cp_z,
    "前视瞬心 IC (x,z) @ 轮心站位": None if ic is None else ic,
    "RC 高度预览（cp→IC 连线交 x=0）": rc_prev,
    "下臂轴侧视倾角(前低后高)": math.degrees(math.atan2(P["LCA_R"][2] - P["LCA_F"][2],
                                                      P["LCA_F"][1] - P["LCA_R"][1])),
}

# ── SVG 基件 ─────────────────────────────────────────────────────────
class View:
    def __init__(self, name, proj, umin, umax, vmin, vmax, k, xlabel, ylabel):
        self.proj, self.k = proj, k
        self.pad, self.lab = 46, 150                       # 左/下留白，右/上标签区
        self.w = int((umax - umin) * k + self.pad + self.lab)
        self.h = int((vmax - vmin) * k + self.pad + 46)
        self.umin, self.vmax = umin, vmax                  # v 轴向上 → 屏幕y翻转
        self.el = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" '
                   f'font-family="Cascadia Mono,Consolas,monospace">']
        self._grid(umin, umax, vmin, vmax)
        self._axes(xlabel, ylabel)

    def px(self, p3):
        u, v = self.proj(p3)
        return (self.pad + (u - self.umin) * self.k,
                self.h - 46 - v * self.k)

    def _grid(self, umin, umax, vmin, vmax):
        n0, n1 = math.floor(umin / 100) * 100, math.ceil(vmax / 100) * 100
        for u in range(n0, int(umax) + 1, 100):
            x = self.pad + (u - self.umin) * self.k
            c = C_GRID5 if u % 500 == 0 else C_GRID
            self.el.append(f'<line x1="{x:.1f}" y1="{self.h-46}" x2="{x:.1f}" y2="{self.h-46-(vmax-vmin)*self.k:.1f}" stroke="{c}" stroke-width="1"/>')
        for v in range(math.floor(vmin / 100) * 100, n1 + 1, 100):
            y = self.h - 46 - v * self.k
            c = C_GRID5 if v % 500 == 0 else C_GRID
            self.el.append(f'<line x1="{self.pad}" y1="{y:.1f}" x2="{self.pad+(umax-umin)*self.k:.1f}" y2="{y:.1f}" stroke="{c}" stroke-width="1"/>')

    def _axes(self, xlabel, ylabel):
        x0, y0 = self.pad, self.h - 46
        self.el.append(f'<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="{C_MUT}"/></marker></defs>')
        self.el.append(f'<line x1="{x0}" y1="{y0}" x2="{x0+40}" y2="{y0}" stroke="{C_MUT}" stroke-width="1.6" marker-end="url(#ar)"/>'
                       f'<text x="{x0+46}" y="{y0+4}" font-size="11" fill="{C_MUT}">{xlabel}</text>')
        self.el.append(f'<line x1="{x0}" y1="{y0}" x2="{x0}" y2="{y0-40}" stroke="{C_MUT}" stroke-width="1.6" marker-end="url(#ar)"/>'
                       f'<text x="{x0+6}" y="{y0-46}" font-size="11" fill="{C_MUT}">{ylabel}</text>')
        self.el.append(f'<text x="{x0-8}" y="{y0+16}" font-size="10" fill="{C_MUT}">0</text>')

    def line(self, a3, b3, color, w=2.5, dash=None, op=1.0):
        x1, y1 = self.px(a3); x2, y2 = self.px(b3)
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.el.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#{color}" stroke-width="{w}"{d} opacity="{op}"/>')

    def seg(self, p2a, p2b, color, w=1.2, dash="4 4"):    # 2D 屏外坐标延长线（直接屏幕系）
        self.el.append(f'<line x1="{p2a[0]:.1f}" y1="{p2a[1]:.1f}" x2="{p2b[0]:.1f}" y2="{p2b[1]:.1f}" stroke="#{color}" stroke-width="{w}" stroke-dasharray="{dash}"/>')

    def node(self, name, p3, dx=7, dy=-7, r=4.5):
        x, y = self.px(p3)
        if name == "WC":
            self.el.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{C_WC}"/>')
        elif name in BODY_NODES:
            self.el.append(f'<rect x="{x-4:.1f}" y="{y-4:.1f}" width="8" height="8" fill="{C_FIXED}"/>')
        else:
            self.el.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="none" stroke="{C_JOINT}" stroke-width="1.8"/>')
        self.el.append(f'<text x="{x+dx:.1f}" y="{y+dy:.1f}" font-size="10.5" fill="#c9c2b2">{name}</text>')

    def note(self, x, y, lines, color=C_MUT, size=10.5, anchor="start"):
        for i, s in enumerate(lines):
            self.el.append(f'<text x="{x}" y="{y + i*14}" font-size="{size}" fill="{color}" text-anchor="{anchor}">{s}</text>')

    def save(self, path):
        self.el.append("</svg>")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(self.el))
        print("written", os.path.relpath(path), f"{self.w}x{self.h}")


# ── 视图 1：俯视（含镜像左角 + 转向输入裂缝标注）──────────────────────
def top():
    L = mirror(P)
    v = View("top", lambda p: (p[0], p[1]), -880, 880, -260, 260, 0.40, "X 外侧 → (mm)", "Y 向前 (mm)")
    for gname, col, pairs in LINKS:                        # 左（镜像，淡虚线）
        for a, b in pairs:
            v.line(L[a], L[b], col, w=2, dash="4 3", op=0.45)
    for gname, col, pairs in LINKS:                        # 右（定义侧）
        for a, b in pairs:
            v.line(P[a], P[b], col)
    for n in P:
        dx, dy = (-58, -7) if n == "RCK_AX_A" else (7, -7)
        v.node(n, P[n], dx, dy)
        if n in ("WC", "TRO"):
            v.node(n, L[n], 7, -7)
    v.note(60, 24, [f"右=定义侧(实线) · 左=镜像 x→−x(虚线) · 网格100mm · "
                    f"轮距={abs(P['WC'][0])*2:.0f}mm"], "#9aa3ad", 10.5)
    # 转向输入：两条候选方向（真实裂缝，第3章审判）
    rx, ry = v.px(P["RACK"])
    v.seg((rx, ry), (rx - 60, ry), "d27886", 1.6, "6 3")
    v.note(rx - 66, ry - 4, ["前端输入: −X(横移)"], "#d27886", 10)
    v.seg((rx, ry), (rx, ry - 60), "8fb0d4", 1.6, "6 3")
    v.note(rx + 6, ry - 52, ["引擎输入: ±Y(纵移)"], "#8fb0d4", 10)
    v.save(os.path.join(OUT, "ch01_top.svg"))


# ── 视图 2：前视（右角 + 计算出的瞬心/RC 预览）────────────────────────
def front():
    v = View("front", lambda p: (p[0], p[2]), -920, 900, -80, 600, 0.42, "X 外侧 → (mm)", "Z 上 (mm)")
    v.line((900, 0, 0), (-920, 0, 0), "4a5568", w=2.5)     # 地面 z=0
    v.line((0, 0, -80), (0, 0, 600), "3a4658", w=1, dash="3 5")  # 中面 x=0
    # 车轮（前视为圆）+ 接地点
    wx, wy = v.px(P["WC"])
    v.el.append(f'<circle cx="{wx:.1f}" cy="{wy:.1f}" r="{TIRE*v.k:.1f}" fill="none" stroke="#8c96a2" stroke-width="2.5"/>')
    cx, cy = v.px((P["WC"][0], P["WC"][1], cp_z))
    v.el.append(f'<rect x="{cx-3:.1f}" y="{cy-3:.1f}" width="6" height="6" fill="#d27886"/>')
    # 臂轴线@轮心站位 → 球铰 的延长线（真实计算交点）
    for gname, col, pairs in LINKS:
        if gname in ("RCK", "DMP", "PSR"):
            continue
        for a, b in pairs:
            v.line(P[a], P[b], col)
    if ic is not None:
        v.line(lp, P["LBJ"], "b98a4f", w=1.1, dash="5 4")
        v.line(up, P["UBJ"], "c98c65", w=1.1, dash="5 4")
        a1, a2 = v.px(lp), v.px((ic[0], P["WC"][1], ic[1]))
        v.seg(a1, a2, "b98a4f", 1.1, "5 4")
        b1, b2 = v.px(up), v.px((ic[0], P["WC"][1], ic[1]))
        v.seg(b1, b2, "c98c65", 1.1, "5 4")
        ix, iy = v.px((ic[0], P["WC"][1], ic[1]))
        v.el.append(f'<circle cx="{ix:.1f}" cy="{iy:.1f}" r="4" fill="#ddae85"/>')
        v.note(ix + 8, iy + 4, [f"IC=({ic[0]:.0f},{ic[1]:.0f}) 前视瞬心"], "#ddae85", 10.5)
        rx, ry = v.px((0, P["WC"][1], rc_prev))
        v.el.append(f'<circle cx="{rx:.1f}" cy="{ry:.1f}" r="4" fill="#9cc4a8"/>')
        c1 = v.px((P["WC"][0], P["WC"][1], cp_z)); c2 = (ix, iy)
        v.seg(c1, c2, "9cc4a8", 1.1, "5 4")
        v.note(rx + 8, ry - 22, [f"RC 高度预览≈{rc_prev:.0f}mm", "(引擎 rc_h@0=55.3, 第5章对账)"], "#9cc4a8", 10.5)
    for n in P:
        if n in ("RCK_AX_A", "RCK_AX_B", "RCK_DMP", "DMP_BODY", "STRUT_IN", "STRUT_OUT"):
            continue                                        # 传动链不在前视主平面，略
        dx, dy = {"LBJ": (10, 16), "WC": (14, -8), "TRO": (10, 14), "LCA_F": (-16, -20),
                  "LCA_R": (8, -16), "UCA_F": (-8, -16), "UCA_R": (8, -14), "UBJ": (10, -6),
                  "RACK": (12, 10)}.get(n, (7, -7))
        v.node(n, P[n], dx, dy)
    v.note(60, 24, [f"上臂短({FACTS['UCA 枢轴间距']:.0f}mm枢轴距/有效臂长{FACTS['UCA 有效臂长(枢轴中点→UBJ)']:.0f}) vs "
                    f"下臂长({FACTS['LCA 枢轴间距']:.0f}/{FACTS['LCA 有效臂长(枢轴中点→LBJ)']:.0f}) · 延长线交出IC(计算值)"], "#9aa3ad", 10.5)
    v.note(60, 38, [f"接地点 z={cp_z:.0f}mm(轮胎微沉,第10章) · TRO高度位于LBJ→UBJ的"
                    f"{FACTS['TRO.z 在 LBJ→UBJ 的高度比例']*100:.0f}%处"], "#9aa3ad", 10.5)
    v.save(os.path.join(OUT, "ch01_front.svg"))


# ── 视图 3：侧视（右角 + 传动链 + 下臂轴倾角）─────────────────────────
def side():
    v = View("side", lambda p: (p[1], p[2]), -260, 300, -80, 600, 0.85, "Y 向前 → (mm)", "Z 上 (mm)")
    v.line((300, 0, 0), (-260, 0, 0), "4a5568", w=2.5)
    wx, wy = v.px(P["WC"])
    v.el.append(f'<line x1="{wx-4:.1f}" y1="{wy:.1f}" x2="{wx+4:.1f}" y2="{wy:.1f}" stroke="#8c96a2" stroke-width="4"/>')
    cxp = (0.0, P["WC"][1], P["WC"][2] - TIRE)             # 接地点（3D）
    gx, gy = v.px(cxp)
    v.el.append(f'<line x1="{wx:.1f}" y1="{wy:.1f}" x2="{gx:.1f}" y2="{gy:.1f}" stroke="#8c96a2" stroke-width="2" opacity=".6"/>')
    for gname, col, pairs in LINKS:
        for a, b in pairs:
            v.line(P[a], P[b], col)
    ang = FACTS["下臂轴侧视倾角(前低后高)"]
    ext = axis_at_y(P["LCA_F"], P["LCA_R"], -400)
    v.line(P["LCA_F"], ext, "b98a4f", w=1.1, dash="5 4")
    ex, ey = v.px(ext)
    v.note(ex - 10, ey, [f"下臂轴倾角 {ang:.2f}°(前低后高)"], "#b98a4f", 10, "end")
    for n in P:
        dx, dy = {"LCA_F": (-56, 18), "LCA_R": (8, 14), "LBJ": (-20, -14), "UCA_F": (-48, -10),
                  "UCA_R": (8, -14), "UBJ": (-30, 8), "WC": (10, 4), "TRO": (10, 14),
                  "RACK": (10, 16), "STRUT_OUT": (12, 0), "STRUT_IN": (8, -10),
                  "RCK_AX_A": (-30, -14), "RCK_DMP": (-20, 16), "DMP_BODY": (8, -8),
                  "RCK_AX_B": (10, -12)}.get(n, (7, -7))
        v.node(n, P[n], dx, dy)
    v.note(60, 24, ["垂向弹性路径: WC→转向节→STRUT_OUT→推杆→STRUT_IN→摇臂(绕RCK_AX)→RCK_DMP→减振器→DMP_BODY",
                    "侧视传动链各环节均按真实坐标投影 · 网格100mm"], "#9aa3ad", 10.5)
    v.save(os.path.join(OUT, "ch01_side.svg"))


if __name__ == "__main__":
    top(); front(); side()
    print("\n── 真实派生量（全部由 DEFAULT_DWB_POINTS 计算）──")
    for k_, v_ in FACTS.items():
        if v_ is not None:
            print(f"  {k_}: {v_:.1f}" if isinstance(v_, float) else f"  {k_}: {v_}")
