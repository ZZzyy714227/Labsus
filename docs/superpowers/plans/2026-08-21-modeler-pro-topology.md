# modeler 传动链 PRO 拓扑替换 + 视觉对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 modeler 的悬架建模从「推杆挂立柱 + 单点 X 轴摇臂 + 假弹簧」替换为 DWB-SIM PRO 拓扑（STRUT_OUT 挂 LCA/UCA、两点轴摇臂、内置减振器），前端按 API 真值渲染完整传动链 + 对齐 DWB-SIM 视觉细节。

**Architecture:** 后端机制求解器重建（`solver/mechanism/`）+ 数据模型扩展（POINT_KEYS +3、ActuationChain 下发）+ 前端渲染替换（STRUT 杆/摇臂三角/内置减振器图元）+ 坐标换算脚本（PRO 坐标 → FSAE 尺寸）。mechanism 为生产默认求解器；sequential 回退路径同步填充 actuation。

**Tech Stack:** Python FastAPI + scipy least_squares + Pydantic；单文件 HTML/JS (modeler.html) + Canvas 2D。

**Spec:** `docs/superpowers/specs/2026-08-21-modeler-actuation-visual-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/core/models.py` | POINT_KEYS、AxleHardpoints | Modify：+3 键（可缺省） |
| `src/core/results.py` | ActuationChain、WheelPose | Modify：+模型 +字段 |
| `src/config.py` | DEFAULT_FRAME_NODES、DESIGN_PARAMS | Modify：+RCK_AX_A/B、strut 比例参数 |
| `src/hardpoints.py` | derive_hardpoints | Modify：+STRUT_OUT 派生 |
| `src/geometry.py` | rotate_around_axis | Modify：+Rodrigues |
| `src/solver/mechanism/models.py` | build_mechanism | Modify：拓扑重建 |
| `src/solver/mechanism/solver.py` | solve_rocker | Modify：任意轴+最近根 |
| `src/solver/mechanism/v2adapter.py` | 角解适配 | Modify：新键/frame/strut_on |
| `src/solver/mechanism/pose.py` | pose 导出 | Modify：+新键 |
| `src/solver/mechanism/from_legacy.py` | 键映射 | Modify：+新键 |
| `src/routes/v2.py` | _wheel_pose / actuation | Modify：+填充 |
| `src/core/legacy_import.py` | 指纹刷新 | Modify |
| `web/modeler.html` | 前端全部 | Modify：数据+渲染+视觉 |
| `tests/test_actuation.py` | 新测试 | Create |
| `tests/test_mechanism_*.py` / bench | 快照更新 | Modify |
| `docs/DEVLOG.md` | 记录 | Modify |

---

## Task 1: 数据模型扩展（POINT_KEYS + ActuationChain）

**Files:**
- Modify: `src/core/models.py:19-22`
- Modify: `src/core/results.py:49-61`
- Test: `tests/test_core_models.py`

- [ ] **Step 1: 写失败测试 — 新键可写入 AxleHardpoints**

```python
# tests/test_core_models.py 追加
def test_new_pro_keys_optional_but_valid():
    from core.models import AxleHardpoints
    base = {k: [0.0, 100.0, 200.0] for k in
            ("CH1","CH2","CH3","CH4","CH5","UP1","UP2","UP3","UP4","UP5","FL1")}
    hp = AxleHardpoints(points=base)          # 旧 11 键仍合法（新键可缺省）
    hp2 = AxleHardpoints(points={**base,
        "STRUT_OUT": [0.0, 500.0, 150.0],
        "RCK_AX_A": [0.0, 120.0, 300.0],
        "RCK_AX_B": [0.0, 80.0, 300.0]})
    assert "STRUT_OUT" in hp2.points
    assert hp2.points["RCK_AX_A"] == [0.0, 120.0, 300.0]
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_core_models.py::test_new_pro_keys_optional_but_valid -v`
Expected: FAIL — `ValidationError: invalid point keys: bad={'STRUT_OUT',...}`

- [ ] **Step 3: 实现 — POINT_KEYS +3 且允许缺省**

`src/core/models.py`:

```python
POINT_KEYS = frozenset({"CH1", "CH2", "CH3", "CH4", "CH5",
                        "UP1", "UP2", "UP3", "UP4", "UP5", "FL1"})
# PRO 拓扑新键：STRUT_OUT（推/拉杆外端，随 LCA/UCA 铰链）、
# RCK_AX_A/B（摇臂转轴两点）。为兼容存量数据允许缺省（validator 只查 bad 不查 missing）。
PRO_POINT_KEYS = frozenset({"STRUT_OUT", "RCK_AX_A", "RCK_AX_B"})
ALL_POINT_KEYS = POINT_KEYS | PRO_POINT_KEYS
```

`AxleHardpoints._check_keys` 改为：

```python
@field_validator("points")
@classmethod
def _check_keys(cls, v):
    bad = set(v) - ALL_POINT_KEYS
    if bad:
        raise ValueError(f"invalid point keys: bad={sorted(bad)}")
    return v
```

`mirrored()` / `flat()` 无需改动（遍历全部点）。

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_core_models.py -v`
Expected: PASS（含新测试）

- [ ] **Step 5: ActuationChain 模型**

`src/core/results.py` 增加（ContactPatch 之前）：

```python
class ActuationChain(BaseModel):
    """推/拉杆 + 摇臂 + 内置减振器传动链真值（随姿态更新）。"""
    kind: str                       # "pushrod" | "pullrod"
    strut_outer: list[float]        # STRUT_OUT 解算位（随 LCA/UCA 铰链旋转）
    rocker_input: list[float]       # CH5 解算位（摇臂输入臂端，随动）
    rocker_axis_a: list[float]      # RCK_AX_A（车架固定）
    rocker_axis_b: list[float]      # RCK_AX_B（车架固定）
    damper_rocker: list[float]      # RK_DAMPER 解算位（输出臂端，随动）
    damper_chassis: list[float]     # DAMPER_CHASSIS（车架固定）
    damper_len_mm: float
    damper_travel_mm: float         # 负=压缩
    strut_len_mm: float             # 推/拉杆长度（刚线恒定）
