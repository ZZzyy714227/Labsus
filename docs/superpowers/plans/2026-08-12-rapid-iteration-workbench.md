# 快速迭代悬架设计工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FSAE 悬架工具重构为快速迭代设计工作台：求解器健康修复（P0）→ 4 维指标计算层（P1）→ Neo-Brutalist 工作台前端重写（P2）→ 打磨（P3）。

**Architecture:** 后端复用现有 solver 模块（bump/steering/angles/rocker），新增 `src/metrics/` 指标层（roll/dynamics/loads/targets）+ `/api/analyze` 编排端点；前端完全重写为 Vite + 原生 ES modules（无 Tailwind），新野兽派推挤式布局：左参数/中 3D/右指标盘（可展开）+ 底部快照历史。快照存 localStorage。性能关键：快速 sweep（PBD only 25 步 <500ms）替代现有 121 步 polish sweep 进入迭代路径。

**Tech Stack:** Python FastAPI + scipy + numpy；Three.js 0.160 + Chart.js 4；Vite 6；pytest + Playwright。

**前置知识：**
- 坐标系：X 前、Y 右、Z 上；原点 = 前轴中心地面
- 硬点：CH1-5 车架点，UP1-5 立柱点（UP1/UP2 = 主销上下球铰），FL1 转向拉杆内点；后轴加 `R_` 前缀
- 运行：`python run.py`（后端 :8000）+ `cd web && npx vite`（前端 :5173，代理 /api → :8001 注意改成 8000）
- 测试：`python -m pytest tests/ -q --ignore=tests/e2e`（现有 144 通过 / 3 失败）

---

# 阶段 P0 — 求解器健康

## Task 1: 双向 continuation — sweep 冷启动漂移修复

**Files:**
- Modify: `src/routes/solve.py`（sweep_axle 循环，约 :297-353）
- Test: `tests/test_sweep_smoothness.py`（现有，作为验收）

背景：`test_sweep_curves_are_smooth` 失败——121 步 sweep 在 idx 1-3（-30~-28.5mm 冷启动区）camber 每步跳 ~0.9°。根因：sweep 从 -30 开始，首点无 `prev_up` 延续，PBD-only（`abs(dz)<=15.5` 之外无 LS）漂移。修复：遍历顺序改为**从最接近 0 的点向两端展开**，0 点附近 PBD 精确，延续法保证分支连续。

- [ ] **Step 1: 确认失败基线**

Run: `python -m pytest tests/test_sweep_smoothness.py -q`
Expected: FAIL（camber big jump at idx 1: -2.063 -> -1.045）

- [ ] **Step 2: 修改 sweep_axle 为双向 continuation**

在 `src/routes/solve.py` 的 `sweep_axle` 中，把 `for i, t in enumerate(travel_vals):` 改为按"距 0 最近优先"顺序求解，结果按原索引写入：

```python
    def sweep_axle(hp, travel_vals, rack, frame_nodes=None):
        results = {k: [None] * len(travel_vals) for k in SWEEP_ANGLE_KEYS}
        pure_results = {k: [None] * len(travel_vals) for k in SWEEP_ANGLE_KEYS}
        rocker_curves = {k: [None] * len(travel_vals) for k in SWEEP_ROCKER_KEYS}
        prev_theta = 0.0
        prev_damper = None
        prev_up = None

        # Bidirectional continuation: solve from the point nearest dz=0
        # outward. Near 0 the PBD result is exact, so the LS warm-start
        # chain stays on the correct physical branch in both directions.
        order = sorted(range(len(travel_vals)), key=lambda i: abs(float(travel_vals[i])))
        for idx in order:
            t = float(travel_vals[idx])
            axle = _solve_axle(dict(hp), t, rack, mirror=False,
                               frame_nodes=frame_nodes, polish=True,
                               theta_guess=prev_theta, prev_up=prev_up)
            prev_theta = axle.get("steering_theta", 0.0)
            angles = axle["angles_right"]
            for k in SWEEP_ANGLE_KEYS:
                results[k][idx] = round(angles.get(k, 0.0), 6)

            axle_bump = _solve_axle(dict(hp), t, 0.0, mirror=False,
                                    frame_nodes=frame_nodes, polish=True,
                                    skip_steering=True, prev_up=prev_up)
            angles_bump = axle_bump["angles_right"]
            for k in SWEEP_ANGLE_KEYS:
                pure_results[k][idx] = round(angles_bump.get(k, 0.0), 6)
            prev_up = (axle_bump["right"]["UP1"], axle_bump["right"]["UP2"])

            rocker = axle.get("rocker_right")
            if rocker:
                rocker_curves["rocker_angle_deg"][idx] = rocker["rocker_angle_deg"]
                rocker_curves["damper_travel"][idx] = rocker["damper_travel"]
                if prev_damper is not None:
                    dt = t - prev_t
                    dd = rocker["damper_travel"] - prev_damper
                    rocker_curves["motion_ratio"][idx] = (
                        round(dd / dt, 4) if abs(dt) > 1e-6 else None)
                prev_damper = rocker["damper_travel"]
                prev_t = t

        results.update(rocker_curves)
        results["pure_bump"] = pure_results
        _remove_branch_jumps(results, travel_vals)
        _remove_branch_jumps(pure_results, travel_vals)
        return results
```

注意：`prev_damper`/`prev_t` 也要在循环外初始化（`prev_damper = None`），rocket 为 None 时设置 `prev_damper = None` 不更新。motion_ratio 只在有相邻前一步时计算。

- [ ] **Step 3: 跑测试验证**

Run: `python -m pytest tests/test_sweep_smoothness.py tests/test_full_validation.py::TestSweep -q`
Expected: 平滑度测试 PASS；如 idx 57 附近仍有 >0.4° 跳变，进入 Task 2（LS 全范围）后复验。

- [ ] **Step 4: Commit**

```bash
git add src/routes/solve.py tests/
git commit -m "fix: bidirectional continuation in sweep to eliminate cold-start branch drift"
```

## Task 2: LS 精化全范围启用（bump.py）

**Files:**
- Modify: `src/solver/bump.py`（solve_bump 的 run_ls 逻辑，约 :209-226）

背景：`run_ls` 目前限制 `abs(dz) <= 15.5`（无 continuation 时）。Task 1 之后 sweep 场景所有点都有合理初值；但单点/analyze 里大行程调用 `solve_bump(polish=True)` 仍可能落在限制外。去掉行程限制，无 continuation 时从 PBD 结果出发加大 margin。

- [ ] **Step 1: 修改 run_ls 逻辑**

```python
    # Stage 2: LS polish — run whenever PBD left residual, at any travel.
    # With prev_up continuation we stay on the correct branch; without it
    # the PBD result is still the best available guess (larger margin).
    nfev = pbd_result["iterations"]
    has_continuation = prev_up is not None
    run_ls = max_res > 1e-6

    if run_ls:
        if has_continuation:
            prev_up1 = np.asarray(prev_up[0], dtype=float)
            prev_up2 = np.asarray(prev_up[1], dtype=float)
            x0 = np.concatenate([prev_up1, prev_up2])
            margin = 8.0
        else:
            x0 = np.concatenate([UP1_new, UP2_new])
            margin = 12.0
```

（替换原 :209-226 整段 `# Stage 2` 到 `ub = x0 + margin`）

- [ ] **Step 2: 跑全量求解器测试**

Run: `python -m pytest tests/test_kinematics.py tests/test_full_validation.py -q`
Expected: 全部 PASS（若 test_full_validation 变慢属正常，LS 全范围触发）

- [ ] **Step 3: Commit**

```bash
git add src/solver/bump.py
git commit -m "fix: run LS refinement across full travel range"
```

## Task 3: 分支跳变后处理 — 三连跳检测

**Files:**
- Modify: `src/routes/solve.py`（`_remove_branch_jumps`，约 :215-289）
- Test: `tests/test_branch_jump_postprocess.py`（现有）

背景：`test_ramp_of_three_consecutive_jumps` 失败——`[0]*5+[1,2,3]+[0]*5` 的 3 连斜坡，window∈{1,2} 的局部中位数在斜坡中段（值恰等于邻中位数）漏检。加 window=3 pass。

- [ ] **Step 1: 修改检测窗口**

在 `_remove_branch_jumps` 中把 `for win in [1, 2]:` 改为：

```python
        # Narrow passes first, then a wide pass catches ramp clusters
        # whose middle point coincides with its local median.
        for win in [1, 2, 3]:
            jumps = _detect_jumps(ys, win)
            if not jumps:
                continue
            ys = _replace_jumps(ys, jumps)
```

- [ ] **Step 2: 验证**

Run: `python -m pytest tests/test_branch_jump_postprocess.py -q`
Expected: 13 个测试全 PASS（含 `test_smooth_ramp_unchanged`——0.2°/步的平滑斜坡 window=3 邻中位数偏差 <0.3 不误杀）

- [ ] **Step 3: Commit**

```bash
git add src/routes/solve.py
git commit -m "fix: detect 3-point ramp branch jumps with wide median pass"
```

## Task 4: F4 — 接地点 Z 固定地面

**Files:**
- Modify: `src/tire.py`（compute_contact_patch，约 :80-83）
- Test: `tests/test_full_validation.py::TestContactPatch`（现有）

背景：`z_cp = UP5_z - R_load*cos(camber)` 随轮跳飘离地面（+25mm 时 Z=25mm）。地面固定 Z=0，接地点应始终贴地（悬架分析假设路面不动）。

- [ ] **Step 1: 修改 z_cp**

```python
    x_cp = float(UP5_np[0])                     # no longitudinal shift
    y_cp = float(UP5_np[1]) - R_load * math.sin(camber_rad)
    z_cp = 0.0                                  # ground plane (fixed)
```

- [ ] **Step 2: 验证**

Run: `python -m pytest tests/test_full_validation.py -q -k "contact or Contact"` 2>&1 | tail -5
Expected: PASS；`z_cp` 恒为 0

- [ ] **Step 3: 检查前端引用（后续 P2 重写，现在只需确认无编译错误）**

Run: `grep -n "contact_patch" web/js/*.js | head -5`
Expected: 引用存在但只读字段，无影响；P2 重写时按新语义渲染。

- [ ] **Step 4: Commit**

```bash
git add src/tire.py
git commit -m "fix: pin contact patch Z to ground plane (F4)"
```

## Task 5: F6 — 管件颜色索引删除重建

**Files:**
- Modify: `src/routes/tubes.py`（delete_tube 端点）

