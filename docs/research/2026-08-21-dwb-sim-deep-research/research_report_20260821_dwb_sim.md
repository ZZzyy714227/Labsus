# DWB-SIM 深度研究报告：双叉臂悬架运动学/动力学仿真台的原理、验证与产品启示

> 研究对象：`double-wishbone-suspension.html`（DWB-SIM，2104 行单文件）
> 日期：2026-08-21 ｜ 模式：deep ｜ 配套证据：`sources.jsonl` / `evidence.jsonl` / `claims.jsonl` / `run_manifest.json`

---

## Executive Summary

- **DWB-SIM 是产品的"设计语法"参考原型，而不是在线运行代码**。项目地图明确标注它为"参考对象（DWB-SIM），产品反复研习它" [3]，DEVLOG 记录了至少 3 轮"研习参考 → 移植交互/渲染 → 补齐建模缺口"的闭环（曲线丝滑化、四视口图元管线、四轮时域台架）[4]。
- **求解器是 Gauss-Seidel 交替精确投影法**：距离约束投影 + 铰链簇解析单参数旋转 + 自由刚体簇极分解投影 + 轮心高度驱动约束，配 continuation 分步逼近与四元数热启动 [1][2]。它属于 Position Based Dynamics / 形状匹配（Shape Matching）家族 [11][18][19]。
- **实测收敛极好**：本报告用 Node 24 运行原文件求解核，±30 mm 往返行程下最大约束残差约 1.5e-7 mm（远低于 0.02 mm 阈值），单姿态求解 0.02–0.66 ms，DOF=1 [ev]。与之对照，产品顺序解存在 K-4：全行程残差最高 0.731 mm，未达 0.02 mm 阈值 [7]。
- **指标层全部从当前求解姿态实时推导**（自旋轴→外倾/前束、主销上下点→主销角、接地点→擦地距/拖距、摆臂线交→瞬心/侧倾中心、双侧侧倾中心），扫掠曲线用有限差分给出运动速比/外倾增益°/25mm/跳动转向°/25mm [1][2]。
- **台架动力学是实时近似而非完整多体**：每帧 10 子步半隐式积分 + 投影后速度回写；弹簧只受压、压缩/复原分离阻尼、缓冲块二次力 x²/20、轮胎 kT+cT 穿透模型、5 种路面波形 [1][2]。工程边界需清醒看待。
- **高优先级警示**：DWB-SIM 本地坐标是 X=外侧/Y=向前/Z=向上，与产品标准 X=向前/Y=右侧/Z=向上 相异 [8]，跨系统取数必须换算；其几何模型左右为镜像，不能表达非对称硬点 [2]。

**Primary Recommendation：** 将 DWB-SIM 固化为产品参考基线（归档到 `ref/`，不重构），同时把经实测验证的"continuation 分步 + 残差可追踪 + 双比阻尼/缓冲块/轮胎瞬态/路面谱"四项工程特性系统移植进产品，并先修复 K-4 残差越界问题。

**Confidence Level：** High —— 结论建立在源码逐行阅读 + 官方方法论 spec + 第一手运行时数值复现三重叠加上；网络资料仅用于确认理论命名与工程惯例 [11]-[23]。

---

## Introduction

### Research Question

用户指令为"深入学习这个项目"并显式引用 `double-wishbone-suspension.html`。本项目已经有一套用 Python FastAPI + Three.js 构建的产品（曾经），但 `double-wishbone-suspension.html` 是与产品并存的**一个自包含仿真台**：不依赖后端、不依赖 Three.js，用约 2100 行纯 JS 完成从硬点到动力学再到四视图绘图的全部闭环 [1]。

因此本研究的核心问题拆解为四个：

1. DWB-SIM 到底是什么（架构、数据流、求解方法）；
2. 它的求解与指标是否**可靠**（几何约束正确性 + 工程模型正确性）；
3. 它在产品演进中扮演什么角色（参考原型 → 已吸收什么、还有什么没吸收）；
4. 面向 FSAE 底盘工具"V1 重造"后续（P5/P6 之后），应从 DWB-SIM 吸收、规避什么。

### Scope & Methodology

**纳入范围：** `double-wishbone-suspension.html` 全文（2104 行逐行阅读）；官方方法论 spec《DWB-SIM 完整系统设计解析》（741 行）[2]；`docs/PROJECT_MAP.md` [3]；`docs/DEVLOG.md` [4]；`docs/PLAN.md` [5]；`docs/superpowers/specs/2026-08-20-v1-progress-sync.md` [6]；`docs/superpowers/specs/2026-08-20-p1-solver-gate-report.md` [7]；`src/core/convention.py` [8]；`src/solver/bump.py` [9]；`CLAUDE.md` [10]。

**研究手段：**
- 源码静态分析（按 16 个编号分区逐区阅读）；
- **第一手运行时复现**：用 Node 24 编写最小 DOM 存根运行完整脚本，实测残差、迭代、耗时、指标与动力学单步（见"验证附录"）；
- 网络检索用于确认理论术语与工程惯例（PBD/形状匹配、侧倾轴、外倾增益°/25mm、跳动转向、运动速比、四立柱台架），共纳入 13 个网络来源与 10 个项目来源，合计 23 个来源 [11]-[23]；
- 与产品顺序解/P1 求解误差门报告对比 [7][9]。

**排除范围：** 本报告不做迁移、不设计融合架构、不修改现有求解器（与官方 spec 的立场一致 [2]）；不评估产品的空力/车架模块；不对 PySide6 桌面版做实现评审。

### Key Assumptions

- A1：DWB-SIM 是**参考原型**，其价值在于"设计语法"而非"可运行产品"；指导性结论适用于移植与借鉴 [3][4]。
- A2：DWB-SIM 的"几何约束正确"与"工程模型正确"是两种不同的正确性，需要分开评价（沿用官方 spec 的二分）[2]。
- A3：DWB-SIM 坐标(X=外侧,Y=向前)与产品坐标(X=向前,Y=右侧)不同，所有跨系统数字必须先在 Finding 7.1 的坐标换算表上对齐 [1][8]。
- A4：由于 DWB-SIM 自带基准位（SPORT 预设）与产品 legacy-import 基准不同，数值对照只在"数量级/方法学"层面进行，不做逐点数值对齐。
- A5：网络资料质量参差（论坛/普通网页），仅用于确认术语与惯例，不用于支撑定量结论——定量结论一律来自源码与实测。

---

## Main Analysis

### Finding 1：DWB-SIM 是一个"硬点 → 拓扑 → 约束 → 求解 → 指标 → 绘图"的完整因果链工作台，其单文件架构是刻意取舍

**Finding：** DWB-SIM 不是绘图工具加上散落的公式，而是一条连续的因果链：设计硬点是唯一几何源，机构长度、轮胎姿态、主销线、轨迹和显示几何全部从它派生；每一步求解状态既是几何数据又是绘图输入 [1][2]。

源码按注释分区形成清晰分层 [1]：

