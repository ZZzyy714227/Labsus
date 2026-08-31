# LABSUS · 故意不同清单（INTENTIONAL DIFFERENCES）

> W4 口径统一（讲义第十一讲 / grill-me 审查报告 A.5 修订）：双内核互为审计器
> 是**刻意架构**——允许合理分叉（坐标系、模型简化层级、实现语言），禁止
> 意外漂移。本清单是"允许的差异"的登记真源；不在本清单内的同源物理量
> 必须一致，由 tests/test_w4_consistency.py、tests/test_tphys_parity.py 与
> node web/test/test_dom.js 对拍钉死。

## 坐标系双血脉（F-71 降级为文档问题）

| 血脉 | 约定 | 使用方 | 状态 |
|---|---|---|---|
| v3 主线 | X=外侧（右轮+）/ Y=向前 / Z=向上 | 前端 DWB 命名、/api/v3、pose_metrics、v3service | 生产权威 |
| V1 冻结线 | X=向前 / Y=向右 / Z=向上 | core/convention.py、solver/angles.py、test_s1_gate 手算对照 | 历史冻结，仅教学/门禁 |

- 层间换算由 v3service（DWB→机构点）与 tests/test_w4_consistency.py 的
  `_v3_to_v1` 手工完成；**修改两侧坐标定义必须同步本清单与上述换算**。
- 结论：convention.py "单一真源"表述仅指 V1 冻结线内部；v3 主线的真源在
  v3models.py 的 DWB_KEYS/坐标注释。F-71 的"真源被绕开"记录为已知设计。

## 定位角双权威（F-69）

| 实现 | 轮向恢复 | 接地点 | 用途 |
|---|---|---|---|
| v3 pose_metrics（权威） | Kabsch/SVD 刚体旋转 × 设计轮轴（全 5 节点） | 轮胎投影（rad·tire_R） | 全部 API 输出 |
| V1 compute_alignment_angles（冻结） | UP1→UP5 叉积构造局部标架（旧机构假设） | 轮心近似（无 tire 时） | 仅 test_s1_gate 手算对照 |

- 设计位自洽锚：pose_metrics 在 travel=0/rack=0 精确返回设计 cam/toe
  （tests/test_w4_consistency.py::test_pose_metrics_design_position_exact*）。
- 禁止直接数值对拍两套角度；改动轮向恢复只允许改 v3 权威线。

## 差分窗口（F-10 / F-12 / F-13，2026-08-30 已收敛）

- 唯一内核：`metrics/kandc.py::_slope`（最近邻采样点中央差分，None 跳过，
  端点单侧差分——不再虚高一倍）。v3service/chassis 本地拷贝已删；kinematics.py
  状态机版委托同源（F-12 双语义收敛）。
- 讲义第五讲 h=2mm 钦定窗口的意图（位移残差噪声 1e-13 级）由"最近邻差分"
  保留；力轴差分不再用 ±2N 固定窗口（F-10 修订）。

## MR 链三路来源（F-19 / F-67）

| 优先级 | 实现 | 说明 |
|---|---|---|
| 1 | ax.motion_ratio 显式 | API 层权威 |
| 2 | mr_at_zero 数值推导 | 引擎摇臂链（rocker 真实三维轴 + strut_attach） |
| 3 | 分轴常量回退 0.75/0.78 | 仅异常时；F-67 改为显式上报 + 分轴正确 |

- 引擎侧统一入口 `chassis._resolve_mr_fb`；transient（无摇臂上下文）静态
  使用常量回退并登记此处——**赛道 MR 与准静态 MR 的差异是分叉**（OpenItem-B
  摇臂双根分支），不是漂移。

## ARB 侧倾刚度口（F-08 / F-28）

| 实现 | mrArb | 用途 |
|---|---|---|
| 前端 solveQuasiStatic / arbRate(0.55) | 0.55（第六讲校准值，双端一致） | 准静态 |
| 引擎 chassis.arb_rate | 0.55 常量 | 引擎准静态 |
| TPHYS makeSimContext（F-28 修复后） | 0.55（与 arbRate 逐行同构） | 内置赛道物理 |

- 三处已同源（0.55 + 同一几何链 kt/a²·mr²）；选型差异登记不改。
- 对拍注意：test_tphys_parity 的 ctx 由 Python axle_rc_sweep 注入（karb=0，
  测试用 ARB0=d=0），页面内置路径用 JS arbK。

## 其他已登记分叉（不改，注释在源码）

- **transient 动力半径**：tire_radius 折算（F-26，2026-08-30 起按轴取真实
  半径）——JS TPHYS 侧仍用 0.30 常量，待 bit 级对拍（audit D1）时对齐。
- **hcg/hs 记账**：hs 与 hcg 独立输入，chassis.py 有 20mm 阈值 warning
  （第九讲守恒检查），不强制塞平。
- **Mz 常数拖距 60mm**（tire_mf.py）：APPROXIMATE 标注，调用方需传真实值。

## 禁止的漂移（对拍钉死）

1. 任何同源增益/角度/载荷量不得同时存在第二份独立实现（_slope 已收敛）。
2. TPHYS ↔ transient.py：summary 五字段相对差 <5%（test_tphys_parity）。
3. v3 设计位自洽：travel=0 必须精确返回设计 cam/toe（test_w4_consistency）。
4. 前端 F-01..F-57 已修复项：node web/test/test_dom.js 断言回访。