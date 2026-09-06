"""
Pure 3D geometry utilities for the FSAE suspension solver.
No project-specific imports — only numpy + math.
"""

import math

import numpy as np


def vec3(a, b):
    """Vector from a to b."""
    return np.array(b) - np.array(a)


def dist(a, b):
    """Euclidean distance."""
    return float(np.linalg.norm(vec3(a, b)))


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


def closest_point_on_circle(p, axis_a, axis_b, radius):
    """Project point p onto the circle of given radius around axis a-b."""
    axis_pt = closest_point_on_line(p, axis_a, axis_b)
    radial = np.array(p) - axis_pt
    radial_norm = np.linalg.norm(radial)
    if radial_norm < 1e-12:
        axis_dir = vec3(axis_a, axis_b)
        axis_dir = axis_dir / np.linalg.norm(axis_dir)
        if abs(axis_dir[0]) < 0.9:
            perp = np.array([1.0, 0.0, 0.0])
        else:
            perp = np.array([0.0, 1.0, 0.0])
        radial = perp - np.dot(perp, axis_dir) * axis_dir
        radial_norm = np.linalg.norm(radial)
        if radial_norm < 1e-12:
            return axis_pt
        radial = radial / radial_norm * radius
    else:
        radial = radial / radial_norm * radius
    return axis_pt + radial


def enforce_distance(p, q, target_dist):
    """Adjust p and q equally so |p-q| = target_dist."""
    mid = (np.array(p) + np.array(q)) / 2.0
    v = vec3(q, p)
    v_norm = np.linalg.norm(v)
    if v_norm < 1e-12:
        return np.array(p), np.array(q)
    half = v / v_norm * target_dist / 2.0
    return mid + half, mid - half


def enforce_distance_fixed_q(p, q, target_dist):
    """Adjust p so |p-q| = target_dist, keeping q fixed."""
    v = vec3(q, p)
    v_norm = np.linalg.norm(v)
    if v_norm < 1e-12:
        return np.array(p)
    return np.array(q) + v / v_norm * target_dist


def rotate_around_x(pt, pivot, theta):
    """Rotate point around X-axis line passing through pivot by theta radians."""
    ct = math.cos(theta)
    st = math.sin(theta)
    dy = pt[1] - pivot[1]
    dz = pt[2] - pivot[2]
    return np.array([
        pt[0],
        pivot[1] + dy * ct - dz * st,
        pivot[2] + dy * st + dz * ct,
    ])


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


def rotate_around_z(pt, pivot, theta):
    """Rotate point around Z-axis line passing through pivot by theta radians."""
    ct = math.cos(theta)
    st = math.sin(theta)
    dx = pt[0] - pivot[0]
    dy = pt[1] - pivot[1]
    return np.array([
        pivot[0] + dx * ct - dy * st,
        pivot[1] + dx * st + dy * ct,
        pt[2],
    ])


def normalize_or_default(vec, fallback=None):
    """Return unit vector in direction of vec, or fallback if norm ≈ 0.
    If fallback is None, defaults to [1, 0, 0].
    """
    n = np.linalg.norm(vec)
    if n < 1e-12:
        return np.array(fallback) if fallback is not None else np.array([1.0, 0.0, 0.0])
    return vec / n


def deg(r):
    """Radians to degrees, rounded to 2 decimals."""
    return round(math.degrees(r), 2)


def rad(d):
    """Degrees to radians."""
    return math.radians(d)
