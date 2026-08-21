import numpy as np

from solver.mechanism.from_legacy import build_side_from_legacy
from solver.mechanism.solver import drive_to, find_limits, solve_pose


def _fr():
    return build_side_from_legacy(corner="fr")


def test_pose_zero_is_design():
    m = _fr()
    rep = solve_pose(m, 0.0, 0.0)
    assert rep.residual < 1e-6, f"zero residual={rep.residual}"
    assert rep.rocker_ok
    for n in m.nodes.values():
        assert np.allclose(n.pos, n.p0, atol=1e-5)


def test_travel_plus_20_converges():
    m = _fr()
    rep = drive_to(m, 20.0, 0.0)
    assert rep.residual <= 0.02, f"+20 residual={rep.residual}"
    assert abs(m.node("UP5").pos[2] - (m.node("UP5").p0[2] + 20.0)) < 1e-6


def test_travel_minus_20_converges():
    m = _fr()
    rep = drive_to(m, -20.0, 0.0)
    assert rep.residual <= 0.02, f"-20 residual={rep.residual}"


def test_steer_rack_moves_tie_outer():
    m = _fr()
    rep = drive_to(m, 0.0, 10.0)
    assert rep.residual <= 0.02, f"rack10 residual={rep.residual}"
    assert abs(m.node("FL1").pos[1] - (m.steer_anchor[1] + 10.0)) < 1e-6


def test_find_limits_reasonable_bounds():
    m = _fr()
    lo, hi = find_limits(m, 0.0, step=4.0)
    assert hi >= 20.0, f"upper limit too low: {hi}"
    assert lo <= -20.0, f"lower limit too shallow: {lo}"
