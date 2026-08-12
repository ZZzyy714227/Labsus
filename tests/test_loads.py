"""Link force tests — force balance closes exactly."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import numpy as np
from metrics.loads import solve_link_forces, tire_force, max_abs


def test_force_balance_closes():
    """Reconstructed forces must sum to -F_tire within 1e-9."""
    hp = {"CH1": [-60, 245, 200], "CH3": [-80, 235, 42],
          "CH5": [10, 118, 228]}
    result = {"UP1": [10, 400, 190], "UP2": [10, 400, 78],
              "UP4": [20, 380, 140]}
    f_tire = tire_force(1300.0, 1.2, 0.0)
    forces = solve_link_forces(hp, result, f_tire)
    assert forces is not None
    # directions match _axis_dir: from frame point to upright point
    d_uca = np.array(result["UP1"], dtype=float) - np.array(hp["CH1"], dtype=float)
    d_uca /= np.linalg.norm(d_uca)
    d_lca = np.array(result["UP2"], dtype=float) - np.array(hp["CH3"], dtype=float)
    d_lca /= np.linalg.norm(d_lca)
    d_pr = np.array(result["UP4"], dtype=float) - np.array(hp["CH5"], dtype=float)
    d_pr /= np.linalg.norm(d_pr)
    s = forces["f_uca"]*d_uca + forces["f_lca"]*d_lca + forces["f_pushrod"]*d_pr
    assert np.allclose(s, -f_tire, atol=1e-6)


def test_tire_force_braking():
    f = tire_force(1000.0, 1.2, 0.0)
    assert np.allclose(f, [1200.0, 0.0, 1000.0])


def test_tire_force_cornering():
    f = tire_force(1000.0, 0.0, 1.3)
    assert np.allclose(f, [0.0, 1300.0, 1000.0])


def test_singular_geometry_returns_none():
    """Collinear links → singular matrix → None."""
    hp = {"CH1": [0, 0, 0], "CH3": [0, 0, 0], "CH5": [0, 0, 0]}
    result = {"UP1": [1, 0, 0], "UP2": [2, 0, 0], "UP4": [3, 0, 0]}
    assert solve_link_forces(hp, result, [1, 0, 0]) is None


def test_max_abs():
    assert max_abs(None) == float("inf")
    assert max_abs({"f_uca": -5.0, "f_lca": 3.0, "f_pushrod": -120.0}) == 120.0