背景：`FRAME_TUBE_COLORS` 以列表索引为 key，删除管件后索引偏移导致颜色错位。

- [ ] **Step 1: 查看现有 delete_tube**

Run: `sed -n '1,90p' src/routes/tubes.py`
Expected: 找到 `delete_tube` 端点中 `FRAME_TUBES.pop(idx)` 位置

- [ ] **Step 2: 删除后重建颜色索引**

在 `FRAME_TUBES.pop(idx)` 之后加入：

```python
    # Rebuild color index after removal: shift keys above idx down by one
    new_colors = {}
    for k, v in FRAME_TUBE_COLORS.items():
        if isinstance(k, int):
            if k < idx:
                new_colors[k] = v
            elif k > idx:
                new_colors[k - 1] = v
            # k == idx: color belonged to deleted tube, drop it
    FRAME_TUBE_COLORS.clear()
    FRAME_TUBE_COLORS.update(new_colors)
```

- [ ] **Step 3: 写回归测试**

在 `tests/test_full_validation.py::TestTubes` 中追加：

```python
    def test_delete_tube_keeps_color_index_consistent(self, client, front_hp, rear_hp):
        """删除索引 idx 的管后，idx+1 的颜色应映射到 idx（不偏移）。"""
        from config import FRAME_TUBE_COLORS, FRAME_TUBES
        n = len(FRAME_TUBES)
        if n < 2:
            pytest.skip("need >=2 tubes")
        FRAME_TUBE_COLORS.clear()
        for i in range(min(3, n)):
            FRAME_TUBE_COLORS[i] = "#aabbcc"
        idx = 1
        endpoints = FRAME_TUBES[idx]
        resp = client.post("/api/delete_tube", json={"endpoints": endpoints})
        assert resp.status_code == 200
        assert 0 in FRAME_TUBE_COLORS and 1 in FRAME_TUBE_COLORS
        assert 2 not in FRAME_TUBE_COLORS  # 原 idx+1=2 已下移到 1
```

（注意：此测试修改全局 FRAME_TUBE_COLORS，放在测试类末尾；如持久化已加载状态则先清空）

- [ ] **Step 4: 验证 + Commit**

Run: `python -m pytest tests/test_full_validation.py -q -k "delete_tube"` 2>&1 | tail -3
Expected: PASS

```bash
git add src/routes/tubes.py tests/test_full_validation.py
git commit -m "fix: rebuild tube color index after deletion (F6)"
```

- [ ] **Step 5: 全量回归**

Run: `python -m pytest tests/ -q --ignore=tests/e2e` 2>&1 | tail -3
Expected: 147 passed（144 + 新增），0 failed——P0 完成

---

# 阶段 P1 — 指标层

## Task 6: targets.py — 目标带定义与评估

**Files:**
- Create: `src/metrics/__init__.py`
- Create: `src/metrics/targets.py`
- Test: `tests/test_targets.py`

目标带数据模型：每项 `(green_lo, green_hi, warn_lo, warn_hi)`，None 表示无界；`evaluate` 返回 `"green"|"yellow"|"red"`。

- [ ] **Step 1: 创建 metrics 包与 targets**

`src/metrics/__init__.py`：
```python
"""Performance metrics layer (roll/dynamics/loads/targets)."""
```

`src/metrics/targets.py`：
```python
"""Target bands definition + evaluation (green/yellow/red)."""
from __future__ import annotations

# band = (green_lo, green_hi, warn_lo, warn_hi); None = unbounded
# warn extends beyond green on both sides; anything outside warn = red
TARGET_BANDS: dict[str, tuple] = {
    # --- kinematics (front/rear, key suffix _f/_r) ---
    "camber_delta_f":    (None, 3.5, None, 5.0),
    "camber_delta_r":    (None, 3.5, None, 5.0),
    "bump_steer_f":      (None, 1.0, None, 2.0),
    "bump_steer_r":      (None, 1.0, None, 2.0),
    "caster_delta_f":    (None, 3.0, None, 5.0),
    "caster_delta_r":    (None, 3.0, None, 5.0),
    "kpi_delta_f":       (None, 3.0, None, 5.0),
    "kpi_delta_r":       (None, 3.0, None, 5.0),
    "scrub_delta_f":     (None, 15.0, None, 25.0),
    "scrub_delta_r":     (None, 15.0, None, 25.0),
    # --- attitude ---
    "roll_gradient":     (0.8, 1.5, 0.5, 2.0),
    "rc_height":         (20.0, 60.0, 10.0, 80.0),
    "rc_height_delta":   (None, 30.0, None, 50.0),
    "anti_dive":         (20.0, 40.0, 10.0, 60.0),
    "anti_squat":        (20.0, 40.0, 10.0, 60.0),
    "jacking":           (None, 5.0, None, 15.0),
    # --- dynamics ---
    "ride_freq_f":       (2.0, 2.5, 1.7, 2.8),
    "ride_freq_r":       (2.5, 3.0, 2.2, 3.3),
    "freq_ratio":        (1.15, 1.30, 1.05, 1.40),
    "damping_ratio_f":   (0.5, 0.9, 0.3, 1.1),
    "damping_ratio_r":   (0.5, 0.9, 0.3, 1.1),
    "motion_ratio_f":    (0.5, 0.9, 0.35, 1.1),
    "motion_ratio_r":    (0.4, 1.0, 0.25, 1.2),
    "load_transfer_f":   (45.0, 55.0, 40.0, 60.0),
    # --- structural ---
    "pushrod_force":     (None, 1500.0, None, 2500.0),
    "uca_lca_force":     (None, 800.0, None, 1400.0),
    "tie_rod_force":     (None, 300.0, None, 600.0),
}

# User overrides (loaded from persistent_state.json "target_bands" section)
TARGET_BANDS_OVERRIDES: dict[str, tuple] = {}


def get_band(key: str) -> tuple:
    return TARGET_BANDS_OVERRIDES.get(key, TARGET_BANDS[key])


def set_band(key: str, band: tuple) -> None:
    TARGET_BANDS_OVERRIDES[key] = tuple(band)


def evaluate_metric(key: str, value: float) -> str:
    """Return 'green' | 'yellow' | 'red' for a metric value."""
    if value is None:
        return "green"          # not applicable → neutral
    g_lo, g_hi, w_lo, w_hi = get_band(key)
    in_green = (g_lo is None or value >= g_lo) and (g_hi is None or value <= g_hi)
    if in_green:
        return "green"
    in_warn = (w_lo is None or value >= w_lo) and (w_hi is None or value <= w_hi)
    return "yellow" if in_warn else "red"


def evaluate_all(metrics: dict[str, float]) -> list[dict]:
    """Evaluate every metric key present in `metrics`."""
    out = []
    for key, value in metrics.items():
        if key in TARGET_BANDS:
            out.append({"key": key, "value": round(float(value), 3),
                        "light": evaluate_metric(key, value)})
    return out
```

- [ ] **Step 2: 写测试**

`tests/test_targets.py`：
```python
"""Target band evaluation tests."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from metrics.targets import TARGET_BANDS, evaluate_metric, evaluate_all, set_band


def test_green_in_band():
    assert evaluate_metric("bump_steer_f", 0.5) == "green"


def test_yellow_beyond_green():
    assert evaluate_metric("bump_steer_f", 1.5) == "yellow"


def test_red_beyond_warn():
    assert evaluate_metric("bump_steer_f", 2.5) == "red"


def test_bounded_band():
    assert evaluate_metric("roll_gradient", 1.2) == "green"
    assert evaluate_metric("roll_gradient", 0.6) == "yellow"
    assert evaluate_metric("roll_gradient", 3.0) == "red"


def test_none_is_neutral():
    assert evaluate_metric("bump_steer_f", None) == "green"


def test_override_changes_result():
    set_band("bump_steer_f", (None, 1.5, None, 3.0))
    try:
        assert evaluate_metric("bump_steer_f", 1.2) == "green"
    finally:
        TARGET_BANDS_OVERRIDES.clear()


def test_evaluate_all_returns_list():
    res = evaluate_all({"bump_steer_f": 0.5, "roll_gradient": 3.0, "nonsense": 1.0})
    assert len(res) == 2          # unknown keys skipped
    assert res[0]["light"] == "green"
    assert res[1]["light"] == "red"


def test_all_preset_keys_defined():
    """Every preset band must be a 4-tuple."""
    for k, b in TARGET_BANDS.items():
        assert len(b) == 4, k
```

- [ ] **Step 3: 验证 + Commit**

Run: `python -m pytest tests/test_targets.py -q`
Expected: 8 passed

```bash
git add src/metrics/ tests/test_targets.py
git commit -m "feat: target bands definition and evaluation (metrics/targets)"
```

## Task 7: roll.py — 姿态侧倾指标

**Files:**
- Create: `src/metrics/roll.py`
- Test: `tests/test_roll.py`

算法（简化但 FSAE 够用）：
- **瞬时中心 IC**：YZ 平面侧视投影——UCA 线（CH1→UP1 投影）与 LCA 线（CH3→UP2 投影）交点；对称假设下 RC = (0, IC_y, IC_z)
- **roll gradient**：φ(°/g) = 57.3 × m·g·h / (K_f + K_r)，h = h_cg − RC_z，K = 0.5·k_wheel·t² + K_arb，k_wheel = k_spring·MR²
- **anti-dive/squat**：% = 100 × tan(θ)·L·a_x / h_cg，θ = IC−接地点连线与水平夹角
- **jacking**：侧倾时内轮升高 = (t/2)·tan(φ)·(IC 几何比)，简化为 φ 弧度 × 升举系数

- [ ] **Step 1: 实现 roll.py**