| 层 | 内容 | 关键行 |
|---|---|---|
| 0 数学 | 向量/四元数/极分解 `polarQ` | 214–263 |
| 1 设计数据 | `HPDEF` 硬点表、`PRESETS` 三预设、全局状态 `S` | 265–333 |
| 2 机构建模 | 11 节点、16 刚性线+1 可形变线、铰链簇/刚体簇 | 335–410 |
| 3 几何求解 | `projLink/projHinge/projBody`、`driveTo` continuation | 413–510 |
| 4 运动学指标 | `metrics()` 外倾/前束/主销/瞬心/侧倾中心 | 511–634 |
| 5 动力学 | `stepDyn` 台架积分 | 635–698 |
| 6 仿真管理 | 左右镜像、扫掠缓存、脏标志 | 700–765 |
| 8–10 场景/视图/绘图 | 图元管线 + 四视口 Canvas | 766–1469 |
| 11–13 UI/工具 | 左参数/右读数/曲线、归零/优化/阿克曼 | 1470–1800 |
| 15 主循环 | `requestAnimationFrame` 全量驱动 | 2058–2100 |

关键设计事实：运行时**没有后端服务**，浏览器里的 JS 同时持有设计状态、求解状态、绘图状态和 UI 状态 [2]。整套机制由 `requestAnimationFrame(loop)` 驱动：更新时间与激励 → 按需重扫 → `simulate()` → `buildScene()` → `drawAll()` → `updateReadouts()` → `drawPlots()` → `UI.sync()` [1]。

角色定位（证据）：PROJECT_MAP §3.2 明确它"不是运行代码，应归档到 ref/" [3]；但 DEVLOG 显示产品至少三轮主动"研习参考"并移植：① 2026-08-20 建模器重构"渲染/交互架构移植 DWB-SIM 的 P2 投影/camIso/fitView/orbit/circPts 图元管线"；② 同日曲线丝滑化"常驻 SIM.swR、后台≥130ms 节流重扫、游标随轮跳滑动"；③ 2026-08-21 "审核参考后确认最大建模缺口是时域动力学台架……否决单轮，要求四轮全车" [4]。这表明 DWB-SIM 实际扮演着产品的**行为规格书（behavioral spec by example）**。

单文件取舍（证据）：单文件带来的优点是"打开即跑、调用链短、零构建、方便实验"；代价是"全局状态多处耦合、模块边界靠约定、难以自动化测试、单个函数改动影响多层" [2 §17]。这对产品后续"分模块/可测试"的诉求是反向教材。

**Key Evidence:**
- 图元管线：`L3/PL/TX/ND` 只把世界坐标写入 `sc` 数组，绘图层统一投影、裁剪、渲染，同一份场景数据进四个视图 [1 L782-785, 1156-1216]。
- 几何源单一：所有刚性线 `L0` 在 `buildMech()` 中从 `S.hp` 直接测量，不存在"硬点一套、杆长另一套"的同步问题 [1 L357-411；2 §5.1]。
- 状态分层：`S`(设计/输入)、`SIM`(机构/指标/缓存)、`UI`(界面)三个全局对象分工明确 [2 §14]。

**Implications：**
- 对产品而言，DWB-SIM 的价值不是"把某个公式抄过去"，而是**它证明了什么样的交互闭环能让人"肉眼验证"运动学**——这也是 V1 最小可行定义的核心理念 [10]。
- 单文件模式不应直接迁移到产品（产品已选定模块化后端 + 单前端入口 `modeler.html` [3]）；但 DWB-SIM 的"求解健康可见"（节点/DOF/残差/迭代/耗时直接展示 [1 L1862-1875]）值得产品继续强化——产品已用 VALID/APPROXIMATE/OUT_OF_RANGE 状态机落地同一哲学 [6 §P2-3]。

**Sources:** [1], [2], [3], [4], [10]

---

### Finding 2：求解器本质是"交替投影 + continuation"（PBD/形状匹配家族），实测收敛到 1e-7 mm——与产品顺序解的 K-4 形成鲜明对照

**Finding：** DWB-SIM 的求解器不是"从轮跳直接套公式"，而是对机构施加交替精确投影，迭代收敛到满足全部刚性约束的姿态。它属于位置求解（position-based）而非力-加速度（force-based）求解，与 Müller et al. 2007 年提出的 Position Based Dynamics、以及形状匹配（shape matching）/ 极分解思路一脉相承 [11][18][19]。

求解管线（源码级证据）[1]：

1. **距离约束 `projLink`**：对刚性线按逆质量加权沿连线分配长度误差 `C=d-L0`，车身固定点逆质量=0 不被移动 [1 L415-423]。
2. **铰链簇 `projHinge`**：摆臂绕"两固定铰点连线"做**单参数最优旋转**，`th=atan2(sn,cs)`（解析解），保证摆臂只绕真实铰轴转动、成员相对位置不变 [1 L424-439]。
3. **自由刚体簇 `projBody`**：转向节四节点做**质量加权最优刚体变换**，协方差矩阵 `A` 经 `polarQ(A,q,14)` 极分解提取旋转（Müller 迭代 + 四元数热启动）[1 L440-462, L247-261]。这正是形状匹配标准做法 [11][19]。
4. **驱动约束**：运动学模式把轮心 Z 钉到目标高度 `drvZ` [1 L472-473]。
5. **扫描顺序**：钉轮高 → 横拉杆 → 下摆臂 → 上摆臂 → 转向节，固定顺序的 Gauss-Seidel 风格 [1 L471-478]。
6. **收敛管理**：`solveKin` 最多 260 次迭代、每 4 次检查残差、容差 `2e-7`；残差=所有刚性线长度误差与轮高驱动误差的最大值 [1 L464-490]。
7. **Continuation**：`driveTo` 把大跨度输入拆成 ≤6 mm 小步（最多 24 步），逐步逼近并复用上一步作热启动，防止摆臂翻转/刚体姿态跳变/进入错误分支 [1 L503-510；2 §6.3]。这正是非线性投影法避免"分支错误"的经典手段 [18]。
8. **行程极限**：`findLimits` 以 2 mm 步进向上/下驱动，残差>0.03 mm 即停止，得到几何极限，再与缓冲块行程取交集 [1 L586-594]。

**第一手实测（Node 24 复现原文件）** [ev]：

| 轮跳 | 最大残差 (mm) | 迭代 | 耗时 | 外倾 | 前束 |
|---|---|---|---|---|---|
| +30 | 1.59e-7 | 124 | 0.66 ms | -1.752° | +0.299° |
| 0 | 5.68e-14 | 4 | 0.02 ms | -0.750° | +0.100° |
| -30 | 1.50e-7 | 120 | 0.60 ms | +0.009° | -0.109° |

- DOF=1（11 节点、5 自由点、16 刚性线、14 有效约束）[ev]；
- 几何行程极限 ±138 mm（SPORT 预设）[ev]；
- 设计位形指标：cast=4.45°、kpi=8.51°、scrub=34.57 mm、trail=21.85 mm、半轮距 766.2 mm [ev]。

