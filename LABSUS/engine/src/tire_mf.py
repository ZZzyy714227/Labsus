"""Pacejka 魔术公式子集（S1）：Fy(α,Fz)、Fx(κ,Fz)、Mz(α,Fz)，.tir 风格参数映射。

S1 降阶：无复合滑移、无压力/温度项；摩擦圆（F_avail = μ(Fz)·Fz）作为
无 MF 参数时的回退检查（沿用 V1 设计 §8.3）。
"""
import numpy as np
import math


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


class MagicFormulaSub:
    def __init__(self, params: dict[str, float]):
        self.p = params

    def _d(self, fz: float) -> float:
        """峰值尺度 D(Fz)。LS>0 时施加载荷敏感性（重载 μ 递减，Jensen 效应）：
        D = Fy0·(Fz/FzNom)·(1 − LS·(Fz/FzNom − 1))，LS=0 保持线性基线。
        """
        if fz <= 0:
            return 0.0
        r = fz / self.p["FzNom"]
        d = self.p["Fy0"] * r
        ls = self.p.get("LS", 0.0)
        if ls:
            d *= max(0.1, 1.0 - ls * (r - 1.0))
        return d

    @property
    def mu(self) -> float:
        """摩擦圆预算（与 MF 标称峰值同源——修复 2026-08-22：不再独立硬编码 μ）。"""
        return self.p["Fy0"] / self.p["FzNom"]

    def fy(self, alpha_deg, fz: float) -> np.ndarray:
        a = np.asarray(alpha_deg, float) * math.pi / 180.0 + self.p["Sh"]
        b, c, e = self.p["By"], self.p["Cy"], self.p["Ey"]
        x = b * a
        y = self._d(fz) * np.sin(c * np.arctan(x - e * (x - np.arctan(x))))
        return y + self.p["Sv"]

    def cornering_stiffness(self, fz: float) -> float:
        """侧偏刚度 Cα = dFy/dα @α=0（N/rad）：线性区斜率 = B·C·D(Fz)。

        含载荷敏感性（LS）——重载下 Cα 递增但次线性，是载荷转移损失轴总
        抓地力与稳态不足转向梯度的轮胎侧根基（讲义 EP08/EP10）。
        """
        if fz <= 0:
            return 0.0
        return float(self.p["By"] * self.p["Cy"] * self._d(fz))

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
