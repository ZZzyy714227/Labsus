"""投影原语：交替精确投影（DWB projLink/projHinge 的 numpy 版本）。"""
from __future__ import annotations

import numpy as np

from .models import Node, Vec

EPS = 1e-12


def project_distance(nodes: dict[str, Node], a: str, b: str, L0: float) -> float:
    """刚线长度约束：按逆质量加权分配误差 C=d−L0；返回 |C|。"""
    A, B = nodes[a], nodes[b]
    wa, wb = A.inv_m, B.inv_m
    ws = wa + wb
    if ws <= EPS:
        return 0.0
    d = B.pos - A.pos
    dd = float(np.linalg.norm(d)) or EPS
    C = dd - L0
    s = C / (dd * ws)
    if wa > 0:
        A.pos = A.pos + d * (s * wa)
    if wb > 0:
        B.pos = B.pos - d * (s * wb)
    return abs(C)


def project_axis_rotation(nodes: dict[str, Node], anchor: str, axis: Vec,
                          members: list[str], rel: list[Vec], wt: list[float]) -> float:
    """成员绕过 anchor 的 unit 轴做单参数最优旋转（DWB projHinge 解析式 θ=atan2(sn,cs)）。

    返回本次投影施加的最大成员位移(mm)：投影前后越接近，返回值越小（≈0 表示已最优）。
    """
    o = nodes[anchor].pos
    ax = np.asarray(axis, dtype=float)
    ax = ax / (np.linalg.norm(ax) or 1.0)
    sn = 0.0
    cs = 0.0
    for k, mid in enumerate(members):
        r = np.asarray(rel[k], dtype=float)
        rp = float(np.dot(r, ax))
        rq = r - ax * rp
        d = nodes[mid].pos - o
        w = float(wt[k])
        cs += w * float(np.dot(rq, d))
        sn += w * float(np.dot(np.cross(ax, rq), d))
    th = np.arctan2(sn, cs)
    ct, st = np.cos(th), np.sin(th)
    mx = 0.0
    for k, mid in enumerate(members):
        r = np.asarray(rel[k], dtype=float)
        rp = float(np.dot(r, ax))
        rq = r - ax * rp
        q = ax * rp + rq * ct + np.cross(ax, rq) * st
        new = o + q
        mx = max(mx, float(np.linalg.norm(new - nodes[mid].pos)))
        nodes[mid].pos = new
    return mx


def project_hinge(nodes: dict[str, Node], anchor: str, axis: Vec,
                  members: list[str], rel: list[Vec], wt: list[float],
                  ax_a: str | None = None, ax_b: str | None = None) -> float:
    """铰链簇（两固定铰点轴）。axis 为 None 时取两轴端点当前方向。"""
    if axis is None:
        axis = np.asarray(nodes[ax_b].pos, dtype=float) - np.asarray(nodes[ax_a].pos, dtype=float)
    return project_axis_rotation(nodes, anchor, axis, members, rel, wt)


def project_rocker(nodes: dict[str, Node], anchor: str, axis: Vec,
                   members: list[str], rel: list[Vec], wt: list[float]) -> float:
    """摇臂：绕车架枢轴的固定轴做单参数最优旋转（规则同 project_axis_rotation）。"""
    return project_axis_rotation(nodes, anchor, axis, members, rel, wt)


def q_axis_angle(ax: Vec, an: float) -> Vec:
    """轴角 → 四元数 [x,y,z,w]（单位轴）。"""
    h = an * 0.5
    s = np.sin(h)
    ax = np.asarray(ax, dtype=float)
    ax = ax / (np.linalg.norm(ax) or 1.0)
    return np.array([ax[0] * s, ax[1] * s, ax[2] * s, np.cos(h)])


def q_mul(a: Vec, b: Vec) -> Vec:
    """Hamilton 四元数乘法 a*b（与 DWB qMul 一致）。"""
    return np.array([
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ])