**对照产品（这是本报告最重要的对照）：** 产品顺序解为 `solve_bump → solve_steering → alignment → contact patch`，bump 求解器标注为 "PBD + scipy LS" [9]。P1 求解误差门报告实测：顺序解残差 0.000000–0.731417 mm（均值 0.193736 mm），最大在 travel=-30 mm；±30 mm 两方向都远超 0.02 mm 阈值；耦合候选解残差 0–1.572090 mm（均值 0.548213 mm），16 例仅 4 例 VALID；K-4 结论为"travel-dominant、负行程更差、未修复、不能后处理平滑掩盖" [7]。

即在**同一行程量级（±30 mm）**下：DWB-SIM 用 260 次内交替投影把残差压到 1e-7 mm，产品顺序解残差高达 5 位数以上（0.73 mm）。这个差异的关键不在"是否尽力"，而在**方法学**：DWB-SIM 把"全部刚性约束"放进一个可迭代的投影集合并显式追踪残差；顺序解则把 bump 与 steer 解耦，再声明"polish at branch anchor"，代价是行程边界的原始几何残差不可收敛。

**Key Evidence:**
- `polarQ` 用 Müller 迭代做极分解并热启动，避免直接矩阵分解的数值问题 [1 L247-261；11]。
- `M.ok = res < 0.02`，状态栏按 <0.001 绿 / <0.05 黄 / else 红分级 [1 L488, L1873]。
- P1 报告"候选 cost 40.69 ms 平均、超预算；候选-顺序 delta 大（caster ±19°）"，故当时冻结 `SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION` [7]。

**Implications：**
- DWB-SIM 证明：**对 1-DOF 轮跳问题，"小步 continuation + 交替投影"可以同时给出"①收敛到 μm 级、②换姿态后 2–5 次迭代即热收敛、③全程残差可见"** 三个产品也想要的特性 [11][18]。这是修复 K-4 的候选路线之一（作为后台高精度验证路径，属于已冻结架构允许的范围 [7]）。
- 值得注意的反面事实：P1 的"耦合候选"之所以失败（残差反而更大），是因为它一次性求解更大约束集且缺少 continuation；这提示**不能简单堆约束，而要配 continuation 与热启动**。

**Sources:** [1], [2], [7], [9], [11], [18], [19]

---

### Finding 3：运动学指标层全部由当前求解姿态实时推导，几何定义正确；但曲线导数依赖有限差分，采样分辨率是精度边界

**Finding：** `metrics()` 并不是从输入轮跳查表或套经验公式，而是从当前已收敛的姿态重建全部几何量 [1 L546-583]。这保证了"指标 = 此刻机构的真值"，而不是"指标 ≈ 插值"。

指标推导（源码级证据）[1]：

- **外倾/前束**：把设计自旋轴 `axL` 经转向节旋转矩阵变换到全局 `ax`，`cam=-asin(ax_z)`、`toe=atan2(ax_y,ax_x)` [1 L550-552]。实测 `pose@0` 精确复现预设 cam0=-0.750°、toe0=+0.100° [ev]。
- **接地点**：竖直向下方向投影进轮面，再沿该方向从轮心减轮胎半径 [1 L553-555]。因此接地点随外倾变化而变化——这是正确的工程做法。
- **主销几何**：上下球头连线=主销轴；`kpi=atan2(-Δx,Δz)`、`caster=atan2(-Δy,Δz)`；主销与地平面交点为 `kg`，`scrub=cp.x-kg.x`、`trail=kg.y-cp.y` [1 L556-563]。符号约定需结合代码（非只看头注释）[2 §16.4]。
- **瞬心/侧倾中心**：摆臂铰轴与轮心横向平面交得等效铰点，上下摆臂线交=正视瞬心 IC；接地点-瞬心连线与中心线交=单侧 RC；两侧并存时求两侧连线交点=双侧 RC [1 L564-569, L758-764]。这与瞬时轴/侧倾轴的标准定义一致 [12]。
- **侧视瞬心/抗俯仰**：侧视图摆臂线交=SVIC，`anti=(Δz/Δy)·brkF·(wb/hcg)·100`（制动时前轮抗俯仰%）=14.3%（SPORT）[1 L570-576；ev]。
- **速比/增益**：扫掠 45 个采样点，相邻样本差分得运动速比 `mr`、外倾增益 `cg`（°/25mm）、跳动转向 `bs`（°/25mm）、稳定杆速比 [1 L609-618]。实测 `mr@0=0.599`、`cg@0=-0.732°/25`、`bs@0=+0.168°/25` [ev]。外倾增益量级与"赛车悬架常用 camber ≈1°/25mm"惯例同量级 [7][16][17]。

**精度边界（诚实评估）：** 差分导数用 3 点模板 `(k-1,k+1)`，采样间隔由扫掠点数（默认 45）与行程范围决定；行程范围越窄、点数越少，导数对噪声越敏感。官方 spec 也承认"曲线导数依赖有限采样，采样间隔会影响增益读数" [2 §19.8]。另外，外倾/前束是用转角域差分后除以真实行程差并归一化到 25mm——方向约定（压缩为正）需要与产品逐行核对，否则容易出现符号翻车（官方 spec §16.4 同样提醒）[2]。

**Key Evidence:**
- 双侧侧倾中心逻辑：`SIM.rc2=isect2(右接地点→右IC, 左接地点→左IC)` [1 L759-764]。
- 尺寸/角度叠加层直接暴露内部对象（IC 构造线、RC 圆、scrub 尺寸线、KPI/γ/后倾弧），不是装饰而是"可视化证据" [1 L1331-1433；2 §12.4]。
- 设计位形实测 `scrub=34.57mm` 与产品 K-1 修复后的黄金值 29.90mm「数量级一致、逐点不同」，符合 A4 假设（基准几何不同）[7][ev]。

**Implications：**
- 产品指标层（`src/metrics/kinematics.py` 等）已独立实现同一套定义，但**DWB-SIM 的价值在于"同一函数、同一姿态、就地重算"**——产品若要复刻"改硬点→曲线即时变化"的丝滑体验，应保证轻量指标全部基于同一姿态结构，避免 P0/P1 时代的"算了却没呈现"问题（DEVLOG 2026-08-20 已暴露）[4]。
- 对导数类指标（外倾增益/跳动转向），建议产品保持商品化的"°/25mm"归一化、并在报告中保留采样参数，避免两个子系统数值对不上。

**Sources:** [1], [2], [4], [7], [12], [16], [17]

---

### Finding 4：台架动力学是"子步进半隐式积分 + 约束投影回写"的实时工程近似，功能面广但物理面克制

**Finding：** `stepDyn()` 为每个外部帧再细分 10 个子步，做半隐式（辛）积分，并在每个子步后用 12 次约束投影把自由节点拉回约束流形，最后由"投影后位移差"回写速度（乘 0.99995 的轻阻尼）[1 L649-698]。这种"积分-投影-回写"结构与 PBD 的时间积分完全一致 [11]。

子步内的物理（源码级证据）[1]：

