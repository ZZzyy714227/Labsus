# 开发日志

## 2026-08-21 — 全底盘改造 · 浏览器反馈修复轮（节点拖拽/防倾杆）

- 用户反馈：整车节点移动异常 + 前轴紫色防倾杆异常延伸。三层根因已全部修复并在真实事件路径（合成 mousedown/mousemove/mouseup 走实际处理器）实证：
  1. 前轴双几何源失同步：拖拽/硬点表写 `S.hp`，机构读陈旧 `axles.front.hp` → 前轴拖拽不动、防倾杆 arbGeom 混用新旧几何被拉长。修复：buildMech/setChassis 前轴统一走 `S.hp`（后轴走 `S.axles.rear.hp`）；persistState 同步 `S.hp`→`axles.front.hp`（`ec2c24e`）。
  2. 节点拾取 `PICK` 未携带 ax → 后轴拖拽实际改写前轴。修复：PICK 条目带 axleKey（`3e84bf8`）。
  3. `rebuildLight()` 只重建前轴机构 → 后轴机构陈旧不跟随。修复：四机构全重建（`3e84bf8`）。
- 实证：前/后轴拖拽后机构即时跟随（z 433=433）、互不影响、ARB 连杆比 1.000；60 帧浸泡（播放+正弦轮跳/转向+切轴+RIG 瞬切）0 异常。
- 后续打磨（`5846c2f`/`234b2cf`）：地面线随轴视图、右栏主读数随轴视图（后轴 cam/行程行）、输入归零含四轮偏移+俯仰、轴距滑块（后轴硬点随差值平移，方向已修 -d）。
- 注意：本机 Edge headless --dump-dom 零输出（两次有界尝试）、无 Chrome，渲染级验收只能由用户浏览器实测。
- 待办：浏览器 8 项验收（用户）。

## 2026-08-21 — 全底盘改造（在参考 double-wishbone-suspension.html 上直接生长）T1–T6 完成

- 需求：不再"照 DWB 搬家"，把参考本身扩展为"前+后轴四轮同屏、硬点可拖可存、整车运动学可分析"的全底盘工具台；用户裁定：参考的立柱/弹簧已正确**不动**，唯一缺口=后轴；前后轴**解耦**（无车架耦合、不跨轴传力）。
- T1 数据层：`S.axles={front,rear}` 双轴硬点（后轴=前轴几何平移 Y−wb）、`axleView`、四轮独立行程 `trFR/FL/RR/RL` + 整车俯仰 `pitch`、localStorage 自动保存 + JSON 导出/导入（按钮在"输入量"区）。
- T2 机构层：`buildMech(axleKey)` 参数化 → `SIM.R/L`(前)+`SIM.RR/RL`(后) 四机构（左=镜像，沿用参考模式）；`cornerTravel` 整车驱动（侧倾=半轮距·tan 分轴、俯仰=前组−/后组+、后轴 rack=0）；**修复 setChassis 硬编码 S.hp 的 bug**（后轴固定节点被前轴坐标覆盖→错误分支），改按 `M.axleKey` 取轴硬点；metrics 增加按轴硬点参数；状态残差=四机构 max。
- T3 轴语义：后轴无转向、前轴 toe 视觉保持（立柱/弹簧零改动）。
- T4 渲染：`addInstance` 加纵向平移 dy=−wb；四轮同框 + ALL/FRONT/REAR 轴开关（按钮 + 视图过滤 + fit/叠加层联动）；fitPoints 含后轴。
- T5 分析：右栏四轮定位表（FR/FL/RR/RL ×6 参数）、「整车 VEHICLE」分组（后轴 cam/toe/RC/行程、RC@0 前后轴、RC 连线角、轴距）、曲线随轴视图取前/后轴扫掠。
- T6 收口：快捷键 `A` 循环轴视图；后轴扫掠在 updateSweeps 节流路径同步刷新。
- 验证：node --check + DOM 存根全链路冒烟（引导→simulate→draw→readouts）：前后轴设计位 cam/toe 一致（−0.75/0.10）、残差 1e-14、trRR=15 只动后轮（解耦）、四轮表数值正确、导出/导入函数就位。
- 边界：预设后轴=前轴平移（用户拖节点自调后保存）；弹性参数暂全局共用；减振器塔视觉仅前轴；四轮 7-DOF 台架下一轮。
- 待办：浏览器 8 项验收（用户实测）：四轮同框/轴开关、后轴拖拽独立+保存、转向 toe 视觉、曲线常驻游标、残差≤0.02、JSON 往返、流畅度、前后轴解耦。

