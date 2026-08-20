"""P5-1 简化魔毯方程轮胎模型（Pacejka Magic Formula 魔改，P5 计划）。

仅保留对「运动学 + 准静态载荷」分析最需要的物理：
- Fy(α, γ, Fz)：侧偏角 α（deg）、外倾角 γ（deg）、垂直载荷 Fz（N）
- Fx(κ, Fz)：纵向滑移率 κ（0..1）
- Cα 随 Fz 非线性硬化：Cα = Cα_ref·(Fz/Fz_ref)^n（n≈0.8）
- Cγ 外倾刚度线化项（clamp 至 μFz）
- 摩擦圆/椭圆校验：sqrt(Fx²+Fy²) ≤ μy·Fz

魔改说明（面向工程分析，非精确风洞标定）：
- 忽略温度/气压/地面/胎压相关的尺度因子（λ 缩放）；
- 无联合滑移耦合（用摩擦圆做总力上限），α−κ 解耦近似；
- B 由拐点刚度反算，保证 B·C·D = Cα（Pacejka 一致性）。
"""
from __future__ import annotations

import math

D2R = math.pi / 180.0


def _params(vehicle: dict) -> dict:
    """从 vehicle 参数提取轮胎参数（FSAE 合理默认）。"""
    return {
        "mu_y": float(vehicle.get("tire_mu_peak_y", 1.4)),
        "mu_x": float(vehicle.get("tire_mu_peak_x", 1.5)),
        "c_alpha": float(vehicle.get("tire_calpha", 350.0)),      # N/deg @ fz_ref
        "c_gamma": float(vehicle.get("tire_cgamma", 60.0)),       # N/deg
        "fz_ref": float(vehicle.get("tire_fz_ref", 1000.0)),      # N
        "alpha_exp": float(vehicle.get("tire_alpha_exp", 0.8)),
        "c": float(vehicle.get("tire_mf_c", 1.3)),                # MF 形状系数
        "e": float(vehicle.get("tire_mf_e", 0.0)),                # MF 曲率
        "c_kappa": float(vehicle.get("tire_ckappa", 35.0)),       # N/% @ ref
    }


def cornering_stiffness(c_alpha_ref: float, fz: float, fz_ref: float,
                        exp: float) -> float:
    """拐点侧偏刚度 Cα（N/deg）：随 Fz 非线性硬化。"""
    if fz <= 1e-9:
        return 0.0
    return c_alpha_ref * (fz / fz_ref) ** exp


def fy_magic(alpha_deg: float, fz: float, c_alpha: float, mu_y: float,
             c: float = 1.3, e: float = 0.0) -> float:
    """纯侧偏 Fy（N）。B = Cα/(C·D) 保证 BCD=Cα。"""
    if fz <= 1e-9:
        return 0.0
    d = mu_y * fz
    c = max(c, 1.0001)          # C 须 >1 才有峰值
    b = c_alpha / (c * d)
    x = alpha_deg
    bx = b * x
    y = d * math.sin(c * math.atan(bx - e * (bx - math.atan(bx))))
    return y


def tire_corner_force(vehicle: dict, alpha_deg: float, fz: float,
                      gamma_deg: float = 0.0, kappa: float = 0.0) -> dict:
    """轮胎三向力（Fy/Fx 含外倾与滑移，摩擦圆钳制）。

    返回 {fy_n, fx_n, ca_n_per_deg, mu_util, saturated, fy_raw, fx_raw}。
    """
    p = _params(vehicle)
    ca = cornering_stiffness(p["c_alpha"], fz, p["fz_ref"], p["alpha_exp"])
    fy_raw = fy_magic(alpha_deg, fz, ca, p["mu_y"], p["c"], p["e"])
    # 外倾线化项（clamp 至 D）
    d = p["mu_y"] * fz
    fy_raw += -p["c_gamma"] * gamma_deg
    fy_raw = max(-d, min(d, fy_raw))
    # 纵向（滑移率 κ，% 表示）
    fx_raw = 0.0
    if abs(kappa) > 1e-9:
        ck = p["c_kappa"] * (fz / p["fz_ref"]) ** p["alpha_exp"] if fz > 1e-9 else 0.0
        dk = p["mu_x"] * fz
        bb = ck / (max(p["c"], 1.0001) * dk) if dk > 1e-9 else 0.0
        xk = kappa * 100.0
        fx_raw = dk * math.sin(p["c"] * math.atan(bb * xk))
    # 摩擦圆钳制
    limit = d if d > 1e-9 else 0.0
    mag = math.hypot(fx_raw, fy_raw)
    sat = mag > limit
    if mag > limit and mag > 1e-9:
        s = limit / mag
        fy_raw *= s
        fx_raw *= s
    mu_util = (math.hypot(fx_raw, fy_raw) / fz) if fz > 1e-9 else 0.0
    return {
        "fy_n": round(fy_raw, 3),
        "fx_n": round(fx_raw, 3),
        "ca_n_per_deg": round(ca, 3),
        "mu_util": round(mu_util, 4),
        "saturated": bool(sat),
        "fy_raw_n": round(fy_raw / (s if sat else 1.0), 3) if sat else round(fy_raw, 3),
    }


def alpha_for_fy(vehicle: dict, fy_target: float, fz: float,
                 gamma_deg: float = 0.0) -> float | None:
    """反解：给定目标 Fy（含外倾项）求侧偏角 α（deg）。

    单调曲线 → 二分。无解（|target|>可达+外倾）返回 None。
    """
    p = _params(vehicle)
    d = p["mu_y"] * fz
    ca = cornering_stiffness(p["c_alpha"], fz, p["fz_ref"], p["alpha_exp"])
    # 外倾在 α=0 的贡献
    f_gamma0 = -p["c_gamma"] * gamma_deg
    max_fy = d
    target = fy_target - f_gamma0      # 去除外倾常量的部分
    if abs(target) > max_fy * 0.999:
        return None                    # 饱和外，纯侧偏不可达
    lo, hi = -30.0, 30.0
    flo = fy_magic(lo, fz, ca, p["mu_y"], p["c"], p["e"]) + f_gamma0 - fy_target
    fhi = fy_magic(hi, fz, ca, p["mu_y"], p["c"], p["e"]) + f_gamma0 - fy_target
    if flo * fhi > 0:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        fm = fy_magic(mid, fz, ca, p["mu_y"], p["c"], p["e"]) + f_gamma0 - fy_target
        if abs(fm) < 1e-6:
            return mid
        if fm * flo <= 0:
            hi = mid
        else:
            lo = mid
            flo = fm
    return round((lo + hi) / 2, 4)
