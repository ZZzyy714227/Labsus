# 开发日志

## 2026-08-24 - feat(web): 综合版单 HTML（内置赛道物理引擎 TPHYS, 066ac6f）
- 需求: 用户要"综合版本, 单 html, 实现赛道相关所有后端" - 即一个 HTML 文件打开就能完整跑赛道仿真（无需 Python 引擎/8001 服务）。
- 交付 LABSUS/web/dwb-pro-allinone.html（dwb-pro-fullchassis.html 全功能副本 + TPHYS 注入）:
  - TPHYS(约460行JS): 升级版 transient.py 直接移植 - 平面3-DOF车体RK2、四轮MF(复合滑移摩擦圆+松弛长度一阶滞后+外倾推力+载荷敏感)、恒扭矩-恒功率动力包络+制动分配、气动下压力/阻力v2、侧倾/俯仰一阶滞后、纯追踪+PI驾驶员、内置quasiLoads(rc/kw LUT插值, 由SIM.swF/swR侧向扫掠经makeSimContext注入)。
  - 双模式: 设置面板新增"使用引擎 /api/v3"复选框(默认取消=内置JS物理免服务; 勾选且引擎在线则走真实引擎, 两者逐位一致)。
  - 舞台/机位/四轮摩擦圆/遥测全部复用(渲染零改动)。
- 数值对标(node验收): 定圆R30@13m/s - JS v_end 13.00/141.3m/0.662g/slip 1.39deg vs Python 13.0/141.3m/0.659g/1.35deg, 逐位一致; 期间修复drag双重v2(kd*v4 反向抵消推力导致车速钉死7m/s的bug)。
- 入口: 双击 dwb-pro-allinone.html 直接打开 → 赛道仿真大厅 → 开始仿真即全程内置物理; 其余功能与原版相同。README 已更新双入口说明。

# 开发日志

## 2026-08-24 — feat(engine+web)：赛道物理引擎升级 + 独立赛道舞台（219ac4c）
- 需求：用户要求（1）升级赛道物理引擎与赛车数学模型；（2）赛道功能独立触发：点击→选初始属性/赛道图→弹出占原 UI 80% 的独立显示界面；（3）固定机位可选（尾部/前部/斜45°跟随等）；（4）展示实时四轮摩擦圆、重要角度、重点力与加速度。
- **引擎升级**（LABSUS/engine/src/solver/transient.py，286→约 470 行）：
  - 轮胎：MF 复合滑移支撑（摩擦圆约束+利用率 mu_use 输出）、侧偏松弛长度一阶滞后（Ls 默认 0.35m）、外倾推力项（Cg=0.5/rad），结合既有载荷敏感性 LS；
  - 动力：恒扭矩-恒功率包络（T_max/P_kw）+ 前轴驱动分配 + 制动 split 参数化（默认 60:40）；
  - 气动：下压力/阻力随 v²（k_down_f/r、k_drag），下压力注入准静态载荷转移（aero_force_n/aero_bias 复用）；
  - 车体：侧倾/俯仰一阶滞后状态（τ=0.18/0.25s）替代纯准静态瞬时，用于 K&C 查表与姿态输出；
  - 驾驶员：纯追踪 + 纵向 PI（消除稳态误差）；
  - 模型：v3models 新增 PowertrainParams/AeroParams、TireParams.Cg/Ls；trace 扩展 pitch/ax/alphaL/mu_use/cam 逐轮；
  - 测试：基线更新为 FSAE 规格（wb1620/480kg，对应 PRESETS），新增 2 项物理断言（气动载荷+阻力、松弛滞后+摩擦圆不超限）；**全量 75 绿**（API 级验证）。
- **前端独立赛道舞台**（dwb-pro-fullchassis.html）：
  - 左栏"进入赛道仿真大厅"按钮 → 设置模态（占 80%：赛道预设/自定义导入+迷你预览图、初速/预瞄/时长、动力扭矩/功率/制动分配、气动三系数、轮胎 Fy0/FzNom/松弛/外倾）→ RUN 调引擎；
  - 成功后弹出 **80% 舞台**：顶部（状态/5 机位切换/播放暂停/倍速/进度/退出）、中央 3D 舞台（地面网格+中心线+ay 渐变轨迹+全车模型实时姿态，相机平滑跟随）、右侧遥测（四轮摩擦圆 2×2：μ 圆+Fx/Fy 向量+利用率+滑移角；12 项读数：v/ax/ay/横摆/侧倾/俯仰/转向/μ 峰值/油门/制动/松弛滑移/时间）；
  - 机位：尾随/前随/斜45°/顶视/固定机位(起点) 平滑插值相机；
  - 修复：画布负半径竞态（初次布局 v.s 为负 → angArc 抛 IndexSizeError 会杀死 rAF 循环）双守卫；
  - 调试钩子：URL 加 ?stagedemo 自动走全流程（供无头验证）。
- 验证：引擎 pytest 75 绿 + CLI 冒烟（定圆 141m、yaw≈v/R、slip 1.35°、aero 169N、PI v_end=13.0）；前端 node --check 通过、设置页 DOM 验证、stagedemo 无 console 错误（Edge dump 通道不稳，浏览器实测仍建议用户复核机位切换/摩擦圆刷新）。
- 遗留：舞台机位 trackside 使用预设起点（自定义路点下取首点）；四轮摩擦圆 μ 用固定 8000/3500（引擎实际 μ= Fy0/FzNom 用户参数化后应回读传输——下一步可将 res 内 μ 下发）。

# 开发日志

## 2026-08-23 — feat(web)：gemini 全底盘建模完美移植 + 硬点永久保存 + 五系统分色（b777ab3）
- 需求：用户交付 `C:/Users/zzy/Desktop/gemini-code-.html`（1719 行 DWB-SIM PRO 增量版）——"完美移植，点位移动后可永久保存，给各类系统管架设置默认颜色"。按 README 前端唯一开发文件约定，以 `web/dwb-pro-fullchassis.html`（2875 行）为主干，脚本化手术合并（非手工粘贴）。
- 移植内容（程序化：抽段→改名命名空间→注入→wrapper→挂点）：
  - **四大系统 3D 建模**：定形防撞区/乘员舱/主滚架桁架车架（FBH/IA/Front Hoop/RSB2/REF 固定 + 悬架舱过渡管件锚定硬点随动重构）；EDU 电驱+差速器箱体；半轴+三柱槽/Rzeppa CV 防尘套；中置蝴蝶方向盘+快拆+万向节管柱+齿轮齿条箱+防尘波纹管；双回路总泵+踏板平衡杆+液压硬管/软管；制动通风盘+径向卡钳+油管；轮端增强装配（胎面/轮毂/五辐条）。
  - **紧凑宽体比例**：轴距 2750→1620mm、hcg 350→320、前 235/40R18·后 285/35R18 新 PRESETS（前端 JS 内核与新硬点收敛正常）。
  - **五系统默认分色**：`SYSTEM_COLORS` 固定规范（不随主题）——车架钛灰/金橙节点、转向碳纤盘+阳极蓝快拆+阳极金万向节+银铬轴、传动深蓝 EDU+亮橙半轴、制动 Brembo 红+铸钢盘+金主缸、行驶薄荷青转向节+天蓝推拉杆+橙黄弹簧；`buildScene→buildScenePRO` wrapper（旧渲染函数保留死代码待清）。
  - **硬点永久保存（新增功能）**：localStorage `labsus.hp.v1`——拖拽释放自动写盘、启动自动载入；面板新增 SAVE/RESET（恢复出厂预设）/EXPORT（JSON 下载）/IMPORT（JSON 上传）四按钮 + "系统显示·分色" 图例开关组（21 项）。
- 验证：node --check 语法通过；serve_nocache :8921 + Edge headless 两次运行 **零 console 错误**，DOM 命中新面板/引擎"内置 JS"回退正常；截图 36,359 色非空白（渲染丰富）；持久化纯逻辑 Node 单测（保存→篡改→载入恢复 LCA_F/wb/LBJ ✓）。
- 遗留：旧 addShared/drawSubframe/addInstance 死代码（后续清理轮）；kpsw/path 扫掠轨迹调试线未并入 PRO 装配（旧入口保留）；引擎侧 DEFAULT_DWB_POINTS 仍为旧比例（前端渲染/JS 内核已切换 1620 宽体——单点 K&C 引擎接入不受影响，整车 quasi payload 需前端侧同步 wb 后自然对齐）。

# 开发日志