```

`WheelPose` 增加：`actuation: ActuationChain | None = None`

- [ ] **Step 6: 运行全量核心模型测试**

Run: `python -m pytest tests/test_core_models.py tests/test_store.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/models.py src/core/results.py tests/test_core_models.py
git commit -m "feat(core): PRO topology keys (STRUT_OUT/RCK_AX_A/B, optional) + ActuationChain model"
```

---

## Task 2: 几何源 — config 参数 + STRUT_OUT 派生

**Files:**
- Modify: `src/config.py`（DESIGN_PARAMS:16-104、DEFAULT_FRAME_NODES:111-127）
- Modify: `src/hardpoints.py:15-101`
- Test: `tests/test_geometry.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_geometry.py 追加
def test_strut_out_derived_on_arm_plane():
    from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS
    f = DEFAULT_HARDPOINTS
    assert "STRUT_OUT" in f          # 前轴推杆：LCA 三角面内
    r = DEFAULT_REAR_HARDPOINTS
    assert "R_STRUT_OUT" in r        # 后轴拉杆：UCA 三角面内
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_geometry.py::test_strut_out_derived_on_arm_plane -v`
Expected: FAIL — KeyError 'STRUT_OUT'

- [ ] **Step 3: config.py 增加参数**

`DESIGN_PARAMS["front"]` 追加：

```python
# PRO 拓扑：推杆外端在 LCA 上的比例位置（t=0 在 LCA 铰轴中点，1 在 LBJ）
"strut_out_t_lca": 0.35,
```

`DESIGN_PARAMS["rear"]` 追加：

```python
# PRO 拓扑：拉杆外端在 UCA 上的比例位置（t=0 在 UCA 铰轴中点，1 在 UBJ）
"strut_out_t_uca": 0.35,
```

`DEFAULT_FRAME_NODES` 摇臂区块追加：

```python
# PRO 拓扑：摇臂转轴两点（前=右，后=右；L 侧镜像）
"RCK_AX_A_R":  [0.0, 120.0, 310.0],
"RCK_AX_B_R":  [0.0, 80.0, 310.0],
"RCK_AX_A_L":  [0.0, -120.0, 310.0],
"RCK_AX_B_L":  [0.0, -80.0, 310.0],
"R_RCK_AX_A_R":  [-1550.0, 120.0, 140.0],
"R_RCK_AX_B_R":  [-1550.0, 80.0, 140.0],
"R_RCK_AX_A_L":  [-1550.0, -120.0, 140.0],
"R_RCK_AX_B_L":  [-1550.0, -80.0, 140.0],
```

（占位值；Task 3 换算脚本产出最终值后覆盖。）

- [ ] **Step 4: hardpoints.py 派生 STRUT_OUT**

`derive_hardpoints` 中 CH1-4/UP1/UP2 计算之后插入：

```python
    # ---- PRO 拓扑：推/拉杆外端 STRUT_OUT ----
    # 前轴（推杆）：LCA 三角面内，LBJ(UP2) 与 LCA 铰轴中点之间取比例点；
    # 后轴（拉杆）：UCA 三角面内，UBJ(UP1) 与 UCA 铰轴中点之间取比例点。
    lca_mid = 0.5 * (CH3 + CH4)
    uca_mid = 0.5 * (CH1 + CH2)
    t_lca = p.get("strut_out_t_lca", 0.35)
    t_uca = p.get("strut_out_t_uca", 0.35)
    STRUT_OUT = lca_mid + (UP2 - lca_mid) * t_lca if prefix == "" else \
                uca_mid + (UP1 - uca_mid) * t_uca
```

result dict 增加：`str(prefix + "STRUT_OUT"): STRUT_OUT.tolist(),`

- [ ] **Step 5: 运行确认通过**

Run: `python -m pytest tests/test_geometry.py::test_strut_out_derived_on_arm_plane -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.py src/hardpoints.py tests/test_geometry.py
git commit -m "feat(geometry): STRUT_OUT derived on LCA(front)/UCA(rear) + rocker axis frame nodes (placeholder)"
```

---

## Task 3: 坐标换算脚本 + 数值验证门（产出最终坐标）

**Files:**
- Create: `scripts/convert_pro_coords.py`（一次性工具）
- Modify: `src/config.py`（最终值）、`src/hardpoints.py`（最终参数）

- [ ] **Step 1: 写换算脚本**

`scripts/convert_pro_coords.py`：

```python
"""DWB-SIM PRO 预设坐标 -> 产品坐标系（X=前/Y=右）-> FSAE 尺寸缩放。

映射：product = (PRO_y, PRO_x * s, PRO_z)；s = 产品半轨 / PRO 半轨。
产出：STRUT_OUT/RCK_AX_A/RCK_AX_B 前/后轴默认坐标。
"""
import sys
sys.path.insert(0, "src")
import numpy as np
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix

PRO = {
    "front": {  # PRO 前悬架推杆预设（DWB 坐标 X=外侧 Y=向前）
        "half_track": 810.0,
        "STRUT_OUT": [683.4, 12.0, 205.5],
        "RCK_AX_A":  [305.3, 20.0, 366.4],
        "RCK_AX_B":  [306.1, 90.0, 365.0],
    },
    "rear": {   # PRO 后悬架拉杆预设
        "half_track": 790.0,
        "STRUT_OUT": [645.0, -15.0, 425.0],
        "RCK_AX_A":  [377.0, 30.0, 318.9],
        "RCK_AX_B":  [376.7, 90.0, 320.1],
    },
}

def to_product(pro_pt, s):
    return [round(pro_pt[1], 1), round(pro_pt[0] * s, 1), round(pro_pt[2], 1)]