```python
"""Roll center, roll gradient, anti-dive/squat, jacking metrics."""
from __future__ import annotations

import math

import numpy as np

from geometry import closest_point_on_line, vec3


def _line_intersect_2d(p1, p2, p3, p4):
    """Intersection of 2D lines p1-p2 and p3-p4 (x=Y, y=Z plane)."""
    d1 = np.array(p2[:2], dtype=float) - np.array(p1[:2], dtype=float)
    d2 = np.array(p4[:2], dtype=float) - np.array(p3[:2], dtype=float)
    denom = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(denom) < 1e-9:
        return None                       # parallel
    t = (np.array(p3[:2], dtype=float) - np.array(p1[:2], dtype=float))
    s = (t[0] * d2[1] - t[1] * d2[0]) / denom
    return np.array([p1[0] + s * d1[0], p1[1] + s * d1[1]])


def compute_instant_center(hp, result):
    """IC from UCA (CH1-UP1) and LCA (CH3-UP2) in the YZ plane.
    `result` is a solve response with UP1/UP2 (may be design or bumped)."""
    ch1 = np.asarray(hp["CH1"], dtype=float)
    ch3 = np.asarray(hp["CH3"], dtype=float)
    up1 = np.asarray(result["UP1"], dtype=float)
    up2 = np.asarray(result["UP2"], dtype=float)
    return _line_intersect_2d(ch1, up1, ch3, up2)


def compute_roll_center(hp, result):
    """RC ≈ IC (left-right symmetric). Returns {'y','z'} or None if parallel."""
    ic = compute_instant_center(hp, result)
    if ic is None:
        return None
    return {"y": float(ic[0]), "z": float(ic[1])}


def compute_roll_gradient(vehicle, roll_stiffness_f, roll_stiffness_r, rc_z):
    """deg/g. vehicle: {mass_kg, cg_height_mm}; stiffness in N·mm/rad."""
    m = vehicle["mass_kg"]
    h = vehicle["cg_height_mm"] - rc_z          # mm
    total = roll_stiffness_f + roll_stiffness_r
    if total <= 0:
        return float("inf")
    phi_rad_per_g = (m * 9.81 * h) / total       # rad per g (a_y=g)
    return math.degrees(phi_rad_per_g)


def compute_roll_stiffness_suspension(k_spring_n_mm, mr, track_mm):
    """Wheel-rate contribution: 0.5 * k_wheel * t^2 [N·mm/rad]."""
    k_wheel = k_spring_n_mm * mr * mr
    return 0.5 * k_wheel * track_mm * track_mm


def compute_anti_dive(hp, result, wheelbase_mm, cg_height_mm, ax_g=1.2):
    """Front anti-dive %: 100 * tan(theta) * L * a_x / h_cg.
    theta = angle of IC-contact-patch line vs horizontal (front axle)."""
    ic = compute_instant_center(hp, result)
    if ic is None:
        return 0.0
    cp_y = float(result["UP5"][1])              # contact patch approx (right)
    theta = math.atan2(float(ic[1]), abs(float(ic[0]) - cp_y))
    return 100.0 * math.tan(theta) * wheelbase_mm * ax_g / cg_height_mm


def compute_anti_squat(hp, result, wheelbase_mm, cg_height_mm, ax_g=1.0):
    """Rear anti-squat % — same geometry, rear axle."""
    ic = compute_instant_center(hp, result)
    if ic is None:
        return 0.0
    cp_y = float(result["UP5"][1])
    theta = math.atan2(float(ic[1]), abs(float(ic[0]) - cp_y))
    return 100.0 * math.tan(theta) * wheelbase_mm * ax_g / cg_height_mm


def compute_jacking(roll_deg, ic_height_ratio=0.5):
    """Approx jacking rise of the inside wheel [mm]."""
    return abs(roll_deg) * ic_height_ratio
```

- [ ] **Step 2: 写测试**

`tests/test_roll.py`：
```python
"""Roll metrics tests — hand-computed geometry."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import numpy as np
from metrics.roll import (compute_instant_center, compute_roll_center,
                          compute_roll_gradient, compute_roll_stiffness_suspension,
                          compute_anti_dive)


def test_ic_intersection_horizontal_arms():
    """UCA at z=200 (y 100→300), LCA at z=50 (y 100→300): parallel → None."""
    hp = {"CH1": [0, 100, 200], "CH3": [0, 100, 50]}
    result = {"UP1": [0, 300, 200], "UP2": [0, 300, 50]}
    assert compute_instant_center(hp, result) is None


def test_ic_intersection_known():
    """UCA line y=100→300 at z=200→180; LCA y=100→300 at z=50→60.
    Both slope through the same y range; intersection outside (extended).
    Verify numerically with direct construction instead."""
    hp = {"CH1": [0, 0.0, 200.0], "CH3": [0, 0.0, 50.0]}
    result = {"UP1": [0, 100.0, 180.0], "UP2": [0, 100.0, 60.0]}
    ic = compute_instant_center(hp, result)
    assert ic is not None
    # lines: z1 = 200 - 0.2y ; z2 = 50 + 0.1y → 200-0.2y = 50+0.1y → y=500, z=100
    assert abs(ic[0] - 500.0) < 1e-6 and abs(ic[1] - 100.0) < 1e-6


def test_roll_center_symmetric():
    hp = {"CH1": [0, 0.0, 200.0], "CH3": [0, 0.0, 50.0]}
    result = {"UP1": [0, 100.0, 180.0], "UP2": [0, 100.0, 60.0]}
    rc = compute_roll_center(hp, result)
    assert rc["y"] == 500.0 and rc["z"] == 100.0


def test_roll_gradient_known():
    """m=280kg, h_cg=300mm, rc_z=100 → h=200mm.
    K=2*(0.5*30*0.7^2*840^2)*1e? — use direct numbers:
    k_spring=30 N/mm, mr=0.7, track=840 → K_f=0.5*30*0.49*840^2=5.18e6 N·mm/rad
    K_total=1.04e7 → phi = 280*9.81*200/1.04e7 = 0.0528 rad = 3.03 deg/g"""
    K_f = compute_roll_stiffness_suspension(30.0, 0.7, 840.0)
    K_total = 2 * K_f
    phi = compute_roll_gradient({"mass_kg": 280, "cg_height_mm": 300}, K_total, K_total, 100.0)
    assert abs(phi - 3.03) < 0.05, phi


def test_anti_dive_zero_when_ic_low():
    """IC at ground level → theta=0 → 0%."""
    hp = {"CH1": [0, -500.0, 0.0], "CH3": [0, -500.0, 0.0]}
    result = {"UP1": [0, 0.0, 0.0], "UP2": [0, 0.0, 0.0], "UP5": [0, 375.0, 0.0]}
    ad = compute_anti_dive(hp, result, 900.0, 300.0)
    assert abs(ad) < 1e-6
```

- [ ] **Step 3: 验证 + Commit**

Run: `python -m pytest tests/test_roll.py -q`
Expected: 5 passed

```bash
git add src/metrics/roll.py tests/test_roll.py
git commit -m "feat: roll center / roll gradient / anti-dive metrics"
```

## Task 8: dynamics.py — 动力学指标

**Files:**
- Create: `src/metrics/dynamics.py`
- Test: `tests/test_dynamics.py`

公式：
- k_wheel = k_spring × MR²（N/mm）
- ride_freq = 1/(2π) × √(k_wheel×1000 / m_sprung) Hz（k_wheel N/mm → N/m ×1000）
- 阻尼比 ζ = c_damper×MR² / (2×√(k_wheel×1000×m_sprung))，c_damper N·s/m
- 载荷转移：ΔF = m×a_y×h / t（N）；前后分配 = K_roll_f/(K_roll_f+K_roll_r)

- [ ] **Step 1: 实现 dynamics.py**

```python
"""Ride frequency, damping ratio, load transfer metrics."""
from __future__ import annotations

import math


def wheel_rate(k_spring_n_mm: float, mr: float) -> float:
    return k_spring_n_mm * mr * mr


def ride_frequency_hz(k_spring_n_mm: float, mr: float, sprung_mass_kg: float) -> float:
    kw = wheel_rate(k_spring_n_mm, mr) * 1000.0        # N/m
    return (1.0 / (2.0 * math.pi)) * math.sqrt(kw / max(sprung_mass_kg, 1e-6))


def damping_ratio(k_spring_n_mm: float, mr: float, sprung_mass_kg: float,
                  c_damper_n_s_m: float) -> float:
    kw = wheel_rate(k_spring_n_mm, mr) * 1000.0
    cc = 2.0 * math.sqrt(kw * max(sprung_mass_kg, 1e-6))
    return (c_damper_n_s_m * mr * mr) / max(cc, 1e-9)


def sprung_mass_per_corner(total_mass_kg: float, axle_frac: float,
                           unsprung_kg: float = 20.0) -> float:
    return (total_mass_kg * axle_frac - unsprung_kg) / 2.0


def load_transfer_n(total_mass_kg: float, ay_g: float, cg_height_mm: float,
                   track_mm: float) -> float:
    return total_mass_kg * ay_g * 9.81 * cg_height_mm / track_mm


def roll_stiffness_split_pct(k_roll_f, k_roll_r) -> float:
    total = k_roll_f + k_roll_r
    return 100.0 * k_roll_f / max(total, 1e-9)
```

- [ ] **Step 2: 写测试**

`tests/test_dynamics.py`：
```python
"""Dynamics metric tests — closed-form checks."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import math
from metrics.dynamics import (wheel_rate, ride_frequency_hz, damping_ratio,
                              sprung_mass_per_corner, load_transfer_n,
                              roll_stiffness_split_pct)


def test_wheel_rate():
    assert abs(wheel_rate(30.0, 0.7) - 14.7) < 1e-9


def test_ride_freq_hand():
    """k=14.7 N/mm → 14700 N/m, m=120kg → f = 1/(2π)·√(14700/120) = 1.761 Hz"""
    f = ride_frequency_hz(30.0, 0.7, 120.0)
    expected = (1 / (2 * math.pi)) * math.sqrt(14700 / 120)
    assert abs(f - expected) < 1e-9
    assert 1.7 < f < 1.8


def test_damping_ratio():
    """c=1500 N·s/m, mr=0.7 → ζ = 1500*0.49 / (2*√(14700*120)) = 735/2656 = 0.277"""
    zeta = damping_ratio(30.0, 0.7, 120.0, 1500.0)
    assert abs(zeta - 0.277) < 0.01


def test_sprung_mass():
    m = sprung_mass_per_corner(280.0, 0.5, 20.0)
    assert abs(m - 60.0) < 1e-9


def test_load_transfer():
    """280kg, 1.3g, h=300, t=840 → ΔF = 280*1.3*9.81*300/840 = 1275 N"""
    dF = load_transfer_n(280.0, 1.3, 300.0, 840.0)
    assert abs(dF - 1275.3) < 1.0


def test_roll_split():
    assert abs(roll_stiffness_split_pct(5000.0, 5000.0) - 50.0) < 1e-9
    assert abs(roll_stiffness_split_pct(7000.0, 3000.0) - 70.0) < 1e-9
```

- [ ] **Step 3: 验证 + Commit**

Run: `python -m pytest tests/test_dynamics.py -q`
Expected: 6 passed

```bash
git add src/metrics/dynamics.py tests/test_dynamics.py
git commit -m "feat: ride frequency / damping / load transfer metrics"
```