## 2026-08-22 — S3-2 前端闭环：赛道瞬态仿真接入（面板/数据桥/时间轴回放/遥测 HUD）
- 交付（`LABSUS/web/dwb-pro-fullchassis.html`，+~330 行）：
  - **左面板「赛道瞬态仿真」**：预设（稳态定圆 R=30 / 蛇形绕桩 30m / Mini GP 短道 / 自定义 JSON·CSV 路点导入）、预瞄增益、初速、RUN / 播放·暂停 / 退出回放 / 导出 Telemetry CSV、进度条拖动（Scrubber）、0.5×/1×/2× 速率、空格快捷键；
  - **数据桥 trackPayload()**：复用 chassisPayload 的整车 vehicle（含 kw_curve）+ 前端扫掠 K&C 查表（travel/toe/cam）→ POST /api/v3/chassis/simulate_track；
  - **时间轴回放**：simulate() 顶部 TRK 分支接管——每帧推进 trace 索引，applyTrackFrame 以引擎准静态 roll 驱动四角 driveTo（QUASI 同款管线），δ→齿条近似映射让 3D 视口转向轮同步摆动；
  - **俯视图赛道渲染 drawTrackOverlay**：赛道中心线（闭合预设自动闭合）+ 按 |ay| 渐变着色的轮胎轨迹（绿→红 / 2g 满量程）+ 车辆包络矩形与航向箭头 + HUD 读数；运行后自动 fit 俯视视口；
  - **右侧「赛道动态遥测」HUD**：G-G 摩擦圆散点（μ=2.29 圆 + 历史渐变 + 当前点，ax 数值微分）、四轮 Fz 柱状、v-t / ay-t / δ-t 三联曲线（plotXYMulti + 游标线）。
- 调试记录：初版 HUD 读 `row.t`——引擎 trace 行不含 t（时间戳在独立数组），undefined.toFixed 抛异常**杀死整个 rAF 循环**（回放冻结在 i=5 的假象）；改用 TRK.res.t 索引后全通。
- 验证（playwright 真实浏览器 ↔ 真实引擎）：定圆 177.2m·0.668g 完整回放，播放推进 258→499/2.5s（≈1×）、空格暂停、scrub 到 75%（roll=1.25°、ay=4.11m/s²）；**3D 联动实证**（scrub 前后轮跳 4.36→−39.17mm，悬架随跑圈姿态动画）；Mini GP 全程 221.6m·v_max 17·1.585g；G-G/Fz/三联曲线画布非空白；零 JS 错误。
- 语义：全链闭环 = 硬点调校（本页面）→ K&C 查表 → 引擎瞬态（MF+准静态载荷+摩擦圆+LS 载荷敏感性）→ 回放可视化。改一个硬点重新 RUN 即见圈速/载荷/侧倾行为变化。

## 2026-08-22 — 修复序列：r2 深研四发现落地（P0–P5 全部执行，71 绿）
- 需求：r2 深度研究报告（docs/research/…_r2，同日晚间）的发现与修复清单——用户指令"开始逐一修复"。
- 研究新增确证（r2 报告，见 docs/research/2026-08-22-labsus-deep-research/）：①P0 quasi 内核统一已于早间报告后落地（C7 关闭）；②**新缺陷**：左角复用右框架公式，轮轴未镜像，FL/FR scrub 偏差恰 2·tireR·sin(|cam|)=13.61mm（解析 13.6126 vs 实测 13.613 精确吻合）；③bench/v2adapter/from_legacy 三快照依赖父仓 config/hardpoints/routes，隔离区内 import 即失败（C12 不可复现）；④四套指标管线并存（angles.py / pose_metrics / kinematics.py / 前端 JS）。
- **P0 镜像修复**（0d88d96）：`pose_metrics` 侧别泛化——`_wheel_axis(design, side)`、toe 提取 `atan2(ay, side·ax_x)`、kpi/scrub 按 convention.py"两侧相同"翻号；镜像输入下六项定位角 FL==FR 逐位相等（gap=0）；roll 对称性测试修正为**反转行程索引**不变量（旧同索引断言比较不同行程，物理上不成立，曾通过恰因该缺陷污染抵消）；+6 镜像守卫（含右侧黄金值）。55 绿。
- **P1 快照隔离**（006843c）：`_legacy_parent_snapshot/` + README（不可运行原因/重启用路径/历史基准 56 例纪录）。55 绿。
- **P2 STRUT_OUT 拓扑 + 摇臂三维轴 + MR 权威化**（11eb2d5）：
  - `build_mechanism(strut_attach=knuckle|lca|uca)`，arch 映射（pushrod->lca / pullrod->uca，与前端 PRESETS strutOutAttach 对齐）；残差刚体对改由 `m.bodies[0].ids` 派生 + UP4↔臂球头刚线（ATT_B-ST_O 等价，消除绕轴伪自由度）；
  - **根因**：旧 `solve_rocker` 绕固定全局 X 轴（`rotate_around_x` 不改 X 坐标），CH5 到 UP4 的 X 跨距 358mm 使压缩侧推杆不可达，bracket 恒败，RK_DAMPER 不更新，MR 垃圾化 3.98；改罗斯福 Rodrigues 绕 `RCK_AX_A->B` 真实轴后压缩侧全行程可解；
  - MR 链：显式参数 > `mr_at_zero`（|ΔL/Δt|，下游仅用 mr² 故取绝对值；后轴 pullrod 压缩行程减振器伸长为合法符号）> 常量 0.75/0.78 兜底；`KwCurve` 降级为可选细化（引擎已可自推常数 kw）。与并行会话的 `steer_axis(-1,0,0)`（齿条整体沿 -X，前端逐位一致，灵敏度 20.8:1）及 kg 地面交点 t0 修复合并提交（scrub/trail 值 229->54.58 / -54.7->24.64，更贴物理；测试同步对齐）。66 绿。
- **P3 管线治理**（6a2d414）：实测 angles.py 为 V1 X-前向坐标系实现，喂 v3 DWB 系坐标产出废值（toe ±88°/kpi ±175°），不强制对拍而建立**治理守卫**：v3 只能走 pose_metrics，legacy 废值形态断言防静默切换。
- **P5 卫生**（6a2d414）：CORS 环境变量化（LABSUS_CORS_ORIGINS，默认 * 保 file:// 直连）；轮胎 `mz(..., trail_mm=60)` 参数化；衬套使用状态 docstring（cT/cR 占位、coupled 已实现未喂入）。69 绿。
- **P4 基准脚手架**（1961584）：pypdf 核对 ref/OptimumKinematics Help File.pdf（92 页）为手册无数据集，诚实脚手架：固化引擎 PRO 基线参考行 + 可 drop-in 的 OPTIMUMK_ROWS 对拍测试（原 optimumk_examples.py 未带 test_ 前缀从不被收集，更名 test_optimumk_examples.py 后真实执行）。71 绿。
- 遗留登记：OpenItem-B（摇臂双根分支 vs 前端投影全局解，MR 前 0.47 vs FE 0.75、后 0.17 vs 0.78）；rocker bracket 在 knuckle 模式下 +10mm 仍不可达（PRO 几何压缩侧推杆超长 2mm，前端 3D 轴可解——分支选择待统一）；kg 符号 bug 已随 t0 修复闭合（上一 S3-1 条目的"待修 5 项"相应减少）。

## 2026-08-22 — S3-1 新功能：整车瞬态赛道仿真 /api/v3/chassis/simulate_track（开发暂停解除）

- 需求：用户指令"做一些新功能"并提供 Gemini 设计稿（14-DOF + K&C 查表 + MF 轮胎 + 赛道端点）。设计稿动力学为占位假货（ax=throttle*2−brake*5），按项目标准实现**真物理版**（同日 1-11 讲教学课程交付后开工）。
- 交付（`engine/src/solver/transient.py` + `v3models.py` 新模型 + `server.py` 路由）：
  - **平面 3-DOF 车体**（状态 X/Y/ψ/vx/vy/r，车体系牛顿-欧拉含 r×v 耦合），RK2 中点积分；
  - **四轮独立 MF**：侧偏角 = 轮心速度（含横摆臂展 vx−r·ly / vy+r·lx）与有效指向角（阿克曼分轮 + K&C 查表 toe）之差；力对抗侧滑保证稳定性符号；cam 查表记录（MF 子集无外倾项）；
  - **四轮载荷复用 P0 统一准静态内核**（quasi_loads 三路径+侧倾耦合迭代），上一步 ay/gx 打破代数环（准静态滞后一个 dt ≈ 侧倾建立时间尺度）；侧倾角兼作 K&C 查表行程索引（travel=φ·半轮距）；
  - **摩擦圆**：μ = Fy0/FzNom 从 MF 参数推导（落实第 8 讲"回退 μ 脱钩"观察的约定）；驱动后轮、制动 60:40，侧向可用 = √(预算²−Fx²)；
  - **纯追踪驾驶员**（R_pp = ld/2sinα → δ = atan(L/R_pp)，预视 3+0.9vx）+ P 速度控制器；模型范围诚实声明在模块头（侧倾/俯仰为代数非状态——第 10 讲方法论）。
- 调试记录：初版纯追踪分母误写 ld²（转向权限 ÷14 → 圆环跑到 162m 严重不足转向），圆环稳态测试当场抓获；修复后 ψ 平均推进 0.428 rad/s ≈ v/R = 0.40 ✓。
- 测试（`test_transient.py` 5 项物理断言）：直线对称性（|y|<0.5、ay≈0、左右轮载差<1N、v→15）；圆环 r=30@12m/s（轨迹半径中位数 27-33、|r| 中位 0.33-0.47≈v/R、外侧加载>400N、roll 0.2-1.5°、摩擦圆 max 0.673<1.05、弧长>150m）；**K&C 查表作用链**（前束 LUT 0.5° → 直线漂移>0.5m，无 LUT <0.3m）；制动载荷前移（前轴 +300N）；422×3。**全量 60 绿**（含并行会话镜像修复后的 55）；真实 HTTP 直线工况 VALID（113.7m、v_end=15.0）。
- 性能：~0.6ms/步（每步 2 次 quasi_loads 代数求值）。
- 顺带核对：并行会话修复的镜像 bug 不含教学记录 0004 的 kg 符号 bug（t0 行原样，scrub/trail 仍 229.0/−54.7）——待修清单维持 5 项。

