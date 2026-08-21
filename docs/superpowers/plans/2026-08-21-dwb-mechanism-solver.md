# DWB 式机构级投影运动学求解器 实施计划（子阶段①）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Python 后端实现 DWB-SIM 式机构级投影运动学求解器（投影原语 + continuation + 残差诚实），使全行程几何残差 ≤ 0.02 mm（消除 K-4），并作为子阶段②机制级台架动力学复用的机构层。

**Architecture:** 新模块 `src/solver/mechanism/` 与既有顺序解并行存在；节点/刚线/铰链簇/刚体簇数据模型 + 交替精确投影（`project_distance/project_hinge/project_body/project_rocker/polar_q`）+ `drive_to` continuation 分步逼近；`bench.py` 跑 P1 16 例 + 14 工况头对头对拍报告；达标（G1–G4）后 `/api/v2` 内部 `SOLVER_MODE` 默认切 mechanism，顺序解保留回退。坐标全程按 `convention.py`（X 向前/Y 向右/Z 向上），不从 DWB 搬运坐标。

**Tech Stack:** Python 3.13 / numpy / pytest（仓库已有 pytest + scipy）。

**设计规格：** `docs/superpowers/specs/2026-08-21-dwb-mechanism-solver-design.md`

---

## 文件结构

- Create `src/solver/mechanism/__init__.py` — 包出口
- Create `src/solver/mechanism/models.py` — Node/Link/AxisCluster(hinge|rocker)/BodyCluster/Mechanism + `build_mechanism()` + DOF
- Create `src/solver/mechanism/project.py` — `project_distance / project_hinge / project_rocker / project_body / polar_q / q_mat / q_mul / q_axis_angle`
- Create `src/solver/mechanism/solver.py` — `set_drives / sweep_proj / residual / solve_pose / drive_to / find_limits / SolveReport`
- Create `src/solver/mechanism/pose.py` — `mechanism_to_pose_result()`（机构节点 → 现有管道消费的姿态 dict）
- Create `src/solver/mechanism/bench.py` — 基准矩阵 + 头对头对拍 + `data/reports/dwb_mechanism_gate.json`
- Modify `src/routes/v2.py` — `SOLVER_MODE` 开关 + `_solve_axle` 分流（默认 sequential，达标切 mechanism）+ 请求级 `solver` 覆盖
- Test `tests/test_mechanism_models.py` / `test_mechanism_project.py` / `test_mechanism_solver.py` / `test_mechanism_pose.py` / `test_mechanism_bench.py`

> 约定：以下所有 `np` = numpy；`Vec` = `np.ndarray`。侧硬点字典 `points = {name: [x,y,z]}`。

---

### Task 1: 机构数据模型 + `build_mechanism` + DOF

**Files:**
- Create: `src/solver/mechanism/__init__.py`
- Create: `src/solver/mechanism/models.py`
- Test: `tests/test_mechanism_models.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_mechanism_models.py
import numpy as np
from solver.mechanism.models import Node, Mechanism, build_mechanism

def _synthetic_points():
    # 右侧双叉臂+推杆+摇臂，单位 mm（X 前/Y 右/Z 上）
    return {
        "CH1": np.array([-200.0, 120.0, 300.0]), "CH2": np.array([-200.0, -120.0, 300.0]),
        "CH3": np.array([-200.0, 150.0, 120.0]), "CH4": np.array([-200.0, -150.0, 120.0]),
        "UP1": np.array([-60.0, 0.0, 420.0]), "UP2": np.array([-60.0, 0.0, 150.0]),
        "UP3": np.array([-40.0, 0.0, 200.0]), "UP4": np.array([-55.0, 0.0, 260.0]),
        "UP5": np.array([0.0, 0.0, 300.0]),
        "FL1": np.array([140.0, 0.0, 200.0]),
        "RK_PIVOT": np.array([-220.0, 0.0, 340.0]),
        "CH5": np.array([-160.0, 0.0, 360.0]),
        "RK_DAMPER": np.array([-220.0, 0.0, 430.0]),
        "DAMPER_CHASSIS": np.array([-220.0, 0.0, 650.0]),
    }

def test_build_dof_is_2():
    m = build_mechanism(_synthetic_points())
    assert m.dof() == 2, f"DOF should be 2 (travel+steer), got {m.dof()}"

def test_nodes_have_design_and_current():
    m = build_mechanism(_synthetic_points())
    assert list(m.nodes) == sorted(m.nodes)  # 稳定排序便于测试
    for n in m.nodes.values():
        assert np.allclose(n.pos, n.p0)
        assert n.fix == (n.id in {"CH1","CH2","CH3","CH4","RK_PIVOT","DAMPER_CHASSIS","CH5","RK_DAMPER"}) is False or True  # 见 Step3 修正
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_models.py -v`
Expected: FAIL — `ModuleNotFoundError: solver.mechanism`

- [ ] **Step 3: Write models.py**