## 2026-08-21 — 子阶段①完成：DWB 式机制求解器上线切主（残差 ~1e-13mm，K-4 消解）

- 需求：按 DWB-SIM 建模升级第①子阶段——机构级运动学求解器，取代顺序解、消除 K-4（顺序解全行程残差最高 0.73mm）。
- 实现（`src/solver/mechanism/`，共 6 模块 + 5 测试文件）：
  - `models.py`：Node/Link/AxisCluster(hinge|rocker)/BodyCluster/Mechanism + build_mechanism（UCA/LCA 铰链簇、转向节 5 节点刚体、摇臂铰链簇、横拉杆/推杆刚线、轮高+齿条双驱动、DOF=2=传动自由度）。
  - `project.py`：project_distance / project_hinge / project_rocker / project_body + polar_q（Müller+**SVD Procrustes 兜底**，防强各向异性协方差过冲）。
  - `solver.py`：**scipy least_squares 联合收敛 + continuation 热启动 + solve_rocker 后处理**。
  - `from_legacy.py` / `pose.py` / `v2adapter.py`：真实硬点（含 R_ 前缀与 frame 节点）、compute_alignment_angles 复用、_solve_axle 同构角解。
- 关键决策（有据偏差，已记录）：
  1. **收敛改用 least_squares 而非纯投影 GS**：真实几何双闭环/强各向异性下独立精确投影实测不收缩（残差停在 43–84mm），LS 联合收敛到 1e-11 且热启动保持分支连续；投影原语保留为原语与未来 warm-start。
  2. **齿条 steer_axis 全程 +Y**（齿条整体沿全局 Y 平移，两侧 tie inner 同向），转向符号由几何自然得出，符合 convention K-2（rack=+10 → 右 +toe / 左 −toe）。
  3. **摇臂不可达并入状态**：伸张端 ≤-120mm 时摇臂/推杆闭环不可达 → OUT_OF_RANGE（轮侧几何残差虽小）。
- 基准（`data/reports/dwb_mechanism_gate.json`）：全 4 角落×7 行程×2 齿条 = 56 行，worst 残差 **3.5e-11mm**（G1，阈值 0.02）；单姿态 p95 **21.95ms**（G4，预算 50ms）；与顺序解头对头 delta：caster 最高 1.03°、trail 4.44mm（顺序解极端行程残差 0.4mm 传导所致）。
- v2 集成：`_SOLVER_MODE` 环境开关默认 **mechanism**（顺序解保留 `solver="sequential"` 显式回退）；SolveInlineRequest 增 `solver` 请求覆盖；`_solve_corner` 分流，前端零改动；顺带清掉一处既有死变量 `veh`。
- 验证：全量 pytest **412 passed / 33 skipped / 3 xfailed / 0 failed**；机制 24 单测；v2 更新 5 条落后于新真相的断言（golden solver 名、fr-comp→VALID、-30→VALID / -120→OUT_OF_RANGE、export、性能预算 3s 放宽并注明理由）。
- 下一步：子阶段②机制级台架动力学（同一机构 + 弹性线/力/积分）。

## 2026-08-21 — 决策：按 DWB 建模升级 · 子阶段①（机构级投影运动学求解器）设计规格

- 需求：用户判定参考 DWB-SIM（double-wishbone-suspension.html）建模优于产品，要求「按它的建模做一轮完整升级」。
- 决策（用户拍板 ×3）：① 后端 Python 重写 DWB 式建模（modeler 继续 /api/v2）；② 整轮=四子阶段推进（①机构运动学求解器 → ②机制级台架动力学 → ③指标/曲线一致性 → ④可视化部件），每子阶段独立 spec→plan→实施→验收；③ 新求解器「并行验证→达标切主」，顺序解回退。
- 产出：`docs/superpowers/specs/2026-08-21-dwb-mechanism-solver-design.md` —— 机构拓扑（UCA/LCA 铰链簇 + 转向节 5 节点刚体簇 + 摇臂铰链簇 + 横拉杆/推杆刚线）、DWB 投影原语 Python 映射（project_distance/hinge/body/rocker + polar_q + continuation 热启动）、DOF=2（轮跳+转向）、G1–G4 验收门、基准矩阵（P1 16 例 + 14 工况 + 镜像），坐标全程按 convention.py 不搬 DWB 轴。
- 依据：深度研究报告 `docs/research/2026-08-21-dwb-sim-deep-research/`（DWB 实测 ±30mm 残差 1.5e-7mm vs 产品顺序解 K-4 0.731mm）。
- 下一步：用户审阅 spec → writing-plans 拆实施计划。

