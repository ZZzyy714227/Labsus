"""Simulation orchestrator: path + terrain + vehicle → trajectory frames."""
import math
import numpy as np

from config import REAR_PREFIX
from dynamics.path import Path
from dynamics.terrain import Terrain
from dynamics.vehicle import Vehicle, FL, FR, RL, RR
from dynamics.integrator import rk4_step
from hardpoints import (
    DEFAULT_HARDPOINTS,
    DEFAULT_REAR_HARDPOINTS,
    add_prefix,
    mirror_left,
    strip_prefix,
)
from solver.angles import compute_alignment_angles, fix_left_angles
from solver.bump import solve_bump

# Wheel order to solver mapping: (axle, side, is_left)
_WHEEL_MAP = [
    ("front", "FL", True),   # FL
    ("front", "FR", False),  # FR
    ("rear",  "RL", True),   # RL
    ("rear",  "RR", False),  # RR
]


def _solve_corner(hp_base, dz):
    """Run solve_bump on one corner. Returns (solver_result, angles)."""
    result = solve_bump(dict(hp_base), float(dz), polish=False)
    angles = compute_alignment_angles(result, hp=hp_base)
    return result, angles


def _build_frame(t, bx, by, yaw, state, vehicle, terrain):
    """Build one output frame with full hardpoints from kinematic solver."""
    z, zd, roll, rd, pitch, pd = state
    offs = vehicle._offsets()
    static_comp = vehicle.static_compression()

    # Compute wheel travels from body state vs. terrain
    travels = []
    comps = []
    for dx, dy, dz_body in offs:
        cy, sy = math.cos(yaw), math.sin(yaw)
        cp, cr = math.cos(pitch), math.cos(roll)
        sp, sr = math.sin(pitch), math.sin(roll)
        wx = bx + dx * cy - dy * sy
        wy = by + dx * sy + dy * cy
        wz = z + dz_body * cp * cr + dx * sp - dy * sr
        gz = terrain.height(wx, wy)
        comp = vehicle.tire_r - wz + gz
        if comp < 0:
            comp = 0.0
        comps.append(comp)
        travels.append(comp - static_comp)

    # Start with chassis points from design hardpoints
    all_hardpoints = {}
    for k, v in DEFAULT_HARDPOINTS.items():
        if k in {"CH1", "CH2", "CH3", "CH4", "CH5"}:
            all_hardpoints[k] = list(v)
    rear_base = strip_prefix(dict(DEFAULT_REAR_HARDPOINTS), REAR_PREFIX)
    for k, v in rear_base.items():
        if k in {"CH1", "CH2", "CH3", "CH4", "CH5"}:
            all_hardpoints["R_" + k] = list(v)

    cambers = [0.0, 0.0, 0.0, 0.0]
    toes = [0.0, 0.0, 0.0, 0.0]

    # Solve each corner; compute right-side angles first so left-side
    # mirror correction has the correct reference.
    # Order: FR(1), FL(0), RR(3), RL(2)
    solve_order = [(1, False), (0, True), (3, False), (2, True)]

    right_angles = {}  # axle -> angles dict (for left-side mirror fix)

    for idx, is_left in solve_order:
        axle, side, _ = _WHEEL_MAP[idx]
        dz = travels[idx]
        key_prefix = "R_" if axle == "rear" else ""

        if axle == "front":
            hp_base = dict(DEFAULT_HARDPOINTS)
        else:
            hp_base = strip_prefix(dict(DEFAULT_REAR_HARDPOINTS), REAR_PREFIX)

        hp = mirror_left(hp_base) if is_left else dict(hp_base)
        result = solve_bump(hp, float(dz), polish=False)
        angles = compute_alignment_angles(result, hp=hp)

        if is_left:
            ref = right_angles.get(axle, angles)
            angles = fix_left_angles(angles, ref)
            # Mirror result coords back
            for k, v in list(result.items()):
                if isinstance(v, list) and len(v) == 3:
                    result[k] = [v[0], -v[1], v[2]]
        else:
            right_angles[axle] = angles

        # Store hardpoints with correct prefix
        for k, v in result.items():
            if isinstance(v, (list, float, int)):
                all_hardpoints[key_prefix + k] = v

        cambers[idx] = round(angles.get("camber_deg", 0), 3)
        toes[idx] = round(angles.get("toe_deg", 0), 3)

    return {
        "time": round(t, 4),
        "body": {
            "x": round(bx, 1), "y": round(by, 1), "z": round(float(z), 1),
            "roll": round(float(roll), 6), "pitch": round(float(pitch), 6),
            "yaw": round(float(yaw), 4),
        },
        "wheels": [
            {"compression": round(float(comps[0]), 2)},
            {"compression": round(float(comps[1]), 2)},
            {"compression": round(float(comps[2]), 2)},
            {"compression": round(float(comps[3]), 2)},
        ],
        "angles": {"camber": cambers, "toe": toes},
        "hardpoints": all_hardpoints,
    }


def run_simulation(path_pts, obstacles, speed, duration, params=None):
    """Run full dynamics simulation.

    Args:
        path_pts: list of [x, y] control points (mm)
        obstacles: list of obstacle dicts
        speed: constant forward speed (mm/s)
        duration: max simulation time (s)
        params: optional vehicle parameter overrides

    Returns:
        dict with keys: dt, total_time, frames[]
    """
    path = Path(path_pts)
    terrain = Terrain(obstacles)
    vehicle = Vehicle(params)

    dt_dyn = 0.001
    dt_out = 1.0 / 60.0

    total_dist = path.total_length
    max_time = min(duration, total_dist / speed) if speed > 0 else duration
    n_steps = int(max_time / dt_dyn)
    output_every = max(1, int(dt_out / dt_dyn))

    state = np.array([vehicle.static_z(), 0.0, 0.0, 0.0, 0.0, 0.0])
    frames = []

    for step in range(n_steps):
        t = step * dt_dyn
        s = t * speed
        if s > total_dist:
            break

        bx, by, yaw = path.sample(s)

        def deriv(st):
            return vehicle.compute_derivatives(st, (bx, by, yaw), terrain)

        state = rk4_step(deriv, state, dt_dyn)

        if step % output_every == 0:
            frame = _build_frame(t, bx, by, yaw, state, vehicle, terrain)
            frames.append(frame)

    if frames and frames[-1]["time"] < max_time - 0.001:
        s = min(max_time * speed, total_dist)
        bx, by, yaw = path.sample(s)
        frames.append(
            _build_frame(max_time, bx, by, yaw, state, vehicle, terrain)
        )

    return {
        "dt": round(dt_out, 6),
        "total_time": round(max_time, 4),
        "frames": frames,
    }
