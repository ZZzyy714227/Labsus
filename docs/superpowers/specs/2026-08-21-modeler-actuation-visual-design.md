# modeler 传动链 PRO 拓扑替换 + 视觉对齐设计规格

日期：2026-08-21
状态：已评审通过（用户逐节确认，含 PRO 拓扑升级版）
范围：自研系统（`web/modeler.html` + `src/routes/v2.py` + `src/solver/mechanism/` + `src/core/` + `src/config.py` + `src/hardpoints.py`）

---

## 1. 背景与问题

用户判定：modeler 的建模远差于参考 DWB-SIM，且「不是真正的前推杆后拉杆悬架」。随后提供新蓝本 **DWB-SIM PRO**（前推杆/后拉杆多体仿真台），并拍板：**拓扑对齐 PRO，尺寸沿用现有 FSAE 车（wb 1550 / 前轨 1220 / 后轨 1180 / 13" 胎）**。

### 1.1 现拓扑缺陷（诊断）

当前后端机构（`solver/mechanism/models.py`）：

```
推杆 PUSHROD = UP4→CH5 刚线（UP4 在转向节上，非摆臂上）
摇臂 ROCKER = CH5 + RK_DAMPER 绕单点 RK_PIVOT、绕全局 X 轴
弹簧减振器 = RK_DAMPER→DAMPER_CHASSIS
```

- 推杆外端挂转向节（UP4）而非下摆臂 → 与真实 FSAE 推杆（挂 LCA）不符；
- 摇臂轴退化为单点+固定 X 轴 → 无法表达任意方向的两点转轴；
- 前端把螺旋弹簧画在 CH5↔UP4 连线上（假弹簧），摇臂链完全不渲染；
- 后轴拉杆存在分支翻转 bug（实测 −10mm 时摇臂转 152°、阻尼行程 +134.8mm 荒谬值）。

### 1.2 DWB-SIM PRO 拓扑（新蓝本）

```
前轴（推杆）：LCA 铰链 → STRUT_OUT(下摆臂上) →→ CH5(摇臂输入臂端)
后轴（拉杆）：UCA 铰链 → STRUT_OUT(上摆臂上) →→ CH5
摇臂：绕两点轴 RCK_AX_A → RCK_AX_B（任意方向）旋转，输出臂端 RK_DAMPER
内置减振器（弹性线）：RK_DAMPER → DAMPER_CHASSIS
```

PRO 坐标轴为 DWB 惯例（X=外侧 / Y=向前），产品为 X=前 / Y=右，跨系统取数必须换算。

## 2. 目标与非目标

**目标**

1. 后端机构重建为 PRO 拓扑：STRUT_OUT 挂 LCA（前）/UCA（后）铰链簇、摇臂绕两点轴、内置减振器弹性线。
2. 修复摇臂求解：任意轴 Rodrigues 旋转 + 全括号最近根分支选择（消灭 150° 翻转）。
3. API 下发真实传动链（actuation 块），前端按真值渲染、随动画运动。
4. 坐标从 PRO 预设换算缩放到 FSAE 尺寸，数值验证门（MR / 可达性 / 推拉杆行为符号）。
5. 视觉细节对齐 DWB-SIM（衬套/减振塔/转向机随动/ARB 解析扭杆/车轮细分/球头环）。

**非目标（另立轮次）**

- 运动轨迹线、主销扫掠面、IC/RC 构造线 overlay 等分析呈现。
- 前轴硬点重调（现有 CH1-4/UP1-5/FL1 保持 FSAE 尺寸不动）。
- 魔改 DWB / 原版 DWB 的任何改动。

## 3. 方案决策

**选定方案 A：后端真值驱动 + PRO 拓扑重建。** 否决前端复刻求解（双实现漂移）与仅前端画法（渲染与物理不一致）。

键名方案（复用 + 新增 3 键，最小破坏面）：

| 新拓扑角色 | 键 | 来源 |
|---|---|---|
| 杆外端（LCA/UCA 上） | `STRUT_OUT` | **新增** |
| 摇臂输入臂端 | `CH5` | 复用（原"推杆车架点"，角色一致） |
| 摇臂轴两点 | `RCK_AX_A` / `RCK_AX_B` | **新增 ×2** |
| 摇臂输出臂端 | `RK_DAMPER` | 复用（=PRO `RCK_DMP` 角色） |
| 减振器车架点 | `DAMPER_CHASSIS` | 复用（=PRO `DMP_BODY` 角色） |

理由：旧 store/fixture 已有 CH5/RK_* 键，只需补 3 个新键默认值，兼容面最小；语义等价。PRO 命名仅用于前端显示名。

## 4. 设计

