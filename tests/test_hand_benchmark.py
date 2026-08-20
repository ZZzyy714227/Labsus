"""手算 benchmark（设计文档 §13.1 第 2 层）：
用解析可算的合成硬点验证主销/接地几何公式本身。
"""
import math

import pytest

from hardpoints import DEFAULT_HARDPOINTS
from solver.angles import compute_alignment_angles
from solver.bump import solve_bump


def _synthetic(up1, up2, up5=(0, 610, 250)):
    """右轮合成硬点：车身点不影响定位角公式，只放合法值。"""
    return {
        "CH1": [0, 400, 350], "CH2": [100, 400, 350],
        "CH3": [0, 380, 100], "CH4": [100, 380, 100],
        "CH5": [10, 150, 300], "FL1": [60, 300, 250],
        "UP1": list(up1), "UP2": list(up2), "UP3": [50, 500, 250],
        "UP4": [0, 500, 150], "UP5": list(up5),
        "tire_radius": 100.0, "tire_width": 180.0,
        "tire_spring_rate": 100.0, "corner_weight_n": 1000.0,
    }


class TestAnalyticKingpin:
    def test_vertical_kingpin_zero_angles(self):
        """竖直主销：KPI=caster=camber=toe=0；scrub = 610-500 = 110；trail = 0。"""
        hp = _synthetic((0, 500, 400), (0, 500, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["kpi_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["caster_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["camber_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["toe_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["scrub_radius_mm"] == pytest.approx(110.0, abs=1e-6)
        assert a["caster_trail_mm"] == pytest.approx(0.0, abs=1e-6)

    def test_top_forward_is_negative_caster(self):
        """X+ = 前。UP1 在 x=30（下端 x=0）之前 → 顶端前倾 = 经典负 caster。
        caster = atan2(-30, 300) = -5.7106°；主销接地点在接地点（x≈0）后方，
        且轮面含 -0.77° 外倾（合成几何非纯竖直轮面）→ 经典负 trail ≈ -9.84。"""
        hp = _synthetic((30, 500, 400), (0, 500, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["caster_deg"] == pytest.approx(-math.degrees(math.atan2(30, 300)), abs=1e-3)
        assert a["kpi_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["caster_trail_mm"] == pytest.approx(-9.84, abs=0.05)

    def test_top_rearward_is_positive_caster(self):
        """UP1 在 x=-30（下端 x=0）之后 → 顶端后倾 = 经典正 caster。
        caster = atan2(30, 300) = +5.7106°；主销接地点在接地点前方 →
        经典正 trail ≈ +9.84。"""
        hp = _synthetic((-30, 500, 400), (0, 500, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["caster_deg"] == pytest.approx(math.degrees(math.atan2(30, 300)), abs=1e-3)
        assert a["caster_trail_mm"] == pytest.approx(9.84, abs=0.05)

    def test_kpi_axis_top_inboard_positive(self):
        """下端外移 60mm/300mm：KPI = atan2(60, 300) = +11.3099°。"""
        hp = _synthetic((0, 500, 400), (0, 560, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["kpi_deg"] == pytest.approx(math.degrees(math.atan2(60, 300)), abs=1e-3)
        assert a["caster_deg"] == pytest.approx(0.0, abs=1e-9)


class TestResidualThresholds:
    """残差基线（设计文档 §13.2 目标 ≤ 0.02mm）。

    现状：polish 含分支锚定软项（2.0*(x-x0)，防止欠约束系统滑向错误分支），
    最小二乘在锚定与约束间留妥协残差。P2-0 修正默认几何（反 caster → 经典正
    caster）后按新几何重新基线（2026-08-20 探针）：

      dz:  -15   -10    -7    -3   0     +3    +7   +10   +15
      res: 0.210 0.120 0.075 0.027 0.000 0.019 0.031 0.030 0.009

    仅 [0, +3, +15] 达到 ≤0.02。K-4 保持开放（P1 求解器议程），哨兵锁定新基线。
    """

    @pytest.mark.parametrize("dz", [0.0, 3.0, 15.0])
    def test_polish_residual_meets_target_inner_zone(self, dz):
        r = solve_bump(dict(DEFAULT_HARDPOINTS), dz, polish=True)
        assert r["max_residual"] <= 0.02

    @pytest.mark.parametrize("dz", [-15.0, -10.0, -7.0, -3.0, 7.0, 10.0])
    def test_polish_residual_boundary_baseline_locked(self, dz):
        """K-4 哨兵：边界残差基线锁定（P2-0 修正几何后最差 -15mm ≈ 0.210）；
        P1 改进求解器后应收敛到 ≤0.02 并收紧此断言。"""
        r = solve_bump(dict(DEFAULT_HARDPOINTS), dz, polish=True)
        assert r["max_residual"] <= 0.215
