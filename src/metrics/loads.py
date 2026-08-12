"""Link forces under braking / cornering / acceleration (static balance)."""
from __future__ import annotations

import numpy as np

from geometry import normalize_or_default, vec3


def _axis_dir(a, b):
    """Unit direction of link from frame point a to upright point b (outboard)."""
    return normalize_or_default(vec3(np.asarray(a, dtype=float),
                                     np.asarray(b, dtype=float)))


def tire_force(static_load_n: float, ax_g: float, ay_g: float):
    """Friction model: F_x = μ·F_z along x, F_y = μ·F_z along y.
    Longitudinal and lateral decouple (pure braking / pure cornering cases)."""
    fz = static_load_n
    fx = fz * ax_g
    fy = fz * ay_g
    return np.array([fx, fy, fz], dtype=float)


def solve_link_forces(hp, result, f_tire):
    """Static balance on upright: f_uca·d_uca + f_lca·d_lca + f_pr·d_pr = -f_tire.
    Returns dict with forces in N (positive = tension) or None if singular."""
    d_uca = _axis_dir(hp["CH1"], result["UP1"])     # ≈ CH1→UP1 direction
    d_lca = _axis_dir(hp["CH3"], result["UP2"])
    d_pr = _axis_dir(hp["CH5"], result["UP4"])
    A = np.column_stack([d_uca, d_lca, d_pr])
    try:
        f = np.linalg.solve(A, -np.asarray(f_tire, dtype=float))
    except np.linalg.LinAlgError:
        return None
    return {"f_uca": float(f[0]), "f_lca": float(f[1]), "f_pushrod": float(f[2])}


def max_abs(forces: dict | None) -> float:
    if forces is None:
        return float("inf")
    return max(abs(v) for v in forces.values())