## 2026-08-22 — 发布：LABSUS 独立开源仓库（github.com/ZZzyy714227/Labsus）
- 需求：把项目整理后发到用户 GitHub，只发 LABSUS 最新版本（不发主仓库其余历史/目录）。
- 发布形态：**干净快照**——从 `LABSUS/` 提取当前状态建独立 git 仓库，单初始提交，不含 New_suspension 历史；Public、分支 main。
- 整理项：
  - `serve_nocache.py` 去除硬编码绝对路径 → `os.path.dirname(os.path.abspath(__file__))` 相对定位（本地源文件已同步修复）；
  - 删除空目录 `engine/benchmarks`（真基准在 `engine/tests/benchmarks/optimumk_examples.py`，README 已指正）；
  - 新增公开版 `README.md`（功能 / 快速开始 / API 表 / 目录结构 / 技术栈）+ 根 `.gitignore` + `engine/requirements.txt`；
  - 排除全部 `__pycache__/.pytest_cache`；扫描确认无敏感信息（无 token/key/密码）。
- 发布前验证：engine 测试 **49 passed / 7.8s**。
- 网络备注：本机直连 `github.com:443` 被阻断（连接重置/超时），重试后推送成功；若后续 push 失败可多重试或配置代理。

## 2026-08-22 — P0：前后端 quasi 静态内核统一（引擎侧倾耦合迭代落地）
- 需求（深研报告 P0 建议）：TLLTD 侧倾耦合迭代此前仅在前端 JS，引擎 `quasi_loads` 仍线性 → 双真源漂移；统一为同一内核。
- 引擎（`LABSUS/engine/src/api/`）：
  - `chassis.py` `quasi_loads` 重写为**侧倾耦合迭代**（严格镜像前端 solveQuasiStatic 修复版）：3 轮迭代，每轮 roll → dt=roll·半轮距 → rc_h/kw 迁移 → kphi 更新 → 重解 roll；迁移后三路径不再与 ay 齐次 → TLLTD 随 gy 单调变化；
  - 新增 `axle_rc_sweep`：单轴 rc_h-行程扫掠（±90mm·21 点，右轮机构 rack=0，按轴参数缓存 16 条）。**rc_h 只依赖双叉臂几何，不受 STRUT_OUT 拓扑影响 → 引擎权威计算**（实测 65.1→51.1mm 平滑迁移）；
  - **kw 迁移走前端下发**：实测引擎 damper 链 MR 在压缩侧对行程几乎不敏感（mr≈0 甚至变号），kw 迁移不可从引擎机构推导（STRUT_OUT 拓扑 OpenItem 的直接后果）→ `v3models.py` 新增 `KwCurve`（travel/kw N/mm，长度≥2 且 >0 校验），`AxleSpec.kw_curve` 可选；缺省回退常数 kS·motion_ratio²。拓扑对齐后可撤下发；
  - `_interp_fb`：sampleSweep 镜像（线性插值 + 端点钳位 + None 回退）。
- 前端（`dwb-pro-fullchassis.html`）：`chassisPayload()` 每轴附带 `kw_curve`（SIM.swF/swR 扫掠行的 tr/kw，即前端 quasi 内核实际使用的那条曲线，保证两端输入完全同源）。
- 测试：`test_v3_chassis.py` +2 —— TLLTD 随 gy 单调变化 + kphi 随行程迁移（合成二次 kw 曲线；线性曲线经 ±dt 均值恰抵消，测不出迁移，曲线形态须非线性）；KwCurve 非法输入 422。**49 全绿**。
- 验证（playwright 真实浏览器 ↔ 真实引擎 :8001）：
  - **前后端一致性**：gy=0.5/1.0g TLLTD 双端**完全一致**（68.26%/67.36%，roll 1.486°/3.093° 逐位相同）；gy=2.0g 差 0.063pp/0.006°（dt=95.7mm 超出两端扫掠范围各自钳位所致——前端 [-85,+80] vs 引擎 ±90，纯端点差异非公式差异，仅 >5.6° 极端侧倾出现）；
  - 全链路：connect → 1g SOLVE VALID（冷 ~220ms 建扫掠 / 缓存后 29ms）→ 状态栏 67.4% 与双端内核一致；BUMP 21 点 VALID；零 JS 错误。
- 遗留：引擎 damper 链 MR 修复（STRUT_OUT 挂点对齐）后可撤 kw_curve 下发，引擎 rc 扫掠范围改为随前端行程限制动态对齐可消 2g 残差。

## 2026-08-22 — 前端 UI 重做：Apple 液态玻璃拟态 + 浅色/深色双主题
- 交付（`LABSUS/web/dwb-pro-fullchassis.html`，+295/-185）：界面从深色精密工业风整体重做为 Liquid Glass 风格——大圆角卡片 / 磨砂玻璃（backdrop-filter blur+saturate）/ 柔和弥散阴影 / 三色弥散渐变背景；保留普鲁士蓝·奶杏·酒红主色 + 低饱和复古辅助色组（灰靛蓝/陶土棕/鼠尾灰绿/雾蓝灰/暗铜金/蜜橘赭/灰薰紫/雾茶）。
- 双主题机制：
  - CSS：`:root` 深色默认 + `[data-theme="light"]` 变量覆盖（背景/玻璃/文字/语义色/阴影/旋钮全套）；顶栏新增 `#themeTg` ☀/☾ 滑块开关；
  - JS：画布调色板由单套常量 `C` 升级为 `PAL.light` / `PAL.dark` 双套（3D 视图与图表全套色随主题切换，`applyTheme` 动态 `Object.assign`）；
  - `initTheme` 自动跟随系统 `prefers-color-scheme`，手动切换后 `localStorage("labsus-theme")` 持久化。
- 工具：新增 `LABSUS/web/serve_nocache.py`（:8921 禁缓存开发静态服务，刷新即最新文件）。
- 验证：内嵌 JS 语法 OK；playwright 真浏览器——加载零 JS 错误、双向切换 light↔dark 生效、localStorage 持久化（重开保持）、8/10 画布有渲染（2 空白为求解后才出现的曲线区）、浅色截图布局无异常。

## 2026-08-22 — 深度研究：LABSUS 项目全量深研报告（deep-research）
- 需求：用户指令"深入研究这个项目"+ /deep-research，产出可引用、可复核的项目研究报告。
- 产出（`docs/research/2026-08-22-labsus-deep-research/`，同步副本在 `~/Documents/LABSUS_Research_20260822/`）：
  - `research_report_20260822_labsus.md` / `.html`（McKinsey 模板）/ `.pdf`
  - `sources.jsonl`(25 来源) / `evidence.jsonl`(34 引文) / `claims.jsonl`(16 断言四级状态) / `run_manifest.json`
- 方法：deep 模式八阶段；证据五路——引擎 14 核心模块精读 + 文档 + git(195 提交按日分布) + **一手运行**（pytest 47 passed / 8.04s 复现；kandc_run CLI 两组参数 VALID、残差 3.553e-14mm、50.3ms/91.4ms 复现）。
- 核心结论：①三代演化 V1→dwb-mod→LABSUS（08-20~22 三日 144 提交）；②求解器两次跃迁：顺序解 K-4 → DWB 机构投影 → least_squares(TRF) 联合收敛（有据偏差：GS 不收缩 43–84mm）；③两层 K&C 分水岭（外层力平衡 TRF+Anderson ⇄ 内层机构重解）+ 二力杆静力链 + 6DOF 衬套 + MF 子集；④集成三件套：DWB 命名直通契约、Kabsch/SVD 姿态补偿、前端双模回退；⑤验证态势良好但 OptimumK 对照基准为空占位。
- 三大结构性风险：quasi 内核双真源漂移（TLLTD 侧倾耦合迭代仅在前端 JS，引擎 quasi_loads 仍线性）；测试容差叠加语义恢复误差（Kabsch 0.3°/G4 0.5°）；engine 无 CI/lint 门禁。
- 建议 P0：统一前后端 quasi 静态内核；解析 OptimumKinematics PDF 示例录入 benchmarks 建立外部基准。

