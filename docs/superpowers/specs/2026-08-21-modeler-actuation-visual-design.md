# modeler 传动链真值化 + 视觉对齐 DWB-SIM 设计规格

日期：2026-08-21
状态：已评审通过（用户逐节确认）
范围：自研系统（`web/modeler.html` + `src/routes/v2.py` + `src/solver/mechanism/` + `src/config.py`）

---

## 1. 背景与问题

用户判定：modeler 的建模远差于参考 DWB-SIM，且「不是真正的前推杆后拉杆悬架」。诊断出三层根因：

### 1.1 传动链显示错误（核心）

后端机构真相（`solver/mechanism/models.py`）：

```
推杆 PUSHROD = UP4→CH5 刚线（UP4 随立柱运动）
摇臂 ROCKER = CH5 + RK_DAMPER 绕 RK_PIVOT（X 轴）旋转
弹簧减振器   = RK_DAMPER→DAMPER_CHASSIS（长度变化 = 阻尼行程）
```

但前端 `modeler.html` 把螺旋弹簧图形直接画在 CH5↔UP4 连线上：

- 推杆没有画成杆，被假弹簧顶替；
- 摇臂三节点（RK_PIVOT/RK_DAMPER/DAMPER_CHASSIS）后端每次都算（`v2adapter._RESULT_KEYS`），但 `_wheel_pose`（v2.py）剥掉未发；
- CH5 在前端被当固定点，永不运动。

### 1.2 视觉细节比 DWB-SIM 少一档

缺失：车架支点衬套、完整减振塔、随齿条平移的转向机壳、解析 ARB 扭杆几何、车轮/制动盘细分不足、UP4 球头环。

### 1.3 后轴拉杆分支翻转 bug（数值实证）

用机制求解器实测（2026-08-21，travel → damper_travel）：

```
FRONT（推杆，行为正确）
  +10mm → −1.88mm（压缩✓）   −30mm → +8.73mm（伸张✓）   MR ≈ 0.19

REAR（拉杆，分支翻转）
  +10mm → −0.64mm（方向对）  MR ≈ 0.06（近零）
  −10mm → +134.8mm，摇臂转 152°  ← 翻到错误分支
  −30mm → +132.9mm，摇臂转 150°  ← 同样翻转
```

根因：`solve_rocker`（solver/mechanism/solver.py:95）括号搜索试到 ±3.1rad 并采纳**第一个**变号区间；后轴摇臂输入臂在枢轴下方（CH5 z=105 < pivot z=155）、输出臂朝上，伸张端先碰到 ~150° 远端解——机构可达但物理荒谬。且后轴 MR 近零，阻尼器几乎不工作。

## 2. 目标与非目标

**目标**

1. API 下发真实传动链（推杆/摇臂/弹簧减振器五点 + 行程），前端按真值渲染、随动画运动。
2. 修复 `solve_rocker` 分支选择；重排后轴框架节点种子，使后轴成为行为正确的 pullrod（MR 0.45–0.65，±45mm 无翻转，−120mm 伸张可达或诚实 OUT_OF_RANGE）。
3. 视觉细节对齐 DWB-SIM（衬套/减振塔/转向机随动/ARB 解析扭杆/车轮细分/球头环）。

**非目标（另立轮次）**

- 运动轨迹线、主销扫掠面、IC/RC 构造线 overlay 等分析呈现。
- 前轴硬点/MR 重调（前轴行为正确，MR 属设计参数，用户后续自行调 DESIGN_PARAMS）。
- 魔改 DWB 与原版 DWB 的任何改动。

## 3. 方案决策

**选定方案 A：后端真值驱动。** `_wheel_pose` 增加 `actuation` 块，前端零运动学。

否决：
- 方案 B（前端 JS 复刻 solve_rocker）：运动学双实现必然漂移——现有假弹簧正是「前后端各说各话」的产物。
- 方案 C（仅静态链条不随动）：不满足动画需求。

## 4. 设计

### 4.1 后端数据层：ActuationChain

`core/results.py` 新增：

```python
class ActuationChain(BaseModel):
    kind: str                    # "pushrod" | "pullrod"
    pushrod_outer: list[float]   # UP4 解算位（随动）
    rocker_input: list[float]    # CH5 解算位（摇臂输入臂端，随动）
    rocker_pivot: list[float]    # RK_PIVOT（车架固定）
    damper_rocker: list[float]   # RK_DAMPER 解算位（输出臂端，随动）
    damper_chassis: list[float]  # DAMPER_CHASSIS（车架固定）
    damper_len_mm: float         # 当前弹簧减振器长度
    damper_travel_mm: float      # 相对设计位（负=压缩）
    pushrod_len_mm: float        # 推杆长度（刚线恒定）
```

`WheelPose` 增加可选字段 `actuation: ActuationChain | None = None`（旧客户端兼容）。

要点：
- 零新增计算：mechanism 路径 result dict 已含全部键，rocker dict 已含 `damper_len_current/damper_travel`；sequential 回退路径经 `_merge_chassis` + `rocker_right` 同样可填充。
- `kind` 判定规则：`CH5.z < RK_PIVOT.z → "pullrod"`，否则 `"pushrod"`（当前前 305>270 ✓、后 105<155 ✓）。简单、可解释、可测试。
- `/solve/hardpoints`、`/solve`、`/sweep` 内联自动携带（共用 `_wheel_pose`）。

### 4.2 机构修复

**4.2a `solve_rocker` 分支选择重写**

