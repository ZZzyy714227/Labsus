# V1 里程碑进展同步（2026-08-20）

> 状态快照：P0 数据地基完成、P1 求解误差论证完成并冻结架构决策、进入 P2 运动学指标与统一结果结构。
> 本文件用于跨会话交接；开发细节以 DEVLOG 与各 spec/plan 为准。

## 一、当前产品定位

目标产品已明确为：

> **面向 FSAE 赛车底盘硬点快速迭代的整车准静态几何与轮边受力分析工具。**

不是：

- 单轴悬架动画；
- 3D 展示器；
- 指标面板；
- 完整整车 CAD；
- 时域多体动力学软件；
- 黑盒自动优化工具。

核心闭环：

```text
整车底盘方案
→ 明确分析工况
→ 四轮几何状态
→ 定位角/接地几何
→ 四轮载荷
→ 轮边杆件受力
→ 残差与可信状态
→ 方案 A/B 对比
→ 下一轮硬点修改
```

## 二、已完成工作

### 1. 设计文档基线

已完成并更新：

- 参考 `double-wishbone-suspension.html` 的完整设计分析；
- FSAE 底盘工具总方案；
- V1/V2/V3 边界；
- 方案、工况、结果三层模型；
- 坐标、符号和角度规范；
- 左右侧非镜像物理建模原则；
- P0–P4 实施阶段；
- 数据模型迁移方案；
- 验证阈值与性能预算；
- P1 求解架构决策。

核心文档：

```text
docs/superpowers/specs/2026-08-16-dwb-sim-system-methodology.md
docs/superpowers/specs/2026-08-16-fsae-chassis-development-tool-v1-design.md
docs/superpowers/specs/2026-08-20-p1-solver-gate-report.md
```

开发日志：

```text
docs/DEVLOG.md
```

### 2. P0 数据地基：100% 完成

已完成：

- 坐标与符号规范；
- `CoordinateConvention`；
- `ChassisDesign`；
- `AnalysisCase`；
- `AnalysisResult`；
- `ResultStatus` 七状态；
- 版本化 JSON 存储；
- 原子写入；
- legacy 数据导入；
- v2 API 边界；
- 14 个预置分析工况；
- 方案/工况/结果版本绑定基础；
- 黄金值 benchmark；
- P0 回归测试。

主要文件：

```text
src/core/convention.py
src/core/models.py
src/core/store.py
src/core/legacy_import.py
src/routes/v2.py
tests/test_convention.py
tests/test_hand_benchmark.py
```

P0 状态：

```text
259 passed / 4 xfailed
```

### 3. P1 求解误差论证：已完成

#### 3.1 顺序解基线

当前生产路径：

```text
solve_bump
→ solve_steering
→ alignment
→ contact patch
```

已经接入 P1 对照报告，并记录：

- Camber；
- Toe；
- Caster；
- KPI；
- Scrub；
- Trail；
- 接地点；
- Steering Axis；
- 几何残差；
- 迭代次数；
- 耗时；
- 状态。

#### 3.2 统一约束候选解

新增隔离候选求解器：

```text
src/solver/coupled_candidate.py
```

包含：

- 摆臂约束；
- 主销长度；
- 轮心距离；
- 横拉杆长度；
- 推杆长度；
- 轮跳驱动；
- 转向节刚体内部距离；
- rank deficiency 检查；
- raw residual；
- 状态和失败解释。

它没有替换生产求解器，也没有修改生产 endpoint。

#### 3.3 P1 对照矩阵

矩阵：

```text
travel = [-30, -15, -5, 0, 5, 10, 15, 30] mm
rack   = [0, 5] mm
```

共 16 个工况。

报告：

```text
data/reports/p1_solver_gate.json
```

#### 3.4 K-4 结果

顺序解原始几何残差：

```text
负行程最大值：0.731417 mm
travel = -30 mm, rack = 0

正行程最大值：0.497062 mm
travel = +30 mm, rack = 0
```

结论：

- 负行程问题更严重；
- 残差主要与轮跳方向相关；
- 当前矩阵未观察到 rank deficiency；
- 不能用后处理平滑掩盖残差；
- 全行程尚未达到 `≤0.02 mm` 的设计阈值。

#### 3.5 P1 最终架构决策

已冻结：

```text
SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION
```

具体含义：

```text
现有顺序解：
    保留为生产预览和兼容路径

统一候选解：
    保留为后台/按需高精度验证路径

暂不：
    直接用统一候选解替换生产求解器
```

原因：

