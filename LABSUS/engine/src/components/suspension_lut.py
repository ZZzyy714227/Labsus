"""per-corner 悬架 LUT（T2，2026-10-20）

借外部仓库 `Simplified-Vehicle-Models` 总纲 §5「Suspension LUT requirements」的
schema 纪律，重写 LABSUS 的 K&C 查表。原文要点（翻译）：

  · 应该是一个**协调的 per-corner 数据集，主索引为 jounce**，而不是一堆互不相关的插值调用；
  · 必须区分三类输出：**几何输出** / **本构输出** / **元数据**（符号约定、零位定义、
    单位、有效区间、外插策略）；
  · 优化/求导需要有用导数 —— 原始分段线性表导数不连续 ⇒ 用**保形（C1 单调）样条**；
  · 超出物理行程**应由约束禁止**，而不是静默续延。

对照 LABSUS 现状（`transient._lut`）：
  · 只有 `toe` / `cam` 两个通道，靠 `np.interp` 分段线性；
  · **越界静默夹紧**（`np.interp` 的端点保持）—— 这正是被点出的问题；
  · 无元数据（零位/单位/有效区间/外插策略都没有）。
本模块是**增量层**：`transient.py` 通过请求字段 `kc_lut_spline` 显式启用；
关闭时仍走旧的 `_lut`，数值逐位不变。

⚠ 与旧实现的**唯一**数值差异：节点上完全相同，**节点之间**改为 C1 单调三次 Hermite。
差值上界由 `max_deviation_vs_piecewise` 实测给出（测试里断言并记录），不靠口头保证。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

# 三类输出的标签
KIND_GEOMETRIC = "geometric"        # 几何量：toe/cam/轮心位移/运动比/中心/抗几何
KIND_CONSTITUTIVE = "constitutive"  # 本构量：弹簧力/轮跳率/阻尼/惯量项
VALID_KINDS = (KIND_GEOMETRIC, KIND_CONSTITUTIVE)

# 外插策略（显式，默认拒绝）
POLICY_RAISE = "raise"
POLICY_CLAMP = "clamp"
VALID_POLICIES = (POLICY_RAISE, POLICY_CLAMP)


class LUTOutOfRange(ValueError):
    """jounce 超出表定义的有效区间（且策略为 raise）。"""


class LUTInvalidTable(ValueError):
    """表本身不合法（jounce 非严格递增 / 长度不匹配 / 非有限值）。"""


@dataclass(frozen=True)
class SuspensionCornerLUT:
    """一个角（corner）的悬架查表数据集，主索引 `travel_mm`（jounce）。"""

    travel_mm: tuple[float, ...]
    channels: dict[str, tuple[float, ...]]
    kinds: dict[str, str] = field(default_factory=dict)
    units: dict[str, str] = field(default_factory=dict)
    zero_travel_mm: float = 0.0
    extrapolation: Literal["raise", "clamp"] = POLICY_RAISE
    sign_convention: str = ("正值 = 压缩（jounce 向上）；toe/cam 沿用 v3 主线角度约定")

    # ── 派生量 ──────────────────────────────────────────────
    @property
    def travel_range_mm(self) -> tuple[float, float]:
        return (self.travel_mm[0], self.travel_mm[-1])

    def geometric_channels(self) -> tuple[str, ...]:
        return tuple(k for k in self.channels if self.kinds.get(k) == KIND_GEOMETRIC)

    def constitutive_channels(self) -> tuple[str, ...]:
        return tuple(k for k in self.channels if self.kinds.get(k) == KIND_CONSTITUTIVE)


def _validate(xs: np.ndarray, ys: np.ndarray, name: str) -> None:
    if xs.ndim != 1 or ys.ndim != 1:
        raise LUTInvalidTable(f"{name}: 必须是一维")
    if len(xs) != len(ys):
        raise LUTInvalidTable(f"{name}: 长度不匹配 {len(xs)} vs {len(ys)}")
    if len(xs) < 2:
        raise LUTInvalidTable(f"{name}: 至少 2 点")
    if not (np.all(np.isfinite(xs)) and np.all(np.isfinite(ys))):
        raise LUTInvalidTable(f"{name}: 含非有限值（nan/inf）")
    d = np.diff(xs)
    if np.any(d <= 0.0):
        raise LUTInvalidTable(f"{name}: travel 必须严格递增（发现 {d[d <= 0][:3]}）")


def monotone_cubic_slopes(xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Fritsch–Carlson 保形三次 Hermite 的节点斜率 m[k]。

    保证：插值在每段内**保持单调**（数据单调则结果单调），且一阶导数连续（C1）。
    这正是分段线性表缺的性质（导数在节点跳变）。
    """
    n = len(xs)
    h = np.diff(xs)
    d = np.diff(ys) / h                      # 割线斜率
    m = np.empty(n, dtype=float)
    if n == 2:
        m[:] = d[0]
        return m
    m[0] = d[0]                              # 端点用相邻割线（同样保单调）
    m[-1] = d[-1]
    m[1:-1] = 0.5 * (d[:-1] + d[1:])
    # Fritsch–Carlson 限幅：把 (m[k]/d[k], m[k+1]/d[k]) 限制在半径 3 的圆内
    for k in range(n - 1):
        if d[k] == 0.0:
            m[k] = 0.0
            m[k + 1] = 0.0
            continue
        a = m[k] / d[k]
        b = m[k + 1] / d[k]
        s = a * a + b * b
        if s > 9.0:
            t = 3.0 / math.sqrt(s)
            m[k] = t * a * d[k]
            m[k + 1] = t * b * d[k]
    return m