def main():
    for axle, cfg in PRO.items():
        s = cfg["half_track"]
        print(f"== {axle} ==")
        for k in ("STRUT_OUT", "RCK_AX_A", "RCK_AX_B"):
            print(k, to_product(cfg[k], s))
    # 对照现有 FSAE 尺寸（用于人工复核缩放合理性）
    f = DEFAULT_HARDPOINTS
    print("front LBJ(UP2)", f["UP2"], " CH5", f["CH5"])
    r = strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_")
    print("rear  UBJ(UP1)", r["UP1"], " CH5", r["CH5"])

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行脚本并人工复核**

Run: `python scripts/convert_pro_coords.py`
Expected: 输出前后轴 STRUT_OUT/RCK_AX_A/RCK_AX_B 产品坐标。人工检查：STRUT_OUT 应在 LCA/UCA 附近（前轴 Y≈450-560、Z≈130-210；后轴 Y≈380-480、Z≈250-430）；RCK_AX_A/B 应在车架内侧（前轴 Y≈40-100、Z≈270-340）。

- [ ] **Step 3: 把最终值写回 config.py**

用 Step 2 输出覆盖 Task 2 Step 3 的占位值（RCK_AX_A/B 八项）。

- [ ] **Step 4: 数值验证门（复用调参脚本改造）**

创建 `scripts/check_pro_topology.py`：

```python
"""PRO 拓扑数值门：前后轴 ±45mm 无翻转、+10 压缩/-10 伸张、MR 范围。"""
import sys
sys.path.insert(0, "src")
import math
import numpy as np
from config import DEFAULT_FRAME_NODES
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix
from solver.mechanism.v2adapter import solve_corner_mechanism

def gate(name, hp, lo=-45.0, hi=45.0):
    print(f"== {name} ==")
    for tr in (lo, -10.0, 0.0, 10.0, hi):
        result, angles, residual, cp, rocker, rok = solve_corner_mechanism(hp, tr, 0.0)
        if not rocker:
            print(f"  travel {tr:+6.1f} ROCKER UNREACHABLE res={residual:.2e}")
            continue
        deg = rocker["rocker_angle_deg"] or 0.0
        dt = rocker["damper_travel"]
        print(f"  travel {tr:+6.1f} damper_travel {dt:+8.3f} rocker {deg:+7.2f}deg res {residual:.2e}")
    assert abs((rocker["damper_travel"])) < 30, "无荒谬行程"

def main():
    f = dict(DEFAULT_HARDPOINTS); f["track_width"] = 1220.0
    r = strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_"); r["track_width"] = 1180.0
    gate("FRONT", f)
    gate("REAR", r)
    print("GATE PASS: 无翻转、无荒谬行程")

if __name__ == "__main__":
    main()
```

Run: `python scripts/check_pro_topology.py`
Expected: 输出前后轴行程表，最后 `GATE PASS`；人工核对：+10mm→damper_travel<0（压缩）、−10mm→>0（伸张）、|rocker_deg|<60。若后轴仍翻转：调整 `strut_out_t_uca` 与 RCK_AX 坐标（微调 Z）后重跑。

- [ ] **Step 5: Commit**

```bash
git add scripts/convert_pro_coords.py scripts/check_pro_topology.py src/config.py src/hardpoints.py
git commit -m "feat(geometry): PRO coords converted to FSAE scale + topology numerical gates pass"
```

---

## Task 4: 机构重建 — build_mechanism + solve_rocker

**Files:**
- Modify: `src/geometry.py`（+rotate_around_axis）
- Modify: `src/solver/mechanism/models.py`
- Modify: `src/solver/mechanism/solver.py`
- Test: `tests/test_mechanism_solver.py`

- [ ] **Step 1: 写失败测试 — 摇臂绕任意轴**

```python
# tests/test_mechanism_solver.py 追加
def test_rocker_rotates_about_two_point_axis():
    import numpy as np
    from geometry import rotate_around_axis
    p = np.array([0.0, 0.0, 100.0])
    axis_pt = np.array([0.0, 0.0, 0.0])
    axis_dir = np.array([0.0, 1.0, 0.0])     # Y 轴
    out = rotate_around_axis(p, axis_pt, axis_dir, np.pi / 2)
    # 绕 Y 旋转 90°：X 轴分量转到 Z
    assert abs(out[2] - 100.0) < 1e-9 and abs(out[0] + 100.0) < 1e-9
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_mechanism_solver.py::test_rocker_rotates_about_two_point_axis -v`
Expected: FAIL — ImportError rotate_around_axis

- [ ] **Step 3: geometry.py 增 Rodrigues**

`src/geometry.py` 追加：

```python
def rotate_around_axis(pt, axis_pt, axis_dir, theta):
    """Rodrigues 旋转：pt 绕过 axis_pt、方向 axis_dir 的轴转 theta 弧度。"""
    p = np.asarray(pt, dtype=float)
    o = np.asarray(axis_pt, dtype=float)
    u = np.asarray(axis_dir, dtype=float)
    n = float(np.linalg.norm(u))
    if n < 1e-12:
        return p.copy()
    u = u / n
    c, s = math.cos(theta), math.sin(theta)
    v = p - o
    return o + v * c + np.cross(u, v) * s + u * (u @ v) * (1.0 - c)
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_mechanism_solver.py::test_rocker_rotates_about_two_point_axis -v`
Expected: PASS

- [ ] **Step 5: build_mechanism 拓扑重建**

`src/solver/mechanism/models.py`：

- 签名加 `strut_on: str = "lca"`（`"lca" | "uca"`）
- LCA 铰链簇 members：`["UP2"] + (["STRUT_OUT"] if strut_on == "lca" else [])`
- UCA 铰链簇 members：`["UP1"] + (["STRUT_OUT"] if strut_on == "uca" else [])`
- 摇臂簇改为两点轴：

