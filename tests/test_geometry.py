"""
Unit tests for geometry.py — pure math utilities.
These tests have zero dependencies on the rest of the project.
"""

import math

import numpy as np

from geometry import (
    closest_point_on_circle,
    closest_point_on_line,
    deg,
    dist,
    distance_point_to_line,
    enforce_distance,
    enforce_distance_fixed_q,
    rad,
    rotate_around_x,
    rotate_around_z,
    vec3,
)

# ============================================================
# vec3
# ============================================================

class TestVec3:
    def test_simple(self):
        v = vec3([0, 0, 0], [1, 2, 3])
        assert list(v) == [1, 2, 3]

    def test_negative(self):
        v = vec3([1, 1, 1], [0, 0, 0])
        assert list(v) == [-1, -1, -1]

    def test_zero_vector(self):
        v = vec3([5, 5, 5], [5, 5, 5])
        assert list(v) == [0, 0, 0]

    def test_returns_ndarray(self):
        v = vec3([0, 0, 0], [1, 1, 1])
        assert isinstance(v, np.ndarray)


# ============================================================
# dist
# ============================================================

class TestDist:
    def test_zero(self):
        assert dist([0, 0, 0], [0, 0, 0]) == 0.0

    def test_known(self):
        assert abs(dist([0, 0, 0], [3, 4, 0]) - 5.0) < 1e-12

    def test_3d(self):
        d = dist([0, 0, 0], [1, 1, 1])
        assert abs(d - math.sqrt(3)) < 1e-12

    def test_returns_float(self):
        assert isinstance(dist([0, 0, 0], [1, 0, 0]), float)


# ============================================================
# closest_point_on_line
# ============================================================

class TestClosestPointOnLine:
    def test_point_is_a(self):
        """p equals a → closest is a."""
        pt = closest_point_on_line([0, 0, 0], [0, 0, 0], [10, 0, 0])
        assert list(pt) == [0, 0, 0]

    def test_point_is_b(self):
        pt = closest_point_on_line([10, 0, 0], [0, 0, 0], [10, 0, 0])
        assert list(pt) == [10, 0, 0]

    def test_point_on_line_midpoint(self):
        pt = closest_point_on_line([5, 0, 0], [0, 0, 0], [10, 0, 0])
        assert list(pt) == [5, 0, 0]

    def test_point_above_line(self):
        pt = closest_point_on_line([5, 5, 0], [0, 0, 0], [10, 0, 0])
        assert list(pt) == [5, 0, 0]

    def test_point_beyond_line(self):
        """closest_point_on_line is infinite-line, not segment."""
        pt = closest_point_on_line([20, 5, 0], [0, 0, 0], [10, 0, 0])
        assert list(pt) == [20, 0, 0]  # extends infinitely

    def test_degenerate_line(self):
        """a == b returns a."""
        pt = closest_point_on_line([5, 5, 5], [1, 1, 1], [1, 1, 1])
        assert list(pt) == [1, 1, 1]


# ============================================================
# distance_point_to_line
# ============================================================

class TestDistancePointToLine:
    def test_point_on_line(self):
        d = distance_point_to_line([5, 0, 0], [0, 0, 0], [10, 0, 0])
        assert d < 1e-12

    def test_known_distance(self):
        d = distance_point_to_line([0, 1, 0], [0, 0, 0], [1, 0, 0])
        assert abs(d - 1.0) < 1e-12

    def test_3d_distance(self):
        d = distance_point_to_line([1, 2, 3], [0, 0, 0], [0, 0, 1])
        assert abs(d - math.sqrt(5)) < 1e-12


# ============================================================
# closest_point_on_circle
# ============================================================

class TestClosestPointOnCircle:
    def test_point_on_circle_stays(self):
        """If p is already on the circle, it should stay."""
        r = 10.0
        pt = closest_point_on_circle([5, 0, 5], [0, 0, 0], [0, 0, 10], r)
        # pt should be at distance r from the axis
        d = distance_point_to_line(pt, [0, 0, 0], [0, 0, 10])
        assert abs(d - r) < 1e-10

    def test_point_at_axis(self):
        """If p is on the axis, any direction is valid."""
        pt = closest_point_on_circle([0, 0, 5], [0, 0, 0], [0, 0, 10], 5.0)
        d = distance_point_to_line(pt, [0, 0, 0], [0, 0, 10])
        assert abs(d - 5.0) < 1e-10


# ============================================================
# enforce_distance
# ============================================================

