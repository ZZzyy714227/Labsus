"""Contract tests for the isolated P1 solver comparison harness."""

import json
import math

import src.solver.p1_benchmark as p1_benchmark
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

    def without_timings(report):
        rows = []
        for row in report["cases"]:
            copy = dict(row)
            copy.pop("timing_ms")
            copy["sequential"] = dict(copy["sequential"])
            copy["sequential"].pop("timing_ms")
            copy["coupled"] = dict(copy["coupled"])
            copy["coupled"].pop("timing_ms")
            rows.append(copy)
        return rows

    assert without_timings(first) == without_timings(second)
    for report in (first, second):
        for row in report["cases"]:
            assert math.isfinite(row["sequential"]["timing_ms"])
            assert row["sequential"]["timing_ms"] >= 0
            assert math.isfinite(row["coupled"]["timing_ms"])
            assert row["coupled"]["timing_ms"] >= 0
            assert math.isfinite(row["timing_ms"]["sequential"])
            assert row["timing_ms"]["sequential"] >= 0
            assert math.isfinite(row["timing_ms"]["coupled"])
            assert row["timing_ms"]["coupled"] >= 0
    _assert_finite_json_leaves(first)
    assert json.dumps(first, allow_nan=False, sort_keys=True)


def test_sequential_baseline_contains_solver_diagnostics():
    report = compare_solver_paths()
    baseline = report["cases"][0]["sequential"]
    assert baseline["status"] in {"VALID", "APPROXIMATE", "SOLVER_FAILED"}
    assert baseline["timing_ms"] >= 0
    if baseline["status"] == "SOLVER_FAILED":
        assert baseline["geometry_residual_mm"] is None
        assert baseline["angles"] is None
    else:
        assert baseline["geometry_residual_mm"] is not None
        assert baseline["geometry_residual_mm"] >= 0
        assert baseline["angles"] is not None


def test_every_matrix_row_has_consistent_diagnostics():
    report = compare_solver_paths()
    for row in report["cases"]:
        path = row["sequential"]
        assert path["status"] in {"VALID", "APPROXIMATE", "SOLVER_FAILED"}
        assert path["iterations"] >= 0
        assert math.isfinite(path["timing_ms"]) and path["timing_ms"] >= 0
        if path["status"] == "SOLVER_FAILED":
            assert path["geometry_residual_mm"] is None
            assert path["angles"] is None
            assert path["contact_patch"] is None
            assert path["steering_axis"] is None
        else:
            assert path["geometry_residual_mm"] is not None
            assert path["geometry_residual_mm"] >= 0
            assert path["angles"] is not None
            assert path["contact_patch"] is not None
            assert path["steering_axis"] is not None


def test_failed_sequential_solve_reports_no_geometry_residual(monkeypatch):
    def fail(*args, **kwargs):
        raise ValueError("synthetic solver failure")

    monkeypatch.setattr(p1_benchmark, "solve_bump", fail)
    result = p1_benchmark._sequential_baseline(dict(p1_benchmark.DEFAULT_HARDPOINTS), 0, 0)

    assert result["status"] == "SOLVER_FAILED"
    assert result["geometry_residual_mm"] is None
    assert result["angles"] is None


def test_k4_residual_remains_visible_outside_nominal_range():
    report = compare_solver_paths()
    assert any(
        row["travel"] < -15
        and row["sequential"]["geometry_residual_mm"] is not None
        and row["sequential"]["geometry_residual_mm"] > 0.02
        for row in report["cases"]
    )


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
