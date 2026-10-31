"""悬架模态交叉审计（T5-b / P9 接入，2026-10-20）

## 这个模块回答什么

LABSUS 的弹性元件是**逐角**口径（每角弹簧 + 横向稳定杆 ARB）。
四模式模态基（`suspension_modes`）是另一套口径。本模块把逐角刚度矩阵
`K` 变换到模态基 `K_m = T·K·T`，给出两个**可核对的数字**：

1. **等价模态刚度**（`K_m` 对角元）—— 该布置在各模式下实际有多硬；
2. **模式耦合**（`K_m` 非对角元）与非对角占对角的**耦合比**；
3. 由此派生：同一变形下"逐角全矩阵"与"只取模态对角"的**弹性能相对差**。

## 顺手算出来的硬结论（本模块的核心产出）

横向稳定杆的角刚度矩阵（同轴左右差）为 `a·[[1,−1],[−1,1]]`，`a = k_arb/(4t²)`。
把它变换到模态基，解析结果是：

    K_m[roll, roll]  = a_f + a_r
    K_m[warp, warp]  = a_f + a_r          ← **与 roll 恒相等**
    K_m[roll, warp]  = a_f − a_r          ← 前后不等时才有的耦合
    K_m[heave] = K_m[pitch] = 0           ← ARB 不抵抗沉浮/俯仰

⇒ **任何 ARB 组合都不可能做出 `k_roll ≠ k_warp`**：
    · 前后相等 ⇒ 模态基严格对角，但 roll = warp；
    · 前后不等 ⇒ 出现 roll↔warp 耦合，两个对角值**仍然相等**。
要独立调节 roll 与 warp 刚度，必须换拓扑（液压解耦 / 第三连杆）。
上游 `iem24_four_mode` 的 PROPOSED 值是 roll 80558 vs warp 35025（相差 2.3×），
**这个差异是任何 ARB 布置都做不到的** —— 与上游另有一份
`iem24_roll_decoupled_hydraulic` 布置相互印证。

## ⚠ 可信级别

本模块只做**代数审计**，不引入外部参数；所有参与量必须是调用方显式给出的
（逐角弹簧刚度、ARB 扭转刚度、半轮距）。上游仅作为"解耦 vs 未解耦"的对照案例。
"""

from __future__ import annotations

import math

import numpy as np

from src.components.suspension_modes import MODE_NAMES, TRANSFORM

CORNERS = ("FL", "FR", "RL", "RR")


class AuditInvalid(ValueError):
    """输入不合法。"""


def _check(name: str, v: float, *, allow_zero: bool = False) -> float:
    x = float(v)
    if not math.isfinite(x):
        raise AuditInvalid(f"{name} 非有限：{v}")
    if allow_zero:
        if x < 0.0:
            raise AuditInvalid(f"{name} 不得为负：{x}")
    elif x <= 0.0:
        raise AuditInvalid(f"{name} 必须为正：{x}")
    return x


def arb_corner_stiffness(k_front_nm_rad: float, k_rear_nm_rad: float,
                         half_track_front_m: float, half_track_rear_m: float) -> np.ndarray:
    """前后 ARB 的等价逐角刚度矩阵（4×4，[FL, FR, RL, RR]）。

    角刚度 `a = k_arb/(4t²)`：由能量 ½k_arb·φ²、φ=(z_i−z_j)/(2t) 反推。
    """
    kf = _check("k_front", k_front_nm_rad, allow_zero=True)
    kr = _check("k_rear", k_rear_nm_rad, allow_zero=True)
    tf = _check("half_track_front", half_track_front_m)
    tr = _check("half_track_rear", half_track_rear_m)
    K = np.zeros((4, 4), dtype=float)
    for (i, j, k, t) in ((0, 1, kf, tf), (2, 3, kr, tr)):
        a = k / (4.0 * t * t)
        K[i, i] += a
        K[j, j] += a
        K[i, j] -= a
        K[j, i] -= a
    return K


