
from hardpoints import DEFAULT_HARDPOINTS
from solver.mechanism.from_legacy import build_side_from_legacy
from solver.mechanism.pose import solve_to_angles

_ANG = ("camber_deg", "kpi_deg", "caster_deg", "toe_deg", "scrub_radius_mm", "caster_trail_mm")


def _ang(corner, travel, rack):
    m = build_side_from_legacy(corner=corner)
    return solve_to_angles(m, travel, rack, hp=DEFAULT_HARDPOINTS)


def test_mirror_symmetry_right_left():
    fr = _ang("fr", 0.0, 0.0)
    fl = _ang("fl", 0.0, 0.0)
    for k in _ANG:
        assert abs(fr[k] - fl[k]) < 1e-9, f"{k}: fr={fr[k]} fl={fl[k]}"


def test_steer_rack_opposing_toe_sign():
    fr = _ang("fr", 0.0, 10.0)
    fl = _ang("fl", 0.0, 10.0)
    # 平行转向：两侧 toe 异号（右轮 toe-in 正、左轮 toe-out 负，convention K-2）
    assert fr["toe_deg"] * fl["toe_deg"] < 0.0, f"fr={fr['toe_deg']} fl={fl['toe_deg']}"


def test_classic_signs_right():
    a = _ang("fr", 0.0, 0.0)
    # K-3/K-1 修复后约定：经典正 caster、正 KPI、正 scrub（接地点在主销接地外侧）
    assert a["caster_deg"] > 0.0
    assert a["kpi_deg"] > 0.0
    assert a["scrub_radius_mm"] > 0.0


def test_mirror_symmetry_rear():
    rr = _ang("rr", 0.0, 0.0)
    rl = _ang("rl", 0.0, 0.0)
    for k in _ANG:
        assert abs(rr[k] - rl[k]) < 1e-9, f"{k}: rr={rr[k]} rl={rl[k]}"