## Task 9: loads.py — 结构受力

**Files:**
- Create: `src/metrics/loads.py`
- Test: `tests/test_loads.py`

算法：工况给单轮胎力 F_tire（F_x 制动/加速、F_y 侧向、F_z 垂向）。立柱静力平衡：UCA 力沿 CH1-CH2 线方向、LCA 力沿 CH3-CH4 方向、推杆沿 UP4-CH5 方向（作用点 UP1/UP2/UP4）。3 个未知标量 × 3 分量方程 → `np.linalg.solve`。

- [ ] **Step 1: 实现 loads.py**

```python
"""Link forces under braking / cornering / acceleration (static balance)."""
from __future__ import annotations

import numpy as np

from geometry import normalize_or_default, vec3


def _axis_dir(a, b):
    """Unit direction of link from frame point a to upright point b (outboard)."""
    return normalize_or_default(vec3(np.asarray(a, dtype=float),
                                     np.asarray(b, dtype=float)))


def tire_force(static_load_n: float, ax_g: float, ay_g: float):
    """Friction model: F_x = μ·F_z along x, F_y = μ·F_z along y.
    Longitudinal and lateral decouple (pure braking / pure cornering cases)."""
    fz = static_load_n
    fx = fz * ax_g
    fy = fz * ay_g
    return np.array([fx, fy, fz], dtype=float)


def solve_link_forces(hp, result, f_tire):
    """Static balance on upright: f_uca·d_uca + f_lca·d_lca + f_pr·d_pr = -f_tire.
    Returns dict with forces in N (positive = tension) or None if singular."""
    d_uca = _axis_dir(hp["CH1"], result["UP1"])     # ≈ CH1→UP1 direction
    d_lca = _axis_dir(hp["CH3"], result["UP2"])
    d_pr = _axis_dir(hp["CH5"], result["UP4"])
    A = np.column_stack([d_uca, d_lca, d_pr])
    try:
        f = np.linalg.solve(A, -np.asarray(f_tire, dtype=float))
    except np.linalg.LinAlgError:
        return None
    return {"f_uca": float(f[0]), "f_lca": float(f[1]), "f_pushrod": float(f[2])}


def max_abs(forces: dict | None) -> float:
    if forces is None:
        return float("inf")
    return max(abs(v) for v in forces.values())
```

- [ ] **Step 2: 写测试**

`tests/test_loads.py`：
```python
"""Link force tests — force balance closes exactly."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import numpy as np
from metrics.loads import solve_link_forces, tire_force, max_abs


def test_force_balance_closes():
    """Reconstructed forces must sum to -F_tire within 1e-9."""
    hp = {"CH1": [-60, 245, 200], "CH3": [-80, 235, 42],
          "CH5": [10, 118, 228]}
    result = {"UP1": [10, 400, 190], "UP2": [10, 400, 78],
              "UP4": [20, 380, 140]}
    f_tire = tire_force(1300.0, 1.2, 0.0)
    forces = solve_link_forces(hp, result, f_tire)
    assert forces is not None
    d_uca = hp["CH1"] - np.array(result["UP1"]); d_uca /= np.linalg.norm(d_uca)
    d_lca = hp["CH3"] - np.array(result["UP2"]); d_lca /= np.linalg.norm(d_lca)
    d_pr = hp["CH5"] - np.array(result["UP4"]); d_pr /= np.linalg.norm(d_pr)
    s = forces["f_uca"]*d_uca + forces["f_lca"]*d_lca + forces["f_pushrod"]*d_pr
    assert np.allclose(s, -f_tire, atol=1e-6)


def test_tire_force_braking():
    f = tire_force(1000.0, 1.2, 0.0)
    assert np.allclose(f, [1200.0, 0.0, 1000.0])


def test_tire_force_cornering():
    f = tire_force(1000.0, 0.0, 1.3)
    assert np.allclose(f, [0.0, 1300.0, 1000.0])


def test_singular_geometry_returns_none():
    """Collinear links → singular matrix → None."""
    hp = {"CH1": [0, 0, 0], "CH3": [0, 0, 0], "CH5": [0, 0, 0]}
    result = {"UP1": [1, 0, 0], "UP2": [2, 0, 0], "UP4": [3, 0, 0]}
    assert solve_link_forces(hp, result, [1, 0, 0]) is None


def test_max_abs():
    assert max_abs(None) == float("inf")
    assert max_abs({"f_uca": -5.0, "f_lca": 3.0, "f_pushrod": -120.0}) == 120.0
```

- [ ] **Step 3: 验证 + Commit**

Run: `python -m pytest tests/test_loads.py -q`
Expected: 4 passed

```bash
git add src/metrics/loads.py tests/test_loads.py
git commit -m "feat: link force static balance under load cases"
```

## Task 10: analyze 编排 + vehicle/targets 端点 + 持久化

**Files:**
- Create: `src/routes/analyze.py`
- Modify: `src/api_models.py`（+AnalyzeRequest/VehicleRequest/TargetsRequest）
- Modify: `src/persistence.py`（+vehicle_params/target_bands section）
- Modify: `src/main.py`（注册 router）
- Test: `tests/test_analyze.py`

数据模型：
```python
VEHICLE_DEFAULTS = {
    "mass_kg": 280.0, "front_axle_frac": 0.50, "rear_axle_frac": 0.50,
    "cg_height_mm": 300.0, "wheelbase_mm": 900.0,
    "front_track_mm": 840.0, "rear_track_mm": 690.0,
    "k_spring_f": 30.0, "k_spring_r": 40.0,          # N/mm
    "c_damper_f": 1500.0, "c_damper_r": 1800.0,      # N·s/m
    "k_arb_f": 200.0, "k_arb_r": 300.0,              # N·mm/rad ×1000 简化: N·m/rad
    "ax_brake": 1.2, "ax_accel": 1.0, "ay_corner": 1.3,
    "unsprung_kg": 20.0,
}
```
（k_arb 单位用 N·mm/rad，数值 ~1e6；上面 ×1000 是笔误，实现里直接 N·mm/rad，预置 5.0e5 / 7.0e5 之类——计划实现时用 `k_arb_f: 5e5, k_arb_r: 7e5` N·mm/rad）

- [ ] **Step 1: api_models 扩展**

`src/api_models.py` 追加：
```python
class AnalyzeRequest(BaseModel):
    front_hardpoints: dict
    rear_hardpoints: dict
    vehicle: dict | None = None
    travel_start: float = -25.0
    travel_end: float = 25.0
    travel_steps: int = 25


class VehicleRequest(BaseModel):
    params: dict


class TargetsRequest(BaseModel):
    bands: dict          # {key: [green_lo, green_hi, warn_lo, warn_hi]}
```

- [ ] **Step 2: persistence 扩展**

`src/persistence.py` 的 `load_persistent_state()` 内追加（在现有合并后）：
```python
    if "vehicle_params" in state and isinstance(state["vehicle_params"], dict):
        VEHICLE_PARAMS.update(state["vehicle_params"])
    if "target_bands" in state and isinstance(state["target_bands"], dict):
        from metrics.targets import TARGET_BANDS_OVERRIDES
        TARGET_BANDS_OVERRIDES.update(state["target_bands"])
```
同时 `config.py` 新增 `VEHICLE_PARAMS` 模块级 dict（含 VEHICLE_DEFAULTS 值），analyze 未传 vehicle 时用它。

- [ ] **Step 3: analyze 端点**

