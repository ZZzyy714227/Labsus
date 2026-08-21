"""K&C 两层迭代求解器测试（TDD 红阶段）。"""
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


def test_no_bushing_equals_plain_kinematics():
    """无衬套 → K&C 求解必须与纯运动学一致（回归门：不改变既有行为）。"""
    m = _mech()
    from src.solver.mechanism.solver import solve_pose
    rep = solve_pose(m, 10.0, 0.0)
    res = solve_compliance(_mech(), bushings={}, load=np.zeros(3),
                           travel=10.0, rack=0.0)
    assert res.kin_residual < 0.02
    assert abs(res.kin_residual - rep.residual) < 1e-6


def test_single_lca_bushing_deforms_under_vertical_load():
    """LCA 前方衬套（CH1 点）挂 6DOF 衬套：垂向力会使 CH1 上移（衬套压缩）。

    符号约定：load 为作用于锚点的外载荷向量（N，全局坐标）。
    平衡方程 r = f_ext − bush_force(δ) = 0。
    bush_force(δ)[i] = k·δ[i]（线性刚度）。
    向上力 load[2]=+500 → δz = +2.5mm（衬套拉伸/正位移）。
    向下力 load[2]=−500 → δz = −2.5mm（衬套压缩/负位移）。
    本测试取 load[2]=+500（向上拉）验证位移 magnitude 正确性。
    """
    bush = Bushing6DOF(
        name="bCH1", anchor=PRO_POINTS["CH1"].copy(),
        kT=[Curve("linear", k=200.0)]*3, kR=[Curve("linear", k=4e4)]*3,
        cT=[0.0]*3, cR=[0.0]*3, preload=np.zeros(6))
    bush.member_nodes = ["CH1"]          # 装配：衬套作用于 CH1 锚点（平移 DOF 主导）
    bush.member_p0 = {"CH1": PRO_POINTS["CH1"].copy()}
    res = solve_compliance(_mech(), bushings={"bCH1": bush},
                           load=np.array([0.0, 0.0, 500.0]),
                           travel=0.0, rack=0.0,
                           applied_at={"bCH1": "CH1"})
    assert res.status in ("VALID", "APPROXIMATE")
    assert abs(res.delta["bCH1"][2]) > 1.5     # δz ≈ 2.5mm（500/200），机构耦合后略小
    assert abs(res.force_balance_residual) < 5.0
