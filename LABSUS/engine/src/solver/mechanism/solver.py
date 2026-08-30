"""机制运动学求解：scipy least_squares 联合收敛 + continuation 热启动 + 摇臂后处理。

设计说明（相对最初 spec 的落点，已记为有据偏差）：
- 依然按 DWB 式"机构模型"求解（节点/刚线/铰链簇/转向节刚性 + 轮高/齿条双驱动），
  模型层与参考一致；
- 但收敛不改用"独立精确投影迭代"（实测在真实几何、双闭环/强各向异性协方差下
  Gauss-Seidel 不收缩），而是对**同一套约束残差向量**做 scipy `least_squares`
  联合最小二乘，保证残差 ≤0.02mm（G1）且换姿态热启动保持分支连续；
- 摇臂/推杆闭环是纯运动学从动链（轮侧解完再事后求解 θ，与产品 rocker.py 架构一致），
  不进轮侧状态向量。
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
from scipy.optimize import least_squares

from geometry import distance_point_to_line, rotate_around_axis

from .models import Mechanism

_STATE_IDS = ["UP1", "UP2", "UP3", "UP4", "UP5", "FL1"]
_KNUCKLE_IDS = ["UP1", "UP2", "UP3", "UP4", "UP5"]


@dataclass
class SolveReport:
    residual: float
    iterations: int
    ok: bool
    ms: float
    rocker_ok: bool = False
    rocker_theta: float | None = None
    damper_len: float | None = None


def set_drives(m: Mechanism, travel: float, rack: float) -> None:
    m.node(m.wheel).pos[2] = m.node(m.wheel).p0[2] + travel
    m.node("FL1").pos = m.steer_anchor + rack * m.steer_axis


def _state(m: Mechanism) -> np.ndarray:
    return np.concatenate([m.nodes[i].pos for i in _STATE_IDS])


def _apply(m: Mechanism, x: np.ndarray) -> None:
    # F-68（2026-08-30）：视图别名 → 拷贝。旧实现把 x 的切片直接赋给
    # node.pos（零拷贝视图），`set_drives` 原地写 pos[2] 会反写 x 数组——
    # 当前调用序无害，但属易踩雷别名，任何"先 apply 再改 pos"的新路径
    # 都会静默污染初值向量（least_squares 复用 x 的路径尤其危险）。
    for k, i in enumerate(_STATE_IDS):
        m.nodes[i].pos = x[3 * k:3 * k + 3].copy()


def _build_residual(m: Mechanism, travel: float, rack: float):
    """残差函数：铰链圆(半径/轴向) + 转向节刚体距离 + 横拉杆 + 双驱动。

    P2（2026-08-22）：刚体距离对由 m.bodies[0].ids 派生 —— strut_attach!=knuckle
    时 UP4 已移出转向节，不再受 knuckle 刚距约束；同时补一条 UP4↔臂球头刚线
    （对应前端 ATT_B-ST_O），消除"绕臂轴相对转角"的伪自由度。
    """
    body_ids = sorted(m.bodies[0].ids)
    pair = [(i, j) for idx, i in enumerate(body_ids) for j in body_ids[idx + 1:]]
    d0 = {p: float(np.linalg.norm(m.node(p[0]).p0 - m.node(p[1]).p0)) for p in pair}
    if m.strut_attach in ("lca", "uca"):
        driver = "UP1" if m.strut_attach == "lca" else "UP2"
        d0[("UP4", driver)] = float(
            np.linalg.norm(m.node("UP4").p0 - m.node(driver).p0))
    hinge_design: list[tuple] = []
    for c in m.axis_clusters:
        if c.kind != "hinge":
            continue
        ab0 = m.node(c.axB).p0 - m.node(c.axA).p0
        u0 = ab0 / (np.linalg.norm(ab0) or 1.0)
        a0 = m.node(c.axA).p0
        for mem in c.members:
            r0 = distance_point_to_line(m.node(mem).p0, a0, m.node(c.axB).p0)
            ax0 = float(np.dot(m.node(mem).p0 - a0, u0))
            hinge_design.append((c, mem, u0, r0, ax0))
    tie = next(lk for lk in m.links if lk.id == "TIE")
    z_p0 = m.node(m.wheel).p0[2]

    def fun(x: np.ndarray) -> np.ndarray:
        _apply(m, x)
        out: list[float] = []
        for c, mem, u0, r0, ax0 in hinge_design:
            a, b = m.nodes[c.axA], m.nodes[c.axB]
            u = (b.pos - a.pos) / (np.linalg.norm(b.pos - a.pos) or 1.0)
            p = m.node(mem).pos
            out.append(distance_point_to_line(p, a.pos, b.pos) - r0)
            out.append(float(np.dot(p - a.pos, u)) - ax0)
        for i, j in pair:
            out.append(float(np.linalg.norm(m.node(i).pos - m.node(j).pos)) - d0[(i, j)])
        if m.strut_attach in ("lca", "uca"):
            out.append(float(np.linalg.norm(m.node("UP4").pos - m.node(driver).pos))
                       - d0[("UP4", driver)])
        out.append(float(np.linalg.norm(m.node(tie.a).pos - m.node(tie.b).pos)) - tie.L0)
        out.append(m.node(m.wheel).pos[2] - (z_p0 + travel))
        out.extend(m.node("FL1").pos - (m.steer_anchor + rack * m.steer_axis))
        return np.asarray(out, dtype=float)

    return fun


def residual(m: Mechanism, travel: float, rack: float) -> float:
    out = _build_residual(m, travel, rack)(_state(m))
    return float(np.max(np.abs(out))) if out.size else 0.0


def solve_rocker(m: Mechanism) -> tuple[bool, float | None, float | None]:
    """摇臂后处理：解 θ 使 |rotate_axis(CH5.p0, pivot, axis, θ) − UP4.current| = L_pr。

    返回 (ok, theta_rad, damper_len_mm)。不可达时 ok=False。同时写回 CH5/RK_DAMPER。

    P2（2026-08-22）：旋转轴改取机构 rocker 簇的 axis —— v3 层由
    RCK_AX_B−RCK_AX_A 提供真实三维轴；缺省回退全局 X 轴（旧行为）。
    旧实现 rotate_around_x 不改变 X 坐标，CH5→UP4 的 X 跨距（基线 358mm）
    使压缩行程推杆长度不可达，bracket 恒失败 → 减振器长度不更新 →
    引擎 MR 数值垃圾化（实测 3.98）；这正是"STRUT_OUT 拓扑 OpenItem"的
    真实物理根源之一。
    """
    pivot = m.node("RK_PIVOT").p0
    ch5_0 = m.node("CH5").p0
    dmp_0 = m.node("RK_DAMPER").p0
    axis = None
    for c in m.axis_clusters:
        if c.kind == "rocker" and c.axis is not None:
            axis = c.axis
            break
    if axis is None:
        axis = np.array([1.0, 0.0, 0.0])
    up4 = m.node("UP4").pos
    l_pr = float(np.linalg.norm(m.node("UP4").p0 - ch5_0))
    if l_pr < 1.0:
        return False, None, None

    def err(t: float) -> float:
        return float(np.linalg.norm(rotate_around_axis(ch5_0, pivot, axis, t) - up4)) - l_pr

    e0 = err(0.0)
    bracket: tuple[float, float] | None = None
    for r in (0.05, 0.2, 0.5, 1.0, 2.0, 3.1, -0.05, -0.2, -0.5, -1.0, -2.0, -3.1):
        if e0 * err(r) <= 0.0:
            bracket = (0.0, r) if r > 0 else (r, 0.0)
            break
    if bracket is None:
        return False, None, None
    lo, hi = bracket
    flo = err(lo)  # F-71：缓存 err(lo)，循环内不再每次重复计算
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        fm = err(mid)
        if fm * flo <= 0.0:
            hi = mid
        else:
            lo = mid
            flo = fm
    theta = 0.5 * (lo + hi)
    m.node("CH5").pos = rotate_around_axis(ch5_0, pivot, axis, theta)
    dmp = rotate_around_axis(dmp_0, pivot, axis, theta)
    m.node("RK_DAMPER").pos = dmp
    damper_len = float(np.linalg.norm(dmp - m.node("DAMPER_CHASSIS").p0))
    return True, theta, damper_len


def solve_pose(
    m: Mechanism,
    travel: float,
    rack: float,
    max_nfev: int = 200,
    tol: float = 1e-10,
) -> SolveReport:
    t0 = time.perf_counter()
    fun = _build_residual(m, travel, rack)
    res = least_squares(fun, _state(m), method="trf", xtol=tol, ftol=tol, gtol=tol, max_nfev=max_nfev)
    _apply(m, res.x)
    rocker_ok, theta, dmp_len = solve_rocker(m)
    r = float(np.max(np.abs(res.fun))) if res.fun.size else 0.0
    return SolveReport(
        residual=r,
        iterations=int(res.nfev),
        ok=bool(r < 0.02),
        ms=(time.perf_counter() - t0) * 1000.0,
        rocker_ok=rocker_ok,
        rocker_theta=theta,
        damper_len=dmp_len,
    )


def drive_to(
    m: Mechanism,
    target_travel: float,
    rack: float,
    step: float = 6.0,
    max_steps: int = 24,
    max_nfev: int = 200,
    tol: float = 1e-10,
) -> SolveReport:
    cur = m.node(m.wheel).pos[2] - m.node(m.wheel).p0[2]
    d_target = target_travel - cur
    steps = int(min(max_steps, max(1, abs(np.ceil(abs(d_target) / step)))))
    rep: SolveReport | None = None
    for s in range(1, steps + 1):
        rep = solve_pose(m, cur + d_target * s / steps, rack, max_nfev=max_nfev, tol=tol)
    assert rep is not None
    return rep


def find_limits(
    m: Mechanism,
    rack: float,
    travel_lo: float = -160.0,
    travel_hi: float = 160.0,
    step: float = 2.0,
    thr: float = 0.03,
) -> tuple[float, float]:
    up = 0.0
    t = 0.0
    while t + step <= travel_hi:
        t += step
        if drive_to(m, t, rack).residual > thr:
            break
        up = t
    drive_to(m, 0.0, rack)
    dn = 0.0
    t = 0.0
    while t - step >= travel_lo:
        t -= step
        if drive_to(m, t, rack).residual > thr:
            break
        dn = t
    drive_to(m, 0.0, rack)
    return (dn, up)


__all__ = [
    "SolveReport",
    "set_drives",
    "solve_pose",
    "drive_to",
    "find_limits",
    "residual",
    "solve_rocker",
]
