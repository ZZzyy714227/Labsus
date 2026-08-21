# DWB 式机构级投影运动学求解器 —— 子阶段①设计规格

> 日期：2026-08-21
> 定位：按参考原型 `double-wishbone-suspension.html`（DWB-SIM）建模对产品做「一轮完整升级」的第 ① 子阶段：**后端 Python 重写 DWB 式机构运动学求解器**。
> 前置输入：用户拍板「后端 Python 重写 DWB 式建模」「整轮=子阶段推进四层全覆盖」「并行验证→达标后切主」；以及深度研究报告 `docs/research/2026-08-21-dwb-sim-deep-research/`。
> 本文是设计规格，不含实施排期；实施计划由 writing-plans 产出。

---

## 1. 背景与问题

产品当前几何求解为顺序解 `solve_bump → solve_steering → alignment → contact patch`（`bump.py` 标注 "PBD + scipy LS"）。P1 求解误差门报告（`2026-08-20-p1-solver-gate-report.md`）确认 **K-4 未闭合**：

- 顺序解全行程几何残差 **0.000000–0.731417 mm**（均值 0.193736），阈值 0.02 mm；负行程（travel=-30）最差，travel-dominant；
- 耦合候选解残差 0–1.572090 mm，16 例仅 4 例 VALID，不能直接替换生产。

参考原型 DWB-SIM（`double-wishbone-suspension.html`）用「机构级 Gauss-Seidel 交替精确投影 + continuation 分步 + 四元数热启动」求解同一类 1-DOF/2-DOF 机构，实测（本机 Node24 复现）±30 mm 行程最大残差 **≈1.5e-7 mm**、单姿态 0.02–0.66 ms、DOF=1。用户据此要求**按 DWB 建模对产品运动学求解做一轮完整升级**。

## 2. 目标与验收

**目标**：用 Python 实现机构级投影运动学求解器，取代顺序解作为几何求解生产路径：

1. 全行程残差 ≤ 0.02 mm（消除 K-4）；
2. 转向节/摇臂刚体一致性（内部点不漂移）；
3. 同一套机构模型可直接复用于子阶段②的机制级台架动力学。

**验收门（全部满足才切主）**：
- G1 全基准矩阵残差 ≤ 0.02 mm（有效几何工况）；
- G2 手算黄金值一致（含 K-1/K-2/K-3 修复后的 camber/toe/scrub/trail/RC/anti-dive 定义）；
- G3 DOF 与刚体不变量单测通过；
- G4 性能预算：单姿态典型 < 5 ms；45 点扫掠落在后端 ~78 ms 节流预算内（报告 p95）。

## 3. 范围

**做**：
- 单角落机构求解：轮跳驱动 + 齿条转向驱动，可复合；前/后轴同一拓扑；左/右独立硬点、不镜像；
- 残差真实化并映射状态机（VALID / APPROXIMATE / OUT_OF_RANGE / SOLVER_FAILED）；
- 行程极限扫描（几何可达），工作行程仍由缓冲块/限位块约束（界面读数语义不变）；
- 基准 CLI + 头部对拍报告；`/api/v2` 内部求解模式开关与切主。

**不做（子阶段边界）**：
- 台架动力学（子阶段②：同一机构加弹性线/力/积分）；
- 指标层重写（子阶段③）、可视化部件（子阶段④）；
- 前端 `web/modeler.html` 任何请求/响应合同改动；
- P3 载荷、Magic Formula 轮胎、A/B、敏感性、导出（只消费几何结果，不触碰）。

## 4. 架构与模块

```
src/solver/mechanism/
├── models.py     # Node/Link/HingeCluster/BodyCluster/RockerCluster + 构造（from hardpoint dict）
├── project.py    # 投影原语：project_distance/project_hinge/project_body/project_rocker/polar_q
├── solver.py     # solve_pose（GS 交替投影 + continuation）、drive_to、solve_pose_at、find_limits
├── metrics.py    # 姿态→定位角/主销/RC/SCRUB/TRAIL/抗俯仰（复用并轻量包装现有 kinematics.py 逻辑）
└── bench.py      # 基准矩阵 + 头对头对拍 + gate 报告（data/reports/dwb_mechanism_gate.json）
```

- `v2.py` 几何求解路由改为「按 `SOLVER_MODE` 调用 mechanism.solver 或既有顺序解」；默认开关见 §7 落地时序。
- 复用现有 `src/geometry.py`（vec3/dist/rotate_around_x 等）与 `src/metrics/kinematics.py`（指标从求解姿态推导）；`polar_q` 由 DWB `polarQ`（Müller 迭代）翻写，js→numpy 直译。

