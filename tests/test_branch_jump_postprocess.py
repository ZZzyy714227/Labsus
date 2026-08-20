"""Unit test for branch-jump post-processor."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from routes.solve import _remove_branch_jumps


def test_smooth_curve_unchanged():
    """A perfectly smooth curve should not be modified."""
    ys = [1.0, 2.0, 3.0, 4.0, 5.0]
    curve = {"camber_deg": list(ys)}
    _remove_branch_jumps(curve, [-2, -1, 0, 1, 2])
    assert curve["camber_deg"] == ys, f"unchanged: {curve['camber_deg']}"


def test_single_spike_replaced():
    """An isolated spike should be replaced with a smoothed value."""
    ys = [0.0, 0.1, 5.0, 0.2, 0.3]
    curve = {"camber_deg": list(ys)}
    _remove_branch_jumps(curve, [-2, -1, 0, 1, 2])
    # Index 2 (the spike 5.0) is replaced. The new value should be much
    # closer to the surrounding trend (around 0.1-0.3) than to 5.0.
    assert curve["camber_deg"][2] < 1.0, f"spike not removed: {curve['camber_deg']}"
    assert abs(curve["camber_deg"][2] - 5.0) > 1.0, "spike still present"


def test_realistic_branch_jump():
    """Simulate the actual front-axle camber branch jump at -15.5mm."""
    # Approximation of the buggy camber curve from user's plot:
    #   -2.0 -2.1 -2.2 | -3.0 (jump) | -2.5 -2.6 -2.7
    ys = [-2.0, -2.1, -2.2, -3.0, -2.5, -2.6, -2.7]
    curve = {"camber_deg": list(ys)}
    _remove_branch_jumps(curve, [-16, -15.5, -15, -14.5, 0, 0.5, 1.0])
    # After fix: the spike at index 3 (-3.0) should be smoothed away.
    # The replacement uses nearest non-jump neighbors (1 and 4),
    # giving an interpolated value between -2.1 and -2.5.
    assert curve["camber_deg"][3] > -2.7, (
        f"jump at index 3 not removed: {curve['camber_deg']}"
    )
    # Surrounding points (non-jumps) should be unchanged
    assert curve["camber_deg"][0] == -2.0
    assert curve["camber_deg"][1] == -2.1
    # Index 2 is also a jump (|y - pred| = 0.35 > 0.3) — it gets replaced
    # with linear interpolation from nearest non-jump neighbors
    assert -2.3 < curve["camber_deg"][2] < -2.15, curve["camber_deg"][2]
    assert curve["camber_deg"][4] == -2.5
    assert curve["camber_deg"][5] == -2.6
    assert curve["camber_deg"][6] == -2.7


def test_realistic_caster_jump():
    """Simulate the caster 2.6° jump seen in user's plot."""
    # Camber is smooth, caster has a 2.6° spike at index 3
    curve = {
        "camber_deg": [-2.0, -2.1, -2.2, -2.3, -2.4, -2.5, -2.6],
        "caster_deg": [3.5, 3.5, 3.6, 6.2, 3.5, 3.5, 3.5],
    }
    _remove_branch_jumps(curve, [-16, -15.5, -15, -14.5, 0, 0.5, 1.0])
    # Camber is smooth, no jumps expected
    assert curve["camber_deg"] == [-2.0, -2.1, -2.2, -2.3, -2.4, -2.5, -2.6]
    # Caster jump at index 3 should be removed
    assert abs(curve["caster_deg"][3] - 6.2) > 1.0, (
        f"caster spike not removed: {curve['caster_deg']}"
    )


def test_multi_pass_handles_adjacent_jumps():
    """Two adjacent jumps should be removed (algorithm requires n>=5)."""
    # Need at least 5 points for the local-median window
    curve = {"camber_deg": [0.0, 0.0, 5.0, 5.0, 0.0, 0.0]}  # 0->5 and 5->0
    _remove_branch_jumps(curve, [-1, 0, 1, 2, 3, 4])
    # Both spikes (indices 2 and 3) should be replaced
    # with interpolation from nearest non-jump neighbors
    for i in [2, 3]:
        assert abs(curve["camber_deg"][i]) < 1.0, (
            f"adjacent jump at index {i} not removed: {curve['camber_deg']}"
        )


def test_short_curve_unchanged():
    """Curves with fewer than 3 points are skipped."""
    curve = {"camber_deg": [0.0, 5.0]}
    _remove_branch_jumps(curve, [0, 1])
    assert curve["camber_deg"] == [0.0, 5.0]


def test_with_none_values_skipped():
    """Curves containing None are skipped (e.g., motion_ratio first point)."""
    curve = {"motion_ratio": [None, 1.5, 0.5]}
    _remove_branch_jumps(curve, [0, 1, 2])
    assert curve["motion_ratio"] == [None, 1.5, 0.5]


def test_ramp_of_three_consecutive_jumps():
    """3 consecutive wrong values (a ramp) should all be detected and replaced.

    Regression: the linear-interp-of-immediate-neighbors approach missed
    the middle of a ramp (the prediction coincidentally matched the
    jumped value). The local-median approach catches the entire ramp.
    """
    # 0 0 0 | 1 2 3 | 0 0 0  — three consecutive wrong values
    ys = [0.0]*5 + [1.0, 2.0, 3.0] + [0.0]*5
    curve = {"caster_deg": list(ys)}
    _remove_branch_jumps(curve, list(range(len(ys))))
    # After fix: indices 5, 6, 7 should be smoothed back to near 0
    for i in [5, 6, 7]:
        assert abs(curve["caster_deg"][i]) < 0.5, (
            f"ramp point at index {i} not removed: {curve['caster_deg'][i]}"
        )
    # Non-ramp points should be unchanged
    assert curve["caster_deg"][0:5] == [0.0]*5
    assert curve["caster_deg"][8:13] == [0.0]*5


def test_smooth_ramp_unchanged():
    """A long smooth ramp (real geometric feature) should NOT be modified."""
    # Camber progressing smoothly from -2° to -4° over 11 points (~0.2°/step)
    ys = [-2.0, -2.2, -2.4, -2.6, -2.8, -3.0, -3.2, -3.4, -3.6, -3.8, -4.0]
    curve = {"camber_deg": list(ys)}
    _remove_branch_jumps(curve, list(range(len(ys))))
    assert curve["camber_deg"] == ys, (
        f"smooth ramp was modified: {curve['camber_deg']}"
    )


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
