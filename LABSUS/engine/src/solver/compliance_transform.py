"""小角刚体变换：衬套 6DOF 位移（3 平移 + 3 小角旋转）→ 部件侧锚点/成员簇的整体变换。

S1 采用小角线性化旋转矩阵（θ<5° 精度 1e-3 级；K&C 衬套工作区间通常 <2°）。
若未来需要大转角，升级为指数映射（Rodrigues），接口不变。
"""
import numpy as np

from src.components.bushing import Bushing6DOF


def small_rot_matrix(r: np.ndarray) -> np.ndarray:
    """从 3 分量小角 [rx, ry, rz] 构建 3×3 线性化旋转矩阵。"""
    rx, ry, rz = np.asarray(r, float)
    return np.array([
        [1.0, -rz, ry],
        [rz, 1.0, -rx],
        [-ry, rx, 1.0],
    ])


def transform_point(p: np.ndarray, t: np.ndarray, R: np.ndarray) -> np.ndarray:
    return R @ np.asarray(p, float) + np.asarray(t, float)


def apply_bushing_to_anchors(
    bushings: dict[str, Bushing6DOF],
    delta: dict[str, np.ndarray],
) -> dict[str, np.ndarray]:
    """把衬套位移写入部件侧锚点（相对车身锚点）。返回 {节点名: 新位置}。

    delta: {衬套名: [dx,dy,dz, rx,ry,rz]}。
    部件侧成员位置 p 变换:  p' = anchor + R·(p0 − anchor) + t

    若两衬套共享同一节点，后处理者覆盖前者——调用方须保证无共享节点或自行处理冲突。
    """
    out: dict[str, np.ndarray] = {}
    for name, b in bushings.items():
        if name not in delta:
            raise KeyError(
                f"apply_bushing_to_anchors: bushing '{name}' has no entry in delta dict"
            )
        d = np.asarray(delta[name], float)
        t = d[:3]
        R = small_rot_matrix(d[3:6])
        for node in b.member_nodes:
            if node not in b.member_p0:
                raise KeyError(
                    f"bushing '{b.name}': member_p0 missing node '{node}'"
                )
            p0 = np.asarray(b.member_p0[node], float)
            out[node] = transform_point(p0 - b.anchor, t, R) + b.anchor
    return out
