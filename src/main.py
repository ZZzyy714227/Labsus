"""
FSAE Suspension Kinematics Solver — V1 Prototype
Front axle, double wishbone + push-rod, pure bump + pure steering
Coordinate system: X forward, Y right, Z up. Origin: front axle center, vehicle CL, ground.
"""

import math
import json
import os
from typing import Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import numpy as np

try:
    from scipy.optimize import least_squares
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

app = FastAPI(title="FSAE Suspension Solver")


# ============================================================
# DEFAULT HARDPOINTS — right side (left = mirror Y)
#   track ~1040mm, tire radius ~210mm (420mm OD ≈ 16.5in), tire width 160mm
# ============================================================

from geometry import deg as _deg, rad as _rad
from config import (REAR_PREFIX, DESIGN_PARAMS, DEFAULT_FRAME_NODES, FRAME_TUBES,
                    FRAME_TUBE_COLORS, BODYWORK_FACES, REAR_WING, FRONT_WING,
                    UNDERTRAY_CONFIG, DIFFUSER_CONFIG,
                    CHASSIS_KEYS, UPRIGHT_KEYS, FLOAT_KEYS)


from geometry import (vec3, dist, distance_point_to_line, closest_point_on_line,
                      closest_point_on_circle, enforce_distance, enforce_distance_fixed_q)

# Sweep curve keys (module-level constants, reused per call)
SWEEP_ANGLE_KEYS = ["camber_deg", "toe_deg", "caster_deg",
                    "kpi_deg", "scrub_radius_mm", "caster_trail_mm"]
SWEEP_ROCKER_KEYS = ["rocker_angle_deg", "damper_travel", "motion_ratio"]

# ============================================================
# KINEMATICS SOLVER — Pure Bump (1-DOF)
#   Uses scipy least_squares with full A-arm sphere constraints.
#   Falls back to PBD iteration if scipy unavailable.
# ============================================================

def _solve_bump_pbd(hp_right, dz, max_iter=80, tol=0.01, damping=0.35):
    """Legacy PBD solver kept for reference. Use solve_bump() instead."""
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

    # Tie rod coupling: NOT done here by moving UP3 in isolation.
    # Instead solve_steering() rotates the entire upright about kingpin
    # to satisfy the tie rod — this gives the correct bump steer angle.
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