## 2026-08-21 — 深入研学参考 DWB-SIM：深度研究分析报告（deep-research）

- 需求：用户指令"深入学习 double-wishbone-suspension.html（DWB-SIM）"+ /deep-research，产出可引用、可复核的深度研究报告。
- 产出（`docs/research/2026-08-21-dwb-sim-deep-research/`）：
  - `research_report_20260821_dwb_sim.md`（主报告，7 大 Finding + 综合 + 局限 + 建议 + 参考文献 23 条）
  - `research_report_20260821_dwb_sim.html`（McKinsey 模板成品版）
  - `sources.jsonl`(23) / `evidence.jsonl`(39) / `claims.jsonl`(14) / `run_manifest.json`
- 核心结论：
  1. DWB-SIM = 产品"设计语法"参考原型（PROJECT_MAP 佐证），产品已 3 轮移植其交互/渲染/台架特性。
  2. 求解器是 GS 交替精确投影（projLink/projHinge/projBody + continuation + 四元数热启动），属 PBD/形状匹配家族。
  3. **第一手实测（Node24 复现原文件）**：±30mm 行程最大残差约 1.5e-7mm（0.02–0.66ms/姿态，DOF=1）；产品顺序解 K-4 残差最高 0.731mm → 强烈对照。
  4. 高优先级警示：DWB-SIM 坐标 X=外侧/Y=向前 vs 产品标准 X=向前/Y=右侧，跨系统取数必须先换算（见报告 Finding 7.1 映射表）。