`src/routes/analyze.py`：
```python
"""POST /api/analyze — full-dimension metrics + target-band lights."""
import numpy as np
from fastapi import APIRouter

from api_models import AnalyzeRequest, TargetsRequest, VehicleRequest
from config import VEHICLE_PARAMS
from geometry import dist
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, add_prefix, strip_prefix
from metrics.dynamics import (damping_ratio, load_transfer_n, ride_frequency_hz,
                              roll_stiffness_split_pct, sprung_mass_per_corner)
from metrics.loads import max_abs, solve_link_forces, tire_force
from metrics.roll import (compute_anti_dive, compute_anti_squat, compute_instant_center,
                          compute_roll_center, compute_roll_gradient,
                          compute_roll_stiffness_suspension)
from metrics.targets import TARGET_BANDS_OVERRIDES, evaluate_all, set_band
from persistence import _with_state
from routes.solve import _solve_axle
from solver.angles import compute_alignment_angles

router = APIRouter()

REAR_PREFIX = "R_"


def _quick_sweep(hp, start, end, steps, rack=0.0):
    """Fast kinematic sweep (no polish) → range metrics."""
    travel = np.linspace(start, end, steps)
    angles = []
    for t in travel:
        axle = _solve_axle(dict(hp), float(t), rack, mirror=False,
                           polish=False, skip_steering=False)
        angles.append(axle["angles_right"])
    def rng(key):
        vals = [a.get(key, 0.0) for a in angles]
        return max(vals) - min(vals)
    def steer_rng():
        return rng("toe_deg")
    return {
        "camber_delta": rng("camber_deg"),
        "toe_delta": steer_rng(),
        "caster_delta": rng("caster_deg"),
        "kpi_delta": rng("kpi_deg"),
        "scrub_delta": rng("scrub_radius_mm"),
        "bump_steer": steer_rng(),
        "curves": {
            "travel": [round(float(t), 1) for t in travel],
            "camber_deg": [round(a.get("camber_deg", 0.0), 3) for a in angles],
            "toe_deg": [round(a.get("toe_deg", 0.0), 3) for a in angles],
            "caster_deg": [round(a.get("caster_deg", 0.0), 3) for a in angles],
            "kpi_deg": [round(a.get("kpi_deg", 0.0), 3) for a in angles],
        },
    }


@router.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    veh = dict(VEHICLE_PARAMS)
    if req.vehicle:
        veh.update(req.vehicle)

    f_hp = dict(req.front_hardpoints)
    r_hp = strip_prefix(dict(req.rear_hardpoints), REAR_PREFIX)

    f_sw = _quick_sweep(f_hp, req.travel_start, req.travel_end, req.travel_steps)
    r_sw = _quick_sweep(r_hp, req.travel_start, req.travel_end, req.travel_steps)

    # Static design position (dz=0) for attitude geometry
    f_design = _solve_axle(dict(f_hp), 0.0, 0.0, mirror=False, polish=False)
    r_design = _solve_axle(dict(r_hp), 0.0, 0.0, mirror=False, polish=False)

    # --- kinematics ---
    metrics = {
        "camber_delta_f": f_sw["camber_delta"],
        "camber_delta_r": r_sw["camber_delta"],
        "bump_steer_f": f_sw["bump_steer"],
        "bump_steer_r": r_sw["bump_steer"],
        "caster_delta_f": f_sw["caster_delta"],
        "caster_delta_r": r_sw["caster_delta"],
        "kpi_delta_f": f_sw["kpi_delta"],
        "kpi_delta_r": r_sw["kpi_delta"],
        "scrub_delta_f": f_sw["scrub_delta"],
        "scrub_delta_r": r_sw["scrub_delta"],
    }

    # --- attitude (front axle for RC; motion ratio from rocker) ---
    rc = compute_roll_center(f_hp, f_design["right"])
    rc_z = rc["z"] if rc else veh["cg_height_mm"] * 0.5
    # Single-point solve has no motion_ratio (sweep-only): use defaults
    # until the P3 quick-sweep MR curve is wired in.
    mr_f = 0.7
    mr_r = 0.6

    k_f = compute_roll_stiffness_suspension(veh["k_spring_f"], mr_f, veh["front_track_mm"])
    k_r = compute_roll_stiffness_suspension(veh["k_spring_r"], mr_r, veh["rear_track_mm"])
    k_arb_f = veh.get("k_arb_f", 0.0)
    k_arb_r = veh.get("k_arb_r", 0.0)
    roll_deg_g = compute_roll_gradient(veh, k_f + k_arb_f, k_r + k_arb_r, rc_z)

    metrics.update({
        "roll_gradient": roll_deg_g,
        "rc_height": rc_z,
        "rc_height_delta": None,          # requires RC-vs-travel curve (P3)
        "anti_dive": compute_anti_dive(f_hp, f_design["right"],
                                       veh["wheelbase_mm"], veh["cg_height_mm"],
                                       veh["ax_brake"]),
        "anti_squat": compute_anti_squat(r_hp, r_design["right"],
                                         veh["wheelbase_mm"], veh["cg_height_mm"],
                                         veh["ax_accel"]),
        "jacking": None,
    })

    # --- dynamics ---
    m_f = sprung_mass_per_corner(veh["mass_kg"], veh["front_axle_frac"], veh["unsprung_kg"])
    m_r = sprung_mass_per_corner(veh["mass_kg"], veh["rear_axle_frac"], veh["unsprung_kg"])
    metrics.update({
        "ride_freq_f": ride_frequency_hz(veh["k_spring_f"], mr_f, m_f),
        "ride_freq_r": ride_frequency_hz(veh["k_spring_r"], mr_r, m_r),
        "freq_ratio": None,
        "damping_ratio_f": damping_ratio(veh["k_spring_f"], mr_f, m_f, veh["c_damper_f"]),
        "damping_ratio_r": damping_ratio(veh["k_spring_r"], mr_r, m_r, veh["c_damper_r"]),
        "motion_ratio_f": mr_f,
        "motion_ratio_r": mr_r,
        "load_transfer_f": roll_stiffness_split_pct(k_f + k_arb_f, k_r + k_arb_r),
    })

    # --- structural (1.3g cornering, outside wheel) ---
    dF = load_transfer_n(veh["mass_kg"], veh["ay_corner"], veh["cg_height_mm"],
                         (veh["front_track_mm"] + veh["rear_track_mm"]) / 2.0)
    f_static_f = veh["mass_kg"] * 9.81 * veh["front_axle_frac"] / 2.0
    roll_f_frac = roll_stiffness_split_pct(k_f + k_arb_f, k_r + k_arb_r) / 100.0
    f_outside_f = f_static_f + dF * roll_f_frac
    forces_f = solve_link_forces(f_hp, f_design["right"],
                                 tire_force(f_outside_f, 0.0, veh["ay_corner"]))
    metrics.update({
        "pushrod_force": max_abs(forces_f),
        "uca_lca_force": max_abs(forces_f),
        "tie_rod_force": None,
    })

    lights = evaluate_all(metrics)
    return {
        "metrics": {k: (None if v is None else round(float(v), 3))
                    for k, v in metrics.items()},
        "lights": lights,
        "curves": {"front": f_sw["curves"], "rear": r_sw["curves"]},
        "vehicle": veh,
    }
```

`_approx_mr` 辅助（rocker 缺失时）：`from routes.solve import _solve_axle` 的 rocker 输出在 mirror=False 时 key 为 `rocker_right`，其中含 `motion_ratio`（sweep 才有）。单点 solve 无 motion_ratio——用推杆行程比近似：`dist(UP4_new, CH5) 变化/dz`。简化：analyze 里对 rocker 缺失时直接取预置 0.7/0.6。**计划采用简化**：`mr_f = f_design.get("rocker_right", {}).get("motion_ratio", 0.7)` 已在上文；删掉 `_approx_mr` 引用，改默认值。注意：单点 solve 的 rocker_right 无 motion_ratio key——写 `(f_design.get("rocker_right") or {}).get("motion_ratio", 0.7)`。

（实现时以默认 0.7/0.6 兜底，MR 精确值在 P2 前端用快速 sweep 曲线更新。）

- [ ] **Step 4: vehicle/targets 端点（追加到 analyze.py）**

```python
@router.get("/api/vehicle")
async def get_vehicle():
    return {"params": dict(VEHICLE_PARAMS)}


@router.post("/api/vehicle")
async def save_vehicle(req: VehicleRequest):
    def mutator(state):
        state["vehicle_params"] = {k: float(v) for k, v in req.params.items()}
    _with_state(mutator)
    VEHICLE_PARAMS.update(req.params)
    return {"ok": True}


@router.post("/api/targets")
async def save_targets(req: TargetsRequest):
    def mutator(state):
        state["target_bands"] = {k: [float(x) for x in b] for k, b in req.bands.items()}
    _with_state(mutator)
    for k, b in req.bands.items():
        set_band(k, tuple(b))
    return {"ok": True}


@router.get("/api/targets")
async def get_targets():
    from metrics.targets import TARGET_BANDS
    merged = dict(TARGET_BANDS)
    merged.update(TARGET_BANDS_OVERRIDES)
    return {"bands": merged}
```

- [ ] **Step 5: 注册 router（src/main.py）**

在 `src/main.py` 现有 router 注册处追加：
```python
from routes.analyze import router as analyze_router
app.include_router(analyze_router)
```

- [ ] **Step 6: 集成测试**

`tests/test_analyze.py`：
```python
"""Analyze endpoint integration test."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from fastapi.testclient import TestClient
from main import app
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS

client = TestClient(app)


def _hp(d):
    return {k: list(v) if isinstance(v, (list, tuple)) else v for k, v in d.items()}


def test_analyze_returns_all_dimensions():
    resp = client.post("/api/analyze", json={
        "front_hardpoints": _hp(DEFAULT_HARDPOINTS),
        "rear_hardpoints": _hp(DEFAULT_REAR_HARDPOINTS),
    })
    assert resp.status_code == 200
    data = resp.json()
    m = data["metrics"]
    for key in ["camber_delta_f", "bump_steer_f", "roll_gradient",
                "ride_freq_f", "ride_freq_r", "pushrod_force"]:
        assert key in m, key
    assert data["lights"], "lights list must be non-empty"
    assert all(light["light"] in ("green", "yellow", "red")
               for light in data["lights"])
    assert "curves" in data and "front" in data["curves"]


def test_analyze_with_vehicle_override():
    resp = client.post("/api/analyze", json={
        "front_hardpoints": _hp(DEFAULT_HARDPOINTS),
        "rear_hardpoints": _hp(DEFAULT_REAR_HARDPOINTS),
        "vehicle": {"mass_kg": 300.0},
    })
    assert resp.status_code == 200
    assert resp.json()["vehicle"]["mass_kg"] == 300.0


def test_targets_roundtrip():
    resp = client.post("/api/targets", json={"bands": {"bump_steer_f": [0, 1.5, 0, 3.0]}})
    assert resp.status_code == 200
    resp2 = client.get("/api/targets")
    assert resp2.json()["bands"]["bump_steer_f"][1] == 1.5
    # restore
    client.post("/api/targets", json={"bands": {}})
```

- [ ] **Step 7: 验证 + Commit**

Run: `python -m pytest tests/test_analyze.py tests/test_targets.py -q`
Expected: 全部 PASS；analyze 响应 <2s（快速 sweep 25 步 ×2 轴）

```bash
git add src/routes/analyze.py src/api_models.py src/persistence.py src/main.py src/config.py tests/test_analyze.py
git commit -m "feat: /api/analyze full-dimension metrics + vehicle/targets endpoints"
```

---

# 阶段 P2 — 工作台前端（Neo-Brutalist 重写）

前端完全重写。新结构：
```
web/
├── index.html            # 骨架（无 Tailwind）
├── style.css             # 新野兽派设计系统
└── js/
    ├── main.js           # 装配 + 事件 + 动画循环
    ├── state.js          # 全局状态 + localStorage
    ├── api.js            # fetch 封装
    ├── scene3d.js        # Three.js 场景 + 悬架构建
    ├── panels.js         # 左栏参数（几何/整车/目标带）
    ├── dashboard.js      # 指标盘 + 对比模式
    └── history.js        # 快照引擎 + 时间线
```

## Task 11: 骨架 + 设计系统

**Files:**
- Create: `web/index.html`
- Create: `web/style.css`

- [ ] **Step 1: index.html 骨架**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FSAE 悬架工作台</title>
<link rel="stylesheet" href="style.css">
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
</head>
<body>
  <header id="topbar">
    <div class="brand">■ FSAE SUSPENSION WORKBENCH</div>
    <div class="topbar-actions">
      <span id="summaryLight" class="badge">● --/--</span>
      <button id="btnDash" class="btn btn-cyan">▣ 指标盘</button>
      <button id="btnRevert" class="btn" disabled>⮌ 回退</button>
      <button id="btnCompare" class="btn btn-orange" disabled>⇄ 对比</button>
    </div>
  </header>

  <main id="workbench">
    <aside id="leftCol">
      <div class="col-head">参数 <span id="colToggle">▾</span></div>
      <div id="paramTabs" class="tabs">
        <button class="tab active" data-tab="geometry">几何</button>
        <button class="tab" data-tab="vehicle">整车</button>
        <button class="tab" data-tab="targets">目标带</button>
      </div>
      <div id="panel-geometry" class="panel-body"></div>
      <div id="panel-vehicle" class="panel-body hidden"></div>
      <div id="panel-targets" class="panel-body hidden"></div>
    </aside>
    <section id="centerCol">
      <div id="scene3d"></div>
      <div id="sliderBar">
        <label>前轮跳 <input type="range" id="frontTravel" min="-40" max="40" step="0.5" value="0"></label>
        <span id="frontTravelVal" class="mono">0.0</span>
        <label>转向 <input type="range" id="rackTravel" min="-15" max="15" step="0.5" value="0"></label>
        <span id="rackVal" class="mono">0.0</span>
      </div>
    </section>
    <aside id="rightCol" class="collapsed">
      <div class="col-head">性能指标盘 <button id="btnDashClose" class="btn">✕ 收起</button></div>
      <div id="dashboard"></div>
    </aside>
  </main>

  <footer id="historyBar">
    <div id="snapshotList"></div>
  </footer>

  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css 设计系统（核心令牌与布局）**