def build(travel_mm, geometric: dict[str, tuple[float, ...]] | None = None,
          constitutive: dict[str, tuple[float, ...]] | None = None, *,
          units: dict[str, str] | None = None, zero_travel_mm: float = 0.0,
          extrapolation: str = POLICY_RAISE) -> SuspensionCornerLUT:
    """构造数据集：几何/本构两类输出分开传入，元数据显式给出。"""
    xs = np.asarray(tuple(travel_mm), dtype=float)
    if extrapolation not in VALID_POLICIES:
        raise LUTInvalidTable(f"extrapolation 必须是 {VALID_POLICIES}，得到 {extrapolation!r}")
    channels: dict[str, tuple[float, ...]] = {}
    kinds: dict[str, str] = {}
    for kind, group in ((KIND_GEOMETRIC, geometric), (KIND_CONSTITUTIVE, constitutive)):
        if not group:
            continue
        for name, ys in group.items():
            arr = np.asarray(tuple(ys), dtype=float)
            _validate(xs, arr, name)
            channels[name] = tuple(float(v) for v in arr)
            kinds[name] = kind
    if not channels:
        raise LUTInvalidTable("至少需要一个通道")
    return SuspensionCornerLUT(
        travel_mm=tuple(float(v) for v in xs), channels=channels, kinds=kinds,
        units=dict(units or {}), zero_travel_mm=float(zero_travel_mm),
        extrapolation=extrapolation,  # type: ignore[arg-type]
    )


def from_kc_lut(axis: str, lut: dict) -> SuspensionCornerLUT:
    """把 LABSUS 现有的 `kc_luts[axis] = {"travel":[...], "toe":[...], "cam":[...]}`
    适配成新 schema。`toe`/`cam` 归为**几何输出**（角度），单位 deg。"""
    if not lut or "travel" not in lut:
        raise LUTInvalidTable(f"{axis}: 缺少 travel 索引")
    travel = tuple(float(v) for v in lut["travel"])
    geo, units = {}, {}
    for name in ("toe", "cam"):
        if name in lut:
            geo[name] = tuple(float(v) for v in lut[name])
            units[name] = "deg"
    if not geo:
        raise LUTInvalidTable(f"{axis}: 既无 toe 也无 cam 通道")
    ds = build(travel, geometric=geo, units=units)
    return SuspensionCornerLUT(
        travel_mm=ds.travel_mm, channels=ds.channels, kinds=ds.kinds, units=ds.units,
        zero_travel_mm=0.0, extrapolation=POLICY_RAISE,
        sign_convention=("正值 = 压缩（jounce 向上）；toe/cam 沿用 v3 主线角度约定"),
    )


