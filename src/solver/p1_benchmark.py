"""Deterministic P1 comparison benchmark for the legacy front-right solver."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path
from typing import TypedDict, cast

# Production modules use the repository's ``src`` directory as their import
# root.  Make that same layout available when this file is run with
# ``python -m src.solver.p1_benchmark`` from the repository root.
if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from hardpoints import DEFAULT_HARDPOINTS
from solver.angles import compute_alignment_angles
from solver.bump import solve_bump
from solver.coupled_candidate import RESIDUAL_KEYS, solve_coupled_candidate
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
    residuals_mm: dict[str, JsonValue]
    explanation: str
    state: dict[str, JsonValue]
    rank_deficient: bool


class DeltaRecord(TypedDict):
    camber_deg: NumericOrNone
    toe_deg: NumericOrNone
    caster_deg: NumericOrNone
    kpi_deg: NumericOrNone
    scrub_radius_mm: NumericOrNone
    trail_mm: NumericOrNone
    contact_patch_mm: list[float] | None
    steering_axis_unitless: list[float] | None
    geometry_residual_mm: NumericOrNone
    timing_ms: NumericOrNone
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
    smoothing: str
    timing_note: str
    k4_diagnosis: dict[str, JsonValue]
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
                "residuals_mm": {key: None for key in RESIDUAL_KEYS}, "explanation": "steering root unavailable", "state": {}, "rank_deficient": False,
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
            "residuals_mm": {key: None for key in RESIDUAL_KEYS}, "explanation": "sequential baseline",
            "state": cast(dict[str, JsonValue], _json_value(final)), "rank_deficient": False,
        }
    except (KeyError, TypeError, ValueError, FloatingPointError):
        return {
            "status": "SOLVER_FAILED", "angles": None, "contact_patch": None,
            "steering_axis": None, "geometry_residual_mm": None, "iterations": 0,
            "timing_ms": (time.perf_counter() - started) * 1000.0,
            "residuals_mm": {key: None for key in RESIDUAL_KEYS}, "explanation": "sequential baseline failed", "state": {}, "rank_deficient": False,
        }


def _coupled_path(hp: dict[str, object], travel: int, rack: int) -> PathRecord:
    """Adapt the isolated candidate to the benchmark path schema."""
    result = solve_coupled_candidate(hp, travel, rack)
    return {
        "status": str(result["status"]),
        "angles": result.get("angles"),
        "contact_patch": result.get("contact_patch"),
        "steering_axis": result.get("steering_axis"),
        "geometry_residual_mm": result.get("geometry_residual_mm"),
        "iterations": int(result.get("iterations", 0)),
        "timing_ms": float(result.get("timing_ms", 0.0)),
        "residuals_mm": cast(dict[str, JsonValue], result.get("residuals_mm", {})),
        "explanation": str(result.get("explanation", "")),
        "state": cast(dict[str, JsonValue], result.get("state", {})),
        "rank_deficient": bool(result.get("rank_deficient", False)),
    }


def _scalar_delta(sequential: PathRecord, coupled: PathRecord, key: str) -> float | None:
    if sequential["angles"] is None or coupled["angles"] is None:
        return None
    candidate = coupled["angles"].get(key, 0.0)
    baseline = sequential["angles"].get(key, 0.0)
    return round(float(cast(float, candidate)) - float(cast(float, baseline)), 9)


def _vector_delta(sequential: PathRecord, coupled: PathRecord, key: str) -> list[float] | None:
    first = sequential["contact_patch"] if key == "contact_patch" else sequential["steering_axis"]
    second = coupled["contact_patch"] if key == "contact_patch" else coupled["steering_axis"]
    if first is None or second is None or len(first) != len(second):
        return None
    first_values = cast(list[float], first)
    second_values = cast(list[float], second)
    return [round(candidate - baseline, 9) for baseline, candidate in zip(first_values, second_values)]


def _timing_delta(sequential: PathRecord, coupled: PathRecord) -> float | None:
    baseline, candidate = sequential["timing_ms"], coupled["timing_ms"]
    if not math.isfinite(baseline) or not math.isfinite(candidate):
        return None
    return round(candidate - baseline, 9)


def _diagnose_k4(cases: list[CaseRecord]) -> dict[str, JsonValue]:
    valid = [r for r in cases if r["sequential"]["geometry_residual_mm"] is not None]
    def maximum(rows: list[CaseRecord]) -> dict[str, JsonValue]:
        row = max(rows, key=lambda r: r["sequential"]["geometry_residual_mm"] or 0.0) if rows else None
        residual = row["sequential"]["geometry_residual_mm"] if row else None
        return {"travel": row["travel"], "rack": row["rack"], "residual_mm": residual} if row and residual is not None else {"travel": 0, "rack": 0, "residual_mm": 0.0}
    neg_max, pos_max = maximum([r for r in valid if r["travel"] < 0]), maximum([r for r in valid if r["travel"] > 0])
    direction_rows: list[dict[str, JsonValue]] = []
    for direction, rows in (("negative", [r for r in valid if r["travel"] < 0]), ("zero", [r for r in valid if r["travel"] == 0]), ("positive", [r for r in valid if r["travel"] > 0])):
        direction_rows.append({"travel_direction": direction, "case_count": len(rows), "max_residual_mm": maximum(rows)["residual_mm"], "rack_maxima": {str(rack): maximum([r for r in rows if r["rack"] == rack])["residual_mm"] for rack in RACK_GRID}})
    per_rack: dict[str, dict[str, JsonValue]] = {}
    for rack in RACK_GRID:
        rows = [r for r in valid if r["rack"] == rack]
        per_rack[str(rack)] = {"rack": rack, "case_count": len(rows), "max_residual_mm": maximum(rows)["residual_mm"], "status_counts": {status: sum(1 for r in rows if r["sequential"]["status"] == status) for status in sorted({r["sequential"]["status"] for r in rows})}}
    rank_cases = [{"travel": r["travel"], "rack": r["rack"]} for r in cases if r["coupled"]["rank_deficient"]]
    neg_residual, pos_residual = float(cast(float, neg_max["residual_mm"])), float(cast(float, pos_max["residual_mm"]))
    rack_effect = float(cast(float, per_rack["5"]["max_residual_mm"])) - float(cast(float, per_rack["0"]["max_residual_mm"]))
    return cast(dict[str, JsonValue], {"negative_travel_max": neg_max, "positive_travel_max": pos_max, "travel_direction_residuals": direction_rows, "per_rack": per_rack, "rank_deficient_count": len(rank_cases), "rank_deficient_cases": rank_cases,
            "cause_summary": {"travel_direction": "negative" if neg_residual > pos_residual else "positive" if pos_residual > neg_residual else "balanced", "rack_input": "rack-sensitive" if abs(rack_effect) > 0.02 else "travel-dominant", "candidate_status": {status: sum(1 for r in cases if r["coupled"]["status"] == status) for status in sorted({r["coupled"]["status"] for r in cases})}}})


def compare_solver_paths() -> Report:
    """Evaluate the production sequential baseline over the P1 matrix."""
    hp = dict(DEFAULT_HARDPOINTS)
    cases: list[CaseRecord] = []
    for travel in TRAVEL_GRID:
        for rack in RACK_GRID:
            sequential = _sequential_baseline(hp, travel, rack)
            coupled = _coupled_path(hp, travel, rack)
            delta = {"camber_deg": _scalar_delta(sequential, coupled, "camber_deg"), "toe_deg": _scalar_delta(sequential, coupled, "toe_deg"),
                     "caster_deg": _scalar_delta(sequential, coupled, "caster_deg"), "kpi_deg": _scalar_delta(sequential, coupled, "kpi_deg"),
                     "scrub_radius_mm": _scalar_delta(sequential, coupled, "scrub_radius_mm"), "trail_mm": _scalar_delta(sequential, coupled, "caster_trail_mm"),
                     "contact_patch_mm": _vector_delta(sequential, coupled, "contact_patch"), "steering_axis_unitless": _vector_delta(sequential, coupled, "steering_axis"),
                     "geometry_residual_mm": (None if sequential["geometry_residual_mm"] is None or coupled["geometry_residual_mm"] is None else coupled["geometry_residual_mm"] - sequential["geometry_residual_mm"]),
                     "timing_ms": _timing_delta(sequential, coupled), "contact_patch": None, "steering_axis": None}
            cases.append({"travel": travel, "rack": rack, "sequential": sequential, "coupled": coupled, "delta": cast(DeltaRecord, delta),
                          "timing_ms": {"sequential": sequential["timing_ms"], "coupled": coupled["timing_ms"]}})
    return {"hardpoint_side": "front_right", "hardpoint_fingerprint": _hardpoint_fingerprint(), "travel_grid_mm": list(TRAVEL_GRID), "rack_grid_mm": list(RACK_GRID), "smoothing": "none", "timing_note": "Measured timing is environment-dependent and should not be used for deterministic comparisons.", "k4_diagnosis": _diagnose_k4(cases), "cases": cases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-report", type=Path)
    args = parser.parse_args()
    report = compare_solver_paths()
    if args.write_report:
        args.write_report.parent.mkdir(parents=True, exist_ok=True)
        args.write_report.write_text(json.dumps(report, indent=2, allow_nan=False, sort_keys=True) + "\n", encoding="utf-8")
