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
    """球头受外力 ext（N），两杆在该点汇交：反解轴向力（2 未知，3 方程→最小二乘）。

    残差可由 ``_solve_linear(A, -ext)`` 单独调用获取；
    S1 集成路径（``corner_to_anchor_loads``）已在返回值中携带残差。
    """
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


def inner_anchor_force(links: list[LinkForce], i_node: np.ndarray, loads: list[np.ndarray]) -> np.ndarray:
    """车身内锚点合力：由各杆轴向力在锚点汇交求和 + 直接施加在锚点的外载。

    Args:
        links: 所有二力杆列表。
        i_node: 锚点坐标。
        loads: 直接施加在该锚点的外载荷列表（每个元素为 3-向量）。
    """
    f = np.zeros(3)
    for ext in loads:
        f = f + ext
    for l in links:
        if np.allclose(l.a, i_node) or np.allclose(l.b, i_node):
            f = f - l.mag * l.unit()
    return f


# ---------- 公开别名 ----------------------------------------------------------

solve_linear = _solve_linear
"""公开求解器入口；内部仍为 _solve_linear。"""

# ---------- T5: 接地点外载 → 锚点合力 -----------------------------------------


@dataclass
class QSLoad:
    """接地点准静态外载（N）：fx 纵向 / fy 侧向 / fz 垂向 + 三力矩（S1 力矩占位）。"""
    fx: float = 0.0
    fy: float = 0.0
    fz: float = 0.0
    mx: float = 0.0
    my: float = 0.0
    mz: float = 0.0

    def vector(self) -> np.ndarray:
        """返回 6-向量 [fx, fy, fz, mx, my, mz]。"""
        return np.array([self.fx, self.fy, self.fz, self.mx, self.my, self.mz], float)


@dataclass
class CornerLoadsResult:
    """角点静力结果。

    Attributes:
        anchor_loads: 键 = 杆 id（车身端），值 = 3-向合力（N）。
        residual: 超静定最小二乘残差（=0 时精确闭合）。
    """
    anchor_loads: dict[str, np.ndarray]
    residual: float


def _chassis_end(l: LinkForce, hub: np.ndarray) -> np.ndarray:
    """识别杆的车身端：距 hub_point 较远的一侧。"""
    da = float(np.linalg.norm(l.a - hub))
    db = float(np.linalg.norm(l.b - hub))
    return l.a if da > db else l.b


def corner_to_anchor_loads(
    q: QSLoad,
    links: list[LinkForce],
    hub_point: np.ndarray,
    cp_rel: np.ndarray,
) -> CornerLoadsResult:
    """接地点力 → 转向节静力平衡 → 各杆轴向力 → 车身内锚点合力。

    约定：
    - 杆件为二力杆（轴向拉压，mag > 0 拉伸）。
    - 球头 3 向反力平衡。
    - 超静定时取最小范数解（residual > 0 表示结果为 APPROXIMATE）。

    注意：本函数会覆写每根 LinkForce 的 ``mag`` 属性。
    调用方若需复用同一 LinkForce 实例跨角点，须自行 copy。

    Args:
        q: 接地点准静态外载荷（N）。
        links: 汇交于球头的二力杆列表。
        hub_point: 球头（轮心）坐标。
        cp_rel: 接地点相对轮心的矢量（由运动学姿态给出，S1 忽略力矩折算）。

    Returns:
        CornerLoadsResult：锚点合力字典 + 残差。
    """
    f_cp = np.array([q.fx, q.fy, q.fz], float)
    A = np.column_stack([l.unit() for l in links])
    m, resid = solve_linear(A, -f_cp)
    for i, l in enumerate(links):
        l.mag = float(m[i])
    out: dict[str, np.ndarray] = {}
    for l in links:
        end = _chassis_end(l, hub_point)
        key = l.id if l.id else f"{end[0]:.0f},{end[1]:.0f},{end[2]:.0f}"
        # 车身端反力 = -mag * unit（构件端在 hub 的反作用传递到车身）
        out[key] = out.get(key, np.zeros(3)) - l.mag * l.unit()
    return CornerLoadsResult(anchor_loads=out, residual=float(resid))