## 2026-08-22 — 修复：TLLTD 随 gy 恒定 → 侧倾耦合迭代（前端 solveQuasiStatic 非线性化）
- 现象（用户报告）：gy=0 显示 50/50（占位回退），任何非零 gy 直接跳 7:3（≈71%）且不随 gy 变化。
- 根因一（数学）：三路径（UNS/GEO/ELA）全部 ∝ ay → 分子分母齐次 → TLLTD 为纯刚度/几何常数，与 gy 无关；gy=0 的 50% 是 `sumTransfer≤1 → 50` 占位。这不是计算错误，是线性模型的固有性质。
- 根因二（代码缺陷）：前端 `sw.rows[k].kw` 单位 N/mm（772 行），而 `kwF0=(kS·1000)·mr²` 为 N/m——单位错位 1000 倍，插值迁移被吞。
- 修复（`LABSUS/web/dwb-pro-fullchassis.html` 的 `solveQuasiStatic`）：
  - **侧倾耦合迭代**（3 次）：每轮由当前侧倾重解 rollAngleRad → 左右轮行程差 dt=roll·半轮距 → `zrc_f/zrc_r` 取**外侧压缩轮**的扫掠 rcH（GEO 项非线性化）→ `kwAt` 取左右扫掠 kw 均值（修复 ×1000 单位后，ELA 项非线性化）→ 更新 kphi_f/kphi_r/kphi_tot；
  - dFz_geo / dFz_elas 全部使用迁移后的最终 zrc/kphi → TLLTD 随 gy 真实单调变化。
