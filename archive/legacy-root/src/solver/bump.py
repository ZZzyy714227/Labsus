"""
Bump kinematics solver — double-wishbone geometry with PBD + scipy LS.
"""

import numpy as np

try:
    from scipy.optimize import least_squares
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

from geometry import (
    closest_point_on_circle,
    dist,
    distance_point_to_line,
    enforce_distance,
    enforce_distance_fixed_q,
    normalize_or_default,
    vec3,
)

# ============================================================
# PBD solver (legacy fallback / fast path)
# ============================================================

def _solve_bump_pbd(hp_right, dz, max_iter=80, tol=0.01, damping=0.35):
    """PBD solver. Use solve_bump() in production."""
    CH1 = np.array(hp_right["CH1"])
    CH2 = np.array(hp_right["CH2"])
    CH3 = np.array(hp_right["CH3"])
    CH4 = np.array(hp_right["CH4"])
    CH5 = np.array(hp_right["CH5"])

    UP1_0 = np.array(hp_right["UP1"], dtype=float)
    UP2_0 = np.array(hp_right["UP2"], dtype=float)
    UP3_0 = np.array(hp_right["UP3"], dtype=float)
    UP4_0 = np.array(hp_right["UP4"], dtype=float)
    UP5_0 = np.array(hp_right["UP5"], dtype=float)
    FL1_0 = np.array(hp_right["FL1"], dtype=float)

    R_uca = distance_point_to_line(UP1_0, CH1, CH2)
    R_lca = distance_point_to_line(UP2_0, CH3, CH4)
    L_kingpin = dist(UP1_0, UP2_0)
    L_up1_up5 = dist(UP1_0, UP5_0)
    L_up2_up5 = dist(UP2_0, UP5_0)
    L_tie_rod = dist(UP3_0, FL1_0)

    upright_local = _compute_upright_local(UP1_0, UP2_0, UP3_0, UP4_0, UP5_0)

    UP5_new = np.array(UP5_0)
    UP5_new[2] += dz

    # Cold-start PBD from design position. The PBD's "closest point on
    # circle" projection naturally finds the design branch (closest to
    # design position). At boundary travel values the design branch has
    # small inherent discontinuities; the post-processor in routes/solve.py
    # detects and linearly interpolates these to give smooth curves.
    UP1_new = np.array(UP1_0)
    UP2_new = np.array(UP2_0)

    for iteration in range(max_iter):
        target = closest_point_on_circle(UP1_new, CH1, CH2, R_uca)
        UP1_new = UP1_new + damping * (target - UP1_new)

        target = closest_point_on_circle(UP2_new, CH3, CH4, R_lca)
        UP2_new = UP2_new + damping * (target - UP2_new)

        p1, p2 = enforce_distance(UP1_new, UP2_new, L_kingpin)
        UP1_new = UP1_new + damping * (p1 - UP1_new)
        UP2_new = UP2_new + damping * (p2 - UP2_new)

        target = enforce_distance_fixed_q(UP1_new, UP5_new, L_up1_up5)
        UP1_new = UP1_new + damping * (target - UP1_new)
        target = enforce_distance_fixed_q(UP2_new, UP5_new, L_up2_up5)
        UP2_new = UP2_new + damping * (target - UP2_new)

        e1 = abs(distance_point_to_line(UP1_new, CH1, CH2) - R_uca)
        e2 = abs(distance_point_to_line(UP2_new, CH3, CH4) - R_lca)
        e3 = abs(dist(UP1_new, UP2_new) - L_kingpin)
        e4 = abs(dist(UP1_new, UP5_new) - L_up1_up5)
        e5 = abs(dist(UP2_new, UP5_new) - L_up2_up5)
        if max(e1, e2, e3, e4, e5) < tol:
            break

    UP3_new, UP4_new, UP5_check = _reconstruct_upright(
        UP1_new, UP2_new, UP5_new, upright_local
    )

    FL1_new = np.array(FL1_0)

    return {
        "UP1": UP1_new.tolist(), "UP2": UP2_new.tolist(),
        "UP3": UP3_new.tolist(), "UP4": UP4_new.tolist(),
        "UP5": UP5_new.tolist(), "FL1": FL1_new.tolist(),
        "push_rod_length": float(dist(UP4_new, CH5)),
        "tie_rod_length": L_tie_rod,
        "iterations": iteration + 1,
        "max_residual": float(max(e1, e2, e3, e4, e5)),
    }


