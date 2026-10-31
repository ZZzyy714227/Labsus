"""减振器四象限表（T3 / P4，2026-10-20）

## 为什么补这块

LABSUS 此前**没有任何阻尼力**：瞬态求解器里完全没有阻尼项，前端
`04-dynamics.js` 只算弹簧力 `Fk = springF0 + kS·(L0 − L)`。
这就是登记在案的 **P4（阻尼注入）** 债。

## 数据与形式来源

数据：`engine/data/dampers/multimatic_dssv_vc01_front.csv`
（Multimatic DSSV VC01 实车减振器台架数据，外部仓库 `Simplified-Vehicle-Models`
的 CI 夹具，逐字节 vendored，见文件头溯源）。

形式：**从上游实现核对**（`suspension/damper_table.py`），不是猜的：

    · 压缩（v ≥ 0）与复原（v < 0）**各有自己的速度轴**，分别插值；
    · 沿速度用**单调样条**（保形三次 Hermite），沿档位用**多线性**（相邻整数档线性混合）；
    · 表外用**端点斜率做线性外推**，并置 `out_of_range` 标志；
    · 契约：**零速度必须零力**（每个档位）。
    · 符号：正速度 = 压缩、正力；负速度 = 复原、负力。

## ⚠ 数据缺陷（保留，不静默修）

上游夹具自述：click 8 @ +300 mm/s = **671 N**，而 click 7 = 725 N、click 9 = 799 N
⇒ 与"档位越大越硬"矛盾，原意应为 761 N。
本模块**原样保留**并提供 `KNOWN_DEFECTS` 常量 + 测试断言锁住它：
任何人若"顺手修正"，测试会红，从而必须把它作为一次登记的改动来做。
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from src.components.suspension_lut import monotone_cubic_slopes

DATA = Path(__file__).resolve().parents[2] / "data" / "dampers" / "multimatic_dssv_vc01_front.csv"

# 上游自述的数据缺陷（click, velocity_mm_s, 实测值, 应有值）—— 测试会断言它仍然存在
KNOWN_DEFECTS: tuple[tuple[int, float, float, float], ...] = (
    (8, 300.0, 671.0, 761.0),
)


class DamperTableInvalid(ValueError):
    """表本身不合法。"""


@dataclass(frozen=True)
class DamperHalf:
    """一个半区（压缩或复原）：一个速度轴 + 每个档位一行力。"""

    velocity_m_s: tuple[float, ...]          # 严格递增
    forces_n: tuple[tuple[float, ...], ...]  # (档位数, 速度点数)

    @property
    def n_clicks(self) -> int:
        return len(self.forces_n)

    def _validate(self, name: str) -> None:
        v = np.asarray(self.velocity_m_s, dtype=float)
        f = np.asarray(self.forces_n, dtype=float)
        if v.ndim != 1 or v.size < 2:
            raise DamperTableInvalid(f"{name}: 速度轴至少 2 点")
        if not np.all(np.isfinite(v)) or not np.all(np.isfinite(f)):
            raise DamperTableInvalid(f"{name}: 含非有限值")
        if np.any(np.diff(v) <= 0.0):
            raise DamperTableInvalid(f"{name}: 速度轴必须严格递增")
        if f.ndim != 2 or f.shape[1] != v.size:
            raise DamperTableInvalid(
                f"{name}: 力的形状 {f.shape} 与速度轴 {v.size} 不匹配")
        if self.n_clicks < 1:
            raise DamperTableInvalid(f"{name}: 至少一个档位")
        # 契约：零速度零力（上游同款约束）
        zero = np.where(np.isclose(v, 0.0, atol=1e-12))[0]
        if zero.size:
            if np.any(np.abs(f[:, zero[0]]) > 1e-9):
                raise DamperTableInvalid(
                    f"{name}: 零速度处力必须为 0（实测 max|F|={np.abs(f[:, zero[0]]).max():.3f} N）")

    def _splines(self) -> tuple[np.ndarray, np.ndarray]:
        v = np.asarray(self.velocity_m_s, dtype=float)
        f = np.asarray(self.forces_n, dtype=float)
        slopes = np.vstack([monotone_cubic_slopes(v, f[i]) for i in range(f.shape[0])])
        return f, slopes

    def _at(self, q: np.ndarray, click: float) -> tuple[np.ndarray, np.ndarray]:
        """沿速度求力与斜率（多线性混合相邻档位）。q 必须已在轴内。"""
        f, m = self._splines()
        v = np.asarray(self.velocity_m_s, dtype=float)
        lo = min(int(np.floor(click)), self.n_clicks - 1)
        frac = click - lo
        if frac <= 0.0 or lo + 1 >= self.n_clicks:
            idx = [(lo, 1.0)]
        else:
            idx = [(lo, 1.0 - frac), (lo + 1, frac)]
        force = np.zeros_like(q)
        slope = np.zeros_like(q)
        for k, w in idx:
            force = force + w * _hermite_value(v, f[k], m[k], q)
            slope = slope + w * _hermite_slope(v, f[k], m[k], q)
        return force, slope


def _hermite_value(x: np.ndarray, y: np.ndarray, m: np.ndarray, q: np.ndarray) -> np.ndarray:
    q = np.asarray(q, dtype=float)
    k = np.clip(np.searchsorted(x, q, side="right") - 1, 0, x.size - 2)
    h = x[k + 1] - x[k]
    u = (q - x[k]) / h
    return ((2 * u**3 - 3 * u**2 + 1) * y[k] + (u**3 - 2 * u**2 + u) * h * m[k]
            + (-2 * u**3 + 3 * u**2) * y[k + 1] + (u**3 - u**2) * h * m[k + 1])


def _hermite_slope(x: np.ndarray, y: np.ndarray, m: np.ndarray, q: np.ndarray) -> np.ndarray:
    q = np.asarray(q, dtype=float)
    k = np.clip(np.searchsorted(x, q, side="right") - 1, 0, x.size - 2)
    h = x[k + 1] - x[k]
    u = (q - x[k]) / h
    return ((6 * u**2 - 6 * u) / h * y[k] + (3 * u**2 - 4 * u + 1) * m[k]
            + (-6 * u**2 + 6 * u) / h * y[k + 1] + (3 * u**2 - 2 * u) * m[k + 1])


@dataclass(frozen=True)
class DamperTable:
    """四象限表：压缩半区 + 复原半区。"""

    compression: DamperHalf
    rebound: DamperHalf
    source: str = "multimatic_dssv_vc01_front.csv"

    def __post_init__(self) -> None:
        self.compression._validate("compression")
        self.rebound._validate("rebound")
        # 半区方向校验：压缩力应 ≥ 0、复原力应 ≤ 0（允许 0）
        if np.min(np.asarray(self.compression.forces_n)) < -1e-9:
            raise DamperTableInvalid("compression 半区出现负力（符号约定错）")
        if np.max(np.asarray(self.rebound.forces_n)) > 1e-9:
            raise DamperTableInvalid("rebound 半区出现正力（符号约定错）")

    @property
    def click_range(self) -> tuple[int, int]:
        return (0, min(self.compression.n_clicks, self.rebound.n_clicks) - 1)


def force(table: DamperTable, velocity_m_s: float, *, click_c: float = 0.0,
          click_r: float = 0.0) -> tuple[float, float, bool]:
    """减振器力 [N]。返回 (力, 端点斜率, 是否越界外推)。

    表外按**端点斜率线性外推**并置越界标志（与上游一致）。
    """
    v = float(velocity_m_s)
    if not np.isfinite(v):
        raise DamperTableInvalid("速度必须有限")
    cr = table.click_range
    for name, c in (("click_c", click_c), ("click_r", click_r)):
        if not np.isfinite(c) or not (cr[0] <= c <= cr[1]):
            raise DamperTableInvalid(f"{name}={c} 超出 {cr}")
    half = table.compression if v >= 0.0 else table.rebound
    axis = np.asarray(half.velocity_m_s, dtype=float)
    lo, hi = axis[0], axis[-1]
    q = min(max(v, lo), hi)
    f, m = half._at(np.asarray([q]), click_c if v >= 0.0 else click_r)
    f0, m0 = float(f[0]), float(m[0])
    out = bool(v < q or v > q)   # 必须是 Python bool（numpy 标量会让 `is True` 失败）
    return (f0 + m0 * (v - q), m0, out)


def load_csv(path: str | Path | None = None) -> DamperTable:
    """读 vendored 的 CSV 夹具。速度列单位 mm/s → 内部转 m/s。"""
    p = Path(path) if path is not None else DATA
    if not p.exists():
        raise FileNotFoundError(f"减振器数据缺失：{p}（应随代码入库）")
    rows: list[tuple[int, list[float]]] = []
    axis: list[float] | None = None
    with p.open(encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            cells = next(csv.reader([s]))
            if axis is None:
                axis = [float(c) for c in cells[1:]]
            else:
                rows.append((int(cells[0]), [float(c) for c in cells[1:]]))
    if axis is None or not rows:
        raise DamperTableInvalid(f"{p.name}: 未找到表头或数据行")
    va = np.asarray(axis, dtype=float) / 1000.0
    comp_idx = np.where(va >= 0.0)[0]
    reb_idx = np.where(va < 0.0)[0]
    rows.sort(key=lambda r: r[0])
    comp = np.asarray([r[1] for r in rows], dtype=float)[:, comp_idx]
    reb = np.asarray([r[1] for r in rows], dtype=float)[:, reb_idx]

    def half(v: np.ndarray, f: np.ndarray) -> DamperHalf:
        return DamperHalf(velocity_m_s=tuple(float(x) for x in v),
                          forces_n=tuple(tuple(float(y) for y in row) for row in f))

    return DamperTable(compression=half(va[comp_idx], comp),
                       rebound=half(va[reb_idx], reb), source=p.name)
