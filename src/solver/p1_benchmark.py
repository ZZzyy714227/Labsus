"""Deterministic P1 comparison benchmark for the legacy front-right solver."""

from __future__ import annotations

import hashlib
import json
import math
import time
from typing import TypedDict, cast

import numpy as np

from hardpoints import DEFAULT_HARDPOINTS
from solver.angles import compute_alignment_angles
from solver.bump import solve_bump
from solver.steering import solve_steering
from tire import _upright_y_axis, compute_contact_patch

TRAVEL_GRID = (-30, -15, -5, 0, 5, 10, 15, 30)
RACK_GRID = (0, 5)


JsonValue = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
NumericOrNone = float | None


class PathRecord(TypedDict):
    status: str
    angles: dict[str, JsonValue] | None
    contact_patch: list[JsonValue] | None
    steering_axis: list[JsonValue] | None
    geometry_residual_mm: NumericOrNone
    iterations: int
    timing_ms: float


class DeltaRecord(TypedDict):
    camber_deg: NumericOrNone
    toe_deg: NumericOrNone
    contact_patch: list[JsonValue] | None
    steering_axis: list[JsonValue] | None


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
    encoded = json.dumps(snapshot, allow_nan=False, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def _json_value(value: object) -> JsonValue:
    """Convert configured NumPy-like values into deterministic JSON values."""
    if hasattr(value, "tolist"):
        return _json_value(value.tolist())
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, (int, float, str, bool)) or value is None:
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("JSON values must contain finite numbers")
        return value
    raise TypeError(f"Unsupported JSON value: {type(value).__name__}")


def _sequential_baseline(hp: dict[str, object], travel: int, rack: int) -> PathRecord:
    """Adapt the production bump→steer calls for one physical front-right side."""
    started = time.perf_counter()
    try:
        bump = solve_bump(hp, travel, polish=True)
        merged = dict(bump)
        for key in ("CH1", "CH2", "CH3", "CH4", "CH5", "track_width", "tire_radius",
                    "tire_width", "tire_spring_rate", "corner_weight_n"):
            if key in hp:
                merged[key] = hp[key]
        tie_rod_length = float(np.linalg.norm(
            np.asarray(hp["UP3"]) - np.asarray(hp["FL1"])))
        steered = solve_steering(merged, rack, tie_rod_length=tie_rod_length)
        if (not steered.get("_newton_converged", True)
                and (not steered.get("_used_fallback", False)
                     or not steered.get("_fallback_root_found", False))):
            return {
                "status": "SOLVER_FAILED", "angles": None, "contact_patch": None,
                "steering_axis": None, "geometry_residual_mm": None,
                "iterations": int(bump.get("iterations", 0)) + int(steered.get("iterations", 0)),
                "timing_ms": (time.perf_counter() - started) * 1000.0,
            }
        final = dict(steered)
        for key in ("CH1", "CH2", "CH3", "CH4", "CH5", "track_width", "tire_radius",
                    "tire_width", "tire_spring_rate", "corner_weight_n"):
            if key in hp:
                final[key] = hp[key]
        angles = compute_alignment_angles(final, hp=hp)
        axis = np.asarray(final["UP2"], dtype=float) - np.asarray(final["UP1"], dtype=float)
        axis /= np.linalg.norm(axis)
        contact = compute_contact_patch(final["UP5"], _upright_y_axis(final), hp)
        tie_residual = abs(float(np.linalg.norm(
            np.asarray(final["UP3"]) - np.asarray(final["FL1"]))) - tie_rod_length)
        residual = max(float(bump.get("max_residual", 0.0)), tie_residual)
        status = "VALID" if residual <= 0.02 else "APPROXIMATE"
        if not steered.get("_newton_converged", True):
            if (not steered.get("_used_fallback", False)
                    or not steered.get("_fallback_root_found", False)):
                status = "SOLVER_FAILED"
        return {
            "status": status,
            "angles": cast(dict[str, JsonValue], _json_value(angles)),
            "contact_patch": cast(list[JsonValue], _json_value(contact["center"])),
            "steering_axis": cast(list[JsonValue], _json_value(axis.tolist())),
            "geometry_residual_mm": residual,
            "iterations": int(bump.get("iterations", 0)) + int(steered.get("iterations", 0)),
            "timing_ms": (time.perf_counter() - started) * 1000.0,
        }
    except (KeyError, TypeError, ValueError, FloatingPointError):
        return {
            "status": "SOLVER_FAILED", "angles": None, "contact_patch": None,
            "steering_axis": None, "geometry_residual_mm": None, "iterations": 0,
            "timing_ms": (time.perf_counter() - started) * 1000.0,
        }


def _not_implemented_path() -> PathRecord:
    """Return an explicit unavailable record for the future coupled candidate."""
    return {"status": "NOT_IMPLEMENTED", "angles": None, "contact_patch": None,
            "steering_axis": None, "geometry_residual_mm": None, "iterations": 0,
            "timing_ms": 0.0}


def compare_solver_paths() -> Report:
    """Evaluate the production sequential baseline over the P1 matrix."""
    hp = dict(DEFAULT_HARDPOINTS)
    cases: list[CaseRecord] = []
    for travel in TRAVEL_GRID:
        for rack in RACK_GRID:
            sequential = _sequential_baseline(hp, travel, rack)
            cases.append({
                "travel": travel, "rack": rack, "sequential": sequential,
                "coupled": _not_implemented_path(),
                "delta": {"camber_deg": None, "toe_deg": None,
                           "contact_patch": None, "steering_axis": None},
                "timing_ms": {"sequential": sequential["timing_ms"], "coupled": 0.0},
            })

    return {
        "hardpoint_side": "front_right",
        "hardpoint_fingerprint": _hardpoint_fingerprint(),
        "travel_grid_mm": list(TRAVEL_GRID),
        "rack_grid_mm": list(RACK_GRID),
        "cases": cases,
    }