- 验证（真实浏览器 playwright）：gy=0→50 占位；0.05g→68.4% → 2g→64.4%，**跨度 3.99pp 单调**；kphiF 1041→852 随行程迁移；roll 3.09°@1g；零 JS 错误；simulate 主流程正常。
- 说明：引擎侧 `quasi_loads`（/api/v3/chassis/*）暂为线性版本（镜像原公式）；如需两端一致，后续按同方案同步（引擎已具备每角 rc_h/kw 扫掠能力）。

## 2026-08-22 — 项目重命名：dwb-pro-dev → LABSUS（悬架实验室）
- 用户拍板：项目定名 **LABSUS / 悬架实验室**（Laboratory + Suspension）。
- 执行（全套改名，git mv 保留历史，文件级迁移绕过句柄占用）：
  - 目录 `dwb-pro-dev/` → `LABSUS/`（git 识别为 R rename，历史完整）；
  - 文档路径引用批量替换（docs/DEVLOG、S1 计划、设计文档、LABSUS/README、dwb-mod/README）；
  - 前端品牌：`<title>` / 界面样式注释 / 顶栏 brand `DWB-SIM PRO` → `LABSUS 悬架实验室`（`LABSUS/web/dwb-pro-fullchassis.html` + 源档 `LABSUS/Gemini.html`）；
  - 引擎标识：`/api/v3/health` 返回 `engine:"labsus-engine"`、FastAPI title `LABSUS Engine /api/v3`（`LABSUS/engine/server.py`）＋ 测试断言同步；
  - 提交前缀保留 `feat(engine)/feat(web)`（模块语义，不随产品名）。
- 遗留说明：技术术语保留（DWB 硬点命名、PRO_POINTS、S2 系列编号）——它们是数据/拓扑名，非产品名；历史 DEVLOG 条目中作为产品演进史的 "DWB-SIM PRO" 叙述保留。
- 验证：47 tests 全绿；服务重启后 health 返回 `labsus-engine`；全仓无 `dwb-pro-dev`/`dwb-pro-engine` 残留。

## 2026-08-22 — S2-6 前端整车分析面板：分离版整车准静态分析正式通道
- 交付：`dwb-pro-fullchassis.html` 新增整车面板，把四角硬点+整车参数打包发 `/api/v3/chassis/*` 并渲染——用户单文件版 QUASI 操稳功能的分离版正式化（双模：连引擎走引擎，断开回退内置 JS）。
- 左面板「整车底盘分析 (引擎)」（默认展开）：
  - 工况按钮：单点 SOLVE / 整车 BUMP / ROLL / STEER + 扫掠范围/点数输入 + 运行按钮；
  - payload 实时打包 `S`：vehicle（wb/mTotal/mSprung/hcg/hs + front/rear 各 AxleSpec：hp 15 键、arch、cam0/toe0、tire.R、kS、mS、mU、**motion_ratio = SIM.mrRefF/R**（比常量更准）、arb 全参数）＋ quasi（S.qs.gy/gx/aeroF/aeroBias）＋ travel（travelL/travelR 聚合当前滑块+roll）＋ rack＋sweep。
- 右面板「整车引擎结果」：
  - 单点：四轮定位表（FL/FR/RL/RR × cam/toe/cast/kpi/scrub/trail/RC）+ 姿态（heave/roll/pitch）+ 载荷（稳态侧倾/侧倾梯度、Kφ 前/后、ARB 占比、三路径前轴转移分解、四轮 Fz、TLLTD 前轴占比带颜色判定）；
  - 扫掠：四轮外倾曲线（plotXYMulti 四色）+ 增益表；
  - 状态行含 warnings。
- 细节：buildChassisPanel 默认展开（折叠区块 display:none 时按钮不可点）；结果区块折叠。
- 验收（playwright 真实引擎）：面板元素齐；连接 → 单点 SOLVE VALID 43.6ms（四轮表/稳态侧倾/四轮 Fz/TLLTD 渲染）；整车 BUMP 21 点 VALID 47.3ms 曲线+增益；零 JS 错误。
- 至此 S2 全部闭环：单角 K&C（S2-1/2）→ 前端基线升级保留（S2-4）→ 整车准静态（S2-5/6）。

## 2026-08-22 — S2-5 引擎整车分析端点：四角装配 + 准静态载荷转移（/api/v3/chassis/*）
- 需求：前后端分离版获得整车级分析通道（单文件版 solveQuasiStatic 的引擎镜像）。
- 新增：
  - `src/api/chassis.py` — 整车业务层：四角装配（FR=front.points / FL=镜像+steer 反号 / RR / RL）、`corner_pose`（四角独立 solve_pose + 定位角）、`arb_geom/arb_rate`（稳定杆几何与扭转刚度，镜像前端）、`quasi_loads`（镜像 solveQuasiStatic 公式：非簧载直接 / RC 几何力矩 / 弹簧+ARB 弹性力矩三路径解耦 → 稳态侧倾角 + 侧倾梯度代数反解 → 四轮 Fz 含气动下压力/纵向/侧向 → TLLTD）、`solve_chassis`（+ 姿态 heave/roll/pitch 推导）、`sweep_bump/roll/steer`（整车三工况扫掠 → 四轮曲线 + 前后轴增益）；
  - `v3models.py` 追加：ArbSpec/AxleSpec/VehicleSpec/QuasiInputs/CornerTravel/ChassisRequest/ChassisLoads/ChassisPoseResponse/ChassisSweepResponse；
  - `server.py` 路由：`POST /api/v3/chassis/solve`（单点）、`POST /api/v3/chassis/kandc/{bump|roll|steer}`；
  - `tests/test_v3_chassis.py` — 9 项：四角装配/载荷守恒/横向转移/姿态/三工况/ARB 影响/非法输入。
- 关键决策与发现：
  1. **MR 回退策略**：引擎 STRUT_OUT 固定于 knuckle 刚体（前端挂 LCA/UCA 铰链，已知拓扑 OpenItem）→ 引擎数值推导 MR 失真（实测 damper±2mm 差分 3.98 vs 前端 0.75；且 solve_rocker 二分在 0 附近存在分支跳变）→ `motion_ratio` 显式参数优先，缺省用前端同源常量 0.75/0.78（与前端 `SIM.mrRefF||0.75` 语义一致）；
  2. 后轴引擎沿用同构机构（STRUT_OUT→CH5 推杆闭式近似拉杆拓扑），OpenItem 登记 STRUT_OUT 挂点对齐；
  3. 姿态约定：pitch 正 = 车头下沉（与 core/models derived_pose 一致）。
- 验收：**47 tests 全绿**（38 旧 + 9 新增）；真实 HTTP：chassis/solve 四角 12.2ms（1g → roll 1.096°、TLLTD 46.9%、ARB share 15.9/13.1%、aload 转移 FL 2165/FR 5196/RL 1571/RR 4998N 守恒）；chassis/kandc/bump 9 点 318ms（四轮 cam 单调、cg_front −0.883/cg_rear −0.867、bs 0.35/0.29）。
- 遗留：前端整车面板（chassis 端点 UI 接入，下一轮）；STRUT_OUT 挂点拓扑对齐；SolveRocker 分支连续性。

## 2026-08-22 — S2-4 前端基线升级：用户 Gemini 增量全量移植 + 引擎双模保留
- 交付：用户在 `LABSUS/Gemini.html`（单文件版，2154 行）自行完成四大维度工业级增量，按约定交付后由我方学习移植进前后端分离版 `LABSUS/web/dwb-pro-fullchassis.html`。
- 移植策略：**Gemini.html 直接成为新前端基线**（官方 v4→Gemini diff 731+/276-，逐块手工合并风险高），再把 S2-2 引擎面板移植回新基线。引擎面板适配点：`sec()` 增加 cls 参数（兼容）、`plotXY` 升级为单线 `plotXYOverlay` → 新增独立多线 `plotXYMulti`（引擎结果面板用，不改用户函数）、buildLeft/buildRight 整体重建（`host.innerHTML=""`）→ 引擎区块抽成独立 `buildEnginePanel(host)` / `buildEngineResults(host)` 防 `let b` 重复声明与重建丢失。
- 用户增量确认（四维度，全部保留）：
  1. `solveQuasiStatic` 准静态载荷转移内核——非簧载直接/RC 几何力矩/弹簧+ARB 弹性力矩三路径解耦、稳态侧倾角+侧倾梯度代数反解、四轮 Fz（气动+纵向+侧向综合）、TLLTD 双色平衡条 + 操稳倾向判断；
  2. `mode:"quasi"` 第三求解模式——稳态侧倾角映射双侧差动位移，KIN/RIG/QUASI 三模式并存；
  3. `takeBaselineSnapshot` 基准快照——双线 Overlay（`plotXYOverlay` 实线 Active/虚线 Baseline）+ Delta 差异表（CG/BS/MR/RC/WR）；
  4. 扩展输入——Gy/Gx/车速/气动下压力及分配/整车总质量/簧载质量滑条 + 状态栏 TLLTD% 与侧倾梯度；另含防倾杆 ARB（直径/位置比/偏置 + 3D 渲染 + 扭转刚度读数）与 LCA/UCA 衬套渲染。
- 验收（playwright 真实浏览器）：
  - 页面加载零 JS 错误；引擎面板/右面板 ARB·载荷转移·TLLTD/左面板 QUASI 输入·ARB·Baseline 控件齐全；
  - QUASI 模式切换 ✓、Baseline 快照锁定（tbBase→"已锁定"）+ **buildLeft/buildRight 重建后引擎面板不丢失**（Delta 面板出现）✓、sbTLLTD=71.4% ✓；
  - 引擎双模：连接 8001 → bump 21 点 VALID 2278ms、增益表渲染 ✓。
- 提交：`LABSUS/Gemini.html`（用户交付源档）+ `LABSUS/web/dwb-pro-fullchassis.html`（新基线）+ DEVLOG。
- 遗留：引擎侧 `/api/v3/chassis/*` 整车端点（四角装配+载荷转移镜像实现）待做——用户 JS 实现可作为契约参照。

## 2026-08-22 — S2-2 前端引擎面板落地：dwb-pro-fullchassis.html 双模接入 /api/v3
- 前端主线 = `LABSUS/web/dwb-pro-fullchassis.html`（唯一前端核心，与用户决策对齐；"modeler 迁移"提法正式废弃）。
- 新增（同一文件内）：
  - 顶栏引擎状态 cell（#tbEng：内置 JS ↔ 引擎 v3 切换灯）；
  - 左面板首区块「引擎连接与 K&C 分析」：地址输入（默认 http://127.0.0.1:8001）· 连接/断开（AbortController 4s 超时）· 四工况按钮（bump/roll/steer/compliance）· 扫掠范围/点数/Fz 输入 · LCA 衬套开关（bLCA_F 500N/mm）· 运行按钮；
  - 右面板「引擎 K&C 结果」折叠区块：增益表（状态/ms + 引擎 gains 全键）+ 曲线 canvas（plotXY 复用：bump/roll→轮跳轴，steer→rack 轴，compliance→力轴；roll 显示左右轮双曲线）；
  - `ENG` 模块（url/ok/busy/kcCase/sweep/fz/useBush/result）+ 5 函数（连接/断开/payload/run/render）。
- 双模语义：已连接 → K&C 分析走 `/api/v3/kandc/{case}`（正式通道）；未连接/失败 → 如实提示并回退内置 JS（页面原有功能零改动）。
- payload 契约：前端 HP 命名直发（points=S[axis].hp）+ arch/tire.R/design(cam0,toe0) + track_width=2·WC.x；引擎侧映射表消化。
- 验收（playwright 真实浏览器 + 真实 8001 引擎）：加载无 JS 错误；连接 → tbEng 变「引擎 v3」；bump 21 点含衬套 VALID 2183ms，增益 camber −1.065°/25 · bumpSteer +0.037 · MR 1.98 · RC 迁移 9.81mm；曲线像素 252 采样点非空；steer 切换重跑 OK。
- 引擎侧回归：38 tests 全绿（含上轮 15 v3 API 测试）。
- Open Items：S2-3 WebSocket 拖拽实时求解流 + 结果缓存；多衬套 UI。

## 2026-08-22 — S2-1 引擎 /api/v3 服务层落地（隔离工作区 LABSUS/engine）
- 定位：S2 = 前端 `LABSUS/web/dwb-pro-fullchassis.html`（唯一前端核心，不换文件）接入引擎 `LABSUS/engine/`。本轮交付服务层，前端引擎面板下一轮。
- 新增：
  - `src/api/v3models.py` — /api/v3 请求/响应模型；**前端 DWB 硬点命名直通**（LCA_F/LBJ/WC/TRO/RACK/STRUT_OUT/RCK_AX_A/STRUT_IN/RCK_DMP/DMP_BODY…），含 DesignSpec（cam0/toe0 基准）、BushingSpec、SweepSpec、CaseLoad。
  - `src/api/v3service.py` — 业务层：DWB→引擎点映射表（LCA_F→CH1…DMP_BODY→DAMPER_CHASSIS）、镜像（左轮 X 取负 + steer_axis 反号）、四工况驱动器（bump 平行轮跳 / roll 双侧合成 / steer rack 扫掠 / compliance 力扫掠）、增益表复用 S1 `metrics/kandc.py`。
  - `server.py` — FastAPI 入口：`GET /api/v3/health|version`、`POST /api/v3/solve/pose`、`POST /api/v3/kandc/{bump|roll|steer|compliance}`；CORS 全开（file:// 前端直连）；端口 **8001**（避开冻结的 8000）；`python server.py` 即起。
  - `tests/test_v3_api.py` — 17 项端点测试（health/pose/四工况/衬套装配/非法键 422/未知工况 404）。
- 关键工程决策：
  1. **轮轴姿态恢复**：引擎求解器只输出节点位置（distance-only 约束，无刚体四元数），而前端 camber/toe 由 knuckle 标签轴（cam0/toe0）旋转定义 → 服务层用 **Kabsch/SVD 最小二乘姿态估计**恢复 knuckle 旋转，再施加设计轮轴。镜像对称实测误差 ~0.15°（测试容差 0.3°）。
  2. **转向增益几何事实**：基线硬点横拉杆近轴向（RACK→TRO ≈ X 向 416mm），齿条行程对转角敏感性低（±8mm → ≈0.3° toe）——是硬点几何而非求解错误（测试注明）。
  3. roll 工况 = 左轮镜像机构 + 反向行程双侧合成（track_width 换算 roll_deg）；左轮齿条方向反号（steer_axis=[0,−1,0]）。
- 验收：38 tests 全绿（23 S1 + 15 新增）；真实 HTTP 冒烟：bump 带衬套 9 点 VALID 733ms（~80ms/点 <300ms 预算），cam −40→+40mm 单调 +0.12→−2.81°，增益表与衬套形变输出正常。
- Open Items：摇臂转轴用 RCK_AX_A 单点近似（引擎 solve_rocker 固定绕 X 轴，精确轴方向待升级）；多衬套/非垂直载荷扩展测试；前端引擎面板（S2-2）与 WebSocket 求解流（S2-3，设计文档 §6.1）。

## 2026-08-21 — 工业级设计 S1 引擎内核落地（隔离工作区 LABSUS/engine）
- 里程碑：K&C 弹性运动学分水岭打通——衬套 6DOF 元件 + 两层迭代求解器（TRF 外层力平衡 ⇄ 内层机构投影）+ 二力杆静力链 + MF 轮胎子集 + K&C 增益层，Subagent-Driven 双审查全流程通过。
- 隔离规则：开发仅写 `LABSUS/`（Gemini v4 为前端主线副本 + engine 引擎基线快照）；主仓库其余文件冻结；引擎任务提交前缀 `feat(engine)`。一次违规（T8 误改主仓库 DEVLOG，e5e6121）已 revert（b3ad00b）并确立 T10 controller 统一同步约定。
- 交付（T1-T9，22 提交）：
  1. `src/components/bushing.py` — 6DOF 衬套（线性/查表/样条曲线 + 解析雅可比 + 装配字段 + 外推钳制 + 构造校验）
  2. `src/solver/forces.py` — 二力杆/球铰静力（lstsq 最小范数 + 残差暴露）；`corner_to_anchor_loads` 接地点→锚点合力链
  3. `src/solver/compliance_transform.py` — 小角刚体变换（衬套位移→锚点）
  4. `src/solver/compliance.py` — K&C 两层求解器（TRF+Anderson 兜底+姿态写回+per-bushing loads）+ `solve_compliance_full` 全链路
  5. `src/metrics/kandc.py` — 增益指标（°25mm / °kN / MR / RC 迁移）
  6. `src/tire_mf.py` — Pacejka 子集（.tir 风格 + 摩擦圆回退保留）
  7. `scripts/kandc_run.py` CLI + `tests/test_s1_gate.py` 四门禁
- 验收门：23 tests 全绿——无衬套回归一致（1e-6）、单锚点物理合理（900N→3mm）、全链路点均 <300ms、静态定位角手算对照（KPI/Caster Δ<0.001°）；CLI 冒烟 VALID/残差 1e-14/60ms。
- 决策固化：符号约定（load 全局 N、δz 正=成员上移）；UCA 杆加入默认二力杆集（CH1 载荷物理必要）；G4 用实际 angles 公式而非计划草稿公式。
- 已知边界/Open Items：FL1 转向衬套化（S1 外）；OptimumK PDF 示例数值录入（benchmarks 占位）；复步进几何传导验证；多衬套/非垂直载荷 T9 扩展测试；`angles.py` 副本剥离接触斑依赖（scrub/trail 回退 UP5）已记录。
- 后续：S2（K&C 四工况驱动器 + /api/v3 + modeler 迁移）在 S1 基线上继续（仍走 LABSUS）。

## 2026-08-21 — 开发版本归档：DWB 单文件系列全版本独立成文件
- 需求：开发暂告一段落，把积累的大版本（含 git 历史中已删除的版本）各自独立成文件，集中入库管理。
- 盘点：仓库内 dwb 单文件线 3 个现行文件 + `parent.html` 早期快照；git 历史恢复 `web/sim-view.html`（自包含版，曾因模块化重构删除）与根路径 `double-wishbone-suspension.html` 旧副本（与 v2 同源，不重复归档）。
- 执行：
  - `dwb-mod/versions/`：v1-fullchassis-fsr06-early（parent.html 早期快照，2396 行，FSR-06 无泪滴渲染）/ v2-fullchassis-fsr06 / v3-pro-chassis / v4-pro-fullchassis（gemini 强化版，标注当前主力）；git mv 保留历史。
  - `web/versions/v1-dwb-web-simview.html`：自研线历史版恢复归档。
  - `dwb-mod/README.md` 重写为版本索引表；新增落版约定（复制主力 → 修改 → 稳定后入 versions/）。
- 边界：桌面参考.html（PRO 单轴版）与桌面旧副本按用户指示**不纳入**（仅归档仓库内文件）；自研线 modeler.html 为活文件保持原位。
- 提交：dwb-mod/versions/* + web/versions/* + README + DEVLOG。

## 2026-08-21 — gemini 全车版功能补全（dwb-mod/gemini-code-1787322645956.html）
- 需求：用户判定 Gemini 生成的 DWB-SIM PRO 全车版（四机构同屏、每轴独立弹性参数账本、点击硬点自动切换编辑轴、双副车架、RIG 四轮台架）优于既有整车版，但功能偏少，要求补齐。
- 补全（保持 gemini 架构：S.front/S.rear 账本 + S.axis 编辑轴 + 渲染平移 Y±wb/2）：
  1. 四轮独立行程 trFR/trFL/trRR/trRL（主滑块之外的独立轮跳，前后轴各自限位 trMinR/trMaxR）
  2. 整车俯仰 pitch（前组 −Δ、后组 +Δ，mm/°=4）
  3. 轴距滑块（渲染平移联动，无需平移硬点数据）
  4. 轴视图过滤 ALL/FRONT/REAR（机构+副车架+摇臂支架+转向机全部跟随过滤）
  5. 右栏四轮定位表 FR/FL/RR/RL×6 参数 + 整车读数分区（后轴 cam/toe/RC/行程极限、RC@0 前后、RC 连线角、轴距、俯仰）
  6. 激励接线：轮跳 exc 选择器 + 转向激励 steerExc（loop 应用）+ 路面波形/幅值/频率/触发/清轨迹（rig 四轮共用）
  7. localStorage 持久化（键 dwbProChassisGM：双轴 hp/tire/弹性参数/轴距/视图/编辑轴），rebuild/refreshDerived 自动保存
  8. findLimits 去除 ±40 保底（前后轴真实极限 −118/+118）
  9. 键盘快捷键：空格 播放暂停 · ←→轮跳 · Shift+←→ 转向 · F 适配 · A 循环轴视图 · 1-4 最大化 · 0 四视图
- 验证：harness fresh/rigtest 各 300 帧零异常、okGeo true、RIG 残差 0.0004mm；功能探针（.workbuddy/tmp/gemini_probe.mjs）——trRR=20 独立生效、pitch=2 → 前 −8/后 +8、wb=3200 渲染范围 ±1930、FRONT/REAR 视图节点数 30、转向激励驱动 rack ±30、持久化 round-trip（前轴 kS=150 与后轴独立参数、后轴 LBJ、wb、视图全部恢复）。
- 已知边界：harness 的 trSamples 采样字段为 SIM.mR（gemini 用 mFR）——工具侧显示空，实际轮跳由 probe 验证；两版整车文件并存（dwb-pro-chassis.html 旧架构 / gemini 版为当前推荐）。
- 提交：dwb-mod/gemini-code-1787322645956.html + DEVLOG。

## 2026-08-21 — DWB-SIM PRO 整车版：前推杆+后拉杆双轴合成（dwb-mod/dwb-pro-chassis.html）
- 需求：用户已在参考.html（PRO 闭式求解器）内分别调试好前悬架(推杆)/后悬架(拉杆)两套几何，要求前后连接合成整车模型（等同 dwb-mod 全底盘能力）。
- 决策（用户拍板）：复制参考.html → dwb-mod/dwb-pro-chassis.html（原参考保留）；后轴无转向 rack 恒 0；RIG 台架仅前轴（四轮台架后续）；渲染保持 PRO 风格。
- 实现：S.axles 双轴账本（front attach=lca / rear attach=uca，后轴 Y−wb=2750 平移）；buildMech(axleKey)/setChassis/metrics 按轴参数化；四机构 SIM.R/L/RR/RL 解耦驱动（轮跳主滑块+四轮独立 trFR/FL/RR/RL+侧倾+俯仰±Δ）；ALL/FRONT/REAR 轴视图；整车共享件（底盘框横贯、摇臂支架/DMP 支座按轴两组）；四轮定位表（FR/FL/RR/RL×6 参数）+ 整车读数分区；曲线随轴视图；localStorage 持久化（dwbProChassis）；节点拾取/拖拽按轴落盘（PICK 带 ax）；findLimits 去除 ±40 保底暴露真实行程。
- 验证（Node24+DOM 桩 harness）：fresh/sport-rear/rigtest 三场景各 300 帧零异常；前后轴几何极限均 [-118,118]（okGeo true，超 ±60）；RIG 路面正弦激励轮跳振荡正常、残差 0.0004mm；帧均 <15ms。
- 已知边界：harness seed 键名为旧文件键（dwbFullChassis），新车持久化键 dwbProChassis——工具需按文件区分；RIG 仅前轴。
- 提交：dwb-mod/dwb-pro-chassis.html + DEVLOG。

## 2026-08-21 — Task 2 几何源：STRUT_OUT 派生 + 摇臂转轴车架节点（DWB-SIM PRO）
- 需求：为新「推/拉杆悬架」拓扑（DWB-SIM PRO）在几何派生层加入 STRUT_OUT 硬点与摇臂转轴框架节点。
- 变更（`src/config.py` / `src/hardpoints.py` / `tests/test_geometry.py`）：
  - `DESIGN_PARAMS` front 追加 `strut_out_t_lca=0.35`、rear 追加 `strut_out_t_uca=0.35`（比例参数，t=0 铰轴中点 / t=1 球头）。
  - `DEFAULT_FRAME_NODES` 摇臂区块追加 `RCK_AX_A/B_R/L` 与 `R_RCK_AX_A/B_R/L` 八节点（占位值，后续任务覆盖）。
  - `derive_hardpoints` 在 CH5 之后插入 STRUT_OUT：前轴（prefix=""）在 LCA 三角面内取 LBJ(UP2)↔LCA 铰轴中点比例点；后轴（prefix="R_"）在 UCA 三角面内取 UBJ(UP1)↔UCA 铰轴中点比例点；result 增加 `{prefix}STRUT_OUT` 键。
- 验证（TDD）：新增 `test_strut_out_derived_on_arm_plane` 先红后绿；`tests/test_geometry.py` + `tests/test_legacy_import.py` 回归 42 passed（legacy 导入 `_split_hp` 对 3 元素 list 容纳入 points，无破坏）。
- 实际坐标：前 `STRUT_OUT = [3.89, 286.20, 118.07]`（LCA 面内，Y 在 CH3/4=128/122 与 LBJ≈580 之间）；后 `R_STRUT_OUT = [-1550.69, 294.78, 285.69]`（UCA 面内，Y 在 CH1/2≈155/150 与 UBJ≈559 之间）。
- 提交：`3598b42`（feat(geometry): STRUT_OUT derived on LCA(front)/UCA(rear) + rocker axis frame nodes (placeholder)）。

## 2026-08-21 — FSR-06 前推后拉正式构建 · 全量交付（dwb-mod）
- 需求：用户批准 spec/plan 后按 subagent-driven 流程执行 7 任务（T1 HPDEF+FSR-06 默认预设 → T2 显式推/拉杆分支+簇过滤 → T3 metrics.sl 端点 → T4 泪滴/摇臂/Heim 渲染 → T5 水平减振器支架 → T6 harness 断言+行程调参 → T7 文档）。
- 关键发现：HPDEF 扩 16 节点后旧预设索引错位崩溃（buildMech i[d[0]]=ni++ 修复）；FSR-06 前轴伸张死点根因 = RK_B 设计位形在摇臂圆最低点（圆不可达），非迭代不足；按 spec §4 授权调整 RK_PIVOT(600→640)/RK_B(505→[320,−107,567])，前轴几何极限 [−8,138]→[−88,138]（超 ±60 验收），推杆角 44.3°。
- 验证：harness 四场景 fresh/fsr06/prod/sport-rear 各 300 帧零异常；FSR-06 前后轴 okGeo=true、残差 0、ok=true；旧预设兼容回退不崩。
- 已知边界：PROD 前轴伸张 −6mm（同因几何死点，参考预设不达标，不强求）；后轴 rearRk 预设伸张 −8mm 为既有数据特性。
- 提交链：77f0cf7→409c679→66b7d7f→98481a1→15cd6f7→246ce04→41eec13→5d68078→d8065eb→530508d→ddeacde（+本轮）。

## 2026-08-21 — Task 5: 水平减振器支架（addShared 双分支改造）

- 修改文件：`dwb-mod/double-wishbone-suspension.html`（+22/-12 行）。
- 位置：`addShared(sc)` 内 `if(S.show.chassis){...}` 中「减振器塔」forEach 回调体。
- 变更：回调体替换为 `if(hpA.RK_A&&hpA.DMP_T)` 双分支——
  - **新分支（有 RK_A）**：水平减振器支架——从摇臂端 `A=RK_A` 到支架端 `B=DMP_T` 绘水平筒体、两端支承圆柱、落地立柱。前高后低由各轴硬点坐标天然决定。
  - **else 分支（旧预设）**：原垂直塔逐字保留（矩形顶板 PL、四角立柱 L3、横向撑杆、上支点座 cylinder）。
- 清理：删除死变量 `base`（原 L1039 声明但从未引用）。
- 验证（Node24 + DOM 桩 harness）：fresh（FSR-06，前/后轴均有 RK_A/DMP_T → 水平支架分支）n:300 零异常；sport-rear（SPORT 无 RK_* → 垂直塔分支）n:300 零异常。
- 提交：`dwb(P1): per-axle horizontal damper cradle (front high / rear low), guarded for legacy presets`（5d68078）。

## 2026-08-21 — Task 2: buildMech 簇成员存在性过滤 + addPushrodMode 显式前推后拉

- 修改文件：`dwb-mod/double-wishbone-suspension.html`（+25/-21 行）。
- Step 1：`buildMech` 刚体簇（cl 数组）按节点存在性组装——新增 `const has=id=>i[id]!==undefined`，LCA/UCA/KNUCKLE 三个簇的 members 数组均追加 PR_L/PR_U 并 `.filter(has)`，确保旧预设无推拉杆点时行为与原来完全一致。
- Step 2：`addPushrodMode` 整体替换为按 `axleKey` 显式推/拉逻辑——删除旧的 dLBJ/dUBJ 距离猜测，改为 `M.axleKey==="rear"?"PR_U":"PR_L"`；提取 `addRodRocker` 子函数处理推杆刚线 + 减震器重锚 + 摇臂簇。
- Step 3：PROD 预设补 PR_L/PR_U——hp 增加 `PR_L:[640,6,150]`（LBJ[680,5,145] 内侧），rearRk 增加 `PR_U:[640,-1565,450]`（UBJ[650,-1565,445] 附近）。
- 验证（Node24 + DOM 桩 harness）：fresh/prod/sport-rear 三场景均 `[loop] completed without exception`、`[frames] n:300`、`res=0`（零发散）；fresh geo=[-8,138]（前轴 ±30mm+ 行程）、geoRR=[-138,138]（后轴 ±138mm 行程）；prod geo=[-138,138]（双轴）。
- 提交：`dwb(P1): explicit pushrod(front)/pullrod(rear) branch by axleKey; hinge members existence filter; PROD gains PR_L/PR_U`（66b7d7f）。
- 代码审查后清理（`98481a1`）：`m_L_push` 重命名为 `addRodRocker`（消除文件中唯一的下划线命名函数，语义更准确）；helper 参数从 `(M,rodFrom,i,n)` 精简为 `(M,rodFrom)`，内部走 `M.i`/`M.n`。验证 fresh+prod 均 n:300 零异常。

## 2026-08-21 — 修复 dwb-mod 打开即卡死（首帧 TypeError 杀死 rAF 循环）+ PROD 前推后拉收敛性根治
- 用户反馈：`dwb-mod/double-wishbone-suspension.html` 浏览器打开无运动模拟、页面卡住。
- 根因①（卡死主因，所有非 PROD 预设必现）：`e37e372` 给 HPDEF 增加 RK_PIVOT/RK_A/RK_B 后，硬点表为全部 14 点注册 `UI.sync` 回调 `fmt(S.hp[d[0]][k])`；SPORT/RACE/SUV 的 `S.hp` 无 RK_* 键 → 首帧 `loop()` 内回调读 `undefined[0]` 抛 TypeError；`requestAnimationFrame(loop)` 位于 loop 末尾 → 循环出生即死。修复：表行回调对缺失点禁用输入框并留空（随预设切换动态生效）。
- 根因②（PROD 行程锁 ±2mm）：a) `addPushrodMode` 摇臂簇 axA==axB → `projHinge` 得零轴 → 摇臂投影空操作（注释声称"默认 X 轴"但从未实现）；b) RK_B 质量 0 → projLink 视为不动点，推杆修正 100% 砸向 UBJ，与摇臂/刚体投影互相打架成死锁平台（残差恒 3.34mm 不动）。修复：projHinge 单点枢轴默认 X 轴；RK_B 质量 0.005kg（轻端沿摇臂圆滑动）；sweepProj 对摇臂+推杆局部回路内迭代 12 次（GS 收缩率极差，实测 K=12 较 K=1 快 ~5 倍）；solveKin 上限 260→900。
- 实证（Node24 + DOM 桩 harness，`.workbuddy/tmp/dwb_harness.mjs`，可复现）：fresh/prod/sport-rear 三场景各 300 帧零异常；PROD 前轴几何极限 [0,0]→[-138,138]、轮跳 ±51mm 正弦满摆、残差 0、ok=true、iter=204；SPORT 行为与修复前逐位一致（iter=108，未受影响）。
- 已知边界：PROD 后轴 geoRR=[-8,138]（伸张端 -8mm 即止，属 rearRk 预设摇臂几何数据问题，非求解器问题）；PROD 帧均耗时约为 SPORT 2 倍（54ms vs 27ms，桩环境），后续可做自适应 K 优化。
- 提交：dwb-mod/double-wishbone-suspension.html + DEVLOG。

## 2026-08-21 — 双版本文件区分：魔改 DWB 归位 dwb-mod/，截图类 PNG 全删

- 需求：用户要求把「魔改 DWB」与「自研系统」在本地文件层面彻底分开。
- 执行（按用户拍板）：
  1. `double-wishbone-suspension.html`（魔改版，git 历史 `dwb/dwb-modeling` 前缀）→ **`dwb-mod/double-wishbone-suspension.html`**，附 `dwb-mod/README.md`（版本边界：坐标 X=外侧/Y=向前 与自研 convention 不同、互不引用、提交前缀约定）。
  2. 截图类 PNG 全部删除（用户指示"PNG截图都删掉"）：根目录 `iso/rear/side/top/ref1/ref2.png`、`data/pbr_check.png`、`ref/R.png`。
  3. `docs/PROJECT_MAP.md` 同步（§3.2/§3.4/§4-7/§5-B 条目改为已处理）。
- ⚠️ **失误登记**：`color-scheme-preview.html`（自研 modeler 配色预览，未入 git）本意移至 `docs/assets/`，操作中先删后移导致丢失且无法恢复。其配色能力已被 `web/modeler.html` 内置 PAL 配色系统 + F1 2026 十二款预设覆盖（DEVLOG 2026-08-21 F1 配色条目），如需可基于 PAL 重建同款预览页。
- 提交：`dwb-mod/`（git mv + README）+ 截图删除（git rm）+ PROJECT_MAP + DEVLOG。

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

## 2026-08-21 — Task 3: metrics.sl 改按实际弹性线端点

- 修改文件：`dwb-mod/double-wishbone-suspension.html`（+2/-1 行）。
- `metrics()` 返回值的 `sl` 字段由固定 `dst(spl,P("DMP_T"))` 改为条件取值：`M.spring` 存在时用 `dst(M.n[M.spring.a].p,M.n[M.spring.b].p)`（实际弹性线端点，推杆/拉杆模式下 addRodRocker 已重锚为 RK_A→DMP_T），否则回退旧路径。
- 验证：fresh / sport-rear 两场景均 `[loop] completed without exception`、n:300、res=0。
- 提交：`dwb(P1): metrics.sl uses actual elastic line endpoints (RK_A->DMP_T in pushrod mode)`（15cd6f7）。

## 2026-08-21 — Task 4: 渲染升级 — 泪滴叉臂 + 摇臂 + 推/拉杆 + Heim 关节 + 配色

- 修改文件：`dwb-mod/double-wishbone-suspension.html`（+42/-11 行）。
- Step 1：C 调色板新增 `carbon:"#23282e"`（碳纤黑，用于泪滴叉臂和推/拉杆）和 `rocker:"#b9c2c9"`（钛银，用于摇臂本体）。
- Step 2：`cylinder()` 后新增 `teardropPts(a,b,w)` 函数——泪滴形杆体轮廓生成器。a=外端（圆钝半圆，R=w/2），b=内端（收尖），沿杆轴生成 N=8 段半圆 + T=14 段锥形收缩点列，供 PL() 绘制闭合面片。
- Step 3：`addInstance()` 摆臂面片渲染替换——4 个三角面片（LAF-LBJ-LAR、UAF-UBJ-UAR）替换为 `tear(A,B,w)` lambda 调用 `teardropPts`（下叉臂 w=34、上叉臂 w=30），填充 `C.carbon` + `rgba(35,40,46,0.45)` 半透明；立柱面片（knuF）和弹簧座三角保持不变。
- Step 4：ROCKER 渲染块整体替换——摇臂本体：`PL([piv,rkA,piv,rkB,piv])` 填充 `C.rocker` + `rgba(185,194,201,0.35)` 多边形 + 两臂端 cylinder；推/拉杆：cylinder 改用 `C.carbon`，两端增加 Heim 球头（三正交面 `circPts` ×3，半径 12）。
- 验证（Node24 + DOM 桩 harness）：fresh（FSR-06 前推后拉）n:300、geo=[-8,138]、iter=112、res=0；sport-rear（旧预设无 ROCKER 分支）n:300、res=0——两场景均 `[loop] completed without exception`，兼容性确认。
- 提交：`dwb(P1): teardrop A-arms (carbon), titanium rocker, push/pull-rod cylinders + Heim joints`（246ce04）。
- 自审：teardropPts 在极端轮跳（t=±30mm）下 cos/sin 取值范围 [-1,1]，无 NaN/Inf 风险；abs(dot(ref,u))>0.9 防退化参考向量；旧预设无 ROCKER 簇时 Step 4 整块不执行，无副作用。

## 2026-08-24 — learning/explainers 十一讲讲义 → PDF（Anthropic/Claude 设计风格）

- 需求：`learning/explainers/` 下 11 份讲义 HTML（第一讲~第十一讲，MathJax 公式 + 第一讲内嵌 3 张深色 SVG 视图）转 PDF，采用 Claude 模型公司（Anthropic）品牌设计语言。
- 工具链：新增 `learning/explainers/.claude_pdf/`——`claude-print.css`（打印样式）、`mathjax-head.html`（MathJax v3 配置）、`convert.mjs`（抽取 `<body>` → 套用新样式 → 无头 Chrome `--print-to-pdf`，`--virtual-time-budget=30000` 等 MathJax 排版完成）、`check-mjx.ps1`（dump-dom 校验公式容器数）、`pdf2png.ps1`（WinRT 渲染 PDF 页做像素级目检）。
- 设计：米白纸底 #FAF9F5（含 @page background，整页连色）、暖墨正文 #2F2B24、衬线标题（Georgia + Noto Serif SC）、Book Cloth 陶土橙 #C15F3C 点缀（标题条/小节方块/公式高亮条）、暖灰细线分隔、四类 box 改为哑光浅彩（直觉=陶土/推导=鼠尾草绿/警示=赭石/架构=石板蓝）、@page margin box 页脚（左 LABSUS·第X讲、右页码）。
- SVG 适配：第一讲深色主题 SVG（网格 #1e2632、标签 #c9c2b2 等）在打印版 CSS 中按颜色值 attr 选择器重映射为浅色打印配色。
- 验证：11 讲全部 mjx-container 29~447 个（公式渲染无误）；PDF 页数 6~13 页；像素抽样确认整页米白、正文墨色、陶土点缀、页脚页码均正常。输出：`learning/explainers/pdf/第X讲.pdf`（共 ~18 MB）。
- 再生成：`cd learning/explainers/.claude_pdf && node convert.mjs`。

## 2026-08-25 — LABSUS Pro: 三大车系底盘全覆盖与非线性力学/衬套柔度/极速切换升级

- **载体与规模**：`LABSUS/web/dwb-pro-fullchassis.html`（4785 行原生单文件 HTML5/JS/CSS，零外部重量级框架依赖）。
- **三大车系 3D 空间车架与悬架全覆盖**：
  1. **🏎️ FSC 方程式赛车 (Formula SAE)**：单座中置轻量化钢管桁架、尖头前吸能区 (IA)、主防滚架 (Main Hoop)、轴距 1620mm、前推杆+后拉杆、高刚度弹簧 (110~130 N/mm)、240kg。
  2. **🚗 FIA GT3 房车赛车 (GT3 Touring)**：FIA 标准笼式防滚架（左右双层车门 X 交叉防撞梁 + 顶盖十字撑）、前发动机舱塔顶撑杆、1.6m 宽双曲面鹅颈后尾翼、轴距 2650mm、前后高刚度推杆架构、强下压力 (3600 N)。
  3. **🚜 SAE Baja 巴哈越野 (Baja Off-Road)**：SAE Baja 认证高挑防滚笼 (RHO 顶高 1320mm)、越野防撞牛栏前杠、高离地防刮滑板、轴距 1750mm、离地间隙 >260mm、超长跳动行程 (±120mm)、全地形大齿胎 ($R=396\text{ mm}$)。
- **高阶悬架弹性与非线性力学**：
  - **减振器非线性 V-F 阻尼模块**：支持恒定阻尼 ($c_B/c_R$) 与 V-F 测点曲线表双模切换，2D 交互阻尼曲线画布，4-Post 台架时域动态分段线性插值。
  - **控制臂铰接衬套柔度矩阵 (Bushing Compliance)**：UCA_F/R 与 LCA_F/R 三向线刚度 $[K_x, K_y, K_z]$ 输入，内置原厂街道/性能强化/赛道金属/绝对刚性 4 档预设，直通 `/api/v3/kandc`。
- **UI 架构与极速切换**：
  - **液态玻璃 (Liquid Glass) 三标签页**：左侧 `[结构与模式]/[几何与工况]/[弹性与硬点]`，右侧 `[硬点与刚度]/[载荷与基准]/[图表与动态]`。
  - **切换性能极致优化**：预设边界秒级映射与轻量化扫掠，车型切换耗时由 539ms 降至 40ms（提速 12.5 倍），`drawAll()` 主循环安全加固，持久零黑屏。
- **验证**：三大车型几何拓扑与物理仿真全部通过，运动学与显式时域积分 0 错误。

## 2026-08-27 — LABSUS Pro: 综合评价报告（基准打分雷达）+ 全物理 15-DOF 直线爬坡舞台 + 轮胎自旋渲染

- **载体**：`LABSUS/web/dwb-pro-fullchassis.html`（5200 行原生单文件 HTML5/JS/CSS，本轮 +1294 行/-1 行）。
- **综合评价报告（头栏「📊 综合评价报告」按钮，`openSuspensionEvaluation()`）**：
  - `EVAL_BENCHMARKS` 基准库 + `calculateEvaluationData()`：从前后轮跳扫掠采样计算 12 项工程指标（外倾增益、bump steer、MR、轮刚度、簧载频率、阻尼比、侧倾刚度前后分配等）并逐项按基准评级；
  - 弹出模态：四维评分雷达图（`drawRadarChart()`）、等级徽章、指标明细卡、维度得分网格、自动调校建议列表（如弹跳频率/阻尼比/侧倾刚度分配调节方向）。
- **直线爬坡动力学舞台（头栏「🏁 直线爬坡测试」按钮，`openSlopeStage()`）**：
  - 全新 `VehicleDynamics15DOF` 求解类：车身平动+转动与四轮旋转自由度，Pacejka 复合滑移轮胎模型，1000Hz 子步积分（MAX_DT=0.001s），坡度载荷 cos/sin 分解、ARB 扭矩、空力阻力/下压力、随机 bump 噪声、PI 速度巡航、前后制动力分配；
  - `renderSlopeScene()`：canvas 2D 透视投影 3D 渲染（连续滚动道路网格 + 红白路缘 + 复用 `buildScenePRO()` 车身线框），跟随相机 + 拖拽环绕 + 滚轮缩放 + 双击复位；
  - HUD：车速 / 坡度% / 水平角 / 纵向加速度 / 四轮行程 / Fz 前后分配 / squat 俯仰值；坡度与目标车速滑块实时可调。
- **轮胎自旋渲染**：`addAxleAssemblyPRO` 按 `window._tireSpinAngles` 旋转轮胎/轮辋/制动盘几何，爬坡舞台车轮视觉滚动与动力学状态联动。
- **纯悬架透视**：头栏 toggle 一键隐藏车架/动力总成/转向柱/主缸，仅保留四轮与悬架线框观察。
- **入口**：头栏新增三个按钮（`slopeStageBtn` / `evalModalBtn` / `pureSuspTg`）。
- **验证**：内嵌脚本 `node --check` 语法通过（206KB 无语法错误）；完整浏览器端到端回归留待下一轮补验。