```python
rck_a = nodes["RCK_AX_A"].p0
rck_b = nodes["RCK_AX_B"].p0
_axis("rocker", "ROCKER", "RCK_AX_A", ["CH5", "RK_DAMPER"],
      axis=_unit(rck_b - rck_a), axA="RCK_AX_A", axB="RCK_AX_B")
```

- links 替换：

```python
Link(id="STRUT", a="STRUT_OUT", b="CH5", kind="R",
     L0=float(np.linalg.norm(nodes["STRUT_OUT"].p0 - nodes["CH5"].p0)), Ld=0.0),
Link(id="TIE", a=tie_outer, b=tie_inner, kind="R", ...),   # 原样
Link(id="DAMPER", a="RK_DAMPER", b="DAMPER_CHASSIS", kind="E",
     L0=float(np.linalg.norm(nodes["RK_DAMPER"].p0 - nodes["DAMPER_CHASSIS"].p0)), Ld=0.0),
```

- `_FIXED` 改为：`{"CH1","CH2","CH3","CH4","RCK_AX_A","RCK_AX_B","DAMPER_CHASSIS","FL1"}`
- `Mechanism` dataclass 加字段：`last_theta: float | None = None`
- `wheel` 驱动点不变（UP5）；`steer_anchor` 不变

- [ ] **Step 6: solve_rocker 重写（任意轴 + 最近根）**

`src/solver/mechanism/solver.py` 的 `solve_rocker` 整体替换：

```python
def solve_rocker(m: Mechanism, span_deg: float = 160.0, step_deg: float = 10.0):
    """摇臂后处理：绕 RCK_AX_A→B 轴解 θ 使 |rot(STRUT_OUT→CH5 链)| 成立。

    分支选择：全括号粗扫 → 二分求根 → 取 |θ| 最小（continuation 最近根优先）。
    返回 (ok, theta_rad, damper_len_mm)；不可达 ok=False。
    """
    pivot = m.node("RCK_AX_A").p0
    axis = m.node("RCK_AX_B").p0 - pivot
    ch5_0 = m.node("CH5").p0
    dmp_0 = m.node("RK_DAMPER").p0
    up4 = m.node("STRUT_OUT").pos
    l_strut = float(np.linalg.norm(m.node("STRUT_OUT").p0 - ch5_0))
    if l_strut < 1.0:
        return False, None, None

    def err(t: float) -> float:
        rot = rotate_around_axis(ch5_0, pivot, axis, t)
        return float(np.linalg.norm(rot - up4)) - l_strut

    e0 = err(0.0)
    if abs(e0) < 1e-9:
        theta = 0.0
    else:
        n = int(span_deg / step_deg)
        grid = [i * math.radians(step_deg) for i in range(-n, n + 1)]
        vals = [err(t) for t in grid]
        roots: list[float] = []
        for i in range(len(grid) - 1):
            if vals[i] == 0.0:
                roots.append(grid[i])
            elif vals[i] * vals[i + 1] < 0.0:
                lo, hi, flo = grid[i], grid[i + 1], vals[i]
                for _ in range(60):
                    mid = 0.5 * (lo + hi)
                    fm = err(mid)
                    if flo * fm <= 0.0:
                        hi = mid
                    else:
                        lo, flo = mid, fm
                roots.append(0.5 * (lo + hi))
        if vals[-1] == 0.0:
            roots.append(grid[-1])
        if not roots:
            return False, None, None
        prev = getattr(m, "last_theta", None)
        theta = min(roots, key=lambda r: abs(r - prev)) if prev is not None \
            else min(roots, key=abs)
    if abs(theta) > math.pi / 2.0:
        return False, None, None
    m.last_theta = theta
    m.node("CH5").pos = rotate_around_axis(ch5_0, pivot, axis, theta)
    dmp = rotate_around_axis(dmp_0, pivot, axis, theta)
    m.node("RK_DAMPER").pos = dmp
    damper_len = float(np.linalg.norm(dmp - m.node("DAMPER_CHASSIS").p0))
    return True, theta, damper_len
```

（import 行：`from geometry import distance_point_to_line, rotate_around_axis`）

- [ ] **Step 7: 运行机制求解器测试**

Run: `python -m pytest tests/test_mechanism_solver.py tests/test_mechanism_pose.py -v`
Expected: 预期 1-2 个旧断言因拓扑变更失败（如 PUSHROD link 名）——按新拓扑更新断言（link 名 `STRUT`、节点数变化），记录理由。

- [ ] **Step 8: Commit**

```bash
git add src/geometry.py src/solver/mechanism/
git commit -m "feat(mech): PRO topology — strut on arm, 2-point rocker axis, nearest-root branch fix"
```

---

## Task 5: 适配层 — v2adapter / pose / from_legacy / sequential

**Files:**
- Modify: `src/solver/mechanism/v2adapter.py`
- Modify: `src/solver/mechanism/pose.py`
- Modify: `src/solver/mechanism/from_legacy.py`
- Test: `tests/test_mechanism_project.py`

- [ ] **Step 1: v2adapter 更新**

`_HARD_KEYS` 增加 `"STRUT_OUT"`；`_RESULT_KEYS` 增加 `"STRUT_OUT","RCK_AX_A","RCK_AX_B"`。

`_frame_points` 改为：

```python
def _frame_points(is_rear: bool, is_left: bool) -> dict[str, np.ndarray]:
    if is_rear:
        base = {
            "RCK_AX_A": DEFAULT_FRAME_NODES["R_RCK_AX_A_R"],
            "RCK_AX_B": DEFAULT_FRAME_NODES["R_RCK_AX_B_R"],
            "DAMPER_CHASSIS": DEFAULT_FRAME_NODES["R_DAMPER_CHASSIS_RR"],
        }
    else:
        base = {
            "RCK_AX_A": DEFAULT_FRAME_NODES["RCK_AX_A_R"],
            "RCK_AX_B": DEFAULT_FRAME_NODES["RCK_AX_B_R"],
            "DAMPER_CHASSIS": DEFAULT_FRAME_NODES["DAMPER_CHASSIS_FR"],
        }
    if is_left:
        base = {k: [v[0], -v[1], v[2]] for k, v in base.items()}
    return {k: np.asarray(v, dtype=float) for k, v in base.items()}
```

