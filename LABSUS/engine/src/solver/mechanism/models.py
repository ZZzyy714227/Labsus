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
    steer_axis: Vec      # 单位向量，齿条平移方向（默认世界 −X 横向，右轮外侧）
    strut_attach: str = "knuckle"  # STRUT_OUT 附着拓扑：knuckle|lca|uca（P2）

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
    strut_attach: str = "knuckle",
) -> Mechanism:
    """由侧硬点字典构造机构。

    - 下臂铰链 ARM_LOWER（历史误名 UCA）：轴 CH1–CH2，主成员 [UP1=LBJ]。
    - 上臂铰链 ARM_UPPER（历史误名 LCA）：轴 CH3–CH4，主成员 [UP2=UBJ]。
      注：引擎点 CH1/CH2 对应前端 DWB LCA_F/LCA_R、CH3/CH4 对应 UCA_F/UCA_R；
      早期代码以 UP1 绕 CH1-CH2（下臂轴）仍称 "UCA" 属命名错位，2026-08-22 修正。
    - 转向节刚体簇：默认 5 节点 [UP1..UP5]；strut_attach≠knuckle 时 UP4 移出，
      改挂臂铰链（与前端 strutOutAttach 语义一致：lca=下臂 / uca=上臂）。
    - 摇臂：绕 RK_PIVOT 的固定 X 轴，成员 [CH5, RK_DAMPER]。
    - 刚线：横拉杆 UP3–FL1、推杆 UP4–CH5。

    strut_attach（P2，2026-08-22）：
        "knuckle" → UP4 固定于转向节刚体（历史行为，保留兼容）；
        "lca"     → UP4 挂下臂铰链（前端 FRONT strutOutAttach:"lca" 推杆）；
        "uca"     → UP4 挂上臂铰链（前端 REAR  strutOutAttach:"uca" 拉杆）。
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

    if strut_attach not in ("knuckle", "lca", "uca"):
        raise ValueError(f"strut_attach must be knuckle|lca|uca, got {strut_attach!r}")

    pivot = "RK_PIVOT"
    lower_members = ["UP1"] + (["UP4"] if strut_attach == "lca" else [])
    upper_members = ["UP2"] + (["UP4"] if strut_attach == "uca" else [])
    axis_clusters = [
        _axis("hinge", "ARM_LOWER", "CH1", lower_members, axA="CH1", axB="CH2"),
        _axis("hinge", "ARM_UPPER", "CH3", upper_members, axA="CH3", axB="CH4"),
        _axis("rocker", "ROCKER", pivot, ["CH5", "RK_DAMPER"],
              axis=_unit(rocker_axis if rocker_axis is not None else np.array([1.0, 0.0, 0.0]))),
    ]

    body_ids = [i for i in ("UP1", "UP2", "UP3", "UP4", "UP5")
                if not (i == "UP4" and strut_attach != "knuckle")]
    wm = {"UP1": 1.0, "UP2": 1.0, "UP3": 0.5, "UP4": 0.5, "UP5": 1.0}
    ids = body_ids
    wt = np.array([wm[i] for i in ids])
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
    # 第三讲判决（2026-08-22 修复）默认值对齐：齿条沿世界 −X 横移（右轮外侧），
    # 与前端 setChassis 同源。旧默认 (0,1,0) 是 Y 向旧约定，灵敏度差 20.8 倍。
    # A.3 残留清理（2026-08-30）：默认回退已由 (0,1,0) 改为 (−1,0,0)，
    # 与 v3service._new_mech 的显式传参一致，杜绝"未传 steer_axis 即掉回
    # 旧约定"的误用路径（legacy 快照目录为历史存档，保持原样）。
    sa = steer_axis if steer_axis is not None else np.array([-1.0, 0.0, 0.0])
    return Mechanism(nodes=nodes, links=links, axis_clusters=axis_clusters, bodies=bodies,
                     free_ids=free_ids, wheel=wheel, steer_anchor=steer_anchor,
                     steer_axis=_unit(sa), strut_attach=strut_attach)