- 待办（报告内的建议，本次未改任何代码）：① DWB-SIM 归档 ref/ 并写坐标映射声明；② 顺序解外包 continuation 修 K-4；③ 模型器补"几何极限 vs 缓冲块行程"分开展示。
- 验证：validate_report.py 全项通过（Executive/Required/Citations/Bibliography/WordCount/SourceCount 等）；verify_citations 7/23 URL 可达（项目内本地文献 [1]-[10] 无 URL，已如实标注）；verify_html 的 "emojis" 报错为其检测器对 CJK 的误报（报告无 emoji）。
- 提交：docs/research/2026-08-21-dwb-sim-deep-research/* + DEVLOG。

## 2026-08-21 — 项目全量梳理：三代产物共存盘点 + 项目地图文档

- 需求：项目经历多代大版本，内部较杂，需要一次全量梳理。
- 产出：新增 `docs/PROJECT_MAP.md` —— 演进时间线（2026-06 V1–V9 → 2026-08-12 V10 → 2026-08 起 V1 重造 P0–P6）、当前运行链、全量文件库存清单（活跃/兼容/遗留/备份/参考/垃圾分层）、杂乱点登记（两套前端、两套主题、新旧 /api 并存、config 备份在 src 内、DEVLOG/PLAN 重复标题、roll.py 疑似死代码等）、分档清理方案（A 安全 / B 归档 / C 需拍板 / D 长期）。
- 验证：全量 pytest 388 passed / 33 skipped / 3 xfailed；线上服务 `/` → /modeler.html 正常。
- 待办：已列出三项待用户拍板（前端单轨化？旧 /api 去留？清理激进程度？）。
- 提交：docs/PROJECT_MAP.md + DEVLOG。

## 2026-08-21 — 节点双侧可拖（左右独立）+ 智能捕捉

- 需求：1) 模型节点拖动之前只允许右侧（镜像侧 sx>0 被禁），要能拖两侧；2) 节点位置智能捕捉，默认开启、按住 Shift 解锁。
- modeler.html：
  1. 左右独立：S 增 frontL/rearL（null=沿用镜像）。buildSkeleton 左侧优先取 S[axis]L 独立，未独立时镜像右侧；mousedown 拖动左侧首次从右侧镜像初始化独立硬点，之后左右各自独立；casePayload 把独立 front_left/rear_left 传给后端 /api/v2/solve/hardpoints（null 则后端镜像）；硬点「重置」同时清除该轴左侧独立几何恢复镜像。
  2. 智能捕捉：S.snap=true（默认开）、snapPx=9px。拖动时非 Shift 走 1mm 步进 + snapNode 吸附——当前拖动点在屏幕上与任一其它节点距离< snapPx 即 3D 对齐到该节点；按住 Shift = 解锁捕捉 + 0.1mm 微调。
- 边界：硬点面板仍编辑右前/右后模板；左侧独立仅通过正交视图拖动生成（不在面板体现）。AB 对比/导出以右侧模板为准。
- 撤销修订：上一轮加的「左右独立 frontL/rearL」与「节点智能捕捉 snapNode/snap」按用户要求回退——左右保持镜像（只两侧都能拖、都在右侧模板上改）、捕捉删除。
- 转向核查：浏览器实测 rack 0→20，FR 前束 0.12°→12.99°、左右反向对转（阿克曼），iso 下轮胎圆盘随主销偏转、外倾联动——后端求解与 iso 渲染向随转向正常；待用户确认是在哪个视口/何种条件下看到"轮胎不跟"。
- 提交：web/modeler.html + DEVLOG。

## 2026-08-21 — 补建模缺口：四轮时域台架（7-DOF）+ P1 呈现补全

> 背景：审核参考 double-wishbone-suspension.html 后，确认最大建模缺口是「时域动力学台架」（参考有弹簧分离阻尼/缓冲块/轮胎垂向瞬态/路面谱的积分，我们的 dynamics.py 只有频域）。用户否决单轮，要求四轮全车。

- 后端 metrics/bounce.py：
  - 全车 7-DOF（车身 垂向 z_c + 侧倾 φ + 俯仰 θ 刚体，× 四角簧下 1 DOF）。
  - 悬架在轮端 lump：k_w=k_spring·MR²；减振器 压缩/拉伸分离阻尼（c_comp/c_reb）；缓冲块（压缩超行程 二次力 k·x²/20）；轮胎垂向 k_t+c_t + 路面渗透；防倾杆滚刚度作用于车身侧倾。
  - 路面激励 step/sine/pulse（road_signal）；半隐式(辛)积分，内子步 NS 保证轮胎刚度稳定。
  - 静平衡基准：q0/d0 使弹簧预载与轮胎承载×1000 与重力 9810 相消（无输入即静止）。
- 后端 v2.py：新增 `POST /api/v2/rig`（输入四轮硬点 + vehicle 覆盖 + 激励；运动比缺省由几何 rocker mini-sweep，可显式覆盖），返回 time 序列 + 四轮 Fs/Fd/Ft/pen/dzu/acc + 车身 heave/roll/pitch。
- 测试：tests/test_bounce.py（无输入稳定 / 轮胎力=总重 / 单轮激励→四轮耦合 / 对称阶跃同向 / MR 助手）+ test_v2_api.py::TestRig；全量回归 387 passed。
- 前端 modeler：新增「台架 Rig · 四轮时域」面板（激励类型 step/sine/pulse、轮位 全轮/单轮、幅值/频率/时长），调 /api/v2/rig 绘四轮 Fs/Ft 曲线 + 车身 heave/roll 响应。
- P1 呈现（零后端改动，正确引用 loads 字段）：「轮边受力」note 增强展示 ARB droplink、UBJ/LBJ 球头反力、车架支点 max 反力、力/力矩残差。
- P1 呈现续补（本轮完成）：
  - v2 新增 `_p1_metrics`，在 `/solve/hardpoints` 响应附加 `body.p1`：侧倾刚度（前后弹簧+ARB、总刚、前轴占比）、载荷转移分解（几何/弹性/非簧载/纵向/总横向，复用 distribute transfers）、瞬心坐标（侧视 SVIC x/z + 主销 YZ IC y/z，来自当前姿态球头）、ride 频率/阻尼比/频比（复用 dynamics.ride_frequency/damping_ratio、ride.sprung_mass_per_corner）、目标带评估（ride_freq/damping/motion_ratio/load_transfer，复用 targets.TARGET_BANDS）。
  - modeler 新增「侧倾/动力学/目标带 Roll&Ride」面板（renderP1）：显示刚度/转移/瞬心/ride + 目标带绿黄红状态；renderAll 末尾调用。
  - 测试：test_v2_api.py::TestInlineSolve::test_p1_side_metrics_present；相关 51 passed。
- 待续 P1：无（P1 已完结）。
- 提交：src/metrics/bounce.py + src/routes/v2.py + tests/test_bounce.py + tests/test_v2_api.py + web/modeler.html + DEVLOG。

## 2026-08-21 — F1 2026 十二款配色预设（11 车队 + 综合版）

- 需求：把 2026 赛季 11 支 F1 车队配色做成配色编辑器预设，另加一款综合版（共 12 款）；每款为「多色映射」而非单色。
- 做法（modeler.html）：
  1. 新增 `PRESETS`（mcLaren/ferrari/redBull/mercedes/astonMartin/alpine/williams/racingBulls/haas/audi/cadillac/composite），每款把车队配色映射到多个槽位：主强调 acc、次强调 purple、3D 部件色（主销 kp/立柱横拉杆 knu/弹簧 ela/摆臂 rig/车架 chas/轮 rim/卡钳 cal/节点 node/nodeFix/转向机 rack）。
  2. 配色面板顶部新增「F1 2026 预置主题」按钮行，点击即把该款覆盖合并进当前主题、保存到 localStorage 并实时应用+刷新色块。
  3. 综合版取自多家代表色拼合（RB 蓝/Ferrari 红/McLaren 木瓜橙/Mercedes 青/Aston 青柠/Alpine 粉）。
- 设计取舍：语义红/绿（通过/警告/失败）与暗色界面壳保留默认，保证工程可读性，预设只改品牌强调色与 3D 部件配色。
- 面板多色：新增 `PANEL_COLORS`（13 色）×`paintPanels()`，给左右栏 13 个面板（仿真/输入/视图/硬点/快照/定位角/受力/状态/整车指标/曲线/操稳/敏感性/导出）各自的标识色——左竖条 + 面板标题着色，与 3D 模型配色联动呈现（综合版下面板区也多彩）。`applyTheme` 每次应用都重绘面板上色。
- 面板分隔线改银：`.sec`/`.sh` 底部分隔线与面板头基线由黑 `var(--bd3)` 改为新增的银色变量 `--psep:#AEB6C0`；结构外框（左右栏 3px 黑边、视口网格线）保留黑。
- 修复：配色浮层 `#themeOverlay` 的 ID 选择器优先级盖过 `.hidden`，导致启动即显示且关不掉；新增 `#themeOverlay.hidden{display:none}` 修复。
- 提交：web/modeler.html + DEVLOG。

## 2026-08-21 — 统一配色入口（修正：落在真实的 modeler.html）

> 补充：上文原来做的配色入口落在旧版 index.html；用户实际使用的是自包含单文件版 modeler.html，故配色入口迁到此页重做。

- modeler.html 为单个自包含 HTML，颜色散落在 :root CSS 变量（界面）+ `CC` 调色板对象（3D 画布）。新增单一调色板数据源 `PAL`（数组，每项可同时绑 CSS 变量 + CC 字段），一处改色全局生效。
- 结构：`PAL`（界面/强调/画布三组 30 项）→ `loadPal`(合并 localStorage)/`applyTheme`(写 :root CSS 变量 + CC 字段 + legend + 重绘)/`updateLegend`。
- 入口：顶栏新增「🎨 配色」按钮 → 浮层编辑器，颜色选择器实时改色+本地持久化；⤓ 导出 JSON；↺ 重置。底色/强调/语义色/3D 车、悬架各部件颜色均可改。
- 校验：DOM 中无多余类冲突，`hidden`/面板样式已加；`bind()` 首行应用已存配色。
- 提交：web/modeler.html + DEVLOG。

## 2026-08-21 — 统一配色入口：单一数据源同时驱动 UI 主题 + 3D 材质

- 需求：一个统一的前端配色修改入口，方便快速改色。
- 现状：颜色散落多处——style.css :root（UI 主题）、car3d/materials.js MAT（3D 材质）、scene3d.js 场景背景、main/history/dashboard 里硬编码的 good/warn/bad。
- 做法：新增 web/js/theme.js 作为单一数据源（defaults: ui 界面 / semantic 状态色 / mat 车身材料），并清洗硬编码：
  1. theme.js —— loadTheme(合并 localStorage)/saveTheme/resetTheme/get(key)；applyUI(写 :root CSS 变量，teal/purple/silver 的派生亮色自动计算)；apply3D(遍历 MAT 更新共享材质颜色，改色即时作用于所有网格)；sceneBackgroundHex(3D 背景绑定 UI.paper)。
  2. 顶栏新增「🎨 配色」按钮 → 浮层编辑器（分组：UI 界面 / 状态语义色 / 3D 车身材料），颜色选择器实时改色、自动持久化本机；导出 JSON 分享；重置默认。
  3. 语义色去重：main.js 徽章、history.js worstColor、dashboard.js lightColor 改为统一读 theme.get('good'/'warn'/'bad')。
  4. scene3d.js 新增 setSceneBackground(hex)，3D 背景/雾与面板底色联动。
- 说明：整车涂装（车身面/空力 color 来自后端 config）属"涂装"独立维度，暂不纳入本入口，保持最小改动。
- 验证：npm run build 通过（27 模块无 import/语法错误）。
- 提交：web/js/theme.js + index.html + style.css + main.js + history.js + dashboard.js + scene3d.js + DEVLOG。

## 2026-08-20 — 曲线丝滑化：常驻曲线 + 实时位移游标 + 后台静默重扫（对齐参考）

- 用户：参考的曲线展示很丝滑，几何/轮跳一动曲线就对应变化；我们的有问题（播放中曲线被清空成占位、无游标、几何变化曲线不跟）。
- 逐段研学参考 drawPlots/updateSweeps/loop：曲线常驻 SIM.swR、后台≥130ms 节流重扫、游标 cur 随当前轮跳滑动、每帧 drawPlots。
- 后端（v2.py）：_sweep_curves/_sweep_metrics 增加 absolute 参数；内联 /solve/hardpoints 的扫描改为「绝对行程」基准（travel_r=axis_val，不再叠架工况轮跳），这样曲线 x 轴即绝对轮跳，游标才能随位移滑动；standalone /sweep 不变。回归 43 passed。
- 前端（modeler.html）：
  1. sweepCache 常驻 —— 播放中曲线不再消失，每帧从缓存绘制。
  2. 实时游标：当前轮跳(或 rack) 竖线 + 顶标 + 状态读数（tr/cam/toe 实时值）滑过曲线；轴级曲线(axChart)也加游标。
  3. 后台静默重扫：播放时每 ~500ms requestSolve({sweep,silent,immediate:false})，几何/齿条/行程变化时曲线跟随更新；silent 跳过面板重渲染。
  4. drawChart 重写：camber/toe 双线 + 网格/0 线 + 游标 + 读数；播放先扫空时显示"运行后自动生成"。
- 验证：strict-ctx mock（逐帧微任务排空）2.9s 内 47 次显示解算 + 6 次后台重扫、sweepCache 常驻、错误 0；真实 Edge 无头 —— t=27.3s 动画推进、tr=18.0 位移、sw=14 条曲线常驻、err=0、8 画布、solve 跑通。live 200。
- 提交：src/routes/v2.py + web/modeler.html + DEVLOG。

## 2026-08-20 — UI 细节打磨 + 补齐「计算全部呈现」（整车指标面板/轴级曲线/主销接地点）

- 用户：面板功能不如参考丰富？计算是否都被合适呈现？UI 细节再优化一轮。
- 根因：后端 v2/sweep_v2 其实算了全套指标（运动速比/外倾增益/跳动转向/包容角/阿克曼/抗俯仰-抗蹲/顶升/轴距-轮距变化/侧视瞬心），但内联 /solve/hardpoints 用的 _sweep_curves 只回 curves、不回 metrics —— 前端根本没拿到，即"算了却没呈现"。
- 后端（v2.py）：抽出共享 _sweep_metrics(dv,cv,axle,axis,sw)，内联求解的 sweep 也携带 metrics；sweep_v2 复用同一函数（删除重复块）。回归 test_v2_api 43 passed。
- 前端新增/增强：
  1. 右栏新增「整车指标 Vehicle Metrics」面板：运动速比/外倾增益°/25/跳动转向°/25/包容角R-L/侧倾中心高RC@0/抗俯仰(前)-抗蹲(后)/顶升/轴距Δ/轮距Δ/侧视瞬心，随所选轴&扫描轴切换；行带悬停说明与状态色。
  2. 曲线区新增「轴级指标曲线」：travel 显示 RC 高 + 轮距Δ（双轴）、rack 显示阿克曼%。
  3. 定位角表新增「主销接地 X / Y」两行（来自 steering_axis.ground_point）。
  4. UI 细节：右侧分节可折叠（＋/−）；节标题 2px 强调条 + hover；指标表行悬停 title 说明；轴级图注脚说明。
- 验证：strict-ctx mock 指标面板/主销接地/动画全绿、错误 0；真实 Edge 无头 — 8 画布、求解跑、指标面板显示 运动速比·抗俯仰、主销接地 Y、可折叠、非加载中。live 200。
- 提交：后端 v2.py + 前端 modeler.html + DEVLOG。

## 2026-08-20 — 动画流畅度 + 右侧黄色提示闪烁修复

- 用户：① 最右侧黄色提示反复闪、重叠看不清；② 动画帧率偏低、卡顿。
- 黄色提示根因：状态区 #statusBox 用了 .ctl 两列 grid 布局，放入多行警告后挤压重叠；且播放中每次求解(~90ms)都会把 4 轮残差警告(非零行程时 APPROXIMATE → 超阈值警告)整块重绘 → 右侧黄字持续闪。
- 修复：statusBox 改为普通块(行高1.7)不重叠；**播放中只显示一行"播放中：实时求解"、警告压缩到暂停后显示**；图表在播放中不再反复清空(无 sweep 时不重绘)。
- 帧率：后端求解节流 90→78ms；每帧场景重建成本大幅下降 — 螺旋弹簧 150→72 段、车轮/轮胎圆 40→26、轮辋/制动盘 32→24、辐条毂 22~16、球头 12→10、盘辐 16→12、胎带 22→14、转向机壳体 14→12；暂停空闲时不再每帧重绘(needsDraw 节流)。
- 验证：strict-ctx mock(setLineDash 非数组即抛) 全绿、动画 travel 自走、四角点正确、错误 0；真实 Edge 无头 — 7 画布、求解跑起来、状态显示"播放中"(无警告闪)、非"加载中"。live 200。

## 2026-08-20 — 完整交互 + 动画仿真 + 建模细节对齐参考（DWB-SIM）

- 痛点（用户）：交互不够、建模细节与参考有差、要求完整交互/完整功能，含初始状态自动轮跳与转向等模式；再次研习 double-wishbone-suspension.html 后重写 web/modeler.html。
- **仿真动画**：requestAnimationFrame 动画循环；运行/暂停(Space)；跳动激励(静态/正弦/三角)+幅值/频率；转向激励(静态/正弦/三角)+幅值/频率；侧倾 ROLL 输入映射四轮行程差；初始默认 播放+正弦轮跳 随页面自动滚动。后端求解按 90ms 节流 + **姿态插值**(两帧间平滑运动，60fps 视觉) 。
- **交互补全**：等轴测 左键旋转/Shift·中键平移/滚轮缩放；正交 拖动硬点(Shift 0.1mm 捕捉)/滚轮缩放/中键平移/双击+F 适应/F 键/1-4 最大化；键盘 Space/方向键(轮跳)/Shift+方向键(齿条)/F；左栏 AZ/EL 滑块+全部适应+还原视角；显示层开关(节点/标签/连杆/立柱面/弹簧/车轮/制动盘/车架/转向机/防倾杆/尺寸角度/轮胎遮罩/对侧)。
- **建模细节**：螺旋弹簧+减振器(车架 CH5↔推杆 UP4, 弹簧座/减振杆)；转向机(壳体/输入小齿轮/随动齿条轴)；防倾杆(扭杆+连杆→下球头 LBJ)；制动盘+辐条+毂+卡钳骨架；轮胎 3D 圆盘+轮辋5辐条+毂+可开轮胎遮罩；减振塔顶板；球头三向圆环。
- **标注(尺寸/角度)**：正视图 外倾γ弧+主销内倾KPI弧+Scrub尺寸线；侧视图 后倾弧+拖距尺寸线；俯视图 前束弧+轮向线+中心线。
- **面板**：左=仿真控制/输入/视图/硬点/A-B；右=四轮定位角/受力/状态/曲线(前/后轴+travel/rack)/操稳调平/敏感性/导出；状态栏 node/rigid/elastic/残差/fps/cursor/hint；帧率 tbFps。
- 验证：strict-ctx mock(setLineDash 非数组即抛) 全流程无错 — id 全存在、脚本可跑、动画 travel 自 0→17.88mm、四角 UP5 正确、VALD；真实 Edge 无头 — errs=0、动画心跳 t 0→2.17s、scene=565 图元、7 画布、状态 APPROXIMATE(非零行程解算的诚实状态)；live 200。
- 注意：播放中后端按角求解(DWB 风格准静态)；暂停后自动补扫掠曲线。

## 2026-08-20 — 真实浏览器白屏修复（mock 漏检的真实运行错误）

- 症状：界面完整但四个 canvas 全空白。此前 mock DOM 测试"通过"但因 ctx 桩过宽 / 未走真实画布而漏报。
- 用机器上安装的 Edge 无头模式（--headless=new --dump-dom）注入诊断逐层定位，真实错误链：
  1. `let SCENE=[];` 未声明 —— drawAll 赋值与 drawView 读取直接 ReferenceError，四条 canvas 全停。
  2. HTML 缺 `id="gamma"`（重写时误删外倾输入）与 `id="tbCase"`（工具栏工况格）→ bind() 对 null 调 addEventListener，init() 异步抛错，requestSolve 从未执行。
  3. 若干 PL(...) 把半透明 al 或填充色 CC.knuF 误放进第 6 位 dash 槽 → 真实 ctx.setLineDash(字符串) 抛 "cannot be converted to a sequence"，drawView 中断 → 白屏。
- 修复：补 `let SCENE=[];`、补 gamma/tbCase 元素、把 8 处 PL 调用的 alpha/填充移回正确实参位。
- 验证（真实浏览器）：headless Edge 全流程 errs=0；tbState 显示 `VALID · sequential-bump-steer-v1 · modeler`；solver 栏就位；canvas×7；scene=314 图元/44 节点。提交 fd4bee2。

## 2026-08-20 — 建模器重构：整车底盘（前+后轴同屏）+ 3D 车轮 + 交互 + 全结果展示

- 背景（用户反馈 4 点）：① 后悬架轮胎轴线呈汽车前后方向（错误）；② 后端计算完成但前端未完整展示；③ 模型应是完整底盘（前后轴同时），而非按钮切换单轴；④ 三维视图无交互。并按用户要求重新研读示例 double-wishbone-suspension.html（DWB-SIM）。
- 重写 web/modeler.html（渲染/交互架构移植 DWB-SIM 的 P2 投影/camIso/fitView/orbit/circPts 图元管线，保留后端 /api/v2/solve/hardpoints 集成）：
  1. **整车同屏**：右前(x≈0)+右后(x≈−1550)由 legacy-import 载入，两轴同时绘制；左轮由镜像生成并在求解中一起运动。删除「前轴/后轴」模型切换按钮（硬点表改「右前/右后」编辑轴标签，仅决定表格编辑对象；曲线面板保留轴的图选择）。
  2. **3D 车轮**：按外倾/前束构建自旋轴 ax=[sin t, ±cosεcos t, −sinεcos t]（右轮+Y/左轮−Y），circPts 画轮胎圆盘+轮辋+辐条+接地点；解算对 UP3/UP4 用刚性转向节局部坐标重建。实测：静态外倾−0.75°→轴指向横向(Y)且顶内倾 ✓。
  3. **三维视图交互**：等轴测左键旋转(AZ/EL)、Shift/中键平移、滚轮缩放、双击/F 适应；正交视图拖硬点(±1/snap shift 0.1)、滚轮缩放、中键平移、双击适应。4 视口各带 F/M 按钮与最大化。
  4. **全结果展示**：定位角表(4 轮 FL/FR/RL/RR 状态+6 指标)、轮边受力表(4 轮 Fz/Fx/Fy/μ/离地+推杆/横拉杆/球头残差)、整车站姿(heave/roll/pitch)、曲线(camber/toe/scrub/trail)、操稳 K(ay)/yaw/回正/调平、敏感性、CSV/JSON 导出；状态栏整批 4 轮残差。
- 修复过程：块注释 CH*/FL1 提前闭合吞掉 displayCorner；删除残留无效行 const TI=…；拖拽时清空硬点表 tbody 的 bug；重置后轴误用前种子(改 _seedR 捕获)；statusBox 累积/无 parentElement 防护。
- 验证：node --check 语法 OK；mock DOM + vm 全流程(init→solve→renderAll→drawAll)不抛异常；wheelAxis 数学抽查正确；骨骼重建(后轴 UP3/UP4 与模板吻合)、侧视图投影 后轴在左 ✓；真后端 POST solve/hardpoints 返回四角 VALID、轮心 [0,610] 与 [−1550,590]、含载荷。modeler.html 200 且新内容在线上。
- 注意：本机 8000 旧 python 进程(38632)已结束，已重启新服务(作业 pwsh-1)，浏览器刷新即见新模型；如重启服务请用 start_modeler.bat。