`solve_corner_mechanism` 调用改为：

```python
strut_on = "uca" if is_rear else "lca"
m = build_mechanism(pts, steer_axis=np.array([0.0, 1.0, 0.0]), strut_on=strut_on)
```

rocker 输出块改键名（damper_len_current 等字段名不变；补 `strut_len_mm`）：

```python
rocker = {
    "damper_len_current": dmp_cur,
    "damper_len_design": dmp_design,
    "damper_travel": dmp_cur - dmp_design,
    "strut_len_mm": l_strut,
    "rocker_angle_deg": math.degrees(rep.rocker_theta) if rep.rocker_theta is not None else None,
}
```

- [ ] **Step 2: pose.py 更新**

`_POSE_KEYS` 增加 `"STRUT_OUT","RCK_AX_A","RCK_AX_B"`。

- [ ] **Step 3: from_legacy.py 更新**

`_RESULT_MAP` 增加三键映射（前：`STRUT_OUT→STRUT_OUT`（同键，无 R_ 前缀时）、`RCK_AX_A→RCK_AX_A`、`RCK_AX_B→RCK_AX_B`；后：`R_` 前缀同理）。

- [ ] **Step 4: 运行适配层测试**

Run: `python -m pytest tests/test_mechanism_project.py tests/test_mechanism_bench.py -v`
Expected: bench 快照因拓扑变化更新——运行 `python -m pytest tests/test_mechanism_bench.py -v` 查看具体断言，更新为新的 golden 数值（记录理由：拓扑变更）。

- [ ] **Step 5: Commit**

```bash
git add src/solver/mechanism/
git commit -m "feat(mech): adapter/pose/legacy mapping for PRO keys + strut_on"
```

---

## Task 6: API 层 — actuation 填充（mechanism + sequential 双路径）

**Files:**
- Modify: `src/routes/v2.py:121-142`（_wheel_pose）、`src/routes/v2.py:240-277`（_solve_corner）
- Test: `tests/test_v2_api.py`

- [ ] **Step 1: 写失败测试 — API 响应含 actuation**

```python
# tests/test_v2_api.py 追加
class TestActuation:
    def test_inline_solve_has_actuation(self, client):
        from tests.conftest import sample_hardpoints  # 若存在，否则用 dict(DEFAULT_HARDPOINTS)
        from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix
        fr = {k: list(v) for k, v in DEFAULT_HARDPOINTS.items() if isinstance(v, list)}
        rr = {k: list(v) for k, v in strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_").items()
              if isinstance(v, list)}
        body = {
            "front_right": {"points": fr, "tire": {"track_width": 1220}},
            "rear_right": {"points": rr, "tire": {"track_width": 1180}},
        }
        r = client.post("/api/v2/solve/hardpoints", json=body)
        assert r.status_code == 200
        d = r.json()
        g = d["per_wheel_geometry"]
        for corner in ("front_right", "front_left", "rear_right", "rear_left"):
            a = g[corner]["actuation"]
            assert a is not None
            assert a["kind"] in ("pushrod", "pullrod")
            # 自洽：damper_len == |damper_rocker - damper_chassis|
            import numpy as np
            dl = np.linalg.norm(np.array(a["damper_rocker"]) - np.array(a["damper_chassis"]))
            assert abs(dl - a["damper_len_mm"]) < 1e-3
            sl = np.linalg.norm(np.array(a["strut_outer"]) - np.array(a["rocker_input"]))
            assert abs(sl - a["strut_len_mm"]) < 1e-3
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_v2_api.py::TestActuation -v`
Expected: FAIL — KeyError 'actuation'

- [ ] **Step 3: 实现 — _wheel_pose 增 actuation 参数**

`v2.py` 顶部 import ActuationChain。`_wheel_pose` 签名加 `actuation: ActuationChain | None = None`，返回前挂上：

```python
pose = WheelPose(..., actuation=actuation)
```

`_solve_corner` 内组装：

```python
act = _build_actuation(sol, mode, hp)
pose = _wheel_pose("", travel, result, angles, cp, actuation=act)
```

新增辅助函数：

```python
def _build_actuation(sol: dict, mode: str, hp_flat: dict) -> ActuationChain | None:
    """从求解结果组装传动链真值。mechanism 路径 result 已含全部节点；
    sequential 路径用 rocker_angle + 框架节点重算三点。"""
    import numpy as np
    result = sol["result"]
    try:
        ch5 = [float(v) for v in result["CH5"]]
        a = [float(v) for v in result["RCK_AX_A"]]
        b = [float(v) for v in result["RCK_AX_B"]]
        dmp = [float(v) for v in result["RK_DAMPER"]]
        dch = [float(v) for v in result["DAMPER_CHASSIS"]]
        sout = [float(v) for v in result["STRUT_OUT"]]
    except (KeyError, TypeError):
        return None
    rocker = sol.get("rocker") or {}
    dlen = float(rocker.get("damper_len_current")) if rocker.get("damper_len_current") is not None \
        else float(np.linalg.norm(np.asarray(dmp) - np.asarray(dch)))
    dtr = float(rocker.get("damper_travel", 0.0) or 0.0)
    slen = float(np.linalg.norm(np.asarray(sout) - np.asarray(ch5)))
    kind = "pullrod" if ch5[2] < a[2] else "pushrod"
    return ActuationChain(
        kind=kind, strut_outer=sout, rocker_input=ch5,
        rocker_axis_a=a, rocker_axis_b=b,
        damper_rocker=dmp, damper_chassis=dch,
        damper_len_mm=round(dlen, 3), damper_travel_mm=round(dtr, 3),
        strut_len_mm=round(slen, 3))
```

