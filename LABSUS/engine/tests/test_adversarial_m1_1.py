"""
Adversarial Stress Test Suite for Milestone M1_1
Targeting:
1. slope_at_travel and _slope (kandc.py)
2. evaluate_magic_formula_fy (tire_mf.py)
3. line_intersect_2d (geometry.py)
"""
import math
import numpy as np
import pytest

from src.metrics.kandc import slope_at_travel, _slope
from src.tire_mf import evaluate_magic_formula_fy, MagicFormulaSub
from src.solver.tire_fit import _mf_fy
from src.geometry import line_intersect_2d


# ============================================================================
# TARGET 1: slope_at_travel & _slope on Extreme Curves
# ============================================================================

def test_slope_insufficient_points():
    """Empty, single point, and all-None curves."""
    assert slope_at_travel([], [], 0.0) is None
    assert _slope([], [], 0.0) == 0.0

    assert slope_at_travel([1.0], [0.0], 0.0) is None
    assert _slope([1.0], [0.0], 0.0) == 0.0

    assert slope_at_travel([None], [0.0], 0.0) is None
    assert _slope([None], [0.0], 0.0) == 0.0

    assert slope_at_travel([None, None, None], [0.0, 1.0, 2.0], 1.0) is None
    assert _slope([None, None, None], [0.0, 1.0, 2.0], 1.0) == 0.0

    assert slope_at_travel([None, 5.0, None], [0.0, 1.0, 2.0], 1.0) is None
    assert _slope([None, 5.0, None], [0.0, 1.0, 2.0], 1.0) == 0.0


def test_slope_none_holes():
    """None holes at endpoints and interior."""
    # 2 valid points with None holes
    curve = [None, 10.0, None, None, 20.0, None]
    travel = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]

    # At travel = 2.5 (between 1.0 and 4.0)
    res = slope_at_travel(curve, travel, 2.5)
    assert res is not None
    slope, lo, hi = res
    assert lo == 1 and hi == 4
    assert abs(slope - (20.0 - 10.0) / (4.0 - 1.0)) < 1e-12
    assert abs(_slope(curve, travel, 2.5) - 10.0 / 3.0) < 1e-12

    # At travel = 1.0 (exact first valid point)
    res_at_1 = slope_at_travel(curve, travel, 1.0)
    assert res_at_1 is not None
    assert res_at_1[1] == 1 and res_at_1[2] == 4
    assert abs(res_at_1[0] - 10.0 / 3.0) < 1e-12

    # At travel = 4.0 (exact second valid point)
    res_at_4 = slope_at_travel(curve, travel, 4.0)
    assert res_at_4 is not None
    assert res_at_4[1] == 1 and res_at_4[2] == 4
    assert abs(res_at_4[0] - 10.0 / 3.0) < 1e-12


def test_slope_duplicate_x_coordinates():
    """Duplicate x-coordinates: identical travel points, zero delta-x."""
    # All x identical
    curve = [1.0, 2.0, 3.0]
    travel = [5.0, 5.0, 5.0]
    assert slope_at_travel(curve, travel, 5.0) is None
    assert _slope(curve, travel, 5.0) == 0.0

    # Duplicates at query point
    curve2 = [10.0, 20.0, 30.0, 40.0]
    travel2 = [-1.0, 0.0, 0.0, 1.0]
    assert slope_at_travel(curve2, travel2, 0.0) is None
    assert _slope(curve2, travel2, 0.0) == 0.0

    # Micro-step dx < 1e-12
    curve3 = [10.0, 20.0]
    travel3 = [0.0, 1e-13]
    assert slope_at_travel(curve3, travel3, 0.0) is None
    assert _slope(curve3, travel3, 0.0) == 0.0


