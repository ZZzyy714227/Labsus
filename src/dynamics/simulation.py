"""Simulation orchestrator: path + terrain + vehicle → trajectory frames."""
import numpy as np
from dynamics.path import Path
from dynamics.terrain import Terrain
from dynamics.vehicle import Vehicle
from dynamics.integrator import rk4_step


def _build_frame(t, bx, by, state, comps):
    """Build one output frame: body pose + wheel states.

    In V1, hardpoints and angles are not computed — that's Task 8.
    """
    z, zd, roll, rd, pitch, pd = state

    return {
        "time": round(t, 4),
        "body": {
            "x": round(bx, 1),
            "y": round(by, 1),
            "z": round(float(z), 1),
            "roll": round(float(roll), 6),
            "pitch": round(float(pitch), 6),
            "yaw": 0.0,
        },
        "wheels": [
            {"compression": round(float(comps[0]), 2)},
            {"compression": round(float(comps[1]), 2)},
            {"compression": round(float(comps[2]), 2)},
            {"compression": round(float(comps[3]), 2)},
        ],
        "angles": {"camber": [0, 0, 0, 0], "toe": [0, 0, 0, 0]},
        "hardpoints": {},
    }


def run_simulation(path_pts, obstacles, speed, duration, params=None):
    """Run full dynamics simulation.

    Args:
        path_pts: list of [x, y] control points in world coordinates (mm)
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

    dt_dyn = 0.001      # 1 ms dynamics step
    dt_out = 1.0 / 60.0  # ~16.67 ms output interval

    total_dist = path.total_length
    max_time = min(duration, total_dist / speed) if speed > 0 else duration
    n_steps = int(max_time / dt_dyn)
    output_every = max(1, int(dt_out / dt_dyn))  # ~16-17

    # Initial state: static equilibrium on flat ground
    state = np.array([vehicle.static_z(), 0.0, 0.0, 0.0, 0.0, 0.0])
    frames = []

    for step in range(n_steps):
        t = step * dt_dyn
        s = t * speed
        if s > total_dist:
            break

        bx, by, yaw = path.sample(s)

        # Derivative function closure for RK4
        def deriv(st):
            return vehicle.compute_derivatives(st, (bx, by, yaw), terrain)

        state = rk4_step(deriv, state, dt_dyn)

        if step % output_every == 0:
            # Compute compression for display (not used in dynamics,
            # just for the output frame)
            _, _, _, _, _, _ = state
            z, zd, roll, rd, pitch, pd = state
            # Approximate compressions from current state
            offs = vehicle._offsets()
            comps = []
            for i, (dx, dy, dz) in enumerate(offs):
                cy, sy = np.cos(yaw), np.sin(yaw)
                cp, cr = np.cos(pitch), np.cos(roll)
                sp, sr = np.sin(pitch), np.sin(roll)
                wx = bx + dx * cy - dy * sy
                wy = by + dx * sy + dy * cy
                wz = z + dz * cp * cr + dx * sp - dy * sr
                gz = terrain.height(wx, wy)
                comp = vehicle.tire_r - wz + gz
                if comp < 0:
                    comp = 0.0
                comps.append(comp)

            frame = _build_frame(t, bx, by, state, comps)
            frames.append(frame)

    # Ensure last frame captured
    if frames and frames[-1]["time"] < max_time - 0.001:
        s = max_time * speed
        bx, by, yaw = path.sample(min(s, total_dist))
        frames.append(_build_frame(max_time, bx, by, state, np.zeros(4)))

    return {
        "dt": round(dt_out, 6),
        "total_time": round(max_time, 4),
        "frames": frames,
    }