（sequential 路径：`_solve_axle` 的 result 无 RK_*/STRUT_OUT 键时 `_build_actuation` 返回 None——测试以 mechanism 默认模式为准。）

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_v2_api.py::TestActuation -v`
Expected: PASS

- [ ] **Step 5: 运行 v2 相关全量**

Run: `python -m pytest tests/test_v2_api.py -v`
Expected: 全 PASS（若有旧断言依赖 result 键集合变化，按新拓扑更新）

- [ ] **Step 6: Commit**

```bash
git add src/routes/v2.py tests/test_v2_api.py
git commit -m "feat(api): actuation chain in per_wheel_geometry (mechanism + sequential)"
```

---

## Task 7: legacy_import 指纹刷新

**Files:**
- Modify: `src/core/legacy_import.py`
- Test: `tests/test_legacy_import.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_legacy_import.py 追加
def test_fingerprint_refresh_adds_version(tmp_path, monkeypatch):
    import hashlib, json
    from core.legacy_import import build_legacy_design_version, ensure_legacy_import
    from core.store import DataStore
    store = DataStore(tmp_path / "store")
    d = build_legacy_design_version()
    fp = d.notes.split("src=")[-1][:8]
    ensure_legacy_import(store)
    assert store.list_designs()[0]["latest"] == 1
    # 模拟 config 变化：直接调用带不同指纹的构建
    d2 = build_legacy_design_version()
    d2.notes = d2.notes.replace(fp, "deadbeef")
    store.add_design_version("legacy-import", d2)
    assert store.get_design("legacy-import").version == 2
```

- [ ] **Step 2: 实现**

`build_legacy_design_version()` 加指纹：

```python
import hashlib, json
from config import DESIGN_PARAMS, DEFAULT_FRAME_NODES

def _source_fingerprint() -> str:
    payload = json.dumps({"design": DESIGN_PARAMS, "frame_nodes": DEFAULT_FRAME_NODES},
                         sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:8]
```

notes 改为：`f"启动时从 DESIGN_PARAMS/DEFAULT_FRAME_NODES 导入 (src={_source_fingerprint()})"`

`ensure_legacy_import` 改为：

```python
def ensure_legacy_import(store: DataStore) -> str:
    if not any(d["design_id"] == LEGACY_DESIGN_ID for d in store.list_designs()):
        store.create_design(build_legacy_design_version(), design_id=LEGACY_DESIGN_ID)
        return LEGACY_DESIGN_ID
    cur = store.get_design(LEGACY_DESIGN_ID)
    fp = _source_fingerprint()
    if f"src={fp}" not in (cur.notes or ""):
        store.add_design_version(LEGACY_DESIGN_ID, build_legacy_design_version())
    return LEGACY_DESIGN_ID