def test_slope_far_out_of_bounds():
    """Query points far beyond curve boundaries."""
    curve = [0.0, 10.0, 20.0]
    travel = [0.0, 1.0, 2.0]

    # Far below -> should use first two points
    res_low = slope_at_travel(curve, travel, -1e9)
    assert res_low is not None
    assert res_low[1] == 0 and res_low[2] == 1
    assert abs(res_low[0] - 10.0) < 1e-12

    # Far above -> should use last two points
    res_high = slope_at_travel(curve, travel, 1e9)
    assert res_high is not None
    assert res_high[1] == 1 and res_high[2] == 2
    assert abs(res_high[0] - 10.0) < 1e-12


def test_slope_random_noise_fuzzing():
    """Fuzz slope_at_travel with 2,000 randomized curves."""
    rng = np.random.default_rng(42)
    for _ in range(2000):
        n = rng.integers(2, 30)
        # Random monotonically non-decreasing travel with possible duplicates
        steps = rng.exponential(scale=2.0, size=n)
        # Randomly zero out some steps to create duplicate x
        if rng.random() < 0.3:
            steps[rng.integers(0, n)] = 0.0
        # Random micro steps
        if rng.random() < 0.2:
            steps[rng.integers(0, n)] = 1e-14
        travel = np.cumsum(steps).tolist()

        # Random curve with None holes
        curve_vals = rng.normal(loc=0.0, scale=100.0, size=n).tolist()
        if rng.random() < 0.5:
            # Introduce None holes
            hole_indices = rng.choice(n, size=rng.integers(1, n), replace=False)
            for idx in hole_indices:
                curve_vals[idx] = None

        # Random query points: inside, outside, exact knots
        queries = [
            travel[0] - 10.0,
            travel[-1] + 10.0,
            travel[rng.integers(0, n)],
            rng.uniform(travel[0], travel[-1]),
        ]

        for q in queries:
            try:
                res = slope_at_travel(curve_vals, travel, q)
                s = _slope(curve_vals, travel, q)
                if res is None:
                    assert s == 0.0
                else:
                    val, lo, hi = res
                    assert s == val
                    assert math.isfinite(val)
                    dx = travel[hi] - travel[lo]
                    assert abs(dx) >= 1e-12
                    expected = (curve_vals[hi] - curve_vals[lo]) / dx
                    assert abs(val - expected) < 1e-12
            except Exception as exc:
                pytest.fail(f"slope_at_travel raised unexpected exception: {exc}")


# ============================================================================
# TARGET 2: evaluate_magic_formula_fy vs Mathematical Reference
# ============================================================================

def _math_ref_magic_formula_fy(
    a_rad: np.ndarray,
    fz: float,
    Fy0: float,
    By: float,
    Cy: float,
    Ey: float,
    LS: float = 0.0,
    FzNom: float = 3500.0,
    Sh: float = 0.0,
    Sv: float = 0.0,
) -> np.ndarray:
    """Direct independent mathematical definition of Pacejka lateral force."""
    a = np.asarray(a_rad, dtype=float) + Sh
    if fz <= 0:
        return np.zeros_like(a)
    r = fz / FzNom
    d = Fy0 * r
    if LS:
        d *= max(0.1, 1.0 - LS * (r - 1.0))
    x = By * a
    return d * np.sin(Cy * np.arctan(x - Ey * (x - np.arctan(x)))) + Sv