1. **重力**：自由节点受 `-m·g`（g=9810 mm/s²，配合 mm 单位）[1 L660]。
2. **弹簧只受压**：`Fs=F0+kS(L0-L)`，`F<0` 截断为 0 [1 L665]。
3. **压缩/复原分离阻尼**：`Fc=-(rel<0?cB:cR)·rel`，rel=两端相对速度沿弹簧轴的投影 [1 L664-667]。
4. **缓冲块二次力**：行程越界时 `F=kBS·x²/20` 等效作用轮心，接触早期柔和、压入快速变硬 [1 L671-673]。
5. **轮胎垂向瞬态**：`pen=路面高-接地点z`，`Fz=kT·pen+cT·(rzv-vz)`，非负截断，作用轮心 [1 L674-681]。轮胎阻尼 cT=0.55·FS 是隐藏参数。
6. **路面波形**：step/sine/pulse/chirp/rand 共 5 种 [1 L638-648]。
7. **数值保护**：速度上限 ±2e4（mm/s）、retro 阻尼 0.99995、每子步 12 次投影 [1 L684-694]。

**实测单步**（sine 20mm/2Hz、起始静止）：`Ft=3879.6N、Fs=5582N(≈静载换算预载 5836N 量级)、Fd=315.9N、pen=18.95mm` [ev]。数值量级合理（偏航总重 340kg→轮荷≈3496N，含瞬态 3879N 属正常 +10%）。

**必须清醒的工程边界（官方 spec 明确承认）[2 §9、§16.3、§19]：**
- 质量集中在节点，**没有转向节/下摆臂的转动惯量与力矩平衡**；弹簧/轮胎力被简化为"沿局部方向或垂向"的等效力。
- 轮胎=纯垂向线性+阻尼（无纵向/侧向力，无滚阻）；没有轮胎侧偏/回正。
- 左右镜像模型，**不能表达非对称硬点/非对称受力**（产品 P3 已修复此问题：左右独立求解、不镜像 [6]）。
- 动力学结论应作"趋势/交互演示"，不可当高保真 MBD 结果（官方 spec §16.3 原文）[2]。

**产品对照：** 产品已于 2026-08-21 上线四轮 7-DOF 时域台架 `metrics/bounce.py`，明确"按参考建模缺口立项：弹簧分离阻尼/缓冲块/轮胎垂向瞬态/路面谱"，且用四轮全车而非单轮 [4]。即**产品的台架已经吸收了 DWB-SIM 的功能面，但物理上更完整**（车身 heave/roll/pitch 刚体 + 四角簧下自由度、防倾杆滚刚度参与车身侧倾 [4]）。DWB-SIM 的台架则是产品 rig 的"最小可验证等价物"。

**Key Evidence:**
- 子步顺序固定：`setChassis→路面→清力加重力→弹簧→缓冲块→轮胎→半隐式速度→位置→12 投影→速度回写` [1 L655-695]。
- 单位内部缩放：`FS=1000` 把 N 换算成适配 mm 的内部单位；读数层再换算回 N/N·s·mm⁻¹/Hz [1 L636；2 §16.5]。
- 台架读数目（右栏）：弹簧力/阻尼力/轮胎垂向力/轮胎压缩量/非簧载加速度 [1 L1679-1684]。

**Implications：**
- DWB-SIM 台架是理解"产品 rig 应该给工程师看什么"的最小集合：路面输入+轮跳、轮胎垂向力、弹簧力、阻尼力、外倾随轮跳。产品 rig 面板（四轮 Fs/Ft + heave/roll/pitch）已超集 [4]。
- 若要补 DWB-SIM 有而产品欠的：`chirp/rand` 路面波形与"阻尼比/簧载固有频率/车轮跳动频率"读数（产品已在 `dynamics.py`/`ride.py` 有频域与 ride 指标 [6]），建议在 rig 面板补 chirp 扫频以暴露共振峰。

**Sources:** [1], [2], [4], [6], [11], [20]

---

### Finding 5：横向稳定杆模型是"解析几何 + 实心圆杆扭转理论"，工程上正确但对直径/连杆位置异常敏感

**Finding：** DWB-SIM 用闭环解析几何建稳定杆（U 形扭杆）[1 L522-545]：连杆下端在下摆臂 `lerp(LCA_F,LBJ,t)` 处，扭杆臂上端固定在横向/纵向/垂向偏置 `(xa, ay, az)`；连杆长度在设计位形锁定为不变量，随后在 yz 平面用余弦定理解析解出臂角 `psi`，超程时（acos 参数>1）打"连杆超程"警告 [1 L522-538]。

扭转刚度采用实心圆杆理论 [1 L539-545]：`J=πd⁴/32`（极惯性矩）、`kt=G·J/L`（G=79000 MPa≈钢材剪切模量）、轮端等效刚度 `k=kt/a²·mrArb²`（a=扭臂长、mrArb=连杆速比）。直径以**四次方**进入，所以"稳定杆直径对刚度非常敏感"（官方 spec 明确点出）[2 §10.2]。

侧倾刚度读数层把弹簧侧倾刚度 `Ks` 和稳定杆侧倾刚度 `Ka` 分开求和：`kRoll(q)=q·track²/2/1e6·(π/180)·1000`，给出总侧倾刚度/稳定杆占比/当前侧倾力矩；左右轮跳差估算稳定杆相对扭转角与连杆力 [1 L1840-1853]。

**工程评价：**
- 用 `J=πd⁴/32` 与 G=79 GPa 是实心圆杆标准公式；换算到轮端刚度考虑了速比与力臂，方法学正确 [2 §10.2]。
- 局限：稳定杆几何为**单侧求解+镜像**，无法表达左右不对称安装；ARB 不在动力学刚体求解内（通过端点位置联系），是解析附带层 [2 §4.3]；未建模橡胶衬套非线性。产品 `metrics/arb_geometry.py` 已独立实现 [3 §3.1]。

**Implications：** 稳定杆环节（几何+扭转+占比读数）是 DWB-SIM 中"工程模型正确度较高"的代表，给产品提供了完整的"可调直径/连杆位置/偏置"交互原型；产品应确认 `arb_geometry.py` 覆盖同样读数（扭转刚度/轮心刚度/连杆速比/相对扭转角/占比），避免口径不一。

**Sources:** [1], [2], [3]

---

### Finding 6：可视化-诊断-工程工具三层形成"可操作、可观察、可调试"的闭环，这正是产品反复移植的对象

**Finding：** DWB-SIM 的绘图不是装饰。场景层用极少量图元原语（`l` 线段、`p` 折线/多边形可填充、`n` 节点、`t` 文字）把世界坐标一次性写入 `sc` 数组，绘图层再统一投影进四视口（正视 X-Z / 俯视 X-Y / 侧视 Y-Z / 等轴测透视）[1 L782-785, L1046-1152]。官方 spec 把这种"几何构造与屏幕绘制分离"评价为"同一组场景数据可以进入四个视图" [2 §12.1]。

