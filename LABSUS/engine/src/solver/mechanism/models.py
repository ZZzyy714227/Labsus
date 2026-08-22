"""DWB 式机构数据模型：节点 / 刚线 / 轴向旋转簇(铰链|摇臂) / 刚体簇 / 机构。

DOF 说明：双叉臂空间机构是超静定（overconstrained）空间连杆，不能靠
"3N − Σ约束"的秩加和得到正确自由度（会得到负数/误导值）。本处 `dof()`
定义为"传动自由度"= 轮跳 + 齿条转向 = 2（见 spec §5），其可实现性由
求解器收敛测试（solver 的 drive_to 在 ±30mm 与 ±rack 下 residual<1e-5）验证。
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

Vec = np.ndarray


@dataclass
class Node:
    id: str
    p0: Vec
    pos: Vec
    prev: Vec
    vel: Vec
    fix: bool  # 刚线/驱动不会移动车身点
    mass: float

    @property
    def inv_m(self) -> float:
        if self.fix:
            return 0.0
        return 1.0 / self.mass if self.mass > 0 else 1.0


@dataclass
class Link:
    id: str
    a: str
    b: str
    kind: str  # 'R' 刚线 / 'E' 弹性线(子阶段②用)
    L0: float
    Ld: float


@dataclass
class AxisCluster:
    kind: str            # 'hinge' | 'rocker'
    name: str
    anchor: str          # hinge=轴线上某车身点(取 axA)；rocker=枢轴节点
    members: list[str]
    rel: list[Vec]       # member.p0 - anchor.p0（设计位锁定）
    wt: list[float]
    axA: str | None = None  # noqa: N815
    axB: str | None = None  # noqa: N815
    axis: Vec | None = None  # rocker: 固定轴(车架 X=forward)


@dataclass
class BodyCluster:
    name: str
    ids: list[str]
    rel: list[Vec]       # member.p0 - mass_center（设计位锁定）
    wt: list[float]
    ws: float
    q: Vec               # 四元数 [x,y,z,w]，热启动


@dataclass
class Mechanism:
    nodes: dict[str, Node]
    links: list[Link]
    axis_clusters: list[AxisCluster]
    bodies: list[BodyCluster]
    free_ids: list[str]
    wheel: str           # 轮心节点 id（轮跳驱动锚）
    steer_anchor: Vec    # FL1 齿条线锚点（=FL1.p0）
    steer_axis: Vec      # 单位向量，齿条平移方向（右轮 +Y）

    def node(self, name: str) -> Node:
        return self.nodes[name]

    def dof(self) -> int:
        """传动自由度：轮跳 + 齿条转向 = 2（超静定机构，见模块 docstring）。"""
        return 2


def _unit(v: Vec) -> Vec:
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else np.array([1.0, 0.0, 0.0])


_FIXED = {"CH1", "CH2", "CH3", "CH4", "RK_PIVOT", "DAMPER_CHASSIS", "CH5", "RK_DAMPER"}


def build_mechanism(
    points: dict[str, Vec],
    *,
    wheel: str = "UP5",
    tie_outer: str = "UP3",
    tie_inner: str = "FL1",
    pushrod_from: str = "UP4",
    pushrod_to: str = "CH5",
    rocker_axis: Vec | None = None,
    steer_axis: Vec | None = None,
) -> Mechanism:
    """由侧硬点字典构造机构。

    - UCA/LCA 铰链：绕 CH1–CH2 / CH3–CH4 轴，成员 [UP1] / [UP2]。
    - 转向节刚体簇：5 节点 [UP1..UP5]。
    - 摇臂：绕 RK_PIVOT 的固定 X 轴，成员 [CH5, RK_DAMPER]。
    - 刚线：横拉杆 UP3–FL1、推杆 UP4–CH5。
    """
    nodes = {}
    for key in sorted(points):
        p = np.asarray(points[key], dtype=float)
        nodes[key] = Node(
            id=key, p0=p.copy(), pos=p.copy(), prev=p.copy(),
            vel=np.zeros(3), fix=key in _FIXED, mass=10.0,
        )
    free_ids = sorted(k for k, n in nodes.items() if not n.fix)

    def _axis(kind, name, anchor, members, axis=None, axA=None, axB=None):
        a0 = nodes[anchor].p0
        rel = [nodes[m].p0 - a0 for m in members]
        wt = [max(nodes[m].mass, 1e-3) for m in members]
        return AxisCluster(kind=kind, name=name, anchor=anchor, members=members,
                           rel=rel, wt=wt, axA=axA, axB=axB, axis=axis)

    pivot = "RK_PIVOT"
    axis_clusters = [
        _axis("hinge", "UCA", "CH1", ["UP1"], axA="CH1", axB="CH2"),
        _axis("hinge", "LCA", "CH3", ["UP2"], axA="CH3", axB="CH4"),
        _axis("rocker", "ROCKER", pivot, ["CH5", "RK_DAMPER"],
              axis=_unit(rocker_axis if rocker_axis is not None else np.array([1.0, 0.0, 0.0]))),
    ]

    ids = ["UP1", "UP2", "UP3", "UP4", "UP5"]
    wt = np.array([1.0, 1.0, 0.5, 0.5, 1.0])
    ws = float(wt.sum())
    c0 = sum(w * nodes[i].p0 for w, i in zip(wt, ids)) / ws
    rel = [nodes[i].p0 - c0 for i in ids]
    bodies = [BodyCluster(name="KNUCKLE", ids=ids, rel=[np.asarray(v) for v in rel],
                          wt=list(wt), ws=ws, q=np.array([0.0, 0.0, 0.0, 1.0]))]

    links = [
        Link(id="TIE", a=tie_outer, b=tie_inner, kind="R",
             L0=float(np.linalg.norm(nodes[tie_outer].p0 - nodes[tie_inner].p0)), Ld=0.0),
        Link(id="PUSHROD", a=pushrod_from, b=pushrod_to, kind="R",
             L0=float(np.linalg.norm(nodes[pushrod_from].p0 - nodes[pushrod_to].p0)), Ld=0.0),
    ]
    steer_anchor = nodes[tie_inner].p0.copy()
    sa = steer_axis if steer_axis is not None else np.array([0.0, 1.0, 0.0])
    return Mechanism(nodes=nodes, links=links, axis_clusters=axis_clusters, bodies=bodies,
                     free_ids=free_ids, wheel=wheel, steer_anchor=steer_anchor, steer_axis=_unit(sa))
