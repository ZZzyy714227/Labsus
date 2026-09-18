"""回归守卫（2026-09-07 独立解析基准对拍发现）：
pushrod/pullrod 拓扑下 _estimate_rotation 必须只用 KNUCKLE 刚体簇节点。
旧实现硬编码 5 点（含挂臂的 UP4），姿态被拉偏——守卫方式：
主销矢量 (UBJ−LBJ) 是转向节刚体向量，Kabsch 恢复的 R 应精确保持其方向。
"""
import numpy as np

from src.api.v3service import _new_mech, _estimate_rotation, DEFAULT_DWB_POINTS
from src.solver.mechanism.solver import solve_pose


def _kingpin_preserved(points, arch, travel):
    m = _new_mech(points, arch=arch)
    rep = solve_pose(m, travel, 0.0)
    assert rep.ok, f"travel={travel}: solve_pose 未收敛（residual={rep.residual:.3g}mm），非刚体性判据"
    R = _estimate_rotation(m)
    kp0 = m.node("UP2").p0 - m.node("UP1").p0
    kp1 = m.node("UP2").pos - m.node("UP1").pos
    a = R @ kp0
    # 方向余弦误差（对长度缩放不敏感）
    cos_err = 1.0 - float(np.dot(a, kp1) / (np.linalg.norm(a) * np.linalg.norm(kp1)))
    return cos_err


def test_rotation_rigid_for_pushrod_front():
    # pushrod → strut_attach=lca：UP4 挂下臂（旧 bug 触发拓扑）
    for tr in (40.0, 90.0, -90.0):
        assert _kingpin_preserved(DEFAULT_DWB_POINTS, "pushrod", tr) < 1e-9, \
            f"travel={tr}: _estimate_rotation 不再保持 knuckle 刚体性（UP4 污染回归？）"


def test_rotation_rigid_for_pullrod_rear():
    rear = dict(DEFAULT_DWB_POINTS)
    rear.update({
        "LCA_F": [230.0, 180.0, 125.0], "LCA_R": [230.0, -170.0, 135.0],
        "LBJ": [720.0, 10.0, 145.0], "UCA_F": [340.0, 140.0, 320.0],
        "UCA_R": [340.0, -140.0, 330.0], "UBJ": [660.0, -15.0, 435.0],
        "WC": [790.0, 0.0, 330.0], "TRO": [670.0, -150.0, 185.0],
        "RACK": [230.0, -160.0, 175.0], "STRUT_OUT": [645.0, -15.0, 425.0],
    })
    for tr in (50.0, -80.0):
        assert _kingpin_preserved(rear, "pullrod", tr) < 1e-9