def solve_bump(hp_right, dz, polish=False):
    """
    Solve double-wishbone bump kinematics.

    With polish=False (default): uses fast PBD iteration, <1ms per solve.
    Suitable for interactive slider drags where visual accuracy at the
    0.1mm level is sufficient.

    With polish=True: PBD + scipy least_squares refinement in normal range
    (|dz| ≤ 15mm), drives residual to machine zero. ~300ms per solve.
    Use for sweep/analysis where precision matters.
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

    # Pre-compute constraint parameters from static design position
    R_uca = distance_point_to_line(UP1_0, CH1, CH2)
    R_lca = distance_point_to_line(UP2_0, CH3, CH4)
    L_kp  = dist(UP1_0, UP2_0)
    L_u15 = dist(UP1_0, UP5_0)
    L_u25 = dist(UP2_0, UP5_0)
    L_tr  = dist(UP3_0, FL1_0)

    upright_local = _compute_upright_local(UP1_0, UP2_0, UP3_0, UP4_0, UP5_0)

    # Bump: move wheel center UP5 by dz in Z only
    UP5_new = np.array(UP5_0)
    UP5_new[2] += dz

    # Strategy: PBD for robustness + LS for precision.
    # PBD is always on the correct physical branch (sequential projection
    # follows the suspension's natural motion). LS refines to machine
    # precision. But in the 1-DOF nullspace of the underdetermined system,
    # LS can jump to a non-physical branch at extreme travel (±25+ mm).
    # So we only apply LS polish within the normal operating range.

    # Stage 1: PBD (always — robust branch selection)
    pbd_result = _solve_bump_pbd(hp_right, dz)

    UP1_new = np.array(pbd_result["UP1"])
    UP2_new = np.array(pbd_result["UP2"])
    max_res = pbd_result["max_residual"]

    # Stage 2: LS polish — only within normal range where branch-jumping
    # is not a risk (|dz| ≤ 15mm, verified safe on this geometry).
    # At extremes, the kinematic model itself breaks down (UP5 moving
    # purely in Z is an approximation), so we keep the PBD result.
    nfev = pbd_result["iterations"]
    if abs(dz) <= 15.5 and max_res > 1e-6:
        x0 = np.concatenate([UP1_new, UP2_new])
        margin = 5.0
        lb = x0 - margin
        ub = x0 + margin

        def residuals(x):
            UP1 = x[0:3]
            UP2 = x[3:6]
            return np.array([
                distance_point_to_line(UP1, CH1, CH2) - R_uca,
                distance_point_to_line(UP2, CH3, CH4) - R_lca,
                dist(UP1, UP2) - L_kp,
                dist(UP1, UP5_new) - L_u15,
                dist(UP2, UP5_new) - L_u25,
            ])

        result = least_squares(residuals, x0, method='trf',
                               bounds=(lb, ub),
                               ftol=1e-12, xtol=1e-12, gtol=1e-12,
                               max_nfev=2000)

        ls_max_res = float(np.max(np.abs(result.fun)))
        # Only accept LS if it actually improved the residual
        if ls_max_res < max_res:
            UP1_new = result.x[0:3]
            UP2_new = result.x[3:6]
            max_res = ls_max_res
            nfev += result.nfev  # count LS evals on top of PBD iters

    # Reconstruct UP3, UP4 from rigid-body transform
    UP3_new, UP4_new, UP5_check = _reconstruct_upright(
        UP1_new, UP2_new, UP5_new, upright_local
    )

    # Tie rod coupling: NOT done here by moving UP3 in isolation.
    # Instead solve_steering() rotates the entire upright about kingpin.
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


def _compute_upright_local(UP1, UP2, UP3, UP4, UP5):
    """Compute local coordinates of upright points relative to UP1-UP2-UP5 frame."""
    # Build local frame:
    #   origin = UP1
    #   z_axis = UP1 → UP2 (kingpin direction)
    #   x_axis = perpendicular to z and UP1→UP5
    #   y_axis = z × x
    origin = UP1
    z_axis = vec3(UP1, UP2)
    z_axis = z_axis / np.linalg.norm(z_axis)

    up15 = vec3(UP1, UP5)
    x_axis = np.cross(up15, z_axis)
    x_norm = np.linalg.norm(x_axis)
    if x_norm < 1e-12:
        x_axis = np.array([1.0, 0.0, 0.0])
    else:
        x_axis = x_axis / x_norm

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
    # Build new local frame
    origin = UP1_new
    z_axis = vec3(UP1_new, UP2_new)
    z_axis = z_axis / np.linalg.norm(z_axis)

    up15 = vec3(UP1_new, UP5_new)
    x_axis = np.cross(up15, z_axis)
    x_norm = np.linalg.norm(x_axis)
    if x_norm < 1e-12:
        x_axis = np.array([1.0, 0.0, 0.0])
    else:
        x_axis = x_axis / x_norm

    y_axis = np.cross(z_axis, x_axis)

    def from_local(local):
        return origin + local[0] * x_axis + local[1] * y_axis + local[2] * z_axis

    return (
        from_local(np.array(upright_local["UP3"])),
        from_local(np.array(upright_local["UP4"])),
        from_local(np.array(upright_local["UP5"])),
    )


# ============================================================
# ROCKER KINEMATICS — rotate rocker triangle around X-axis
# ============================================================

from geometry import rotate_around_x as _rotate_around_x


def compute_rocker_kinematics(hp_right, result_right, frame_nodes, prefix=''):
    """
    Compute rocker rotation angle and damper length from bump results.

    The rocker is a rigid 3-point triangle (CH5, pivot, damper) that rotates
    about the X-axis through the pivot. Given the solved UP4 position and the
    design push-rod length, find the rotation angle θ such that:
        |rotate(CH5_design, θ) - UP4_current| = push_rod_len_design

    Then rotate the damper attachment by the same θ to get the new damper length.

    Returns dict with: push_rod_len_design, rocker_angle_deg,
                       damper_len_design, damper_len_current, damper_travel
    """
    ch5_key = prefix + 'CH5'
    up4_key = prefix + 'UP4'
    piv_key = prefix + 'RK_PIVOT_R'
    dmp_key = prefix + 'RK_DAMPER_R'
    dmp_chassis_key = prefix + 'DAMPER_CHASSIS_FR'

    # Design (static) positions
    CH5_0 = np.array(hp_right[ch5_key], dtype=float)
    UP4_0 = np.array(hp_right[up4_key], dtype=float)

    # Current UP4 from solver result
    UP4 = np.array(result_right[up4_key], dtype=float)

    # Frame nodes for rocker mechanism
    pivot = np.array(frame_nodes.get(piv_key, [0.0, 0.0, 0.0]), dtype=float)
    damper_rocker = np.array(frame_nodes.get(dmp_key, [0.0, 0.0, 0.0]), dtype=float)
    damper_chassis = np.array(frame_nodes.get(dmp_chassis_key, [0.0, 0.0, 0.0]), dtype=float)

    # Design push-rod length (rigid link, does not change)
    L_pr = float(np.linalg.norm(UP4_0 - CH5_0))
    if L_pr < 1.0:
        return None

    # Design damper length (for travel = 0 reference)
    damper_len_0 = float(np.linalg.norm(damper_rocker - damper_chassis))

    def error(theta):
        ch5_rot = _rotate_around_x(CH5_0, pivot, theta)
        return float(np.linalg.norm(ch5_rot - UP4)) - L_pr

    e0 = error(0.0)
    if abs(e0) < 1e-9:
        theta = 0.0
    else:
        # Determine direction from 0 to nearest root
        ep = error(0.001)
        em = error(-0.001)
        direction = 1.0 if abs(ep) < abs(em) else -1.0

        # Bracket the root by expanding from 0
        lo, hi = 0.0, 0.0
        found = False
        for r in [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, math.pi]:
            t = direction * r
            if error(0.0) * error(t) <= 0:
                lo, hi = (0.0, t) if direction > 0 else (t, 0.0)
                found = True
                break

        if not found:
            # Coarse scan for minimum error (fallback: geometry may be
            # inconsistent — just find the angle that gets closest)
            best, best_e = 0.0, abs(e0)
            for t_scan in np.linspace(-math.pi, math.pi, 101):
                e_scan = abs(error(float(t_scan)))
                if e_scan < best_e:
                    best_e, best = e_scan, float(t_scan)
            theta = best
        else:
            # Bisection
            for _ in range(50):
                mid = (lo + hi) / 2.0
                if error(lo) * error(mid) <= 0:
                    hi = mid
                else:
                    lo = mid
                if hi - lo < 1e-10:
                    break
            theta = (lo + hi) / 2.0

    # Rotate damper rocker attachment by same angle
    damper_rocker_rot = _rotate_around_x(damper_rocker, pivot, theta)
    damper_len = float(np.linalg.norm(damper_rocker_rot - damper_chassis))
    damper_travel = damper_len - damper_len_0

    return {
        'push_rod_len_design': round(L_pr, 3),
        'rocker_angle_deg': round(math.degrees(theta), 3),
        'damper_len_design': round(damper_len_0, 3),
        'damper_len_current': round(damper_len, 3),
        'damper_travel': round(damper_travel, 3),
    }


# ============================================================
# KINEMATICS SOLVER — Pure Steering (1-DOF)
# ============================================================

def solve_steering(hp_right, rack_displacement, max_iter=50, tol=1e-8,
                   tie_rod_length=None, theta_guess=0.0):
    """
    Given right-side hardpoints and rack Y-displacement (mm, positive = rack right),
    return new positions. Works with both design positions (pure steer) and
    bumped positions (bump + steer coupling).

    Rack displacement moves FL1 in Y direction. Tie rod pulls/pushes UP3,
    causing the upright to rotate about the kingpin axis (UP1-UP2).

    If tie_rod_length is provided (from static design), it is used as the
    target constraint length. Otherwise it's computed from the input positions
    (backward compatible, assumes design-position UP3 and FL1).

    theta_guess: initial guess for Newton iteration (rad). Default 0.
    Use the previous bump-step's theta for continuation — dramatically
    reduces branch-jumping on large-displacement sweeps.
    """
    CH5 = np.array(hp_right.get("CH5", [0, 0, 0]))

    UP1 = np.array(hp_right["UP1"], dtype=float)
    UP2 = np.array(hp_right["UP2"], dtype=float)
    UP3 = np.array(hp_right["UP3"], dtype=float)
    UP4 = np.array(hp_right["UP4"], dtype=float)
    UP5 = np.array(hp_right["UP5"], dtype=float)
    FL1 = np.array(hp_right["FL1"], dtype=float)

    # Rack moves in Y
    FL1_new = np.array(FL1)
    FL1_new[1] += rack_displacement

    # Use design tie rod length if provided, else compute from input positions
    L_tie_rod = tie_rod_length if tie_rod_length is not None else dist(UP3, FL1)

    # Kingpin axis
    kp_origin = UP1
    kp_dir = vec3(UP1, UP2)
    kp_norm = float(np.linalg.norm(kp_dir))
    if kp_norm < 1e-12:
        return {
            "UP1": UP1.tolist(), "UP2": UP2.tolist(), "UP3": UP3.tolist(),
            "UP4": UP4.tolist(), "UP5": UP5.tolist(), "FL1": FL1_new.tolist(),
            "push_rod_length": float(dist(UP4, CH5)),
            "tie_rod_length": L_tie_rod, "iterations": 0,
            "_newton_converged": False, "_used_fallback": False,
            "steering_theta": 0.0,
        }
    kp_dir = kp_dir / kp_norm

    # UP3 rotates around kingpin. Find rotation angle that satisfies tie rod length.
    up3_to_kp = closest_point_on_line(UP3, UP1, UP2)
    up3_radial = UP3 - up3_to_kp
    up3_r = float(np.linalg.norm(up3_radial))

    if up3_r < 1e-9:
        # UP3 lies on kingpin axis — cannot rotate it off axis with tie rod
        return {
            "UP1": UP1.tolist(), "UP2": UP2.tolist(), "UP3": UP3.tolist(),
            "UP4": UP4.tolist(), "UP5": UP5.tolist(), "FL1": FL1_new.tolist(),
            "push_rod_length": float(dist(UP4, CH5)),
            "tie_rod_length": L_tie_rod, "iterations": 0,
            "_newton_converged": False, "_used_fallback": False,
            "steering_theta": 0.0,
        }

    # Local basis for rotation plane
    u = up3_radial / up3_r
    v = np.cross(kp_dir, u)

    # Use Newton's method to find θ: |UP3(θ) - FL1_new| = L_tie_rod
    theta = theta_guess
    it = 0
    newton_ok = False
    for it in range(max_iter):
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)
        UP3_rot = up3_to_kp + up3_r * (cos_t * u + sin_t * v)

        vec_to_fl1 = UP3_rot - FL1_new
        d = float(np.linalg.norm(vec_to_fl1))
        err = d - L_tie_rod

        if abs(err) < tol:
            newton_ok = True
            break

        if d > 1e-12:
            d_up3_dtheta = up3_r * (-sin_t * u + cos_t * v)
            d_err_dtheta = float(np.dot(vec_to_fl1, d_up3_dtheta)) / d
            if abs(d_err_dtheta) > 1e-12:
                theta -= err / d_err_dtheta

    # Branch check: if Newton converged to a huge angle (>45°),
    # or failed to converge, do a global scan and pick the root
    # closest to θ=0 (the physically correct branch).
    used_fallback = False
    if not newton_ok or abs(theta) > 0.7854:  # 0.7854 rad ≈ 45°
        used_fallback = True
        # Global scan: sample error on [-π, π], bracket & bisect all roots
        n_scan = 1200
        scan = np.linspace(-math.pi, math.pi, n_scan)
        best_root = 0.0
        best_abs = float('inf')
        prev_e = None
        prev_t = scan[0]

        def _err_at(t):
            ct = math.cos(t)
            st = math.sin(t)
            up3_t = up3_to_kp + up3_r * (ct * u + st * v)
            return float(np.linalg.norm(up3_t - FL1_new)) - L_tie_rod

        for i in range(1, n_scan):
            t_i = scan[i]
            e_i = _err_at(t_i)
            if prev_e is not None and prev_e * e_i <= 0:
                # Root bracketed in [prev_t, t_i]; bisect
                lo, hi = prev_t, t_i
                e_lo = prev_e
                for _ in range(40):
                    mid = (lo + hi) / 2.0
                    e_mid = _err_at(mid)
                    if abs(e_mid) < tol:
                        lo = hi = mid
                        break
                    if e_lo * e_mid <= 0:
                        hi = mid
                    else:
                        lo = mid
                        e_lo = e_mid
                    if hi - lo < 1e-12:
                        break
                root = (lo + hi) / 2.0
                if abs(root) < best_abs:
                    best_abs = abs(root)
                    best_root = root
            prev_e = e_i
            prev_t = t_i

        if best_abs < float('inf'):
            theta = best_root
            it = max_iter  # mark that we used fallback

    # Compute all upright points rotated by θ around kingpin
    def rotate_around_kp(pt, origin, direction, angle):
        to_pt = pt - origin
        proj = np.dot(to_pt, direction) * direction
        radial = to_pt - proj
        r = float(np.linalg.norm(radial))
        if r < 1e-12:
            return origin + proj
        uu = radial / r
        vv = np.cross(direction, uu)
        return origin + proj + r * (math.cos(angle) * uu + math.sin(angle) * vv)

    UP1_new = np.array(UP1)  # Fixed (no bump)
    UP2_new = np.array(UP2)  # Fixed (no bump)
    UP3_new = up3_to_kp + up3_r * (math.cos(theta) * u + math.sin(theta) * v)
    UP4_new = rotate_around_kp(UP4, kp_origin, kp_dir, theta)
    UP5_new = rotate_around_kp(UP5, kp_origin, kp_dir, theta)

    return {
        "UP1": UP1_new.tolist(),
        "UP2": UP2_new.tolist(),
        "UP3": UP3_new.tolist(),
        "UP4": UP4_new.tolist(),
        "UP5": UP5_new.tolist(),
        "FL1": FL1_new.tolist(),
        "push_rod_length": float(dist(UP4_new, CH5)),
        "tie_rod_length": L_tie_rod,
        "iterations": it + 1,
        "_newton_converged": newton_ok and not used_fallback,
        "_used_fallback": used_fallback,
        "steering_theta": theta,
    }


# ============================================================
# ANGLE COMPUTATIONS
# ============================================================

def compute_alignment_angles(result_dict, chassis_points=None, hp=None):
    """
    Compute alignment angles from solver result.
    result_dict contains UP1-UP5, FL1 (from solver output).
    chassis_points contains CH1-CH5 (needed for full context, optional).
    hp optionally contains tire parameters for contact-patch-aware scrub/trail.
    """
    UP1 = np.array(result_dict["UP1"])
    UP2 = np.array(result_dict["UP2"])
    UP5 = np.array(result_dict["UP5"])
    FL1 = np.array(result_dict.get("FL1", [0, 0, 0]))
    UP3 = np.array(result_dict.get("UP3", [0, 0, 0]))

    # Kingpin axis: UP1 (upper) → UP2 (lower)
    kp_vec = UP2 - UP1
    kp_len = float(np.linalg.norm(kp_vec))
    if kp_len < 1e-12:
        return {"camber_deg": 0, "kpi_deg": 0, "caster_deg": 0,
                "toe_deg": 0, "scrub_radius_mm": 0, "caster_trail_mm": 0}
    kp_dir = kp_vec / kp_len

    # ---- Upright local frame (reused by camber, toe, and scrub) ----
    # Build once from UP1/UP2/UP5:
    #   z_axis = kingpin direction (UP1 → UP2)
    #   x_axis = perpendicular to z and UP1→UP5
    #   y_axis = z × x (wheel spin axis)
    upright_frame_valid = False
    z_axis_u = x_axis_u = y_axis_u = None
    up15 = vec3(UP1, UP5)
    z_ax_tmp = vec3(UP1, UP2)
    z_tmp_norm = float(np.linalg.norm(z_ax_tmp))
    if z_tmp_norm > 1e-12:
        z_axis_u = z_ax_tmp / z_tmp_norm
        x_axis_u = np.cross(up15, z_axis_u)
        x_tmp_norm = float(np.linalg.norm(x_axis_u))
        if x_tmp_norm > 1e-12:
            x_axis_u = x_axis_u / x_tmp_norm
            y_axis_u = np.cross(z_axis_u, x_axis_u)
            upright_frame_valid = True

    # ---- KPI (Kingpin Inclination) ----
    # Angle of kingpin from vertical in YZ (front view).
    # kp_vec[1] > 0 → lower BJ outboard of upper → top tilts inward → positive KPI.
    # Vertical-down reference: (0, 0, -1). Projection in YZ: (kp_vec[1], kp_vec[2]).
    kpi_rad = math.atan2(kp_vec[1], -kp_vec[2])
    kpi_deg = math.degrees(kpi_rad)

    # ---- Camber ----
    # Camber = tilt of wheel plane from vertical in YZ (front view).
    # Negative camber = top of wheel tilts inward (toward vehicle CL).
    # Computed from the upright frame: the wheel spin axis is the upright Y axis,
    # camber is its tilt from the horizontal Y direction.
    if upright_frame_valid:
        # Camber = tilt of wheel spin axis (y_axis_u) from horizontal Y direction
        camber_rad = -math.atan2(float(y_axis_u[2]),
                                 float(math.hypot(y_axis_u[0], y_axis_u[1])))
        camber_deg = math.degrees(camber_rad)
    else:
        camber_deg = 0.0

    # ---- Caster ----
    # Angle of kingpin from vertical in XZ (side view).
    # kp_vec[0] > 0 → lower BJ behind upper → positive caster (trailing).
    # In our convention: X forward. Upper BJ at X≈5, lower BJ at X≈5.
    # If upper BJ is forward of lower BJ → positive caster.
    # Vertical-down reference projected in XZ: (kp_vec[0], kp_vec[2]).
    caster_rad = math.atan2(-kp_vec[0], -kp_vec[2])
    caster_deg = math.degrees(caster_rad)

    # ---- Toe ----
    # Toe = angle of wheel rolling direction relative to vehicle X axis in XY plane.
    # Positive toe = toe-in (front of wheel points inward toward vehicle CL).
    # Computed from the upright frame: build local axes from UP1/UP2/UP5,
    # the wheel forward direction is the upright's X axis projected to XY.
    if upright_frame_valid:
        # Upright X points rearward in our convention (cross product order).
        # Wheel forward = -x_axis_u, projected to XY plane.
        wheel_fwd_xy = np.array([-x_axis_u[0], -x_axis_u[1]])
        toe_rad = math.atan2(wheel_fwd_xy[1], wheel_fwd_xy[0])
        toe_deg = math.degrees(toe_rad)
    else:
        toe_deg = 0.0

    # ---- Scrub Radius ----
    # Intersection of kingpin axis with ground (Z=0), distance from contact patch Y.
    cp = None
    if hp and hp.get("tire_spring_rate") is not None and upright_frame_valid:
        # Use pre-computed upright Y axis for camber-aware contact patch
        cp = compute_contact_patch(UP5, y_axis_u, hp)

    if cp and cp.get("center"):
        contact_y = cp["center"][1]
        contact_x = cp["center"][0]
    else:
        contact_y = UP5[1]
        contact_x = UP5[0]

    if abs(kp_dir[2]) > 1e-9:
        t = -UP1[2] / kp_dir[2]
        kp_ground_y = UP1[1] + t * kp_dir[1]
        kp_ground_x = UP1[0] + t * kp_dir[0]
        scrub = contact_y - kp_ground_y
        trail = kp_ground_x - contact_x
    else:
        scrub = 0.0
        trail = 0.0

    # ---- Solver health ----
    # Determined by solve_steering fields placed in result_dict.
    # Possible values: "healthy" | "healthy_but_fallback" | "unhealthy" | "not_applicable"
    solver_healthy = "not_applicable"
    if "_newton_converged" in result_dict and "_used_fallback" in result_dict:
        if result_dict["_newton_converged"]:
            solver_healthy = "healthy"
        elif result_dict["_used_fallback"]:
            solver_healthy = "healthy_but_fallback"
        else:
            solver_healthy = "unhealthy"

    return {
        "camber_deg": round(camber_deg, 3),
        "kpi_deg": round(kpi_deg, 3),
        "caster_deg": round(caster_deg, 3),
        "toe_deg": round(toe_deg, 3),
        "scrub_radius_mm": round(scrub, 2),
        "caster_trail_mm": round(trail, 2),
        "_solver_healthy": solver_healthy,
    }


from tire import compute_contact_patch, _upright_y_axis
from hardpoints import (derive_hardpoints, DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS,
                        mirror_left, strip_prefix, add_prefix)
from persistence import (_update_source_file, _delete_tube_from_source,
                           _update_tube_color_in_source, _add_tube_to_source,
                           _add_face_to_source, _delete_face_from_source,
                           _save_rear_wing_to_source, _save_front_wing_to_source,
                           _save_undertray_to_source, _save_diffuser_to_source)
from api_models import (SolveRequest, SweepRequest, SavePointRequest,
                        DeleteTubeRequest, TubeColorRequest, AddTubeRequest,
                        FaceRequest, DeleteFaceRequest, UpdateParamsRequest,
                        OptimizeFL1Request)

# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/api/defaults")
async def get_defaults():
    """Return default hardpoints for both front and rear axles."""
    # Front axle
    hp_right_f = dict(DEFAULT_HARDPOINTS)
    hp_left_f = mirror_left(hp_right_f)
    angles_right_f = compute_alignment_angles(hp_right_f, hp=hp_right_f)
    angles_left_raw_f = compute_alignment_angles(hp_left_f, hp=hp_left_f)
    angles_left_f = _fix_left_angles(angles_left_raw_f, angles_right_f)

    # Rear axle
    hp_right_r = dict(DEFAULT_REAR_HARDPOINTS)
    hp_left_r = mirror_left(hp_right_r)
    hp_right_stripped = strip_prefix(hp_right_r, REAR_PREFIX)
    hp_left_stripped = strip_prefix(hp_left_r, REAR_PREFIX)
    angles_right_r = compute_alignment_angles(hp_right_stripped, hp=hp_right_stripped)
    angles_left_raw_r = compute_alignment_angles(hp_left_stripped, hp=hp_left_stripped)
    angles_left_r = _fix_left_angles(angles_left_raw_r, angles_right_r)

    # Static contact patches
    cp_fr = compute_contact_patch(hp_right_f["UP5"], _upright_y_axis(hp_right_f), hp_right_f)
    cp_fl = compute_contact_patch(hp_left_f["UP5"], _upright_y_axis(hp_left_f), hp_left_f)
    cp_rr = compute_contact_patch(hp_right_r["R_UP5"], _upright_y_axis(hp_right_stripped), hp_right_stripped)
    cp_rl = compute_contact_patch(hp_left_r["R_UP5"], _upright_y_axis(hp_left_stripped), hp_left_stripped)

    return {
        "front": {
            "right": hp_right_f,
            "left": hp_left_f,
            "angles_right": angles_right_f,
            "angles_left": angles_left_f,
            "contact_patch_right": cp_fr,
            "contact_patch_left": cp_fl,
        },
        "rear": {
            "right": hp_right_r,
            "left": hp_left_r,
            "angles_right": angles_right_r,
            "angles_left": angles_left_r,
            "contact_patch_right": cp_rr,
            "contact_patch_left": cp_rl,
        },
        "frame": {
            "nodes": DEFAULT_FRAME_NODES,
            "tubes": FRAME_TUBES,
            "tube_colors": FRAME_TUBE_COLORS,
        },
        "bodywork": BODYWORK_FACES,
        "rear_wing": REAR_WING,
        "front_wing": FRONT_WING,
        "undertray": UNDERTRAY_CONFIG,
        "diffuser": DIFFUSER_CONFIG,
        "params": DESIGN_PARAMS,
    }

def _merge_chassis(result, hp):
    """Merge chassis points (CH1-CH5) and global params from hardpoints into solver result."""
    merged = dict(result)
    for key in CHASSIS_KEYS:
        if key in hp:
            merged[key] = hp[key]
    for key in ["track_width", "tire_radius", "tire_width",
                "tire_spring_rate", "corner_weight_n"]:
        if key in hp:
            merged[key] = hp[key]
    return merged


def _fix_left_angles(angles_left_raw, angles_right):
    """Fix sign conventions for left-side angles (mirrored Y)."""
    return {
        "camber_deg": -angles_left_raw["camber_deg"],
        "kpi_deg": -angles_left_raw["kpi_deg"],
        "caster_deg": angles_left_raw["caster_deg"],
        "toe_deg": -angles_left_raw["toe_deg"] if abs(angles_left_raw["toe_deg"]) < 90 else angles_right["toe_deg"],
        "scrub_radius_mm": -angles_left_raw["scrub_radius_mm"],
        "caster_trail_mm": angles_left_raw["caster_trail_mm"],
    }


def _rear_rocker_frame_nodes():
    """Build rear-specific frame nodes for rocker kinematics.
    compute_rocker_kinematics expects front-specific node keys; remap rear R_* values."""
    return {
        'RK_PIVOT_R': DEFAULT_FRAME_NODES.get('R_RK_PIVOT_R', [0, 0, 0]),
        'RK_DAMPER_R': DEFAULT_FRAME_NODES.get('R_RK_DAMPER_R', [0, 0, 0]),
        'DAMPER_CHASSIS_FR': DEFAULT_FRAME_NODES.get('R_DAMPER_CHASSIS_RR', [0, 0, 0]),
    }


def _solve_axle(hp_right, wheel_travel, rack_displacement, mirror, frame_nodes=None, polish=False, theta_guess=0.0, skip_steering=False):
    """Solve one axle (front or rear). Returns {right, left?, angles_right, angles_left?, rocker?}.
    Set polish=True for LS refinement (slower but higher precision, for sweep curves).
    theta_guess: initial θ for steering solver (continuation from previous bump step).
    skip_steering: if True, skip solve_steering — pure bump only (for diagnostic)."""
    if frame_nodes is None:
        frame_nodes = DEFAULT_FRAME_NODES

    # Compute design tie rod length from static hardpoints (fixed physical length)
    L_tr_design = float(dist(np.array(hp_right["UP3"]), np.array(hp_right["FL1"])))

    # Step 1: Pure bump — solves UP1/UP2/UP5 from A-arm & wheel constraints.
    # UP3/UP4 are at rigid-body positions (tie rod NOT yet coupled).
    result_right = solve_bump(hp_right, wheel_travel, polish=polish)

    # Step 2: Merge chassis points so solve_steering can access CH1-CH5
    merged_right = _merge_chassis(result_right, hp_right)

    # Step 3: Steering solver — ALWAYS run, even with zero rack displacement.
    # This rotates the upright about kingpin to satisfy the tie rod constraint,
    # which gives the CORRECT bump steer (not the "free" toe from A-arm geometry alone).
    if skip_steering:
        result_right = merged_right  # use pure bump result directly
    else:
        result_right = solve_steering(merged_right, rack_displacement,
                                      tie_rod_length=L_tr_design, theta_guess=theta_guess)

    result_right_final = _merge_chassis(result_right, hp_right)
    angles_right = compute_alignment_angles(result_right_final, hp=hp_right)

    # Contact patch (right)
    cp_right = compute_contact_patch(
        result_right_final["UP5"],
        _upright_y_axis(result_right_final),
        hp_right,
    )

    # Step 4: Rocker kinematics (right side)
    rocker_right = compute_rocker_kinematics(hp_right, result_right_final, frame_nodes)

    resp = {
        "right": result_right_final,
        "angles_right": angles_right,
        "contact_patch_right": cp_right,
        "steering_theta": result_right.get("steering_theta", 0.0),
    }
    if rocker_right:
        resp["rocker_right"] = rocker_right

    if mirror:
        hp_left = mirror_left(hp_right)
        L_tr_design_left = float(dist(np.array(hp_left["UP3"]), np.array(hp_left["FL1"])))
        result_left = solve_bump(hp_left, wheel_travel, polish=polish)
        merged_left = _merge_chassis(result_left, hp_left)
        result_left = solve_steering(merged_left, rack_displacement,
                                      tie_rod_length=L_tr_design_left, theta_guess=theta_guess)
        result_left_final = _merge_chassis(result_left, hp_left)
        angles_left_raw = compute_alignment_angles(result_left_final, hp=hp_left)
        angles_left = _fix_left_angles(angles_left_raw, angles_right)
        cp_left = compute_contact_patch(
            result_left_final["UP5"],
            _upright_y_axis(result_left_final),
            hp_left,
        )
        resp["left"] = result_left_final
        resp["angles_left"] = angles_left
        resp["contact_patch_left"] = cp_left

        # Rocker kinematics (left side, mirrored frame nodes)
        frame_nodes_left = mirror_left(frame_nodes)
        rocker_left = compute_rocker_kinematics(hp_left, result_left_final, frame_nodes_left)
        if rocker_left:
            resp["rocker_left"] = rocker_left

    return resp


@app.post("/api/solve")
async def solve(req: SolveRequest):
    """Solve kinematics for front and rear axles.
    Supports asymmetric left/right travel when front_left_travel/rear_left_travel are set."""
    # Resolve per-corner travel (default symmetric)
    fR = req.front_travel
    fL = req.front_left_travel if req.front_left_travel is not None else req.front_travel
    rR = req.rear_travel
    rL = req.rear_left_travel if req.rear_left_travel is not None else req.rear_travel
    rack = req.rack_displacement

    # Front right
    fr = _solve_axle(dict(req.front_hardpoints), fR, rack, mirror=False)
    # Front left (if travel differs from right, solve separately; else use mirrored result)
    if abs(fL - fR) > 1e-6:
        fl = _solve_axle(dict(req.front_hardpoints), fL, rack, mirror=True)
    else:
        fl = _solve_axle(dict(req.front_hardpoints), fR, rack, mirror=True)

    front = {
        "right": fr.get("right", {}),
        "left": fl.get("left", {}),
        "angles_right": fr["angles_right"],
        "angles_left": fl["angles_left"],
        "contact_patch_right": fr.get("contact_patch_right"),
        "contact_patch_left": fl.get("contact_patch_left"),
        "steering_theta": fr.get("steering_theta", 0.0),
    }
    for k in ["rocker_right", "rocker_left"]:
        if k in fr: front[k] = fr[k]
        if k in fl: front[k] = fl[k]

    # Rear axle
    rear_hp = strip_prefix(dict(req.rear_hardpoints), REAR_PREFIX)

    # Build rear frame nodes for rocker kinematics.
    # compute_rocker_kinematics always looks for front-specific keys
    # (RK_PIVOT_R, RK_DAMPER_R, DAMPER_CHASSIS_FR), so remap rear R_* values.
    rear_frame_nodes = _rear_rocker_frame_nodes()

    rr = _solve_axle(rear_hp, rR, 0.0, mirror=False, frame_nodes=rear_frame_nodes)
    if abs(rL - rR) > 1e-6:
        rl = _solve_axle(rear_hp, rL, 0.0, mirror=True, frame_nodes=rear_frame_nodes)
    else:
        rl = _solve_axle(rear_hp, rR, 0.0, mirror=True, frame_nodes=rear_frame_nodes)

    # Add prefix back to rear result keys
    rear = {"right": {}, "left": {}}
    for side_key in ["right", "left"]:
        if side_key in rr:
            rear[side_key] = add_prefix(rr[side_key], REAR_PREFIX)
    if "left" in rl:
        rear["left"] = add_prefix(rl["left"], REAR_PREFIX)
    rear["angles_right"] = rr["angles_right"]
    rear["angles_left"] = rl["angles_left"]
    rear["contact_patch_right"] = rr.get("contact_patch_right")
    rear["contact_patch_left"] = rl.get("contact_patch_left")
    for k in ["rocker_right", "rocker_left"]:
        if k in rr: rear[k] = rr[k]
        if k in rl: rear[k] = rl[k]

    return {"front": front, "rear": rear}


@app.post("/api/sweep")
async def sweep(req: SweepRequest):
    """Sweep wheel travel range and return kinematics curves for both axles.
    Returns both 'steered' (with tie-rod coupling) and 'pure_bump' (A-arm only) data."""
    travel_values = np.linspace(req.start, req.end, req.steps).tolist()

    def sweep_axle(hp, travel_vals, rack, frame_nodes=None):
        results = {k: [] for k in SWEEP_ANGLE_KEYS}
        pure_results = {k: [] for k in SWEEP_ANGLE_KEYS}
        rocker_curves = {k: [] for k in SWEEP_ROCKER_KEYS}
        prev_theta = 0.0  # Continuation: pass steering θ from previous step
        prev_damper = 0.0  # For motion ratio differential
        for i, t in enumerate(travel_vals):
            # Steered solve (with tie-rod coupling)
            axle = _solve_axle(dict(hp), float(t), rack, mirror=False,
                               frame_nodes=frame_nodes, polish=True,
                               theta_guess=prev_theta)
            prev_theta = axle.get("steering_theta", 0.0)
            angles = axle["angles_right"]
            for k in SWEEP_ANGLE_KEYS:
                results[k].append(round(angles.get(k, 0.0), 6))

            # Pure bump solve (no tie-rod coupling) — for diagnostic
            axle_bump = _solve_axle(dict(hp), float(t), 0.0, mirror=False,
                                    frame_nodes=frame_nodes, polish=True,
                                    skip_steering=True)
            angles_bump = axle_bump["angles_right"]
            for k in SWEEP_ANGLE_KEYS:
                pure_results[k].append(round(angles_bump.get(k, 0.0), 6))

            # Rocker kinematics
            rocker = axle.get("rocker_right")
            if rocker:
                rocker_curves["rocker_angle_deg"].append(rocker["rocker_angle_deg"])
                rocker_curves["damper_travel"].append(rocker["damper_travel"])
                # Motion ratio via differential (avoid division near t=0)
                if i > 0:
                    dt = float(t) - float(travel_vals[i - 1])
                    dd = rocker["damper_travel"] - prev_damper
                    if abs(dt) > 1e-6:
                        rocker_curves["motion_ratio"].append(round(dd / dt, 4))
                    else:
                        rocker_curves["motion_ratio"].append(None)
                else:
                    rocker_curves["motion_ratio"].append(None)
                prev_damper = rocker["damper_travel"]
            else:
                for k in SWEEP_ROCKER_KEYS:
                    rocker_curves[k].append(None)
                prev_damper = 0.0
        results.update(rocker_curves)
        results["pure_bump"] = pure_results
        return results

    front_data = sweep_axle(req.front_hardpoints, travel_values, req.rack_displacement,
                            frame_nodes=DEFAULT_FRAME_NODES)
    rear_hp = strip_prefix(dict(req.rear_hardpoints), REAR_PREFIX)
    rear_frame_nodes = _rear_rocker_frame_nodes()
    rear_data = sweep_axle(rear_hp, travel_values, 0.0, frame_nodes=rear_frame_nodes)

    return {
        "travel": [round(v, 1) for v in travel_values],
        "front": front_data,
        "rear": rear_data,
    }


# ============================================================
# FL1 OPTIMIZER — minimize bump steer by finding optimal tie-rod inner point
# ============================================================

def _evaluate_bump_steer(hp, fl1_candidate, travel_vals, rack=0.0):
    """Evaluate total toe change (bump steer) for a given FL1 position.
    Returns sum of squared toe deviation from zero across all travel steps."""
    hp_test = dict(hp)
    hp_test["FL1"] = list(fl1_candidate)
    # Recompute tie rod length for this FL1
    L_tr = float(dist(np.array(hp_test["UP3"]), fl1_candidate))

    toe_vals = []
    prev_theta = 0.0
    for t in travel_vals:
        bump_result = solve_bump(hp_test, float(t), polish=False)
        merged = _merge_chassis(bump_result, hp_test)
        steer_result = solve_steering(merged, rack, tie_rod_length=L_tr, theta_guess=prev_theta)
        prev_theta = steer_result.get("steering_theta", 0.0)
        final = _merge_chassis(steer_result, hp_test)
        angles = compute_alignment_angles(final, hp=hp_test)
        toe_vals.append(angles.get("toe_deg", 0.0))

    # Objective: minimize toe variation (sum of squares)
    toe_arr = np.array(toe_vals)
    return float(np.sum(toe_arr ** 2)), toe_vals


@app.post("/api/optimize_fl1")
async def optimize_fl1(req: OptimizeFL1Request):
    """Find optimal FL1 (tie-rod inner point) position to minimize bump steer.
    Uses scipy minimize with bounded search around current FL1 position."""
    if not HAS_SCIPY:
        raise HTTPException(status_code=500, detail="scipy not available")

    # Select axle hardpoints
    if req.axle == "front":
        hp = dict(DEFAULT_HARDPOINTS)
    elif req.axle == "rear":
        hp = strip_prefix(dict(DEFAULT_REAR_HARDPOINTS), REAR_PREFIX)
    else:
        raise HTTPException(status_code=400, detail="axle must be 'front' or 'rear'")

    current_fl1 = np.array(hp["FL1"])
    travel_vals = np.linspace(req.travel_start, req.travel_end, req.travel_steps).tolist()

    # Search bounds: ±80mm around current FL1 in Y and Z (X stays fixed)
    y_margin = 80.0
    z_margin = 80.0
    bounds = [
        (current_fl1[0] - 5, current_fl1[0] + 5),   # X: nearly fixed
        (current_fl1[1] - y_margin, current_fl1[1] + y_margin),  # Y: ±40mm
        (current_fl1[2] - z_margin, current_fl1[2] + z_margin),  # Z: ±40mm
    ]

    # Also evaluate current position for comparison
    current_score, current_toe = _evaluate_bump_steer(hp, current_fl1, travel_vals)

    from scipy.optimize import minimize

    best_result = None
    best_score = float('inf')

    def objective(x):
        nonlocal best_result, best_score
        fl1 = np.array(x)
        score, _ = _evaluate_bump_steer(hp, fl1, travel_vals)
        if score < best_score:
            best_score = score
            best_result = fl1.copy()
        return score

    # Multi-start optimization: try from current position + grid of starting points
    starts = [current_fl1.tolist()]
    for dy in [-40, -20, 0, 20, 40]:
        for dz in [-40, -20, 0, 20, 40]:
            if dy == 0 and dz == 0:
                continue
            starts.append([current_fl1[0], current_fl1[1] + dy, current_fl1[2] + dz])

    for x0 in starts:
        try:
            result = minimize(objective, x0, method='L-BFGS-B', bounds=bounds,
                            options={'maxiter': 100, 'ftol': 1e-10})
        except Exception:
            continue

    if best_result is None:
        raise HTTPException(status_code=500, detail="Optimization failed")

    # Evaluate the optimized position
    opt_score, opt_toe = _evaluate_bump_steer(hp, best_result, travel_vals)

    # Compute improvement
    current_toe_range = max(current_toe) - min(current_toe)
    opt_toe_range = max(opt_toe) - min(opt_toe)

    return {
        "axle": req.axle,
        "current_fl1": current_fl1.tolist(),
        "optimized_fl1": best_result.tolist(),
        "delta_mm": (best_result - current_fl1).tolist(),
        "current_toe_range_deg": round(current_toe_range, 4),
        "optimized_toe_range_deg": round(opt_toe_range, 4),
        "improvement_pct": round((1 - opt_toe_range / max(current_toe_range, 1e-9)) * 100, 1),
        "current_toe_curve": [round(v, 4) for v in current_toe],
        "optimized_toe_curve": [round(v, 4) for v in opt_toe],
        "travel": [round(v, 1) for v in travel_vals],
    }


# ============================================================
# TUBE MATCHING HELPER
# ============================================================

def _find_tube_index(endpoints):
    """Find index of a tube by its endpoint list, or None if not found."""
    n = len(endpoints)
    for i, tube in enumerate(FRAME_TUBES):
        if len(tube) != n:
            continue
        if n == 2:
            if (tube[0] == endpoints[0] and tube[1] == endpoints[1]) or \
               (tube[0] == endpoints[1] and tube[1] == endpoints[0]):
                return i
        else:
            if all(tube[j] == endpoints[j] for j in range(n)):
                return i
    return None


# ============================================================
# SAVE/DELETE/EDIT ENDPOINTS — in-memory + optionally persistent
# ============================================================

@app.post("/api/save_point")
async def save_point(req: SavePointRequest):
    """Update a point's coordinates in-memory. If permanent=True, write back to main.py."""
    name = req.name
    coords = [float(req.coords[0]), float(req.coords[1]), float(req.coords[2])]

    updated = False
    target_dict = None

    if name in DEFAULT_HARDPOINTS:
        DEFAULT_HARDPOINTS[name] = coords
        target_dict = "DEFAULT_HARDPOINTS"
        updated = True
    elif name in DEFAULT_REAR_HARDPOINTS:
        DEFAULT_REAR_HARDPOINTS[name] = coords
        target_dict = "DEFAULT_REAR_HARDPOINTS"
        updated = True
    elif name in DEFAULT_FRAME_NODES:
        DEFAULT_FRAME_NODES[name] = coords
        target_dict = "DEFAULT_FRAME_NODES"
        updated = True

    if not updated:
        if name.endswith('_L'):
            base_name = name[:-2]
            if base_name in DEFAULT_HARDPOINTS:
                DEFAULT_HARDPOINTS[base_name] = [coords[0], -coords[1], coords[2]]
                target_dict = "DEFAULT_HARDPOINTS"
                updated = True
            elif base_name in DEFAULT_REAR_HARDPOINTS:
                DEFAULT_REAR_HARDPOINTS[base_name] = [coords[0], -coords[1], coords[2]]
                target_dict = "DEFAULT_REAR_HARDPOINTS"
                updated = True
            elif base_name in DEFAULT_FRAME_NODES:
                DEFAULT_FRAME_NODES[base_name] = [coords[0], -coords[1], coords[2]]
                target_dict = "DEFAULT_FRAME_NODES"
                updated = True

    if not updated:
        raise HTTPException(status_code=404, detail=f"Point '{name}' not found")

    permanent = False
    if req.permanent:
        if target_dict in ("DEFAULT_HARDPOINTS", "DEFAULT_REAR_HARDPOINTS"):
            from hardpoints import _load_overrides, _save_overrides
            overrides = _load_overrides()
            save_name = name
            save_coords = list(coords)
            if name.endswith('_L'):
                save_name = name[:-2]
                save_coords = [coords[0], -coords[1], coords[2]]
            overrides[save_name] = save_coords
            _save_overrides(overrides)
            permanent = True
        else:
            if name.endswith('_L'):
                base_name = name[:-2]
                base_exists = (base_name in DEFAULT_HARDPOINTS or
                               base_name in DEFAULT_REAR_HARDPOINTS or
                               base_name in DEFAULT_FRAME_NODES)
                if base_exists:
                    permanent = _update_source_file(base_name, [coords[0], -coords[1], coords[2]])
                else:
                    permanent = _update_source_file(name, coords)
            else:
                permanent = _update_source_file(name, coords)

    return {"ok": True, "name": name, "coords": coords, "dict": target_dict, "permanent": permanent}