```

- [ ] **Step 3: 运行测试**

Run: `python -m pytest tests/test_legacy_import.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/legacy_import.py tests/test_legacy_import.py
git commit -m "feat(store): legacy-import source fingerprint refresh (config change -> new version)"
```

---

## Task 8: 前端数据层 — modeler.html 新键 + 姿态接入

**Files:**
- Modify: `web/modeler.html`

- [ ] **Step 1: POINT_NAMES / SEED / FIXED 扩展**

`POINT_NAMES`（modeler.html:359-362）增加：

```javascript
"STRUT_OUT":"推/拉杆外端","RCK_AX_A":"摇臂轴前","RCK_AX_B":"摇臂轴后"
```

`CH5` 名称改 `"摇臂输入"`，`UP4` 保持（历史点）。

`FIXED`（modeler.html:363）改为：

```javascript
const FIXED=new Set(["CH1","CH2","CH3","CH4","RCK_AX_A","RCK_AX_B","DAMPER_CHASSIS","FL1"]);
```

注意：DAMPER_CHASSIS/RK_DAMPER/CH5 不在 S.frontR 模板里（来自 actuation），FIXED 仅影响模板内键的样式。

`SEED`（modeler.html:365-369）增加三键（用 Task 3 Step 2 产出值，示例占位）：

```javascript
STRUT_OUT:[0,510,170],RCK_AX_A:[20,95,310],RCK_AX_B:[90,95,310],
```

- [ ] **Step 2: displayCorner 接入 actuation**

`displayCorner`（modeler.html:582-598）在返回对象中加：

```javascript
function displayCorner(tpl,pose,angles,sx){
  ...
  const act=pose&&pose.actuation?pose.actuation:null;
  return {tpl:tpl,pt:pt,angles:angles||{},wc:wc,sx:sx,pose:pose||null,act:act};
}
```

`buildSkeleton` 无需改动（pose 已透传）。

- [ ] **Step 3: 硬点表允许新键编辑**

`buildTable` 循环已遍历全部键（`Object.keys(w)`），SEED/后端数据含新键后自动出现；`refreshTableInputs` 无需改动。

- [ ] **Step 4: node 校验**

Run: `node --check web/modeler.html` 不支持 HTML——用 `node -e "const s=require('fs').readFileSync('web/modeler.html','utf8');new Function(s.slice(s.indexOf('<script>')+8,s.lastIndexOf('</script>')));console.log('JS OK')"`
Expected: `JS OK`

- [ ] **Step 5: Commit**

```bash
git add web/modeler.html
git commit -m "feat(modeler): PRO keys in names/seed/fixed + actuation pose passthrough"
```

---

## Task 9: 前端渲染 — STRUT 杆 / 摇臂三角 / 内置减振器

**Files:**
- Modify: `web/modeler.html`（buildScene 内 sh.spring 分支替换，约 689-697 行）

- [ ] **Step 1: 替换假弹簧分支为新链条图元**

`buildScene` 中 `if(sh.spring){...}` 整块替换为：

```javascript
if(sh.spring&&d.act){
  const A=d.act;
  const P1=A.strut_outer,P2=A.rocker_input,RA=A.rocker_axis_a,RB=A.rocker_axis_b,
        RD=A.damper_rocker,DCH=A.damper_chassis;
  /* 推/拉杆 */
  cyl(sc,P1,P2,7,CC.rig,1.2,10);
  /* 摇臂三角：轴 A-B + 双臂 */
  cyl(sc,RA,RB,10,CC.arb,1.2,10);
  L3(sc,RA,P2,CC.arb,2.2,undefined,al);
  L3(sc,RA,RD,CC.arb,2.2,undefined,al);
  L3(sc,RB,P2,CC.arb,1.2,undefined,al);
  L3(sc,RB,RD,CC.arb,1.2,undefined,al);
  PL(sc,[RA,P2,RD,RA],CC.arb,1,null,"rgba(84,10,255,0.15)",al);
  /* 内置减振器：减振杆 + 线圈 + 弹簧座 */
  const u=nrm(sub(DCH,RD)),L=dst(RD,DCH)||1;
  const bodyA=add(RD,mul(u,L*0.06)),bodyB=add(RD,mul(u,L*0.52));
  cyl(sc,bodyA,bodyB,13,CC.rig,1,10);
  L3(sc,bodyB,DCH,CC.rig,2,undefined,al);
  PL(sc,springPts(add(RD,mul(u,L*0.10)),add(DCH,mul(u,-L*0.055)),30,7,72),CC.ela,1.6,undefined,undefined,al);
  PL(sc,circPts(add(RD,mul(u,L*0.09)),u,36,16),CC.ela,1,undefined,undefined,al);
  PL(sc,circPts(add(DCH,mul(u,-L*0.05)),u,36,16),CC.ela,1,undefined,undefined,al);
  /* 球头环 */
  [[P1,8],[P2,8],[RD,8]].forEach(q=>{
    PL(sc,circPts(q[0],[1,0,0],q[1],8),CC.rig,0.8,undefined,undefined,al);
    PL(sc,circPts(q[0],[0,1,0],q[1],8),CC.rig,0.8,undefined,undefined,al);
    PL(sc,circPts(q[0],[0,0,1],q[1],8),CC.rig,0.8,undefined,undefined,al);
  });
}
```

注意：`PL` 的填充色参数第 5 位，alpha 第 7 位（与现有调用一致）；CC.arb 用紫色防倾杆色（与 legend 联动），摇臂三角用半透明紫。

- [ ] **Step 2: 显示开关语义**

`sh.spring` 开关含义变为「推杆+摇臂+内置减振器」——`SHOW_DEF`（modeler.html:1529-1531）把 `"spring","弹簧"` 改 `"spring","推杆/摇臂/弹簧"`。

- [ ] **Step 3: 语法校验**

Run: 同上 `new Function(...)` 校验
Expected: `JS OK`

- [ ] **Step 4: Commit**

```bash
git add web/modeler.html
git commit -m "feat(modeler): render strut rod + 2-point rocker + inboard coilover from actuation truth"
```

---

## Task 10: 视觉对齐 — 衬套 / 塔 / 转向机随动 / ARB / 车轮细分

**Files:**
- Modify: `web/modeler.html`

- [ ] **Step 1: 车架支点衬套**

`buildScene` 的 chassis 分支（约 627-641）在 CH1-4 连线后追加：

```javascript
["front_right","rear_right"].forEach(n=>{
  const r=sk[n],l=sk[n.replace("right","left")];if(!r||!l)return;
  ["CH1","CH2","CH3","CH4"].forEach(k=>{
    const o=k.endsWith("1")||k.endsWith("3")?"F":"R";
    const other=k.slice(0,-1)+o;
    const ax=nrm(sub(l.tpl[other],r.tpl[other]));
    cyl(sc,sub(r.tpl[k],mul(ax,14)),add(r.tpl[k],mul(ax,14)),13,CC.chas2,0.9,10);
  });
});
```

- [ ] **Step 2: 减振塔升级**

在现有顶板块（635-640）追加四根撑线与上支点座：

```javascript
const T=r.tpl.CH5; if(T){
  const zTop=Math.max(r.tpl.CH1[2],r.tpl.CH2[2])+45;
  [[T[0]-tw/2,T[1]-tw2/2],[T[0]+tw/2,T[1]-tw2/2],
   [T[0]-tw/2,T[1]+tw2/2],[T[0]+tw/2,T[1]+tw2/2]].forEach(c=>{
    L3(sc,[c[0],c[1],T[2]+14],[c[0],c[1],zTop],CC.chas2,0.9);
  });
  cyl(sc,[T[0],T[1],T[2]+10],[T[0],T[1],T[2]+26],16,CC.chas2,1,10);
}
```

- [ ] **Step 3: 转向机随动**

steer 分支（643-651）齿条轴端点改用解算 tie_rod_inner：

```javascript
if(sh.steer&&S.axle!=="rear"&&sk.front_right&&sk.front_left){
  const tR=sk.front_right.pose&&sk.front_right.pose.tie_rod_inner;
  const tL=sk.front_left.pose&&sk.front_left.pose.tie_rod_inner;
  const F=tR||sk.front_right.tpl.FL1, Lf=tL||sk.front_left.tpl.FL1;
  const a=[F[0],Math.abs(F[1])-14,F[2]],b=[Lf[0],-(Math.abs(Lf[1])-14),Lf[2]];
  cyl(sc,[a[0],a[1],a[2]],[b[0],b[1],b[2]],22,CC.rack,1.1,12);
  L3(sc,[F[0],Math.abs(F[1])-16,F[2]],F,CC.tie,2,undefined,0.9);
  L3(sc,[Lf[0],-(Math.abs(Lf[1])-16),Lf[2]],Lf,CC.tie,2,undefined,0.9);
}
```

- [ ] **Step 4: ARB 解析扭杆（移植 arbGeom）**

在 `buildScene` 前加辅助函数（复刻 DWB arbGeom 余弦定理）：

```javascript
function arbGeom(tpl,lbjCur,t){
  const F=tpl.CH3,B=lbjCur;
  const P0=lerp3(F,B,t);
  const xa=P0[0],ay=F[1]+60,az=(tpl.CH3[2]+tpl.CH4[2])/2+20;
  const a=ay-P0[1];
  const E0=[xa,ay-a,az];
  const ldl=dst(E0,P0);
  const P=lerp3(F,B,t);
  const A2=ay-P[1],Bz=az-P[2],R=Math.hypot(A2,Bz);
  const K=(xa-P[0])*(xa-P[0])+A2*A2+Bz*Bz+a*a-ldl*ldl;
  const c=clamp(K/(2*a*R||1e-9),-1,1);
  const f0=atan2(Bz,A2),sg=atan2(az-P0[2],ay-P0[1])>=0?1:-1;
  const psi=f0-sg*Math.acos(c);
  const E=[xa,ay-a*cos(psi),az-a*sin(psi)];
  return{xa,ay,az,a,ldl,P,P0,E,ok:abs(K/(2*a*R||1e-9))<=1};
}
```

ARB 分支（652-664）替换为：

```javascript
if(sh.arb){
  ["front_right","rear_right"].forEach(n=>{
    if(S.axle!=="both"&&n.indexOf(S.axle)!==0)return;
    const rd=sk[n],ld=sk[n.replace("right","left")];if(!rd||!ld)return;
    const g=arbGeom(rd.tpl,rd.pt.UP2,0.55);
    L3(sc,[ld.tpl.CH3[0],-g.xa,g.az],[rd.tpl.CH3[0],g.xa,g.az],CC.arb,2.6);
    L3(sc,[g.xa,g.ay,g.az],[g.E[0],g.E[1],g.E[2]],CC.arb,1.8);
    cyl(sc,g.E,g.P,6,CC.arb,0.9,8);
    if(!g.ok)TX2(sc,g.E,"ARB 超程",CC.frc,6,-6);
  });
}
```

（若 TX2 未定义，直接内联 ctx 文本或跳过警告文本——最小实现为不加警告。）

- [ ] **Step 5: 车轮细分**

`buildScene` wheel 分支（698-741）分段数：轮胎圆 26→40、胎纹 14→22、轮辋 24→32、制动盘扇叶 12→16（直接改字面量）。

- [ ] **Step 6: 语法校验 + Commit**

Run: `new Function(...)` 校验 → Expected `JS OK`

```bash
git add web/modeler.html
git commit -m "feat(modeler): DWB-aligned visuals — bushings, damper tower, rack follow, analytic ARB, wheel detail"
```

---

## Task 11: 回归与文档

**Files:**
- Create: `tests/test_actuation.py`
- Modify: `docs/DEVLOG.md`

- [ ] **Step 1: 独立测试文件**

把 Task 6 的 TestActuation 移入独立 `tests/test_actuation.py`（含符号门与 MR 门）：

```python
"""PRO 拓扑传动链门（spec §4.7）。"""
import math
import numpy as np
import pytest
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix
from solver.mechanism.v2adapter import solve_corner_mechanism