def evaluate(ds: SuspensionCornerLUT, name: str, travel_mm: float) -> float:
    """按 C1 单调样条求值。越界策略见 `ds.extrapolation`：raise 或 clamp。"""
    if name not in ds.channels:
        raise KeyError(f"通道不存在：{name}（有 {sorted(ds.channels)}）")
    t = float(travel_mm)
    if not math.isfinite(t):
        raise LUTOutOfRange(f"travel 非有限：{travel_mm!r}")
    xs = np.asarray(ds.travel_mm, dtype=float)
    ys = np.asarray(ds.channels[name], dtype=float)
    lo, hi = xs[0], xs[-1]
    if t < lo or t > hi:
        if ds.extrapolation == POLICY_CLAMP:
            t = min(max(t, lo), hi)
        else:
            raise LUTOutOfRange(
                f"{name}: travel={travel_mm} 超出有效区间 [{lo}, {hi}] mm"
                f"（策略 raise；若确需夹紧请在构造时显式给 extrapolation='clamp'）")
    if t == hi:
        return float(ys[-1])
    k = int(np.searchsorted(xs, t, side="right") - 1)
    k = min(max(k, 0), len(xs) - 2)
    h = xs[k + 1] - xs[k]
    u = (t - xs[k]) / h
    m = monotone_cubic_slopes(xs, ys)
    h00 = 2 * u**3 - 3 * u**2 + 1
    h10 = u**3 - 2 * u**2 + u
    h01 = -2 * u**3 + 3 * u**2
    h11 = u**3 - u**2
    return float(h00 * ys[k] + h10 * h * m[k] + h01 * ys[k + 1] + h11 * h * m[k + 1])


def derivative(ds: SuspensionCornerLUT, name: str, travel_mm: float) -> float:
    """一阶导数（C1 保证它在节点双侧一致）。供优化/灵敏度分析用。"""
    xs = np.asarray(ds.travel_mm, dtype=float)
    ys = np.asarray(ds.channels[name], dtype=float)
    lo, hi = xs[0], xs[-1]
    t = min(max(float(travel_mm), lo), hi)
    if t == hi:
        # 端点取右端斜率（保单调；与内部段右侧极限一致 ⇒ C1）
        return float(monotone_cubic_slopes(xs, ys)[-1])
    k = int(np.searchsorted(xs, t, side="right") - 1)
    k = min(max(k, 0), len(xs) - 2)
    h = xs[k + 1] - xs[k]
    u = (t - xs[k]) / h
    m = monotone_cubic_slopes(xs, ys)
    d00 = (6 * u**2 - 6 * u) / h
    d10 = 3 * u**2 - 4 * u + 1
    d01 = (-6 * u**2 + 6 * u) / h
    d11 = 3 * u**2 - 2 * u
    return float(d00 * ys[k] + d10 * m[k] + d01 * ys[k + 1] + d11 * m[k + 1])


def max_deviation_vs_piecewise(ds: SuspensionCornerLUT, name: str, samples: int = 200) -> float:
    """与旧 `np.interp` 分段线性的最大绝对偏差（节点之间）。

    用途：把"我们换了插值方式"这件事变成可复核的**数字**，而不是"更平滑"这种形容词。
    """
    xs = np.asarray(ds.travel_mm, dtype=float)
    ys = np.asarray(ds.channels[name], dtype=float)
    grid = np.linspace(xs[0], xs[-1], samples)
    dev = 0.0
    for t in grid:
        dev = max(dev, abs(evaluate(ds, name, float(t)) - float(np.interp(t, xs, ys))))
    return float(dev)
