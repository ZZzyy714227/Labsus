"""P5-2 稳态转向动力学（自行车模型 + 载荷敏感，P5 计划）。

基于 P3 四轮载荷（含侧向/纵向转移）与 P5-1 轮胎模型：
- 轴侧向力按轴 Fz 份额分配（与 wheel_loads 分配一致）
- 每轮由 MF 反解侧偏角 α（轴均值）
- understeer gradient K = (α_f − α_r)/a_y（>0 不足转向，标准符号）
- 转向角 δ = L/R + K·a_y；侧偏角平衡；K(a_y) 曲线（载荷敏感转向）
"""
from __future__ import annotations

from metrics.tire_model import alpha_for_fy, cornering_stiffness

G = 9.81


def _axle_total(fz: dict, front: bool) -> float:
    if front:
        return float(fz["fl"]) + float(fz["fr"])
    return float(fz["rl"]) + float(fz["rr"])


def _axle_avg(fz: dict, front: bool) -> float:
    if front:
        return (float(fz["fl"]) + float(fz["fr"])) / 2.0
    return (float(fz["rl"]) + float(fz["rr"])) / 2.0


def understeer_gradient(vehicle: dict, fz: dict, a_y_g: float,
                        gamma_f: float = 0.0, gamma_r: float = 0.0) -> dict:
    """稳态侧偏分析。fz: {fl,fr,rl,rr} 当前四轮垂直载荷（N）。

    返回 {alpha_f_deg, alpha_r_deg, k_deg_per_g, f_y_total_n,
          fy_f_n, fy_r_n, ca_f, ca_r, saturated_f, saturated_r, delta_deg_per_m}.
    """
    m = float(vehicle.get("mass_kg", 0.0))
    if m <= 0:
        return {"status": "SOLVER_FAILED", "explanation": "mass_kg<=0"}
    fz_f = _axle_total(fz, True)
    fz_r = _axle_total(fz, False)
    total_fz = fz_f + fz_r
    if total_fz <= 0:
        return {"status": "SOLVER_FAILED", "explanation": "总 Fz<=0"}
    f_y_total = m * G * abs(a_y_g)

    # 每轮按自身 Fz 份额分配侧向力（与 P3 wheel_loads 一致），每轮单独反解 α，
    # 轴等效侧偏角 = 左右平均 —— 载荷转移经 Cα 的非线性(X^0.8) 产生载荷敏感转向。
    wheels = [("fl", "fr", True), ("rl", "rr", False)]
    alphas: dict[str, list[float | None]] = {"f": [], "r": []}
    fys: dict[str, float] = {}
    for outer, inner, front in wheels:
        pair = (fz[outer], fz[inner])
        for side, fzi in (("o", pair[0]), ("i", pair[1])):
            fy_i = f_y_total * (fzi / total_fz)
            gamma = gamma_f if front else gamma_r
            alpha_i = alpha_for_fy(vehicle, fy_i, fzi, gamma)
            alphas[("f" if front else "r")].append(alpha_i)
            fys[f"{('f' if front else 'r')}{side}"] = fy_i

    alpha_f_list = alphas["f"]
    alpha_r_list = alphas["r"]
    alpha_f = (sum(a for a in alpha_f_list if a is not None) / len(alpha_f_list)
               if all(a is not None for a in alpha_f_list) else None)
    alpha_r = (sum(a for a in alpha_r_list if a is not None) / len(alpha_r_list)
               if all(a is not None for a in alpha_r_list) else None)
    fz_af = _axle_avg(fz, True)
    fz_ar = _axle_avg(fz, False)
    ca_f = cornering_stiffness(
        float(vehicle.get("tire_calpha", 350.0)), fz_af,
        float(vehicle.get("tire_fz_ref", 1000.0)),
        float(vehicle.get("tire_alpha_exp", 0.8)))
    ca_r = cornering_stiffness(
        float(vehicle.get("tire_calpha", 350.0)), fz_ar,
        float(vehicle.get("tire_fz_ref", 1000.0)),
        float(vehicle.get("tire_alpha_exp", 0.8)))

    if alpha_f is None or alpha_r is None:
        return {"status": "OUT_OF_RANGE", "explanation": "某轮侧偏饱和（Fy=Fz·μ×转移）",
                "alpha_f_deg": alpha_f, "alpha_r_deg": alpha_r,
                "fy_f_n": fys.get("fo", 0.0), "fy_r_n": fys.get("ro", 0.0),
                "ca_f": ca_f, "ca_r": ca_r}
    ay = abs(a_y_g)
    k = (alpha_f - alpha_r) / ay if ay > 1e-6 else 0.0
    return {
        "status": "VALID",
        "alpha_f_deg": round(alpha_f, 4),
        "alpha_r_deg": round(alpha_r, 4),
        "k_deg_per_g": round(k, 4),
        "delta_per_g_deg": round(k, 4),      # δ = L/R + K·a_y
        "understeer": "UNDER" if k > 0.02 else ("OVER" if k < -0.02 else "NEUTRAL"),
        "f_y_total_n": round(f_y_total, 2),
        "fy_f_n": round(fys.get("fo", 0.0), 2),
        "fy_r_n": round(fys.get("ro", 0.0), 2),
        "ca_f_n_per_deg": round(ca_f, 3),
        "ca_r_n_per_deg": round(ca_r, 3),
        "saturated_f": alpha_f is None,
        "saturated_r": alpha_r is None,
    }


