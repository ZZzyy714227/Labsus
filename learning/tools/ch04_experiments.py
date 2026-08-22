# -*- coding: utf-8 -*-
"""第 4 章数值实验：GS 投影复现 / 牛顿二次收敛 / TRF 实测 / 热启动收益。"""
import sys, os, math
sys.path.insert(0, os.path.join(os.getcwd(), "src")); sys.path.insert(0, os.getcwd())
import numpy as np
from src.api.v3service import _new_mech, DEFAULT_DWB_POINTS
from src.solver.mechanism.solver import solve_pose, residual, _build_residual, _STATE_IDS, _KNUCKLE_IDS

TRAVEL = 30.0

# ── A) 朴素逐点高斯-赛德尔投影（历史上失败的路线）──────────────────
def gs_solve(m, travel, rack, iters=300):
    hist = []
    nodes = m.nodes
    # 预计算铰链圆常数（设计位）
    hinges = []
    for cl in m.axis_clusters:
        if cl.kind != "hinge":
            continue
        a0 = nodes[cl.axA].p0; b0 = nodes[cl.axB].p0
        u = (b0 - a0) / np.linalg.norm(b0 - a0)
        for mem in cl.members:
            p0 = nodes[mem].p0
            axial0 = float(np.dot(p0 - a0, u))
            rad0 = (p0 - a0) - u * axial0
            hinges.append((mem, a0, u, axial0, float(np.linalg.norm(rad0))))
    # 转向节两两设计距离
    pair = [(i, j) for k, i in enumerate(_KNUCKLE_IDS) for j in _KNUCKLE_IDS[k + 1:]]
    d0 = {(i, j): float(np.linalg.norm(nodes[i].p0 - nodes[j].p0)) for i, j in pair}
    tieL = None
    for lk in m.links:
        if lk.id == "TIE":
            tieL = (lk.a, lk.b, lk.L0)

    for it in range(iters):
        # 驱动（精确）
        nodes["FL1"].pos[:] = m.steer_anchor + rack * m.steer_axis
        nodes[m.wheel].pos[2] = nodes[m.wheel].p0[2] + travel
        # 铰链圆：投到最近圆点
        for mem, a0, u, axial0, r in hinges:
            p = nodes[mem].pos
            d = p - a0
            ax = float(np.dot(d, u))
            rad = d - u * ax
            rn = float(np.linalg.norm(rad))
            if rn > 1e-12:
                p[:] = a0 + u * axial0 + (rad / rn) * r
        # 二力杆：外点投到球面（FL1 已驱动固定）
        ta, tb, L = tieL
        v = nodes[ta].pos - nodes[tb].pos
        vn = np.linalg.norm(v)
        if vn > 1e-12:
            nodes[ta].pos[:] = nodes[tb].pos + (v / vn) * L
        # 转向节两两定长：PBD 等权分配
        for i, j in pair:
            pi, pj = nodes[i].pos, nodes[j].pos
            v = pj - pi
            d = np.linalg.norm(v)
            if d > 1e-12:
                corr = (d - d0[(i, j)]) / d * 0.5
                pi += v * corr
                pj -= v * corr
        hist.append(residual(m, travel, rack))
    return hist

m = _new_mech(DEFAULT_DWB_POINTS)
h = gs_solve(m, TRAVEL, 0.0, iters=300)
seg = ", ".join(f"{v:.1f}" for v in h[:8])
print(f"A) 朴素GS @travel=30: 前8次迭代 max|res|: {seg}")
print(f"   300次后: {h[-1]:.2f} mm | 最小(300次内): {min(h):.2f} mm | 单调收敛? {all(a>=b for a,b in zip(h,h[1:]))}")

# ── B) 牛顿法（数值雅可比 + 最小二乘步）────────────────────────────
def newton_solve(m, travel, rack, iters=12):
    fun = _build_residual(m, travel, rack)
    hist = []
    for it in range(iters):
        x = np.concatenate([m.nodes[i].pos for i in _STATE_IDS])
        f0 = fun(x)
        hist.append(float(np.max(np.abs(f0))))
        if hist[-1] < 1e-12:
            break
        J = np.zeros((len(f0), 18))
        for k in range(18):
            xp = x.copy(); xp[k] += 1e-6
            J[:, k] = (fun(xp) - f0) / 1e-6
        dx = np.linalg.lstsq(J, -f0, rcond=None)[0]
        for kk, i in enumerate(_STATE_IDS):
            m.nodes[i].pos = m.nodes[i].pos + dx[3 * kk:3 * kk + 3]
    return hist

m2 = _new_mech(DEFAULT_DWB_POINTS)
hn = newton_solve(m2, TRAVEL, 0.0)
print(f"\nB) 牛顿法 @travel=30 逐次 max|res|: {', '.join(f'{v:.2e}' for v in hn)}")

# ── C) 引擎 TRF（生产路径）─────────────────────────────────────────
m3 = _new_mech(DEFAULT_DWB_POINTS)
rep = solve_pose(m3, TRAVEL, 0.0)
print(f"\nC) 引擎 solve_pose(TRF) @travel=30: nfev={rep.iterations}, max|res|={rep.residual:.2e} mm, 用时={rep.ms:.1f}ms")

# ── D) 热启动收益：冷解 vs 延拓链 ─────────────────────────────────
m4 = _new_mech(DEFAULT_DWB_POINTS)
rep_cold = solve_pose(m4, 70.0, 0.0)
m5 = _new_mech(DEFAULT_DWB_POINTS)
nfevs = []
for t in (10, 20, 30, 40, 50, 60, 70):
    nfevs.append(solve_pose(m5, float(t), 0.0).iterations)
print(f"\nD) travel=70: 冷解 nfev={rep_cold.iterations} | 延拓 10→70 每步 nfev={nfevs} (末步={nfevs[-1]})")