```css
/* Neo-Brutalist design system */
:root {
  --black: #000000; --white: #ffffff;
  --cyan: #00d9ff; --orange: #ff9500; --pink: #ff006e; --lime: #ccff00;
  --green: #00e676; --yellow: #ffd600; --red: #ff1744;
  --ink: #111; --paper: #f4f4f4;
  --border-w: 3px; --shadow: 5px 5px 0 var(--black);
}
* { box-sizing: border-box; border-radius: 0 !important; }
html, body { height: 100%; margin: 0; font-family: 'Courier New', monospace; color: var(--ink); background: var(--white); }
body { display: grid; grid-template-rows: auto 1fr auto; height: 100vh; padding: 10px; gap: 10px; }

#topbar { background: var(--black); color: var(--white); border: var(--border-w) solid var(--black);
  padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow); }
.badge { border: 2px solid var(--black); background: var(--green); color: var(--black); padding: 1px 8px; font-weight: bold; }
.btn { border: 2px solid var(--black); background: var(--white); padding: 3px 10px; font-weight: bold;
  cursor: pointer; box-shadow: 2px 2px 0 var(--black); font-family: inherit; }
.btn:hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--black); }
.btn:active { transform: translate(2px, 2px); box-shadow: none; }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn-cyan { background: var(--cyan); } .btn-orange { background: var(--orange); }
.btn-pink { background: var(--pink); color: var(--white); } .btn-lime { background: var(--lime); }

#workbench { display: flex; gap: 10px; min-height: 0; }
#leftCol { width: 22%; border: var(--border-w) solid var(--black); background: var(--paper);
  padding: 8px; box-shadow: var(--shadow); overflow-y: auto; }
#centerCol { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
#scene3d { flex: 1; border: var(--border-w) solid var(--black); background: var(--paper);
  position: relative; min-height: 0; box-shadow: var(--shadow); }
#sliderBar { border: var(--border-w) solid var(--black); background: var(--white);
  padding: 6px 10px; display: flex; gap: 18px; align-items: center; font-size: 12px; box-shadow: var(--shadow); }
input[type=range] { accent-color: var(--pink); }
#rightCol { width: 55%; border: var(--border-w) solid var(--black); background: var(--white);
  padding: 8px; box-shadow: var(--shadow); overflow-y: auto; }
#rightCol.collapsed { display: none; }

/* 推挤式切换：展开指标盘时左栏折叠为图标条 */
#workbench.dash-open #leftCol { width: 44px; padding: 4px 2px; }
#workbench.dash-open #leftCol .panel-body, #workbench.dash-open #leftCol .col-head span,
#workbench.dash-open #leftCol .tabs { display: none; }
#workbench.dash-open #leftCol::after { content: '⚙'; font-size: 18px; text-align: center; display: block; padding-top: 8px; }
#workbench.dash-open #centerCol { flex: 0 0 38%; }

#historyBar { border: var(--border-w) solid var(--black); background: var(--white);
  padding: 8px; box-shadow: var(--shadow); max-height: 200px; overflow-y: auto; }

.tabs { display: flex; gap: 0; margin-bottom: 8px; }
.tab { flex: 1; border: 2px solid var(--black); background: var(--white); padding: 4px; font-weight: bold; cursor: pointer; font-family: inherit; }
.tab.active { background: var(--black); color: var(--white); }
.hidden { display: none; }
.mono { font-family: monospace; font-weight: bold; }
```

- [ ] **Step 3: 启动验证**

Run: `cd web && npx vite`（后台）→ 浏览器 http://localhost:5173
Expected: 空工作台布局渲染（顶栏/三区/底部条），无 JS 报错（main.js 尚未创建会 404——先建空 `js/main.js`）

```bash
mkdir -p web/js && touch web/js/main.js
```

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/style.css web/js/main.js
git commit -m "feat(web): Neo-Brutalist workbench skeleton + design system"
```

## Task 12: state.js + api.js

**Files:**
- Create: `web/js/state.js`
- Create: `web/js/api.js`

- [ ] **Step 1: state.js**

```js
// Global shared state — single source of truth
export const state = {
  hardpoints: { front: null, rear: null },   // {CH1: [x,y,z], ...}
  designParams: { front: null, rear: null },
  vehicle: null,                             // vehicle params dict
  targets: null,                             // band dict
  travel: { front: 0, rear: 0, rack: 0 },
  solveResult: null,                         // last /api/solve response
  analyzeResult: null,                       // last /api/analyze response
  snapshots: [],                             // [{id, ts, params, vehicle, lights}]
  selected: [],                              // snapshot ids for compare
  currentSnapshotId: null,
  ui: { dashOpen: false, leftCollapsed: false, activeTab: 'geometry' },
};

const SNAPSHOT_KEY = 'workbench.snapshots.v1';
const MAX_SNAPSHOTS = 100;

export function loadSnapshots() {
  try { state.snapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]'); }
  catch { state.snapshots = []; }
}

export function pushSnapshot(meta) {
  const snap = {
    id: Date.now(),
    ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    params: JSON.parse(JSON.stringify(state.designParams)),
    hardpoints: JSON.parse(JSON.stringify(state.hardpoints)),
    vehicle: JSON.parse(JSON.stringify(state.vehicle)),
    lights: state.analyzeResult ? state.analyzeResult.lights : [],
    ...meta,
  };
  const last = state.snapshots[state.snapshots.length - 1];
  if (last && JSON.stringify(last.hardpoints) === JSON.stringify(snap.hardpoints)
      && JSON.stringify(last.vehicle) === JSON.stringify(snap.vehicle)) {
    return null;                              // no change → skip
  }
  state.snapshots.push(snap);
  if (state.snapshots.length > MAX_SNAPSHOTS) state.snapshots.shift();
  state.currentSnapshotId = snap.id;
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(state.snapshots));
  return snap;
}

export function restoreSnapshot(id) {
  const snap = state.snapshots.find(s => s.id === id);
  if (!snap) return null;
  state.designParams = JSON.parse(JSON.stringify(snap.params));
  state.hardpoints = JSON.parse(JSON.stringify(snap.hardpoints));
  state.vehicle = JSON.parse(JSON.stringify(snap.vehicle));
  state.currentSnapshotId = id;
  return snap;
}
```

- [ ] **Step 2: api.js**

```js
// API client — FastAPI backend
async function req(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  defaults: () => req('/api/defaults'),
  solve: (body) => req('/api/solve', { method: 'POST', body: JSON.stringify(body) }),
  analyze: (body) => req('/api/analyze', { method: 'POST', body: JSON.stringify(body) }),
  getVehicle: () => req('/api/vehicle'),
  saveVehicle: (params) => req('/api/vehicle', { method: 'POST', body: JSON.stringify({ params }) }),
  getTargets: () => req('/api/targets'),
  saveTargets: (bands) => req('/api/targets', { method: 'POST', body: JSON.stringify({ bands }) }),
};
```

- [ ] **Step 3: Commit**

```bash
git add web/js/state.js web/js/api.js
git commit -m "feat(web): state store + API client"
```

## Task 13: scene3d.js — 3D 场景（悬架 + 滑块）

**Files:**
- Create: `web/js/scene3d.js`

从现有 `web/js/scene.js` + `builders.js` 移植悬架核心（前/后双叉臂 + 立柱 + 轮胎 + 地面网格 + 滑块联动）。首版不含车架管阵/空力。

- [ ] **Step 1: scene3d.js**

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';

let scene, camera, renderer, controls;
const group = new THREE.Group();        // car group — all suspension parts
const wheels = [];                      // {mesh, axle:'front'|'rear', side:'right'|'left'}

const FRONT_COLOR = 0xff9500, REAR_COLOR = 0xd83514;
const BALL_COLOR = 0x00d9ff;

export function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
  camera.position.set(500, 650, 700);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-450, 0, 150);

  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  scene.add(new THREE.DirectionalLight(0xffffff, 1.2));

  // ground grid
  const grid = new THREE.GridHelper(3000, 30, 0x000000, 0xcccccc);
  scene.add(grid);
  scene.add(group);
  resize(container);
  window.addEventListener('resize', () => resize(container));
  animate();
}

function resize(container) {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function ball(pos, color = BALL_COLOR, r = 6) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  m.position.set(...pos);
  return m;
}

function link(a, b, color, thickness = 3) {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...a), new THREE.Vector3(...b),
  ]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}

export function rebuildCar(hpFront, hpRear) {
  group.clear();
  wheels.length = 0;
  buildAxle(hpFront, 'front', FRONT_COLOR);
  buildAxle(hpRear, 'rear', REAR_COLOR);
}

function buildAxle(hp, axle, color) {
  for (const side of ['right', 'left']) {
    const p = side === 'right' ? hp : mirrorLeft(hp);
    const axis = axle === 'front' ? [0, 0, 0] : [-895, 0, 0];
    const toWorld = (pt) => [pt[0] + axis[0], side === 'left' ? -pt[1] : pt[1], pt[2]];

    for (const k of ['CH1', 'CH2', 'CH3', 'CH4', 'CH5']) {
      group.add(ball(toWorld(p[k]), 0x333333, 5));
    }
    for (const k of ['UP1', 'UP2', 'UP3', 'UP4', 'UP5']) {
      group.add(ball(toWorld(p[k]), BALL_COLOR, 4));
    }
    // A-arms (chassis→upright)
    group.add(link(toWorld(p.CH1), toWorld(p.UP1), color));
    group.add(link(toWorld(p.CH2), toWorld(p.UP1), color));
    group.add(link(toWorld(p.CH3), toWorld(p.UP2), color));
    group.add(link(toWorld(p.CH4), toWorld(p.UP2), color));
    group.add(link(toWorld(p.CH5), toWorld(p.UP4), color));       // push/pull rod
    group.add(link(toWorld(p.FL1), toWorld(p.UP3), 0x00d9ff));   // tie rod
    // kingpin
    group.add(link(toWorld(p.UP1), toWorld(p.UP2), 0x000000, 5));
    // wheel disc
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(150, 150, 160, 24),
      new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.85 })
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(...toWorld(p.UP5));
    group.add(tire);
    wheels.push({ mesh: tire, axle, side, toWorld });
  }
}

function mirrorLeft(hp) {
  const out = {};
  for (const [k, v] of Object.entries(hp)) {
    out[k] = Array.isArray(v) ? [v[0], -v[1], v[2]] : v;
  }
  return out;
}

/** Update upright positions from a solve response (slider drag). */
export function updateFromSolve(result) {
  // result: {front: {right: {...}}, rear: {right: {...}}}
  // Minimal V1: rebuild on solve end (fast enough at 60fps throttle);
  // per-part updating can be optimized later.
}
```