**诊断层（可视化即验证）[1 L1331-1433；2 §12.4]：**
- 正视叠加：IC 瞬心构造线 + RC 侧倾中心 + 主销偏移距尺寸线 + KPI 弧 + 外倾 γ 弧；
- 侧视叠加：主销后倾弧 + 拖距尺寸线 + 侧视瞬心与抗俯仰%；
- 俯视叠加：前束弧 + 轮向线 + 转向中心（阿克曼交点）/阿克曼线（齿条位移 >2mm 时）；
- 全视口：运动轨迹（轮心/接地点/球头/主销接地）、主销扫掠面族、力矢量、比例尺、坐标轴三色三角标、网格。

这些叠加把求解器内部对象直接暴露成"可检查的视觉证据"——例如"摆臂是否绕正确轴、转向节是否保持刚体、主销与接地点是否符合当前姿态" [2 §15.7]。

**交互层（产品移植主目标）[1 L1963-2056；4]：**
- 正交视图直接拖拽硬点（Shift=0.1mm 细步进，默认 1mm）、滚轮缩放、中键平移、双击/F 适应、1-4 单视图最大化；
- 等轴测左键旋转 / Shift 平移 / 滚轮缩放，AZ/EL 滑块；
- 键盘空格=运行暂停、←→=轮跳、Shift+←→=齿条、F=适应、0=四视图；
- 曲线与读数**常驻**：`SIM.swR` 扫掠缓存 + ≥130ms 节流重扫 + 实时游标随当前轮跳滑动 + 每帧 `drawPlots()`，这就是产品 2026-08-20 "曲线丝滑化"直接移植的对象 [4]。

**工程工具层 [1 L1730-1800]：**
- `zeroToe()`：对横拉杆微调量二分 40 次使静态前束为 0；
- `optRack()`：以 3.5mm 步进扫掠转向机高度 RACK_z ±70mm，最小化全行程跳动转向 RMS；
- `ackermann()`：由左右轮前束反推阿克曼率/转弯半径/转向中心，`steerArm()` 求 TRO 到主销轴的垂距力臂；
- 齿条-转角比 `rack/toe`、横拉杆长度 `tie.L0` 递读。

实测佐证：rack=20mm → 右轮 toe=-7.594°（大幅转向），外倾几乎不变（-0.103°，转向外倾增益小），方向符合转向前束变大、转向节绕主销转 [ev]。

**Implications：** 产品已经把"图元管线 + 四视口 + 曲线常驻+游标"移植进 `web/modeler.html`（DEVLOG 有逐条记录 [4]）。尚未完整移植的交互包括：**稳定杆逆解优化工具**、**主销扫掠面族**（`kpsw`，全行程主销轴线族可视化）、**稳定杆连杆超程警告**。这些可作为"渲染/交互补齐清单"。

**Sources:** [1], [2], [4]

---

### Finding 7：工程模型有两类"隐性风险"——坐标系分歧与简化假设；正确性必须分层评估

**Finding：** 官方 spec 明确要求"几何约束正确"与"工程模型正确"分开阅读 [2 §1]。本报告实测确认几何层非常强（残差 1e-7 mm），但工程层有一组必须写在脸上的边界。

**7.1 坐标系分歧（最高优先级，跨系统取数必须先换算）：**

| 量 | DWB-SIM [1] | 产品标准 [8] |
|---|---|---|
| X | 车辆右侧/外侧（正） | 车辆前方（正） |
| Y | 车辆前方（正） | 车辆右侧（正） |
| Z | 向上（正） | 向上（正） |
| 原点 | 车辆中心线与设计地面交点 | 前轴中心地面（CLAUDE.md [10]） |

即 DWB-SIM 相对于产品是 **X/Y 互换 + 符号翻转**。官方 spec §16.4 也警告"阅读时应以实际投影向量、角度公式和绘图代码为准，不能只依赖顶部注释文字" [2]。**凡是把 DWB-SIM 数字抄进产品的（硬点坐标、scrub/trail/caster 符号），都必须先经过这个映射表**——这正是 P0/P2-0 时代产品踩过的坑（K-1 scrub 不对称、K-2 toe 符号、K-3 caster 符号）[6][7]。

**7.2 工程简化清单（哪些是刻意、哪些是风险）[2 §19]：**
- 轮胎=纯垂向线性刚度+阻尼，无纵/侧向力、无侧偏/回正——**刻意**，因为产品定位是"准静态几何与轮边受力"，轮胎侧偏由 P5 Magic Formula 覆盖 [6]；
- 左右镜像模型，不能表达非对称硬点/受力——产品 P3 已修复左右独立 [6]；
- 动力学无转动惯量/无转向节力矩平衡——**只能看趋势** [2 §9]；
- 弹簧只受压；阻尼双比但线性；缓冲块用等效二次力而非常规 bump-stop 曲线 [1]；
- 求导用有限差分，采样分辨率有限 [2 §19.8]；
- 视图线框穿插≠碰撞检测 [2 §19.9]。

**7.3 数值稳定性意识：** 投影法在奇异位形（摆臂平行、约束退化、瞬心远移）下收敛变慢甚至翻分支；官方 spec 诚实说明"continuation 与四元数热启动能降低风险，但不能消除机构本身的多解性与奇异性" [2 §16.2]。DWB-SIM 用"最大刚性残差 + 状态颜色 + 行程极限扫描"让这类风险**可见**——这比产品"隐藏失败"更贴近 P2-3 的诚实状态机要求 [6]。

**Key Evidence:**
- DWB-SIM 头注释坐标与 `S2W`/`P2` 投影向量一致（X=横向）[1 L210, L1098-1113]；产品 `convention.py L8` 明确 X=前/Y=右 [8]。
- `findLimits` 用残差>0.03mm 判不可达，几何极限±138mm 再与缓冲块取交为工作行程 [1 L586-594；ev]。
- 官方 spec §19 列 10 条局限原文可查证 [2]。

**Implications：** 这一条决定了"DWB-SIM 数字能不能直接当产品答案"——不能。它应该是"方法论与交互原型"，产品数值必须走自己的 `src/core/convention.py` + P1/P2 基准。任何在资料里标注"参考 DWB-SIM"的数字，都要在文档里附上坐标映射声明。

**Sources:** [1], [2], [3], [6], [7], [8], [10]

---

## Synthesis & Insights

### Patterns Identified

**Pattern 1：DWB-SIM 是一条"因果链"，产品的每一次成功移植都是"把链上某一段换成更强实现"。**
从 Finding 1 与 6 看，DWB-SIM 的因果链是 `硬点→拓扑→不变量→姿态→轮/主销空间→运动学指标→弹性与动力学→可视化诊断` [2 §22]。产品移植了：把"绘图链"换成图元管线+四视口（建模器重构 [4]）、把"曲线链"换成常驻缓存+游标（曲线丝滑化 [4]）、把"动力学链"换成四轮 7-DOF rig（`bounce.py` [4]）。也就是说产品不是"重写 DWB-SIM"，而是**在 DWB-SIM 提供的因果顺序上逐段替换为更强实现**。这解释了为什么 PROJECT_MAP 建议把 DWB-SIM 归档而不是删除 [3]——它是这条链的"最小完整参照实现"。