### 4.1 数据模型（core/models.py + core/results.py）

`POINT_KEYS` 增加 `STRUT_OUT` / `RCK_AX_A` / `RCK_AX_B` 三个键（前端硬点表、store 校验、镜像自动覆盖）。

`core/results.py` 新增 ActuationChain，`WheelPose` 挂可选字段：

```python
class ActuationChain(BaseModel):
    kind: str                    # "pushrod" | "pullrod"
    strut_outer: list[float]     # STRUT_OUT 解算位（随 LCA/UCA 铰链旋转）
    rocker_input: list[float]    # CH5 解算位（摇臂输入臂端，随动）
    rocker_axis_a: list[float]   # RCK_AX_A（车架固定）
    rocker_axis_b: list[float]   # RCK_AX_B（车架固定）
    damper_rocker: list[float]   # RK_DAMPER 解算位（输出臂端，随动）
    damper_chassis: list[float]  # DAMPER_CHASSIS（车架固定）
    damper_len_mm: float
    damper_travel_mm: float      # 负=压缩
    strut_len_mm: float          # 推/拉杆长度（刚线恒定）
```

`kind` 判定：`CH5.z < RCK_AX_A.z → "pullrod"` 否则 `"pushrod"`。

### 4.2 机构重建（solver/mechanism/）

**build_mechanism（models.py）**

- LCA 铰链簇 members：`["UP2", "STRUT_OUT"]`（前轴推杆挂 LCA）
- UCA 铰链簇 members：`["UP1", "STRUT_OUT"]`（后轴拉杆挂 UCA）—— 由 build_mechanism 参数 `strut_on: "lca" | "uca"` 控制
- 摇臂簇：`kind="rocker"`，anchor=`RCK_AX_A`，axis=`unit(RCK_AX_B − RCK_AX_A)`，members `["CH5", "RK_DAMPER"]`
- 刚线：`STRUT`（STRUT_OUT→CH5，替代原 PUSHROD UP4→CH5）；`TIE` 保留
- 弹性线：`DAMPER`（RK_DAMPER→DAMPER_CHASSIS）
- `_FIXED` 更新：RCK_AX_A/B、DAMPER_CHASSIS 固定；CH5/RK_DAMPER 为摇臂从动成员；STRUT_OUT 为铰链从动成员
- 框架节点从 `DEFAULT_FRAME_NODES` 读 `RCK_AX_A/B`（新增键）

**solve_rocker（solver.py）**

- 绕任意轴旋转（Rodrigues；`geometry.py` 增 `rotate_around_axis(p, axis_pt, axis_dir, theta)`）
- 分支选择：θ ∈ [−160°, +160°] 以 10° 粗扫收集全部变号区间 → 逐个二分求根 → 取 |θ| 最小；`Mechanism.last_theta` 热启动优先最近根；最小 |θ| > 90° → ok=False（真不可达）
- 弹性线长度写入：`damper_len = |RK_DAMPER − DAMPER_CHASSIS|`，`damper_travel = damper_len − 设计位长度`

**v2adapter / pose / from_legacy**

- `_frame_points`：RCK_AX_A/B、DAMPER_CHASSIS 从 `DEFAULT_FRAME_NODES` 取（前 `RCK_AX_A_R` 等，后 `R_RCK_AX_A_R` 等，左=镜像 Y）
- `solve_corner_mechanism`：`build_mechanism(..., strut_on=...)`，轴前缀判别逻辑不变
- 输出 result 键集扩展：+STRUT_OUT / RCK_AX_A / RCK_AX_B

### 4.3 几何源（config.py / hardpoints.py / legacy_import.py）

- `DEFAULT_FRAME_NODES` 新增：`RCK_AX_A_R`、`RCK_AX_B_R`、`R_RCK_AX_A_R`、`R_RCK_AX_B_R`（坐标由换算脚本产出）
- `hardpoints.py derive_hardpoints`：`STRUT_OUT` 派生——前轴在 LCA 三角面内 LBJ 与摆臂轴之间取比例点；后轴在 UCA 三角面内（比例参数进 `DESIGN_PARAMS`：`strut_out_t_lca` / `strut_out_t_uca`）
- `CH5` 保留现有派生（前 305 / 后 105，摇臂输入臂端）
- `ensure_legacy_import` 指纹刷新（沿用 v1 §4.2c）：`sha256(json.dumps({"design": DESIGN_PARAMS, "frame_nodes": DEFAULT_FRAME_NODES}, sort_keys=True))[:8]` 存 notes，变化则追加新版本

### 4.4 坐标换算（一次性脚本，实施期运行）

