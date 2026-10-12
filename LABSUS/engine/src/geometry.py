"""
Pure 3D geometry utilities for the FSAE suspension solver.
No project-specific imports — only numpy + math.

M5 死代码清理（2026-09-20）：删除从未被任何模块导入的 9 个函数：
    dist / closest_point_on_circle / enforce_distance / enforce_distance_fixed_q /
    rotate_around_x / rotate_around_z / normalize_or_default / deg / rad
（判据：全仓 AST 扫描 `from ... import` 语句，这些名字零导入；`deg`/`rad` 的
"引用计数"全部来自其它模块的同名局部变量，非本模块函数。）
保留 `closest_point_on_line` —— 它是 `distance_point_to_line` 的内部依赖。
`rotate_around_x` 的历史讨论见 `src/solver/mechanism/solver.py::solve_rocker`
docstring（说明 STRUT_OUT OpenItem 的物理根因），本清理不影响该记载。
"""

import math

import numpy as np


def vec3(a, b):
    """Vector from a to b."""
    return np.array(b) - np.array(a)


def line_intersect_2d(p1, d1, p2, d2):
    """2D line intersection between p1 + s*d1 and p2 + t*d2.

    Returns the intersection point as a 2D numpy array [x, y],
    or None if the lines are parallel or degenerate (|det| < 1e-12).
    """
    denom = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(denom) < 1e-12:
        return None
    t = np.asarray(p2, dtype=float) - np.asarray(p1, dtype=float)
    s = (t[0] * d2[1] - t[1] * d2[0]) / denom
    return np.asarray(p1, dtype=float) + s * np.asarray(d1, dtype=float)


def distance_point_to_line(p, a, b):
    """Shortest distance from point p to line through a-b."""
    closest = closest_point_on_line(p, a, b)
    return float(np.linalg.norm(np.array(p) - closest))


def closest_point_on_line(p, a, b):
    """Closest point on line a-b to point p."""
    ap = vec3(a, p)
    ab = vec3(a, b)
    ab_norm2 = np.dot(ab, ab)
    if ab_norm2 < 1e-12:
        return np.array(a)
    t = np.dot(ap, ab) / ab_norm2
    return np.array(a) + t * ab


def rotate_around_axis(pt, pivot, axis, theta):
    """Rotate point around arbitrary axis line through pivot (Rodrigues).

    axis 须为单位向量或非零向量（内部归一化）。θ=0 恒等。
    """
    pt = np.asarray(pt, float)
    pivot = np.asarray(pivot, float)
    ax = np.asarray(axis, float)
    n = float(np.linalg.norm(ax))
    if n < 1e-12:
        return pt.copy()
    ax = ax / n
    v = pt - pivot
    ct, st = math.cos(theta), math.sin(theta)
    v_rot = (v * ct
             + np.cross(ax, v) * st
             + ax * float(np.dot(ax, v)) * (1.0 - ct))
    return pivot + v_rot
