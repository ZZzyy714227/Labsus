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
## G31 动力系统双内核分叉（2026-09-05 登记）

- **前端全动力模型 vs Python 粗略等效**：web/js/16-powertrain.js 实现七架构组合器
  （ice/ev/p2/p3/p4/series/powersplit）+ 轴系动力学（换挡状态机/反射惯量/电池 SOC/
  电机恒扭矩-恒功率/回收）；Python 端 engine/src/api/v3models.py PowertrainSpec 仅
  消费 ice.map 峰值×ratios[0]×finalDrive×eff 推导等效轮上扭矩覆盖 T_max/P_kw
  （transient.py 门控 req.powertrain.ice is not None），**不实现混动组合器/换挡/电池**。
- **缺省锚**：PowertrainSpec=None 时 transient 走旧 T_max=250/P_kw=80/drive_split_f=0.0/
  brake_split_f=0.60（与旧 PowertrainParams 缺省逐位一致，tphys_parity 哈希不变）。
- **前端 legacy 等价锚**：defaultSpec（ice/awd_fixed/splitFront0.2/ratios[1]/final1/
  平直 1200N·m）轮上扭矩后 480/前 120 == 旧常数；集成级 parity maxΔ=0.00e+0。
- **allinone 不内联**：dwb-pro-allinone.html 为 TPHYS 对拍锚，不含 POWERTRAIN →
  接线回退 legacy 常数，与对拍逐位一致（有意不内联以避免锚漂移）。
- **双端已打通（G31-P10-4，提交 3772630，2026-09-06；本条 2026-09-20 勘误）**：
  前端 `09-track.js` 在 `!POWERTRAIN.isLegacyEquivalent()` 时叠加嵌套 `powertrain`
  字段（architecture/drive/splitFront/ice/motorF/motorR/gearbox/battery，
  `:418-427` 与 `:769-778` 两处 payload 均含），缺省等价时不发 → 逐字节对拍锚不变；
  Python `PowertrainSpec` 以 `extra=ignore` 吸收 JS 专有字段。
  历史上"双端只通一半"的描述已作废。

## 15-DOF 口径（2026-09-20 登记，M5）

- **名称**：前端 `web/js/11-stages.js::VehicleDynamics15DOF` 是历史命名，产品文案
  沿用「15-DOF」。**实现口径**：积分状态 16 个标量 = 车身 6 DOF（位置 X/Y/Z +
  姿态 φ/θ/ψ + 体速 u/v/w + 体角速度 p/q/r）+ 四轮自转 ω×4 ⇒ 10 个机械自由度。
- **车轮垂向为运动学从动**：`tr = -(z_corner - z_road)`（droop / 缓冲块钳位），
  轮荷 Fz 由弹簧 + 阻尼 + ARB + 缓冲块**代数**求出后作用于车身 ⇒ **没有非簧载
  质量的垂向惯性，也没有轮胎垂向柔度 DOF**。后果：无 10~16Hz 轮跳/轮荷模态，
  过路肩不"脱开"路面。
- **引擎侧是另一个模型**：`/api/v3/chassis/simulate_track`
  （`src/solver/transient.py`）为平面 3-DOF 车体 + 准静态侧倾/俯仰代数解 +
  一阶滞后，**不是** 15-DOF。
- **对拍锚范围（关键）**：`node web/test/tphys_parity.cjs` +
  `engine/tests/test_tphys_parity.py` 校验的是 `dwb-pro-allinone.html` 内联
  **TPHYS 闭包**（Python transient 的 JS 移植）与 Python 的等价性，
  **不覆盖** 11-stages 的 15-DOF 内核。后者目前只有行为阈值断言
  （test_lap_15dof / stage_boot_check / proving_ground_test），并新增
  `web/test/test_15dof_steady.js` 的解析稳态锚（直线 + 定圆）。
- **升级路径**（独立立项）：每轮引入 zw/vw 状态 + 非簧载质量 + 胎垂向刚度/阻尼，
  并重标 test_lap_15dof / proving_ground 的全部阈值。

## TPHYS 对拍锚的轮胎常数（2026-09-20 登记）

