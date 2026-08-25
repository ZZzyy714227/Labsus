"""P2 拓扑回归：STRUT_OUT 附着模式 + 摇臂真实三维轴（r2 修复守卫）。

覆盖：
1. strut_attach 非法值拒绝；
2. lca/uca 模式下 UP4 随对应臂刚体运动（与臂球头距离恒定），
   且与转向节（WC）距离不再恒定 —— 与前端 strutOutAttach 语义一致；
3. knuckle 模式保持历史行为（UP4 与 WC 距离恒定）；
4. rocker 三维轴（RCK_AX_A→B）下，压缩侧摇臂可解（旧固定 X 轴下
   PRO 几何 +10mm 不可达 → rocker_ok=False / MR 垃圾化 3.98）；
5. MR@0 为正且有物理量级（下游只用 mr²，abs 语义）。
"""
import numpy as np
import pytest

from src.api.v3service import _new_mech, DEFAULT_DWB_POINTS
from src.api.v3models import AxleSpec
from src.api.chassis import mr_at_zero
from src.solver.mechanism.models import build_mechanism
from src.solver.mechanism.solver import solve_pose

FRONT_PRO = {k: np.asarray(v, float) for k, v in DEFAULT_DWB_POINTS.items()}
REAR = {
    "LCA_F": [230.0, 180.0, 125.0], "LCA_R": [230.0, -170.0, 135.0],
    "LBJ": [720.0, 10.0, 145.0], "UCA_F": [340.0, 140.0, 360.0],
    "UCA_R": [340.0, -140.0, 370.0], "UBJ": [660.0, -15.0, 435.0],
    "WC": [790.0, 0.0, 330.0], "TRO": [670.0, -150.0, 185.0],
    "RACK": [230.0, -160.0, 175.0],
    "STRUT_OUT": [645.0, -15.0, 425.0],
    "RCK_AX_A": [377.0, 30.0, 318.9], "RCK_AX_B": [376.7, 90.0, 320.1],
    "STRUT_IN": [414.7, 55.0, 282.5], "RCK_DMP": [337.8, 75.0, 297.6],
    "DMP_BODY": [18.5, 78.4, 346.4],
}


def test_invalid_strut_attach_rejected():
    with pytest.raises(ValueError):
        build_mechanism(FRONT_PRO, strut_attach="bogus")


def test_lca_attaches_strut_to_lower_arm():
    """lca：UP4 与 LBJ(UP1) 距离恒定（臂刚体），与 WC(UP5) 距离随行程变化。"""
    m = _new_mech(DEFAULT_DWB_POINTS, arch="pushrod")     # pushrod → lca
    solve_pose(m, 20.0, 0.0)
    d_up4_up1 = float(np.linalg.norm(m.node("UP4").pos - m.node("UP1").pos))
    d0_up4_up1 = float(np.linalg.norm(m.node("UP4").p0 - m.node("UP1").p0))
    d_up4_wc = float(np.linalg.norm(m.node("UP4").pos - m.node("UP5").pos))
    d0_up4_wc = float(np.linalg.norm(m.node("UP4").p0 - m.node("UP5").p0))
    assert abs(d_up4_up1 - d0_up4_up1) < 1e-6          # 随臂刚体
    assert abs(d_up4_wc - d0_up4_wc) > 0.5             # 相对转向节张弛


def test_uca_attaches_strut_to_upper_arm():
    """uca（pullrod 后轴）：UP4 与 UBJ(UP2) 恒定、与 WC 张弛。"""
    m = _new_mech(REAR, arch="pullrod")
    d0 = float(np.linalg.norm(m.node("UP4").p0 - m.node("UP2").p0))
    solve_pose(m, 20.0, 0.0)
    d = float(np.linalg.norm(m.node("UP4").pos - m.node("UP2").pos))
    assert abs(d - d0) < 1e-6


def test_knuckle_mode_legacy_behavior():
    """knuckle（arch 未知）：UP4 与 WC 距离恒定（历史行为）。"""
    m = _new_mech(DEFAULT_DWB_POINTS, arch="x")
    d0 = float(np.linalg.norm(m.node("UP4").p0 - m.node("UP5").p0))
    solve_pose(m, 20.0, 0.0)
    d = float(np.linalg.norm(m.node("UP4").pos - m.node("UP5").pos))
    assert abs(d - d0) < 1e-6


def test_rocker_solvable_in_compression_with_3d_axis():
    """P2 核心：真实三维轴下 +10mm 压缩侧摇臂可解（旧固定 X 轴不可达）。"""
    m = _new_mech(DEFAULT_DWB_POINTS, arch="pushrod")
    rep = solve_pose(m, 10.0, 0.0)
    assert rep.rocker_ok
    assert rep.damper_len is not None
    m2 = _new_mech(REAR, arch="pullrod")
    rep2 = solve_pose(m2, 10.0, 0.0)
    assert rep2.rocker_ok


def test_mr_at_zero_positive_and_physical():
    """MR@0 正且有量级（abs 语义，下游只用 mr²）。"""
    fr = AxleSpec(points=DEFAULT_DWB_POINTS, arch="pushrod")
    rr = AxleSpec(points=REAR, arch="pullrod")
    assert 0.1 < mr_at_zero(fr, DEFAULT_DWB_POINTS, False) < 1.5
    assert 0.02 < mr_at_zero(rr, REAR, False) < 1.5
