"""把 legacy-import 的侧硬点 dict 组装成 Mechanism（补齐摇臂/减振器 frame 节点）。"""
from __future__ import annotations

import numpy as np

from config import DEFAULT_FRAME_NODES
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, mirror_left

from .models import Mechanism, build_mechanism

# 前轴右轮：frame 节点键 → 机构泛化键
_FRONT_R_FRAME = {
    "RK_PIVOT": "RK_PIVOT_R",
    "RK_DAMPER": "RK_DAMPER_R",
    "DAMPER_CHASSIS": "DAMPER_CHASSIS_FR",
}
# 后轴右轮：R_ 前缀 hardpoint + 后部 frame 节点
_REAR_R_FRAME = {
    "RK_PIVOT": "R_RK_PIVOT_R",
    "RK_DAMPER": "R_RK_DAMPER_R",
    "DAMPER_CHASSIS": "R_DAMPER_CHASSIS_RR",
}
_HARD_KEYS = ("CH1", "CH2", "CH3", "CH4", "CH5", "UP1", "UP2", "UP3", "UP4", "UP5", "FL1")


def _points_dict(side: dict, prefix: str = "", frame_map: dict | None = None) -> dict[str, np.ndarray]:
    """把某侧硬点（可能带 R_ 前缀/少 frame 键）→ 机构通用 points dict。"""
    pts = {}
    for k in _HARD_KEYS:
        key = prefix + k
        if key in side:
            pts[k] = np.asarray(side[key], dtype=float)
    for gen, src in (frame_map or {}).items():
        v = DEFAULT_FRAME_NODES.get(src)
        if v is not None:
            pts[gen] = np.asarray(v, dtype=float)
    return pts


def build_side_from_legacy(
    front_right: dict | None = None,
    front_left: dict | None = None,
    rear_right: dict | None = None,
    rear_left: dict | None = None,
    *,
    corner: str = "fr",
    steer_axis: np.ndarray | None = None,
) -> Mechanism:
    """按 corner（'fr'/'fl'/'rr'/'rl'）构造机构；不足的轴侧用模板+镜像补。

    返回的机构使用设计位硬点（含 frame 节点）。
    """
    fr = front_right if front_right is not None else DEFAULT_HARDPOINTS
    rr = rear_right if rear_right is not None else DEFAULT_REAR_HARDPOINTS
    # 齿条是整体沿全局 +Y 平移（两侧 tie inner 同方向）；转向符号由几何自然给出
    sa = steer_axis if steer_axis is not None else np.array([0.0, 1.0, 0.0])
    if corner == "fr":
        pts = _points_dict(fr, "", _FRONT_R_FRAME)
    elif corner == "fl":
        base = front_left if front_left is not None else mirror_left(fr)
        pts = _points_dict(base, "", _FRONT_R_FRAME)
    elif corner == "rr":
        pts = _points_dict(rr, "R_", _REAR_R_FRAME)
    else:  # rl
        base = rear_left if rear_left is not None else mirror_left(rr)
        pts = _points_dict(base, "R_", _REAR_R_FRAME)
    return build_mechanism(pts, steer_axis=sa)