（V1 简化：拖动时重建整车——`rebuildCar` 60fps 节流可接受；后续优化为局部更新。）

- [ ] **Step 2: Commit**

```bash
git add web/js/scene3d.js
git commit -m "feat(web): 3D scene with suspension rendering"
```

## Task 14: panels.js — 参数面板

**Files:**
- Create: `web/js/panels.js`

- [ ] **Step 1: panels.js**

```js
// Left column panels: geometry / vehicle / targets
import { state, pushSnapshot } from './state.js';
import { api } from './api.js';
import { rebuildCar } from './scene3d.js';
import { runSolve, runAnalyze } from './main.js';

const GEOM_FIELDS = {
  front: ['track', 'wheel_center_z', 'caster', 'kpi', 'kingpin_length',
          'uca_front_y', 'uca_front_z', 'uca_rear_y', 'uca_rear_z',
          'lca_front_y', 'lca_front_z', 'lca_rear_y', 'lca_rear_z',
          'tierod_inner_y', 'tierod_inner_z'],
  rear: ['track', 'wheel_center_z', 'caster', 'kpi',
         'uca_front_y', 'uca_rear_y', 'lca_front_y', 'lca_rear_y'],
};
const VEHICLE_FIELDS = ['mass_kg', 'front_axle_frac', 'rear_axle_frac', 'cg_height_mm',
                        'wheelbase_mm', 'front_track_mm', 'rear_track_mm',
                        'k_spring_f', 'k_spring_r', 'c_damper_f', 'c_damper_r',
                        'k_arb_f', 'k_arb_r', 'ax_brake', 'ax_accel', 'ay_corner'];

export function renderGeometryPanel(el) {
  el.innerHTML = '<div class="col-head">前后轴几何</div>' +
    ['front', 'rear'].map(axle => `
      <div class="grp-head">${axle === 'front' ? '■ 前轴' : '■ 后轴'}</div>
      ${GEOM_FIELDS[axle].map(f => `
        <label class="field">${f}
          <input type="number" step="0.1" data-axle="${axle}" data-field="${f}"
                 value="${state.designParams[axle][f]}">
        </label>`).join('')}`).join('') +
    '<button id="btnApplyGeom" class="btn btn-lime">应用参数</button>';

  el.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.designParams[inp.dataset.axle][inp.dataset.field] = parseFloat(inp.value);
    });
  });
  el.querySelector('#btnApplyGeom').addEventListener('click', () => {
    runSolve();                       // lightweight path
  });
}

export function renderVehiclePanel(el) {
  el.innerHTML = VEHICLE_FIELDS.map(f => `
    <label class="field">${f}
      <input type="number" step="0.1" data-field="${f}" value="${state.vehicle?.[f] ?? ''}">
    </label>`).join('') +
    '<button id="btnSaveVehicle" class="btn btn-cyan">保存整车参数</button>';

  el.querySelector('#btnSaveVehicle').addEventListener('click', async () => {
    const params = {};
    el.querySelectorAll('input[data-field]').forEach(inp => {
      params[inp.dataset.field] = parseFloat(inp.value);
    });
    state.vehicle = params;
    await api.saveVehicle(params);
    runAnalyze();
  });
}

export function renderTargetsPanel(el) {
  if (!state.targets) return;
  el.innerHTML = Object.entries(state.targets).map(([k, band]) => `
    <div class="grp-head">${k}</div>
    <label class="field">绿带 hi <input type="number" step="0.1" data-key="${k}" data-idx="1" value="${band[1]}"></label>
    <label class="field">黄带 hi <input type="number" step="0.1" data-key="${k}" data-idx="3" value="${band[3]}"></label>
  `).join('') +
  '<button id="btnSaveTargets" class="btn btn-orange">保存目标带</button>';

  el.querySelector('#btnSaveTargets').addEventListener('click', async () => {
    const bands = {};
    el.querySelectorAll('input[data-key]').forEach(inp => {
      const k = inp.dataset.key;
      bands[k] = bands[k] || [...state.targets[k]];
      bands[k][+inp.dataset.idx] = parseFloat(inp.value);
    });
    state.targets = { ...state.targets, ...bands };
    await api.saveTargets(bands);
    runAnalyze();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add web/js/panels.js
git commit -m "feat(web): geometry/vehicle/targets parameter panels"
```

## Task 15: dashboard.js — 指标盘 + 对比模式

**Files:**
- Create: `web/js/dashboard.js`

- [ ] **Step 1: dashboard.js**

```js
// Right column metric dashboard (4-dimension groups, lights, compare mode)
import { state } from './state.js';

const DIMS = [
  { key: 'kin', label: '■ 运动学', color: 'cyan', keys: ['camber_delta_f', 'camber_delta_r', 'bump_steer_f', 'bump_steer_r', 'caster_delta_f', 'kpi_delta_f', 'scrub_delta_f'] },
  { key: 'att', label: '■ 姿态侧倾', color: 'orange', keys: ['roll_gradient', 'rc_height', 'anti_dive', 'anti_squat'] },
  { key: 'dyn', label: '■ 动力学', color: 'pink', keys: ['ride_freq_f', 'ride_freq_r', 'damping_ratio_f', 'damping_ratio_r', 'motion_ratio_f', 'motion_ratio_r', 'load_transfer_f'] },
  { key: 'str', label: '■ 结构受力', color: 'lime', keys: ['pushrod_force', 'uca_lca_force'] },
];

function lightColor(light) {
  return light === 'green' ? '#00e676' : light === 'yellow' ? '#ffd600' : '#ff1744';
}

export function renderDashboard(el) {
  const res = state.analyzeResult;
  if (!res) { el.innerHTML = '<div class="muted">点「分析」或展开后等待计算…</div>'; return; }
  const metrics = res.metrics, lights = res.lights;
  const byKey = {};
  lights.forEach(l => { byKey[l.key] = l; });

  const compare = state.selected.length === 2;
  const oldRes = compare ? state.snapshots.find(s => s.id === state.selected[0])?.analyze ?? null : null;

  el.innerHTML = DIMS.map(dim => `
    <div class="dim-grp grp-${dim.color}">
      <div class="dim-head">${dim.label}</div>
      ${dim.keys.map(k => {
        const v = metrics[k], l = byKey[k];
        if (!l) return '';
        const cell = compare && oldRes && oldRes.metrics[k] != null
          ? `<span class="old">${fmt(oldRes.metrics[k])}</span> <span class="new">${fmt(v)}</span>
             <span class="delta">${delta(oldRes.metrics[k], v)}</span>`
          : `<span class="val">${fmt(v)}</span>`;
        return `<div class="m-row"><span class="light" style="background:${lightColor(l.light)}"></span>
                <span class="name">${k}</span>${cell}</div>`;
      }).join('')}
    </div>`).join('') +
    '<div class="muted">拖动滑块时轻量指标实时跳；重指标松开后刷新。</div>';
}

function fmt(v) {
  if (v == null) return '—';
  return Math.abs(v) > 100 ? v.toFixed(0) : v.toFixed(2);
}

function delta(oldV, newV) {
  const d = newV - oldV;
  const better = Math.abs(d) < Math.abs(oldV) * 0.02 ? '' : (d < 0 ? '▼' : '▲');
  return `${better}${Math.abs(d).toFixed(2)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/js/dashboard.js
git commit -m "feat(web): metric dashboard with lights and compare mode"
```

## Task 16: history.js — 快照时间线

**Files:**
- Create: `web/js/history.js`

- [ ] **Step 1: history.js**

```js
// Bottom snapshot timeline — data rows, revert, compare
import { state, restoreSnapshot } from './state.js';
import { rebuildCar } from './scene3d.js';
import { runSolve, runAnalyze } from './main.js';

const KEY_VALUES = ['bump_steer_f', 'roll_gradient', 'ride_freq_r', 'pushrod_force'];

export function renderHistory(el) {
  if (!state.snapshots.length) { el.innerHTML = '<span class="muted">尚无快照 — 调整参数后自动记录</span>'; return; }
  el.innerHTML = state.snapshots.map((s, i) => {
    const worst = worstLight(s);
    const sel = state.selected.includes(s.id) ? ' sel' : '';
    const cur = s.id === state.currentSnapshotId ? ' cur' : '';
    const prev = state.snapshots[i - 1];
    return `<div class="snap-row${sel}${cur}" data-id="${s.id}">
      <span class="dot ${worst}">${i + 1}</span>
      <span class="snap-info">
        <b>${s.ts}</b> ${s.meta || ''}<br>
        ${KEY_VALUES.map(k => {
          const v = s.lights.find(l => l.key === k);
          if (!v) return '';
          const d = prev && prev.lights.find(l => l.key === k) ? deltaMark(prev, s, k) : '';
          return `<span class="mini">${k.split('_')[0]}=${fmt(v.value)}${d}</span>`;
        }).join(' ')}
      </span>
      <span class="light" style="background:${worstColor(worst)}"></span>
    </div>`;
  }).join('');

  el.querySelectorAll('.snap-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = +row.dataset.id;
      if (state.selected.length === 2) state.selected = [];
      state.selected = [id];
      const cur = state.currentSnapshotId;
      const other = state.snapshots.find(s => s.id !== id);
      // single click → select; double-click → revert
      row.addEventListener('dblclick', () => {
        restoreSnapshot(id);
        rebuildCar(state.hardpoints.front, state.hardpoints.rear);
        runSolve(); runAnalyze();
        renderHistory(document.getElementById('snapshotList'));
      });
    });
  });
}