**Pattern 2：产品的"残差诚实"哲学与 DWB-SIM 一脉相承但实现更深。**
DWB-SIM 用"最大刚性残差 + 颜色分级 + 行程极限扫描"暴露求解健康 [1 L1862-1875]；产品把它升级为 `VALID/APPROXIMATE/OUT_OF_RANGE/SOLVER_FAILED/...` 七状态机，禁止用 None 糊弄（P2-3）[6]。这是一个被项目反复强调的共识：**"算不出就明说"比"假装算了"更有产品价值**。DWB-SIM 甚至把几何极限与缓冲块分开展示（`glim` vs `lim` 两行读数 [1 L1818-1819]）——"机构能到哪"与"允许到哪"分开呈现，值得产品 UI 照搬。

### Novel Insights

**Insight 1：K-4 的解法线索可能不在"换求解器"，而在"给现有求解器加 continuation 与热启动策略"。**
Finding 2 显示 DWB-SIM 证明：同样的 1-DOF 离散机构，只要用 ≤6mm 小步 continuation + 上一步热启动，残差就能从"顺序解的 0.73mm"降到"1e-7mm"。P1 报告已观测到"顺序解残差 travel-dominant、负行程更差"，这与"大步长跨过分支锚点导致 polish 不收敛"高度吻合 [7]。因此一个低风险实验是：**保留顺序解，但在行程边界的求解外包一层 DWB 式 continuation 分步 + 残差追踪**，先验证残差能否回到 0.02mm 阈值——这完全落在已冻结的 `SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION` 架构内（后台/按需高精度验证路径）[7]。

**Insight 2：DWB-SIM 的"几何极限扫描"暴露了一个产品未明说的概念——"行程是机构可达性与限位作动点的交集"。**
DWB-SIM 把 `S.trMin/Max = 几何极限 ∩ (缓冲块行程±12mm)` [1 L710-715]。产品当前用固定 travel 上下界。若产品在用例/工况层也把"几何可达极限"与"缓冲块工作点"分开建模，就能让"越界告警"从口号变成可计算的判断（超出几何极限=OUT_OF_RANGE，超出缓冲块=APPROXIMATE 但仍在处理）。这与 P2-3 状态机的精神一致，属于低成本高价值的新指标建议。

### Implications

**For 川陀 / 产品路线：**
- DWB-SIM 是"方法学 + 交互规格"来源，不是数据来源——**坐标映射表（Finding 7）必须成为引用 DWB-SIM 时的前置声明**。
- 下一轮最值得动手的是"K-4 continuation 实验"（Insight 1），其次是把"几何极限与缓冲块分开展示"带入模型器（Insight 2）。
- 台架 rig 已吸收 DWB-SIM 功能面，建议补 `chirp/rand` 波形与共振峰观察（Finding 4）。

**Broader Implications：**
- "参考原型→逐段强化移植"的开发法（Pattern 1）是一个可复用的工程方法：先有一个端到端能跑的最小参照，再逐段替换强实现，避免"大重构一步到位"的失败（P1 耦合候选的失败正好反证了这点 [7]）。

**Second-Order Effects：**
- 若 K-4 通过 continuation 修复，产品的敏感性与 A/B 对比可能会发现"顺序解在行程边界的历史残差曾污染过指标"——需要考虑历史结果版本是否重算（versioned store 已支持回滚 [6]）。

---

## Limitations & Caveats

### Counterevidence Register

**Contradictory Finding 1：DWB-SIM 的动力学单步实测显示弹簧力（5582N）远大于轮荷（3879N）。**
- 来源：本报告 Node24 实测 [ev]。
- 为何矛盾：看起来"弹簧力 > 轮胎力"违反静力平衡直觉。
- 解释/裁决：这是运动比带来的杠杆平衡——`F_spring·Δs_spring = F_wheel·Δs_wheel`，当 `Δs_spring/Δs_wheel = mr = 0.599` 时 `F_spring = F_wheel/mr ≈ 3496/0.599 ≈ 5836N` 是"正确"的静平衡预载量级；实测 5582N 与之接近，差异来自瞬态/缓冲块分摊 [1 L636-669]。这也验证了"弹簧得用较大力才能撑起轮荷"这一被许多人忽视的运动比物理。
- 影响：无（确认模型自洽），但提醒读者**不能把弹簧力直接当轮荷**。

**Contradictory Finding 2：产品耦合候选解决前无 continuation 且残差反而更大（1.57mm），与"投影法更强"的直觉矛盾。**
- 来源：P1 报告 [7]。
- 解释：DWB-SIM 的真正优势不是"投影"本身（产品 bump.py 也在用 PBD [9]），而是"小步 continuation + 热启动 + 残差显式追踪"的组合。脱离 continuation 的纯 NGS/投影会发散（这与 PBD 文献对收敛性的注意事项一致 [18][19]）。
- 影响：修正了"直接换求解器"的直觉，支持"加 continuation"的路线（Synthesis Insight 1）。

### Known Gaps

**Gap 1：未能用产品真实 legacy-import 硬点跑 DWB-SIM 做逐点数值对齐。**
- 原因：DWB-SIM 自带三套示例预设，硬点命名（LCA/RCA/WC/TRO）与产品（CH*/UP*/FL*）不同，需要人工映射且工作量超出本研究范围（A4）。
- 影响：本报告只做方法学到数量级对比，不做"同车同点"数值审计。
- 补齐方法：后续可写一个硬点映射脚本，把产品前右模板喂进 DWB-SIM，再对同一 travel 序列比对 camber/toe/RC/scrub 曲线——这是最有价值的后续验证，能直接定位"顺序解 vs 投影解"的偏差来源。

**Gap 2：未对 DWB-SIM 的"分支惊险"做全自动化压力测试。**
- 原因：连续驱动在 ±138mm 极限附近、奇异位形下的行为需要长时间动画回放；本研究只测了离散 travel/rack 点。
- 影响：对"边界外机构是否翻转"的结论只能引用官方 spec 的定性说明 [2 §16.2]。
- 补齐方法：写一个 `for z in -160..160 step 1` 的回放脚本统计失败率（判据：`driveTo` 返回 res>0.03 的次数）。

### Assumptions

**Assumption 1（参考原型定位）：** 证据支持——PROJECT_MAP 与 DEVLOG 三处定性文件均如此指认 [3][4]。挑战证据：单文件也可直接跑（实测可运行），但这不改变产品定位。
**Assumption 3（坐标分歧）：** 证据强支持——代码头注释与 `convention.py` 白纸黑字 [1][8]。
**Assumption 4（基准不同，不做逐点对齐）：** 成立，且被"scrub 34.57 vs 29.90"这样的数量级一致证实 [7][ev]。

### Areas of Uncertainty

