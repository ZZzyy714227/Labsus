"""Pacejka 魔术公式子集（S1）：Fy(α,Fz)、Fx(κ,Fz)、Mz(α,Fz)，.tir 风格参数映射。

S1 降阶：无复合滑移、无压力/温度项；摩擦圆（F_avail = μ(Fz)·Fz）作为
无 MF 参数时的回退检查（沿用 V1 设计 §8.3）。
"""
import math

import numpy as np


def _load_d(d: dict[str, float]) -> dict[str, float]:
    """数值字段归一为 float。

    M8：跳过 None（`FzRef` 的缺省语义是"未指定"，不是 0）——旧实现对全字典
    无差别 float() 强转，一旦有可空字段就 `TypeError: float() argument must be
    ... not 'NoneType'`（实测打挂 7 个 transient 用例）。"""
    return {k: float(v) for k, v in d.items() if v is not None}


def load_tir_params(src: dict) -> dict[str, float]:
    """tir 风格映射：B/C/E → By/Cy/Ey；Fy0 → D。按需扩展键。

    G24：回退缺省与 v3models.TireParams 保持同源（真实 GT3 光头胎量级，
    μ=5250/3500=1.50、By=20 ⇒ 峰值侧偏角 8.27°）。旧回退 8000/9.0 是占位值，
    见 v3models.TireParams 文档。"""
    p = _load_d(src)
    # M8：FzRef 需保留"未指定"语义 ⇒ 不走 _load_d 的数值归一，单独校验。
    _ref = src.get("FzRef")
    _fzref = float(_ref) if isinstance(_ref, (int, float)) and not isinstance(_ref, bool) and _ref > 0 else None
    return {
        "Fy0": p.get("Fy0", 5250.0), "By": p.get("By", p.get("B", 20.0)),
        "Cy": p.get("Cy", p.get("C", 1.2)), "Ey": p.get("Ey", p.get("E", -0.5)),
        "Sv": p.get("Sv", 0.0), "Sh": p.get("Sh", 0.0),
        "FzNom": p.get("FzNom", 3500.0),
        "LS": p.get("LS", 0.0),
        # M8：载荷敏感性参考载荷。缺省 None ⇒ 退化为 FzNom（旧口径逐位不变）。
        "FzRef": _fzref,
    }


def load_d(fz: float, *, Fy0: float, FzNom: float = 3500.0, LS: float = 0.0,
           FzRef: float | None = None) -> float:
    """峰值尺度 D(Fz) —— **全工程唯一实现**（LS>0 时施加 Jensen 载荷敏感性）。

    D = Fy0·(Fz/FzNom)·max(0.1, 1 − LS·(Fz/FzRef − 1))，LS=0 退化为线性基线。
    M5（2026-09-20）单源化：此前该式在 `evaluate_magic_formula_fy`、
    `MagicFormulaSub._d`、`api/chassis.py::_ca_mf` 三处各写一遍。

    M8（2026-09-20）**参考载荷分离**：`FzNom` 是**量级**参考（μ_nom = Fy0/FzNom，
    保持 M5/G24 标定不变），`FzRef` 是**载荷敏感性**参考（"μ 每翻倍降 LS"这句话
    所相对的那个工作点）。旧实现把两者混为一谈，一律用 FzNom=3500（GT3 级），
    而 FSAE 实际轮载约 580 N ⇒ 敏感度被稀释约 6 倍：实测 ±100 N 载荷摆动下
    轴容量只损失 **0.037%**，于是滚转刚度 470→3351 N·m/°、TLLTD 45%→75% 的巨大
    变化只能撬动 US +0.016 °/g——载荷转移类杠杆（ARB / 弹簧刚度 / 配重）几乎失效。
    传入真实静载作 FzRef 后，同一处实测杠杆达 +0.09 °/g。
    `FzRef=None`（缺省）退化为旧的 FzNom 口径，历史调用逐位不变。
    """
    if fz <= 0:
        return 0.0
    d = Fy0 * (fz / FzNom)
    if LS:
        ref = FzRef if (FzRef is not None and FzRef > 0) else FzNom
        d *= max(0.1, 1.0 - LS * (fz / ref - 1.0))
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
    FzRef: float | None = None,
) -> float:
    """侧偏刚度 Cα = dFy/dα|α=0（N/rad）= axle_scale · By · Cy · D(Fz)。

    **全工程唯一实现**：MF 参数入口 `MagicFormulaSub.cornering_stiffness` 与
    整车 US 梯度入口 `api/chassis.py` 都委托本函数（M5 单源化，此前两份拷贝）。

    `axle_scale` = 按胎宽配平的轴系数 k = W_axle / mean(W_f, W_r)（M5 B3）：
    只放大**刚度因子**，不动峰值 D（μ·Fz 与胎宽基本无关）⇒ 不影响轮胎量级
    标定（μ=1.50 / 峰值侧偏角 8.27°）。等宽或缺字段时 k≡1。

    `FzRef` = 载荷敏感性参考载荷（M8，见 `load_d`）；缺省退化为 FzNom。
    """
    return float(axle_scale * By * Cy
                 * load_d(fz, Fy0=Fy0, FzNom=FzNom, LS=LS, FzRef=FzRef))


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
    FzRef: float | None = None,
) -> np.ndarray:
    """Core Pacejka Magic Formula lateral force calculation in radians."""
    a = np.asarray(a_rad, float) + Sh
    if fz <= 0:
        return np.zeros_like(a)
    d = load_d(fz, Fy0=Fy0, FzNom=FzNom, LS=LS, FzRef=FzRef)
    x = By * a
    return d * np.sin(Cy * np.arctan(x - Ey * (x - np.arctan(x)))) + Sv


class MagicFormulaSub:
    def __init__(self, params: dict[str, float]):
        self.p = params

    def _d(self, fz: float) -> float:
        """峰值尺度 D(Fz)；实现在模块级 `load_d`（全工程唯一）。

        M8：`FzRef` 随参数走（轮胎级设定）——由 `load_tir_params` 从 .tir/请求
        原样带入，缺省 None ⇒ 旧 FzNom 口径。
        """
        return load_d(fz, Fy0=self.p["Fy0"], FzNom=self.p["FzNom"],
                      LS=self.p.get("LS", 0.0), FzRef=self.p.get("FzRef"))

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
            FzRef=self.p.get("FzRef"),
        )

    def fy(self, alpha_deg, fz: float) -> np.ndarray:
        return self.fy_rad(np.asarray(alpha_deg, float) * (math.pi / 180.0), fz)

    def cornering_stiffness(self, fz: float, axle_scale: float = 1.0) -> float:
        """侧偏刚度 Cα = dFy/dα @α=0（N/rad）：线性区斜率 = axle_scale·B·C·D(Fz)。

        含载荷敏感性（LS）——重载下 Cα 递增但次线性，是载荷转移损失轴总
        抓地力与稳态不足转向梯度的轮胎侧根基（讲义 EP08/EP10）。
        实现在模块级 `cornering_stiffness`（全工程唯一，chassis 的 US 梯度
        走同一函数）；`axle_scale` = 按胎宽配平的轴系数（见该函数文档）；
        `FzRef` = 载荷敏感性参考载荷（M8，见 `load_d`）。"""
        return cornering_stiffness(fz, Fy0=self.p["Fy0"], By=self.p["By"],
                                   Cy=self.p["Cy"], FzNom=self.p["FzNom"],
                                   LS=self.p.get("LS", 0.0), axle_scale=axle_scale,
                                   FzRef=self.p.get("FzRef"))

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
