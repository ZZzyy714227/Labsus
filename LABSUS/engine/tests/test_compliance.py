"""K&C 两层迭代求解器测试。"""
import numpy as np
import pytest
from src.components.bushing import Bushing6DOF, Curve
from src.solver.compliance import ComplianceSolverResult, solve_compliance
from src.solver.mechanism.models import build_mechanism

PRO_POINTS = {  # 前轴推杆侧硬点（DWB-SIM PRO 前悬架，坐标 X=外侧/Y=向前/Z=上）
    "CH1": np.array([240.0, 180.0, 145.0]),  "CH2": np.array([240.0, -160.0, 155.0]),
    "CH3": np.array([360.0, 140.0, 380.0]),  "CH4": np.array([360.0, -130.0, 390.0]),
    "UP1": np.array([730.0, 10.0, 165.0]),   "UP2": np.array([675.0, -15.0, 455.0]),
    "UP3": np.array([685.0, -145.0, 205.0]), "UP4": np.array([683.4, 12.0, 205.5]),
    "UP5": np.array([810.0, 0.0, 320.0]),
    "FL1": np.array([269.2, -165.0, 198.1]), "CH5": np.array([324.4, 57.9, 445.6]),
    "RK_PIVOT": np.array([305.3, 20.0, 366.4]),
    "DAMPER_CHASSIS": np.array([29.3, 60.1, 181.1]),
    "RK_DAMPER": np.array([234.8, 60.0, 385.0]),
}


def _mech():
    return build_mechanism(PRO_POINTS, wheel="UP5", tie_outer="UP3", tie_inner="FL1",
                           pushrod_from="UP4", pushrod_to="CH5")


def _make_bushing(name, anchor, k=200.0):
    """创建标准测试衬套（线性刚度 k N/mm）。"""
    bush = Bushing6DOF(
        name=name, anchor=np.asarray(anchor, float).copy(),
        kT=[Curve("linear", k=k)] * 3, kR=[Curve("linear", k=4e4)] * 3,
        cT=[0.0] * 3, cR=[0.0] * 3, preload=np.zeros(6))
    bush.member_nodes = [name]
    bush.member_p0 = {name: np.asarray(anchor, float).copy()}
    return bush


# ── 原始测试 ──

def test_no_bushing_equals_plain_kinematics():
    """无衬套 → K&C 求解必须与纯运动学一致（回归门）。"""
    m = _mech()
    from src.solver.mechanism.solver import solve_pose
    rep = solve_pose(m, 10.0, 0.0)
    res = solve_compliance(_mech(), bushings={}, load=np.zeros(3),
                           travel=10.0, rack=0.0)
    assert res.kin_residual < 0.02
    assert abs(res.kin_residual - rep.residual) < 1e-6


def test_single_lca_bushing_deforms_under_vertical_load():
    """LCA 前方衬套（CH1 点）挂 6DOF 衬套：垂向力会使 CH1 位移。

    符号约定：load 为作用于锚点的外载荷向量（N，全局坐标）。
    平衡方程 r = f_ext − bush_force(δ) = 0。
    向上力 load[2]=+500 → δz ≈ +2.5mm（衬套正位移）。
    """
    bush = _make_bushing("CH1", PRO_POINTS["CH1"], k=200.0)
    res = solve_compliance(_mech(), bushings={"bCH1": bush},
                           load=np.array([0.0, 0.0, 500.0]),
                           travel=0.0, rack=0.0,
                           applied_at={"bCH1": "CH1"})
    assert res.status in ("VALID", "APPROXIMATE")
    assert abs(res.delta["bCH1"][2]) > 1.5     # δz ≈ 2.5mm（500/200），机构耦合后略小
    assert abs(res.force_balance_residual) < 5.0


# ── I2a: 零载荷恒等 ──

def test_zero_load_gives_near_zero_displacement():
    """零载荷 → 所有 δ ≈ 0，status = VALID。"""
    bush = _make_bushing("CH1", PRO_POINTS["CH1"], k=200.0)
    res = solve_compliance(_mech(), bushings={"bCH1": bush},
                           load=np.zeros(3), travel=0.0, rack=0.0)
    assert res.status == "VALID"
    for k_name in res.delta:
        assert np.all(np.abs(res.delta[k_name]) < 1e-6), \
            f"bushing {k_name} should have near-zero delta, got {res.delta[k_name]}"


# ── I2b: 双衬套 + per-bushing loads ──

def test_dual_bushing_per_bushing_loads():
    """两个衬套（CH1 + CH3）各自承受不同载荷，独立变形。"""
    bush_ch1 = _make_bushing("CH1", PRO_POINTS["CH1"], k=200.0)
    bush_ch3 = _make_bushing("CH3", PRO_POINTS["CH3"], k=300.0)
    res = solve_compliance(
        _mech(),
        bushings={"bCH1": bush_ch1, "bCH3": bush_ch3},
        load=np.zeros(3),  # broadcast default (unused since loads provided)
        loads={"bCH1": np.array([0.0, 0.0, 400.0]),   # → δz ≈ +2.0mm
               "bCH3": np.array([0.0, 0.0, -600.0])},  # → δz ≈ −2.0mm
        travel=0.0, rack=0.0,
    )
    assert res.status in ("VALID", "APPROXIMATE")
    # CH1: 400/200 = 2.0mm（正向，机构耦合后略小）
    assert abs(res.delta["bCH1"][2]) > 1.0
    # CH3: −600/300 = −2.0mm（负向，机构耦合后略小）
    assert abs(res.delta["bCH3"][2]) > 1.0
    # 两者符号相反
    assert res.delta["bCH1"][2] * res.delta["bCH3"][2] < 0
    assert res.force_balance_residual < 10.0


# ── I2c: 极端载荷 → 发散 ──

def test_huge_load_diverges():
    """10000N 载荷 + k=200 → δ≈50mm 远超机构工作范围，期望发散或大残差。

    机构耦合可能使求解器无法收敛到小残差 → COMPLIANCE_DIVERGED 或 VALID（若意外收敛）。
    若收敛，δ 应在物理合理范围（≈50mm 量级）。
    """
    bush = _make_bushing("CH1", PRO_POINTS["CH1"], k=200.0)
    res = solve_compliance(
        _mech(),
        bushings={"bCH1": bush},
        load=np.array([0.0, 0.0, 10000.0]),
        travel=0.0, rack=0.0,
        max_nfev=100,
    )
    if res.status == "VALID":
        # 若收敛：δz 应在 ~50mm 量级（10000/200），机构耦合后可能偏小
        assert abs(res.delta["bCH1"][2]) > 5.0, \
            f"if converged, δz should be large (~50mm), got {res.delta['bCH1'][2]}"
    else:
        # 未完全收敛：COMPLIANCE_DIVERGED 或 APPROXIMATE
        assert res.status in ("COMPLIANCE_DIVERGED", "APPROXIMATE", "VALID")
        # 无论如何，力平衡残差不应为 NaN
        assert not np.isnan(res.force_balance_residual)