# ============================================================
# Upright local frame helpers
# ============================================================

def _compute_upright_local(UP1, UP2, UP3, UP4, UP5):
    """Compute local coordinates of upright points relative to UP1-UP2-UP5 frame."""
    origin = UP1
    z_axis = normalize_or_default(vec3(UP1, UP2), [0.0, 0.0, -1.0])

    up15 = vec3(UP1, UP5)
    x_axis = normalize_or_default(np.cross(up15, z_axis))
    y_axis = np.cross(z_axis, x_axis)

    def to_local(p):
        v = vec3(origin, p)
        return np.array([np.dot(v, x_axis), np.dot(v, y_axis), np.dot(v, z_axis)])

    return {
        "UP1": to_local(UP1),
        "UP2": to_local(UP2),
        "UP3": to_local(UP3),
        "UP4": to_local(UP4),
        "UP5": to_local(UP5),
    }


def _reconstruct_upright(UP1_new, UP2_new, UP5_new, upright_local):
    """Reconstruct upright points from new UP1, UP2, UP5 positions and local coordinates."""
    origin = UP1_new
    z_axis = normalize_or_default(vec3(UP1_new, UP2_new), [0.0, 0.0, -1.0])

    up15 = vec3(UP1_new, UP5_new)
    x_axis = normalize_or_default(np.cross(up15, z_axis))
    y_axis = np.cross(z_axis, x_axis)

    def from_local(local):
        return origin + local[0] * x_axis + local[1] * y_axis + local[2] * z_axis

    return (
        from_local(np.array(upright_local["UP3"])),
        from_local(np.array(upright_local["UP4"])),
        from_local(np.array(upright_local["UP5"])),
    )


# ============================================================
# Main bump solver
# ============================================================

