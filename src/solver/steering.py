"""
Steering kinematics solver — upright rotation about kingpin axis.
"""
import math

import numpy as np

from geometry import closest_point_on_line, dist, vec3


def solve_steering(hp_right, rack_displacement, max_iter=50, tol=1e-8,
                   tie_rod_length=None, theta_guess=0.0):
    """
    Given right-side hardpoints and rack Y-displacement (mm, positive = rack right),
    return new positions. Works with both design positions (pure steer) and
    bumped positions (bump + steer coupling).

    Rack displacement moves FL1 in Y direction. Tie rod pulls/pushes UP3,
    causing the upright to rotate about the kingpin axis (UP1-UP2).

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

    # Newton's method to find theta
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
                step = err / d_err_dtheta
                # damp: limit per-iteration rotation to ±0.4 rad so Newton
                # cannot skip over the wrong root into another branch
                step = max(-0.4, min(0.4, step))
                theta -= step

    def _err_at(t):
        ct = math.cos(t)
        st = math.sin(t)
        up3_t = up3_to_kp + up3_r * (ct * u + st * v)
        return float(np.linalg.norm(up3_t - FL1_new)) - L_tie_rod

    # Branch check: fall back to global scan when Newton either failed,
    # landed far from the design solution, or jumped discontinuously
    # from the continuation guess (the tie-rod constraint has two roots;
    # Newton can converge to the wrong one at ~5-10°, far below the old
    # 45° threshold).
    used_fallback = False
    jump_from_guess = theta_guess != 0.0 and abs(theta - theta_guess) > 0.30
    if not newton_ok or abs(theta) > 0.7854 or jump_from_guess:
        used_fallback = True
        n_scan = 1200
        scan = np.linspace(-math.pi, math.pi, n_scan)
        best_root = None
        best_dist = float('inf')
        prev_e = None
        prev_t = scan[0]

        for i in range(1, n_scan):
            t_i = scan[i]
            e_i = _err_at(t_i)
            if prev_e is not None and prev_e * e_i <= 0:
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
                # choose the root nearest the continuation guess (keeps branch)
                if abs(root - theta_guess) < best_dist:
                    best_dist = abs(root - theta_guess)
                    best_root = root
            prev_e = e_i
            prev_t = t_i

        if best_root is not None:
            theta = best_root
            it = max_iter  # mark that we used fallback

    # Compute all upright points rotated by theta around kingpin
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

    UP1_new = np.array(UP1)
    UP2_new = np.array(UP2)
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
