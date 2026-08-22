"""Alignment angle computation from solver results（engine 隔离副本）。

从主仓 src/solver/angles.py 精简，剥离 tire 依赖（S1 门禁不需要接触斑）。
返回键名：camber_deg / kpi_deg / caster_deg / toe_deg / scrub_radius_mm / caster_trail_mm。

符号约定（P2-0 冻结，与主仓一致）：
    Camber:  negative = top of wheel inward (both sides)
    Toe:     positive = toe-in (both sides)
    KPI/SAI: positive = kingpin axis top inboard (both sides)
    Caster:  positive = kingpin axis top rearward (classic, both sides)
    Scrub:   positive = contact patch outboard of kingpin ground (both sides)
    Trail:   positive = kingpin ground ahead of contact patch (classic, both sides)
"""
from __future__ import annotations

import math

import numpy as np

from geometry import vec3


def _side_sign_from_up5(up5_y: float) -> float:
    """+1 for a right-side wheel, -1 for a left-side wheel."""
    return 1.0 if up5_y >= 0.0 else -1.0


def compute_alignment_angles(result_dict, chassis_points=None, hp=None):
    """Compute alignment angles from solver result positions.

    Parameters
    ----------
    result_dict : dict
        Must contain UP1, UP2, UP5 at minimum (3-element arrays/lists).
    hp : dict, optional
        Tire parameters; S1 gate 测试不传，scrub/trail 回退到轮心近似。
    """
    UP1 = np.asarray(result_dict["UP1"], dtype=float)
    UP2 = np.asarray(result_dict["UP2"], dtype=float)
    UP5 = np.asarray(result_dict["UP5"], dtype=float)
    side = _side_sign_from_up5(float(UP5[1]))

    # Kingpin axis: UP1 -> UP2
    kp_vec = UP2 - UP1
    kp_len = float(np.linalg.norm(kp_vec))
    if kp_len < 1e-12:
        return {"camber_deg": 0.0, "kpi_deg": 0.0, "caster_deg": 0.0,
                "toe_deg": 0.0, "scrub_radius_mm": 0.0, "caster_trail_mm": 0.0}
    kp_dir = kp_vec / kp_len

    # ── Upright local frame ──
    upright_frame_valid = False
    y_axis_u = None
    up15 = vec3(UP1, UP5)
    z_ax_tmp = vec3(UP1, UP2)
    z_tmp_norm = float(np.linalg.norm(z_ax_tmp))
    x_axis_u = None
    if z_tmp_norm > 1e-12:
        z_axis_u = z_ax_tmp / z_tmp_norm
        x_axis_u = np.cross(up15, z_axis_u)
        x_tmp_norm = float(np.linalg.norm(x_axis_u))
        if x_tmp_norm > 1e-12:
            x_axis_u = x_axis_u / x_tmp_norm
            y_axis_u = np.cross(z_axis_u, x_axis_u)
            upright_frame_valid = True

    # ── KPI ──
    kpi_rad = side * math.atan2(kp_vec[1], -kp_vec[2])
    kpi_deg = math.degrees(kpi_rad)

    # ── Camber ──
    if upright_frame_valid:
        camber_rad = -math.atan2(float(y_axis_u[2]),
                                 float(math.hypot(y_axis_u[0], y_axis_u[1])))
        camber_deg = math.degrees(camber_rad)
    else:
        camber_deg = 0.0

    # ── Caster ──
    caster_rad = math.atan2(kp_vec[0], -kp_vec[2])
    caster_deg = math.degrees(caster_rad)

    # ── Toe ──
    if upright_frame_valid and x_axis_u is not None:
        fwd = np.array([x_axis_u[0], x_axis_u[1]])
        fwd_n = float(np.linalg.norm(fwd))
        if fwd_n > 1e-9:
            fwd = fwd / fwd_n
            if fwd[0] < 0.0:
                fwd = -fwd
            toe_rad = -side * math.atan2(fwd[1], fwd[0])
        else:
            toe_rad = 0.0
        toe_deg = math.degrees(toe_rad)
    else:
        toe_deg = 0.0

    # ── Scrub / Trail（S1：无 tire 接触斑，回退到轮心投影）──
    contact_y = UP5[1]
    contact_x = UP5[0]

    if abs(kp_dir[2]) > 1e-9:
        t = -UP1[2] / kp_dir[2]
        kp_ground_y = UP1[1] + t * kp_dir[1]
        kp_ground_x = UP1[0] + t * kp_dir[0]
        scrub = side * (contact_y - kp_ground_y)
        trail = kp_ground_x - contact_x
    else:
        scrub = 0.0
        trail = 0.0

    return {
        "camber_deg": round(camber_deg, 3),
        "kpi_deg": round(kpi_deg, 3),
        "caster_deg": round(caster_deg, 3),
        "toe_deg": round(toe_deg, 3),
        "scrub_radius_mm": round(scrub, 2),
        "caster_trail_mm": round(trail, 2),
    }
