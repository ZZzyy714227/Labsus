"""Isolated coupled-constraint candidate for the P1 benchmark.

This module is deliberately not used by production routes.  It evaluates a
single selected physical side and reports raw constraint residuals so an
architecture decision can be made from evidence rather than smoothed output.
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np

from geometry import dist, distance_point_to_line
from solver.angles import compute_alignment_angles
from solver.bump import solve_bump
from solver.steering import solve_steering
from tire import _upright_y_axis, compute_contact_patch

try:
    from scipy.optimize import least_squares
except ImportError:  # pragma: no cover - depends on optional environment
    least_squares = None

POINTS = ("UP1", "UP2", "UP3", "UP4", "UP5")
RESIDUAL_KEYS = ("uca_axis", "lca_axis", "kingpin_length", "upright_up1_up5",
                 "upright_up2_up5", "tie_rod_length", "pushrod_length", "wheel_travel",
                 "rigid_up1_up3", "rigid_up1_up4", "rigid_up1_up5", "rigid_up2_up3",
                 "rigid_up2_up4", "rigid_up2_up5", "rigid_up3_up4", "rigid_up3_up5",
                 "rigid_up4_up5")


def _lengths(hp: dict[str, Any]) -> dict[str, float]:
    return {
        "kingpin_length": dist(hp["UP1"], hp["UP2"]),
        "upright_up1_up5": dist(hp["UP1"], hp["UP5"]),
        "upright_up2_up5": dist(hp["UP2"], hp["UP5"]),
        "tie_rod_length": dist(hp["UP3"], hp["FL1"]),
    }


def _residuals(x: np.ndarray, hp: dict[str, Any], travel: float, rack: float,
               reference: dict[str, float]) -> dict[str, float]:
    points = {name: x[i * 3:i * 3 + 3] for i, name in enumerate(POINTS)}
    ch1, ch2 = np.asarray(hp["CH1"], float), np.asarray(hp["CH2"], float)
    ch3, ch4 = np.asarray(hp["CH3"], float), np.asarray(hp["CH4"], float)
    fl1 = np.asarray(hp["FL1"], float).copy()
    fl1[1] += rack
    design = {name: np.asarray(hp[name], float) for name in POINTS}
    values = {
        "uca_axis": distance_point_to_line(points["UP1"], ch1, ch2)
        - distance_point_to_line(design["UP1"], ch1, ch2),
        "lca_axis": distance_point_to_line(points["UP2"], ch3, ch4)
        - distance_point_to_line(design["UP2"], ch3, ch4),
        "kingpin_length": dist(points["UP1"], points["UP2"]) - reference["kingpin_length"],
        "upright_up1_up5": dist(points["UP1"], points["UP5"]) - reference["upright_up1_up5"],
        "upright_up2_up5": dist(points["UP2"], points["UP5"]) - reference["upright_up2_up5"],
        "tie_rod_length": dist(points["UP3"], fl1) - reference["tie_rod_length"],
        "wheel_travel": points["UP5"][2] - (design["UP5"][2] + travel),
        "pushrod_length": dist(points["UP4"], np.asarray(hp["CH5"], float))
        - dist(design["UP4"], np.asarray(hp["CH5"], float)),
    }
    # Every upright point is rigid relative to the kingpin/wheel-center frame.
    for left, right in (("UP1", "UP3"), ("UP1", "UP4"), ("UP1", "UP5"),
                        ("UP2", "UP3"), ("UP2", "UP4"), ("UP2", "UP5"),
                        ("UP3", "UP4"), ("UP3", "UP5"), ("UP4", "UP5")):
        key = f"rigid_{left.lower()}_{right.lower()}"
        values[key] = dist(points[left], points[right]) - dist(design[left], design[right])
    return {key: float(value) for key, value in values.items()}


def solve_coupled_candidate(hp: dict[str, Any], travel: int, rack: int) -> dict[str, Any]:
    """Solve one side with a bounded coupled least-squares candidate.

    The legacy PBD/steering result is only a branch-preserving initial guess.
    Unavailable or rank-deficient solves are reported explicitly.
    """
    started = time.perf_counter()
    base: dict[str, Any] = {"status": "SOLVER_FAILED", "angles": None, "contact_patch": None,
            "steering_axis": None, "geometry_residual_mm": None, "iterations": 0,
            "timing_ms": 0.0, "residuals_mm": {key: None for key in RESIDUAL_KEYS}, "explanation": "",
            "state": {name: None for name in (*POINTS, "FL1", "steering_angle", "contact_patch")} }
    if least_squares is None:
        base["status"] = "NOT_IMPLEMENTED"
        base["explanation"] = "scipy.optimize.least_squares is unavailable"
        base["timing_ms"] = (time.perf_counter() - started) * 1000.0
        return base
    try:
        pbd = solve_bump(hp, travel, polish=False)
        seed = dict(pbd)
        seed.update({key: hp[key] for key in ("CH1", "CH2", "CH3", "CH4", "CH5")})
        tie = _lengths(hp)["tie_rod_length"]
        initial = solve_steering(seed, rack, tie_rod_length=tie)
        if (not initial.get("_newton_converged", True)
                and not initial.get("_fallback_root_found", False)):
            base["explanation"] = "branch-preserving steering seed has no valid tie-rod root"
            return base
        x0 = np.concatenate([np.asarray(initial[name], float) for name in POINTS])
        reference = _lengths(hp)

        def fun(x: np.ndarray) -> np.ndarray:
            return np.asarray(list(_residuals(x, hp, travel, rack, reference).values()))

        # Tight bounds preserve the PBD branch and prevent a different assembly mode.
        result = least_squares(fun, x0, bounds=(x0 - 25.0, x0 + 25.0),
                               method="trf", ftol=1e-11, xtol=1e-11, gtol=1e-11,
                               max_nfev=1500)
        singular_values = np.linalg.svd(result.jac, compute_uv=False)
        rank = int(np.sum(singular_values > max(singular_values[0] * 1e-10, 1e-12)))
        residuals = _residuals(result.x, hp, travel, rack, reference)
        maximum = max(abs(value) for value in residuals.values())
        state = {name: result.x[i * 3:i * 3 + 3].tolist() for i, name in enumerate(POINTS)}
        state["FL1"] = (np.asarray(hp["FL1"], float) + np.array([0.0, rack, 0.0])).tolist()
        state["steering_angle"] = float(initial.get("steering_theta", 0.0))
        state["contact_patch"] = None
        if rank >= min(result.jac.shape):
            angles = compute_alignment_angles(state, hp=hp)
            contact = compute_contact_patch(state["UP5"], _upright_y_axis(state), hp)
            state["contact_patch"] = contact["center"]
            base.update({"angles": angles, "contact_patch": contact["center"],
                         "steering_axis": (np.asarray(state["UP2"]) - np.asarray(state["UP1"])).tolist()})
        base.update({"status": "VALID" if maximum <= 0.02 else "APPROXIMATE",
                     "geometry_residual_mm": maximum, "iterations": int(result.nfev),
                     "residuals_mm": residuals, "state": state,
                     "explanation": ("bounded coupled solve" if rank >= min(result.jac.shape)
                                     else f"constraint Jacobian is rank-deficient ({rank}/{min(result.jac.shape)}); minimized evidence retained")})
        return base
    except (KeyError, TypeError, ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
        base["explanation"] = f"candidate solve failed: {exc}"
        return base
    finally:
        base["timing_ms"] = (time.perf_counter() - started) * 1000.0