function worstLight(s) {
  const order = { red: 3, yellow: 2, green: 1 };
  let worst = 'green';
  for (const l of s.lights) if (order[l.light] > order[worst]) worst = l.light;
  return worst;
}
function worstColor(w) { return w === 'red' ? '#ff1744' : w === 'yellow' ? '#ffd600' : '#00e676'; }
function fmt(v) { return v == null ? '—' : (+v).toFixed(2); }
function deltaMark(prev, s, k) {
  const a = prev.lights.find(l => l.key === k)?.value;
  const b = s.lights.find(l => l.key === k)?.value;
  if (a == null || b == null) return '';
  const d = b - a;
  return `<span class="d-${d <= 0 ? 'good' : 'bad'}">${d <= 0 ? '▼' : '▲'}${Math.abs(d).toFixed(2)}</span>`;
}
```

（对比按钮：`state.selected` 为两个 id 时 `dashboard.renderDashboard` 自动进入对比模式；btnCompare 事件在 main.js 处理——单击节点加入 selected，达到 2 个时进入对比。）

- [ ] **Step 2: Commit**

```bash
git add web/js/history.js
git commit -m "feat(web): snapshot timeline with revert and compare"
```

## Task 17: main.js — 装配

**Files:**
- Create: `web/js/main.js`

- [ ] **Step 1: main.js**

```js
// Workbench entry — wiring + solve/analyze flows + snapshot engine
import { state, loadSnapshots, pushSnapshot } from './state.js';
import { api } from './api.js';
import { initScene, rebuildCar } from './scene3d.js';
import { renderGeometryPanel, renderVehiclePanel, renderTargetsPanel } from './panels.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory } from './history.js';

let solveTimer = null, snapTimer = null;

async function init() {
  loadSnapshots();
  const d = await api.defaults();
  state.designParams = { front: d.params.front, rear: d.params.rear };
  state.hardpoints = { front: d.front.hardpoints, rear: d.rear.hardpoints };
  state.vehicle = (await api.getVehicle()).params;
  state.targets = (await api.getTargets()).bands;

  initScene(document.getElementById('scene3d'));
  rebuildCar(state.hardpoints.front, state.hardpoints.rear);
  renderGeometryPanel(document.getElementById('panel-geometry'));
  renderVehiclePanel(document.getElementById('panel-vehicle'));
  renderTargetsPanel(document.getElementById('panel-targets'));
  renderHistory(document.getElementById('snapshotList'));

  // tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.panel-body').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-${t.dataset.tab}`).classList.remove('hidden');
  }));

  // dashboard toggle (push-based layout)
  const dash = document.getElementById('rightCol');
  document.getElementById('btnDash').addEventListener('click', () => {
    dash.classList.toggle('collapsed');
    document.getElementById('workbench').classList.toggle('dash-open', !dash.classList.contains('collapsed'));
    if (!dash.classList.contains('collapsed')) runAnalyze();
    renderDashboard(document.getElementById('dashboard'));
  });
  document.getElementById('btnDashClose').addEventListener('click', () => {
    dash.classList.add('collapsed');
    document.getElementById('workbench').classList.remove('dash-open');
  });

  // sliders → lightweight solve (throttled)
  for (const id of ['frontTravel', 'rackTravel']) {
    document.getElementById(id).addEventListener('input', onSliderInput);
  }
  document.getElementById('frontTravel').addEventListener('change', onSliderRelease);
  document.getElementById('rackTravel').addEventListener('change', onSliderRelease);

  // compare button
  document.getElementById('btnCompare').addEventListener('click', () => {
    if (state.selected.length !== 2) {
      state.selected = state.snapshots.slice(-2).map(s => s.id);
    }
    runAnalyze();
    renderDashboard(document.getElementById('dashboard'));
  });

  window.__workbench = { state, runAnalyze, runSolve };   // test hook
}

function onSliderInput() {
  state.travel.front = parseFloat(document.getElementById('frontTravel').value);
  state.travel.rack = parseFloat(document.getElementById('rackTravel').value);
  document.getElementById('frontTravelVal').textContent = state.travel.front.toFixed(1);
  document.getElementById('rackVal').textContent = state.travel.rack.toFixed(1);
  clearTimeout(solveTimer);
  solveTimer = setTimeout(runSolve, 80);          // throttled lightweight solve
}

function onSliderRelease() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    runAnalyze();                                   // heavy metrics
    const snap = pushSnapshot({});
    if (snap) renderHistory(document.getElementById('snapshotList'));
  }, 800);
}

export async function runSolve() {
  const body = {
    front_hardpoints: state.hardpoints.front,
    rear_hardpoints: state.hardpoints.rear,
    front_travel: state.travel.front,
    rear_travel: 0, rack_displacement: state.travel.rack,
  };
  try {
    state.solveResult = await api.solve(body);
    rebuildCar(state.hardpoints.front, state.hardpoints.rear);
  } catch (e) { console.error('solve failed', e); }
}

export async function runAnalyze() {
  try {
    const res = await api.analyze({
      front_hardpoints: state.hardpoints.front,
      rear_hardpoints: state.hardpoints.rear,
      vehicle: state.vehicle,
    });
    state.analyzeResult = res;
    const nRed = res.lights.filter(l => l.light === 'red').length;
    const nYellow = res.lights.filter(l => l.light === 'yellow').length;
    const badge = document.getElementById('summaryLight');
    badge.textContent = nRed === 0 && nYellow === 0 ? `● ${res.lights.length}/${res.lights.length}`
      : nRed === 0 ? `● ${res.lights.length - nYellow}/${res.lights.length} ⚠`
      : `✗ ${res.lights.length - nRed}/${res.lights.length}`;
    badge.style.background = nRed ? '#ff1744' : nYellow ? '#ffd600' : '#00e676';
    renderDashboard(document.getElementById('dashboard'));
  } catch (e) { console.error('analyze failed', e); }
}

init();
```

- [ ] **Step 2: 手动验证**

Run: 后端 `python run.py` + 前端 `cd web && npx vite`
Expected: http://localhost:5173 渲染工作台；拖前轮跳滑块 → 3D 更新 + 顶栏灯跳动；松开 → 快照入时间线；指标盘展开显示 4 维红绿灯；点历史节点对比/回退可用

- [ ] **Step 3: Commit**

```bash
git add web/js/main.js
git commit -m "feat(web): workbench wiring — solve/analyze flows + snapshot engine"
```

---

# 阶段 P3 — 打磨

## Task 18: e2e 全流程 + 性能验证

**Files:**
- Modify: `tests/e2e/test_interaction_flow.py`（或新增 `tests/e2e/test_workbench_flow.py`）
- Modify: `web/vite.config.js`（代理 8001 → 8000）

- [ ] **Step 1: 修正 vite 代理**

`web/vite.config.js`：`target: "http://127.0.0.1:8001"` → `"http://127.0.0.1:8000"`（与 run.py 一致）

- [ ] **Step 2: 新增工作台 e2e 测试**

`tests/e2e/test_workbench_flow.py`：
```python
"""P0 — 工作台迭代闭环 e2e：改参数 → 指标 → 快照 → 回退 → 对比。"""
import pytest


@pytest.mark.usefixtures("page")
class TestWorkbenchFlow:
    def test_full_iteration_loop(self, page):
        page.wait_for_timeout(1000)                       # defaults load
        # dashboard opens
        page.click("#btnDash")
        page.wait_for_timeout(2500)                        # analyze budget <2s
        lights = page.locator("#dashboard .dim-grp").count()
        assert lights == 4, f"4 dim groups expected, got {lights}"
        # change a geometry param → apply → snapshot recorded
        page.fill("#panel-geometry input[data-field='caster'][data-axle='front']", "6.0")
        page.click("#btnApplyGeom")
        page.wait_for_timeout(3000)
        rows = page.locator("#snapshotList .snap-row").count()
        assert rows >= 1, "snapshot not recorded after param change"
        # compare two snapshots
        if rows >= 2:
            page.click("#btnCompare")
            page.wait_for_timeout(2000)
            olds = page.locator("#dashboard .old").count()
            assert olds >= 1, "compare mode should show old values"

    def test_dashboard_no_overlap(self, page):
        """推挤式布局：指标盘展开时 3D 与指标盘都可见（无遮挡）。"""
        page.wait_for_timeout(1000)
        page.click("#btnDash")
        page.wait_for_timeout(500)
        dash_box = page.locator("#rightCol").bounding_box()
        scene_box = page.locator("#scene3d").bounding_box()
        assert dash_box is not None and scene_box is not None
        assert dash_box["x"] > scene_box["x"] + scene_box["width"] * 0.5
```

- [ ] **Step 3: 跑 e2e + 性能**

Run: `python -m pytest tests/e2e/test_workbench_flow.py -q`
Expected: 2 passed（页面加载 + 全流程 < 30s/测试）

性能验证（脚本）：浏览器 console 计时 `runSolve`（<100ms）与 `runAnalyze`（<2s）。

- [ ] **Step 4: 全量回归 + Commit**

Run: `python -m pytest tests/ -q --ignore=tests/e2e` 2>&1 | tail -3
Expected: 全部 PASS

```bash
git add tests/e2e/test_workbench_flow.py web/vite.config.js
git commit -m "test(e2e): workbench iteration loop + fix vite proxy port"
```

- [ ] **Step 5: 更新 DEVLOG + PLAN**

`docs/DEVLOG.md` 顶部追加 2026-08-12 条目（工作台重写 + 指标层 + P0 修复）；`docs/PLAN.md` 里程碑加 V10。

```bash
git add docs/DEVLOG.md docs/PLAN.md
git commit -m "docs: devlog + plan for workbench rewrite"
```

---

# 自审记录

- **Spec 覆盖**：P0=§11 阶段1（3 失败测试 + F4/F6）✓；P1=§6.2 四模块 + §7 API ✓；P2=§4 布局/§8 历史 ✓；P3=§5.2 性能 + §10 e2e ✓。rc_height_delta/jacking/tie_rod_force 在 analyze 中置 None（P3 细化），spec §5.1 保留为目标带条目——不阻塞首版。
- **占位符**：无 TBD；analyze 中 rocker motion_ratio 缺失时用默认 0.7/0.6 兜底（显式写出）。
- **类型一致性**：`state.selected` 为 snapshot id 数组；`pushSnapshot` 返回 snap 或 null；`evaluate_metric(key, value)` 签名在 Task 6/10 一致；`_solve_axle` 返回 `axle["right"]` 结构在 analyze（Task 10）与 solve.py 一致。