def solve_bump(hp_right, dz, polish=False, prev_up=None):
    """
    Solve double-wishbone bump kinematics.

    With polish=False (default): uses fast PBD iteration, <1ms per solve.
    Suitable for interactive slider drags where visual accuracy at the
    0.1mm level is sufficient.

    With polish=True: PBD + scipy least_squares refinement, drives residual
    to machine zero. ~300ms per solve. Use for sweep/analysis where
    precision matters.

    prev_up: optional (UP1, UP2) tuple from the previous sweep step's bump
    solution. Accepted for API compatibility with the sweep's continuation
    loop, but the LS polish is anchored to the PBD result (design branch)
    instead: with the bidirectional sweep order, consecutive steps come from
    OPPOSITE sides of the travel range, so a prev_up warm start lands on the
    wrong sheet of the (under-determined) constraint system and the LS drifts
    onto a wrong physical branch. The PBD still runs first for branch
    identification; the LS polishes within a tight margin of the PBD result,
    with a soft anchor pull toward it so it cannot escape onto another branch.
    """
    if not polish or not HAS_SCIPY:
        return _solve_bump_pbd(hp_right, dz)

    CH1 = np.array(hp_right["CH1"])
    CH2 = np.array(hp_right["CH2"])
    CH3 = np.array(hp_right["CH3"])
    CH4 = np.array(hp_right["CH4"])
    CH5 = np.array(hp_right["CH5"])

    UP1_0 = np.array(hp_right["UP1"], dtype=float)
    UP2_0 = np.array(hp_right["UP2"], dtype=float)
    UP3_0 = np.array(hp_right["UP3"], dtype=float)
    UP4_0 = np.array(hp_right["UP4"], dtype=float)
    UP5_0 = np.array(hp_right["UP5"], dtype=float)
    FL1_0 = np.array(hp_right["FL1"], dtype=float)

    R_uca = distance_point_to_line(UP1_0, CH1, CH2)
    R_lca = distance_point_to_line(UP2_0, CH3, CH4)
    L_kp = dist(UP1_0, UP2_0)
    L_u15 = dist(UP1_0, UP5_0)
    L_u25 = dist(UP2_0, UP5_0)
    L_tr = dist(UP3_0, FL1_0)

    upright_local = _compute_upright_local(UP1_0, UP2_0, UP3_0, UP4_0, UP5_0)

    UP5_new = np.array(UP5_0)
    UP5_new[2] += dz

    # Stage 1: PBD (always — robust branch identification)
    pbd_result = _solve_bump_pbd(hp_right, dz)

    UP1_new = np.array(pbd_result["UP1"])
    UP2_new = np.array(pbd_result["UP2"])
    max_res = pbd_result["max_residual"]

    # Stage 2: LS polish
    nfev = pbd_result["iterations"]

    # Decide whether to run LS.
    # The UP5-rigid-translation constraint system (UP1/UP2 on their A-arm
    # circles + kingpin/UP5 distance constraints) is NOT exactly solvable
    # for most travel values — the least_squares cost decreases by sliding
    # along an unbounded residual valley, so with a wide trust region the
    # solution drifts off the design branch (the 5-15° caster/toe branch
    # jumps seen at ~-5mm sweep travel). The PBD result (cold-started from
    # the design position) reliably identifies the design branch, so we
    # anchor the LS warm start to it with a tight margin: enough to polish
    # the residual, too small to escape onto another branch.
    #
    # (prev_up from the previous sweep step was previously used as the LS
    # warm start for branch continuation, but it breaks the bidirectional
    # sweep: consecutive steps are solved on OPPOSITE sides of the travel
    # range, so the warm start lands on the wrong sheet of the constraint
    # manifold and the drift compounds step by step.)
    has_continuation = prev_up is not None
    run_ls = (has_continuation or abs(dz) <= 15.5) and max_res > 1e-6

    if run_ls:
        # Warm-start from the PBD result (design branch) with a tight margin
        x0 = np.concatenate([UP1_new, UP2_new])
        margin = 2.0

        lb = x0 - margin
        ub = x0 + margin

        def residuals(x):
            UP1 = x[0:3]
            UP2 = x[3:6]
            r = np.array([
                distance_point_to_line(UP1, CH1, CH2) - R_uca,
                distance_point_to_line(UP2, CH3, CH4) - R_lca,
                dist(UP1, UP2) - L_kp,
                dist(UP1, UP5_new) - L_u15,
                dist(UP2, UP5_new) - L_u25,
            ])
            # Branch anchor: the constraint system is under-determined
            # (5 constraints / 6 unknowns) and the raw constraint residual
            # decreases by sliding along an unbounded valley away from the
            # design branch. A weak pull toward the PBD result keeps the
            # polish on the design branch while still improving residuals.
            return np.concatenate([r, 2.0 * (x - x0)])

        result = least_squares(
            residuals, x0, method='trf',
            bounds=(lb, ub),
            ftol=1e-12, xtol=1e-12, gtol=1e-12,
            max_nfev=2000,
        )

        # Acceptance is based on the constraint residuals only (the anchor
        # terms are artificial and must not gate the result).
        ls_max_res = float(np.max(np.abs(result.fun[:5])))
        if ls_max_res < max_res:
            UP1_new = result.x[0:3]
            UP2_new = result.x[3:6]
            max_res = ls_max_res
            nfev += result.nfev

    UP3_new, UP4_new, UP5_check = _reconstruct_upright(
        UP1_new, UP2_new, UP5_new, upright_local
    )

    FL1_new = np.array(FL1_0)

    return {
        "UP1": UP1_new.tolist(),
        "UP2": UP2_new.tolist(),
        "UP3": UP3_new.tolist(),
        "UP4": UP4_new.tolist(),
        "UP5": UP5_new.tolist(),
        "FL1": FL1_new.tolist(),
        "push_rod_length": float(dist(UP4_new, CH5)),
        "tie_rod_length": L_tr,
        "iterations": nfev,
        "max_residual": float(round(max_res, 6)),
    }