- 现有顺序解仍然是目前最稳定的生产资产；
- 统一候选解尚未全部达到 `VALID`；
- 统一求解替换生产路径的风险没有被证明可接受；
- K-4 尚未解决。

## 三、已知问题登记

### K-1：左右镜像 Scrub 不对称（P2-0 已修复）

原状：右 19.78 / 左 17.84 mm，根因是 `compute_contact_patch` 的旧坐标系 "X=up" 外倾公式
（只算得 -0.218°）与同向横向偏移。P2-0 改为轮面投影后左右完全对称（静态六项指标 delta=0，1e-6 级），
xfail 哨兵移除并升级为严格镜像测试。新黄金值 scrub ≈ 29.90 mm（含正确的外倾横向偏移）。

### K-2：Toe 符号（P2-0 已修复）

已统一为 **Toe-in = 正**（两侧同号），rack=+5mm → 右轮 +3.33° / 左轮 -3.42°（平行转向、物理正确）。

### K-3：Caster Trail 符号（P2-0 已修复）

根因有两层：`caster` 公式与经典相反（top-forward 输出正号），且 `derive_hardpoints` 把默认几何
推导成反 caster（top-forward）。P2-0 修正公式为 `atan2(kp_vec[0], -kp_vec[2])`、几何 z_local x 分量
改 `+sin(ca)` 后，默认几何为经典正 caster（5.005°），trail 变 +22.40 mm（经典正）。

### K-4：全行程求解残差

当前顺序解在全行程存在明显超阈值残差：

```text
阈值：0.02 mm
实际：负行程最高约 0.731 mm
```

尚未修复，也未伪装成已修复。

## 四、当前主要输出与提交

关键提交已经完成：

```text
5fa0352  P1 基准测试骨架
8e36da1  P1 类型与 JSON 契约
ae8f73c  顺序解基线适配
f5fc93f  fallback 失败语义
4179a31  统一约束候选求解器
1217fe7  候选诊断补全
2349ad3  rank deficiency 状态
91e4e78  P1 对照矩阵
a4a7138  P1 delta 与 CLI
00a2924  K-4 分方向/rack/rank 诊断
4288ce7  steering axis 归一化
3ba1b47  P1 架构决策
```

当前分支：

```text
workbench-rewrite
```

## 五、验证状态

P1 聚焦测试：

```text
21 passed
```

P1 相关代码：

- Ruff 通过；
- mypy 通过；
- `git diff --check` 通过；
- 根目录 CLI 报告生成通过。

全量测试最后结果：

```text
252 passed
5 failed
23 errors
33 skipped
4 xfailed
```

剩余失败主要是当前 Windows 沙箱环境导致的：

- pytest 临时目录无法访问；
- `tmp_path` 权限错误；
- `data/store` 写入权限错误；
- `persistent_state.json` 写入权限错误。

不能将全量测试描述为完全通过。

## 六、下一阶段：P2 运动学指标与统一结果结构

> **状态（2026-08-20 更新）：P2-0 已完成**——K-1/K-2/K-3 修复、八项定义冻结、
> `fix_left_angles` 移出规范层、镜像回归达 1e-6。见 `docs/superpowers/plans/2026-08-20-p2-0-sign-and-symmetry.md`
> 与 DEVLOG。下一步为 P2-1 统一结果结构。

### P2-0：先修坐标和符号问题（已完成）

优先处理：

1. K-1 左右 Scrub 镜像不对称；
2. K-2 Toe 正负号；
3. K-3 Caster Trail 正负号；
4. 左右独立实例和镜像回归测试；
5. `fix_left_angles()` 等后处理特判逐步退出规范层。

必须先固定：

```text
Camber 正负
Toe-in/Toe-out 正负
KPI/SAI 定义
Caster 定义
Scrub Radius 定义
Mechanical Trail 定义
Ackermann 定义
```

### P2-1：扩展统一结果结构（已完成）

> **状态（2026-08-20 更新）**：v2 solve 已输出统一 `VehicleResult`（见
> `src/core/results.py`），每轮含姿态/定位角/接地点/主销轴/轨迹/残差/状态；
> 顺带修复 v2 残差恒为 0 的伪造缺陷（`_solve_axle` 现于 bump 后捕获残差并与
> 横拉杆残差取 max），并前置残差→状态映射（VALID/APPROXIMATE/OUT_OF_RANGE）。

将 v2 solve 结果扩展为：

```text
VehicleResult
├── front
│   ├── left
│   └── right
├── rear
│   ├── left
│   └── right
├── per_wheel_geometry
├── residuals
├── solver_status
└── warnings
```

每个车轮统一输出：

