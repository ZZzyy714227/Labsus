"""Roll center, roll gradient, anti-dive/squat, jacking metrics."""
from __future__ import annotations

import math

import numpy as np


def _line_intersect_2d(p1, p2, p3, p4):
    """Intersection of 2D lines p1-p2 and p3-p4 (Y-Z plane)."""
    d1 = np.array(p2[1:3], dtype=float) - np.array(p1[1:3], dtype=float)
    d2 = np.array(p4[1:3], dtype=float) - np.array(p3[1:3], dtype=float)
    denom = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(denom) < 1e-9:
        return None                       # parallel
    t = np.array(p3[1:3], dtype=float) - np.array(p1[1:3], dtype=float)
    s = (t[0] * d2[1] - t[1] * d2[0]) / denom
    return np.array([p1[1] + s * d1[0], p1[2] + s * d1[1]])


def compute_instant_center(hp, result):
    """IC from UCA (CH1-UP1) and LCA (CH3-UP2) in the YZ plane.
    `result` is a solve response with UP1/UP2 (may be design or bumped)."""
    ch1 = np.asarray(hp["CH1"], dtype=float)
    ch3 = np.asarray(hp["CH3"], dtype=float)
    up1 = np.asarray(result["UP1"], dtype=float)
    up2 = np.asarray(result["UP2"], dtype=float)
    return _line_intersect_2d(ch1, up1, ch3, up2)


def compute_roll_center(hp, result):
    """RC ≈ IC (left-right symmetric). Returns {'y','z'} or None if parallel."""
    ic = compute_instant_center(hp, result)
    if ic is None:
        return None
    return {"y": float(ic[0]), "z": float(ic[1])}


def compute_roll_gradient(vehicle, roll_stiffness_f, roll_stiffness_r, rc_z):
    """deg/g. vehicle: {mass_kg, cg_height_mm}; stiffness in N·mm/rad."""
    m = vehicle["mass_kg"]
    h = vehicle["cg_height_mm"] - rc_z          # mm
    total = roll_stiffness_f + roll_stiffness_r
    if total <= 0:
        return float("inf")
    phi_rad_per_g = (m * 9.81 * h) / total       # rad per g (a_y=g)
    return math.degrees(phi_rad_per_g)


def compute_roll_stiffness_suspension(k_spring_n_mm, mr, track_mm):
    """Wheel-rate contribution: 0.5 * k_wheel * t^2 [N·mm/rad]."""
    k_wheel = k_spring_n_mm * mr * mr
    return 0.5 * k_wheel * track_mm * track_mm


def _anti_pct(hp, result, wheelbase_mm, cg_height_mm, ax_g):
    """% = 100 * tan(theta) * L * a_x / h_cg; theta = IC-contact-patch line
    vs horizontal. Returns 0.0 when IC is missing or degenerate."""
    ic = compute_instant_center(hp, result)
    if ic is None:
        return 0.0
    cp_y = float(result["UP5"][1])
    theta = math.atan2(float(ic[1]), abs(float(ic[0]) - cp_y))
    return 100.0 * math.tan(theta) * wheelbase_mm * ax_g / cg_height_mm


def compute_anti_dive(hp, result, wheelbase_mm, cg_height_mm, ax_g=1.2):
    """Front anti-dive % (braking geometry)."""
    return _anti_pct(hp, result, wheelbase_mm, cg_height_mm, ax_g)


def compute_anti_squat(hp, result, wheelbase_mm, cg_height_mm, ax_g=1.0):
    """Rear anti-squat % (acceleration geometry)."""
    return _anti_pct(hp, result, wheelbase_mm, cg_height_mm, ax_g)


def compute_jacking(roll_deg, ic_height_ratio=0.5):
    """Approx jacking rise of the inside wheel [mm]."""
    return abs(roll_deg) * ic_height_ratio
