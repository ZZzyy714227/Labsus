"""
Hardpoint derivation + overrides + mirroring utilities.
"""

import json
import math
import os

import numpy as np

from config import CHASSIS_KEYS, DESIGN_PARAMS, FLOAT_KEYS, UPRIGHT_KEYS
from geometry import normalize_or_default, rad as _rad


def derive_hardpoints(axle_params, prefix=""):
    """
    Derive all hardpoint coordinates from design parameters.
    Returns a dict suitable for DEFAULT_HARDPOINTS or DEFAULT_REAR_HARDPOINTS.
    """
    p = axle_params
    track_half = p["track"] / 2.0

    # ---- Wheel center ----
    UP5 = np.array([p["wheel_center_x"], track_half, p["wheel_center_z"]])

    # ---- Kingpin axis direction from caster/KPI only (camber is output) ----
    ca, kp = _rad(p["caster"]), _rad(p["kpi"])
    kp_len = p["kingpin_length"]

    # Kingpin direction: tilt backward (caster around Y), outward at bottom (KPI around X)
    # UP1→UP2 vector with +X forward: top rearward (classic positive caster) means
    # the axis points forward going down => +sin(caster); outboard tilt = sin(KPI);
    # downward = -cos(caster)*cos(KPI).  (P2-0: sign of the X component corrected so
    # caster: 5.0 deg produces classic positive caster instead of anti-caster.)
    z_local = np.array([math.sin(ca), math.sin(kp), -math.cos(ca) * math.cos(kp)])
    z_local = z_local / np.linalg.norm(z_local)

    # Wheel center Y offset from kingpin axis. Positive = wheel center outboard of kingpin
    # This controls camber (larger offset = more negative camber)

    # Upright local X ≈ fore-aft (perpendicular to Z and UP1→UP5)
    # We'll compute after placing UP1/UP2

    # Place UP1 and UP2 on kingpin axis
    # Kingpin passes through a point offset inboard from wheel center by wheel_offset_y
    # This offset determines camber: larger offset = kingpin more inboard = more negative camber
    offset_y = p.get("wheel_offset_y", 22.0)
    kp_origin = np.array([UP5[0], UP5[1] - offset_y, UP5[2]])
    split_lo = 0.85  # lower portion of kingpin below wheel center
    UP1 = kp_origin + z_local * (-kp_len * (1 - split_lo))   # above
    UP2 = kp_origin + z_local * (kp_len * split_lo)           # below

    # ---- UCA chassis points (CH1, CH2) — fixed to frame ----
    CH1 = np.array([p["uca_front_x"], p["uca_front_y"], p["uca_front_z"]])
    CH2 = np.array([p["uca_rear_x"],  p["uca_rear_y"],  p["uca_rear_z"]])

    # ---- LCA chassis points (CH3, CH4) — fixed to frame ----
    CH3 = np.array([p["lca_front_x"], p["lca_front_y"], p["lca_front_z"]])
    CH4 = np.array([p["lca_rear_x"],  p["lca_rear_y"],  p["lca_rear_z"]])

    # ---- Tie rod inner (FL1) ----
    FL1 = np.array([p["tierod_inner_x"], p["tierod_inner_y"], p["tierod_inner_z"]])

    # ---- Push-rod rocker mount (CH5) ----
    CH5 = np.array([p["pushrod_ch5_x"], p["pushrod_ch5_y"], p["pushrod_ch5_z"]])

    # ---- PRO 拓扑：推/拉杆外端 STRUT_OUT ----
    # 前轴（推杆）：LCA 三角面内，LBJ(UP2) 与 LCA 铰轴中点之间取比例点；
    # 后轴（拉杆）：UCA 三角面内，UBJ(UP1) 与 UCA 铰轴中点之间取比例点。
    lca_mid = 0.5 * (CH3 + CH4)
    uca_mid = 0.5 * (CH1 + CH2)
    t_lca = p.get("strut_out_t_lca", 0.35)
    t_uca = p.get("strut_out_t_uca", 0.35)
    STRUT_OUT = lca_mid + (UP2 - lca_mid) * t_lca if prefix == "" else \
                uca_mid + (UP1 - uca_mid) * t_uca

    # ---- Upright points UP3, UP4 in upright local frame ----
    # Build upright local frame matching the solver's convention:
    #   z = kingpin (UP1→UP2), x = cross(UP5→UP1, z), y = cross(z, x)
    z_axis = normalize_or_default(UP2 - UP1, [0.0, 0.0, -1.0])
    x_axis = normalize_or_default(np.cross(UP5 - UP1, z_axis))
    y_axis = np.cross(z_axis, x_axis)

    # UP3: tie-rod attachment (mid kingpin, offset forward)
    # UP4: push/pull-rod attachment (ratio configurable per axle)
    #    ratio=0.65 (front push-rod): lower upright → rod goes UP to high chassis
    #    ratio=0.20 (rear pull-rod):  upper upright → rod goes DOWN to low chassis
    # Offsets scale with kingpin length (true-scale: kp 150mm → arm ~87mm forward).
    pushrod_ratio = p.get("pushrod_upright_ratio", 0.65)
    UP3 = UP1 + x_axis * (kp_len * 0.578) + y_axis * (kp_len * -0.213) + z_axis * (kp_len * 0.50)
    UP4 = UP1 + x_axis * (kp_len * -0.045) + y_axis * (kp_len * -0.046) + z_axis * (kp_len * pushrod_ratio)

    result = {
        str(prefix + "CH1"): CH1.tolist(),
        str(prefix + "CH2"): CH2.tolist(),
        str(prefix + "CH3"): CH3.tolist(),
        str(prefix + "CH4"): CH4.tolist(),
        str(prefix + "CH5"): CH5.tolist(),
        str(prefix + "STRUT_OUT"): STRUT_OUT.tolist(),
        str(prefix + "UP1"): UP1.tolist(),
        str(prefix + "UP2"): UP2.tolist(),
        str(prefix + "UP3"): UP3.tolist(),
        str(prefix + "UP4"): UP4.tolist(),
        str(prefix + "UP5"): UP5.tolist(),
        str(prefix + "FL1"): FL1.tolist(),
        "track_width": p["track"],
        "tire_radius": p["tire_radius"],
        "tire_width": p.get("tire_width", 180.0),
        "tire_spring_rate": p.get("tire_spring_rate", 150.0),
        "corner_weight_n": p.get("corner_weight_n", 350.0),
    }
    return result