- θ ∈ [−160°, +160°] 以 10° 粗扫收集**全部**变号区间 → 逐个二分求根 → 取 **|θ| 最小**的根（离设计位最近的连续解，continuation 原则）。
- `Mechanism` 增 `last_theta` 热启动字段：有历史时优先取离上次最近的根；首轮退化为 |θ| 最小。
- 最小 |θ| 仍 >90° → `ok=False`（真不可达，维持 OUT_OF_RANGE 语义）。

**4.2b 后轴框架节点重排**（config.py `DEFAULT_FRAME_NODES`：`R_RK_PIVOT_R / R_RK_DAMPER_R / R_DAMPER_CHASSIS_RR`）

- 目标门：① 压缩 +45mm 单调压缩、伸张 −120mm 全程无翻转（|rocker_deg|<60）；② 后轴 MR ∈ [0.45, 0.65]；③ 保持 pullrod 特征（bump 杆受拉、阻尼器压缩）。
- 方法：实现期一次性网格搜索脚本（变量=三框架节点 y/z），按目标门打分择优，人工复核后写入 config。

**4.2c `ensure_legacy_import` 幂等盲区修复**（连带必需）

现状：store 已有 legacy-import 则永不更新，config 改动对用户不可见。修复：`build_legacy_design_version()` 计算几何源指纹——`sha256(json.dumps({"design": DESIGN_PARAMS, "frame_nodes": DEFAULT_FRAME_NODES}, sort_keys=True))[:8]`，存入 `notes`（如 `src=ab12cd34`）；`ensure_legacy_import` 发现指纹变化 → `add_design_version` 追加新版本而非跳过。

### 4.3 前端传动链渲染（modeler.html）

- `displayCorner()` 从 `pose.actuation` 取五点；无字段的旧响应回退：CH5 用模板位、只画推杆线、不画摇臂/阻尼器（保证不崩）。
- `FIXED` 集合调整：CH5 移出固定样式（随摇臂转动，显示为运动小球）；渲染层新增 RK_PIVOT/DAMPER_CHASSIS 为车架红方块。
- 新图元（替换现 sh.spring 假弹簧分支）：

```
推杆        cyl(UP4→CH5, r=7) + 两端三向球头环          —— 随动刚线
摇臂        PL([pivot, CH5, RK_DAMPER]) 半透明面片
            + 两臂粗线(w=2.2) + 枢轴短圆柱(X 轴向, r=10)
弹簧减振器  沿 RK_DAMPER→DAMPER_CHASSIS：
            减振杆 cyl(上 6%→52% 段, r=13) + 细杆到下端
            + springPts 线圈(r=30, 7 圈, 72 段)
            + 上下弹簧座 circPts 圆环(r=36)
```

渲染风格复刻 DWB-SIM §8 elastic 分支视觉语言，坐标全部来自 API 真值。

性能预算：每角新增约 250 图元 ×4 角 ≈ 1000，与 DWB-SIM 单侧同量级；场景缓存机制（`sceneDirty`）不变。

### 4.4 视觉对齐清单

| # | 项目 | 做法 |
|---|---|---|
| 1 | 车架支点衬套 | CH1–CH4 各加轴向短圆柱（沿摆臂铰轴方向，r=13） |
| 2 | 减振塔升级 | 顶板矩形 + 四根撑线到车架盒顶 + 上支点座短粗圆柱 |
| 3 | 转向机随动 | 齿条轴两端改用解算 `pose.tie_rod_inner`（字段已有，现误用模板 FL1）；小齿轮柱联动 |
| 4 | ARB 解析扭杆 | 移植 DWB `arbGeom` 余弦定理（JS ~20 行）：扭杆横轴 + 折臂 E 点解析 + droplink 连 LCA 上 t 参数点 + 超程红色警告文本；替换现「直线段+连 UP2」画法 |
| 5 | 车轮细分 | 轮胎圆 26→40 段、胎纹 14→22、轮辋 24→32、制动盘扇叶 12→16 |
| 6 | 球头环补全 | UP4 补三向环 |

### 4.5 验证与回归

自动化门：
1. pytest 全量绿（现 448 collected）。
2. 新增 `tests/test_actuation.py`：
   - `/solve/hardpoints` 每角含 `actuation`，且 `damper_len_mm == |damper_rocker − damper_chassis|`；
   - 符号门：front +30mm → `damper_travel<0`，−30mm → `>0`；
   - 后轴修复门：rear ±45mm 内 |rocker_deg|<60 无翻转；−120mm 伸张可达或诚实 OUT_OF_RANGE（禁止 +134mm 类荒谬值）；
   - MR 门：后轴几何 MR ∈ [0.35, 0.75]（留余量）。
3. 复跑数值脚本（check_rod），前后轴新 MR 与行程表存入 DEVLOG。

人工验收（用户执行）：四角推杆/摇臂/弹簧可见且随动画运动；拖硬点链条即时跟随；转向时齿条壳平移；ARB 形状正常无超程误报；fps ≥ 40。

文档：DEVLOG 同步 + 本 spec 归档。

## 5. 风险与边界

- **测试快照影响**：后轴框架节点变更会改变 mechanism bench/golden 数值——预期内，随修复更新断言并注明理由。
- **legacy-import 版本追加**：指纹机制会让老用户的 store 出现 v2 版本；版本列表只增不减，符合 append-only 设计。
- **性能**：图元增量 ~1000，若 fps 实测不达标，优先降线圈段数（72→48）而非砍部件。
- **回退安全**：`actuation=None` 时前端降级为旧行为；`DWB_SOLVER_MODE=sequential` 回退路径同样填充 actuation，双路径一致。
