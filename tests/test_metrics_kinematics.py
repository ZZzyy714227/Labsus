"""P2-2 运动学指标测试（进展文档 P2-4 验证要求）。

覆盖：手算 benchmark、正负方向、静态、轮跳/转向曲线、失效/奇异状态、
七状态状态机（P2-3）。
"""
import math

import pytest

from core.metrics import MetricResult, not_implemented, ok, solver_failed
from core.models import ResultStatus
from metrics.kinematics import (
    ackermann_pct,
    anti_dive,
    anti_squat,
    bump_steer_deg_per_25,
    camber_gain_deg_per_25,
    included_angle,
    jacking,
    motion_ratio,
    pitch_center,
    roll_center_height,
    side_view_ic,
    steering_camber_gain,
    svic_point,
    track_change_mm,
    wheelbase_change,
)


class TestStateMachine:
    """P2-3：七状态约束。"""

    def test_valid_requires_value(self):
        with pytest.raises(ValueError):
            MetricResult(key="m", value=None, status=ResultStatus.VALID)

    def test_not_implemented_forbids_value(self):
        with pytest.raises(ValueError):
            MetricResult(key="m", value=1.0, status=ResultStatus.NOT_IMPLEMENTED)

    def test_ok_and_not_implemented_helpers(self):
        assert ok(1.5, "mm").status == ResultStatus.VALID
        m = not_implemented("jacking", "mm", "需要 P3")
        assert m.status == ResultStatus.NOT_IMPLEMENTED and m.value is None
        m2 = solver_failed("x", "mm", "求解失败")
        assert m2.status == ResultStatus.SOLVER_FAILED


class TestIncludedAngle:
    def test_algebraic_sum(self):
        """Included Angle = KPI + Camber（代数和）。"""
        m = included_angle(2.51, -2.49)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(0.02, abs=1e-6)


class TestAckermann:
    def test_parallel_zero_percent(self):
        """平行转向：内外轮同角 → 0%。"""
        m = ackermann_pct(5.0, -5.0, 1200.0, 1550.0)
        # 内轮 5°、外轮 5°（同角）→ 0%
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(0.0, abs=1e-6)

    def test_full_ackermann_100_percent(self):
        """完全阿克曼：外轮 = 理想外轮角 → 100%。"""
        inner = 10.0
        ideal_outer = math.degrees(math.atan2(
            1550.0, 1550.0 / math.tan(math.radians(inner)) + 1200.0))
        m = ackermann_pct(inner, -ideal_outer, 1200.0, 1550.0)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(100.0, abs=1e-6)

    def test_no_steer_not_applicable(self):
        """无转向输入 → NOT_APPLICABLE（状态机，不返回 None 空白）。"""
        m = ackermann_pct(0.0, 0.0, 1200.0, 1550.0)
        assert m.status == ResultStatus.NOT_APPLICABLE
        assert m.value is None


class TestRollCenter:
    def test_single_side_centerline(self):
        """单侧 IC→接地点连线与中心线交点：
        IC(100,200) → CP(610,0)，z(y=0) = 200*(0-610)/(100-610) = 239.2。"""
        m = roll_center_height((100.0, 200.0), None, (610.0, 0.0), None)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(200.0 * (-610.0) / (-510.0), abs=1e-6)

    def test_two_sides_intersection(self):
        """两侧对称构造：右 IC(100,200) 左 IC(-100,200)，CP_r(610,0) CP_l(-610,0)。
        右线: (100,200)→(610,0)；左线: (-100,200)→(-610,0)；交点 y=0, z=239.2。"""
        m = roll_center_height((100.0, 200.0), (-100.0, 200.0),
                               (610.0, 0.0), (-610.0, 0.0))
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(200.0 * (-610.0) / (-510.0), abs=1e-6)

    def test_no_ic_solver_failed(self):
        m = roll_center_height(None, None, None, None)
        assert m.status == ResultStatus.SOLVER_FAILED


class TestSideViewIC:
    def test_intersection(self):
        """X-Z 平面：UCA 轴方向 (10,10) 过 UP1(20,30) → z=x+10；
        LCA 轴方向 (10,-10) 过 UP2(20,10) → z=-x+30；交于 (10,20)。"""
        ch1, ch2 = (0.0, 0.0, 0.0), (10.0, 0.0, 10.0)
        up1 = (20.0, 0.0, 30.0)
        ch3, ch4 = (0.0, 0.0, 0.0), (10.0, 0.0, -10.0)
        up2 = (20.0, 0.0, 10.0)
        p = svic_point(ch1, ch2, up1, ch3, ch4, up2)
        assert p is not None
        assert p[0] == pytest.approx(10.0, abs=1e-6)
        assert p[1] == pytest.approx(20.0, abs=1e-6)
        m = side_view_ic(ch1, ch2, up1, ch3, ch4, up2)
        assert m.status == ResultStatus.VALID

    def test_parallel_not_applicable(self):
        """两摆臂轴方向平行 → SVIC 无穷远 → NOT_APPLICABLE。"""
        ch1, ch2 = (0.0, 0.0, 0.0), (10.0, 0.0, 10.0)
        up1 = (20.0, 0.0, 30.0)
        ch3, ch4 = (5.0, 0.0, 0.0), (15.0, 0.0, 10.0)     # 轴方向 (10,10) 平行
        up2 = (25.0, 0.0, 30.0)
        m = side_view_ic(ch1, ch2, up1, ch3, ch4, up2)
        assert m.status == ResultStatus.NOT_APPLICABLE