@app.post("/api/delete_tube")
async def delete_tube(req: DeleteTubeRequest):
    """Remove a tube from FRAME_TUBES. If permanent, also remove from main.py."""
    tube_idx = _find_tube_index(req.endpoints)
    if tube_idx is None:
        raise HTTPException(status_code=404, detail=f"Tube {req.endpoints} not found")

    FRAME_TUBES.pop(tube_idx)

    permanent = False
    if req.permanent:
        permanent = _delete_tube_from_source(req.endpoints)

    return {
        "ok": True,
        "endpoints": req.endpoints,
        "permanent": permanent,
    }



# ============================================================
# TUBE COLOR + ADD TUBE
# ============================================================

@app.post("/api/save_tube_color")
async def save_tube_color(req: TubeColorRequest):
    tube_idx = _find_tube_index(req.endpoints)
    if tube_idx is None:
        raise HTTPException(status_code=404, detail=f"Tube {req.endpoints} not found")
    FRAME_TUBE_COLORS[tube_idx] = req.color
    permanent = _update_tube_color_in_source(req.endpoints, req.color) if req.permanent else False
    return {"ok": True, "tube_index": tube_idx, "color": req.color, "permanent": permanent}


@app.post("/api/add_tube")
async def add_tube(req: AddTubeRequest):
    pts = req.endpoints
    if len(pts) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 points")
    if _find_tube_index(pts) is not None:
        raise HTTPException(status_code=400, detail=f"Tube {pts} already exists")
    FRAME_TUBES.append(pts)
    new_idx = len(FRAME_TUBES) - 1
    if req.color != "#8899cc":
        FRAME_TUBE_COLORS[new_idx] = req.color
    permanent = _add_tube_to_source(req.endpoints, req.color) if req.permanent else False
    return {"ok": True, "tube_index": new_idx, "permanent": permanent}