def _hp(axle):
    hp = dict(DEFAULT_HARDPOINTS) if axle == "front" else \
         strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_")
    hp["track_width"] = 1220.0 if axle == "front" else 1180.0
    return hp

@pytest.mark.parametrize("axle", ["front", "rear"])
def test_bump_compresses_rebound_extends(axle):
    for tr, expect in ((10.0, "<0"), (-10.0, ">0")):
        _, _, _, _, rocker, ok = solve_corner_mechanism(_hp(axle), tr, 0.0)
        assert ok and rocker is not None
        dt = rocker["damper_travel"]
        assert (dt < 0) == (expect == "<0")

@pytest.mark.parametrize("axle", ["front", "rear"])
def test_no_branch_flip(axle):
    for tr in (-45.0, 45.0):
        _, _, _, _, rocker, ok = solve_corner_mechanism(_hp(axle), tr, 0.0)
        assert ok and rocker is not None
        assert abs(rocker["rocker_angle_deg"] or 0.0) < 60.0
        assert abs(rocker["damper_travel"]) < 30.0

@pytest.mark.parametrize("axle", ["front", "rear"])
def test_mr_in_band(axle):
    hp = _hp(axle)
    _, _, _, _, r0, _ = solve_corner_mechanism(hp, 0.0, 0.0)
    _, _, _, _, r10, _ = solve_corner_mechanism(hp, 10.0, 0.0)
    d0, d10 = r0["damper_len_current"], r10["damper_len_current"]
    mr = abs(d10 - d0) / 10.0
    assert 0.35 <= mr <= 0.75
```

- [ ] **Step 2: 运行新测试 + 全量回归**

Run: `python -m pytest tests/test_actuation.py -v`
Expected: 3 组 ×2 参数 = PASS

Run: `python -m pytest -q`
Expected: 全部 PASS（现存 448 + 新测试；若个别快照断言失败，按新拓扑更新并注明理由）

- [ ] **Step 3: 数值验证脚本复跑**

Run: `python scripts/check_pro_topology.py`
Expected: `GATE PASS`，行程表记入 DEVLOG

- [ ] **Step 4: 浏览器人工验收清单（用户执行）**

1. 四角推/拉杆 + 摇臂 + 内置减振器可见，动画时链条随动
2. 拖硬点（含 STRUT_OUT/RCK_AX）链条即时跟随
3. 转向时齿条壳随 tie_rod_inner 平移
4. ARB 扭杆+折臂+连杆形状正常、无超程误报
5. 前/后轴切换正常，fps ≥ 40

- [ ] **Step 5: DEVLOG 同步**

`docs/DEVLOG.md` 追加「2026-08-21 — PRO 拓扑替换」条目：拓扑说明、键名方案、坐标换算方法、数值门结果、测试统计。

- [ ] **Step 6: Commit**

```bash
git add tests/test_actuation.py scripts/ docs/DEVLOG.md
git commit -m "test+docs: PRO topology gates, full regression green, DEVLOG sync"
```
