"""S1 阶段门禁：回归一致 / K&C 物理合理性 / 性能预算 / 静态定位角手算对照。

gate 测试覆盖四维度：
1. 无衬套回归：solve_compliance(bushings={}) 与纯运动学 solve_pose 残差一致。
2. 物理合理性：单锚点直承外载 → 形变量与线性预期吻合、力平衡残差小。
3. 全链路性能预算：10 次 K&C 单点求解 < 3s（均值 <300ms/点）。
4. 静态定位角手算对照：用与 compute_alignment_angles 相同的解析公式验证
   solve_to_angles 的 kpi / caster 输出。
"""
import time

import numpy as np
import pytest

from src.components.bushing import Bushing6DOF, Curve
from src.solver.compliance import solve_compliance, solve_compliance_full
from src.solver.forces import QSLoad
from src.solver.mechanism.models import build_mechanism
from src.solver.mechanism.solver import solve_pose

# ── PRO 前轴推杆侧硬点（与 test_compliance.py 一致）──
PRO_POINTS = {
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


def _bush(bushing_name, node_name, anchor, k):
    """创建标准测试衬套（线性刚度 k N/mm）。

    bushing_name: 衬套标识（用于 dict key，如 "bCH1"）。
    node_name: 机构节点名（如 "CH1"），member_nodes / member_p0 用此键。
    """
    b = Bushing6DOF(name=bushing_name, anchor=np.asarray(anchor, float).copy(),
                     kT=[Curve("linear", k=k)] * 3,
                     kR=[Curve("linear", k=1e5)] * 3,
                     cT=[0.0] * 3, cR=[0.0] * 3, preload=np.zeros(6))
    b.member_nodes = [node_name]
    b.member_p0 = {node_name: np.asarray(anchor, float).copy()}
    return b


# ═══════════════════════════════════════════════════════════════════════
# GATE 1: 无衬套回归 — solve_compliance(bushings={}) 与纯运动学一致
# ═══════════════════════════════════════════════════════════════════════

def test_gate_no_bushing_regression():
    """G1: 无衬套 → K&C 回退到纯运动学，kin_residual 与 solve_pose 精确一致。"""
    for tr in [-60.0, 0.0, 60.0]:
        m_plain = _mech()
        plain = solve_pose(m_plain, tr, 0.0)
        kc = solve_compliance(_mech(), bushings={}, load=np.zeros(3),
                              travel=tr, rack=0.0)
        assert abs(kc.kin_residual - plain.residual) < 1e-6, \
            f"travel={tr}: kin_residual mismatch ({kc.kin_residual:.3e} vs {plain.residual:.3e})"


# ═══════════════════════════════════════════════════════════════════════
# GATE 2: 物理合理性 — 单锚点直承外载，形变与力平衡验证
# ═══════════════════════════════════════════════════════════════════════

def test_gate_compliance_physical():
    """G2: 单锚点直承：900N 垂向 → 形变 2~4mm（k=300），力平衡残差 < 20N。"""
    b = _bush("bCH1", "CH1", PRO_POINTS["CH1"], 300.0)
    res = solve_compliance(_mech(), bushings={"bCH1": b},
                           load=np.array([0.0, 0.0, 900.0]),
                           travel=0.0, rack=0.0,
                           applied_at={"bCH1": "CH1"})
    assert res.status in ("VALID", "APPROXIMATE"), \
        f"expected VALID/APPROXIMATE, got {res.status}"
    d = res.delta["bCH1"][2]
    assert 2.0 < d < 4.0, \
        f"δz={d:.2f}mm outside expected range (2~4mm, ideal 900/300=3mm)"
    assert res.force_balance_residual < 20.0, \
        f"force_balance_residual={res.force_balance_residual:.1f}N > 20N"


# ═══════════════════════════════════════════════════════════════════════
# GATE 3: 全链路性能预算 — 10 次 K&C 单点 < 3s
# ═══════════════════════════════════════════════════════════════════════

def test_gate_full_chain_and_perf():
    """G3: 全链路（接地点外载→锚点→衬套）性能预算：10 次 K&C 单点 < 3s。"""
    b = _bush("bCH1", "CH1", PRO_POINTS["CH1"], 500.0)
    t0 = time.perf_counter()
    for _ in range(10):
        res = solve_compliance_full(_mech(), bushings={"bCH1": b},
                                    case=QSLoad(fz=3000.0),
                                    travel=0.0, rack=0.0)
    elapsed_s = time.perf_counter() - t0
    avg_ms = elapsed_s * 100.0  # 10 次均值（ms/点）
    assert avg_ms < 300.0, \
        f"K&C 单点解超预算: avg={avg_ms:.1f}ms（预算 <300ms/点 全链路）"
    assert res.status in ("VALID", "APPROXIMATE"), \
        f"expected VALID/APPROXIMATE, got {res.status}"


# ═══════════════════════════════════════════════════════════════════════
# GATE 4: 静态定位角手算对照
# ═══════════════════════════════════════════════════════════════════════

def test_gate_static_alignment_handcheck():
    """G4: 手算静态定位角对照（与 solve_to_angles 使用同一解析公式）。

    验证逻辑：用与 compute_alignment_angles 完全相同的 atan2 公式，
    从硬点直接计算 kpi / caster，与 solve_to_angles 输出比对。
    容差 0.5°（机构求解器姿态误差 + 数值精度）。
    """
    from src.solver.mechanism.pose import solve_to_angles

    m = _mech()
    ang = solve_to_angles(m, 0.0, 0.0)

    # 手算：使用与 compute_alignment_angles 相同的公式
    UP1 = PRO_POINTS["UP1"]
    UP2 = PRO_POINTS["UP2"]
    UP5 = PRO_POINTS["UP5"]
    kp_vec = UP2 - UP1
    side = 1.0 if UP5[1] >= 0.0 else -1.0
    hand_kpi = np.degrees(side * np.arctan2(kp_vec[1], -kp_vec[2]))
    hand_caster = np.degrees(np.arctan2(kp_vec[0], -kp_vec[2]))

    assert abs(ang["kpi_deg"] - hand_kpi) < 0.5, \
        f"KPI mismatch: solve_to_angles={ang['kpi_deg']:.3f}°, hand={hand_kpi:.3f}°"
    assert abs(ang["caster_deg"] - hand_caster) < 0.5, \
        f"Caster mismatch: solve_to_angles={ang['caster_deg']:.3f}°, hand={hand_caster:.3f}°"
