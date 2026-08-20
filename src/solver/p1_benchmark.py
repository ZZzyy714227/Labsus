"""Deterministic contract for the P1 solver comparison benchmark.

Task 1 deliberately exposes the comparison matrix before either solver path is
adapted.  Later tasks can replace the path records without changing the report
shape consumed by this harness.
"""

from __future__ import annotations

from hardpoints import DEFAULT_HARDPOINTS


TRAVEL_GRID = (-30, -15, -5, 0, 5, 10, 15, 30)
RACK_GRID = (0, 5)


def _not_implemented_path() -> dict:
    """Return the stable placeholder used until a path adapter is added."""
    return {
        "status": "NOT_IMPLEMENTED",
        "angles": None,
        "contact_patch": None,
        "steering_axis": None,
        "geometry_residual_mm": None,
        "iterations": 0,
        "timing_ms": 0.0,
    }


def compare_solver_paths() -> dict:
    """Return the deterministic P1 comparison matrix and its output contract.

    The matrix is the legacy front-right geometry evaluated over the complete
    travel/rack grid.  Solver adapters are intentionally deferred to Task 2
    and Task 3; their explicit status prevents placeholder values being read as
    measured geometry.
    """
    # Resolve the legacy geometry at call time so this harness follows the same
    # configured front-right defaults as the existing endpoint.
    _ = DEFAULT_HARDPOINTS

    cases = []
    for travel in TRAVEL_GRID:
        for rack in RACK_GRID:
            sequential = _not_implemented_path()
            coupled = _not_implemented_path()
            cases.append({
                "travel": travel,
                "rack": rack,
                "sequential": sequential,
                "coupled": coupled,
                "delta": {
                    "camber_deg": None,
                    "toe_deg": None,
                    "contact_patch": None,
                    "steering_axis": None,
                },
                "timing_ms": {
                    "sequential": 0.0,
                    "coupled": 0.0,
                },
            })

    return {
        "hardpoint_side": "front_right",
        "travel_grid_mm": list(TRAVEL_GRID),
        "rack_grid_mm": list(RACK_GRID),
        "cases": cases,
    }
