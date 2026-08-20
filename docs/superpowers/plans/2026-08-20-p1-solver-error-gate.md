# P1 Solver Error Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Quantify the existing sequential bump→steer solver against a candidate coupled constraint solve, diagnose K-4 residuals across the full travel range, and freeze the V1 solver architecture based on measured evidence.

**Architecture:** Preserve the production solver as the compatibility baseline. Add an isolated benchmark/candidate module that consumes the existing `ChassisDesign`/`AnalysisCase` inputs and returns comparable per-wheel geometry, residual, branch, and timing data. Do not alter public legacy endpoints or P2/P3 metrics until the gate decision is recorded.

**Tech Stack:** Python 3.13, NumPy, SciPy, pytest, existing FastAPI solver modules, JSON benchmark artifacts.

---

### Task 1: Map the existing solver contract and write the P1 test harness

**Files:**
- Create: `tests/test_p1_solver_gate.py`
- Create: `src/solver/p1_benchmark.py`
- Read: `src/routes/solve.py`, `src/solver/bump.py`, `src/solver/steering.py`, `src/core/models.py`

- [ ] **Step 1: Write failing tests for benchmark output shape and full-travel coverage**

```python
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
```

- [ ] **Step 2: Run the tests and verify the benchmark module is missing**

Run: `pytest tests/test_p1_solver_gate.py -q`
Expected: FAIL with an import or missing-function error.

- [ ] **Step 3: Implement the smallest benchmark contract**

`compare_solver_paths()` must load the legacy front-right hardpoints, evaluate a deterministic travel grid covering `[-30, 30]` mm and rack values `[0, 5]` mm, and return JSON-safe rows. The initial coupled path may be explicitly marked `NOT_IMPLEMENTED`; the harness must still expose the comparison contract without changing production behavior.

- [ ] **Step 4: Run the tests and verify shape/coverage pass**

Run: `pytest tests/test_p1_solver_gate.py -q`
Expected: PASS for the output shape and travel coverage tests.

- [ ] **Step 5: Commit the harness contract**

```bash
git add src/solver/p1_benchmark.py tests/test_p1_solver_gate.py
git commit -m "test: add P1 solver comparison harness"
```

### Task 2: Implement the sequential baseline adapter

**Files:**
- Modify: `src/solver/p1_benchmark.py`
- Modify: `tests/test_p1_solver_gate.py`

- [ ] **Step 1: Add baseline assertions**

```python
def test_sequential_baseline_contains_solver_diagnostics():
    report = compare_solver_paths()
    baseline = report["cases"][0]["sequential"]
    assert baseline["status"] in {"VALID", "APPROXIMATE", "SOLVER_FAILED"}
    assert baseline["timing_ms"] >= 0
    assert baseline["geometry_residual_mm"] >= 0
    assert baseline["angles"] is not None
```

- [ ] **Step 2: Implement the adapter around existing production calls**

Use the same `solve_bump()`, `solve_steering()`, `compute_alignment_angles()`, and `compute_contact_patch()` path used by `_solve_axle()`. Do not call the HTTP route. Record:

```python
{
    "status": ..., "angles": ..., "contact_patch": [...],
    "steering_axis": [...], "geometry_residual_mm": ...,
    "iterations": ..., "timing_ms": ...,
}
```

The adapter must not use `mirror_left()` and must not apply `fix_left_angles()` because P1 compares one explicitly selected physical side.

- [ ] **Step 3: Run the focused tests**

Run: `pytest tests/test_p1_solver_gate.py -q`
Expected: PASS, with baseline values populated for every case.

- [ ] **Step 4: Add a regression assertion for K-4 visibility**

The report must preserve the raw solver residual rather than smoothing it. Add a test that at least one case outside the nominal range reports residual greater than `0.02` mm until K-4 is fixed.

- [ ] **Step 5: Commit the baseline adapter**

```bash
git add src/solver/p1_benchmark.py tests/test_p1_solver_gate.py
git commit -m "feat: expose sequential solver baseline diagnostics"
```

### Task 3: Add an isolated coupled-constraint candidate

**Files:**
- Create: `src/solver/coupled_candidate.py`
- Modify: `src/solver/p1_benchmark.py`
- Modify: `tests/test_p1_solver_gate.py`

- [ ] **Step 1: Write candidate behavior tests**

```python
def test_coupled_candidate_is_explicit_when_unavailable():
    report = compare_solver_paths()
    candidate = report["cases"][0]["coupled"]
    assert candidate["status"] in {"VALID", "APPROXIMATE", "NOT_IMPLEMENTED", "SOLVER_FAILED"}
    assert "geometry_residual_mm" in candidate


def test_candidate_does_not_change_legacy_endpoint():
    # The benchmark imports the candidate directly; production route behavior
    # remains covered by the existing solve tests.
    assert True
```