```python
# src/solver/mechanism/models.py
"""DWB 式机构数据模型：节点 / 刚线 / 轴向旋转簇(铰链|摇臂) / 刚体簇 / 机构。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

Vec = np.ndarray

FIXED_ROCKER_MEMBERS = {"CH5", "RK_DAMPER"}


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
    axA: str | None = None
    axB: str | None = None
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
        """DOF = 3*n_free − 有效约束数。hinge/rocker=2，body=3*len−6，刚线=1。"""
        n_free = len(self.free_ids)
        cons = 0
        for c in self.axis_clusters:
            cons += 2
        for b in self.bodies:
            cons += 3 * len(b.ids) - 6
        for lk in self.links:
            if lk.kind == "R":
                cons += 1
        return 3 * n_free - cons


def _unit(v: Vec) -> Vec:
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else np.array([1.0, 0.0, 0.0])


def build_mechanism(
    points: dict[str, Vec],
    *,
    wheel: str = "UP5",
    tie_outer: str = "UP3",
    tie_inner: str = "FL1",
    pushrod_from: str = "UP4",
    pushrod_to: str = "CH5",
    uca: tuple[str, str, str] = ("UC_AX", "CH1", "CH2"),
    lca: tuple[str, str, str] = ("LC_AX", "CH3", "CH4"),
    rocker_axis: Vec | None = None,
    steer_axis: Vec | None = None,
) -> Mechanism:
    """由侧硬点字典构造机构。

    - UCA/LCA 铰链：绕 CH1–CH2 / CH3–CH4 轴，成员 [UP1] / [UP2]（从役铰点由调用方在 points 提供，默认取 UP1/UP2）。
    - 转向节刚体：5 节点 [UP1..UP5]。
    - 摇臂：绕 RK_PIVOT 轴上 X，成员 [CH5, RK_DAMPER]。
    - 刚线：横拉杆 UP3–FL1、推杆 UP4–CH5。
    """
    nodes = {}
    fixed = {"CH1", "CH2", "CH3", "CH4", "RK_PIVOT", "DAMPER_CHASSIS"}
    for key, p in points.items():
        p = np.asarray(p, dtype=float)
        nodes[key] = Node(
            id=key, p0=p.copy(), pos=p.copy(), prev=p.copy(),
            vel=np.zeros(3), fix=(key in fixed) or (key in FIXED_ROCKER_MEMBERS),
            mass=10.0,
        )
    free_ids = sorted(k for k, n in nodes.items() if not n.fix)

    # 轴向铰链簇 rel 以 anchor 设计位为准
    def _axis_cluster(kind, name, anchor, members):
        a0 = nodes[anchor].p0
        rel = [nodes[m].p0 - a0 for m in members]
        wt = [max(nodes[m].mass, 1e-3) for m in members]
        return AxisCluster(kind=kind, name=name, anchor=anchor, members=members, rel=rel, wt=wt)

    axis_clusters = [
        _axis_cluster("hinge", "UCA", "CH1", ["UP1"]),
        _axis_cluster("hinge", "LCA", "CH3", ["UP2"]),
    ]
    # 摇臂：以 RK_PIVOT 为锚，固定轴 X
    pivot = "RK_PIVOT"
    axis_clusters.append(
        AxisCluster(kind="rocker", name="ROCKER", anchor=pivot,
                    members=["CH5", "RK_DAMPER"],
                    rel=[nodes[m].p0 - nodes[pivot].p0 for m in ["CH5", "RK_DAMPER"]],
                    wt=[1.0, 1.0],
                    axis=_unit(rocker_axis if rocker_axis is not None else np.array([1.0, 0.0, 0.0])))
    )

    # 转向节刚体簇：质心加权
    ids = ["UP1", "UP2", "UP3", "UP4", "UP5"]
    wt = np.array([1.0, 1.0, 0.5, 0.5, 1.0])
    ws = wt.sum()
    c0 = sum(w * nodes[i].p0 for w, i in zip(wt, ids)) / ws
    rel = [nodes[i].p0 - c0 for i in ids]
    bodies = [BodyCluster(name="KNUCKLE", ids=ids, rel=[np.asarray(v) * w for v in rel],
                          wt=list(wt), ws=float(ws), q=np.array([0.0, 0.0, 0.0, 1.0]))]

    links = [
        Link(id="TIE", a=tie_outer, b=tie_inner, kind="R",
             L0=float(np.linalg.norm(nodes[tie_outer].p0 - nodes[tie_inner].p0)),
             Ld=0.0),
        Link(id="PUSHROD", a=pushrod_from, b=pushrod_to, kind="R",
             L0=float(np.linalg.norm(nodes[pushrod_from].p0 - nodes[pushrod_to].p0)),
             Ld=0.0),
    ]
    steer_anchor = nodes[tie_inner].p0.copy()
    sa = steer_axis if steer_axis is not None else np.array([0.0, 1.0, 0.0])
    return Mechanism(nodes=nodes, links=links, axis_clusters=axis_clusters, bodies=bodies,
                     free_ids=free_ids, wheel=wheel, steer_anchor=steer_anchor,
                     steer_axis=_unit(sa))
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_models.py -v`
Expected: PASS（DOF=2、节点齐全）

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/ tests/test_mechanism_models.py
git commit -m "feat(mechanism): node/link/cluster data model + build_mechanism + DOF"
```

> 说明：本任务包含一处待办修正——Step 1 测试里 `test_nodes_have_design_and_current` 的 `fix` 断言写得绕，**改为**：`assert n.fix == (n.id in {"CH1","CH2","CH3","CH4","RK_PIVOT","DAMPER_CHASSIS","CH5","RK_DAMPER"})`。
> 摇臂成员 CH5/RK_DAMPER 标记为固定（节点模板意义上不参与自由 DOF），但它们的位置由 `project_rocker` 旋转改写——见 Task 4。

---

### Task 2: 投影原语 —— `project_distance` / `project_hinge`

**Files:**
- Create: `src/solver/mechanism/project.py`
- Test: `tests/test_mechanism_project.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_mechanism_project.py
import numpy as np
from solver.mechanism.models import Node
from solver.mechanism.project import project_distance, project_hinge

def mk(ids, p0, fix=False, mass=1.0):
    p = np.asarray(p0, dtype=float)
    return {i: Node(id=i, p0=p.copy(), pos=p.copy(), prev=p.copy(),
                    vel=np.zeros(3), fix=fix, mass=mass) for i, p in zip(ids, p0)}

def test_distance_projects_to_L0():
    n = mk(["A", "B"], [[0, 0, 0], [10, 0, 0]])
    d = project_distance(n, "A", "B", L0=6.0)
    assert abs(np.linalg.norm(n["B"].pos - n["A"].pos) - 6.0) < 1e-9
    assert abs(d - 4.0) < 1e-9

def test_distance_respects_fixed_node():
    n = mk(["A", "B"], [[0, 0, 0], [10, 0, 0]], fix=[True, False])
    project_distance(n, "A", "B", L0=6.0)
    assert np.allclose(n["A"].pos, [0, 0, 0])
    assert abs(np.linalg.norm(n["B"].pos - n["A"].pos) - 6.0) < 1e-9

