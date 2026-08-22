"""机构解 → 现有角度/指标管道消费的 pose dict；附便利求解入口。"""
from __future__ import annotations

import numpy as np

from .models import Mechanism
from .solver import drive_to

_POSE_KEYS = [
    "UP1", "UP2", "UP3", "UP4", "UP5", "FL1",
    "CH1", "CH2", "CH3", "CH4", "CH5",
    "RK_PIVOT", "RK_DAMPER", "DAMPER_CHASSIS",
]


def mechanism_to_pose_result(m: Mechanism) -> dict[str, np.ndarray]:
    """导出为 `solver.angles.compute_alignment_angles` 消费的 result_dict 形状。"""
    return {k: m.node(k).pos.copy() for k in _POSE_KEYS}


def solve_to_angles(m: Mechanism, travel: float, rack: float, hp: dict | None = None):
    """求解姿态并返回定位角 dict；hp 需带轮胎参数（tire_radius 等），供 scrub/trail 一致计算。"""
    from solver.angles import compute_alignment_angles

    drive_to(m, travel, rack)
    return compute_alignment_angles(mechanism_to_pose_result(m), hp=hp)
