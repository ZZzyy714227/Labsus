"""规范锁定测试：黄金值 + 符号行为 + 已知缺陷登记（设计文档 §12/§13.2）。"""
import pytest

from core.convention import DEFAULT_CONVENTION, KNOWN_ISSUES
from hardpoints import DEFAULT_HARDPOINTS, mirror_left
from routes.solve import _solve_axle
from solver.angles import compute_alignment_angles, fix_left_angles


def _static_angles(hp):
    return compute_alignment_angles(hp, hp=hp)


class TestConventionMetadata:
    def test_axes_and_origin(self):
        c = DEFAULT_CONVENTION
        assert (c.x_axis, c.y_axis, c.z_axis) == ("forward", "right", "up")
        assert c.origin == "front_axle_center_ground"

    def test_sign_clauses_frozen(self):
        c = DEFAULT_CONVENTION
        assert c.caster_positive == "axis_top_rearward"
        assert c.kpi_positive == "axis_top_inboard"
        assert c.rack_positive == "rack_toward_vehicle_right"
        assert c.spec_revision == "v1-p0"

    def test_known_issues_registered(self):
        assert KNOWN_ISSUES == ("K-1", "K-2", "K-3", "K-4")


class TestGoldenValues:
    """默认硬点黄金值（2026-08-20 探针固化；defaults 变化时必须重审）。"""

    def test_front_right_static(self):
        a = _static_angles(DEFAULT_HARDPOINTS)
        assert a["camber_deg"] == pytest.approx(-2.49, abs=0.005)
        assert a["kpi_deg"] == pytest.approx(2.51, abs=0.005)
        assert a["caster_deg"] == pytest.approx(5.005, abs=0.005)
        assert a["toe_deg"] == pytest.approx(0.0, abs=0.005)
        assert a["scrub_radius_mm"] == pytest.approx(19.78, abs=0.01)
        assert a["caster_trail_mm"] == pytest.approx(-22.36, abs=0.01)

    def test_front_right_bump15_polish(self):
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 15.0, 0.0, mirror=False, polish=True)
        a = ax["angles_right"]
        assert a["camber_deg"] == pytest.approx(-2.174, abs=0.005)
        assert a["kpi_deg"] == pytest.approx(2.174, abs=0.005)
        assert a["caster_deg"] == pytest.approx(5.598, abs=0.005)
        assert a["toe_deg"] == pytest.approx(0.207, abs=0.005)

    def test_rack_positive_parallel_steer(self):
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 0.0, 5.0, mirror=True)
        angles_left = fix_left_angles(dict(ax["angles_left"]), ax["angles_right"])
        assert ax["angles_right"]["toe_deg"] == pytest.approx(-3.3, abs=0.05)
        assert angles_left["toe_deg"] == pytest.approx(3.3, abs=0.05)


class TestMirrorSymmetry:
    @pytest.mark.xfail(
        strict=True,
        reason="K-1：左右镜像 scrub 不对称（19.78 vs 17.84），P2 修复后必须通过并移除标记",
    )
    def test_scrub_magnitude_symmetric(self):
        a_r = _static_angles(DEFAULT_HARDPOINTS)
        hp_l = mirror_left(DEFAULT_HARDPOINTS)
        a_l = fix_left_angles(_static_angles(hp_l), a_r)
        assert a_r["scrub_radius_mm"] == pytest.approx(-a_l["scrub_radius_mm"], abs=1e-6)