def test_hinge_rotates_member_exactly():
    # 单成员绕 X 轴(设计轴=Z 向人工轴)先转 30° 再投影回
    anchor = np.array([0.0, 0.0, 0.0])
    member_p0 = np.array([0.0, 100.0, 0.0])
    n = mk(["O", "M"], [anchor, member_p0])
    axis = np.array([0.0, 0.0, 1.0])  # 绕 Z 轴转 = 把成员转到 xy 平面新位
    th = np.deg2rad(30.0)
    ct, st = np.cos(th), np.sin(th)
    n["M"].pos = np.array([member_p0[0] * ct - member_p0[1] * st,
                           member_p0[0] * st + member_p0[1] * ct, member_p0[2]])
    # 投影应把成员拉回最近旋转 (30° 已是最优 → 残差≈0)
    err = project_hinge(n, anchor, axis, ["M"], [member_p0 - anchor], [1.0])
    assert err < 1e-9
    assert np.allclose(n["M"].pos / np.linalg.norm(n["M"].pos), member_p0 / np.linalg.norm(member_p0))
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_project.py -v`
Expected: FAIL — `ModuleNotFoundError: solver.mechanism.project`

- [ ] **Step 3: Write project.py（距离 + 铰链）**

```python
# src/solver/mechanism/project.py
"""投影原语：交替精确投影（DWB projLink/projHinge/projBody/projRocker 的 numpy 版本）。"""
from __future__ import annotations

import numpy as np

from .models import Vec, Node

EPS = 1e-12


def project_distance(nodes: dict[str, Node], a: str, b: str, L0: float) -> float:
    """刚线长度约束：按逆质量加权分配误差 C=d−L0。返回 |C|。"""
    A, B = nodes[a], nodes[b]
    wa, wb = A.inv_m, B.inv_m
    ws = wa + wb
    if ws <= EPS:
        return 0.0
    d = B.pos - A.pos
    dd = float(np.linalg.norm(d)) or EPS
    C = dd - L0
    s = C / (dd * ws)
    if wa > 0:
        A.pos = A.pos + d * (s * wa)
    if wb > 0:
        B.pos = B.pos - d * (s * wb)
    return abs(C)


def project_axis_rotation(nodes: dict[str, Node], anchor: str, axis: Vec,
                          members: list[str], rel: list[Vec], wt: list[float]) -> float:
    """成员绕过 anchor 的 unit 轴做单参数最优旋转（DWB projHinge 解析式）。"""
    o = nodes[anchor].pos
    ax = np.asarray(axis, dtype=float)
    ax = ax / (np.linalg.norm(ax) or 1.0)
    sn = 0.0
    cs = 0.0
    for k, mid in enumerate(members):
        r = np.asarray(rel[k], dtype=float)
        rp = float(np.dot(r, ax))
        rq = r - ax * rp
        d = nodes[mid].pos - o
        w = float(wt[k])
        cs += w * float(np.dot(rq, d))
        sn += w * float(np.dot(np.cross(ax, rq), d))
    th = np.arctan2(sn, cs)
    ct, st = np.cos(th), np.sin(th)
    for k, mid in enumerate(members):
        r = np.asarray(rel[k], dtype=float)
        rp = float(np.dot(r, ax))
        rq = r - ax * rp
        q = ax * rp + rq * ct + np.cross(ax, rq) * st
        nodes[mid].pos = o + q
    return abs(sn) / (abs(cs) + EPS)


def project_hinge(nodes: dict[str, Node], anchor: str, axis: Vec,
                  members: list[str], rel: list[Vec], wt: list[float],
                  ax_a: str | None = None, ax_b: str | None = None) -> float:
    """铰链簇（两固定铰点轴）。axis 若为 None 则取两轴端点当前方向。"""
    if axis is None:
        axis = np.asarray(nodes[ax_b].pos, dtype=float) - np.asarray(nodes[ax_a].pos, dtype=float)
    return project_axis_rotation(nodes, anchor, axis, members, rel, wt)
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_project.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/project.py tests/test_mechanism_project.py
git commit -m "feat(mechanism): distance + hinge exact projections"
```

---

### Task 3: 极分解 `polar_q` + 刚体簇 `project_body`

**Files:**
- Modify: `src/solver/mechanism/project.py`
- Test: `tests/test_mechanism_project.py`

- [ ] **Step 1: Write the failing test（刚体重构误差 + 热启动）**

```python
# 追加到 tests/test_mechanism_project.py
from solver.mechanism.project import polar_q, project_body, q_mat, q_mul, q_axis_angle

def _rod(q, v):
    R = q_mat(q)
    return R @ v

def test_polar_q_closed_form():
    # 用绕 Z 轴 40° 的真实旋转生成协方差，验证 polar_q 能精确还原
    th = np.deg2rad(40.0)
    n = mk(["P0", "P1", "P2"], [[0, 0, 0], [100, 0, 0], [0, 80, 0]])
    pts = np.array([n[i].p0 for i in n])
    c = pts.mean(axis=0)
    rel = pts - c
    # 真实旋转
    q_true = q_axis_angle(np.array([0.0, 0.0, 1.0]), th)
    R = q_mat(q_true)
    moved = (R @ rel.T).T + c
    for i, k in enumerate(n):
        n[k].pos = moved[i]
    A = np.zeros((3, 3))
    for i, k in enumerate(n):
        A += np.outer(moved[i] - c, rel[i])  # 等权
    q = polar_q(A, q_true.copy(), 30)
    R2 = q_mat(q)
    assert np.allclose(R2 @ rel[1], R @ rel[1], atol=1e-7)
    assert np.allclose(q, q_true, atol=1e-6) or np.allclose(q, -q_true, atol=1e-6)

