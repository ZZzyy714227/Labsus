"""Contract tests for the isolated P1 solver comparison harness."""

import json
import math

from src.solver.p1_benchmark import compare_solver_paths


def _assert_finite_json_leaves(value: object) -> None:
    if isinstance(value, dict):
        for item in value.values():
            _assert_finite_json_leaves(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _assert_finite_json_leaves(item)
    elif isinstance(value, float):
        assert math.isfinite(value)


PATH_FIELDS = {
    "status",
    "angles",
    "contact_patch",
    "steering_axis",
    "geometry_residual_mm",
    "iterations",
    "timing_ms",
}


def test_compare_solver_paths_returns_required_fields():
    report = compare_solver_paths()

    assert {
        "hardpoint_side",
        "hardpoint_fingerprint",
        "travel_grid_mm",
        "rack_grid_mm",
        "cases",
    } == report.keys()
    assert report["cases"]
    row = report["cases"][0]
    assert {"travel", "rack", "sequential", "coupled", "delta", "timing_ms"} <= row.keys()
    assert {"camber_deg", "toe_deg", "contact_patch", "steering_axis"} <= row["delta"].keys()
    assert PATH_FIELDS == row["sequential"].keys()
    assert PATH_FIELDS == row["coupled"].keys()


def test_compare_has_exactly_sixteen_travel_rack_combinations():
    report = compare_solver_paths()

    combinations = {(row["travel"], row["rack"]) for row in report["cases"]}

    assert len(combinations) == 16
    assert len(report["cases"]) == 16


def test_compare_is_deterministic_and_strictly_json_serializable():
    first = compare_solver_paths()
    second = compare_solver_paths()

    for report in (first, second):
        for row in report["cases"]:
            row["sequential"]["timing_ms"] = 0.0
            row["coupled"]["timing_ms"] = 0.0
            row["timing_ms"]["sequential"] = 0.0
            row["timing_ms"]["coupled"] = 0.0
    assert first == second
    _assert_finite_json_leaves(first)
    assert json.dumps(first, allow_nan=False, sort_keys=True)


def test_sequential_baseline_contains_solver_diagnostics():
    report = compare_solver_paths()
    baseline = report["cases"][0]["sequential"]
    assert baseline["status"] in {"VALID", "APPROXIMATE", "SOLVER_FAILED"}
    assert baseline["timing_ms"] >= 0
    assert baseline["geometry_residual_mm"] >= 0
    assert baseline["angles"] is not None


def test_k4_residual_remains_visible_outside_nominal_range():
    report = compare_solver_paths()
    assert any(row["travel"] < -15 and row["sequential"]["geometry_residual_mm"] > 0.02
               for row in report["cases"])


def test_compare_covers_both_travel_directions():
    report = compare_solver_paths()
    travels = [row["travel"] for row in report["cases"]]

    assert min(travels) < 0 < max(travels)


def test_compare_output_is_json_safe_and_uses_full_travel_grid():
    report = compare_solver_paths()
    rows = report["cases"]

    assert sorted({row["travel"] for row in rows}) == [-30, -15, -5, 0, 5, 10, 15, 30]
    assert sorted({row["rack"] for row in rows}) == [0, 5]
    _assert_finite_json_leaves(report)
    json.dumps(report, allow_nan=False)
