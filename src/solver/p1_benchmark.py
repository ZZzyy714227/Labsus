"""Deterministic input contract for the P1 solver comparison benchmark.

Task 1 exposes the comparison matrix before either solver path is adapted.  The
placeholder records describe unavailable measurements; they do not evaluate
geometry.  Later tasks can replace the path records without changing the report
shape consumed by this harness.
"""

from __future__ import annotations

import hashlib
import json
from typing import TypedDict

from hardpoints import DEFAULT_HARDPOINTS

TRAVEL_GRID = (-30, -15, -5, 0, 5, 10, 15, 30)
RACK_GRID = (0, 5)


class PathRecord(TypedDict):
    status: str
    angles: None
    contact_patch: None
    steering_axis: None
    geometry_residual_mm: None
    iterations: int
    timing_ms: float


class DeltaRecord(TypedDict):
    camber_deg: None
    toe_deg: None
    contact_patch: None
    steering_axis: None


class TimingRecord(TypedDict):
    sequential: float
    coupled: float


class CaseRecord(TypedDict):
    travel: int
    rack: int
    sequential: PathRecord
    coupled: PathRecord
    delta: DeltaRecord
    timing_ms: TimingRecord


class Report(TypedDict):
    hardpoint_side: str
    hardpoint_fingerprint: str
    travel_grid_mm: list[int]
    rack_grid_mm: list[int]
    cases: list[CaseRecord]


def _hardpoint_fingerprint() -> str:
    """Return a stable digest of the selected legacy hardpoint snapshot."""
    snapshot = {name: _json_value(point) for name, point in sorted(DEFAULT_HARDPOINTS.items())}
    encoded = json.dumps(snapshot, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def _json_value(value: object) -> object:
    """Convert configured NumPy-like values into deterministic JSON values."""
    if hasattr(value, "tolist"):
        return _json_value(value.tolist())
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return float(value)


def _not_implemented_path() -> PathRecord:
    """Return an explicit unavailable record; no geometry was evaluated."""
    return {
        "status": "NOT_IMPLEMENTED",
        "angles": None,
        "contact_patch": None,
        "steering_axis": None,
        "geometry_residual_mm": None,
        "iterations": 0,
        "timing_ms": 0.0,
    }


def compare_solver_paths() -> Report:
    """Return the deterministic P1 input matrix and its output contract.

    The matrix identifies legacy front-right inputs over the complete
    travel/rack grid.  Solver adapters are intentionally deferred to Task 2 and
    Task 3; no geometry is evaluated while paths are ``NOT_IMPLEMENTED``.
    """
    # Resolve the legacy geometry at call time so this harness follows the same
    # configured front-right defaults as the existing endpoint.
    _ = DEFAULT_HARDPOINTS

    cases: list[CaseRecord] = []
    for travel in TRAVEL_GRID:
        for rack in RACK_GRID:
            cases.append(
                {
                    "travel": travel,
                    "rack": rack,
                    "sequential": _not_implemented_path(),
                    "coupled": _not_implemented_path(),
                    "delta": {
                        "camber_deg": None,
                        "toe_deg": None,
                        "contact_patch": None,
                        "steering_axis": None,
                    },
                    "timing_ms": {"sequential": 0.0, "coupled": 0.0},
                }
            )

    return {
        "hardpoint_side": "front_right",
        "hardpoint_fingerprint": _hardpoint_fingerprint(),
        "travel_grid_mm": list(TRAVEL_GRID),
        "rack_grid_mm": list(RACK_GRID),
        "cases": cases,
    }