def per_corner_stiffness_matrix(corner_rates_n_m, *, arb_front_nm_rad: float = 0.0,
                                arb_rear_nm_rad: float = 0.0,
                                half_track_front_m: float = 0.62,
                                half_track_rear_m: float = 0.62) -> np.ndarray:
    """逐角弹簧（对角） + ARB 的合成刚度矩阵。"""
    r = np.asarray(corner_rates_n_m, dtype=float)
    if r.shape != (4,):
        raise AuditInvalid(f"需要 4 个逐角刚度（FL,FR,RL,RR），得到 shape={r.shape}")
    if not np.all(np.isfinite(r)) or np.any(r < 0.0):
        raise AuditInvalid("逐角刚度必须有限且非负")
    return np.diag(r) + arb_corner_stiffness(arb_front_nm_rad, arb_rear_nm_rad,
                                             half_track_front_m, half_track_rear_m)


def modal_audit(K: np.ndarray) -> dict:
    """把逐角刚度矩阵变换到模态基，回报对角/耦合/能量差。"""
    K = np.asarray(K, dtype=float)
    if K.shape != (4, 4):
        raise AuditInvalid(f"K 必须是 4×4，得到 {K.shape}")
    if not np.allclose(K, K.T, atol=1e-9 * max(1.0, float(np.max(np.abs(K))))):
        raise AuditInvalid("K 必须对称（刚度矩阵的物理约束）")
    Km = TRANSFORM @ K @ TRANSFORM
    diag = np.diag(Km)
    off = Km - np.diag(diag)
    scale = float(np.max(np.abs(diag))) or 1.0
    # 耦合比：非对角最大值 / 对角最大值（无因次，便于跨布置比较）
    coupling_ratio = float(np.max(np.abs(off)) / scale)
    # 能量差：同一变形下"全矩阵"vs"只取模态对角"的弹性能
    z = np.array([1.0, -0.6, 0.4, -1.2])          # 混入四个模式的代表性变形
    e_full = 0.5 * float(z @ K @ z)
    e_diag = 0.5 * float(np.sum(diag * (TRANSFORM @ z) ** 2))
    rel = abs(e_full - e_diag) / max(1e-12, abs(e_full))
    return {
        "modal_rates": {n: float(diag[i]) for i, n in enumerate(MODE_NAMES)},
        "coupling": off,
        "coupling_ratio": coupling_ratio,
        "energy_full": e_full,
        "energy_diagonal_only": e_diag,
        "energy_rel_diff": float(rel),
    }


def arb_modal_rates(k_front_nm_rad: float, k_rear_nm_rad: float,
                    half_track_front_m: float, half_track_rear_m: float) -> dict:
    """ARB 单独作用时的模态刚度（解析式，供测试与文档核对）。

    返回 roll/warp 对角值与 roll↔warp 耦合；heave/pitch 恒为 0。
    """
    kf = _check("k_front", k_front_nm_rad, allow_zero=True)
    kr = _check("k_rear", k_rear_nm_rad, allow_zero=True)
    tf = _check("half_track_front", half_track_front_m)
    tr = _check("half_track_rear", half_track_rear_m)
    a_f = kf / (4.0 * tf * tf)
    a_r = kr / (4.0 * tr * tr)
    return {
        "roll": a_f + a_r,
        "warp": a_f + a_r,
        "roll_warp_coupling": a_f - a_r,
        "heave": 0.0,
        "pitch": 0.0,
    }


def roll_warp_ratio_is_constrained(k_front_nm_rad: float, k_rear_nm_rad: float,
                                   half_track_front_m: float, half_track_rear_m: float) -> dict:
    """审计：给定 ARB 布置，roll/warp 刚度比**能取到多少**。

    结论恒为 1.0（见模块 docstring 的解析推导）—— 返回 dict 以便调用方断言/展示，
    而不是把"做不到"藏在注释里。
    """
    rates = arb_modal_rates(k_front_nm_rad, k_rear_nm_rad,
                            half_track_front_m, half_track_rear_m)
    roll, warp = rates["roll"], rates["warp"]
    return {
        "roll": roll,
        "warp": warp,
        "ratio": (roll / warp) if warp > 0.0 else float("nan"),
        "coupling": rates["roll_warp_coupling"],
        "can_decouple": False,   # ARB 拓扑的结构性限制，不是参数选择问题
    }