**Uncertainty 1：DWB-SIM 的稳定杆几何在真实 FSAE 布置下与产品 `arb_geometry.py` 的口径差异。** 两者独立实现，分别用"下摆臂 lerp 点 + yz 平面余弦定理"与产品自己的 ARB 几何；未做交叉验证。要确认占比/刚度数字可比，需在同一硬点上跑两套实现。
**Uncertainty 2：有限差分导数的数值稳定性。** 45 点采样在窄行程（如 ±20mm）下导数抖动情况未量化；产品若要用同一口径的°/25mm，需要统一样本协议。
**Uncertainty 3：阻尼比 `zeta` 计算用 (cB+cR)/2 的平均阻尼近似 [1 L1810-1811]，在强非对称阻尼下误差未知。**

---

## Recommendations

### Immediate Actions

1. **归档并冻结 DWB-SIM 为参考基线**
   - What：把 `double-wishbone-suspension.html` 连同 6 张 PNG、`color-scheme-preview.html` 一起移动到 `ref/`（按 PROJECT_MAP B 档方案），并在 `ref/README` 里注明"方法论与交互规格来源，非运行代码，数据不可直接引用" [3]。
   - Why：它是产品反复研习的对象，删除会丢行为规格；留在根目录则持续与运行代码混淆 [3]。
   - How：git mv + 补 README 引入坐标映射表（Finding 7）。
   - Timeline：本周。

2. **发起 K-4 continuation 实验（低风险、高价值）**
   - What：在现有顺序解行程边界外包一层 DWB-SIM 式 continuation——目标行程拆 ≤6mm 小步、每步以上一步为热启动、残差可追踪；先在 `/api/v2` 后台按需路径跑 16 例 P1 矩阵，复测残差是否回到 ≤0.02mm。
   - Why：P1 报告已交点"travel-dominant 负行程差"，与本报告实测 DWB continuation 效果吻合 [7][ev]，且不违背已冻结架构 [7]。
   - How：在 `src/solver/bump.py`/新 `continuation.py` 里做包装（不改生产 endpoint），跑 `data/reports/p1_solver_gate.json` 同矩阵。
   - Timeline：1-2 个工作日。

3. **在模型器补"几何极限与缓冲块分开展示"**
   - What：把"几何可达行程"与"缓冲块限制后工作行程"拆成两行（仿 DWB-SIM `glim`/`lim` [1 L1818-1819]），越界时映射到 OUT_OF_RANGE/APPROXIMATE 状态。
   - Why：Insight 2 指出这是低成本的状态机增强，与 P2-3 诚实原则一致 [6]。
   - Timeline：1 个工作日。

### Next Steps

1. **硬点映射数值审计**（Gap 1）：写脚本把产品 FR 模板喂进 DWB-SIM，对同一 travel 序列比对 camber/toe/RC/scrub/anti-dive 曲线。这是回答"两个求解器到底差多少"的唯一硬证据。
2. **台架补扫频**：`/api/v2/rig` 加 chirp/rand 波形与共振峰展示（产品已有 bounce.py 的 step/sine/pulse [4]，缺 chirp/rand）。对齐 DWB-SIM 5 波形 [1 L638-648]。
3. **稳定杆口径对齐**：让 `arb_geometry.py` 与 DWB-SIM `arbRate` 在同一硬点上交叉验证（Uncertainty 1），统一"扭转刚度/轮端刚度/占比/相对扭转角"四读数口径。
4. **导数协议统一**：规定外倾增益/跳动转向的采样协议（点数/行程域/°/25mm 归一化），避免两套数值对不上（Uncertainty 2）。

### Further Research Needs

1. **投影法 vs 顺序解的误差根因研究**：用 DWB-SIM+产品同一硬点做"逐约束关闭实验"（只开摆臂约束→加转向节→加横拉杆→加驱动），找顺序解残差的具体来源（是 bump 段还是 steer 段）。
2. **行程边界动力学稳定性**：DWB-SIM 在 ±138mm 极限附近的翻转行为自动化测试（Gap 2）。
3. **非对称动力学阈值**：DWB-SIM 镜像假设 vs 产品左右独立受力，在多大行程下差值可忽略——这决定 rig 是否需要始终四轮显式（产品已四轮 [4]，但要证明必要性）。
4. **阻尼双比与缓冲块的参数辨识**：用实际 FSAE 减振器曲线采样，验证 x²/20 等效缓冲块与双比线性阻尼在实车上的可信区间。

---

## Bibliography

[1] DWB-SIM 源码（2026）. "double-wishbone-suspension.html — DWB-SIM 双叉臂悬架运动学/动力学仿真台（2104 行）". 项目工作区根目录.

[2] 项目文档（2026-08-16）. "DWB-SIM 完整系统设计解析". docs/superpowers/specs/2026-08-16-dwb-sim-system-methodology.md

[3] 项目文档（2026-08-21）. "FSAE 悬架分析软件 · 项目梳理（PROJECT_MAP）". docs/PROJECT_MAP.md

[4] 项目文档（2026-08-20/21）. "开发日志（DEVLOG）". docs/DEVLOG.md

[5] 项目文档. "开发计划（PLAN）". docs/PLAN.md

[6] 项目文档（2026-08-20）. "V1 里程碑进展同步". docs/superpowers/specs/2026-08-20-v1-progress-sync.md

[7] 项目文档（2026-08-20）. "P1 Solver Error-Gate Report". docs/superpowers/specs/2026-08-20-p1-solver-gate-report.md

[8] 项目代码. "src/core/convention.py（产品坐标/符号规范：X=向前 Y=右侧 Z=向上）".

[9] 项目代码. "src/solver/bump.py（bump 顺序解，PBD + scipy LS）".

[10] 项目约定. "CLAUDE.md".

[11] Müller, M., Heidelberger, B., Hennix, M., Ratcliff, J. (2007). "Position Based Dynamics". ACM SIGGRAPH/Eurographics Symposium on Computer Animation (SCA). https://www.semanticscholar.org/paper/9b2ba0c0508aadcf95870dd377b1544f838141cb

[12] AVI ARIEL (2021). "Multi-Objective Optimization of Suspension Kinematics". Universidade Federal de Santa Catarina. https://repositorio.ufsc.br/bitstream/handle/123456789/223061/AVI%20ARIEL%20-%20Multi-Objective%20Optimization%20of%20Suspension%20Kinematics%20%282021%29.pdf

[13] HP Academy. "Motorsport Wheel Alignment Fundamentals: Double Wishbone". https://www.hpacademy.com/courses/motorsport-wheel-alignment-fundamentals/

[14] HP Academy. "Motorsport Wheel Alignment: Bump Steer & Roll Steer". https://www.hpacademy.com/courses/motorsport-wheel-alignment-fundamentals/wheel-alignment-terminology-bump-steer-and-roll-steer/

[15] Steeda (2018). "Tech Tip: What the heck is bumpsteer?". https://www.steeda.com/2018/01/29/tech-tip-tuesday-heck-bumpsteer/

[16] SAE International (2005). "Formula SAE Suspension Design". SAE 2005-01-3994. https://doi.org/10.4271/2005-01-3994

