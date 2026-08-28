"""
Alignment angle computation from solver results.

Computes camber, toe, caster, KPI, scrub radius, and caster trail
from upright positions, in the V1 frozen sign conventions (P2-0):

    Camber:  negative = top of wheel inward (both sides)
    Toe:     positive = toe-in (front of wheel toward centreline, both sides)
    KPI/SAI: positive = kingpin axis top inboard (both sides)
    Caster:  positive = kingpin axis top rearward (classic, both sides)
    Scrub:   positive = contact patch outboard of kingpin ground (both sides)
    Trail:   positive = kingpin ground ahead of contact patch (classic, both sides)

The side (left/right) is auto-detected from the wheel centre Y coordinate
(UP5[1] > 0 => right, side=+1; UP5[1] < 0 => left, side=-1).  Output is
vehicle-global: the same formulas are convention-correct for BOTH sides,
so no post-processing sign flips (fix_left_angles) are required.
"""
import math

import numpy as np

from geometry import vec3
from tire import compute_contact_patch


def _side_sign_from_up5(up5_y):
    """+1 for a right-side wheel, -1 for a left-side wheel (UP5[1] sign)."""
    return 1.0 if up5_y >= 0.0 else -1.0


def compute_alignment_angles(result_dict, chassis_points=None, hp=None):
    """
    Compute alignment angles from solver result.
    result_dict contains UP1-UP5, FL1 (from solver output).
    hp optionally contains tire parameters for contact-patch-aware scrub/trail.
    """
    UP1 = np.array(result_dict["UP1"])
    UP2 = np.array(result_dict["UP2"])
    UP5 = np.array(result_dict["UP5"])
    side = _side_sign_from_up5(float(UP5[1]))

    # Kingpin axis: UP1 (upper) -> UP2 (lower)
    kp_vec = UP2 - UP1
    kp_len = float(np.linalg.norm(kp_vec))
    if kp_len < 1e-12:
        return {"camber_deg": 0, "kpi_deg": 0, "caster_deg": 0,
                "toe_deg": 0, "scrub_radius_mm": 0, "caster_trail_mm": 0}
    kp_dir = kp_vec / kp_len

    # ---- Upright local frame ----
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

    # ---- KPI ----
    # Positive = axis top inboard.  The raw atan2 is right-wheel oriented
    # (upper inboard of lower => kp_vec[1] > 0); multiply by side so the
    # left wheel reports the same sign.
    kpi_rad = side * math.atan2(kp_vec[1], -kp_vec[2])
    kpi_deg = math.degrees(kpi_rad)

    # ---- Camber ----
    if upright_frame_valid:
        camber_rad = -math.atan2(float(y_axis_u[2]),
                                 float(math.hypot(y_axis_u[0], y_axis_u[1])))
        camber_deg = math.degrees(camber_rad)
    else:
        camber_deg = 0.0

    # ---- Caster ----
    # Positive = axis top rearward (classic).  X does not flip under Y
    # mirroring, so one formula serves both sides.
    caster_rad = math.atan2(kp_vec[0], -kp_vec[2])
    caster_deg = math.degrees(caster_rad)

    # ---- Toe ----
    # Wheel-plane horizontal trace, oriented toward +X (vehicle forward).
    # x_axis_u is perpendicular to the kingpin and to UP1->UP5 (wheel
    # centre bearing); its X component flips under Y mirroring, so the
    # forward-pointing orientation is restored here.  Positive = toe-in
    # (front of the wheel toward the vehicle centreline), which is the
    # opposite lateral direction for the two wheels — hence the side
    # factor makes toe-in positive on both sides.
    if upright_frame_valid:
        fwd = np.array([x_axis_u[0], x_axis_u[1]])
        fwd_n = float(np.linalg.norm(fwd))
        if fwd_n > 1e-9:
            fwd = fwd / fwd_n
            if fwd[0] < 0.0:
                fwd = -fwd
            toe_rad = -side * math.atan2(fwd[1], fwd[0])
        else:
            toe_rad = 0.0
        toe_deg = math.degrees(toe_rad)
    else:
        toe_deg = 0.0

    # ---- Scrub Radius ----
    cp = None
    if hp and hp.get("tire_spring_rate") is not None and upright_frame_valid:
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
        # Positive scrub = contact patch outboard of the kingpin ground
        # point.  The raw difference is right-wheel oriented; multiply by
        # side so the left wheel reports the same (positive) sign.
        scrub = side * (contact_y - kp_ground_y)
        # Positive trail = kingpin ground ahead of the contact patch
        # (classic).  X does not flip under Y mirroring: one formula.
        trail = kp_ground_x - contact_x
    else:
        scrub = 0.0
        trail = 0.0

    # ---- Solver health ----
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
