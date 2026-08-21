"""二力杆 + 球铰静力层（S1）：由接地点外载荷求解杆件轴向力与内点合力。

约定：杆件为二力杆（轴向拉压力）；球铰 3 向反力、不传纯力矩（沿用 V1 设计 §4.4）。
超静定时用最小范数最小二乘并在结果标注 APPROXIMATE（自重残差）。
"""
from dataclasses import dataclass
import numpy as np


@dataclass
class LinkForce:
    a: np.ndarray
    b: np.ndarray
    id: str
    mag: float = 0.0

    def unit(self) -> np.ndarray:
        d = self.b - self.a
        n = float(np.linalg.norm(d))
        return d / n if n > 1e-12 else np.zeros(3)


def _solve_linear(A: np.ndarray, rhs: np.ndarray) -> tuple[np.ndarray, float]:
    """求解 A m = rhs；超静定取最小范数解并返回残差范数。"""
    if A.shape[0] == A.shape[1]:
        try:
            m = np.linalg.solve(A, rhs)
            return m, float(np.linalg.norm(A @ m - rhs))
        except np.linalg.LinAlgError:
            pass
    m, *_ = np.linalg.lstsq(A, rhs, rcond=None)
    return m, float(np.linalg.norm(A @ m - rhs))


def force_balance_2lines(l1: LinkForce, l2: LinkForce, ext: np.ndarray) -> tuple[LinkForce, LinkForce]:
    """球头受外力 ext（N），两杆在该点汇交：反解轴向力（2 未知，3 方程→最小二乘）。"""
    A = np.column_stack([l1.unit(), l2.unit()])
    m, _ = _solve_linear(A, -np.asarray(ext, float))
    l1.mag, l2.mag = float(m[0]), float(m[1])
    return l1, l2


def ball_joint_reaction(links_in: list[LinkForce], hub_load: np.ndarray) -> np.ndarray:
    """转向节球铰处反力：外载荷（接地点力+力矩分配后的轮心力矩）+ 各杆轴向力合力。"""
    f = np.asarray(hub_load, float).copy()
    for l in links_in:
        f = f - l.mag * l.unit()
    return f


def inner_anchor_force(links: list[LinkForce], i_node: np.ndarray, loads: list[tuple[int, np.ndarray]]) -> np.ndarray:
    """车身内锚点合力：由各杆轴向力在锚点汇交求和 + 直接施加在锚点的外载。"""
    f = np.zeros(3)
    for idx, ext in loads:
        f = f + ext
    for l in links:
        if np.allclose(l.a, i_node) or np.allclose(l.b, i_node):
            f = f - l.mag * l.unit()
    return f