## 5. 机构拓扑（本侧硬点 → 原语，右前为例；后轴用 R_ 前缀同一参数化）

| 节点 | 硬点 | 类型 | 说明 |
|---|---|---|---|
| 固定 | CH1, CH2 | chassis | UCA 铰轴两端 |
| 固定 | CH3, CH4 | chassis | LCA 铰轴两端 |
| 固定 | RK_PIVOT | chassis | 摇臂枢轴（轴方向＝车架局部 X） |
| 固定 | DAMPER_CHASSIS | chassis | 减振器上点（弹性线，子阶段②启用） |
| 自由 | UP1 | — | 上球头（主销上点） |
| 自由 | UP2 | — | 下球头（主销下点） |
| 自由 | UP3 | — | 横拉杆外点 |
| 自由 | UP4 | — | 推杆在立柱上的作用点 |
| 自由 | UP5 | — | 轮心（轮跳驱动锚点） |
| 自由 | FL1 | — | 横拉杆内点（齿条侧，转向驱动锚点） |
| 摇臂三角成员 | CH5 / RK_DAMPER | rocker | 非独立自由节点：初始=设计位，此后由 `proj_rocker` 相对 RK_PIVOT 旋转（轴向/径向相对量在设计位锁定）|

| 约束/簇 | 定义 | 原语 |
|---|---|---|
| UCA 铰链簇 | 轴=CH1–CH2，成员=[UP1] | proj_hinge |
| LCA 铰链簇 | 轴=CH3–CH4，成员=[UP2] | proj_hinge |
| 转向节刚体簇 | 成员=[UP1,UP2,UP3,UP4,UP5] | proj_body（极分解） |
| 摇臂铰链簇 | 枢轴=RK_PIVOT、轴=车架 X，成员=[CH5, RK_DAMPER] 刚性三角形 | **proj_rocker（新原语）** |
| 刚线 | 横拉杆 UP3–FL1 | proj_distance |
| 刚线 | 推杆 UP4–CH5 | proj_distance |
| 弹性线 | 减振器 RK_DAMPER–DAMPER_CHASSIS | 本阶段仅登记长度，不产生力 |

**DOF 核算（右前）**：自由 6 节点 18 DOF；约束 UCA 2 + LCA 2 + 转向节刚体内部 9 + 横拉杆 1 + 推杆 1 + 摇臂铰链 2 = 17 → DOF = 1（轮跳）+ 转向驱动 = 2 自由度。左/右/后轴同构；实施期用 `G3` 单测断言。

## 6. 求解原语与求解循环（DWB → Python 映射）

| DWB | Python | 要点 |
|---|---|---|
| `projLink` | `project_distance` | 逆质量加权沿连线分摊；固定点 inv_m=0 不动 |
| `projHinge` | `project_hinge` | 成员绕轴解析 `θ=atan2(Σw·cross(ax,rq)·d, Σw·dot(rq,d))`，精确单参数旋转 |
| `projBody` | `project_body` | 协方差阵 A → `polar_q(A,q,iter=14)` 提取旋转，四元数热启动 |
| `polarQ` | `polar_q` | Müller 迭代，热启动防姿态跳变 |
| （新）| `project_rocker` | 摇臂三点绕枢轴的单参数最优旋转（轴=车架 X）；轴向/径向相对量保持刚性三角形 |
| 驱动 | `set_drives` | 轮高 `UP5.z=p0.z+travel`；FL1=`p0+rack*axis`（正=+Y 向右，convention 一致） |

- **扫描顺序（一次 sweep）**：设驱动 → 横拉杆 → UCA → LCA → 摇臂+推杆闭链 → 转向节刚体；
- `solve_pose()`：迭代上限 260、容差 2e-7、每 4 次算残差、`M.ok = res<0.02`；
- `drive_to(target)`：目标行程拆 ≤6 mm 小步（≤24 步）逐段逼近、热启动——与 DWB 相同的「分支稳定+收敛」组合；
- 残差 = max(所有刚线 |d−L0|, |UP5.z−目标|)；
- 状态映射：≤0.02 → VALID；≤0.05 → APPROXIMATE；不可达/发散 → OUT_OF_RANGE / SOLVER_FAILED（沿用 Product 七状态机，禁止用 None 糊弄）；
- `find_limits`：2 mm 步进上行/下行，残差>0.03 即停 → 几何极限；工作行程=几何极限∩缓冲块行程（语义同 DWB 的 glim/lim 分裂）。