def test_mf_fy_direct_math_wide_slip_angles():
    """Challenge evaluate_magic_formula_fy across -90° to +90° and wide Fz ranges."""
    alphas_deg = np.linspace(-90.0, 90.0, 3601)  # 0.05° resolution
    alphas_rad = np.deg2rad(alphas_deg)

    fz_cases = [-500.0, 0.0, 1.0, 50.0, 500.0, 1750.0, 3500.0, 7000.0, 14000.0, 50000.0]

    param_sets = [
        # Baseline GT3 slick
        {"Fy0": 5250.0, "By": 20.0, "Cy": 1.2, "Ey": -0.5, "LS": 0.0, "FzNom": 3500.0, "Sh": 0.0, "Sv": 0.0},
        # GT3 slick with Load Sensitivity
        {"Fy0": 5250.0, "By": 20.0, "Cy": 1.2, "Ey": -0.5, "LS": 0.0002, "FzNom": 3500.0, "Sh": 0.0, "Sv": 0.0},
        # High LS (saturating max(0.1, ...))
        {"Fy0": 5250.0, "By": 20.0, "Cy": 1.2, "Ey": -0.5, "LS": 0.5, "FzNom": 3500.0, "Sh": 0.0, "Sv": 0.0},
        # Asymmetric shifts (conicity & ply steer)
        {"Fy0": 5250.0, "By": 20.0, "Cy": 1.2, "Ey": -0.5, "LS": 0.0001, "FzNom": 3500.0, "Sh": 0.02, "Sv": 150.0},
        # Legacy placeholder parameters
        {"Fy0": 8000.0, "By": 9.0, "Cy": 1.3, "Ey": -1.0, "LS": 0.0, "FzNom": 3500.0, "Sh": 0.0, "Sv": 0.0},
        # Extreme curvature and shape factors
        {"Fy0": 6000.0, "By": 30.0, "Cy": 1.6, "Ey": 0.8, "LS": 0.0001, "FzNom": 3000.0, "Sh": -0.01, "Sv": -50.0},
    ]

    max_abs_err = 0.0
    for params in param_sets:
        for fz in fz_cases:
            actual = evaluate_magic_formula_fy(alphas_rad, fz, **params)
            expected = _math_ref_magic_formula_fy(alphas_rad, fz, **params)

            # Check finite and shape
            assert actual.shape == alphas_rad.shape
            assert np.all(np.isfinite(actual))

            # Max absolute difference
            diff = np.max(np.abs(actual - expected))
            if diff > max_abs_err:
                max_abs_err = diff
            assert diff < 1e-12, f"Discrepancy {diff} on params {params}, fz={fz}"

            # Check delegation parity with MagicFormulaSub
            p_dict = {
                "Fy0": params["Fy0"], "By": params["By"], "Cy": params["Cy"],
                "Ey": params["Ey"], "LS": params["LS"], "FzNom": params["FzNom"],
                "Sh": params["Sh"], "Sv": params["Sv"],
            }
            mf_sub = MagicFormulaSub(p_dict)
            sub_res = mf_sub.fy_rad(alphas_rad, fz)
            assert np.array_equal(actual, sub_res)

            # Check delegation parity with tire_fit._mf_fy (when Sh=0, Sv=0, FzNom=3500)
            if params["Sh"] == 0.0 and params["Sv"] == 0.0 and params["FzNom"] == 3500.0:
                p_arr = np.array([params["Fy0"], params["By"], params["Cy"], params["Ey"], params["LS"]])
                fit_res = _mf_fy(p_arr, alphas_rad, fz)
                assert np.array_equal(actual, fit_res)

    print(f"\n[MF_FY Stress] Evaluated {len(param_sets) * len(fz_cases) * len(alphas_rad)} points.")
    print(f"[MF_FY Stress] Maximum absolute error vs math reference: {max_abs_err:.2e}")


def test_mf_fy_extreme_slip_boundedness():
    """Test extreme slip angles up to 100 radians and verify mathematical bounds."""
    extreme_alphas = np.array([-100.0, -10.0, -np.pi, -np.pi/2, 0.0, np.pi/2, np.pi, 10.0, 100.0])
    fz = 4000.0
    res = evaluate_magic_formula_fy(extreme_alphas, fz, Fy0=5000.0, By=20.0, Cy=1.2, Ey=-0.5)
    # Peak D = 5000 * (4000/3500) = 5714.28 N
    d_peak = 5000.0 * (4000.0 / 3500.0)
    # Sine is bounded by [-1, 1], so res must never exceed [-d_peak, d_peak]
    assert np.all(np.abs(res) <= d_peak + 1e-9)
    assert np.all(np.isfinite(res))