def q_mat(q: Vec) -> np.ndarray:
    """四元数 → 3x3 旋转矩阵（行主序）。"""
    x, y, z, w = q
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    return np.array([
        [1 - (yy + zz), xy - wz, xz + wy],
        [xy + wz, 1 - (xx + zz), yz - wx],
        [xz - wy, yz + wx, 1 - (xx + yy)],
    ])


def q_from_mat(r: np.ndarray) -> Vec:
    """旋转矩阵 → 四元数 [x,y,z,w]（Shepperd 法，数值稳健）。"""
    m = np.asarray(r, dtype=float)
    t = float(m[0, 0] + m[1, 1] + m[2, 2])
    if t > 0.0:
        s = np.sqrt(t + 1.0) * 2.0
        x = (m[2, 1] - m[1, 2]) / s
        y = (m[0, 2] - m[2, 0]) / s
        z = (m[1, 0] - m[0, 1]) / s
        w = 0.25 * s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2.0
        w = (m[2, 1] - m[1, 2]) / s
        x = 0.25 * s
        y = (m[0, 1] + m[1, 0]) / s
        z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2.0
        w = (m[0, 2] - m[2, 0]) / s
        x = (m[0, 1] + m[1, 0]) / s
        y = 0.25 * s
        z = (m[1, 2] + m[2, 1]) / s
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2.0
        w = (m[1, 0] - m[0, 1]) / s
        x = (m[0, 2] + m[2, 0]) / s
        y = (m[1, 2] + m[2, 1]) / s
        z = 0.25 * s
    return np.array([x, y, z, w]) / np.linalg.norm([x, y, z, w])


def _svd_rotation(a: np.ndarray) -> Vec:
    """正交 Procrustes（SVD）：A = U·S·Vᵀ → R = U·Vᵀ（矫 det=+1）。"""
    u, _, vt = np.linalg.svd(a)
    r = u @ vt
    if np.linalg.det(r) < 0.0:
        u[:, -1] = -u[:, -1]
        r = u @ vt
    return q_from_mat(r)


def polar_q(a: np.ndarray, q: Vec, iters: int = 16) -> Vec:
    """极分解取旋转。

    主路径为 Müller 迭代（热启动，适合机构连续性场景）；当步长异常
    （近 180° 错位/强各向异性协方差导致过冲失稳）时回退到 SVD 正交
    Procrustes，保证任意输入都收敛到最近旋转。
    """
    a = np.asarray(a, dtype=float)
    q = q / (np.linalg.norm(q) or 1.0)
    for _ in range(iters):
        r = q_mat(q)
        r0, r1, r2 = r[0], r[1], r[2]
        a0, a1, a2 = a[0], a[1], a[2]
        trace = float(np.dot(r0, a0) + np.dot(r1, a1) + np.dot(r2, a2))
        nvec = np.cross(r0, a0) + np.cross(r1, a1) + np.cross(r2, a2)
        w = float(np.linalg.norm(nvec) / (abs(trace) + 1e-9))
        if w < 1e-13:
            break
        if w > 2.5:
            return _svd_rotation(a)
        q = q_mul(q_axis_angle(nvec / (np.linalg.norm(nvec) or 1.0), w), q)
        q = q / np.linalg.norm(q)
    return q


def project_body(nodes: dict[str, Node], ids: list[str], rel: list[Vec],
                 wt: list[float], ws: float, q: Vec | None = None,
                 iters: int = 14) -> Vec:
    """自由刚体簇：质量加权协方差 + 极分解 + 四元数热启动；返回更新后四元数。"""
    c = np.zeros(3)
    for k, mid in enumerate(ids):
        c = c + nodes[mid].pos * wt[k]
    c = c / ws
    A = np.zeros((3, 3))
    for k, mid in enumerate(ids):
        p = nodes[mid].pos
        A = A + wt[k] * np.outer(p - c, rel[k])
    quat = polar_q(A, q if q is not None else np.array([0.0, 0.0, 0.0, 1.0]), iters)
    R = q_mat(quat)
    for k, mid in enumerate(ids):
        nodes[mid].pos = c + R @ rel[k]
    return quat