**坐标与符号**：全程用产品 `convention.py`（X 向前 / Y 向右 / Z 向上）实现，**不从 DWB 侧搬运坐标**；由此根除研究报告 Finding 7.1 的「坐标互换」坑。外倾/前束/主销/scrub/trail 符号继续走 `convention.py` 既定约定（K-1/K-2/K-3 修复后口径）。

## 7. 基准对标与落地时序

**基准矩阵（bench.py → `data/reports/dwb_mechanism_gate.json`）**
- P1 16 例（travel ∈ [-30,-15,-5,0,5,10,15,30] × rack ∈ [0,5]）· 前右 + 前左同矩阵镜像回归；
- legacy_import 14 个预置工况，前/后轴各跑；
- 对照项：residual / camber / toe / caster / KPI / scrub / trail / RC / anti-dive / MR / 耗时；
- 左右最小硬点镜像对称回归（指标 delta ≈ 0）。

**落地时序**
1. 实现 mechanism 模块（不接生产）；
2. bench CLI 跑满矩阵 → 报告；未达标则迭代（项目哲学：先最小可用，再逐步收敛）；
3. 达标（G1–G4）→ `SOLVER_MODE` 默认切 `mechanism`；v2 路由加请求级覆盖字段（如 `solver: "mw"|"seq"`），顺序解保留为回退。

**接口合同**：`/api/v2/solve/hardpoints`、`/sweep` 等响应结构不变；`residuals` 现在来自机制（真实值）；状态字段如实反映；前端零改动（DEVLOG 验证需跑浏览器回放确认）。

## 8. 测试策略（tests/）

- 原语单元：旋转精度、极分解重构误差（<1e-9）、逆质量分摊、摇臂三点刚性保持；
- DOF/不变量：每轴断言 DOF=2（travel+steer）且刚体内部距离不漂移（<1e-6 mm）；
- 符号回归：K-1 左右镜像、K-2 toe-in 为正、K-3 caster/trail 正负；
- 手算 benchmark（黄金值）、14 工况、16/16 矩阵、行程极限扫描、奇异→状态映射；
- 性能冒烟：sweep 45 点 <78 ms 预算（含 p95）；
- 真后端回归：全量 pytest 不回归（388→新增 mechanism 测试全绿）。

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 摇臂-推杆闭链极限行程 tangent/奇异 | continuation 分步 + 奇异检测 → OUT_OF_RANGE（诚实状态） |
| 横拉杆行程端部超程 | 仿 DWB `ok` 标记 + 显式告警 |
| 符号/姿态跳变 | convention.py + 极分解热启动 + 基准自动对拍 |
| 性能最坏情况 | bench p95 监督；超预算则收敛最小粒径/迭代上限（不影响 ≤0.02mm） |
| 重构风险（切主引入回归） | 顺序解回退开关 + 全量 pytest + 前端浏览器回放验证 |

## 10. 实施期需确认的实现细节（开放项，非阻塞）

- 后轴硬点 R_ 前缀的准确键集合（R_CH*/R_UP*/R_FL1*）与摇臂/减振器键（RK_*_L/R、DAMPER_*_RR 等）——以 `legacy_import.py` 与 `rocker.py` 当前实现为准核对；
- 摇臂枢轴方向向量精确取法（设计与 X 轴、还是会随设计位形偏转的轴）——实施期用设计位形 + `rotate_around_x` 语义对齐 `rocker.py`；
- FL1 齿条驱动轴单位向量（左/右符号、rack 位移→平移方向）——按 `convention.py` rack 约定实现并在 K-2/K-3 符号测试内锁定；
- 行程驱动锚点：以 UP5（轮心）为准；若另有 wheel-centre 定义（UP5.Y 偏移 wheel_offset_y），在建模层明确「轮心=UP5，驱动=UP5.z」。

## 11. 子阶段验收输出

- `src/solver/mechanism/*` + 测试；
- `data/reports/dwb_mechanism_gate.json`（基准矩阵 + G1–G4 结论）；
- `docs/superpowers/specs/2026-08-21-dwb-mechanism-solver-design.md`（本文）+ DEVLOG 同步；
- v2 切主（达标后）+ 前端零改动验证（headless 回放）。

> 本文设计与研究报告结论一致：不迁移 DWB 前端代码、不复制其坐标、不重构无关模块；只把「机构级交替投影 + continuation + 残差诚实」这组方法学落进我们的 Python 后端。
