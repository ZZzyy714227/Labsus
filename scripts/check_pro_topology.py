"""PRO 拓扑数值门：STRUT 杆长恒定 + bump 压缩 / rebound 伸张 + 无奇异。

筛选用几何近似（最终由机制求解器验证）：轮跳 dz 时假设 STRUT_OUT 近似沿垂向移动。
"""
import sys
sys.path.insert(0, "src")
import math

import numpy as np

from config import DEFAULT_FRAME_NODES
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix


def rotate_around_axis(p, axis_pt, axis_dir, theta):
    u = np.asarray(axis_dir, float)
    u = u / (np.linalg.norm(u) or 1.0)
    c, s = math.cos(theta), math.sin(theta)
    v = np.asarray(p, float) - np.asarray(axis_pt, float)
    return np.asarray(axis_pt, float) + v * c + np.cross(u, v) * s + u * np.dot(u, v) * (1 - c)


def solve_rocker_angle(ch5, pivot, axis, s2, L0):
    """找 |rot(ch5) - s2| = L0 的最小 |θ| 根。返回 (theta_rad, err_mm)。"""

    def err(t):
        return np.linalg.norm(rotate_around_axis(ch5, pivot, axis, t) - s2) - L0

    best_t, best_e = None, None
    for t in np.linspace(-math.radians(150), math.radians(150), 601):
        e = abs(err(t))
        if best_e is None or e < best_e:
            best_t, best_e = t, e
    if best_e > 0.5:
        return None, best_e
    lo, hi = best_t - math.radians(3), best_t + math.radians(3)
    flo = err(lo)
    for _ in range(60):
        mid = (lo + hi) / 2
        fm = err(mid)
        if flo * fm <= 0:
            hi = mid
        else:
            lo, flo = mid, fm
    return (lo + hi) / 2, abs(err((lo + hi) / 2))


def gate(axle, hp, pivot, dmp_rocker, dmp_chassis):
    print(f"== {axle} ==")
    ch5 = np.array(hp["CH5"], float)
    sout = np.array(hp["STRUT_OUT"], float)
    L0 = np.linalg.norm(sout - ch5)
    dl0 = np.linalg.norm(np.asarray(dmp_rocker, float) - np.asarray(dmp_chassis, float))
    axis = np.asarray(pivot[1], float) - np.asarray(pivot[0], float)
    ok = True
    for dz in (-45.0, -10.0, 0.0, 10.0, 45.0):
        s2 = sout + np.array([0.0, 0.0, dz])
        th, e = solve_rocker_angle(ch5, np.asarray(pivot[0], float), axis, s2, L0)
        if th is None:
            print(f"  travel {dz:+6.1f} NO ROOT (err {e:.2f}mm)")
            ok = False
            continue
        rot_dmp = rotate_around_axis(np.asarray(dmp_rocker, float),
                                     np.asarray(pivot[0], float), axis, th)
        dlen = np.linalg.norm(rot_dmp - np.asarray(dmp_chassis, float))
        dt = dlen - dl0
        deg = math.degrees(th)
        print(f"  travel {dz:+6.1f} damper_travel {dt:+8.3f} rocker {deg:+7.2f}deg err {e:.2e}")
        if abs(deg) > 60:
            ok = False
    if ok:
        print("  => 符号核对：+10 应压缩(-)、-10 应伸张(+)")
    return ok


def main():
    f = dict(DEFAULT_HARDPOINTS)
    f["track_width"] = 1220.0
    r = strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_")
    r["track_width"] = 1180.0

    ok_f = gate("FRONT", f,
                pivot=[DEFAULT_FRAME_NODES["RCK_AX_A_R"], DEFAULT_FRAME_NODES["RCK_AX_B_R"]],
                dmp_rocker=DEFAULT_FRAME_NODES["RK_DAMPER_R"],
                dmp_chassis=DEFAULT_FRAME_NODES["DAMPER_CHASSIS_FR"])
    ok_r = gate("REAR", r,
                pivot=[DEFAULT_FRAME_NODES["R_RCK_AX_A_R"], DEFAULT_FRAME_NODES["R_RCK_AX_B_R"]],
                dmp_rocker=DEFAULT_FRAME_NODES["R_RK_DAMPER_R"],
                dmp_chassis=DEFAULT_FRAME_NODES["R_DAMPER_CHASSIS_RR"])
    print("FRONT OK" if ok_f else "FRONT FAIL")
    print("REAR OK" if ok_r else "REAR FAIL")


if __name__ == "__main__":
    main()
