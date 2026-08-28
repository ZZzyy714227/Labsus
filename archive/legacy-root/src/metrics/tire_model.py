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

# ================= P5 深化 (3)：联合滑移椭圆 + 标定接口 =================

def fx_magic(kappa: float, fz: float, c_kappa_ref: float, mu_x: float,
             fz_ref: float, alpha_exp: float,
             c: float = 1.3, e: float = 0.0) -> float:
    """纯纵向 Fx（N），x = κ·100（% 滑移）。"""
    if fz <= 1e-9 or abs(kappa) < 1e-9:
        return 0.0
    d = mu_x * fz
    ck = c_kappa_ref * (fz / fz_ref) ** alpha_exp
    cc = max(c, 1.0001)
    b = ck / (cc * d) if d > 1e-9 else 0.0
    x = kappa * 100.0
    bx = b * x
    return d * math.sin(cc * math.atan(bx - e * (bx - math.atan(bx))))


def tire_combined_force(vehicle: dict, alpha_deg: float, fz: float,
                        gamma_deg: float = 0.0, kappa: float = 0.0) -> dict:
    """联合滑移（摩擦椭圆，取代纯摩擦圆钳制）。

    纯侧 Fy0（含外倾）、纯纵 Fx0 各自 MF；椭圆盒 (dx, dy) = (μx·Fz, μy·Fz)；
    若 (Fx0/dx)² + (Fy0/dy)² > 1 → 按椭圆缩放到边界（α 占用纵向摩擦/κ 占用侧向）。
    """
    p = _params(vehicle)
    ca = cornering_stiffness(p["c_alpha"], fz, p["fz_ref"], p["alpha_exp"])
    fy0 = fy_magic(alpha_deg, fz, ca, p["mu_y"], p["c"], p["e"])
    fy0 += -p["c_gamma"] * gamma_deg
    fx0 = fx_magic(kappa, fz, p["c_kappa"], p["mu_x"], p["fz_ref"],
                   p["alpha_exp"], p["c"], p["e"])
    dx = p["mu_x"] * fz if fz > 0 else 0.0
    dy = p["mu_y"] * fz if fz > 0 else 0.0
    fy0 = max(-dy, min(dy, fy0)) if dy > 0 else 0.0
    scale = 1.0
    if dx > 1e-9 and dy > 1e-9:
        sx = (fx0 / dx) ** 2
        sy = (fy0 / dy) ** 2
        occ = sx + sy
        if occ > 1.0:
            # 超出椭圆 → 按比例缩回边界
            f = 1.0 / math.sqrt(occ)
            fx = fx0 * f
            fy = fy0 * f
            scale = f
        else:
            # 椭圆占用：纵向占掉侧向可用摩擦、反之亦然（κ 使 Fy 减小）
            fx = fx0 * math.sqrt(max(0.0, 1.0 - sy))
            fy = fy0 * math.sqrt(max(0.0, 1.0 - sx))
    else:
        fx = fx0
        fy = fy0
    mu_util = (math.hypot(fx, fy) / fz) if fz > 1e-9 else 0.0
    return {
        "fx_n": round(fx, 3), "fy_n": round(fy, 3),
        "mu_util": round(mu_util, 4),
        "saturated": bool(scale < 1.0),
        "ellipse_ratio": round(math.hypot(fx0 / dx, fy0 / dy) if dx > 0 and dy > 0 else 0.0, 4),
    }


def fit_magic_formula(samples: list[dict], ref_fz: float = 1000.0,
                      alpha_exp: float = 0.8,
                      c_gamma_init: float = 60.0) -> dict:
    """从台架数据点拟合 MF 侧向参数（P5 标定接口）。

    samples: [{\"fz_n\":float, \"alpha_deg\":float, \"fy_n\":float, [\"gamma_deg\":0}]
    拟合 [mu_y, calpha_ref(于 ref_fz), mf_c, mf_e]（可选含外倾样本时拟合 c_gamma），
    最小二乘；返回参数、逐点残差与 R²。
    """
    pts = [dict(s) for s in samples]
    if len(pts) < 4:
        return {"status": "SOLVER_FAILED", "explanation": "样本不足（≥4）"}
    try:
        from scipy.optimize import least_squares
    except Exception:  # pragma: no cover
        return {"status": "NOT_IMPLEMENTED", "explanation": "需要 scipy"}

    has_gamma = any("gamma_deg" in p and p.get("gamma_deg", 0.0) != 0.0 for p in pts)

    def model(x, fz, alpha, gamma):
        mu, ca, cc, ee = x[0], x[1], x[2], x[3]
        ca_fz = ca * (fz / ref_fz) ** alpha_exp
        d = mu * fz
        cc = max(cc, 1.0001)
        b = ca_fz / (cc * d)
        ba = b * alpha
        y = d * math.sin(cc * math.atan(ba - ee * (ba - math.atan(ba))))
        if has_gamma:
            y += -x[4] * gamma
        return y

    def resid(x):
        return [model(x, float(p["fz_n"]), float(p["alpha_deg"]),
                     float(p.get("gamma_deg", 0.0))) - float(p["fy_n"])
                for p in pts]

    x0 = [1.4, 350.0, 1.3, 0.0] + ([c_gamma_init] if has_gamma else [])
    lo = [0.5, 20.0, 1.0001, -1.0] + ([0.0] if has_gamma else [])
    hi = [2.0, 1500.0, 2.0, 1.5] + ([300.0] if has_gamma else [])
    sol = least_squares(resid, x0, bounds=(lo, hi), max_nfev=2000)
    fitted = [float(v) for v in sol.x]
    res = [float(v) for v in sol.fun]
    ss_res = sum(v * v for v in res)
    ys = [float(p["fy_n"]) for p in pts]
    mean = sum(ys) / len(ys)
    ss_tot = sum((y - mean) ** 2 for y in ys)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 1.0
    return {
        "status": "VALID",
        "params": {
            "tire_mu_peak_y": round(fitted[0], 4),
            "tire_calpha": round(fitted[1], 2),
            "tire_mf_c": round(fitted[2], 4),
            "tire_mf_e": round(fitted[3], 4),
            ("tire_cgamma" if has_gamma else "tire_cgamma_unused"):
                (round(fitted[4], 2) if has_gamma else c_gamma_init),
        },
        "r2": round(r2, 5),
        "rmse_n": round(math.sqrt(ss_res / len(pts)), 3),
        "samples": len(pts),
    }