class TestAntiPitch:
    def test_anti_dive_sign(self):
        """SVIC 在接地点后方且高于地面 → 正 anti-dive。
        SVIC(-100,50) CP(0,0)：slope=0.5 → 100*0.5*1550*0.6/300 = 155%。"""
        m = anti_dive((-100.0, 50.0), (0.0, 0.0), 1550.0, 300.0,
                      1.0, brake_front_frac=0.6)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(100.0 * 0.5 * 1550.0 * 0.6 / 300.0, abs=1e-6)

    def test_anti_dive_behind_low_negative(self):
        """SVIC 在接地点下方 → 负 anti（anti-lift）。"""
        m = anti_dive((-100.0, -50.0), (0.0, 0.0), 1550.0, 300.0, 1.0, 0.6)
        assert m.status == ResultStatus.VALID
        assert m.value < 0

    def test_squat_formula(self):
        m = anti_squat((-100.0, 50.0), (0.0, 0.0), 1550.0, 300.0, 1.0, 1.0)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(100.0 * 0.5 * 1550.0 * 1.0 / 300.0, abs=1e-6)

    def test_no_svic_not_applicable(self):
        m = anti_dive(None, (0.0, 0.0), 1550.0, 300.0, 1.0, 0.6)
        assert m.status == ResultStatus.NOT_APPLICABLE

    def test_pitch_center(self):
        """前线 SVIC(-100,50)→CP(0,0)：z = -0.5x；
        后线 SVIC(100,-50)→CP(200,0)：z = 0.5x - 100；
        交于 x=100, z=-50。"""
        m = pitch_center((-100.0, 50.0), (0.0, 0.0), (100.0, -50.0), (200.0, 0.0))
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(-50.0, abs=1e-6)


class TestChanges:
    def test_track_change(self):
        m = track_change_mm(-610.5, -610.0)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(0.5, abs=1e-6)

    def test_wheelbase_change(self):
        m = wheelbase_change(0.0, 0.5, 0.0, 0.0)   # 后轴后移 0.5
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(0.5, abs=1e-6)
        m2 = wheelbase_change(0.0, 0.0, -0.5, 0.5)  # 设计前 -0.5 后 +0.5 → wb0=1.0
        assert m2.value == pytest.approx(-1.0, abs=1e-6)


class TestDerivatives:
    def test_motion_ratio_slope(self):
        damper = [0.0, 1.0, 2.0]
        travel = [-10.0, 0.0, 10.0]
        m = motion_ratio(damper, travel, 0.0)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(0.1, abs=1e-6)

    def test_motion_ratio_insufficient_solver_failed(self):
        m = motion_ratio([], [-10.0, 0.0, 10.0], 0.0)
        assert m.status == ResultStatus.SOLVER_FAILED

    def test_bump_steer_25mm(self):
        toe = [0.0, 0.5, 1.0]
        travel = [-10.0, 0.0, 10.0]
        m = bump_steer_deg_per_25(toe, travel, 0.0)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(1.25, abs=1e-6)   # 0.05 °/mm * 25

    def test_camber_gain_25mm(self):
        camber = [0.0, -1.0, -2.0]
        travel = [-10.0, 0.0, 10.0]
        m = camber_gain_deg_per_25(camber, travel, 0.0)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(-2.5, abs=1e-6)   # -0.1 °/mm * 25

    def test_steering_camber_gain(self):
        m = steering_camber_gain(-2.49, -2.78, 0.0, 3.33)
        assert m.status == ResultStatus.VALID
        assert m.value == pytest.approx(-0.29 / 3.33, abs=1e-6)

    def test_steering_camber_gain_no_steer(self):
        m = steering_camber_gain(-2.49, -2.49, 0.0, 0.0)
        assert m.status == ResultStatus.NOT_APPLICABLE


class TestJacking:
    def test_not_implemented(self):
        """Jacking 依赖 P3 载荷 → 显式 NOT_IMPLEMENTED，禁止伪造数值。"""
        m = jacking(0.0)
        assert m.status == ResultStatus.NOT_IMPLEMENTED
        assert m.value is None
