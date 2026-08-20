"""P5-3 整车调平（弹簧/防倾杆静平衡，P5 计划）。

目标：让 P3 静态四轮载荷与弹簧体系自洽——给定每角 wheel rate
（k_spring·MR²）与目标 ride height（轮跳偏移），求出每角弹簧预载，
使 F_spring,i = Fz_static,i 成立；并给出 roll/pitch 静态姿态与自洽残差。
"""
from __future__ import annotations

G = 9.81


def ride_level(vehicle: dict, fz: dict, mr: dict, ride_mm: dict) -> dict:
    """调平计算。

    fz: {fl,fr,rl,rr} 静态垂直载荷（N）；mr: 每角几何 Motion Ratio；
    ride_mm: 目标轮跳偏移（mm，正=压缩，缺省 0=设计位形）。
    返回每角预载力、wheel rate、弹簧力校验与 roll/pitch 姿态。
    """
    k_spring = {
        "f": float(vehicle.get("k_spring_f", 26.0)),
        "r": float(vehicle.get("k_spring_r", 47.0)),
    }
    corners = {"fl": ("f", mr.get("fl", 0.7)), "fr": ("f", mr.get("fr", 0.7)),
               "rl": ("r", mr.get("rl", 0.6)), "rr": ("r", mr.get("rr", 0.6))}
    wheels: dict[str, dict] = {}
    pose_data: dict[str, float] = {}
    out: dict[str, object] = {"wheels": wheels, "pose": pose_data}
    pre_loads: list[float] = []
    spring_loads: list[float] = []
    fz_vals: list[float] = []
    for c, (axle, mrc) in corners.items():
        kw = k_spring[axle] * mrc * mrc          # N/mm
        ride = float(ride_mm.get(c, 0.0))
        fzi = float(fz[c])
        preload = fzi - kw * ride                 # 设计位形（ride=0）所需预载
        spring = preload + kw * ride              # 平衡时弹簧力 = Fz
        pre_loads.append(preload)
        spring_loads.append(spring)
        fz_vals.append(fzi)
        wheels[c] = {
            "wheel_rate_n_per_mm": round(kw, 4),
            "ride_mm": round(ride, 3),
            "preload_n": round(preload, 3),
            "spring_force_n": round(spring, 3),
            "fz_static_n": round(fzi, 3),
        }
    # 姿态（左右/前后差）
    pose_data.update({
        "roll_deg": 0.0,
        "pitch_deg": 0.0,
        "fz_total_n": round(sum(fz_vals), 2),
        "preload_total_n": round(sum(pre_loads), 2),
    })
    # roll（左右总轮跳差 → 度；track 取前后平均近似）
    track = (float(vehicle.get("front_track_mm", 1220.0))
             + float(vehicle.get("rear_track_mm", 1180.0))) / 2.0
    ride_l = ride_mm.get("fl", 0.0) + ride_mm.get("rl", 0.0)
    ride_r = ride_mm.get("fr", 0.0) + ride_mm.get("rr", 0.0)
    if track > 0:
        pose_data["roll_deg"] = round((ride_l - ride_r) / 2.0 / track * 180.0 / 3.14159265, 4)
    pose_data["pitch_deg"] = round(((ride_mm.get("fl", 0) + ride_mm.get("fr", 0))
                                   - (ride_mm.get("rl", 0) + ride_mm.get("rr", 0))) / 2.0
                                  / float(vehicle.get("wheelbase_mm", 1550.0))
                                  * 180.0 / 3.14159265, 4)
    out["pose"] = pose_data
    # 自洽校验：Σ spring = Σ Fz
    balance = round(sum(spring_loads) - sum(fz_vals), 6)
    out["balance_residual_n"] = balance
    out["status"] = "VALID" if abs(balance) < 1e-6 else "APPROXIMATE"
    return out


def settle_offsets(vehicle: dict, fz: dict, mr: dict, preload: dict) -> dict:
    """调平闭环反解：给定每角预载/轮率 → 求静态 ride 偏移（mm，正=压缩）。

    平衡方程 Fz_i = preload_i + k_wheel_i·ride_i → ride_i = (Fz_i − preload_i)/k_wheel_i。
    返回四轮 ride_mm 偏移（可直接作为 v2 solve 的 baseline_ride / travel 基准）。
    """
    k_spring = {"f": float(vehicle.get("k_spring_f", 26.0)),
                "r": float(vehicle.get("k_spring_r", 47.0))}
    corners = {"fl": "f", "fr": "f", "rl": "r", "rr": "r"}
    ride = {}
    for c in corners:
        kw = k_spring[corners[c]] * float(mr.get(c, 0.7)) ** 2
        ride[c] = (float(fz[c]) - float(preload.get(c, 0.0))) / kw
    return {c: round(ride[c], 3) for c in corners}