# ============================================================
# BODYWORK FACE — add / update / delete
# ============================================================

@app.post("/api/add_face")
async def add_face(req: FaceRequest):
    """Add a bodywork face in-memory and optionally to source."""
    if req.name in BODYWORK_FACES:
        raise HTTPException(status_code=400, detail=f"Face '{req.name}' already exists")
    if len(req.loop) < 3:
        raise HTTPException(status_code=400, detail="Need at least 3 vertices")
    BODYWORK_FACES[req.name] = {"loops": [req.loop], "color": req.color, "opacity": req.opacity}
    permanent = _add_face_to_source(req.name, req.loop, req.color, req.opacity) if req.permanent else False
    return {"ok": True, "name": req.name, "permanent": permanent}


@app.post("/api/delete_face")
async def delete_face(req: DeleteFaceRequest):
    if req.name not in BODYWORK_FACES:
        raise HTTPException(status_code=404, detail=f"Face '{req.name}' not found")
    del BODYWORK_FACES[req.name]
    permanent = _delete_face_from_source(req.name) if req.permanent else False
    return {"ok": True, "name": req.name, "permanent": permanent}


@app.post("/api/update_face")
async def update_face(req: FaceRequest):
    is_new = req.name not in BODYWORK_FACES
    loop = req.loop or (BODYWORK_FACES[req.name]["loops"][0] if not is_new else ["_","_","_"])
    BODYWORK_FACES[req.name] = {"loops": [loop], "color": req.color, "opacity": req.opacity}
    permanent = False
    if req.permanent:
        if not is_new:
            _delete_face_from_source(req.name)
        permanent = _add_face_to_source(req.name, loop, req.color, req.opacity)
    return {"ok": True, "name": req.name, "permanent": permanent}