[17] "Formula SAE Suspension Design"（外倾≈1°/25mm 工程惯例）. https://scispace.com/pdf/formula-sae-suspension-design-47zpsyq2k6.pdf

[18] "Position-Based Nonlinear Gauss-Seidel for Quasistatic Hyperelasticity" (2023). arXiv:2306.09021. https://arxiv.org/abs/2306.09021

[19] "Characterisation of Position Based Dynamics for Elastic Materials". Eurographics. https://diglib.eg.org/bitstreams/af649224-307b-43e4-9228-5c107596c829/content

[20] Chalmers University. "Suspension vertical and longitudinal modeling and parameter estimation for ride comfort assessment". https://odr.chalmers.se/items/f579c850-5e31-45f0-8085-8e0128e0817c

[21] Formula SAE Forums. "Few questions about suspension design". https://www.fsae.com/forums/showthread.php?1200-Few-questions-about-suspension-design

[22] oxiphysics. "DoubleWishboneSimple"（车辆悬架类型参考）. https://docs.rs/oxiphysics-vehicle/0.1.0/oxiphysics_vehicle/suspension/types/struct.DoubleWishboneSimple.html

[23] Rennlist. "996TT Suspension: Motion Ratios? 讨论". https://rennlist.com/forums/996-turbo-forum/1113254-996tt-suspension-motion-ratios.html

---

## Appendix: Methodology

### Research Process

本报告按 deep-research 的 8 阶段流水线执行，但把"信息检索"的大部分预算花在**源码与项目内文档**（因为研究对象是本地代码），网络检索用于理论命名与工程惯例确认：

- **Phase 1 SCOPE**：从"深入学习这个项目"分解为 4 个子问题（是什么/是否可靠/产品角色/应吸收什么），并划定"不迁移、不改求解器"边界。
- **Phase 2 PLAN**：确定证据层级 = 源码(最高) > 官方 spec > 项目文档 > 实测 > 网络理论；设计坐标/单位/命名三张映射表的需求。
- **Phase 3 RETRIEVE**：逐行阅读 2104 行源码 + 741 行 spec + 6 份项目文档；并行 16 组 web 检索（悬架运动学/PBD/赛车目标值/四立柱台架）；**用 Node 24 + DOM 存根运行原文件，抓取第一手数值**。
- **Phase 4 TRIANGULATE**：核心结论（求解器性质、收敛性能、坐标分歧、产品角色）均有 ≥3 个独立证据面（源码+spec+实测 / 源码+spec+devlog / 源码+convention+spec）。
- **Phase 4.5 OUTLINE REFINEMENT**：检索过程中发现"K-4 vs DWB 收敛"是对照叙事的最强证据，因此上调为独立 Finding 与核心建议；发现"弹簧力>轮荷"的反直觉现象后追加 Counterevidence 登记。
- **Phase 5 SYNTHESIZE**：凝练出"因果链逐段强化移植"模式、"残差诚实"哲学、"continuation 是 K-4 线索"三大跨章节洞察。
- **Phase 6 CRITIQUE**：以"怀疑批判工程师"人设复核——坐标系是否真的分歧（读 convention.py 确认）、实测是否可复现（保留 harness 与输出）、结论是否过度外推（把定量结论限制在方法学+数量级层面）。
- **Phase 7 REFINE**：补坐标映射表、Counterevidence Register、Gap 1/2/3，收紧"数字不可跨系统直引"的表述。
- **Phase 8 PACKAGE**：输出本报告 + `sources.jsonl`(23) + `evidence.jsonl`(39) + `claims.jsonl`(14) + `run_manifest.json`。

### Sources Consulted

- **Total Sources：** 23（10 项目内 [1-10] + 13 网络 [11-23]）
- **Source Types：** 源码/代码 4、项目文档 8、学术 7、行业教程 3、社区/代码文档 4。
- **Temporal Coverage：** 2005–2026（PBD 2007 为方法学基础，2023 NGS 为近例，项目文档 2026-08 为最新）。
- **Geographic Coverage：** 项目内（中国，FSAE 大学生方程式）/ 网络（欧美学术与行业为主）。

### Verification Approach

- **Triangulation：** 每个主要结论 ≥2 证据面；定量结论（残差/迭代/耗时/指标）全部来自 Node24 实测，源码行号可回查；定性结论（架构/角色/边界）由源码+spec+devlog 三方互证。
- **Credibility：** 项目源码与官方 spec 视为最高可信（第一手）；网络来源仅作理论命名确认，不做定量依据。
- **Quality Control：** 实测中途发现"编码错乱"问题后用 UTF-8 显式重读验证；`node --check` 过语法；所有引用的行号均可从 `read` 结果复现。

### Claims-Evidence Table

| Claim ID | Major Claim | Evidence Type | Supporting Sources | Confidence |
|----------|-------------|---------------|-------------------|------------|
| C1 | DWB-SIM 是单文件自包含仿真台 | Primary code | [1],[2] | High |
| C2 | 求解器为交替投影+continuation (PBD/形状匹配) | Primary code | [1],[2],[11],[18] | High |
| C3 | ±30mm 残差≈1.5e-7mm、0.02–0.66ms、DOF=1 | Measurement | [ev],[1] | High |
| C4 | 几何极限±138mm，工作行程受缓冲块约束 | Measurement | [ev],[1] | High |
| C5 | 指标由当前姿态实时推导 | Primary code | [1],[2] | High |
| C6 | 导数用有限差分，精度受采样限制 | Primary code | [1],[2] | High |
| C7 | 台架=子步半隐式+投影回写，双比阻尼/缓冲块/轮胎瞬态/5 波形 | Primary code | [1],[2] | High |
| C8 | 台架是实时近似非完整 MBD | Project doc | [2] | High |
| C9 | 稳定杆 J=πd⁴/32、kt=GJ/L、直径四次方敏感 | Primary code | [1],[2] | High |
| C10 | 坐标 X/Y 互换 vs 产品标准 | Primary code | [1],[8] | High |
| C11 | 产品定位为参考原型并多次移植 | Project doc | [3],[4],[5] | High |
| C12 | K-4 (0.73mm) vs DWB (1e-7mm) 对照 | Measurement+report | [7],[ev],[9] | High |
| C13 | 工程约定与赛车惯例一致 | Multi-source theory | [12],[14],[16],[17],[20] | Medium |
| C14 | 单文件架构利弊 | Project doc | [2] | High |

**Confidence Levels：** High = 源码/实测/官方文档 ≥2 面互证；Medium = 网络理论综述性结论。

---

## Report Metadata

- **Research Mode：** deep
- **Total Sources：** 23
- **Word Count：** ≈13,000（中文字符口径）
- **Research Duration：** 单会话约 45 分钟（含源码逐行 + 实测 + 撰写）
- **Generated：** 2026-08-21
- **Validation Status：** 实测数值已复现（见 `run_manifest.json` verification_note）；Markdown 可经 `md_to_html.py` 转 HTML。

---

*（完）本报告只做分析与启示，不改动 DWB-SIM 与产品代码；与官方 spec 立场一致：不迁移、不重构、不修改现有求解器。*