def understeer_curve(vehicle: dict, fz0: dict, ay_max: float = 1.2,
                     points: int = 13, gamma_f: float = 0.0,
                     gamma_r: float = 0.0, lateral_transfer=None) -> dict:
    """K(a_y) 曲线：逐点算四轮 Fz（含侧向转移）→ K。

    lateral_transfer: 可选 callable(fz0, a_y) -> fz 四轮（默认按 P3 方向线性增减外侧）。
    缺省用简化的载荷敏感：每轴侧向转移 = ay·m_axle·g·h_cg/track 平分。
    """
    ay_vals = [ay_max * i / (points - 1) for i in range(points)]
    ks, alphas = [], []
    for ay in ay_vals:
        fz = _loads_with_transfer(vehicle, fz0, ay, lateral_transfer)
        res = understeer_gradient(vehicle, fz, ay, gamma_f, gamma_r)
        ks.append(res["k_deg_per_g"] if res["status"] == "VALID" else None)
        alphas.append((res.get("alpha_f_deg"), res.get("alpha_r_deg")))
    return {"ay_g": [round(v, 3) for v in ay_vals],
            "k_deg_per_g": ks, "alpha_f_deg": [a[0] for a in alphas],
            "alpha_r_deg": [a[1] for a in alphas]}


def _loads_with_transfer(vehicle, fz0: dict, ay: float, lateral_transfer=None):
    if lateral_transfer is not None:
        return lateral_transfer(fz0, ay)
    # 简化转移：每轴负载 ±Δ，Δ = ay·m_axle·g·h_cg/track（外侧+、内侧−）
    m = float(vehicle.get("mass_kg", 0.0))
    h = float(vehicle.get("cg_height_mm", 300.0))
    tr_f = float(vehicle.get("front_track_mm", 1220.0))
    tr_r = float(vehicle.get("rear_track_mm", 1180.0))
    m_f = m * float(vehicle.get("front_axle_frac", 0.5))
    m_r = m - m_f
    d_f = ay * m_f * G * h / tr_f
    d_r = ay * m_r * G * h / tr_r
    return {
        "fl": fz0["fl"] - d_f / 2.0, "fr": fz0["fr"] + d_f / 2.0,
        "rl": fz0["rl"] - d_r / 2.0, "rr": fz0["rr"] + d_r / 2.0,
    }