# ============================================================
# SAVE REAR WING
# ============================================================

@app.post("/api/save_rear_wing")
async def save_rear_wing(request: Request):
    """Persist REAR_WING config back to config.py and update in-memory."""
    config = await request.json()
    REAR_WING.clear()
    REAR_WING.update(config)
    permanent = _save_rear_wing_to_source(REAR_WING)
    return {"ok": True, "permanent": permanent}


# ============================================================
# SAVE FRONT WING
# ============================================================

@app.post("/api/save_front_wing")
async def save_front_wing(request: Request):
    """Persist FRONT_WING config back to config.py and update in-memory."""
    config = await request.json()
    FRONT_WING.clear()
    FRONT_WING.update(config)
    permanent = _save_front_wing_to_source(FRONT_WING)
    return {"ok": True, "permanent": permanent}


# ============================================================
# SAVE UNDERTRAY
# ============================================================

@app.post("/api/save_undertray")
async def save_undertray(request: Request):
    """Persist UNDERTRAY_CONFIG back to config.py and update in-memory."""
    config = await request.json()
    UNDERTRAY_CONFIG.clear()
    UNDERTRAY_CONFIG.update(config)
    permanent = _save_undertray_to_source(UNDERTRAY_CONFIG)
    return {"ok": True, "permanent": permanent}


