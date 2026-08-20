# P1 Solver Error-Gate Report

**Date:** 2026-08-20  
**Evidence:** `data/reports/p1_solver_gate.json` generated from the approved Task 4 matrix at commit `4288ce758dbcba2f9d523caaa4e27a9ad6fe54c8`  
**Selected side:** `front_right`  
**Hardpoint fingerprint:** `e37007b746ce302e01d83df0060523f593e6a816a19de4c7b38eb0b14b587164`

## Architecture decision

**SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION**

The production path remains sequential `bump → steer` for responsive preview and compatibility. A high-accuracy validation path may run the isolated coupled candidate in the background or on demand. The candidate is evidence-generating only and is not promoted to the production endpoint by this task.

## Matrix and acceptance thresholds

The deterministic matrix contains 16 front-right cases: travel `[-30, -15, -5, 0, 5, 10, 15, 30]` mm crossed with rack `[0, 5]` mm. It includes static, bump-only, rack-only, and bump+rack inputs. The report retains raw per-case sequential and candidate records; `smoothing` is `none`.

The V1 baseline threshold for a normal geometry residual is `≤ 0.02 mm`. Values above `0.02 mm` are warning/approximate evidence, not silently corrected output. Solver failure or unreachable geometry must remain separately represented. The single-point preview budget is `<50 ms`; measured timing is environment-dependent and is not a deterministic acceptance comparison.

## Measured results

- Sequential geometry residuals were available for all 16 cases, ranging from approximately `0.000000 mm` to `0.731417 mm` (mean `0.193736 mm`). The maximum occurs at travel `-30 mm`, rack `0 mm`.
- Coupled candidate residuals were available for all 16 cases, ranging from approximately `0.000000 mm` to `1.572090 mm` (mean `0.548213 mm`). Four cases were `VALID` and twelve were `APPROXIMATE`; no rank-deficient cases were observed in this run.
- Sequential timing averaged approximately `5.72 ms` per case (maximum `11.53 ms`); candidate timing averaged approximately `40.69 ms` (maximum `69.18 ms`). Candidate cost is therefore materially higher and can exceed the preview budget.
- Candidate-minus-sequential deltas were not uniformly small: camber `-0.382..1.558°`, toe `-4.168..2.937°`, caster `-19.229..14.712°`, KPI `-0.728..0.789°`, scrub radius `-13.01..13.77 mm`, trail `-67.61..79.65 mm`, and residual delta `-0.031786..0.840673 mm`.

These differences are large enough that the candidate cannot be treated as a drop-in replacement for the existing production path. They do justify retaining it as a high-accuracy diagnostic/validation experiment.

## K-4 root cause and status

K-4 remains **open**. The sequential residual is direction-dependent: the negative-travel maximum is `0.731417 mm` at `-30 mm`, while the positive-travel maximum is `0.497062 mm` at `+30 mm`; both exceed the `0.02 mm` normal threshold. The diagnosis labels the effect `travel-dominant`, with the negative direction worse than the positive direction and no meaningful difference between rack `0` and rack `5` at the maxima. This is consistent with the known branch-anchored polish compromise at travel outside the nominal `[-3, +10] mm` region, rather than evidence that K-4 has been fixed.

The report does not claim a repair. Raw residuals, branch/status fields, and candidate explanations remain visible so a later K-4 investigation can distinguish constraint failure from branch selection and initial-guess effects.

## Compatibility and implementation boundary

- Preserve the current sequential solver, branch continuation, fallback scanning, smoothing regression assets, and legacy API behavior.
- Keep the coupled implementation isolated to the P1 benchmark/validation path.
- Do not modify production endpoints or silently replace sequential result fields.
- Future promotion requires a new measured gate over the full travel matrix, threshold compliance, stable metric deltas, and timing that meets the applicable product budget.
