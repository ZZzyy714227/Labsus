"""TTC 台架拟合 → LABSUS 轮胎口径（T1，2026-10-20）

为什么有这个模块
────────────────
M19（2026-09-20）给 `TireParams` 加了 `kappa_peak`，用来把驱动需求折算成滑移率；
当时缺省值 0.12 取自**文献区间 0.10~0.15**——合理，但**没有本车/本胎数据支撑**。
工程里可用的公开刚度数据是 TTC（Tire Test Consortium）台架拟合。本模块把该拟合
转成 LABSUS 需要的三个量：

    Cα(Fz)  [N/rad]        侧偏刚度（小滑移线性支；与 MF 的 B·C·D 对照）
    Cκ(Fz)  [N / 单位 κ]   纵滑刚度
    κ_peak = μ·Fz/Cκ       "线性支刚好跑到附着上限"的滑移率（准稳态代数量）

数据来源（逐字节 vendored，见 engine/data/ttc/ 与 docs/tire-data-provenance.md）
────────────────────────────────────────────────────────────────────────
上游仓库 default 分支 `models/tires/hoosier-43075-r20-simple.xml`；其头注释声明的
原始拟合是 `Hoosier_R20_Combined_Simple.mat`（Hoosier 43075 R20、12 psi、8" rim、
TTC B2356 runs 8 与 72）。

形式（**从上游实现核对，不是猜的**）
────────────────────────────────────
`unitire_simple.py`：`s_x = kappa`、`s_y = tan(alpha)`；
`phi_x = k_x·s_x/(mu_x·Fz)`；线性支（denominator < slip_eps）时 `Fx = k_x·s_x`、
`Fy = k_y·s_y`。⇒ `k_x` 的单位就是 **N 每单位 κ**，`k_y` 是 **N 每单位 tanα ≈ N/rad**。
多项式对**归一载荷** `Fzn = Fz/f_z_rated` 求值，最高次在前：
`_polyval((k_2, k_1, k_0), Fzn) = k_2·Fzn² + k_1·Fzn + k_0`。

⚠ 已知不确定性 —— **必须随数值一起引用，不得单独摘出**
────────────────────────────────────────────────────
1. `k_y_0=10000`、`k_y_1=20000`、`k_x_1=20000` 是**整数** ⇒ 疑为拟合时固定/约束值，
   不是自由拟合结果。
2. 台架**带面** μ 约 2.3~2.4；**路面**须乘 **2/3** 先验（TTC Round 9 队伍经验，
   belt 比 track 平滑；**非本车验证**）。
3. 上游自己指出：纵向数据取自 **43100 R20** 的 run 72，是 43075 run 8 的**代理**。
4. 本拟合**零外倾**、无回正力矩（`k_11..k_23=0`）、无滚阻（`k_rl_*`/`f_rr_*`=0）。
5. FSAE 单轮静载（约 560~592 N）低于 `f_z_rated=660 N`，处于拟合区间内偏低处。
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

# 台架带面摩擦 → 路面 的比值（先验，非本车验证；见模块 docstring 第 2 条）
ROAD_BELT_RATIO = 2.0 / 3.0

# LABSUS Formula SAE 基准（M14 质量清单口径：总 235.0 kg、静态前轴 51.4%）
_MASS_KG = 235.0
_G = 9.81
_FRONT_STATIC_FRAC = 0.514
FSAE_FRONT_CORNER_N = _MASS_KG * _G * _FRONT_STATIC_FRAC / 2.0      # ≈ 592.4 N
FSAE_REAR_CORNER_N = _MASS_KG * _G * (1.0 - _FRONT_STATIC_FRAC) / 2.0  # ≈ 560.0 N

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "ttc"
LABFIT_XML = DATA_DIR / "hoosier-43075-r20-simple.xml"      # 台架拟合原样
ROAD_XML = DATA_DIR / "iem24_murphy_real_unitire.xml"       # 上游派生：四个 μ 各 ×2/3


def load_ttc_params(path: str | Path | None = None) -> dict[str, float]:
    """读 vendored 的 UniTire 参数 XML，返回 {参数名: 值}。缺文件直接报错（不静默降级）。"""
    p = Path(path) if path is not None else LABFIT_XML
    if not p.exists():
        raise FileNotFoundError(f"TTC 参数文件缺失：{p}（应随代码入库）")
    root = ET.parse(p).getroot()
    return {e.get("name"): float(e.get("value")) for e in root.iter("parameter")}


def _polyval(c2: float, c1: float, c0: float, fzn: float) -> float:
    """上游 `_polyval((c2, c1, c0), Fzn)` 的等价实现：c2·Fzn² + c1·Fzn + c0。"""
    return c2 * fzn * fzn + c1 * fzn + c0


def _clamp_fz(fz_n: float) -> float:
    """上游对负载/NaN 的处理：`f_z = maximum(f_z, 0)`；本实现同样不许负载进入多项式。"""
    if not math.isfinite(fz_n):
        return 0.0
    return max(fz_n, 0.0)


def ca_n_per_rad(fz_n: float, p: dict[str, float]) -> float:
    """侧偏刚度 Cα(Fz) [N/rad]。= k_y_2·Fzn² + k_y_1·Fzn + k_y_0。"""
    fzn = _clamp_fz(fz_n) / max(p["f_z_rated"], 1e-9)
    return _polyval(p["k_y_2"], p["k_y_1"], p["k_y_0"], fzn)


def ck_n_per_unit_kappa(fz_n: float, p: dict[str, float]) -> float:
    """纵滑刚度 Cκ(Fz) [N / 单位 κ]。= k_x_2·Fzn² + k_x_1·Fzn + k_x_0。"""
    fzn = _clamp_fz(fz_n) / max(p["f_z_rated"], 1e-9)
    return _polyval(p["k_x_2"], p["k_x_1"], p["k_x_0"], fzn)


def mu_belt(p: dict[str, float], axis: str = "y") -> float:
    """台架**带面**峰值摩擦（零滑移速度端）μ_0。axis: "x" 纵向 / "y" 侧向。"""
    return float(p["mu_0_x"] if axis == "x" else p["mu_0_y"])


def mu_road(p: dict[str, float], axis: str = "y") -> float:
    """**路面**峰值摩擦先验 = 带面 μ × 2/3。⚠ 先验值，非本车验证。"""
    return mu_belt(p, axis) * ROAD_BELT_RATIO


def kappa_peak(fz_n: float, p: dict[str, float], *, road: bool = True,
               axis: str = "x") -> float:
    """峰值滑移率 κ_pk = μ·Fz / Cκ（线性支跑到附着上限的滑移率）。

    `road=True` 用 ×2/3 的路面先验 μ，否则用台架带面 μ（数值会大 1.5 倍）。
    """
    fz = _clamp_fz(fz_n)
    ck = ck_n_per_unit_kappa(fz, p)
    if ck <= 0.0 or fz <= 0.0:
        return 0.0
    mu = mu_road(p, axis) if road else mu_belt(p, axis)
    return mu * fz / ck


def compare_with_magic_formula(fz_n: float, p: dict[str, float], *,
                               Fy0: float, By: float, Cy: float,
                               FzNom: float = 3500.0, LS: float = 0.0,
                               FzRef: float | None = None) -> dict[str, float]:
    """把 TTC 的 Cα 与 LABSUS 现有 Magic Formula 口径的 Cα 对照。

    LABSUS 侧：`D = load_d(fz, ...)`（`tire_mf.load_d`），MF 小滑移侧偏刚度
    `Cα = B·C·D`（标准 MF：`Fy = D·sin(C·atan(B·α))`，α→0 时导数 = B·C·D）。
    """
    from src.tire_mf import load_d  # 延迟导入：避免与 tire_mf 形成导入环

    d = load_d(fz_n, Fy0=Fy0, FzNom=FzNom, LS=LS, FzRef=FzRef)
    ca_mf = By * Cy * d
    ca_ttc = ca_n_per_rad(fz_n, p)
    return {
        "fz_n": fz_n,
        "ca_ttc_n_per_rad": ca_ttc,
        "ca_mf_n_per_rad": ca_mf,
        "ratio_ttc_over_mf": (ca_ttc / ca_mf) if ca_mf > 0.0 else float("nan"),
        "ca_ttc_per_n": (ca_ttc / fz_n) if fz_n > 0.0 else float("nan"),
    }


@lru_cache(maxsize=1)
def reference_report() -> dict[str, float]:
    """FSAE 工况下的参考汇总（供文档/测试引用，避免各处重复推导）。"""
    p = load_ttc_params()
    out: dict[str, float] = {
        "f_z_rated_n": p["f_z_rated"],
        "mu_belt_y": mu_belt(p),
        "mu_road_y": mu_road(p),
        "ca_at_rated_n_per_rad": ca_n_per_rad(p["f_z_rated"], p),
        "ck_at_rated_n_per_unit_kappa": ck_n_per_unit_kappa(p["f_z_rated"], p),
        "kappa_peak_rated_road": kappa_peak(p["f_z_rated"], p, road=True),
        "kappa_peak_rated_belt": kappa_peak(p["f_z_rated"], p, road=False),
    }
    for name, fz in (("front", FSAE_FRONT_CORNER_N), ("rear", FSAE_REAR_CORNER_N)):
        out[f"ca_fsae_{name}_n_per_rad"] = ca_n_per_rad(fz, p)
        out[f"ck_fsae_{name}_n_per_unit_kappa"] = ck_n_per_unit_kappa(fz, p)
        out[f"kappa_peak_fsae_{name}_road"] = kappa_peak(fz, p, road=True)
    return out
