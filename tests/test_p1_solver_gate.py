"""Contract tests for the isolated P1 solver comparison harness."""

import json

from src.solver.p1_benchmark import compare_solver_paths


def test_compare_solver_paths_returns_required_fields():
    report = compare_solver_paths()

    assert report["cases"]
    row = report["cases"][0]
    assert {"travel", "sequential", "coupled", "delta", "timing_ms"} <= row.keys()
    assert {"camber_deg", "toe_deg", "contact_patch", "steering_axis"} <= row["delta"].keys()


def test_compare_covers_both_travel_directions():
    report = compare_solver_paths()
    travels = [row["travel"] for row in report["cases"]]

    assert min(travels) < 0 < max(travels)


def test_compare_output_is_json_safe_and_uses_full_travel_grid():
    report = compare_solver_paths()
    rows = report["cases"]

    assert sorted({row["travel"] for row in rows}) == [-30, -15, -5, 0, 5, 10, 15, 30]
    assert sorted({row["rack"] for row in rows}) == [0, 5]
    json.dumps(report)
