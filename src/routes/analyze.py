"""POST /api/analyze — full-dimension metrics + target-band lights.
Plus vehicle/targets persistence endpoints."""
import numpy as np
from fastapi import APIRouter

from api_models import AnalyzeRequest, TargetsRequest, VehicleRequest
from config import REAR_PREFIX, VEHICLE_PARAMS
from hardpoints import strip_prefix
from metrics.dynamics import (damping_ratio, load_transfer_n, ride_frequency_hz,
                              roll_stiffness_split_pct, sprung_mass_per_corner)
from metrics.loads import max_abs, solve_link_forces, tire_force
from metrics.roll import (compute_anti_dive, compute_anti_squat,
                          compute_roll_center, compute_roll_gradient,
                          compute_roll_stiffness_suspension)
from metrics.targets import TARGET_BANDS, TARGET_BANDS_OVERRIDES, evaluate_all, set_band
from persistence import _with_state
from routes.solve import _solve_axle

router = APIRouter()


def _quick_sweep(hp, start, end, steps, rack=0.0):
    """Fast kinematic sweep (no polish) → range metrics + curves."""
    travel = np.linspace(start, end, steps)
    angles = []
    for t in travel:
        axle = _solve_axle(dict(hp), float(t), rack, mirror=False,
                           polish=False, skip_steering=False)
        angles.append(axle["angles_right"])

    def rng(key):
        vals = [a.get(key, 0.0) for a in angles]
        return max(vals) - min(vals)

    return {
        "camber_delta": rng("camber_deg"),
        "toe_delta": rng("toe_deg"),
        "caster_delta": rng("caster_deg"),
        "kpi_delta": rng("kpi_deg"),
        "scrub_delta": rng("scrub_radius_mm"),
        "curves": {
            "travel": [round(float(t), 1) for t in travel],
            "camber_deg": [round(a.get("camber_deg", 0.0), 3) for a in angles],
            "toe_deg": [round(a.get("toe_deg", 0.0), 3) for a in angles],
            "caster_deg": [round(a.get("caster_deg", 0.0), 3) for a in angles],
            "kpi_deg": [round(a.get("kpi_deg", 0.0), 3) for a in angles],
        },
    }