# ============================================================
# SAVE DIFFUSER
# ============================================================

@app.post("/api/save_diffuser")
async def save_diffuser(request: Request):
    """Persist DIFFUSER_CONFIG back to config.py and update in-memory."""
    config = await request.json()
    DIFFUSER_CONFIG.clear()
    DIFFUSER_CONFIG.update(config)
    permanent = _save_diffuser_to_source(DIFFUSER_CONFIG)
    return {"ok": True, "permanent": permanent}


# ============================================================
# UPDATE PARAMS
# ============================================================

@app.post("/api/update_params")
async def update_params(req: UpdateParamsRequest):
    """Update a design parameter and re-derive all hardpoints."""
    if req.axle not in DESIGN_PARAMS:
        raise HTTPException(status_code=400, detail=f"Unknown axle: {req.axle}")
    if req.key not in DESIGN_PARAMS[req.axle]:
        raise HTTPException(status_code=400, detail=f"Unknown param: {req.key}")

    DESIGN_PARAMS[req.axle][req.key] = float(req.value)

    # Re-derive hardpoints
    if req.axle == "front":
        new_hp = derive_hardpoints(DESIGN_PARAMS["front"])
        for k, v in new_hp.items():
            DEFAULT_HARDPOINTS[k] = v
    else:
        new_hp = derive_hardpoints(DESIGN_PARAMS["rear"], prefix="R_")
        for k, v in new_hp.items():
            DEFAULT_REAR_HARDPOINTS[k] = v

    return {
        "ok": True,
        "axle": req.axle,
        "key": req.key,
        "value": req.value,
        "hardpoints": new_hp,
    }


# ============================================================
# STATIC FILES
# ============================================================

web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")

# Mount static files — html=True serves index.html for directory requests
app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