- 映射：`product = (PRO_y, PRO_x × s, PRO_z)`；`s = 产品半轨 / PRO 半轨`（前 610/810 ≈ 0.7531、后 590/790 ≈ 0.7468）
- 产出：新 3 键（STRUT_OUT / RCK_AX_A / RCK_AX_B）默认坐标，写入 config.py + hardpoints.py 派生参数
- 数值门（复用调参脚本改造）：前后轴 ±45mm 无翻转（|rocker_deg|<60）、+10mm 压缩 / −10mm 伸张、后轴 MR ∈ [0.35, 0.75]、−120mm 可达或诚实 OUT_OF_RANGE

### 4.5 前端渲染（modeler.html）

- `POINT_NAMES` / `SEED` / 硬点表：+3 新键（STRUT_OUT "推拉杆外端"、RCK_AX_A/B "摇臂轴"）；CH5 名称改 "摇臂输入"；RK_DAMPER "摇臂输出"、DAMPER_CHASSIS "减振器车架"
- `displayCorner()`：从 `pose.actuation` 取七点（无该字段回退：STRUT_OUT 用模板、不画摇臂/减振器，仅画 STRUT 线）
- `FIXED` 集合：RCK_AX_A/B、DAMPER_CHASSIS 固定红方块；CH5/RK_DAMPER/STRUT_OUT 随动小球
- 新图元（替换假弹簧分支）：
  - STRUT 杆：cyl(STRUT_OUT→CH5, r=7) + 两端球头环
  - 摇臂：PL([axisA, CH5, RK_DAMPER]) 半透明面片 + 轴圆柱(RCK_AX_A→B, r=10) + 双臂粗线 + 臂端球环
  - 内置减振器：沿 RK_DAMPER→DAMPER_CHASSIS —— 减振杆 cyl(6%→52%, r=13) + springPts 线圈(7 圈, 72 段) + 上下弹簧座圆环
- 渲染风格复刻 DWB-SIM PRO §7（strut 青 / rocker 琥珀 / ela 金），坐标全部来自 API 真值

### 4.6 视觉对齐清单（对齐 DWB-SIM）

| # | 项目 | 做法 |
|---|---|---|
| 1 | 车架支点衬套 | CH1–CH4 各加轴向短圆柱（r=13） |
| 2 | 减振塔升级 | 顶板矩形 + 四根撑线 + 上支点座短粗圆柱 |
| 3 | 转向机随动 | 齿条轴两端改用解算 `pose.tie_rod_inner`；小齿轮柱联动 |
| 4 | ARB 解析扭杆 | 移植 DWB `arbGeom` 余弦定理：扭杆横轴 + 折臂 + droplink 连 LCA 上 t 参数点 + 超程警告 |
| 5 | 车轮细分 | 轮胎圆 26→40、胎纹 14→22、轮辋 24→32、制动盘扇叶 12→16 |
| 6 | 球头环补全 | STRUT_OUT / CH5 / RK_DAMPER 三向环 |

### 4.7 验证与回归

自动化门：

1. pytest 全量绿（现 448 collected）。
2. 新增 `tests/test_actuation.py`：
   - `/solve/hardpoints` 每角含 `actuation`，且 `damper_len_mm == |damper_rocker − damper_chassis|`、`strut_len_mm == |strut_outer − rocker_input|`
   - 符号门：front +30mm → `damper_travel<0`、−30mm → `>0`；rear 同号压缩且 |rocker_deg|<60
   - 后轴修复门：rear ±45mm 无翻转；−120mm 可达或诚实 OUT_OF_RANGE（禁止 +134mm 类荒谬值）
   - MR 门：前后轴几何 MR ∈ [0.35, 0.75]
3. 换算脚本数值门复跑，前后轴新 MR 与行程表存入 DEVLOG。
4. mechanism 测试/bench 快照随拓扑更新（断言按新拓扑注明理由）。

人工验收（用户执行）：四角 STRUT 杆/摇臂/内置减振器可见且随动画运动；拖硬点链条即时跟随；转向时齿条壳平移；ARB 形状正常；fps ≥ 40。

文档：DEVLOG 同步 + 本 spec 归档。

## 5. 风险与边界

- **测试快照影响**：机构拓扑变更会改变 mechanism bench/golden 数值——预期内，随修复更新断言并注明理由。
- **兼容性**：actuation=None 时前端降级旧行为；`DWB_SOLVER_MODE=sequential` 回退路径同样填充 actuation（用 rocker_angle 重算三点）。
- **性能**：图元增量 ~1000，若 fps 不达标，优先降线圈段数（72→48）。
- **坐标换算不确定**：若换算后数值门不过，允许在换算结果基础上人工微调比例参数（strut_out_t_*）直至过门。
