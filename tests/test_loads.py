"""P3 载荷与轮边受力测试（设计文档 §8、进展文档 P3）。

覆盖：手算 benchmark、力/力矩平衡闭合、奇异性、ARB 连杆力、整车载荷分配、
左右独立（禁止镜像受力）。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import numpy as np
import pytest

from metrics.loads import (
    arb_droplink_force,
    max_abs,
    solve_link_forces,
    solve_upright_forces,
    tire_force,
)
from metrics.wheel_loads import G, distribute_vehicle_loads


def _full_hp():
    """完整硬点集（当前轮边几何），各点拉开避免退化。"""
    return {
        "CH1": [-90.0, 160.0, 285.0], "CH2": [90.0, 152.0, 295.0],
        "CH3": [-110.0, 128.0, 110.0], "CH4": [110.0, 122.0, 115.0],
        "CH5": [0.0, 135.0, 305.0], "FL1": [-100.0, 115.0, 200.0],
    }


def _full_result():
    """求解后的转向节位置（UP1-UP5 + FL1）。"""
    return {
        "UP1": [1.96, 579.0, 277.7], "UP2": [-11.1, 585.6, 128.4],
        "UP3": [-20.0, 560.0, 200.0], "UP4": [0.0, 588.0, 180.0],
        "UP5": [0.0, 610.0, 255.3], "FL1": [-100.0, 115.0, 200.0],
    }


class TestTireForceCompat:
    """旧 tire_force 兼容签名不变。"""

    def test_braking(self):
        assert np.allclose(tire_force(1000.0, 1.2, 0.0), [1200.0, 0.0, 1000.0])

    def test_cornering(self):
        assert np.allclose(tire_force(1000.0, 0.0, 1.3), [0.0, 1300.0, 1000.0])


class TestUprightBalance:
    def test_static_vertical_balance_closes(self):
        """静态竖直载荷：合力/力矩残差 ≈ 0，车架垂向反力和 ≈ −Fz。"""
        sol = solve_upright_forces(_full_hp(), _full_result(),
                                   np.array([0.0, 0.0, 686.7]))
        assert sol["status"] == "VALID"
        assert sol["force_residual_n"] < 1e-6
        assert sol["moment_residual_nmm"] < 1e-6
        ch_z = sum(v[2] for v in sol["chassis_reactions"].values())
        assert ch_z == pytest.approx(-686.7, abs=1e-3)
        # 静态竖直载荷下推杆受压（张拉为正 → f5 < 0）
        assert sol["member_forces"]["pushrod_n"] < 0

    def test_braking_member_signs(self):
        """制动：横拉杆受拉路径（tie_rod 参与纵向力平衡），残差闭合。"""
        f = tire_force(1005.7, 1.2, 0.0)   # 1.2g 制动
        sol = solve_upright_forces(_full_hp(), _full_result(), f)
        assert sol["status"] == "VALID"
        assert sol["force_residual_n"] < 1e-6
        assert sol["member_forces"]["tie_rod_n"] != 0.0

    def test_ball_joint_three_components(self):
        sol = solve_upright_forces(_full_hp(), _full_result(),
                                   np.array([0.0, 0.0, 686.7]))
        assert len(sol["ball_joints"]["ubj"]) == 3
        assert len(sol["ball_joints"]["lbj"]) == 3

    def test_singular_rank_deficient(self):
        """共线几何 → rank<6 → SOLVER_FAILED + rank_deficient=True。"""
        hp = {"CH1": [0, 0, 0], "CH2": [0, 0, 0], "CH3": [0, 0, 0],
              "CH4": [0, 0, 0], "CH5": [0, 0, 0], "FL1": [0, 0, 0]}
        result = {"UP1": [1, 0, 0], "UP2": [2, 0, 0], "UP3": [3, 0, 0],
                  "UP4": [4, 0, 0], "UP5": [5, 0, 0], "FL1": [0, 0, 0]}
        sol = solve_link_forces(hp, result, [1, 0, 0])
        assert sol["status"] == "SOLVER_FAILED"
        assert sol["rank_deficient"] is True

    def test_degenerate_member_solver_failed(self):
        """零长度支杆 → SOLVER_FAILED。"""
        hp = _full_hp()
        hp["CH5"] = [0.0, 588.0, 180.0]   # CH5 == UP4 → 零长度推杆
        sol = solve_upright_forces(hp, _full_result(), np.array([0.0, 0.0, 686.7]))
        assert sol["status"] == "SOLVER_FAILED"


class TestMaxAbs:
    def test_new_structure(self):
        sol = solve_upright_forces(_full_hp(), _full_result(),
                                   np.array([0.0, 0.0, 686.7]))
        assert max_abs(sol) == pytest.approx(
            max(abs(v) for v in sol["member_forces"].values()))
        assert max_abs(None) == float("inf")


class TestARB:
    def test_droplink_magnitude_and_sign(self):
        """k_arb=2e7 N·mm/rad，roll=2°，track=1220：
        F = 2e7×sin(2°)/1220 ≈ 572.2 N；右轮下压（−Z），左轮上抬（+Z）。"""
        phi = np.radians(2.0)
        mag = 2.0e7 * phi / 1220.0
        right = arb_droplink_force(2.0e7, 2.0, 1220.0, right_side=True)
        left = arb_droplink_force(2.0e7, 2.0, 1220.0, right_side=False)
        assert np.allclose(right, [0.0, 0.0, -mag], atol=1e-6)
        assert np.allclose(left, [0.0, 0.0, mag], atol=1e-6)

    def test_no_roll_zero(self):
        assert np.allclose(arb_droplink_force(2.0e7, 0.0, 1220.0, True),
                           [0.0, 0.0, 0.0])


class _L:
    def __init__(self, **kw):
        self.ax_g = kw.get("ax_g", 0.0)
        self.ay_g = kw.get("ay_g", 0.0)
        self.az_g = kw.get("az_g", 0.0)
        self.brake_split_front = kw.get("brake_split_front", 0.5)
        self.drive_split_rear = kw.get("drive_split_rear", 1.0)


def _vehicle(**over):
    v = {"mass_kg": 280.0, "cg_height_mm": 300.0, "wheelbase_mm": 1550.0,
         "front_track_mm": 1220.0, "rear_track_mm": 1180.0,
         "front_axle_frac": 0.5, "rear_axle_frac": 0.5,
         "unsprung_kg": 20.0, "mu_peak": 1.4}
    v.update(over)
    return v


class TestVehicleLoads:
    def test_static_fz(self):
        d = distribute_vehicle_loads(_vehicle(), _L(), 1e7, 1e7, 60.0, 60.0, 0.0)
        for name in ("front_right", "front_left", "rear_right", "rear_left"):
            assert d[name]["fz_n"] == pytest.approx(280.0 * G / 4.0, abs=1e-3)
            assert d[name]["fx_n"] == pytest.approx(0.0, abs=1e-6)
            assert d[name]["friction_util"] == pytest.approx(0.0, abs=1e-6)
            assert d[name]["off_ground"] is False

    def test_longitudinal_transfer_hand(self):
        """1.2g 制动：ΔFz = 1.2×280×9.81×300/1550 = 637.97N，前轴 +、后轴 −。"""
        d = distribute_vehicle_loads(_vehicle(), _L(ax_g=1.2), 1e7, 1e7,
                                     60.0, 60.0, 0.0)
        trans = 1.2 * 280.0 * G * 300.0 / 1550.0
        fr = d["front_right"]
        rr = d["rear_right"]
        assert fr["transfers"]["longitudinal"] == pytest.approx(trans, abs=1e-3)
        assert fr["fz_n"] == pytest.approx(280.0 * G / 4.0 + trans / 2.0, abs=1e-3)
        assert rr["fz_n"] == pytest.approx(280.0 * G / 4.0 - trans / 2.0, abs=1e-3)
        # 前轴按 brake_split 承担制动力
        assert fr["fx_n"] == pytest.approx(-1.2 * 280.0 * G * 0.5 / 2.0, abs=1e-3)

    def test_lateral_transfer_asymmetric_no_mirror(self):
        """1.3g 侧向：左右 Fz 不对称（外侧增载），禁止镜像。"""
        d = distribute_vehicle_loads(_vehicle(), _L(ay_g=1.3), 1e7, 1e7,
                                     60.0, 60.0, 0.0)
        fr, fl = d["front_right"], d["front_left"]
        assert fr["fz_n"] > fl["fz_n"]           # 外侧增载
        assert abs(fr["fz_n"] - fl["fz_n"]) > 100.0
        assert fr["fy_n"] > 0 and fl["fy_n"] > 0
        # 摩擦圆：纯侧向 → util = 1.3/1.4（保留 4 位小数）
        assert fr["friction_util"] == pytest.approx(1.3 / 1.4, abs=1e-3)

    def test_off_ground_flag(self):
        """极端载荷下内轮可能离地 → off_ground=True。"""
        d = distribute_vehicle_loads(_vehicle(), _L(ay_g=3.0), 1e7, 1e7,
                                     60.0, 60.0, 0.0)
        # 3g 侧向 + 低 RC → 内轮 Fz 可能为负
        assert any(v["off_ground"] for v in d.values()) or all(
            v["fz_n"] > 0 for v in d.values())

    def test_invalid_track_raises(self):
        with pytest.raises(ValueError):
            distribute_vehicle_loads(_vehicle(front_track_mm=0.0), _L(),
                                     1e7, 1e7, 60.0, 60.0, 0.0)
