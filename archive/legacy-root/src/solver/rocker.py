"""
Rocker kinematics — push-rod / pull-rod rocker angle and damper travel.
"""
import math

import numpy as np

from geometry import rotate_around_x


def compute_rocker_kinematics(hp_right, result_right, frame_nodes, prefix=''):
    """
    Compute rocker rotation angle and damper length from bump results.

    The rocker is a rigid 3-point triangle (CH5, pivot, damper) that rotates
    about the X-axis through the pivot. Given the solved UP4 position and the
    design push-rod length, find the rotation angle theta such that:
        |rotate(CH5_design, theta) - UP4_current| = push_rod_len_design

    Then rotate the damper attachment by the same theta to get the new damper length.
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
        ch5_rot = rotate_around_x(CH5_0, pivot, theta)
        return float(np.linalg.norm(ch5_rot - UP4)) - L_pr

    e0 = error(0.0)
    if abs(e0) < 1e-9:
        theta = 0.0
    else:
        ep = error(0.001)
        em = error(-0.001)
        direction = 1.0 if abs(ep) < abs(em) else -1.0

        lo, hi = 0.0, 0.0
        found = False
        for r in [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, math.pi]:
            t = direction * r
            if error(0.0) * error(t) <= 0:
                lo, hi = (0.0, t) if direction > 0 else (t, 0.0)
                found = True
                break

        if not found:
            best, best_e = 0.0, abs(e0)
            for t_scan in np.linspace(-math.pi, math.pi, 101):
                e_scan = abs(error(float(t_scan)))
                if e_scan < best_e:
                    best_e, best = e_scan, float(t_scan)
            theta = best
        else:
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
    damper_rocker_rot = rotate_around_x(damper_rocker, pivot, theta)
    damper_len = float(np.linalg.norm(damper_rocker_rot - damper_chassis))
    damper_travel = damper_len - damper_len_0

    return {
        'push_rod_len_design': round(L_pr, 3),
        'rocker_angle_deg': round(math.degrees(theta), 3),
        'damper_len_design': round(damper_len_0, 3),
        'damper_len_current': round(damper_len, 3),
        'damper_travel': round(damper_travel, 3),
    }
