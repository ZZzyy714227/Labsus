"""四模式模态悬架（T3-b / P9，2026-10-20）

## 为什么补这块

LABSUS 的弹性元件是**逐角**口径（每角一根弹簧 + 一根横向稳定杆）。
"互联悬架"（P9 债）指前后/左右通过液压或连杆耦合的布置，其数学描述通常用
**模态分解**：把四个轮跳 `z` 变换成 heave / roll / pitch / warp 四个模式，
每个模式配一个等效刚度（和阻尼），再变换回逐角力。

## 形式来源（**从上游实现核对，不是猜**）

`src/simplified_vehicle_models/suspension/layouts/four_mode.py` 的文档字符串给出：

    heave = (zFL + zFR + zRL + zRR) / 2
    roll  = (zFL - zFR + zRL - zRR) / 2
    pitch = (zFL + zFR - zRL - zRR) / 2
    warp  = (zFL - zFR - zRL + zRR) / 2

并注明 `T·Tᵀ = I`。**关键性质**（本模块的核心可验点）：

    · 该 4×4 矩阵除正交外还是**对称**的 ⇒ `Tᵀ = T`；
    · 于是一并得到 `T⁻¹ = Tᵀ = T` 且 `T² = I` —— **同一个矩阵同时做正变换与逆变换**；
    · 这使"可逆重构"成为可断言恒等式，而不是靠实现细节保证。

## ⚠ 参数可信级别

四个模式刚度（上游 `models/springs/iem24_fourmode_*.xml`）**全部是 PROPOSED（拟定值）**，
上游文档原文：*"The modal rates and mode dampers are PROPOSED values"*。
本模块原样保留并在 `FourModeSetup.provenance` 字段标注，**不得**当作实测值引用。

    heave = 70050.7340985905 N/m
    pitch = 70050.7340985905 N/m   （与 heave 相同）
    roll  = 80558.34421337908 N/m
    warp  = 35025.36704929525 N/m
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

CORNER_ORDER = ("FL", "FR", "RL", "RR")
MODE_NAMES = ("heave", "roll", "pitch", "warp")

# 变换矩阵（行 = 模式，列 = 角），归一化因子 1/2 使 T·Tᵀ = I
TRANSFORM = np.array([
    [1.0,  1.0,  1.0,  1.0],   # heave
    [1.0, -1.0,  1.0, -1.0],   # roll
    [1.0,  1.0, -1.0, -1.0],   # pitch
    [1.0, -1.0, -1.0,  1.0],   # warp
], dtype=float) / 2.0

# 上游 PROPOSED 值（N/m，逐"轮跳"口径）
UPSTREAM_PROPOSED_RATES = {
    "heave": 70050.7340985905,
    "roll": 80558.34421337908,
    "pitch": 70050.7340985905,
    "warp": 35025.36704929525,
}


class FourModeInvalid(ValueError):
    """输入或参数不合法。"""


@dataclass(frozen=True)
class FourModeSetup:
    """四模式布置：每个模式一个等效轮跳刚度。"""

    rates: dict[str, float]
    provenance: str = "PROPOSED（上游拟定值，未标定，不得当实测引用）"
    source: str = ("Simplified-Vehicle-Models models/springs/iem24_fourmode_*.xml")

    def __post_init__(self) -> None:
        if set(self.rates) != set(MODE_NAMES):
            raise FourModeInvalid(f"rates 必须恰好含 {MODE_NAMES}，得到 {sorted(self.rates)}")
        for k, v in self.rates.items():
            if not math.isfinite(v):
                raise FourModeInvalid(f"{k} 刚度非有限：{v}")
            if v <= 0.0:
                raise FourModeInvalid(f"{k} 刚度必须为正：{v}")

    @classmethod
    def upstream_proposed(cls) -> FourModeSetup:
        return cls(rates=dict(UPSTREAM_PROPOSED_RATES))

    def corner_stiffness_matrix(self) -> np.ndarray:
        """等价逐角刚度矩阵 K = T·diag(k)·T（对称正定）。"""
        k = np.array([self.rates[m] for m in MODE_NAMES], dtype=float)
        return TRANSFORM.T @ np.diag(k) @ TRANSFORM


def _as_z(z) -> np.ndarray:
    arr = np.asarray(z, dtype=float)
    if arr.shape != (4,):
        raise FourModeInvalid(f"需要 4 个轮跳（FL,FR,RL,RR），得到 shape={arr.shape}")
    if not np.all(np.isfinite(arr)):
        raise FourModeInvalid("轮跳含非有限值")
    return arr


def to_modes(z) -> dict[str, float]:
    """逐角轮跳 [m] → 四模式幅值 [m]。"""
    m = TRANSFORM @ _as_z(z)
    return {name: float(m[i]) for i, name in enumerate(MODE_NAMES)}


def from_modes(modes: dict[str, float]) -> dict[str, float]:
    """四模式幅值 [m] → 逐角轮跳 [m]（**同一矩阵**，因 T⁻¹ = T）。"""
    if set(modes) != set(MODE_NAMES):
        raise FourModeInvalid(f"需要 {MODE_NAMES}，得到 {sorted(modes)}")
    m = np.array([float(modes[n]) for n in MODE_NAMES], dtype=float)
    if not np.all(np.isfinite(m)):
        raise FourModeInvalid("模式幅值含非有限值")
    z = TRANSFORM @ m
    return {name: float(z[i]) for i, name in enumerate(CORNER_ORDER)}


def corner_forces(z, setup: FourModeSetup) -> dict[str, float]:
    """逐角轮跳 → 逐角弹簧力 [N]（模态刚度作用后变换回去）。"""
    m = TRANSFORM @ _as_z(z)
    k = np.array([setup.rates[n] for n in MODE_NAMES], dtype=float)
    f = TRANSFORM @ (k * m)
    return {name: float(f[i]) for i, name in enumerate(CORNER_ORDER)}


def modal_energy(z, setup: FourModeSetup) -> float:
    """弹性势能 [J] = ½·Σ k_m·mode_m²（与 ½·zᵀKz 等价，测试会交叉验证）。"""
    m = TRANSFORM @ _as_z(z)
    k = np.array([setup.rates[n] for n in MODE_NAMES], dtype=float)
    return float(0.5 * np.sum(k * m * m))


def roll_stiffness_nm_per_rad(setup: FourModeSetup, half_track_m: float) -> float:
    """由 roll 模式刚度换算整车侧倾刚度 [N·m/rad] = 4·k_roll·t²。

    推导：纯侧倾 φ 时 z=(+tφ,−tφ,+tφ,−tφ) ⇒ roll 模式 = 2tφ、其余为 0；
    能量 ½k_r(2tφ)² = ½·K_r·φ² ⇒ K_r = 4k_rt²。
    """
    if not (math.isfinite(half_track_m) and half_track_m > 0.0):
        raise FourModeInvalid(f"半轮距必须为正：{half_track_m}")
    return 4.0 * setup.rates["roll"] * half_track_m * half_track_m