- `web/test/parity_input.example.json` 显式冻结 `Fy0=8000 / By=9 / LS=0.10 / Cg=0.5`
  （G24 之前的旧基线）。两侧收同一组显式参数，故对拍校验的是**实现等价性**，
  不是物理量级——**不得**据此推断生产缺省。
- 生产缺省双端同源为 GT3 基线：`Fy0=5250 / By=20 / Cy=1.2 / Ey=-0.5 / LS=0.10 /
  Cg=6.0`（Python `TireParams` 与 `web/js/09-track.js::mfSetup`）。
- allinone 内联 `mfSetup` 的**缺省值**已同步为 GT3 基线（对拍锚不受影响，因为
  fixture 显式传参），由 `web/test/test_dom.js` 的同构断言看守。

## allinone 冻结快照定位（2026-09-20 登记）

- `web/dwb-pro-allinone.html` ≈ 2026-08-24（G9 拆分前）快照：**不含**
  `VEHICLE_PRESETS` 体系、三舞台、评价报告、15-DOF 内核、轮胎工坊 / MPC /
  动力工坊，也**不含** `paintStageError` / `hpValidate` / `entityColor`。
- 双重身份：① TPHYS 跨语言对拍锚；② 零依赖离线演示/交付。
- 红线：**不得**为"功能同步"把 `js/` 的增量搬进 allinone——那会顶替
  `test_tphys_parity` 校验的 legacy 路径，引入对拍锚漂移。唯一允许的同步是
  内联 TPHYS 的缺省物理常数。定位声明已写在该文件头注释里。

## MR 双口径（2026-09-20 补充登记）

- 前端恒定下发**自身扫掠**得到的 MR（`web/js/06-ui-panels.js` 的
  `motion_ratio: SIM.mrRefF||0.75` —— 值是前端真实几何扫掠结果，不是占位常量）
  ⇒ 引擎 `mr_at_zero` 推导在生产链路**从不执行**。
- 实测分叉：前 0.75 vs 0.47、后 0.78 vs 0.17（OpenItem-B 摇臂双根分支）。
- **数值行为不变**（显式值仍是优先级 1）；引擎现在在命中显式值时仍做一次推导
  比对，相对差 >15% 即写入响应 `warnings`（前端状态行可见），把静默分叉变成
  可观测项。测试：`tests/test_w4_consistency.py::test_mr_explicit_divergence_is_surfaced`。

## transient 纵滑开环（2026-09-20 登记）

- Python 瞬态模型的纵向力由动力需求包络给出（`f_avail = min(T/R, P/v)`、制动分支），
  **κ 不进入 Kr 反馈** —— 纵滑是开环量。
- M5 已删除只写不读的 `TireState.kappa_dyn` 占位字段，并把 `slip_k` 写进 trace
  （`slip_{FL,FR,RL,RR}`，`src/solver/transient.py`）使其可观测；闭环反馈本身
  属独立议程。

## 前后轴静载对调（M5 物理修复，2026-09-20）

**性质：不是"故意不同"，是已修复的错误。** 记录下来是因为它改动了所有准静态
数值与对拍口径，后续会话需要知道数字为何变了。

- **口径**：`a = CG→前轴距`、`b = CG→后轴距`（讲义 ch10 §2.1 定义
  `z_ra = (b/L)·z_rc,f + (a/L)·z_rc,r`，即前轴权重 = `b/L`）。两轴簧载点质量模型
  ⇒ `a = L·m_r/(m_f+m_r)`、`b = L·m_f/(m_f+m_r)`，**簧载重的一端静载更大**。
- **旧实现**（三内核一致）：`b = L·m_r/(m_f+m_r)`，把"后簧载份额"当成 CG→后轴距
  ⇒ 前后轴静载整体对调。实测 `spring_mass_kg` 前 300/后 340 时前轴占比 52.2%，
  物理正确值 46.9%（`tests/test_static_split_invariant.py` 在旧代码下必然 FAIL）。
  三内核一致 ⇒ 双端对拍与镜像测试都无法发现（只查自洽性）。
- **已同步修改的四处**：`engine/src/api/chassis.py`、`web/js/03-mechanism.js`
  （solveQuasiStatic）、`web/js/09-track.js`（quasiLoads/TPHYS）、
  `web/dwb-pro-allinone.html`（内联 TPHYS，作为对拍锚**必须**同步）。
