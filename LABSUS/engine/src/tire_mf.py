"""Pacejka 魔术公式子集（S1）：Fy(α,Fz)、Fx(κ,Fz)、Mz(α,Fz)，.tir 风格参数映射。

S1 降阶：无复合滑移、无压力/温度项；摩擦圆（F_avail = μ(Fz)·Fz）作为
无 MF 参数时的回退检查（沿用 V1 设计 §8.3）。
"""
import math

import numpy as np


def _load_d(d: dict[str, float]) -> dict[str, float]:
    return {k: float(v) for k, v in d.items()}


def load_tir_params(src: dict) -> dict[str, float]:
    """tir 风格映射：B/C/E → By/Cy/Ey；Fy0 → D。按需扩展键。

    G24：回退缺省与 v3models.TireParams 保持同源（真实 GT3 光头胎量级，
    μ=5250/3500=1.50、By=20 ⇒ 峰值侧偏角 8.27°）。旧回退 8000/9.0 是占位值，
    见 v3models.TireParams 文档。"""
    p = _load_d(src)
    return {
        "Fy0": p.get("Fy0", 5250.0), "By": p.get("By", p.get("B", 20.0)),
        "Cy": p.get("Cy", p.get("C", 1.2)), "Ey": p.get("Ey", p.get("E", -0.5)),
        "Sv": p.get("Sv", 0.0), "Sh": p.get("Sh", 0.0),
        "FzNom": p.get("FzNom", 3500.0),
        "LS": p.get("LS", 0.0),
    }


def load_d(fz: float, *, Fy0: float, FzNom: float = 3500.0, LS: float = 0.0) -> float:
    """峰值尺度 D(Fz) —— **全工程唯一实现**（LS>0 时施加 Jensen 载荷敏感性）。

    D = Fy0·(Fz/FzNom)·max(0.1, 1 − LS·(Fz/FzNom − 1))，LS=0 退化为线性基线。
    M5（2026-09-20）单源化：此前该式在 `evaluate_magic_formula_fy`、
    `MagicFormulaSub._d`、`api/chassis.py::_ca_mf` 三处各写一遍。
    """
    if fz <= 0:
        return 0.0
    r = fz / FzNom
    d = Fy0 * r
    if LS:
        d *= max(0.1, 1.0 - LS * (r - 1.0))
    return float(d)


def cornering_stiffness(
    fz: float,
    *,
    Fy0: float,
    By: float,
    Cy: float,
    FzNom: float = 3500.0,
    LS: float = 0.0,
    axle_scale: float = 1.0,
) -> float:
    """侧偏刚度 Cα = dFy/dα|α=0（N/rad）= axle_scale · By · Cy · D(Fz)。

    **全工程唯一实现**：MF 参数入口 `MagicFormulaSub.cornering_stiffness` 与
    整车 US 梯度入口 `api/chassis.py` 都委托本函数（M5 单源化，此前两份拷贝）。

    `axle_scale` = 按胎宽配平的轴系数 k = W_axle / mean(W_f, W_r)（M5 B3）：
    只放大**刚度因子**，不动峰值 D（μ·Fz 与胎宽基本无关）⇒ 不影响轮胎量级
    标定（μ=1.50 / 峰值侧偏角 8.27°）。等宽或缺字段时 k≡1。
    """
    return float(axle_scale * By * Cy * load_d(fz, Fy0=Fy0, FzNom=FzNom, LS=LS))


def evaluate_magic_formula_fy(
    a_rad: np.ndarray | float,
    fz: float,
    Fy0: float,
    By: float,
    Cy: float,
    Ey: float,
    LS: float = 0.0,
    FzNom: float = 3500.0,
    Sh: float = 0.0,
    Sv: float = 0.0,
) -> np.ndarray:
    """Core Pacejka Magic Formula lateral force calculation in radians."""
    a = np.asarray(a_rad, float) + Sh
    if fz <= 0:
        return np.zeros_like(a)
    d = load_d(fz, Fy0=Fy0, FzNom=FzNom, LS=LS)
    x = By * a
    return d * np.sin(Cy * np.arctan(x - Ey * (x - np.arctan(x)))) + Sv


class MagicFormulaSub:
    def __init__(self, params: dict[str, float]):
        self.p = params

    def _d(self, fz: float) -> float:
        """峰值尺度 D(Fz)；实现在模块级 `load_d`（全工程唯一）。"""
        return load_d(fz, Fy0=self.p["Fy0"], FzNom=self.p["FzNom"],
                      LS=self.p.get("LS", 0.0))

    @property
    def mu(self) -> float:
        """摩擦圆预算（与 MF 标称峰值同源——修复 2026-08-22：不再独立硬编码 μ）。"""
        return self.p["Fy0"] / self.p["FzNom"]

    def fy_rad(self, a_rad, fz: float) -> np.ndarray:
        """侧偏角为弧度时的横向力计算（辨识与底层求解器同源入口）。"""
        return evaluate_magic_formula_fy(
            a_rad, fz,
            Fy0=self.p["Fy0"],
            By=self.p["By"],
            Cy=self.p["Cy"],
            Ey=self.p["Ey"],
            LS=self.p.get("LS", 0.0),
            FzNom=self.p.get("FzNom", 3500.0),
            Sh=self.p.get("Sh", 0.0),
            Sv=self.p.get("Sv", 0.0),
        )

    def fy(self, alpha_deg, fz: float) -> np.ndarray:
        return self.fy_rad(np.asarray(alpha_deg, float) * (math.pi / 180.0), fz)

    def cornering_stiffness(self, fz: float, axle_scale: float = 1.0) -> float:
        """侧偏刚度 Cα = dFy/dα @α=0（N/rad）：线性区斜率 = axle_scale·B·C·D(Fz)。

        含载荷敏感性（LS）——重载下 Cα 递增但次线性，是载荷转移损失轴总
        抓地力与稳态不足转向梯度的轮胎侧根基（讲义 EP08/EP10）。
        实现在模块级 `cornering_stiffness`（全工程唯一，chassis 的 US 梯度
        走同一函数）；`axle_scale` = 按胎宽配平的轴系数（见该函数文档）。
        """
        return cornering_stiffness(fz, Fy0=self.p["Fy0"], By=self.p["By"],
                                   Cy=self.p["Cy"], FzNom=self.p["FzNom"],
                                   LS=self.p.get("LS", 0.0), axle_scale=axle_scale)

    def fx(self, kappa, fz: float) -> np.ndarray:
        k = np.asarray(kappa, float)
        b, c, e = self.p["By"] * 1.2, self.p["Cy"], self.p["Ey"]
        x = b * k
        return self._d(fz) * np.sin(c * np.arctan(x - e * (x - np.arctan(x))))

    def mz(self, alpha_deg, fz: float, trail_mm: float = 60.0) -> np.ndarray:
        """MZ = Fy × 简化拖距（P5 参数化；默认 60mm 保持历史 APPROXIMATE 语义）。

        trail_mm：简化气动拖距（mm）。仍为单点近似 —— 无 Mz 峰值/形变耦合，
        标注 APPROXIMATE；调用方应显式传入真实值以撤除占位。
        """
        return self.fy(alpha_deg, fz) * (trail_mm / 1000.0)