- 姿态；
- 定位角；
- 接地点；
- 主销轴；
- 轨迹；
- 残差；
- 状态。

### P2-2：补齐指标（主体已完成）

> **状态（2026-08-20 更新）**：src/metrics/kinematics.py + /api/v2/sweep 已交付
> Included Angle / SCG / Bump Steer / Ackermann / Roll Center 曲线 / SVIC / Pitch Center /
> Anti-dive·squat 重写 / Wheelbase·Track Change / 几何 Motion Ratio / KPI·Scrub·Trail 曲线；
> **analyze.py 硬编码 mr 0.7/0.6 已移除**（rockers 几何 MR）；Jacking 显式 NOT_IMPLEMENTED（P3 载荷）。
> 见 DEVLOG 2026-08-20 P2-2 条目。

按顺序：

1. KPI/SAI 随轮跳；
2. KPI/SAI 随转向；
3. Scrub；
4. Mechanical Trail；
5. Caster Trail 符号；
6. Ackermann；
7. Steering Camber Gain；
8. Caster 与 Bump Steer 联动；
9. Pitch Center；
10. 侧视 IC；
11. Anti-dive/squat 重写；
12. Wheelbase Change；
13. Track Change；
14. Included Angle；
15. 几何 Motion Ratio；
16. Jacking 真实计算；
17. Roll Center 随行程曲线。

特别注意：

```text
不能继续使用 analyze.py 中硬编码的 mr_f=0.7、mr_r=0.6。
```

### P2-3：指标状态机

所有指标必须返回：

```text
VALID
APPROXIMATE
NOT_APPLICABLE
NOT_IMPLEMENTED
SOLVER_FAILED
EQUILIBRIUM_FAILED
OUT_OF_RANGE
```

禁止：

```text
None
→ 页面空白
→ 用户误以为已计算
```

### P2-4：验证

每个新指标都要有：

- 手算 benchmark；
- 左右镜像对称测试；
- 正负方向测试；
- 静态工况测试；
- 轮跳曲线测试；
- 转向曲线测试；
- 失效/奇异状态测试。

## 七、后续 P3：载荷与轮边受力

P2 完成并通过验证后，再进入 P3。

### 整车层（已完成）

> **状态（2026-08-20 更新）**：src/metrics/wheel_loads.py 交付四轮 Fx/Fy/Fz 分配
> （静态/纵向/横向三分量/az 额外垂向/摩擦圆/离地警告）；v2 solve 增加 loads 层；
> Jacking 已解冻为真实力。见 DEVLOG 2026-08-20 P3 条目。

计算四轮 Fx/Fy/Fz，包括：

- 静态载荷；
- 侧向载荷转移；
- 制动载荷转移；
- 加速载荷转移；
- 前后分配；
- 左右分配；
- 几何/弹性/非簧载载荷转移；
- 摩擦圆利用率；
- 负载/离地警告。

### 轮边层（已完成）

> **状态（2026-08-20 更新）**：src/metrics/loads.py 已重写为转向节 6-DOF 二力杆模型
> （UCA/LCA 前后支杆 + 推杆 + 横拉杆 + ARB 连杆 + 球头三向反力 + 支点反力 +
> 合力/力矩残差 + 奇异性报告），左右独立求解、不镜像。见 DEVLOG 2026-08-20 P3 条目。

重写现有 `src/metrics/loads.py`，不能扩展旧模型。

新模型：

```text
二力杆
+ 球铰三向反力
+ 当前轮边几何
+ 当前轮胎三向力
```

输出：

- UCA 前后支杆轴向力；
- LCA 前后支杆轴向力；
- 推杆/拉杆力；
- 横拉杆力；
- 防倾杆连杆力；
- 上下球头三向反力；
- 摆臂内侧支点反力；
- 转向节合力残差；
- 力矩残差；
- 奇异性报告。

左右侧必须：

```text
独立求解
通过整车载荷/车身/转向/防倾杆耦合
不能镜像受力结果
```

## 八、后续 P4：工程迭代工作流

- 前端方案新建；
- 加载方案；
- 复制方案；
- 版本回退；
- 工况复用；
- 方案 A/B 对比；
- 曲线叠加；
- 硬点差异；
- 指标差异；
- 杆件力差异；
- CSV/JSON 导出；
- 敏感性分析；
- 残差/假设/状态展示。

### 敏感性分析第一版

先不做黑盒自动优化：

```text
硬点 +1 mm / -1 mm
→ 重算
→ 观察指标变化
→ 形成敏感性矩阵
```

输出：

```text
哪个硬点影响哪个指标
影响方向
影响强度
副作用
```