# Derive defaults from design params at module load
DEFAULT_HARDPOINTS = derive_hardpoints(DESIGN_PARAMS["front"])
DEFAULT_REAR_HARDPOINTS = derive_hardpoints(DESIGN_PARAMS["rear"], prefix="R_")

# ---- Persistent hardpoint overrides (JSON file, survives restarts) ----
HP_OVERRIDES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "..", "data", "hardpoint_overrides.json")

def _load_overrides():
    """Load user-saved hardpoint overrides from JSON."""
    if os.path.exists(HP_OVERRIDES_FILE):
        try:
            with open(HP_OVERRIDES_FILE, encoding='utf-8') as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            pass
    return {}

def _save_overrides(overrides):
    """Write hardpoint overrides to JSON."""
    with open(HP_OVERRIDES_FILE, 'w', encoding='utf-8') as f:
        json.dump(overrides, f, indent=2, ensure_ascii=False)

# Apply persisted overrides on startup
_hp_overrides = _load_overrides()
for _name, _coords in _hp_overrides.items():
    if _name in DEFAULT_HARDPOINTS:
        DEFAULT_HARDPOINTS[_name] = _coords
    elif _name in DEFAULT_REAR_HARDPOINTS:
        DEFAULT_REAR_HARDPOINTS[_name] = _coords


# ============================================================

def mirror_left(hp_right):
    """Mirror right-side points to left side (negate Y)."""
    hp_left = {}
    for key, val in hp_right.items():
        if isinstance(val, list) and len(val) == 3:
            hp_left[key] = [val[0], -val[1], val[2]]
        else:
            hp_left[key] = val
    return hp_left


def strip_prefix(hp, prefix):
    """Remove prefix from all keys in hardpoints dict.
    e.g. {'R_CH1': [...], 'R_UP1': [...]} → {'CH1': [...], 'UP1': [...]}
    Non-prefixed keys (globals) are passed through unchanged.
    """
    result = {}
    for key, val in hp.items():
        if key.startswith(prefix):
            result[key[len(prefix):]] = val
        else:
            result[key] = val
    return result


def add_prefix(result, prefix):
    """Add prefix to all point keys in a solver result dict.
    e.g. {'CH1': [...], 'UP1': [...]} → {'R_CH1': [...], 'R_UP1': [...]}
    Scalar values (push_rod_length, iterations, etc.) and globals are passed through.
    """
    prefixed = {}
    for key, val in result.items():
        if key in CHASSIS_KEYS or key in UPRIGHT_KEYS or key in FLOAT_KEYS:
            prefixed[prefix + key] = val
        else:
            prefixed[key] = val
    return prefixed


