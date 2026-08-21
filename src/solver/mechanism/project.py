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
