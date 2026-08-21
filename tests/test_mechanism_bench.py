import json
import pathlib

from solver.mechanism.bench import RACKS, TRAVELS, run_matrix, write_gate_report


def test_gate_passes():
    rep = run_matrix()
    assert rep["gate"]["pass"] is True
    assert rep["worst_residual_mm"] <= 0.02
    assert len(rep["rows"]) == 4 * len(TRAVELS) * len(RACKS)


def test_gate_written(tmp_path):
    rep = run_matrix()
    out = str(tmp_path / "gate.json")
    write_gate_report(rep, out)
    data = json.loads(pathlib.Path(out).read_text(encoding="utf-8"))
    assert "gate" in data and "rows" in data
    assert data["gate"]["pass"] in (True, False)