@router.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    veh = dict(VEHICLE_PARAMS)
    if req.vehicle:
        veh.update(req.vehicle)

    f_hp = dict(req.front_hardpoints)
    r_hp = strip_prefix(dict(req.rear_hardpoints), REAR_PREFIX)

    f_sw = _quick_sweep(f_hp, req.travel_start, req.travel_end, req.travel_steps)
    r_sw = _quick_sweep(r_hp, req.travel_start, req.travel_end, req.travel_steps)

    # Static design position (dz=0) for attitude geometry
    f_design = _solve_axle(dict(f_hp), 0.0, 0.0, mirror=False, polish=False)
    r_design = _solve_axle(dict(r_hp), 0.0, 0.0, mirror=False, polish=False)

    # --- kinematics ---
    metrics = {
        "camber_delta_f": f_sw["camber_delta"],
        "camber_delta_r": r_sw["camber_delta"],
        "bump_steer_f": f_sw["toe_delta"],
        "bump_steer_r": r_sw["toe_delta"],
        "caster_delta_f": f_sw["caster_delta"],
        "caster_delta_r": r_sw["caster_delta"],
        "kpi_delta_f": f_sw["kpi_delta"],
        "kpi_delta_r": r_sw["kpi_delta"],
        "scrub_delta_f": f_sw["scrub_delta"],
        "scrub_delta_r": r_sw["scrub_delta"],
    }

    # --- attitude (front axle RC; motion ratio defaults until P3) ---
    rc = compute_roll_center(f_hp, f_design["right"])
    rc_z = rc["z"] if rc else veh["cg_height_mm"] * 0.5
    mr_f = 0.7
    mr_r = 0.6

    k_f = compute_roll_stiffness_suspension(veh["k_spring_f"], mr_f, veh["front_track_mm"])
    k_r = compute_roll_stiffness_suspension(veh["k_spring_r"], mr_r, veh["rear_track_mm"])
    k_arb_f = veh.get("k_arb_f", 0.0)
    k_arb_r = veh.get("k_arb_r", 0.0)
    roll_deg_g = compute_roll_gradient(veh, k_f + k_arb_f, k_r + k_arb_r, rc_z)

    metrics.update({
        "roll_gradient": roll_deg_g,
        "rc_height": rc_z,
        "rc_height_delta": None,          # requires RC-vs-travel curve (P3)
        "anti_dive": compute_anti_dive(f_hp, f_design["right"],
                                       veh["wheelbase_mm"], veh["cg_height_mm"],
                                       veh["ax_brake"]),
        "anti_squat": compute_anti_squat(r_hp, r_design["right"],
                                         veh["wheelbase_mm"], veh["cg_height_mm"],
                                         veh["ax_accel"]),
        "jacking": None,
    })

    # --- dynamics ---
    m_f = sprung_mass_per_corner(veh["mass_kg"], veh["front_axle_frac"], veh["unsprung_kg"])
    m_r = sprung_mass_per_corner(veh["mass_kg"], veh["rear_axle_frac"], veh["unsprung_kg"])
    freq_f = ride_frequency_hz(veh["k_spring_f"], mr_f, m_f)
    freq_r = ride_frequency_hz(veh["k_spring_r"], mr_r, m_r)
    metrics.update({
        "ride_freq_f": freq_f,
        "ride_freq_r": freq_r,
        "freq_ratio": freq_r / freq_f if freq_f > 0 else None,
        "damping_ratio_f": damping_ratio(veh["k_spring_f"], mr_f, m_f, veh["c_damper_f"]),
        "damping_ratio_r": damping_ratio(veh["k_spring_r"], mr_r, m_r, veh["c_damper_r"]),
        "motion_ratio_f": mr_f,
        "motion_ratio_r": mr_r,
        "load_transfer_f": roll_stiffness_split_pct(k_f + k_arb_f, k_r + k_arb_r),
    })

    # --- structural (1.3g cornering, outside wheel) ---
    dF = load_transfer_n(veh["mass_kg"], veh["ay_corner"], veh["cg_height_mm"],
                         (veh["front_track_mm"] + veh["rear_track_mm"]) / 2.0)
    f_static_f = veh["mass_kg"] * 9.81 * veh["front_axle_frac"] / 2.0
    roll_f_frac = roll_stiffness_split_pct(k_f + k_arb_f, k_r + k_arb_r) / 100.0
    f_outside_f = f_static_f + dF * roll_f_frac
    forces_f = solve_link_forces(f_hp, f_design["right"],
                                 tire_force(f_outside_f, 0.0, veh["ay_corner"]))
    metrics.update({
        "pushrod_force": max_abs(forces_f),
        "uca_lca_force": max_abs(forces_f),
        "tie_rod_force": None,
    })

    lights = evaluate_all(metrics)
    return {
        "metrics": {k: (None if v is None else round(float(v), 3))
                    for k, v in metrics.items()},
        "lights": lights,
        "curves": {"front": f_sw["curves"], "rear": r_sw["curves"]},
        "vehicle": veh,
    }


@router.get("/api/vehicle")
async def get_vehicle():
    return {"params": dict(VEHICLE_PARAMS)}


@router.post("/api/vehicle")
async def save_vehicle(req: VehicleRequest):
    def mutator(state):
        state["vehicle_params"] = {k: float(v) for k, v in req.params.items()}
    _with_state(mutator)
    VEHICLE_PARAMS.update(req.params)
    return {"ok": True}


@router.post("/api/targets")
async def save_targets(req: TargetsRequest):
    def mutator(state):
        state["target_bands"] = {k: [float(x) for x in b] for k, b in req.bands.items()}
    _with_state(mutator)
    for k, b in req.bands.items():
        set_band(k, tuple(b))
    return {"ok": True}


@router.get("/api/targets")
async def get_targets():
    merged = dict(TARGET_BANDS)
    merged.update(TARGET_BANDS_OVERRIDES)
    return {"bands": merged}