- **对拍影响**：只改引擎不改 JS 时 `tphys_parity` worst 从 0.11% 退化到 **2.36%**
  （对拍网确实抓住了这条口径漂移）；同步后回到 **0.51%**（门限 5%）。

## 轴侧偏刚度按胎宽配平（M5 B3，2026-09-20）

- **机制**：`k_axle = W_axle / mean(W_f, W_r)`，只放大侧偏**刚度因子**
  （引擎 `_ca_mf` 的 By、前端 MF 的 `axleScale`→`sy`），**不动峰值 D**
  （μ·Fz 对同配方同胎压与胎宽基本无关）⇒ G24 的轮胎量级标定（μ=1.50 /
  峰值侧偏角 8.27°）不受影响。
- **为何需要**：预设一直区分前后胎宽（formula 175/205、gt3 265/285、
  gt3_sport 235/255、baja 180/230），但 `tire.W` 此前**只被渲染层消费**
  （`05-scene3d.js` / `14-tire-lab.js`），模型对胎宽完全盲。缺了这条机制后，
  唯一的平衡杠杆是簧载份额——实测要前轴 58~60% 才能进 0.2 °/g 窗口（反物理）。
- **等价性锚**：缺 `tire_width` 或两轴等宽 ⇒ `k≡1`，旧行为逐位不变
  （`tests/test_tire_width_balance.py::test_missing_width_reproduces_legacy_numbers`；
  对拍 fixture 无该字段 ⇒ parity 锚不受此机制影响）。
- **数据契约**：`AxleSpec.tire_width`（引擎，可选）+ `chassisPayload` 的
  `tire_width: f.tire.W`（前端）。`transient.py` 的 `VehiclePlanar` 构造时按轴
  放大 MF 的 By，与准静态同源。

## 预设再配平（M5，2026-09-20）

修复对调后缺省预设翻成中性/轻过度转向，故按"真实胎宽差 + 合理配重"重新配平
（**mS 两轴之和保持原值**，以免扰动 RIG 弹簧预载量级）：

| 预设 | 胎宽 前/后 | 旧前轴份额 → 新 | 旧 US → 新 US @1g |
|---|---|---|---|
| formula | 175/205 | 45.3% → **50.0%**（53/53） | −0.043 → **+0.211** °/g |
| gt3 | 265/285 | 47.1% → **54.0%**（367/313） | +0.105 → **+0.226** °/g |
| gt3_sport | 235/255 | 47.2% → **54.0%**（389/331） | +0.147 → **+0.216** °/g |
| baja | 180/**230**（后胎加宽，23x10-10 REAR） | 46.8% → **50.0%**（47/47） | −0.031 → **+0.274** °/g |

- GT3 两款为前中置/前置引擎车，54% 前轴份额符合真车；formula/baja 取 50/50。
- 扫描工具：`node web/test/preset_balance_sweep.cjs`（诊断工具，不参与回归）。
- **ARB 在本模型里对 US 近乎无效**（实测前 ARB 0→40：TLLTD 45%→83%，US +0.01 °/g）
  —— 因为载荷转移经 LS=0.10 的弱载荷敏感性后对轴刚度影响很小。若将来要提高
  载荷转移类杠杆的效力，需先校准 LS 到真实量级（0.15~0.25，属独立议程）。

## 已知缺口登记（M5 新登记）

- **预设质量数据不自洽**：四款预设的 `mSprung` 与两轴 `spring_mass_kg` 之和对不上
  （formula：185 vs 106；gt3：1100 vs 680）。当前两轴 mS 只作**比例**用于 a/b，
  绝对值另在 `04-dynamics.js` 里当 RIG 弹簧预载用 ⇒ 两条链的质量口径不一致。
  本轮只改比例、保持两轴之和不变；统一绝对值属独立议程。
- **15-DOF 舞台无非簧载质量与胎垂向柔度**（见「15-DOF 口径」节）。
- **`metrics/kinematics.py` 生产零引用**（仅测试导入），而 `jacking` 在
  `api/chassis.py` 就地重写 ⇒ 潜在双实现漂移。