def test_mf_fy_negative_fz_strict_zero():
    """Ensure non-positive Fz strictly returns zeros without exception."""
    alphas = np.linspace(-1.0, 1.0, 100)
    for bad_fz in [-1e6, -100.0, -1e-9, 0.0]:
        res = evaluate_magic_formula_fy(alphas, bad_fz, Fy0=5000.0, By=20.0, Cy=1.2, Ey=-0.5)
        assert np.all(res == 0.0)


# ============================================================================
# TARGET 3: line_intersect_2d on Parallel & Nearly-Parallel Lines
# ============================================================================

def test_line_intersect_strictly_parallel():
    """Identical, opposite, and scaled parallel lines."""
    # Parallel horizontal lines
    assert line_intersect_2d([0, 0], [1, 0], [0, 5], [1, 0]) is None
    assert line_intersect_2d([0, 0], [1, 0], [0, 5], [-1, 0]) is None
    assert line_intersect_2d([0, 0], [1, 0], [0, 5], [2.5, 0]) is None

    # Parallel inclined lines
    assert line_intersect_2d([1, 2], [3, 4], [5, 6], [3, 4]) is None
    assert line_intersect_2d([1, 2], [3, 4], [5, 6], [-6, -8]) is None

    # Collinear (overlapping) lines
    assert line_intersect_2d([0, 0], [1, 1], [3, 3], [1, 1]) is None

    # Zero direction vectors
    assert line_intersect_2d([0, 0], [0, 0], [1, 1], [1, 0]) is None
    assert line_intersect_2d([0, 0], [1, 0], [1, 1], [0, 0]) is None
    assert line_intersect_2d([0, 0], [0, 0], [1, 1], [0, 0]) is None


def test_line_intersect_nearly_parallel_cutoff():
    """Test cutoff around 1e-12 threshold."""
    p1 = [0.0, 0.0]
    d1 = [1.0, 0.0]
    p2 = [0.0, 1.0]

    # Angle theta where denom = sin(theta)
    # Below cutoff: denom = 0.99e-12 -> None
    theta_below = 0.99e-12
    d2_below = [math.cos(theta_below), math.sin(theta_below)]
    assert line_intersect_2d(p1, d1, p2, d2_below) is None

    # Above cutoff: denom = 1.01e-12 -> returns intersection
    theta_above = 1.01e-12
    d2_above = [math.cos(theta_above), math.sin(theta_above)]
    pt = line_intersect_2d(p1, d1, p2, d2_above)
    assert pt is not None
    assert np.all(np.isfinite(pt))
    # Line 1 is y=0, so intersection y must be 0
    assert abs(pt[1] - 0.0) < 1e-12
    # Verify pt lies on line 2: (pt - p2) is parallel to d2
    v = pt - np.array(p2)
    cross_2d = v[0] * d2_above[1] - v[1] * d2_above[0]
    assert abs(cross_2d) < 1e-6


def test_line_intersect_accuracy_well_conditioned():
    """Verify high-accuracy intersections against analytical solutions."""
    # Orthogonal intersection at (3, 4)
    pt = line_intersect_2d([3, 0], [0, 1], [0, 4], [1, 0])
    np.testing.assert_allclose(pt, [3.0, 4.0], atol=1e-14)

    # 45-degree intersection at (2, 2)
    pt2 = line_intersect_2d([0, 0], [1, 1], [0, 4], [1, -1])
    np.testing.assert_allclose(pt2, [2.0, 2.0], atol=1e-14)


def test_line_intersect_unnormalized_scaling_behavior():
    """
    Adversarial analysis: line_intersect_2d uses unnormalized determinant:
    denom = d1[0]*d2[1] - d1[1]*d2[0].
    If vectors are scaled tiny (< 1e-6), denom can be < 1e-12 even for orthogonal lines!
    Verify this empirical behavior and document it.
    """
    # Orthogonal lines, but directions scaled down by 1e-7
    p1 = [0.0, 0.0]
    d1 = [1e-7, 0.0]
    p2 = [0.0, 1.0]
    d2 = [0.0, 1e-7]
    denom = d1[0]*d2[1] - d1[1]*d2[0]  # = 1e-14 < 1e-12
    res = line_intersect_2d(p1, d1, p2, d2)
    # Documents that unnormalized tiny vectors return None due to unnormalized denom check
    assert res is None, "Empirically confirms scale dependence when vectors have small norms"


