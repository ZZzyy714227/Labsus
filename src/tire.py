"""
Tire model — contact patch computation for FSAE suspension analysis.
"""

import math

import numpy as np

from geometry import vec3


def _upright_y_axis(result_dict):
    """Extract upright Y axis (wheel spin axis) from solver result."""
    UP1 = np.array(result_dict["UP1"], dtype=float)
    UP2 = np.array(result_dict["UP2"], dtype=float)
    UP5 = np.array(result_dict["UP5"], dtype=float)
    z_ax = vec3(UP1, UP2)
    z_n = float(np.linalg.norm(z_ax))
    if z_n < 1e-12:
        return np.array([0.0, 1.0, 0.0])
    z_ax = z_ax / z_n
    u15 = vec3(UP1, UP5)
    x_ax = np.cross(u15, z_ax)
    x_n = float(np.linalg.norm(x_ax))
    if x_n < 1e-12:
        x_ax = np.array([1.0, 0.0, 0.0])
    else:
        x_ax = x_ax / x_n
    return np.cross(z_ax, x_ax)


def compute_contact_patch(UP5, upright_y_axis, hp):
    """
    Compute the tire contact patch center from wheel center, camber,
    and tire parameters.

    Args:
        UP5:              wheel center world coords [x, y, z]
        upright_y_axis:   upright local Y axis (wheel spin axis) as [x, y, z]
        hp:               hardpoints dict with tire params:
                          tire_radius, tire_spring_rate, corner_weight_n, tire_width

    Returns:
        {
            center:        [x, y, z] contact patch center in world coords
            loaded_radius: float, mm — actual radius under static load
            camber_deg:    float — computed camber for reference
            deflection:    float, mm — tire vertical compression
        }
    """
    free_radius = hp.get("tire_radius", 150.0)
    spring_rate = hp.get("tire_spring_rate", 150.0)
    corner_weight = hp.get("corner_weight_n", 350.0)

    # Loaded radius
    deflection = corner_weight / max(spring_rate, 1.0)
    R_load = max(free_radius - deflection, free_radius * 0.6)

    UP5_np = np.array(UP5, dtype=float)
    y_axis = np.array(upright_y_axis, dtype=float)
    y_norm = float(np.linalg.norm(y_axis))
    if y_norm < 1e-12:
        return {
            "center": [float(UP5_np[0]), float(UP5_np[1]), 0.0],
            "loaded_radius": R_load,
            "camber_deg": 0.0,
            "deflection": deflection,
        }
    y_axis = y_axis / y_norm

    # Camber from wheel spin axis (Z component): negative = top of wheel
    # inward.  Same formula for both sides — the spin axis mirrors as
    # (x, -y, z), so the Z component is mirror-invariant (K-1 fix).
    camber_rad = -math.atan2(float(y_axis[2]),
                              float(math.hypot(y_axis[0], y_axis[1])))
    camber_deg = math.degrees(camber_rad)

    # Contact patch: project the world-vertical onto the wheel plane
    # (plane normal = spin axis), then step one loaded radius down from
    # the wheel centre.  This is mirror-symmetric by construction: for a
    # left wheel the projected direction flips with the spin axis, so
    # negative camber always shifts the patch toward the vehicle's
    # outboard side (K-1 fix; replaces the legacy "X=up" camber shift).
    # Coordinate system: X=forward, Y=right, Z=up. Z is pinned to the
    # ground plane (suspension analysis assumes a fixed road surface;
    # wheel travel moves the wheel, not the road).
    rad = np.array([0.0, 0.0, 1.0]) - y_axis * float(y_axis[2])
    rad_norm = float(np.linalg.norm(rad))
    if rad_norm < 1e-12:
        rad = np.array([0.0, 0.0, 1.0])
    else:
        rad = rad / rad_norm
    cp = UP5_np - rad * R_load
    x_cp, y_cp, z_cp = float(cp[0]), float(cp[1]), 0.0

    return {
        "center": [round(x_cp, 2), round(y_cp, 2), round(z_cp, 2)],
        "loaded_radius": round(R_load, 2),
        "camber_deg": round(camber_deg, 3),
        "deflection": round(deflection, 2),
    }