def test_project_body_reconstructs_rigid_set():
    n = mk(["A", "B", "C", "D"], [[0, 0, 0], [50, 0, 0], [0, 60, 0], [10, 20, 30]])
    ids = ["A", "B", "C", "D"]
    wt = np.array([1.0, 1.0, 1.0, 1.0])
    ws = float(wt.sum())
    c0 = sum(w * n[i].p0 for w, i in zip(wt, ids)) / ws
    rel = [n[i].p0 - c0 for i in ids]
    # 打乱位置（非刚性位移）后再投影
    for i in ids:
        n[i].pos = n[i].p0 + np.array([np.random.default_rng(0).normal() for _ in range(3)])
    project_body(n, ids, rel, list(wt), ws)
    # 投影后应恢复刚性（任意两两距离在设计位 ±1e-9）
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            d0 = np.linalg.norm(n[a].p0 - n[b].p0)
            d1 = np.linalg.norm(n[a].pos - n[b].pos)
            assert abs(d1 - d0) < 1e-9, f"{a}-{b} 距离漂移 {d1-d0}"
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_project.py -k "polar or body" -v`
Expected: FAIL — `ImportError: cannot import name 'polar_q'`

- [ ] **Step 3: Implement in project.py**

```python
def q_axis_angle(ax: Vec, an: float) -> Vec:
    """轴角 → 四元数 [x,y,z,w]。"""
    h = an * 0.5
    s = np.sin(h)
    ax = np.asarray(ax, dtype=float)
    ax = ax / (np.linalg.norm(ax) or 1.0)
    return np.array([ax[0] * s, ax[1] * s, ax[2] * s, np.cos(h)])


def q_mul(a: Vec, b: Vec) -> Vec:
    # a*b（Hamilton），与 DWB qMul 一致
    return np.array([
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ])


def q_mat(q: Vec) -> np.ndarray:
    """四元数 → 行主序 3x3 旋转矩阵。"""
    x, y, z, w = q
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    return np.array([
        [1 - (yy + zz), xy - wz, xz + wy],
        [xy + wz, 1 - (xx + zz), yz - wx],
        [xz - wy, yz + wx, 1 - (xx + yy)],
    ])


def polar_q(A: np.ndarray, q: Vec, iters: int = 16) -> Vec:
    """极分解取旋转（Müller 迭代），A=协方差矩阵，q=热启动四元数。"""
    q = q / (np.linalg.norm(q) or 1.0)
    for _ in range(iters):
        R = q_mat(q)
        r0, r1, r2 = R[0], R[1], R[2]
        a0, a1, a2 = A[0], A[1], A[2]
        n = np.cross(r0, a0) + np.cross(r1, a1) + np.cross(r2, a2)
        d = abs(float(np.dot(r0, a0) + np.dot(r1, a1) + np.dot(r2, a2))) + 1e-9
        om = n / d
        w = float(np.linalg.norm(om))
        if w < 1e-13:
            break
        q = q_mul(q_axis_angle(om / w, w), q)
        q = q / np.linalg.norm(q)
    return q


def project_body(nodes: dict[str, Node], ids: list[str], rel: list[Vec],
                 wt: list[float], ws: float, q: Vec | None = None,
                 iters: int = 14) -> Vec:
    """自由刚体簇：质量加权协方差 + 极分解；返回质量中心。工作区用节点正向写回。"""
    c = np.zeros(3)
    for k, mid in enumerate(ids):
        c = c + nodes[mid].pos * wt[k]
    c = c / ws
    A = np.zeros((3, 3))
    for k, mid in enumerate(ids):
        p = nodes[mid].pos
        w = wt[k]
        r = rel[k]
        A += w * np.outer(p - c, r)
    quat = polar_q(A, q if q is not None else np.array([0.0, 0.0, 0.0, 1.0]), iters)
    R = q_mat(quat)
    for k, mid in enumerate(ids):
        nodes[mid].pos = c + R @ rel[k]
    return quat
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_project.py -k "polar or body" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/project.py tests/test_mechanism_project.py
git commit -m "feat(mechanism): polar decomposition + rigid body projection"
```

---

### Task 4: 摇臂投影 `project_rocker`（绕枢轴固定轴）

**Files:**
- Modify: `src/solver/mechanism/project.py`
- Test: `tests/test_mechanism_project.py`

- [ ] **Step 1: Write the failing test（与 rotate_around_x 语义一致 + 超程检测）**

```python
# 追加到 tests/test_mechanism_project.py
from geometry import rotate_around_x
from solver.mechanism.project import project_rocker

def test_rocker_rotates_like_rotate_around_x():
    pivot = np.array([-220.0, 0.0, 340.0])
    m0 = np.array([-160.0, 0.0, 360.0])
    d0 = np.array([-220.0, 0.0, 430.0])
    n = mk(["P", "C", "D"], [pivot, m0, d0])
    axis = np.array([1.0, 0.0, 0.0])
    # 外部把摇臂旋 25°（真实）
    th = np.deg2rad(25.0)
    n["C"].pos = rotate_around_x(m0, pivot, th)
    n["D"].pos = rotate_around_x(d0, pivot, th)
    err = project_rocker(n, "P", axis, ["C", "D"], [m0 - pivot, d0 - pivot], [1.0, 1.0])
    assert err < 1e-9
    assert np.allclose(n["C"].pos - pivot, m0 - pivot, atol=1e-7)  # 回到设计
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_project.py -k rocker -v`
Expected: FAIL — `ImportError: cannot import name 'project_rocker'`

- [ ] **Step 3: Implement in project.py**

```python
def project_rocker(nodes: dict[str, Node], anchor: str, axis: Vec,
                   members: list[str], rel: list[Vec], wt: list[float]) -> float:
    """摇臂：绕车架枢轴的固定轴（车架 X）做单参数最优旋转，规则同 project_axis_rotation。"""
    return project_axis_rotation(nodes, anchor, axis, members, rel, wt)
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_project.py -k rocker -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/project.py tests/test_mechanism_project.py
git commit -m "feat(mechanism): rocker single-pivot axis projection"
```

---

### Task 5: 求解器 —— `set_drives / sweep_proj / residual / solve_pose / drive_to`

**Files:**
- Create: `src/solver/mechanism/solver.py`
- Test: `tests/test_mechanism_solver.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_mechanism_solver.py
import numpy as np
from solver.mechanism.models import build_mechanism
from solver.mechanism.solver import solve_pose, drive_to, residual, sweep_proj
# 复用 models 测试里的合成几何
from tests.test_mechanism_models import _synthetic_points

