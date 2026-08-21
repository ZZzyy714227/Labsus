"""v2 集成适配器：把机制求解器包装成与 routes.solve._solve_axle 同构的角解。

返回 (result, angles, residual, cp, rocker)，字段语义与 _solve_axle 的
(right/angles_right/geometry_residual_mm/contact_patch_right/rocker_right) 一致，
以便 v2._solve_corner 复用原有 pose/状态/载荷下游组装，前端零改动。
"""
from __future__ import annotations

import math

import numpy as np

from config import DEFAULT_FRAME_NODES
from solver.angles import compute_alignment_angles
from tire import compute_contact_patch

from .models import build_mechanism
from .pose import mechanism_to_pose_result
from .solver import drive_to

_RESULT_KEYS = [
    "UP1", "UP2", "UP3", "UP4", "UP5", "FL1",
    "CH1", "CH2", "CH3", "CH4", "CH5",
    "RK_PIVOT", "RK_DAMPER", "DAMPER_CHASSIS",
]
_HARD_KEYS = ["CH1", "CH2", "CH3", "CH4", "CH5", "UP1", "UP2", "UP3", "UP4", "UP5", "FL1"]


def _frame_points(is_rear: bool, is_left: bool) -> dict[str, np.ndarray]:
    if is_rear:
        base = {
            "RK_PIVOT": DEFAULT_FRAME_NODES["R_RK_PIVOT_R"],
            "RK_DAMPER": DEFAULT_FRAME_NODES["R_RK_DAMPER_R"],
            "DAMPER_CHASSIS": DEFAULT_FRAME_NODES["R_DAMPER_CHASSIS_RR"],
        }
    else:
        base = {
            "RK_PIVOT": DEFAULT_FRAME_NODES["RK_PIVOT_R"],
            "RK_DAMPER": DEFAULT_FRAME_NODES["RK_DAMPER_R"],
            "DAMPER_CHASSIS": DEFAULT_FRAME_NODES["DAMPER_CHASSIS_FR"],
        }
    if is_left:
        base = {k: [v[0], -v[1], v[2]] for k, v in base.items()}  # noqa: PLW2901
    return {k: np.asarray(v, dtype=float) for k, v in base.items()}


def _contact_patch(pose: dict[str, np.ndarray], hp_flat: dict) -> dict | None:
    try:
        up1 = np.asarray(pose["UP1"], dtype=float)
        up2 = np.asarray(pose["UP2"], dtype=float)
        up5 = np.asarray(pose["UP5"], dtype=float)
        z_axis = up2 - up1
        zn = float(np.linalg.norm(z_axis))
        if zn < 1e-12:
            return None
        z_axis = z_axis / zn
        x_axis = np.cross(up5 - up1, z_axis)
        xn = float(np.linalg.norm(x_axis))
        if xn < 1e-12:
            return None
        x_axis = x_axis / xn
        y_axis = np.cross(z_axis, x_axis)
        return compute_contact_patch(up5, y_axis, hp_flat) or None
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None


def solve_corner_mechanism(
    hp_flat: dict,
    travel: float,
    rack: float,
) -> tuple[dict, dict, float, dict | None, dict | None]:
    """用机制求解器解一个角（hp_flat 含 CH*/UP*/FL1 + 轮胎参数；可带 R_ 前缀）。"""
    is_rear = any(k.startswith("R_") and k[2:] in _HARD_KEYS for k in hp_flat)
    prefix = "R_" if is_rear else ""
    up5 = hp_flat.get(prefix + "UP5") or hp_flat.get("UP5")
    is_left = float(up5[1]) < 0.0

    pts: dict[str, np.ndarray] = {}
    for k in _HARD_KEYS:
        v = hp_flat.get(prefix + k)
        if v is not None:
            pts[k] = np.asarray(v, dtype=float)
    pts.update(_frame_points(is_rear, is_left))

    m = build_mechanism(pts, steer_axis=np.array([0.0, 1.0, 0.0]))
    rep = drive_to(m, travel, rack)

    pose = mechanism_to_pose_result(m)
    result = {k: [float(v) for v in m.node(k).pos] for k in _RESULT_KEYS}
    angles = compute_alignment_angles(pose, hp=hp_flat)
    cp = _contact_patch(pose, hp_flat)

    l_pr = float(np.linalg.norm(m.node("UP4").p0 - m.node("CH5").p0))
    dmp_design = float(np.linalg.norm(m.node("RK_DAMPER").p0 - m.node("DAMPER_CHASSIS").p0))
    dmp_cur = rep.damper_len
    rocker: dict | None = None
    if rep.rocker_ok and dmp_cur is not None:
        rocker = {
            "damper_len_current": dmp_cur,
            "damper_len_design": dmp_design,
            "damper_travel": dmp_cur - dmp_design,
            "push_rod_len_design": l_pr,
            "rocker_angle_deg": math.degrees(rep.rocker_theta) if rep.rocker_theta is not None else None,
        }
    return result, angles, float(rep.residual), cp, rocker, bool(rep.rocker_ok)
