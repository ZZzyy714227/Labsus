"""Contract tests for the isolated P1 solver comparison harness."""

import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np

import src.solver.p1_benchmark as p1_benchmark
from src.solver import coupled_candidate
from src.solver.coupled_candidate import solve_coupled_candidate
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
    "residuals_mm",
    "explanation",
    "state",
}

RESIDUAL_KEYS = {
    "uca_axis", "lca_axis", "kingpin_length", "upright_up1_up5",
    "upright_up2_up5", "tie_rod_length", "pushrod_length", "wheel_travel",
    "rigid_up1_up3", "rigid_up1_up4", "rigid_up1_up5", "rigid_up2_up3",
    "rigid_up2_up4", "rigid_up2_up5", "rigid_up3_up4", "rigid_up3_up5",
    "rigid_up4_up5",
}


def test_cli_writes_report_from_repository_root():
    report_path = Path("data/reports/_p1_cli_test.json")
    try:
        result = subprocess.run([sys.executable, "-m", "src.solver.p1_benchmark", "--write-report", str(report_path)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        report = json.loads(report_path.read_text(encoding="utf-8"))
        assert report["cases"]
        assert "timing_note" in report
    finally:
        report_path.unlink(missing_ok=True)


def test_compare_solver_paths_returns_required_fields():
    report = compare_solver_paths()

    assert {
        "hardpoint_side",
        "hardpoint_fingerprint",
        "travel_grid_mm",
        "rack_grid_mm",
        "smoothing",
        "timing_note",
        "k4_diagnosis",
        "cases",
    } <= report.keys()
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
            copy["delta"] = dict(copy["delta"])
            copy["delta"].pop("timing_ms")
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


def test_fallback_without_root_reports_no_geometry(monkeypatch):
    hp = dict(p1_benchmark.DEFAULT_HARDPOINTS)

    monkeypatch.setattr(p1_benchmark, "solve_bump", lambda *args, **kwargs: {
        **hp,
        "max_residual": 0.0,
        "iterations": 1,
    })
    monkeypatch.setattr(p1_benchmark, "solve_steering", lambda *args, **kwargs: {
        **hp,
        "_newton_converged": False,
        "_used_fallback": True,
        "_fallback_root_found": False,
        "iterations": 1,
    })

    result = p1_benchmark._sequential_baseline(hp, 0, 0)

    assert result["status"] == "SOLVER_FAILED"
    assert result["angles"] is None
    assert result["contact_patch"] is None
    assert result["steering_axis"] is None
    assert result["geometry_residual_mm"] is None


def test_k4_residual_remains_visible_outside_nominal_range():
    report = compare_solver_paths()
    assert any(
        row["travel"] < -15
        and row["sequential"]["geometry_residual_mm"] is not None
        and row["sequential"]["geometry_residual_mm"] > 0.02
        for row in report["cases"]
    )


def test_coupled_candidate_is_explicit_when_unavailable():
    report = compare_solver_paths()
    candidate = report["cases"][0]["coupled"]
    assert candidate["status"] in {"VALID", "APPROXIMATE", "NOT_IMPLEMENTED", "SOLVER_FAILED"}
    assert "geometry_residual_mm" in candidate
    assert isinstance(candidate["residuals_mm"], dict)
    assert isinstance(candidate["explanation"], str)
    assert isinstance(candidate["state"], dict)


def test_rank_deficient_candidate_is_never_reported_as_success(monkeypatch):
    class RankDeficientResult:
        jac = np.zeros((len(coupled_candidate.RESIDUAL_KEYS), 15))
        x = np.zeros(15)
        nfev = 4

    monkeypatch.setattr(coupled_candidate, "least_squares", lambda *args, **kwargs: RankDeficientResult())
    result = solve_coupled_candidate(dict(p1_benchmark.DEFAULT_HARDPOINTS), 0, 0)

    assert result["status"] in {"NOT_IMPLEMENTED", "SOLVER_FAILED"}
    assert result["residuals_mm"]
    assert result["explanation"]
    assert result["state"]


def test_candidate_reports_raw_constraint_diagnostics():
    result = solve_coupled_candidate(dict(p1_benchmark.DEFAULT_HARDPOINTS), 0, 0)
    assert result["status"] in {"VALID", "APPROXIMATE", "NOT_IMPLEMENTED", "SOLVER_FAILED"}
    assert "residuals_mm" in result
    assert RESIDUAL_KEYS <= result["residuals_mm"].keys()
    assert "explanation" in result
    assert {"UP1", "UP2", "UP3", "UP4", "UP5", "FL1", "steering_angle", "contact_patch"} <= result["state"].keys()


def test_benchmark_preserves_candidate_raw_diagnostics_and_explanation(monkeypatch):
    raw = {key: float(index) for index, key in enumerate(RESIDUAL_KEYS)}
    candidate = {
        "status": "NOT_IMPLEMENTED", "angles": None, "contact_patch": None,
        "steering_axis": None, "geometry_residual_mm": None, "iterations": 3,
        "timing_ms": 1.5, "residuals_mm": raw, "explanation": "rank deficient",
        "state": {"UP1": [0, 0, 0]},
    }
    monkeypatch.setattr(p1_benchmark, "solve_coupled_candidate", lambda *args: candidate)
    result = p1_benchmark._coupled_path(dict(p1_benchmark.DEFAULT_HARDPOINTS), 0, 0)
    assert result["residuals_mm"] == raw
    assert result["explanation"] == "rank deficient"


def test_successful_candidate_exposes_geometry_contract(monkeypatch):
    hp = dict(p1_benchmark.DEFAULT_HARDPOINTS)
    result = solve_coupled_candidate(hp, 0, 0)
    if result["status"] in {"VALID", "APPROXIMATE"}:
        assert result["angles"] is not None
        assert result["contact_patch"] is not None
        assert result["steering_axis"] is not None
        assert result["state"]["steering_angle"] is not None


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


def test_fixture_is_input_only_and_covers_named_case_types():
    fixture = json.loads((__import__("pathlib").Path("tests/fixtures/p1_solver_gate_cases.json")).read_text())
    assert fixture["travel_mm"] == [-30, -15, -5, 0, 5, 10, 15, 30]
    assert fixture["rack_mm"] == [0, 5]
    assert len(fixture["cases"]) == 16
    assert {case["kind"] for case in fixture["cases"]} >= {"static", "bump-only", "rack-only", "bump+rack"}
    assert all(set(case) == {"travel", "rack", "kind"} for case in fixture["cases"])


def test_comparison_reports_all_requested_deltas_without_smoothing():
    report = compare_solver_paths()
    expected = {"camber_deg", "toe_deg", "caster_deg", "kpi_deg", "scrub_radius_mm",
                "trail_mm", "contact_patch_mm", "steering_axis_unitless",
                "geometry_residual_mm", "timing_ms"}
    for row in report["cases"]:
        assert expected <= set(row["delta"])
    assert report["smoothing"] == "none"
    assert "environment-dependent" in report["timing_note"]
    for row in report["cases"]:
        sequential, coupled = row["sequential"], row["coupled"]
        if sequential["contact_patch"] is not None and coupled["contact_patch"] is not None:
            assert row["delta"]["contact_patch_mm"] == [round(c - s, 9) for s, c in zip(sequential["contact_patch"], coupled["contact_patch"])]
        if sequential["steering_axis"] is not None and coupled["steering_axis"] is not None:
            assert row["delta"]["steering_axis_unitless"] == [round(c - s, 9) for s, c in zip(sequential["steering_axis"], coupled["steering_axis"])]
        assert row["delta"]["timing_ms"] == round(coupled["timing_ms"] - sequential["timing_ms"], 9)


def test_k4_diagnosis_separates_travel_rack_and_candidate_causes():
    diagnosis = compare_solver_paths()["k4_diagnosis"]
    assert diagnosis["negative_travel_max"]["travel"] < 0
    assert diagnosis["positive_travel_max"]["travel"] > 0
    assert diagnosis["negative_travel_max"]["residual_mm"] >= 0
    assert diagnosis["positive_travel_max"]["residual_mm"] >= 0
    assert {"travel_direction", "rack_input", "candidate_status"} <= diagnosis["cause_summary"].keys()
    assert diagnosis["cause_summary"]["travel_direction"] in {"negative", "positive", "balanced", "none"}
    assert diagnosis["cause_summary"]["rack_input"] in {"rack-sensitive", "travel-dominant", "none"}
    assert isinstance(diagnosis["cause_summary"]["candidate_status"], dict)