- [ ] **Step 2: Implement the candidate with explicit state and residuals**

Represent the selected side as a state containing `UP1`, `UP2`, `UP3`, `UP4`, `UP5`, `FL1`, steering angle, and contact patch. Define residual terms for:

- UCA and LCA circle/axis constraints;
- kingpin length;
- upright-to-wheel-center distances;
- tie-rod length after rack displacement;
- wheel-travel drive;
- upright rigid-frame distances.

Use the existing PBD result only as a branch-preserving initial guess. Use bounded `scipy.optimize.least_squares` for the candidate and return raw residual diagnostics. If the system is rank-deficient or unavailable, return `NOT_IMPLEMENTED`/`SOLVER_FAILED` with an explanation instead of fabricating a result.

- [ ] **Step 3: Run candidate-focused tests**

Run: `pytest tests/test_p1_solver_gate.py -q`
Expected: PASS for explicit candidate status and raw diagnostic fields.

- [ ] **Step 4: Commit the isolated candidate**

```bash
git add src/solver/coupled_candidate.py src/solver/p1_benchmark.py tests/test_p1_solver_gate.py
git commit -m "feat: add isolated coupled solver candidate for P1"
```

### Task 4: Run the full comparison matrix and diagnose K-4

**Files:**
- Create: `tests/fixtures/p1_solver_gate_cases.json`
- Create: `data/reports/p1_solver_gate.json`
- Modify: `src/solver/p1_benchmark.py`
- Modify: `tests/test_p1_solver_gate.py`

- [ ] **Step 1: Define deterministic matrix cases**

Use front-right hardpoints and these cases:

```text
travel: -30, -15, -5, 0, 5, 10, 15, 30 mm
rack:   0, 5 mm
```

Include static, bump-only, rack-only, and bump+rack cases. Store inputs only in the fixture; generated measurements belong in the report.

- [ ] **Step 2: Add comparison metrics**

For each case calculate:

```text
Δcamber_deg
Δtoe_deg
Δcaster_deg
Δkpi_deg
Δscrub_radius_mm
Δtrail_mm
Δcontact_patch_mm
Δsteering_axis_unitless
Δgeometry_residual_mm
Δtiming_ms
```

Retain raw sequential and candidate records. Do not run a smoothing post-processor on the report.

- [ ] **Step 3: Add K-4 diagnosis tests**

Assert that the report contains separate positive and negative travel maxima and identifies whether residual growth correlates with travel direction, rack input, or candidate rank deficiency. The test must fail if the report only provides one aggregate residual.

- [ ] **Step 4: Generate the report and run focused/full tests**

Run:

```bash
python -m src.solver.p1_benchmark --write-report data/reports/p1_solver_gate.json
pytest tests/test_p1_solver_gate.py -q
pytest -q
```

Expected: report generated; focused tests pass; existing regression suite remains green except pre-existing explicit xfails.

- [ ] **Step 5: Commit the measured report**

```bash
git add tests/fixtures/p1_solver_gate_cases.json data/reports/p1_solver_gate.json src/solver/p1_benchmark.py tests/test_p1_solver_gate.py
 git commit -m "test: measure P1 sequential and coupled solver error"
```

### Task 5: Freeze the architecture decision and update documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-fsae-chassis-development-tool-v1-design.md`
- Modify: `docs/DEVLOG.md`
- Create: `docs/superpowers/specs/2026-08-20-p1-solver-gate-report.md`
- Modify: `tests/test_p1_solver_gate.py`

- [ ] **Step 1: Write the decision report from measured data**

The report must state one of exactly three decisions:

```text
FULL_COUPLED
PARTIAL_COUPLED
SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION
```

Include matrix inputs, thresholds, residual directionality, metric deltas, timing, branch behavior, and the reason for the decision.

- [ ] **Step 2: Update the V1 design baseline**

Replace the provisional P1 wording with the measured decision, preserving the sequential solver as a compatibility path if required. Record K-4 root cause or the exact remaining blocker; do not claim it fixed unless the full-travel threshold passes.

- [ ] **Step 3: Add a regression test for the chosen contract**

The regression test must assert the chosen architecture decision string and ensure future changes cannot silently remove the sequential baseline or raw residual reporting.

- [ ] **Step 4: Run verification**

Run:

```bash
pytest tests/test_p1_solver_gate.py -q
pytest -q
ruff check src tests
mypy src/core src/solver
 git diff --check
```

Expected: all required checks pass; only documented pre-existing xfails remain.

- [ ] **Step 5: Commit the P1 gate decision**

```bash
git add docs/superpowers/specs/2026-08-16-fsae-chassis-development-tool-v1-design.md docs/superpowers/specs/2026-08-20-p1-solver-gate-report.md docs/DEVLOG.md tests/test_p1_solver_gate.py
 git commit -m "docs: freeze V1 solver architecture from P1 evidence"
```