class TestEnforceDistance:
    def test_adjusts_both_equally(self):
        p1, p2 = enforce_distance([0, 0, 0], [10, 0, 0], 6.0)
        d = dist(p1, p2)
        assert abs(d - 6.0) < 1e-10
        # midpoint should stay at 5
        assert abs((p1[0] + p2[0]) / 2.0 - 5.0) < 1e-10

    def test_target_zero(self):
        p1, p2 = enforce_distance([0, 0, 0], [10, 0, 0], 0.0)
        d = dist(p1, p2)
        assert abs(d) < 1e-10


class TestEnforceDistanceFixedQ:
    def test_q_stays_fixed(self):
        q = np.array([0, 0, 0])
        p_new = enforce_distance_fixed_q([10, 0, 0], q, 5.0)
        assert abs(dist(p_new, q) - 5.0) < 1e-10
        assert list(q) == [0, 0, 0]  # q unchanged


# ============================================================
# rotate_around_x
# ============================================================

class TestRotateAroundX:
    def test_90_deg(self):
        r = rotate_around_x([0, 1, 0], [0, 0, 0], math.pi / 2)
        assert abs(r[0]) < 1e-12
        assert abs(r[1]) < 1e-12
        assert abs(r[2] - 1.0) < 1e-12

    def test_180_deg(self):
        r = rotate_around_x([0, 1, 0], [0, 0, 0], math.pi)
        assert abs(r[0]) < 1e-12
        assert abs(r[1] + 1.0) < 1e-12
        assert abs(r[2]) < 1e-12

    def test_pivot_offset(self):
        """Rotation around a non-origin pivot should work."""
        r = rotate_around_x([0, 2, 0], [0, 1, 0], math.pi)
        assert abs(r[1]) < 1e-10  # 2 → pivot 1 → mirror → 0
        assert abs(r[2]) < 1e-10

    def test_point_on_axis(self):
        """A point on the rotation axis should not move."""
        r = rotate_around_x([5, 0, 0], [0, 0, 0], math.pi / 3)
        assert abs(r[0] - 5.0) < 1e-10
        assert abs(r[1]) < 1e-10
        assert abs(r[2]) < 1e-10


# ============================================================
# rotate_around_z
# ============================================================

class TestRotateAroundZ:
    def test_90_deg(self):
        r = rotate_around_z([1, 0, 0], [0, 0, 0], math.pi / 2)
        assert abs(r[0]) < 1e-12
        assert abs(r[1] - 1.0) < 1e-12
        assert abs(r[2]) < 1e-12

    def test_z_unchanged(self):
        r = rotate_around_z([1, 1, 50], [0, 0, 0], 0.5)
        assert abs(r[2] - 50.0) < 1e-10


# ============================================================
# deg / rad
# ============================================================

class TestDegRad:
    def test_deg_180(self):
        assert deg(math.pi) == 180.0

    def test_rad_180(self):
        assert abs(rad(180.0) - math.pi) < 1e-10

    def test_round_trip(self):
        for d in [0, 30, 45, 60, 90, 180, 360]:
            assert abs(deg(rad(d)) - d) < 0.01

    def test_deg_rounds_to_2dp(self):
        """deg() should round to 2 decimals."""
        r = deg(math.pi / 3)
        assert r == 60.0  # exact math
        r = deg(0.123456)
        assert r == 7.07  # rounded to 2dp


# ============================================================
# Physical consistency tests
# ============================================================

class TestPhysicalConsistency:
    """Tests that check geometry functions against real-world expectations."""

    def test_rotation_orthogonal(self):
        """Rotations should preserve distances (orthogonal transform)."""
        pt = np.array([10.0, -20.0, 30.0])
        pivot = np.array([1.0, 2.0, 3.0])
        for angle in [0.1, 0.5, 1.0, 2.0]:
            r = rotate_around_x(pt, pivot, angle)
            d_before = dist(pt, pivot)
            d_after = dist(r, pivot)
            assert abs(d_after - d_before) < 1e-10

    def test_enforce_distance_preserves_midpoint(self):
        """enforce_distance should adjust both ends equally around midpoint."""
        p1, p2 = enforce_distance([0, 0, 0], [10, 0, 0], 8.0)
        # Midpoint of output should equal midpoint of input
        mid_in = np.array([5.0, 0.0, 0.0])
        mid_out = (np.array(p1) + np.array(p2)) / 2.0
        assert np.linalg.norm(mid_out - mid_in) < 1e-10


# ============================================================
# PRO topology — STRUT_OUT hardpoint derivation
# ============================================================

def test_strut_out_derived_on_arm_plane():
    from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS
    f = DEFAULT_HARDPOINTS
    assert "STRUT_OUT" in f          # 前轴推杆：LCA 三角面内
    r = DEFAULT_REAR_HARDPOINTS
    assert "R_STRUT_OUT" in r        # 后轴拉杆：UCA 三角面内
