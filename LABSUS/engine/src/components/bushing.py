"""6DOF 橡胶衬套元件：逐自由度刚度/阻尼曲线 + 耦合项 + 预紧（S1 首批线性/查表/样条）。

使用状态（2026-08-22 登记）：S1 K&C 主路径仅使用平移刚度（kT）+ 预紧；
cT/cR 阻尼为存储占位（静态求解不使用）；coupled 6x6 耦合矩阵虽在
bush_force / bush_force_jac 中完整生效，但尚未有工况向求解器注入非零
耦合项（compliance.solve_compliance 的 S1 外载仅平移 3 分量、旋转 DOF 无
外部力矩 —— 见 M5 注释）。耦合/阻尼/旋转力矩属于 S3+ 载荷阶段能力。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np
from scipy.interpolate import PchipInterpolator


@dataclass
class Curve:
    kind: str                       # "linear" | "table"（力-位移表）| "spline"
    k: float = 0.0                  # linear 刚度（N/mm 或 N·mm/rad）
    xs: list[float] = field(default_factory=list)
    ys: list[float] = field(default_factory=list)

    def build(self):
        if self.kind == "linear":
            return lambda x: self.k * x, lambda x: np.full_like(np.asarray(x, float), self.k)
        if self.kind in ("table", "spline"):
            x = np.asarray(self.xs, float); y = np.asarray(self.ys, float)
            if len(x) < 2:
                raise ValueError(f"table/spline curve requires >=2 points, got {len(x)}")
            lo, hi = float(x[0]), float(x[-1])
            p = PchipInterpolator(x, y)
            def _f(v): return p(np.clip(np.asarray(v, float), lo, hi))
            def _d(v): return p.derivative()(np.clip(np.asarray(v, float), lo, hi))
            return _f, _d
        raise ValueError(f"unknown curve kind {self.kind}")


@dataclass
class Bushing6DOF:
    name: str
    anchor: np.ndarray              # 车身侧锚点（3,）——部件侧 = anchor + 位移分量 + 小角旋转
    kT: list[Curve]                 # 3 个平移刚度
    kR: list[Curve]                 # 3 个旋转刚度
    cT: list[float]                 # 3 个平移阻尼（速度相关项，S1 存储占位）
    cR: list[float]
    preload: np.ndarray             # 6 预紧力/矩
    coupled: np.ndarray | None = None  # 6x6 耦合刚度（可选）
    member_nodes: list[str] = field(default_factory=list)            # 装配期：{衬套名: 节点名} 由求解器填入
    member_p0: dict[str, np.ndarray] = field(default_factory=dict)   # {节点名: 设计位置}

    def __post_init__(self):
        if len(self.kT) != 3:
            raise ValueError(f"kT must have length 3, got {len(self.kT)}")
        if len(self.kR) != 3:
            raise ValueError(f"kR must have length 3, got {len(self.kR)}")
        preload = np.asarray(self.preload, float)
        if preload.shape != (6,):
            raise ValueError(f"preload must have shape (6,), got {preload.shape}")
        if self.coupled is not None:
            coupled = np.asarray(self.coupled, float)
            if coupled.shape != (6, 6):
                raise ValueError(f"coupled must have shape (6,6), got {coupled.shape}")
        self._fT = [c.build() for c in self.kT]
        self._fR = [c.build() for c in self.kR]


def bush_force(b: Bushing6DOF, delta: np.ndarray) -> np.ndarray:
    """delta = [dx,dy,dz, rx,ry,rz]（小角），返回 6 抗力（力 N / 力矩 N·mm）。"""
    d = np.asarray(delta, float)
    f = np.zeros(6)
    for i in range(3):
        f[i] = b._fT[i][0](d[i])
    for i in range(3):
        f[3 + i] = b._fR[i][0](d[3 + i])
    if b.coupled is not None:
        f = f + np.asarray(b.coupled, float) @ d
    return f + np.asarray(b.preload, float)


def bush_force_jac(b: Bushing6DOF, delta: np.ndarray) -> np.ndarray:
    """解析（含样条导数）：∂f/∂δ（6x6）。"""
    d = np.asarray(delta, float)
    J = np.zeros((6, 6))
    for i in range(3):
        J[i, i] = b._fT[i][1](d[i])
    for i in range(3):
        J[3 + i, 3 + i] = b._fR[i][1](d[3 + i])
    if b.coupled is not None:
        J = J + np.asarray(b.coupled, float)
    return J
