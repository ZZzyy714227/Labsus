"""轮胎实测数据 → Pacejka MF 参数辨识（真实赛车开发数据链第一站）。

讲义对照：
- EP08 轮胎与抓地力——赛车开发必须用车队自测的轮胎特性（Fy-α @多组 Fz），
  而不是通用缺省参数；本模块把台架/实车扫掠数据辨识为引擎与前端共用的
  MF 子集参数（By/Cy/Ey/Fy0/LS），与 tire_mf.MagicFormulaSub 严格同源。
- 载荷敏感性 LS：需 ≥2 个不同载荷层级才能辨识（单层级时固定 0，显式标注），
  这正是"重载 μ 递减（Jensen 效应）"的标定通道。

约定：
- 输入曲线为 (α[°], |Fy|[N]) 单边扫掠（对称假设，取绝对值拟合）；
- 残差以各层级最大 |Fy| 归一，RMS% 可直接横向比较不同轮胎；
- 失败/欠定输入走 MetricResult 风格显式状态，禁止静默给默认值。
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import least_squares


def _mf_fy(params: np.ndarray, a_rad: np.ndarray, fz: float) -> np.ndarray:
    """与 tire_mf.MagicFormulaSub.fy 逐字同构（Sh=0、Sv=0 的辨识口径）。"""
    d0, b, c, e, ls = (float(v) for v in params)
    if fz <= 0:
        return np.zeros_like(a_rad)
    r = fz / 3500.0  # FzNom 辨识口径固定 3500 N（与 TireParams 缺省同源）
    d = d0 * r * max(0.1, 1.0 - ls * (r - 1.0))
    x = b * a_rad
    return d * np.sin(c * np.arctan(x - e * (x - np.arctan(x))))


def fit_tire_params(curves: list[dict], fit_ls: bool = True) -> dict:
    """由多组 (Fz, α[], Fy[]) 实测曲线辨识 MF 子集参数。

    返回 {status, params{Fy0,By,Cy,Ey,FzNom,LS}, rms_pct, per_load_rms_pct,
          n_points, n_loads, note}。status ∈ VALID / SOLVER_FAILED / NOT_APPLICABLE。
    """
    # ── 输入清洗 ──────────────────────────────────────────────
    loads: list[tuple[float, np.ndarray, np.ndarray]] = []
    for cv in curves or []:
        try:
            fz = float(cv["fz"])
            alpha = np.asarray(cv["alpha_deg"], float)
            fy = np.abs(np.asarray(cv["fy"], float))
        except (KeyError, TypeError, ValueError):
            continue
        if not (math.isfinite(fz) and fz > 0):
            continue
        m = np.isfinite(alpha) & np.isfinite(fy)
        alpha, fy = alpha[m], fy[m]
        if len(alpha) < 5 or float(fy.max()) < 10.0:
            continue  # 点数/量程不足，该层级不可用
        loads.append((fz, np.deg2rad(alpha), fy))
    if not loads:
        return {"status": "NOT_APPLICABLE", "params": None, "rms_pct": None,
                "per_load_rms_pct": {}, "n_points": 0, "n_loads": 0,
                "note": "无有效实测曲线（每层级需 ≥5 点且 |Fy| 峰值 ≥10N）"}
    fz_vals = [ld[0] for ld in loads]
    n_loads = len(loads)
    n_points = sum(len(ld[1]) for ld in loads)
    single_load = (max(fz_vals) - min(fz_vals)) < 1.0
    use_ls = bool(fit_ls) and not single_load

    # ── 初值：峰值与线性段斜率给出解析起点 ──────────────────
    d0_0 = max(float(fy.max()) for _, _, fy in loads)
    a_all = np.concatenate([a for _, a, _ in loads])
    f_all = np.concatenate([f for _, _, f in loads])
    lin = np.abs(a_all) < np.deg2rad(3.0)
    ca0 = float(np.polyfit(a_all[lin], f_all[lin], 1)[0]) if lin.sum() >= 3 \
        else 10.0 * d0_0
    b0 = min(20.0, max(3.0, ca0 / max(d0_0, 1.0) / 1.2))

    def residual(p: np.ndarray) -> np.ndarray:
        full = np.array([p[0], p[1], p[2], p[3], p[4] if use_ls else 0.0])
        out = []
        for fz, a_rad, fy in loads:
            scale = max(float(fy.max()), 1.0)
            out.append((_mf_fy(full, a_rad, fz) - fy) / scale)
        return np.concatenate(out)

    # LS 仅在多层级时参与辨识；单层级固定 0（显式标注，禁止伪造）。
    # scipy 要求 lb < ub 严格不等 → 不拟合的 LS 不进优化向量。
    if use_ls:
        x0 = np.array([d0_0, b0, 1.2, -0.5, 0.10])
        lb = np.array([500.0, 2.0, 1.0, -2.0, 0.0])
        ub = np.array([60000.0, 25.0, 2.5, 1.0, 0.8])
    else:
        x0 = np.array([d0_0, b0, 1.2, -0.5])
        lb = np.array([500.0, 2.0, 1.0, -2.0])
        ub = np.array([60000.0, 25.0, 2.5, 1.0])
    try:
        sol = least_squares(residual, x0, bounds=(lb, ub), method="trf",
                            max_nfev=4000)
    except Exception as exc:  # noqa: BLE001
        return {"status": "SOLVER_FAILED", "params": None, "rms_pct": None,
                "per_load_rms_pct": {}, "n_points": n_points, "n_loads": n_loads,
                "note": f"least_squares 失败：{exc.__class__.__name__} {exc}"}
    if not sol.success and 2.0 * float(sol.cost) / n_points > 0.25 ** 2:
        return {"status": "SOLVER_FAILED", "params": None, "rms_pct": None,
                "per_load_rms_pct": {}, "n_points": n_points, "n_loads": n_loads,
                "note": f"拟合未收敛且残差过大：{sol.message}"}

    b, c, e = float(sol.x[1]), float(sol.x[2]), float(sol.x[3])
    d0, ls = float(sol.x[0]), (float(sol.x[4]) if use_ls else 0.0)
    x_full = np.array([d0, b, c, e, ls])
    per_load: dict[str, float] = {}
    for fz, a_rad, fy in loads:
        scale = max(float(fy.max()), 1.0)
        rms = math.sqrt(float(np.mean((_mf_fy(x_full, a_rad, fz) - fy) ** 2))
                        ) / scale * 100.0
        per_load[f"{fz:.0f}N"] = round(rms, 2)
    rms_pct = math.sqrt(float(np.mean(sol.fun ** 2))) * 100.0

    params = {"Fy0": round(d0, 1), "By": round(b, 4), "Cy": round(c, 4),
              "Ey": round(e, 4), "FzNom": 3500.0,
              "LS": round(ls, 4) if use_ls else 0.0}
    note = ("单层级载荷：LS 不可辨识，固定 0（载荷敏感性需 ≥2 个载荷层级）"
            if single_load and fit_ls else "")
    return {"status": "VALID", "params": params, "rms_pct": round(rms_pct, 2),
            "per_load_rms_pct": per_load, "n_points": n_points,
            "n_loads": n_loads, "note": note}