# ============================================================================
# ADDITIONAL EMPIRICAL STRESS & DIFFERENTIAL KERNEL ANALYSIS
# ============================================================================

def test_slope_exact_interior_knot_difference_scheme():
    """
    Empirical finding: When at_travel is exactly on an interior sample point,
    slope_at_travel uses backward difference [lo_idx-1, lo_idx] rather than
    symmetric central difference [lo_idx-1, lo_idx+1].
    On linear curves this is exact; on non-linear curves it reflects backward difference.
    """
    # y = x^2, sampled at x = [-2, -1, 0, 1, 2], y = [4, 1, 0, 1, 4]
    x = [-2.0, -1.0, 0.0, 1.0, 2.0]
    y = [4.0, 1.0, 0.0, 1.0, 4.0]
    
    # At x = 0.0:
    res = slope_at_travel(y, x, 0.0)
    assert res is not None
    slope, lo, hi = res
    # Empirically verify that lo=1 (x=-1) and hi=2 (x=0) -> backward difference
    assert lo == 1 and hi == 2
    assert slope == (0.0 - 1.0) / (0.0 - (-1.0))  # = -1.0
    
    # At x = 0.5 (between sample points):
    res_mid = slope_at_travel(y, x, 0.5)
    assert res_mid is not None
    # lo=2 (x=0), hi=3 (x=1) -> forward on [0, 1]
    assert res_mid[1] == 2 and res_mid[2] == 3
    assert res_mid[0] == (1.0 - 0.0) / (1.0 - 0.0)  # = +1.0


def test_mf_fy_scalar_and_nd_input_types():
    """Verify polymorphic input types (Python float, list, 1D/2D arrays)."""
    # Scalar float
    s_res = evaluate_magic_formula_fy(0.05, 3500.0, Fy0=5250.0, By=20.0, Cy=1.2, Ey=-0.5)
    assert isinstance(s_res, (np.ndarray, np.floating, float))
    assert math.isfinite(float(s_res))
    assert float(s_res) > 0.0

    # Python list
    l_res = evaluate_magic_formula_fy([0.0, 0.05, 0.1], 3500.0, Fy0=5250.0, By=20.0, Cy=1.2, Ey=-0.5)
    assert isinstance(l_res, np.ndarray)
    assert len(l_res) == 3
    assert abs(l_res[0]) < 1e-12

    # 2D array
    grid = np.array([[0.0, 0.05], [0.1, 0.15]])
    g_res = evaluate_magic_formula_fy(grid, 3500.0, Fy0=5250.0, By=20.0, Cy=1.2, Ey=-0.5)
    assert g_res.shape == (2, 2)
    assert np.all(np.isfinite(g_res))


def test_line_intersect_conditioning_and_drift():
    """
    Stress-test line_intersect_2d for conditioning and drift
    from theta = 1e-2 down to cutoff 1e-12.
    """
    p1 = np.array([0.0, 0.0])
    d1 = np.array([1.0, 0.0])
    p2 = np.array([0.0, 1.0])

    for exp in range(2, 12):
        theta = 10.0 ** (-exp)
        d2 = np.array([math.cos(theta), math.sin(theta)])
        pt = line_intersect_2d(p1, d1, p2, d2)
        assert pt is not None
        # Line 2: y = 1 + t*sin(theta), x = t*cos(theta). Intersection with y=0 requires t = -1/sin(theta),
        # so x = -cos(theta)/sin(theta) = -1/tan(theta).
        expected_x = -1.0 / math.tan(theta)
        assert abs(pt[1]) < 1e-12
        rel_err = abs(pt[0] - expected_x) / abs(expected_x)
        assert rel_err < 1e-4, f"Relative error {rel_err} too high at theta=1e-{exp}"



if __name__ == "__main__":
    pytest.main([__file__, "-v"])