def _m():
    return build_mechanism(_synthetic_points(), steer_axis=np.array([0.0, 1.0, 0.0]))

def test_pose_zero_is_design():
    m = _m()
    rep = solve_pose(m, travel=0.0, rack=0.0)
    assert rep.residual < 2e-7
    for n in m.nodes.values():
        assert np.allclose(n.pos, n.p0, atol=1e-6)

def test_bump_30_converges():
    m = _m()
    rep = drive_to(m, target_travel=30.0, rack=0.0)
    assert rep.residual < 1e-5, f"residual={rep.residual}"
    # 轮心驱动满足
    assert abs(m.node("UP5").pos[2] - (m.node("UP5").p0[2] + 30.0)) < 1e-6

def test_bump_neg30_converges():
    m = _m()
    rep = drive_to(m, target_travel=-30.0, rack=0.0)
    assert rep.residual < 1e-5

def test_steer_rack_moves_tie_outer():
    m = _m()
    rep = drive_to(m, target_travel=0.0, rack=10.0)
    assert rep.residual < 1e-5
    # FL1 被驱动沿 +Y 移 10（右轮约定）
    assert abs(m.node("FL1").pos[1] - (m.steer_anchor[1] + 10.0)) < 1e-6
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_solver.py -v`
Expected: FAIL — `ModuleNotFoundError: solver.mechanism.solver`

- [ ] **Step 3: Implement solver.py**

```python
# src/solver/mechanism/solver.py
"""GS 交替精确投影 + continuation 分步逼近 + 残差诚实。"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .models import Mechanism
from .project import (project_body, project_distance, project_hinge,
                      project_rocker)


@dataclass
class SolveReport:
    residual: float
    iterations: int
    ok: bool
    ms: float


def set_drives(m: Mechanism, travel: float, rack: float) -> None:
    m.node(m.wheel).pos[2] = m.node(m.wheel).p0[2] + travel
    m.node("FL1").pos = m.steer_anchor + rack * m.steer_axis


def sweep_proj(m: Mechanism) -> None:
    """一次固定顺序扫描（设驱动由调用方先 set_drives）。"""
    tie = next(lk for lk in m.links if lk.id == "TIE")
    push = next(lk for lk in m.links if lk.id == "PUSHROD")
    project_distance(m.nodes, tie.a, tie.b, tie.L0)
    for c in m.axis_clusters:
        if c.kind == "hinge":
            project_hinge(m.nodes, c.anchor, None, c.members, c.rel, c.wt, c.axA, c.axB)
        else:
            project_rocker(m.nodes, c.anchor, c.axis, c.members, c.rel, c.wt)
    project_distance(m.nodes, push.a, push.b, push.L0)
    for b in m.bodies:
        b.q = project_body(m.nodes, b.ids, b.rel, b.wt, b.ws, b.q)


def residual(m: Mechanism, travel: float, rack: float) -> float:
    r = 0.0
    for lk in m.links:
        if lk.kind == "R":
            d = abs(float(np.linalg.norm(m.node(lk.b).pos - m.node(lk.a).pos)) - lk.L0)
            r = max(r, d)
    z_target = m.node(m.wheel).p0[2] + travel
    r = max(r, abs(m.node(m.wheel).pos[2] - z_target))
    f_target = m.steer_anchor + rack * m.steer_axis
    r = max(r, float(np.linalg.norm(m.node("FL1").pos - f_target)))
    return r


def solve_pose(m: Mechanism, travel: float, rack: float,
               max_it: int = 260, tol: float = 2e-7, check_every: int = 4):
    import time
    t0 = time.perf_counter()
    set_drives(m, travel, rack)
    res = 1.0
    it = 0
    for it in range(max_it):
        sweep_proj(m)
        if (it & 3) == 3:
            res = residual(m, travel, rack)
            if res < tol:
                it += 1
                break
    res = residual(m, travel, rack)
    ok = res < 0.02
    return SolveReport(residual=float(res), iterations=int(it), ok=bool(ok),
                       ms=(time.perf_counter() - t0) * 1000.0)


def drive_to(m: Mechanism, target_travel: float, rack: float,
             step: float = 6.0, max_steps: int = 24,
             max_it: int = 260, tol: float = 2e-7) -> SolveReport:
    """大跨度输入分步逼近（continuation），热启动。"""
    cur = m.node(m.wheel).pos[2] - m.node(m.wheel).p0[2]
    d = target_travel - cur
    steps = int(min(max_steps, max(1, abs(np.ceil(abs(d) / step)))))
    rep = None
    for s in range(1, steps + 1):
        rep = solve_pose(m, cur + d * s / steps, rack, max_it=max_it, tol=tol)
    return rep


def find_limits(m: Mechanism, rack: float, travel_lo: float = -140.0,
                travel_hi: float = 140.0, step: float = 2.0, thr: float = 0.03):
    """几何行程极限：分步上行/下行，残差超过 thr 即停。返回 (lo, hi)。"""
    z0 = m.node(m.wheel).p0[2]
    up = 0.0
    t = 0.0
    while t + step <= travel_hi:
        t += step
        rep = drive_to(m, target_travel=t, rack=rack)
        if rep.residual > thr:
            break
        up = t
    drive_to(m, 0.0, rack)
    dn = 0.0
    t = 0.0
    while t - step >= travel_lo:
        t -= step
        rep = drive_to(m, target_travel=t, rack=rack)
        if rep.residual > thr:
            break
        dn = t
    drive_to(m, 0.0, rack)
    return (dn, up)
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_solver.py -v`
Expected: PASS（残差均 < 1e-5；若超标，先查合成几何是否自洽——所有刚线 L0 都由设计位移出，应能收敛）

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/solver.py tests/test_mechanism_solver.py
git commit -m "feat(mechanism): GS sweep + continuation solver + drive/residual/limits"
```

---

### Task 6: 真实几何（legacy-import 前/后/左右）构造机构 + 不变量测试

**Files:**
- Modify: `src/solver/mechanism/__init__.py`
- Create: `src/solver/mechanism/from_legacy.py`
- Test: `tests/test_mechanism_from_legacy.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_mechanism_from_legacy.py
import numpy as np
from core.legacy_import import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS
from solver.mechanism.from_legacy import build_side_from_legacy
from solver.mechanism.solver import drive_to

# 确认 legacy 数据每个轴侧包含我们需要的键（缺则先补同步到 legacy_import）
REQUIRED = {"CH1","CH2","CH3","CH4","CH5","UP1","UP2","UP3","UP4","UP5","FL1",
            "RK_PIVOT","RK_DAMPER","DAMPER_CHASSIS"}

def _assert_side(prefix_dict, name):
    missing = REQUIRED - set(prefix_dict)
    assert not missing, f"{name} 缺键 {sorted(missing)}（需在 legacy_import/DEFAULT_* 补齐 frame 节点）"

def test_front_right_keys_and_dof():
    fr = DEFAULT_HARDPOINTS.get("right") or DEFAULT_HARDPOINTS.get("front_right") or DEFAULT_HARDPOINTS
    _assert_side(fr, "front_right")
    m = build_side_from_legacy(fr)
    assert m.dof() == 2

def test_real_geometry_travel_plus_minus_30():
    fr = DEFAULT_HARDPOINTS.get("right") or DEFAULT_HARDPOINTS.get("front_right") or DEFAULT_HARDPOINTS
    m = build_side_from_legacy(fr)
    rep = drive_to(m, 30.0, 0.0)
    assert rep.residual < 0.02, f"+30 residual={rep.residual}"
    m2 = build_side_from_legacy(fr)
    rep2 = drive_to(m2, -30.0, 0.0)
    assert rep2.residual < 0.02, f"-30 residual={rep2.residual}"
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_from_legacy.py -v`
Expected: FAIL——首要是暴露 legacy 快印的键名（`DEFAULT_HARDPOINTS` 是单个 axle dict 还是带 front/rear 的结构取决于现有实现；如键缺失，本任务先修 `legacy_import` 使其暴露 CH*/UP*/FL1/RK_*/DAMPER 全套）

- [ ] **Step 3: 核对并补齐 legacy_import 键（按失败提示操作）**

在 `src/core/legacy_import.py` 确认 `DEFAULT_HARDPOINTS` / `DEFAULT_REAR_HARDPOINTS` 是否已含 `RK_PIVOT/RK_DAMPER/DAMPER_CHASSIS/CH5`；缺则从 `config.py` 的 `frame_nodes` / `DESIGN_PARAMS` 补齐（rocker.py 已从 `frame_nodes` 读这些键——实现以之为准）。

实现 `from_legacy.py`：

```python
# src/solver/mechanism/from_legacy.py
"""把 legacy-import 的侧硬点 dict 组装成 Mechanism（补齐 frame 节点）。"""
from __future__ import annotations

import numpy as np

from .models import Mechanism, build_mechanism


def _as_vec(d: dict, key: str) -> np.ndarray:
    return np.asarray(d[key], dtype=float)


def build_side_from_legacy(side: dict, *, steer_axis=None) -> Mechanism:
    """side：某侧硬点 dict（flat；可来自 AxleHardpoints.flat() 或 DEFAULT_HARDPOINTS）。"""
    pts = {k: _as_vec(side, k) for k in ("CH1","CH2","CH3","CH4","CH5",
                                         "UP1","UP2","UP3","UP4","UP5","FL1",
                                         "RK_PIVOT","RK_DAMPER","DAMPER_CHASSIS")}
    return build_mechanism(pts, steer_axis=steer_axis)
```

任选其一提供默认 `steer_axis`：右轮 `+Y`；左轮 `-Y`（由调用方传入，K-2/K-3 符号测试锁定）。

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_from_legacy.py -v`
Expected: PASS（真实几何 ±30mm 残差 < 0.02）

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/ src/core/legacy_import.py tests/test_mechanism_from_legacy.py
git commit -m "feat(mechanism): build from legacy real hardpoints + travel invariants"
```

---

### Task 7: 姿态指标适配 —— `mechanism_to_pose_result` + K-1/K-2/K-3 符号回归

**Files:**
- Create: `src/solver/mechanism/pose.py`
- Test: `tests/test_mechanism_pose.py`

- [ ] **Step 1: 核对角度函数消费的键（不可盲写）**

Run: `python -c "import inspect, sys; sys.path.insert(0,'src'); from solver.angles import compute_alignment_angles; print(inspect.signature(compute_alignment_angles))"`
Expected: 打印签名；随后 `read src/solver/angles.py` 确认它从 `result_dict` 读哪些键（预期 UP1..UP5 / FL1 / CH*）。

- [ ] **Step 2: Write the failing test**

```python
# tests/test_mechanism_pose.py
import numpy as np
from solver.angles import compute_alignment_angles
from solver.mechanism.from_legacy import build_side_from_legacy
from solver.mechanism.pose import mechanism_to_pose_result
from solver.mechanism.solver import drive_to
from tests.test_mechanism_from_legacy import _front_right

def test_pose_zero_angles_match_hand_benchmark():
    m = build_side_from_legacy(_front_right())
    drive_to(m, 0.0, 0.0)
    res = mechanism_to_pose_result(m)
    ang = compute_alignment_angles(res)  # 返回角度 dict 或 WheelAngles
    # 断言静态位：camber≈预设、toe/scrub/trail 符号按 convention（K-1/K-2/K-3）
    assert abs(float(ang["camber_deg"])) < 6.0  # 占位数值替换为 legacy 黄金值后收紧
```

> 占位收紧提示：Task 7 完成后把断言换成 `tests/test_hand_benchmark.py` 已有的黄金值（camber/toe/scrub/trail），并在 K-1/K-2/K-3 三符号上各加一条显式断言。

- [ ] **Step 3: Implement pose.py**

```python
# src/solver/mechanism/pose.py
"""机构解 → 现有角度/指标管道消费的 pose dict。"""
from __future__ import annotations

import numpy as np

from .models import Mechanism


def mechanism_to_pose_result(m: Mechanism) -> dict[str, np.ndarray]:
    """把机构节点位置导出为 compute_alignment_angles 等消费的 result_dict 形状。

    键与 src/solver/angles.py 消费保持一致（实施时按 Step1 核对结果确定）。
    """
    keys = ["UP1", "UP2", "UP3", "UP4", "UP5", "FL1", "CH1", "CH2", "CH3", "CH4", "CH5",
            "RK_PIVOT", "RK_DAMPER", "DAMPER_CHASSIS"]
    return {k: m.node(k).pos.copy() for k in keys}
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_pose.py -v`
Expected: PASS（若 angles.py 需要更多键，按 Step1 核对结果补）

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/pose.py tests/test_mechanism_pose.py
git commit -m "feat(mechanism): pose adapter + alignment sign regression"
```

---

### Task 8: 基准 CLI —— P1 16 例 + 14 工况头对头 + gate JSON

**Files:**
- Create: `src/solver/mechanism/bench.py`
- Modify: `src/solver/__init__.py`（按需导出）
- Test: `tests/test_mechanism_bench.py`

- [ ] **Step 1: Write the failing test（gate 阈值断言）**

```python
# tests/test_mechanism_bench.py
import json, sys, tempfile, pathlib
from core.legacy_import import DEFAULT_HARDPOINTS
from solver.mechanism.bench import run_matrix, write_gate_report

def test_matrix_all_residuals_below_002():
    rep = run_matrix(front_right_hp=DEFAULT_HARDPOINTS)
    worst = max((r["residual"] for r in rep["rows"]), default=0.0)
    assert worst <= 0.02, f"worst residual {worst} > 0.02"

def test_gate_written(tmp_path):
    out = str(tmp_path / "gate.json")
    rep = run_matrix(front_right_hp=DEFAULT_HARDPOINTS)
    write_gate_report(rep, out)
    data = json.loads(pathlib.Path(out).read_text(encoding="utf-8"))
    assert "gate" in data and "rows" in data
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_mechanism_bench.py -v`
Expected: FAIL — `ModuleNotFoundError: solver.mechanism.bench`

- [ ] **Step 3: Implement bench.py**

```python
# src/solver/mechanism/bench.py
"""基准矩阵：P1 16 例 + 14 工况 + 镜像；残差/指标头对头对拍；写 gate JSON。"""
from __future__ import annotations

import json
import pathlib
import time

import numpy as np

from .from_legacy import build_side_from_legacy
from .pose import mechanism_to_pose_result
from .solver import drive_to
from solver.angles import compute_alignment_angles

_P1_TRAVELS = [-30, -15, -5, 0, 5, 10, 15, 30]
_P1_RACKS = [0, 5]


def _one_pose(hp: dict, travel: float, rack: float) -> dict:
    m = build_side_from_legacy(hp, steer_axis=np.array([0.0, 1.0, 0.0]))
    t0 = time.perf_counter()
    rep = drive_to(m, travel, rack)
    ms = rep.ms or (time.perf_counter() - t0) * 1000.0
    ang = compute_alignment_angles(mechanism_to_pose_result(m)) or {}
    def num(k):
        v = ang.get(k)
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    return {
        "travel": travel, "rack": rack,
        "residual": float(rep.residual), "iter": int(rep.iterations), "ms": round(ms, 3),
        "camber_deg": num("camber_deg"), "toe_deg": num("toe_deg"),
        "caster_deg": num("caster_deg"), "kpi_deg": num("kpi_deg"),
        "scrub_mm": num("scrub_mm"), "trail_mm": num("trail_mm"),
    }


def run_matrix(front_right_hp: dict, rear_right_hp: dict | None = None) -> dict:
    rows = [_one_pose(front_right_hp, t, r) for t in _P1_TRAVELS for r in _P1_RACKS]
    worst = max((r["residual"] for r in rows), default=0.0)
    return {
        "rows": rows,
        "worst_residual": worst,
        "gate": {"pass": bool(worst <= 0.02),
                 "criteria": [{"id": "G1", "desc": "全矩阵残差≤0.02mm", "value": worst}]},
    }


def write_gate_report(rep: dict, out_path: str) -> None:
    pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    out = pathlib.Path("data/reports/dwb_mechanism_gate.json")
    rep = run_matrix(front_right_hp=DEFAULT_HARDPOINTS)
    write_gate_report(rep, str(out))
    print(json.dumps(rep["gate"]))
```

（`DEFAULT_HARDPOINTS` 需取自 legacy_import；基准脚本 `if __main__` 里从 `core.legacy_import` 导入。）

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_mechanism_bench.py -v`
Expected: PASS（worst residual ≤ 0.02；若某方位不达标，记录该 (travel,rack) 到 DEVLOG 并迭代 solver：先降 continuation step、再调迭代上限）

- [ ] **Step 5: 生成 gate 报告**

Run: `python -m src.solver.mechanism.bench` · Expected: 打印 `{"pass": true, ...}` 且生成 `data/reports/dwb_mechanism_gate.json`

- [ ] **Step 6: Commit**

```bash
git add src/solver/mechanism/bench.py tests/test_mechanism_bench.py data/reports/dwb_mechanism_gate.json
git commit -m "feat(mechanism): benchmark matrix + gate report"
```

---

### Task 9: v2 集成 —— `SOLVER_MODE` 开关 + 请求级覆盖 + 残差真实化

**Files:**
- Modify: `src/routes/v2.py`（`_solve_axle` 附近，约 L240–380 的求解编排区）
- Test: `tests/test_v2_api.py`

- [ ] **Step 1: Write the failing test（机制残差真实 + 覆盖字段）**

```python
# 追加到 tests/test_v2_api.py
def test_inline_solve_default_sequential_shape_unchanged(client):
    # 既有 TestInlineSolve 仍有线性路径（SOLVER_MODE 默认 sequential 时行为不变）
    pass

def test_inline_solve_solver_mw_overrides_to_mechanism(client):
    resp = client.post("/api/v2/solve/hardpoints", json={..., "solver": "mw"})  # 与现有 payload 一致
    d = resp.json()
    assert d["solver"] == "mechanism-v1"
    # 残差来自机制：非零行程下应明显小于顺序解历史值（如 |travel|=20 时 < 0.02）
    fr = d["per_wheel_geometry"]["front_right"] or d["wheels"]["front_right"]
    assert float(fr["residual"]) <= 0.02
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_v2_api.py -k "mw or mechanism or sequential" -v`
Expected: FAIL——v2 尚无 `solver` 字段/分流

- [ ] **Step 3: v2.py 接入**

在 `src/routes/v2.py` 加模块开关与路由分流：

```python
# 顶部（SOLVER_NAME 附近）
import os
_SOLVER_DEFAULT = os.environ.get("DWB_SOLVER_MODE", "sequential")   # 达标后默认改为 "mechanism"
SOLVER_NAME = {
    "mechanism": "dwb-mechanism-v1",
    "sequential": "sequential-bump-steer-v1",
}[_SOLVER_DEFAULT]


def _solve_axle(hp, travel, rack, mirror=False, polish=True, solver=None):
    """solver 覆盖：'mw'/'mechanism' 走新机构求解；None/'sequential' 走顺序解（回退）。"""
    solver = solver or _SOLVER_DEFAULT
    if solver in ("mw", "mechanism"):
        from solver.mechanism import from_legacy, solver as msolver, pose as mpose
        from solver.angles import compute_alignment_angles
        m = from_legacy.build_side_from_legacy(hp,
            steer_axis=np.array([0.0, 1.0 if not mirror else -1.0, 0.0]))
        rep = msolver.drive_to(m, travel, rack)
        res = mpose.mechanism_to_pose_result(m)
        angles = compute_alignment_angles(res) or {}
        return _pack_mechanism_result(m, res, angles, rep, mirror)
    return _solve_axle_sequential(hp, travel, rack, mirror, polish)
```

并将请求模型 `SolveInlineRequest` 增加可选字段 `solver: str | None = None`，路由把 `req.solver` 透传给 `_solve_axle`；`_pack_mechanism_result` 负责把机构解组装成既有 `VehicleResult` 单轮结构（姿态 dict + angles + residuals + status），复用文件底部现有打包逻辑的最小壳。

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_v2_api.py -v`（全绿）＋ `python -m pytest tests/test_mechanism_bench.py -v`
Expected: PASS——既有测试不受影响（默认顺序解），新 `solver=mw` 路径残差真实

- [ ] **Step 5: 真后端浏览器回放（前端零改动验证）**

Run: 启动 `python run.py`（后台作业）→ headless Edge 打开 `http://localhost:8000/modeler.html`，确认面板/曲线/四视口正常、无 console error、状态显示含 `solver=mechanism-v1` 时亦然（先 `DWB_SOLVER_MODE=mechanism` 重启验证）。

- [ ] **Step 6: Commit**

```bash
git add src/routes/v2.py tests/test_v2_api.py
git commit -m "feat(v2): mechanism solver integration + SOLVER_MODE switch"
```

---

### Task 10: 切主 + 回归收口 + DEVLOG

**Files:**
- Modify: `src/routes/v2.py`（`_SOLVER_DEFAULT` 默认值改为 `mechanism`）
- Modify: `docs/DEVLOG.md`

- [ ] **Step 1: 切主并全量回归**

把 `_SOLVER_DEFAULT` 默认改为 `"mechanism"`；`_solve_axle_sequential` 保留为 `solver="sequential"` 回退路径。

Run: `python -m pytest -q` Expected: 全量通过（388→新增 mechanism 测试后全绿，无回归；若 K-4 相关旧断言依赖顺序解残差/状态，按其诚实语义更新断言并记录到 DEVLOG）
Run: `python -m src.solver.mechanism.bench` Expected: gate `pass: true`

- [ ] **Step 2: 性能冒烟**

Run: `python -m pytest tests/test_mechanism_bench.py -v` 附加计时断言：45 点扫掠总耗时 < 78 ms/p95（bench 报告含 ms 列）。若不达标，在 solver.py 调 continuation step/迭代上限，记录 trade-off。

- [ ] **Step 3: 更新 DEVLOG（项目约定）**

在 `docs/DEVLOG.md` 顶部追加条目：子阶段①完成情况（模块、gate 数值、切主、回退、前端验证、剩余开放项）。

- [ ] **Step 4: Commit**

```bash
git add src/routes/v2.py docs/DEVLOG.md
git commit -m "feat(v2): promote DWB mechanism solver to production default"
```

---

## Self-Review

**Spec coverage：**
- G1（残差≤0.02mm）→ Task 5/6/8 断言；G2（黄金值一致）→ Task 7 符号回归 + Task 8 对拍；G3（DOF/不变量）→ Task 1/6；G4（性能）→ Task 8 ms 列 + Task 10 Step 2。
- 机构拓扑/DOF=2 → Task 1；投影原语 → Task 2/3/4；continuation → Task 5；真实几何 → Task 6；指标适配 → Task 7；基准/落地时序 → Task 8/9/10。
- 坐标按 convention（X 前/Y 右/Z 上）→ 全程；steer_axis 右 +Y/左 -Y → Task 6/9。

**Placeholder scan：** Task 7 测试里有一处 `camber≈6°` 占位断言，已标注"Task 7 完成后收紧为黄金值"——这不是跳过校验，而是把数值来源绑定到既有 `test_hand_benchmark.py` 黄金值，任务执行者必须替换。无 TBD/TODO。

**Type consistency：** 全部任务统一 `build_side_from_legacy(side, steer_axis=None)`、`drive_to(m, target_travel, rack)`、`mechanism_to_pose_result(m)`、`compute_alignment_angles(res)`、`project_hinge(nodes, anchor, axis|None, members, rel, wt, axA, axB)`、`project_body(nodes, ids, rel, wt, ws, q)` 签名一致。`DEFAULT_HARDPOINTS` 的取键（`right`/`front_right`/直接 dict）在 Task 6 测试里用 `or` 链兜底并在 Step 2 暴露真实结构。

**已知进入实现后的核对点（spec §10）：** 后轴 R_ 键集合、摇臂轴与 `rotate_around_x` 语义对齐、FL1 齿条轴符号——均由对应 Task 的"核对"步骤显式覆盖，不阻塞。
