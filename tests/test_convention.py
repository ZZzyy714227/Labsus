"""规范锁定测试：黄金值 + 符号行为 + 已知缺陷登记（设计文档 §12/§13.2，P2-0 更新）。

P2-0 冻结的车辆全局符号约定（两侧一致，无 fix_left_angles 翻号）：
- Camber：负 = 胎顶向内（内倾），两侧相同；
- Toe：正 = Toe-in（轮前指向中心线），两侧相同；
- KPI：正 = 主销轴上端向内，两侧相同；
- Caster：正 = 主销轴上端后倾（经典），两侧相同；
- Scrub：正 = 接地印迹在主销接地点外侧，两侧相同；
- Trail：正 = 主销接地点在接地印迹前方（经典），两侧相同。
"""
import pytest

from core.convention import DEFAULT_CONVENTION, KNOWN_ISSUES
from hardpoints import DEFAULT_HARDPOINTS, mirror_left
from routes.solve import _solve_axle
from solver.angles import compute_alignment_angles


def _static_angles(hp):
    return compute_alignment_angles(hp, hp=hp)


class TestConventionMetadata:
    def test_axes_and_origin(self):
        c = DEFAULT_CONVENTION
        assert (c.x_axis, c.y_axis, c.z_axis) == ("forward", "right", "up")
        assert c.origin == "front_axle_center_ground"

    def test_sign_clauses_frozen(self):
        c = DEFAULT_CONVENTION
        assert c.camber_positive == "top_in"
        assert c.toe_positive == "toe_in_positive"
        assert c.kpi_positive == "axis_top_inboard"
        assert c.caster_positive == "axis_top_rearward"
        assert c.scrub_definition == "contact_outboard_of_kingpin_positive"
        assert c.trail_definition == "kingpin_ground_ahead_of_contact_positive"
        assert c.rack_positive == "rack_toward_vehicle_right"
        assert c.spec_revision == "v1-p2-0"

    def test_known_issues_registered(self):
        # K-1/K-2/K-3 已由 P2-0 修复并移除登记；K-4 仍开放。
        assert KNOWN_ISSUES == ("K-4",)


class TestGoldenValues:
    """默认硬点黄金值（P2-0 重新探针固化；defaults 变化时必须重审）。"""

    def test_front_right_static(self):
        a = _static_angles(DEFAULT_HARDPOINTS)
        assert a["camber_deg"] == pytest.approx(-2.49, abs=0.005)
        assert a["kpi_deg"] == pytest.approx(2.51, abs=0.005)
        assert a["caster_deg"] == pytest.approx(5.005, abs=0.005)
        assert a["toe_deg"] == pytest.approx(0.0, abs=0.005)
        assert a["scrub_radius_mm"] == pytest.approx(29.90, abs=0.01)
        assert a["caster_trail_mm"] == pytest.approx(22.40, abs=0.01)

    def test_front_right_bump15_polish(self):
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 15.0, 0.0, mirror=False, polish=True)
        a = ax["angles_right"]
        # 数值由求解器在当前默认几何上探针固化（P2-0 主销倾角符号修正后；
        # caster 由 5.598 变为 5.009 是因为默认几何从反 caster 修正为经典正 caster）。
        assert a["camber_deg"] == pytest.approx(-2.16, abs=0.02)
        assert a["kpi_deg"] == pytest.approx(2.16, abs=0.02)
        assert a["caster_deg"] == pytest.approx(5.009, abs=0.02)
        assert a["toe_deg"] == pytest.approx(0.187, abs=0.02)

    def test_rack_positive_parallel_steer(self):
        """rack=+5mm 时两轮前向同指 -Y（平行同向偏转）；
        P2-0 后右轮为 toe-in（正），左轮为 toe-out（负），符号相反但物理一致。
        幅值差（3.33 vs 3.42）来自镜像求解路径对两侧施加同一 rack 位移的建模差异，
        属镜像路径已知特性（P2-1 独立实例求解时复核）。"""
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 0.0, 5.0, mirror=True)
        assert ax["angles_right"]["toe_deg"] == pytest.approx(3.3, abs=0.15)
        assert ax["angles_left"]["toe_deg"] == pytest.approx(-3.3, abs=0.15)
        # 平行转向：两侧前向同向 → toe 符号相反（内轮 toe-in / 外轮 toe-out）
        assert ax["angles_right"]["toe_deg"] * ax["angles_left"]["toe_deg"] < 0


class TestMirrorSymmetry:
    """设计文档 §13.2：完全镜像输入的对应结果差异 ≤ 1e-6（P2-0 修复 K-1 后必须严格通过）。"""

    def test_static_angles_mirror_symmetric(self):
        a_r = _static_angles(DEFAULT_HARDPOINTS)
        hp_l = mirror_left(DEFAULT_HARDPOINTS)
        a_l = _static_angles(hp_l)
        for key in ("camber_deg", "kpi_deg", "caster_deg", "toe_deg",
                    "scrub_radius_mm", "caster_trail_mm"):
            assert a_r[key] == pytest.approx(a_l[key], abs=1e-6), (
                f"{key} 左右不对称: R={a_r[key]} L={a_l[key]}"
            )

class TestToeSignConvention:
    """K-2：Toe-in = 正（两侧统一车辆全局约定）。"""

    def test_toe_in_positive_right(self):
        """右轮前向指向 -Y（朝中心线）即 toe-in，必须为正。"""
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 0.0, 5.0, mirror=False)
        assert ax["angles_right"]["toe_deg"] > 0

    def test_toe_out_negative_right(self):
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 0.0, -5.0, mirror=False)
        assert ax["angles_right"]["toe_deg"] < 0

    def test_toe_monotonic_with_rack(self):
        """rack 单调递增 → 右轮 toe 单调递增（无 180° 跳变，K-2 修复）。"""
        toes = []
        for rack in [-15, -10, -5, 0, 5, 10, 15]:
            ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 0.0, float(rack), mirror=False)
            toes.append(ax["angles_right"]["toe_deg"])
        for i in range(1, len(toes)):
            assert toes[i] > toes[i - 1], (
                f"toe 非单调: {toes[i - 1]} → {toes[i]}"
            )
        assert all(abs(t) < 90 for t in toes)
