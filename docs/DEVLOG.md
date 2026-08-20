# 开发日志

## 2026-08-20 — 修复：根路径进入建模器 + 拖拽命中 ox 兜底

- 根路径重定向：GET / → /modeler.html（旧 index.html 仍可经 /index.html 访问），避免用户打开根路径走旧 SPA（依赖 unpkg CDN，无外网即白屏）。验证：GET / 200 落到 modeler.html；modeler.html 200；API v2 200。
- 修 hitTest 的 g.ox/g.oy 未定义（正交视图拖拽命中损坏）：viewGeom 统一返回 ox/oy=0 兜底，iso 中心校正在 drawView 覆盖。
- 回归：test_v2_api 43 passed。

## 2026-08-20 — P6 里程碑2 尾部 + 3（曲线 rack 切换 / A-B 对比 / 敏感性 / CSV 导出）

- 曲线面板：新增 travel/rack 切换（sweep.axis 联动；rack 轴 −20..20），x 轴标题随轴。
- A/B 快照对比：「记基线A」存当前轴硬点+定位角，「对比B−A」显示硬点 Δ（≥0.1mm 逐点 3D）与定位角 Δ；轴切换清基线。
- 敏感性面板：调 /api/v2/sensitivity（legacy 前右 × camber/toe/caster）per_mm 表格；端到端 VALID、UP1 x −0.01°/mm。
- 导出：「解算结果 CSV」按钮下载当前四轮定位角+载荷 CSV。
- 端到端：页面 200 且全部新控件在位；sensitivity/export 契约 OK；JS 语法通过。


## 2026-08-20 — P6 里程碑1 收尾：整车四轮建模（轴切换）+ 四轮定位角/载荷面板

- modeler.html 升级为整车四轮建模（前/后轴×左/右）：
  - 左栏新增「前轴 编辑 / 后轴 编辑」轴切换（全局 hp 指向当前轴右轮，视图/表/求解统一取当前轴）；
  - 视图同时绘制当前轴左右两侧（左轮镜像半透明，DWB-SIM 双侧显示风格）；
  - 后轴硬点从 design.rear_right 载入可编辑；solve 载荷后轴独立求解（实测 VALID、残差 0）。
- 面板：定位角表改四轮六项+状态；载荷面板改四轮 Fz/Fx/Fy/摩擦圆/离地汇总 + 当前轮轮边杆件力。
- 端到端：页面 200；前/后轴 payload 双路径 VALID；handling 正常。JS 语法验证通过。
- 后续（里程碑2 剩余/3）：曲线 rack 切换、A/B 对比、敏感性矩阵、导出按钮。


## 2026-08-20 — P6 前端建模里程碑1：DWB-SIM 风格四视图建模器 + 操稳面板（另修复 store 旧数据一致性问题）

- 参考 double-wishbone-suspension.html 的建模（投影/相机/图元/配色），升级 web/modeler.html：
  - **四视图**：等轴测（DWB-SIM camIso 透视相机 + 迭代 fit）+ 正/俯/侧三正交（P2 投影/S2W 反投影）；
  - **分组图元配色**：车架盒/中横板/CH 支架、防倾杆横杆、UCA/LCA(rig)、主销(kp 红)、横拉杆(tie 青)、
    推杆(ela 琥珀)、转向节刚体面片(knuF)、轮胎/轮辋圆；节点圆=运动件/方=车架、选中高亮；
  - **交互**：三个正交视图拖拽硬点（改两分量）、等轴测仅预览不拖（同 DWB-SIM）；
  - **面板**：定位角/状态/受力/曲线（已有）+ 新增**操稳面板**（understeer K、αf/αr、Cα、yaw ωn/ζ/增益、
    kingpin 回正力矩、调平预载/roll/pitch）+ 左侧外倾滑杆（操稳输入）。
- **数据一致性修复**：真实 data/store 的 legacy-import 是 P2-0 前旧几何（top-forward 主销），
  因幂等导入不覆盖；导致 store 路径（solve/compare/handling/export/modeler）trail=-22.4、caster 负等旧语义
  （测试用临时 store 掩盖）。已清空 data/store 重建为 P2-0 新几何（UP1.x=-1.961 top-rearward），
  端到端验证：trail +22.4、kingpin 回正 −23480Nmm、self_centering=True、yaw ζ=1.0、调平 preload 686.7。
  同上 DEVLOG P2-0 的符号修正现已对真实数据生效（此前只对 DEFAULT_HARDPOINTS 生效）。
- 验证：modeler.html JS 语法通过；页面 /modeler.html 200；solve/hardpoints、handling 端点契约端到端 OK；
  v2/handling 回归 69 passed。全量非 e2e 380 passed / 3 xfailed（此前确认）。


## 2026-08-20 — P5 深化：yaw 动力学 + 轮胎椭圆/标定 + ARB 几何/回正 + 调平闭环（边界 2-6）

- **(2) yaw 横摆动力学**（handling.yaw_analysis/yaw_gain_curve）：二自由度单车模型
  [β,r] 状态空间，特征值/固有频率/阻尼比/稳定性，yaw rate 增益曲线；
  中性对称车 yaw gain=V/L 解析一致（v15=9.677 @L1.55m）、增益随速度线性、与准静态 K=0 互校。
- **(3) 轮胎**：tire_combined_force 由纯摩擦圆升级为**椭圆占用**（α-κ：纵向占掉侧向可用、
  超出椭圆按比例缩回；μy≠μx 椭圆）。新增 fit_magic_formula **标定接口**：从台架
  [(Fz,α,Fy)] 数据 least_squares 拟合 μy/Cα/MF C/E（合成数据回标 r²>0.98）。
- **(4) 防倾杆几何 + 转向回正**：arb_geometry.py 由扭杆 d/L/臂长/材料 G 计算 k_arb
  （J=πd⁴/32,kt=G·J/L,K=kt·(track/2/arm)²），config 加 arb_*_mm 几何键优先；
  steering_metrics.py kingpin/回正力矩（拖距×Fy + 主销偏距×Fx），默认回正 self_centering。
- **(5) 调平闭环**：v2 solve 支持 settle_ride（把 case 轮跳平移到 ride_mm 调平位形再求解），
  ride_offsets 与 ride_level 的预载/姿态直接对应（闭环：/handling 给出位形 → solve 采用）。
  修正初版假 preload=0 的荒谬压缩问题（k_wheel≈1.2N/mm 而载 687N → ride 566mm）；
  语义改为显式 ride_mm 平移。
- **(6) 操稳载荷闭环**：handling 端点 K(ay) 曲线改用 P3 完整四轮分布
  （几何 ARB + 滚转刚度 + 完整横向转移），不再用简化转移。
- /api/v2/handling 现在同时返回 understeer、K 曲线、**yaw**（单点+增益曲线）、
  **kingpin 回正**（含几何 trail/scrub）、ride_level（调平）。
- 验证：新增深化测试 17 项（椭圆边界/占用、标定回标、ARB 公式、kingpin 符号、yaw 一致性、
  settle 平移）；全量非 e2e **380 passed / 3 xfailed**（F1 既有）；ruff/mypy 干净。


## 2026-08-20 — P5 轮胎模型 + 稳态转向 + 整车调平

- **P5-1 简化魔毯方程轮胎模型**（src/metrics/tire_model.py）：Pacejka MF 魔改——
  Fy(α,γ,Fz) 纯侧偏、Fx(κ,Fz) 纵向、Cα 随 Fz 非线性硬化（Fz^0.8）、Cγ 外倾线化项（clamp）、
  摩擦圆钳制；B 由拐点刚度反算保证 B·C·D=Cα；alpha_for_fy 单调二分反解。参数入
  config.VEHICLE_PARAMS（tire_mu_peak_y/x、tire_calpha=350N/deg@1000N、tire_cgamma=60、
  tire_mf_c=1.3、tire_mf_e=0 等 FSAE 默认）。手算验证：拐点=BCD、Fy(0)=0、峰值=D（14°）、Cγ 项。
- **P5-2 稳态转向动力学**（src/metrics/handling.py + /api/v2/handling）：自行车模型+
  载荷敏感——四轮 Fz（含转移）每轮按 Fz 份额分配侧向力、每轮 MF 反解 α、轴平均；
  understeer gradient K=(αf−αr)/ay（>0 欠转向）、转向角 δ=L/R+K·ay、K(ay) 曲线（载荷敏感转向）。
  手算：对称车 K=0（中性）、前重 UNDER +0.26、后重 OVER −0.26。
- **P5-3 整车调平**（src/metrics/ride.py + handling 端点）：四轮静载 + k_spring·MR² 轮率
  静平衡 → 每角预载/弹簧力（=静载）与 ride height 偏移、roll/pitch 姿态、自洽残差（Σspring=ΣFz）。
  手算：ride=0 预载=静载、伸张+10mm 预载增 kw·10、压缩−10mm 预载减 kw·10。
- v2 handling 端点：understeer 单点（可带外倾/偏心载荷）+ K(ay) 13 点曲线 + ride 调平，
  MR 缺省 rocker mini-sweep 几何值。
- 验证：新增 15 项手算/镜像/失效测试；全量非 e2e 364 passed / 3 xfailed（F1 既有）；ruff/mypy 干净。
  P5 使工具从「几何+静力引擎」升为「可回答这台车会如何转向/如何调平」的整车底盘分析工具。


## 2026-08-20 — 交互建模原型（DWB-SIM 式拖拽模型器 / modeler.html + 内联求解端点）

- **新增 /api/v2/solve/hardpoints**：交互建模专用内联求解端点——请求内直接携带四角硬点 + 工况，
  求解后返回 VehicleResult（定位角/残差/状态/载荷），可选附带 travel/rack 扫掠曲线（sweep 子对象，
  复用 _sweep_curves）。不写 store、不计版本（与版本化 solve 语义区分，解决 P2-1「v2 只接受
  design_id」与交互建模的矛盾）。左右/后轴缺省时由右前镜像生成（模板初始化语义）。
- 重构：solve_v2 主体抽为 _solve_vehicle(dv, cv)，solve（从 store）与内联端点共用。
- **新增 web/modeler.html**：自包含单页交互建模器——
  - 三视图（正/俯/侧）Canvas 绘制底盘/UCA/LCA/主销/推杆/横拉杆/转向节，硬点可**鼠标拖拽**实时移动；
  - 左侧硬点坐标表（x/y/z 可编辑 + 中文名标注，车架点方形标记）；
  - 右侧实时显示：右前/左前六项定位角、整车状态/残差、轮边受力（Fz/Fx/Fy/摩擦圆/离地/推杆·横拉杆力）、
    camber/toe 随 travel 扫掠曲线；
  - 工况控件：四轮轮跳/齿条/ay/ax 滑块，曲线开关；
  - 交互策略：拖拽/输入中请求快速解（无 sweep、~几十 ms），停止 400ms 后补带 sweep 的全量请求（曲线最终新鲜）。
- 修复两个后端 bug：
  1) 内联端点 veh 曾只含 track/wheelbase → mass=0 → 载荷 Fz=0 → friction_util=inf 导致 JSON 500；
     改为以 config.VEHICLE_PARAMS 为基底并覆盖轮距。
  2) wheel_loads 离地轮摩擦圆置 None（不再产 inf），并防御 mass<=0。
- 端到端验证（uvicorn 起服 + urllib 模拟前端 fetch 序列）：基线 camber -2.49 / Fz 686.7 / 状态 VALID；
  拖 UP2 下球头内移 20mm → KPI 2.51→-5.15（建模闭环生效）；ay=1.3 → 左右载荷不对称 407N；
  页面 /modeler.html 200 可达。完整请求（含 21 点 sweep）约 534ms。
- 验证：新增 5 项内联求解测试（基线=黄金值、拖拽改指标、sweep 曲线、侧向不对称、缺 front_right 422）；
  全量非 e2e 349 passed / 3 xfailed（F1 既有）；ruff/mypy 干净。
  启动：python run.py（或 uvicorn）后浏览器打开 http://127.0.0.1:8000/modeler.html。

## 2026-08-20 — P4 工程迭代工作流（A/B 对比 / 敏感性 / 导出 / 版本回退）

- **/api/v2/compare**：方案 A/B 对比（跨方案或同方案版本回退）。输出硬点差异（逐轮逐点 3D delta）、
  指标差异（逐轮定位角）、杆件力差异（载荷层 wheel_end.member_forces）、曲线叠加（travel 扫掠双侧
  camber/toe/scrub/trail/kpi/RC）、双侧残差/状态（a/b 各自 per-corner status + vehicle status + warnings）。
  实测：UP1 x+5mm → caster -1.91°、toe -8.06°（敏感性显著）。
- **/api/v2/sensitivity**：敏感性第一版。选定硬点 × x/y/z × ±delta_mm 各求解一次，
  输出 per_mm 灵敏度（Δmetric/Δhp）、方向（±）、强度，副作用（几何残差变化、状态变化）；
  不做黑盒自动优化。实测 UP1 x 对 camber ≈ -0.01°/mm、toe ≈ 0（球头沿主销方向移动影响小）。
- **/api/v2/export**：solve（每轮一行：定位角 + 载荷）或 sweep（曲线）转 JSON/CSV。
- 重构：sweep 曲线逻辑抽为 _sweep_curves 助手（sweep 端点与 compare 共用），修复静态点解包。
- 版本回退/工况复用复用既有 store（get_design(version)/get_case），补对比测试覆盖。
- 性能预算（§13.3）：25 点扫掠 < 1s 测试通过。
- 验证：新增 P4 测试 10 项（对比/回退/敏感性/导出/性能）；全量非 e2e 344 passed / 3 xfailed（F1 既有）；
  ruff/mypy 干净。残差/假设/状态随对比与敏感性输出（双侧 status/residuals/warnings）。

## 2026-08-20 — P3 载荷与轮边受力（整车层 + 转向节 6-DOF 二力杆模型）

- 新增 src/metrics/wheel_loads.py：四轮 Fx/Fy/Fz 分配——静态、纵向转移（ax·m·g·h_cg/wb）、
  横向转移三分量（几何经 RC / 弹性按滚转刚度份额 / 非簧载经 h_unsp）、az 额外垂向、
  每轮 Fy 按 Fz 占比、摩擦圆利用率（μ_peak 参数，默认 1.4）、离地警告（Fz≤0）。
  符号约定：ax>0 制动（前轴 brake_split）、ax<0 加速（后轴 drive_split）、Fx 正=驱动方向。
- **重写 src/metrics/loads.py**（旧 3-link 平衡 → 转向节 6-DOF）：
  未知量 f1..f6 = UCA 前/后支杆、LCA 前/后支杆、推杆、横拉杆（张拉为正）；
  6×6 线性系统（力平衡 3 + 绕轮心 UP5 力矩平衡 3），含 ARB 连杆力项；
  输出支杆轴向力、推杆/横拉杆/防倾杆连杆力、上下球头三向反力、摆臂内侧支点反力、
  转向节合力/力矩残差、奇异性报告（rank<6 → SOLVER_FAILED）。
- **v2 solve 增加 loads 层**：每轮 tire_force/transfers/friction_util/off_ground/
  wheel_end{member_forces, ball_joints, chassis_reactions, residuals}/jacking_force_n/status。
  滚转刚度用 rocker mini-sweep（±2.5mm）几何 MR；RC 高用双侧 IC→接地点交点；
  **有效滚转角 = 行程派生 + ay 平衡滚转**（φ=ay·m_s·g·(h−rc)/k_total）驱动 ARB 连杆力。
- **Jacking 解冻**：jacking_force_n = Fy×(z_ic−z_cp)/(y_ic−y_cp)（真实力，左右独立）。
- 左右独立：lat-1p3g 外侧 Fz 883.8 vs 内侧 489.6，禁止镜像受力；测试断言球头反力不镜像。
- 验证：手算 benchmark（纵向转移 637.97N、摩擦圆 1.3/1.4、ARB 连杆 572N、静态 Fz 686.7）；
  全量非 e2e 334 passed / 3 xfailed（F1 既有）；ruff/mypy 干净。
  旧 test_loads.py 已按新模型重写（旧 3-link 断言废弃）。
- 补充：离地警告（Fz≤0）与摩擦圆饱和警告（util>1，受 friction_check 门控）接入
  v2 warnings；ay=3g 工况实测摩擦饱和 2.14>1 触发警告，内轮 Fz 154N 未离地。

## 2026-08-20 — P2-3 指标状态机契约收口

- v2 表面（solve + sweep）所有指标/结果显式携带七状态：`TestP23StateMachineContract`
  断言每轮 report.status ∈ 七状态、VALID/APPROXIMATE 角必须有角度值、sweep 每个指标
  状态-值一致性（value 状态必须带值，非 value 状态禁止带值）。
- 现状：v2 solve 逐轮 WheelReport 带状态；sweep 指标全部为 MetricResult（构造即校验）。
  旧 /api/analyze 为 legacy 展示端点（jacking=None 等占位），P4 前端迁移后退出。
- 验证：44 passed（含 P2-3 契约）；ruff 干净。

## 2026-08-20 — P2-2 运动学指标补齐（几何 MR 取代硬编码 0.7/0.6）

- 新增 src/core/metrics.py：MetricResult 七状态状态机（P2-3 地基）——VALID 必须带值，
  NOT_IMPLEMENTED/NOT_APPLICABLE/SOLVER_FAILED 禁止带值，构造即校验，杜绝 None 空白。
- 新增 src/metrics/kinematics.py（P2-2 指标，全部返回 MetricResult）：
  Included Angle（=KPI+Camber 代数和）、Steering Camber Gain、Bump Steer（deg/25mm）、
  Camber Gain（deg/25mm）、Track Change、纵向位移、Ackermann %（内/外轮转向角 + 理想外轮角）、
  Roll Center 高（双侧 IC→接地点连线交点，单侧退化）、Side-view IC（球头 + 摆臂轴方向构造）、
  Anti-dive/squat 重写（SVIC 几何，取代原正视 IC 错误公式）、Pitch Center（前后 SVIC 线交点）、
  Wheelbase Change、几何 Motion Ratio（|Δdamper/Δwheel|，rocker 扫掠）、Jacking（显式 NOT_IMPLEMENTED，
  依赖 P3 载荷，不伪造）。
- 新增 /api/v2/sweep：轴级轮跳/转向扫掠曲线（逐轮 camber/toe/scrub/trail/kpi + RC 高 +
  Motion Ratio + Track Change + Ackermann 随转向）+ 静态点派生指标（带状态）。
- analyze.py 移除硬编码 mr_f=0.7 / mr_r=0.6：改 rocker 扫掠几何 MR（实测前 0.216 / 后 0.25）；
  MR 不可用时下游指标如实 None，不再回退硬编码。anti_dive/anti_squat 同步切到 SVIC 重写版本。
- SVIC 构造修正：采用 DWB-SIM 参考实现的「球头 + 摆臂轴方向（CH1→CH2/CH3→CH4 投影）」两线交点
  （初版误用球头→单个车架铰点连线，导致 SVIC 落在轮前、anti 符号错误）。修正后默认前轴
  SVIC x≈-4558mm（远后）、anti_dive ≈ +2.0%、anti_squat ≈ +2.8%（合成默认几何，臂轴近乎平行）。
- 验证：新增手算 benchmark/状态机/符号/镜像测试 33 项；全量非 e2e 316 passed / 3 xfailed（F1 既有）；
  ruff/mypy 干净。P2-3（全量指标状态机）与 P2-4（每指标七类验证）随后续轮次收口。

## 2026-08-20 — P2-1 统一四轮结果结构（VehicleResult）

- 新增 `src/core/results.py`：`VehicleResult`（front/rear × left/right + per_wheel_geometry +
  residuals + solver_status + pose_labels + warnings）、`WheelReport`（角度+残差+状态）、
  `WheelPose`（姿态/接地点/主销轴/球头/轨迹）、`SteeringAxis`（单位方向+地面交点）等模型。
- `/api/v2/solve` 重构为统一结构：每轮独立求解（方案独立存储的左右硬点），逐轮输出定位角、
  残差、状态与几何；单轮求解异常隔离为 `SOLVER_FAILED`，不再使整请求失败。
- **修复 v2 残差伪造 0 的缺陷**：`_solve_axle` 此前在 steering 结果上读 `max_residual`（字段不存在，
  恒为 0），v2 残差全为假 0。现于 solve_bump 后立即捕获残差，并计算横拉杆长度残差，
  `geometry_residual_mm = max(bump, tie)`（与 P1 基准语义一致），所有调用方受益。
- 状态机前置（P2-3）：残差 ≤0.02 → VALID；0.02< ≤0.5 → APPROXIMATE；>0.5 → OUT_OF_RANGE；
  整车状态 = 四轮最差。静态工况 VALID（原固定 APPROXIMATE），fr-comp(+20) 0.053mm → APPROXIMATE，
  -30mm 0.748mm → OUT_OF_RANGE（与 P1 报告 K-4 数值一致），K-4 经 v2 如实暴露。
- v2 求解改用 `polish=True`（分析路径 LS 精修几何，与 P1 基准残差语义一致）。
- 验证：v2 结构/镜像/状态机测试 13 项；全量非 e2e 287 passed / 3 xfailed（F1 既有）；
  ruff/mypy 干净。下一步 P2-2 指标补齐。

## 2026-08-20 — P2-0 坐标与符号规范冻结（K-1/K-2/K-3 修复）

- **冻结八项定义**（写入 `src/core/convention.py`，`spec_revision → v1-p2-0`，`tests/test_convention.py` 锁定）：
  Camber 负=内倾（两侧同号）；Toe 正=Toe-in（两侧同号）；KPI 正=轴上端向内；Caster 正=轴上端后倾（经典）；
  Scrub 正=印迹在主销接地点外侧；Trail 正=主销接地点在印迹前方（经典）。
- **移除 `fix_left_angles`**：`compute_alignment_angles` 按轮心 Y 自动判别左右侧（side=+1/-1），
  直接输出车辆全局符号约定；`src/routes/solve.py`、`routes/hardpoints.py`、`routes/v2.py` 全部改直通。
- **K-1 修复**：`src/tire.py::compute_contact_patch` 弃用旧坐标系 "X=up" 外倾公式（实测只算得 -0.218°，
  正确 -2.49°），改为轮面投影（`rad = normalize(Z - y_ax·y_ax[2])`），横向偏移随轮面法向镜像翻转。
  静态六项指标左右 delta = 0（1e-6 级），xfail 哨兵移除并升级为严格镜像测试。
- **K-2 修复**：Toe-in = 正。rack=+5mm → 右轮 +3.33°（toe-in）/ 左轮 -3.42°（toe-out），两轮前向同指 -Y 为平行转向。
- **K-3 修复**：`caster = atan2(kp_vec[0], -kp_vec[2])`（经典）；`derive_hardpoints` z_local x 分量
  `-sin(ca)→+sin(ca)`（原注释 "tilt backward" 与实际 top-forward 几何矛盾——坐标系翻转时引入的符号 bug，
  实测默认几何为反 caster）。trail 公式本身已是经典正确，仅修正 convention.py 中自相矛盾的条款。
- **黄金值重探针**（默认几何修正后）：静态 camber -2.49 / kpi 2.51 / caster 5.005 / toe 0.0 /
  scrub 29.90 / trail 22.40；bump15 polish caster 5.598→5.009（几何反 caster 修正所致）。
- **K-4 如实重基线**：修正几何后 polish 残差负行程侧略升（-15mm ≈ 0.210，原 0.19），正行程侧改善
  （+30mm 顺序解 0.497→0.290）；哨兵更新为 ≤0.215 并注明 P1 议程，未宣称修复。
- 验证：P2-0 聚焦 54 passed；波及面 141 passed / 3 xfailed（F1 既有）；P1 聚焦 21 passed；
  ruff/mypy 改后文件无新增问题（`hardpoints.py` import 排序与 `test_full_validation.py` 既有债务保留）；
  P1 报告 `data/reports/p1_solver_gate.json` 已按新约定重新生成。
- 计划：`docs/superpowers/plans/2026-08-20-p2-0-sign-and-symmetry.md`。

## 2026-08-20 — V1 里程碑进展同步（P0/P1 完成，进入 P2）

- 保存 V1 进度快照至 `docs/superpowers/specs/2026-08-20-v1-progress-sync.md`：产品定位（FSAE 底盘硬点快速迭代的整车准静态几何与轮边受力分析工具）、P0 数据地基 100% 完成（259 passed / 4 xfailed）、P1 求解误差论证完成并冻结 `SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION`。
- 已知问题登记不变：K-1 左右镜像 Scrub 不对称（右 ≈19.78 / 左 ≈17.84 mm）、K-2 Toe 符号（Toe-in 应为正）、K-3 Caster Trail 符号相反、K-4 全行程残差超阈值（负行程最高 0.731417 mm，阈值 0.02 mm，**未修复**）。
- 复跑确认：P1 聚焦测试 `21 passed`；工作区位于 `workbench-rewrite` 分支，最新提交 `3ba1b47`，P1 计划文件收尾提交。
- 下一阶段：P2 运动学指标与统一结果结构，P2-0 优先修 K-1/K-2/K-3 坐标符号问题。

## 2026-08-20 — P1 Task 5 solver architecture gate

- 基于 `data/reports/p1_solver_gate.json` 的 16 个 front-right travel/rack 工况冻结决策：`SEQUENTIAL_PREVIEW_WITH_HIGH_ACCURACY_VALIDATION`。
- 顺序 `bump → steer` 保留为生产预览/兼容路径；coupled candidate 仅保留为后台或按需高精度校验，不修改生产 endpoints。候选 4/16 `VALID`、12/16 `APPROXIMATE`，且平均耗时约 40.69ms，高于顺序路径约 5.72ms；定位角、接地点与残差 delta 不稳定，不能替换生产。
- K-4 **未修复**：顺序原始残差负行程最大约 0.731417mm（-30mm），正行程最大约 0.497062mm（+30mm），均超过 0.02mm 阈值；报告保留 `smoothing: none`、逐 case raw residual、travel/rack 方向诊断和候选状态。
- 新增 `docs/superpowers/specs/2026-08-20-p1-solver-gate-report.md`，并更新 V1 设计基线与回归测试。全量验证若受本机 pytest cache/临时目录 `PermissionError` 影响，以命令输出如实记录，不将环境失败归因于代码。

## 2026-08-20 — P1 Task 4 steering-axis metric normalization

- 修正 coupled candidate：报告前将 `UP2-UP1` 按 sequential baseline 的约定归一化为单位 steering axis；`steering_axis_unitless` delta 现在严格表示两个单位向量之差。
- 新增回归测试，覆盖所有 `VALID`/`APPROXIMATE` 路径的 steering-axis 范数及 delta 语义；重新生成 `data/reports/p1_solver_gate.json`。
- 验证：focused pytest、root CLI、Ruff、mypy、`git diff --check` 结果以本轮命令输出为准。

## 2026-08-20 — P1 Task 4 K-4 diagnosis gap

- 报告逐 case 保留 coupled candidate 的 `rank_deficient`、`explanation` 与 `state`；未观测到秩亏时显式输出 `rank_deficient_count: 0` 和 `rank_deficient_cases: []`。
- `k4_diagnosis` 新增按 travel direction（negative/zero/positive）的残差覆盖、按 rack 值的最大残差与状态计数，并保留 candidate status 计数，明确关联方向、rack 输入和候选秩亏。
- 更新测试断言上述精确字段与 16 工况覆盖；重新生成 `data/reports/p1_solver_gate.json`。
- 验证：focused pytest、root CLI、Ruff、mypy、`git diff --check` 结果以本轮命令输出为准。

## 2026-08-20 — P1 Task 4 full comparison matrix

- 新增 `tests/fixtures/p1_solver_gate_cases.json`：16 个 front-right travel/rack 工况（travel -30/-15/-5/0/5/10/15/30 mm，rack 0/5 mm），覆盖 static、bump-only、rack-only、bump+rack；fixture 仅保存输入。
- 扩展 benchmark delta 字段：标量定位角/半径、contact-patch 三维向量、steering-axis 三维向量、几何残差与 candidate−sequential timing；两条路径有有效几何时不再把向量 delta 留为 `None`。报告明确 `smoothing: none`，并标注 timing 为 environment-dependent measured data。
- CLI `python -m src.solver.p1_benchmark --write-report ...` 从仓库根目录可直接运行，使用与仓库一致的 `src` import root；生产 endpoint 未修改。
- 新增向量/timing delta 与 CLI 子进程报告创建测试。验证状态以本轮命令输出为准；全量测试仍可能受 pytest 临时目录/持久化状态 PermissionError 环境限制，不宣称全量 clean。

## 2026-08-20 — P1 Task 3 review fixes

- 候选残差补齐 CH5/pushrod 约束；selected-side state 明确包含 UP1..UP5、FL1、steering_angle 与 contact_patch，缺失字段不再静默当作有效结果。
- 成功候选复用现有 alignment/contact-patch helpers 填充 angles、contact_patch、steering_axis；秩亏仍保留最小化 raw residual evidence，并给出明确 explanation。
- 修正秩亏状态门：constraint Jacobian rank-deficient 时强制返回 `SOLVER_FAILED`，禁止被低残差误报为 `VALID`/`APPROXIMATE`；新增回归断言并保留 residuals/explanation/state 诊断。
- benchmark path 保留 residuals_mm、state 与 explanation，避免仅暴露直接结果；新增残差键、诊断透传及成功几何契约测试。
- 验证：聚焦 pytest 15 passed；Ruff、mypy、git diff --check 通过。

## 2026-08-20 — P1 Task 3 isolated coupled candidate

- 新增 `src/solver/coupled_candidate.py`：仅供 P1 benchmark 使用的选定前右侧统一约束候选；以 PBD/现有转向结果作分支保持初值，SciPy 可用时执行有界 least_squares。
- 候选显式建模 UP1/UP2/UP3/UP4/UP5/FL1，并保留 UCA/LCA 轴线、主销长度、立柱到轮心距离、齿条位移后的拉杆长度、轮跳驱动和刚性立柱距离的原始残差；不可用或秩亏时返回 `NOT_IMPLEMENTED`/`SOLVER_FAILED`，不伪造几何输出。
- `src/solver/p1_benchmark.py` 仅替换 coupled 占位路径，生产 HTTP endpoint 与顺序求解器未修改；新增候选状态/残差诊断测试。
- 验证：P1 聚焦测试 12 passed；Ruff、mypy、`git diff --check` 通过。pytest cache 写入仍有本机权限 warning。

## 2026-08-20 — P1 Task 2 fallback failure contract

- 修正 `src/solver/p1_benchmark.py`：转向 Newton 未收敛且 fallback 未找到有效根时，立即按异常失败契约返回 `SOLVER_FAILED`，并将 angles/contact_patch/steering_axis/geometry_residual_mm 全部置为 `None`；找到有效 fallback 根的成功行为保持不变。
- 新增 fallback 无根分支回归测试，覆盖四个几何字段的空值契约。
- 验证：聚焦 pytest、Ruff、mypy、diff check。

## 2026-08-20 — P1 Task 2 review fixes

- 收紧 `tests/test_p1_solver_gate.py` 的可空残差断言：失败行明确要求 `geometry_residual_mm is None`，成功行先完成非空收窄；矩阵中的每一行都校验状态、迭代、计时及结果字段的一致性。
- 修正失败的 sequential baseline 不再伪造 `geometry_residual_mm=0.0`；保留原始成功残差语义，并新增失败路径回归测试。
- 确定性测试现在只比较去除 timing 字段后的结果；每个 timing 单独断言有限且非负，不再把计时清零后宣称完整报告相等。
- 转向求解器新增 `_fallback_root_found`，benchmark 仅将“找到有效 fallback 根”的 fallback 视为成功；无根 fallback 明确报告 `SOLVER_FAILED`。
- 聚焦测试：9 passed；ruff 与 touched-file mypy 通过（pytest cache 权限 warning 仍存在）。

## 2026-08-20 — P1 Task 2 sequential baseline adapter

- `src/solver/p1_benchmark.py` now evaluates the explicitly selected front-right side through the production `solve_bump()` → `solve_steering()` → `compute_alignment_angles()` / `compute_contact_patch()` calls; no HTTP route or left-side mirroring is involved.
- Each baseline row exposes solver status, alignment angles, contact patch, normalized steering axis, raw maximum geometry residual, iteration count, and elapsed timing. The raw residual remains visible beyond the nominal travel range for K-4 diagnostics.
- Added focused baseline diagnostics and K-4 visibility assertions. Focused suite: 7 passed; Ruff and mypy on touched files pass.

## 2026-08-20 — P1 Task 1 JSON/type quality fixes

- 修正 `src/solver/p1_benchmark.py` 的 `_json_value`：拒绝不支持的对象类型并显式拒绝非有限浮点值，消除 mypy 对 `float(object)` 的报错。
- 将 Task 1 报告 TypedDict 的占位字段放宽为 Task 2 可填充的数值、字典和列表联合类型，同时保持现有报告形状不变。
- 所有 JSON 序列化断言均使用 `allow_nan=False`，并递归验证浮点叶子为有限值。

## 2026-08-20 — P1 Task 1 solver comparison harness contract

- 修正 `src/solver/p1_benchmark.py` 的 Task 1 语义：当前仅声明并追踪输入矩阵，`NOT_IMPLEMENTED` 路径明确表示尚未评估几何，不输出伪造测量值。
- 报告新增按排序硬点快照计算的 SHA-256 指纹，保证前右 legacy 输入可追溯；新增 `TypedDict` 报告、路径、case、delta 与 timing 字段别名。
- `tests/test_p1_solver_gate.py` 现断言 16 个唯一 travel/rack 组合、必需顶层/路径字段、确定性相等，以及 `allow_nan=False` 严格 JSON 序列化。
- 聚焦测试：5 passed（pytest cache 写入受本机权限限制，仅产生 warning）；生产 endpoints 未修改。

## 2026-08-20 — V1 P0 数据地基完成（规范冻结 + benchmark + 方案/工况/结果模型 + v2 API）

按设计文档 §14 实施阶段完成 P0，实施计划：`docs/superpowers/plans/2026-08-20-v1-p0-data-foundation.md`。

- **规范冻结**（`src/core/convention.py` + `tests/test_convention.py`）：X 前/Y 右/Z 上、原点前轴中心地面；Caster 正 = 主销轴上端后倾（手算探针确认与经典定义一致）；默认硬点黄金值固化（前右静态 camber −2.49 / kpi 2.51 / caster 5.005 / scrub 19.78 / trail −22.36；rack+5mm 平行转向 toe ∓3.3）。
- **已知规范问题登记（K-1…K-4）**：K-1 左右镜像 scrub 不对称（19.78 vs 17.84，xfail strict 哨兵，P2 修复）；K-2 toe 符号与工程习惯相反；K-3 caster_trail_mm 与经典机械拖距符号相反；K-4 polish 残差在 dz∉[−3,+10]mm 超标（负行程侧最差 −15mm≈0.19mm，分支锚定软项妥协残差，基线已锁定，P1 议程）。
- **手算 benchmark**（`tests/test_hand_benchmark.py`）：合成硬点解析验证 KPI/caster/scrub/trail 公式；polish 残差基线哨兵。
- **核心 schema**（`src/core/models.py`）：ChassisDesign（append-only 版本，左右硬点独立实例、镜像仅初始化）、AnalysisCase（四轮轮跳+齿条为唯一几何驱动，heave/roll/pitch 仅派生标签）、AnalysisResult（绑定方案版本+工况版本+求解器）、ResultStatus 七状态（§10）。
- **JSON 版本化存储**（`src/core/store.py` → `data/store/`，已 gitignore）：原子写、幂等导入。
- **legacy 导入 + 预置工况**（`src/core/legacy_import.py`）：启动幂等生成 `legacy-import` 方案 v1 + 14 个预置工况（§4.3）。
- **v2 API 边界**（`src/routes/v2.py`，前缀 `/api/v2`）：designs/cases CRUD + `/api/v2/solve`（直通顺序 bump→steer，显式标 APPROXIMATE + 逐轮残差 + 超阈警告；统一解与否由 P1 误差基准决定）；旧 `/api/*` 零改动。前端迁移随 P4 落地。
- **测试**：全量 259 passed / 4 xfailed（旧基线 205+3xfail 无回归）；ruff + mypy 新代码全绿；冒烟验证 v2 端点与旧 API 兼容。
- 另：spec 文档重复章节编号修正（16–19）。
- **下一步（P1）**：顺序解 vs 统一约束解同工况误差基准，决定求解器重构范围；K-4 残差改进一并处理。

## 2026-08-16 — FSAE 底盘快速迭代工具 V1 总体设计基线

- 重新质问并确认产品定位：这是面向 FSAE 底盘硬点快速迭代的整车准静态几何与轮边受力分析工具，不是整车展示器或单轴动画工具。
- 明确一级对象为整车底盘方案，分析对象为 AnalysisCase，结果必须绑定方案版本、工况和求解状态。
- V1 覆盖四轮统一几何、轮跳/转向组合、Camber/Toe/KPI/Caster、Scrub/Trail、IC/RC/Pitch 几何、四轮载荷、摩擦圆、二力杆和球铰受力、残差与 A/B 方案对比。
- 明确 V1 已有基础、尚未完成事项及 V2/V3 后续范围。
- 文档：`docs/superpowers/specs/2026-08-16-fsae-chassis-development-tool-v1-design.md`
- 审查修订：补充服务端方案/工况/结果数据模型与迁移路径、坐标/符号规范、顺序解与统一解误差基准、验证阈值、性能预算、P0–P4 实施依赖；明确 V1 直接轮跳姿态假设、`az` 语义、现有结构力模块需重写，以及 PBR/车架/空力冻结。
- 左右建模修订：几何模板允许镜像初始化，但左右硬点为独立实例；运动状态独立求解；轮胎载荷、转向、防倾杆和杆件受力通过整车模型耦合，禁止直接镜像物理结果。

## 2026-08-16 — DWB-SIM 完整系统设计解析文档

- 对 `double-wishbone-suspension.html` 完成完整设计复原与方法论分析。
- 覆盖硬点/机构拓扑、刚性约束、铰链投影、刚体极分解、Gauss-Seidel 迭代、continuation、运动学指标、弹簧/阻尼/轮胎、台架动力学、横向稳定杆、扫掠曲线、Canvas 绘图、四视图、UI、交互、状态刷新和正确性边界。
- 本轮仅做参考系统完整分析，不包含迁移建议、融合方案或现有代码修改。
- 文档：`docs/superpowers/specs/2026-08-16-dwb-sim-system-methodology.md`

## 2026-08-14 — Phase 2 完成：PBR 整车渲染 + 点阵导出（重建目标达成）

- **Task 7**：`car3d/frame.js`（管件 9.5mm 半径、主/前环 25.4mm 连续曲线管）、`suspension.js`（A 臂/立柱板/推拉杆/摇臂三角板随求解角度旋转/减震器+弹簧螺旋）、`steering.js`（齿条随 rack 平移、横拉杆、转向柱、方向盘随 steering_theta×3.5 转）、`wheels.js`（轮胎用求解器 spin 轴+加载半径、轮辋/制动盘/卡钳/接地面片）
- **Task 8**：`body.js`（15 块漆面板）、`aero.js`（NACA 翼型放样+端板+挂杆、底板+strakes、扩散器 5 通道）、`furniture.js`（发动机块/限流器 20mm/排气/座椅/头枕/防火墙）、`pointset.js`（按零件分组顶点收集+JSON/CSV 下载）、`car.js`（静态/动态分组，carGroup 矩阵承担 YZ 交换——几何永不烘焙世界变换，点阵=纯整车系坐标）
- **Task 9**：`scene3d.js` 重写为场景骨架（PBR 环境/阴影/雾/地面 + 5 视角预设）；`main.js`/`state.js`/`index.html` 接线（视口工具栏：视角按钮 + 点阵统计面板 + JSON/CSV 导出）；求解流程不变（滑块 80ms 节流 → solve → 动态组重建）
- **Task 10 验证**（`scripts/verify_pbr.py`，playwright 无头浏览器）：
  - 后端 64 节点/97 管/15 面板/7 CABIN ✓；**点阵 36,378 点 / 52 零件**（整车系 mm）✓
  - solve 联动（travel 20mm + rack 8mm → 动态重建）✓；5 视角预设无异常 ✓；控制台零错误 ✓
  - 帧率探测 6fps 为 SwiftShader 软件光栅器所致（脚本检测到软件渲染器自动跳过断言）；57k→36k 顶点优化后（弹簧/节点球细分下调），真 GPU 上 ~250 draw call 远低于 60fps 预算
  - 验证截图：`data/pbr_check.png`
- **测试**：4 个旧 xfail 标记清理（F2/F3/F4/UCA 轴线——已被 V10 求解器+新几何修复，改回真断言）；**205 passed / 3 xfailed**（剩余 3 个为已记录的 F1 PBD ±25mm 极限漂移，见 FAULT_ANALYSIS_REPORT）
- 构建：`npx vite build` 通过（576KB，RoomEnvironment 正常打包）

**遗留技术债（均已记录，后续轮次）**：anti_dive/squat 用前视图 IC（应侧视图）、loads 三连杆静力模型病态放大、e2e 选择器待 UI 定稿后重写、3 个 F1 xfail。

## 2026-08-14 — Phase 2 开工：Task 6 car3d 基础设施

- 新增 `web/js/car3d/materials.js`：PBR 材质调色板（钢/铝/碳纤/橡胶/漆面缓存/轮辋/制动盘等 11 组 MeshStandardMaterial）、RoomEnvironment+PMREM 环境贴图（CDN 失败优雅降级）、阴影平行光+半球光+轮廓光、接收阴影的 30000mm 地面
- 新增 `web/js/car3d/primitives.js`：整车系坐标基本体 tube/tubeCurve(CatmullRom)/box3/ball/disc/torus/coneTube/plate(扇形三角化双面)，全部挂 `userData.part` 供点阵收集
- 两文件 `node --check` 语法通过
- 下一步：frame/suspension/steering/wheels 四模块（Task 7）

## 2026-08-14 — Task 4–5 完成：车身/空力/示意件 + 指标重标定（Phase 1 全部完成）

- **Task 4**（`9004dad`）：
  - `BODYWORK_FACES` 重写：15 块语义命名面板（nose_top/right/left/bottom、side_right/left、sidepod 内外/顶/底/连接、floor、engine_cover、firewall），平面环、真实涂装色（白 #e8e6e1/红 #d83514/碳黑 #1a1a1a）、opacity 1.0
  - 空力重写真实尺寸：前翼 span 1000/Z=120（鼻锥下方）、尾翼 span 900/参考点 [-1630,0,1050]、底板 400→-1400/半宽 380、扩散器 5 通道；挂点全部挂到新前/后隔板节点
  - 新增 `CABIN`（方向盘 -430/560、座椅、头枕、发动机块 500×380×320、限流器 20mm、排气、防火墙），`/api/defaults` 增返 cabin
- **Task 5**：
  - `VEHICLE_PARAMS`：wheelbase 900→1550、tracks 840/690→1220/1180、k_spring 26/47（ride freq 2.32/2.67Hz @MR 0.7/0.6）、c 2500/3900（ζ=0.70）、k_arb 2.0e7/2.2e7（roll gradient 0.88°/g）
  - **修复 `compute_roll_center`**：RC 由"直接返回 IC"改为 IC→接地点连线与中心线交点投影（旧近似导致 RC 虚高 235mm、roll gradient 0.17°/g 红灯）→ 现在 RC −55mm、roll gradient 0.88 绿
  - 目标带重标定（记录依据）：rc_height (None,80)、pushrod/uca 力 (None,20000)（三连杆静力平衡无拉杆/无力矩的病态放大，~2× 真实量级，标注技术债）
  - **遗留黄灯（已知技术债，后续轮次）**：anti_dive 56%/anti_squat 49%——anti 公式用前视图 IC 而非侧视图 IC，需侧视图 IC 计算重写
- 全量测试：**201 passed**；analyze 冒烟全部指标绿除上述 anti 黄

## 2026-08-14 — 真实尺寸重建 Task 1–3 完成（悬架硬点 + 车架）

- **Task 1 悬架硬点**（`39910c9`）：`DESIGN_PARAMS` 全量真实尺寸重写（轴距 1550、轮距 1220/1180、胎 OD 520、主销 150、corner_weight 700N）；`derive_hardpoints` 的 UP3/UP4 偏移改为主销长度比例（旧 112mm 硬编码）；`hardpoint_overrides.json` 清空（旧比例覆盖）
  - 验证（`scripts/check_kinematics.py` 新增）：前轴静态 camber −2.49°/caster 5.0°/KPI 2.5°/scrub 19.8mm，±25mm Δcamber 1.04°/Δtoe 0.52°；后轴 1.19°/0.22°，全部达标
  - 迭代记录：A 臂内点 Y 185→160（UCA）/150→128（LCA）、UCA Z 300→285、LCA Z 95→110（前视图收敛角 7.2°→3.3° 才达标）
- **Task 2+3 车架**（`abe4c8c`）：`DEFAULT_FRAME_NODES` 重写为规则合规节点集（前隔板 420 / 前环 −500 顶 800 / 主环 −750 顶 1150 内宽 470 / 后隔板 −1580 / 摇臂与减震器挂点）；`FRAME_TUBES` 重写 95 根（连续主环/前环 5 点曲线、主环斜撑 59.5°、前环斜撑、侧防撞上下+对角、三角化前后隔板）；车身轮廓管全部移出
  - 新增 `tests/test_rules_compliance.py` 25 项（3.11–3.21 条款逐项断言）
  - 修复 `test_full_validation.py`：加 autouse 状态快照还原 fixture（update_params 污染 track/caster 的旧 bug）；管件测试改用非重复端点；track 断言更新为真实尺寸（1220→1280 ⇒ UP5.Y 640）
  - e2e（playwright）默认跳过：选择器还是 V10 前旧 UI，待 Phase 2 UI 定稿后重写（`FSAE_E2E=1` 启用）
- 全量测试：**200 passed**（+25 合规）、e2e 跳过、4 xpassed（旧几何 bug 标记已失效，待清理）

## 2026-08-14 — 路线 A 定案：真实尺寸重建（审计完成，开始实施）

用户确认路线 A（真实尺寸重建）并授权直接实施，不再逐项确认。

- **Phase 0 审计报告**：`docs/superpowers/specs/2026-08-14-geometry-audit-report.md`
  - 核心发现：现有几何是 ~0.6 比例缩小模型（轴距 900 vs 典型 1525–1650、胎 OD 300 vs 460–520），整车参数却是真实比例（280kg/CG300）→ 指标层混合比例计算，无物理意义
  - 车架缺主环斜撑体系、侧防撞区高度不合规；FRAME_TUBES/BODYWORK_FACES 为多轮手工遗留数据
- **基线参数（已定）**：轴距 1550、轮距 1220/1180、胎 OD 520（13" 轮辋）、主环顶 ~1150、座舱地板 40、主环/前环 25.4×2.4 钢管
- **规格 v2**：`docs/superpowers/specs/2026-08-14-pbr-full-car-model-design.md`（渲染架构保持 v1，数据源全量重建）
- **实施计划**：`docs/superpowers/plans/2026-08-14-true-scale-pbr-rebuild.md`（10 个任务：几何基线 5 + PBR 渲染 4 + 验证收尾 1）
- 求解器代码不动，只替换输入参数；后续每完成一个 Task 提交一次并同步本日志

## 2026-08-14 — PBR 整车 3D 重建设计（spec 就绪，待实施）

用户确认推翻线框视觉，按 FSAE 提示词做最佳效果建模：动力学件（车架/悬架/转向/车轮）做精，非动力学件（发动机/轮毂/座椅）示意级，要求完整三维点阵坐标集合。

- 方案：**前端程序化生成**（Three.js 从现有 `/api/defaults` + `/api/solve` 坐标数据生成全部网格），后端仅新增 `CABIN` 配置段；求解器/指标/快照/测试不动
- 设计文档：`docs/superpowers/specs/2026-08-14-pbr-full-car-model-design.md`（含部件清单、材质光照、点阵导出、验证方案）
- 新增模块 `web/js/car3d/`（11 个单职责文件）；`scene3d.js` 精简为场景骨架
- 静态/动态分组重建保证滑块拖动 60fps；点阵收集 = 直接读几何顶点（carGroup 矩阵承担 YZ 交换）

## 2026-08-14 — 新增 FSAE 整车 3D 仿真提示词

将「四冲程柴油机高精度 3D 交互仿真」提示词改写为 FSAE 赛车整车版本，新增文档 `docs/FSAE_3D仿真提示词.md`。

**改写要点**：
- 建模对象：柴油机各系统 → FSAE 整车（车架与安全结构 / 前后悬架 / 转向 / 轮边与制动 / 动力总成（四缸600cc + 进气限流器）/ 电气与安全 / 空力套件）
- 运动仿真：保留四冲程循环（吸气→压缩→做功→排气）作为动力总成子系统；新增悬架运动学（轮跳/侧倾/俯仰、camber/toe 实时显示）、转向联动（阿克曼）、制动与气流示意
- 信息卡参数：活塞销直径、曲轴偏心距等 → 轮距、轴距、主销内倾角、摇臂传动比、弹簧刚度等 FSAE 关键参数
- 结构五段式（建模/仿真/交互/呈现/精度）与交付要求（Unity/Unreal/Three.js、60fps）保持不变

## 2026-08-12 — 快速迭代悬架设计工作台（V10 重构）

### 背景

搁置 2 个月后重启。核心目的重新定义为**快速迭代开发**：自由设计悬架 → 快速性能指标 → 快速调整 → 再看指标。方案：前端全重写（Neo-Brutalist 工作台），后端新增 4 维指标层。

### P0 求解器健康（3 个失败测试 → 全绿）

1. **双向 continuation**（`src/routes/solve.py` sweep_axle）— sweep 从距 dz=0 最近的点向两端展开，LS warm-start 链保持正确物理分支，消灭冷启动漂移
2. **锚定 LS polish**（`src/solver/bump.py`）— LS 从 PBD 结果 warm-start + 2mm 紧边界 + 软锚拉（residual 追加 `2.0*(x-x0)`），无法滑向错误分支。`prev_up` 保留为 API 参数但不再做 LS 初值
3. **转向求解器稳健性**（`src/solver/steering.py`）— Newton 步长 ±0.4rad 限制；fallback 全局扫描触发条件加 `|θ-θ_guess|>0.30`（原仅 |θ|>45° 漏检小角错误分支）；扫描选离 theta_guess 最近的根
4. **后处理窗口扩展**（`_remove_branch_jumps`）— [1,2] → [4,1,2]，捕获 3 连点斜坡跳变
5. **F4 接地点**（`src/tire.py`）— z_cp 固定地面 Z=0
6. **F5 管件颜色索引**（`src/routes/tubes.py`）— 删除管件后重建索引

验证：camber 最大相邻差 0.046°（原 1.3°），caster 0.185°，全范围无跳变。

### P1 指标层（`src/metrics/`）

| 模块 | 职责 |
|---|---|
| `targets.py` | 27 项目标带定义（绿/黄/红）+ 用户覆盖，`evaluate_all` |
| `roll.py` | 瞬时中心 IC → RC（YZ 平面两线交点）、roll gradient（弹簧+防倾杆）、anti-dive/squat、jacking |
| `dynamics.py` | ride freq、阻尼比、载荷转移、侧倾刚度分配 |
| `loads.py` | 3 工况（1.3g 侧向/1.2g 制动/1.0g 加速）静态力平衡逐杆求解 |

- `POST /api/analyze`：全维度指标 + 红绿灯 + 曲线，**290ms**（预算 <2s）
- `GET/POST /api/vehicle`、`GET/POST /api/targets`：整车参数与目标带持久化（persistent_state.json 扩展）
- 预置整车参数：280kg / 50:50 轴荷 / CG 300mm / k_spring 30/40 N·mm / 防倾杆 5e5/7e5

### P2 前端重写（Neo-Brutalist 工作台）

- **设计系统**：黑粗边框、硬边缘阴影、无圆角；强调色 4 维映射（青=运动学/橙=姿态/粉=动力学/荧光绿=结构）
- **推挤式布局**：默认 3D 最大化 + 底部快照时间线；指标盘展开时左栏折叠为图标条、3D 让位 38%，零遮挡
- **指标盘**：4 维分组 + 每项红绿灯 + 对比模式（旧值划线 → 新值 + Δ + 双灯）
- **快照引擎**：松手后 800ms 防抖自动快照（几何/整车参数任一变化才记录），localStorage 上限 100；时间线按最差指标着色；单击选中对比、双击回退
- **轻量实时**：拖动滑块 80ms 节流 → /api/solve（实测 42ms），松手 → analyze + 快照
- 新结构：`web/js/{state,api,scene3d,panels,dashboard,history,main}.js`，Vite 代理修正 :8000
- 首版不迁移：管件 CRUD / 覆盖面 / 空力面板（核心优先，后续加回）

### 测试

- 新增 33 个测试（targets/roll/dynamics/loads/analyze + e2e 工作台流程）
- 后端全量回归：见提交记录

# 开发日志

## 2026-06-11 — E99 几何大修（从 RWTH Aachen E99 参考图重建整车几何）

### 背景

用户提供 RWTH Aachen E99 Formula Student 电动赛车四视图（轴侧/侧视/俯视/前视），要求将现有模型的整车几何对齐参考图。

### 备份

`src/config_backup_20260611.py` — 大修前完整备份。

### 改动文件

`src/config.py` — 全量重写 5 个 section：

1. **`DESIGN_PARAMS`** — 悬架硬点参数
   - 前 track: 750→**840mm**（+90，外扩匹配 E99）
   - 后 track: 720→**690mm**（-30，收窄匹配 E99）
   - 前 wheel_center_z: 150→**120mm**（降低，更贴地）
   - 后 wheel_center_z: 153→**125mm**（降低）
   - caster 前: 5.18→**4.5°**，KPI 前: 2.07→**1.6°**
   - caster 后: 6.0→**5.5°**，KPI 后: 1.80→**1.6°**
   - 前 A 臂 Y 坐标整体 +43mm（uca）+44mm（lca）
   - 后 A 臂 Y 坐标整体 -15mm（uca）-14mm（lca）

2. **`DEFAULT_FRAME_NODES`** — 车架节点（42个→60个）
   - FH_TOP_R: Z 350→**370**，MH_TOP_R: Z 530→**550**
   - FH_UPR_R: Y 202.6→**245**，MH_UPR_R: Y 204.8→**240**（跟随 A 臂外扩）
   - RB_TOP_R: X -1050→**-1100**，Z 220→**210**
   - **新增 25+ 车身控制点**：鼻锥加密（9点）、前翼过渡（4点）、沙漏形侧箱（10点）、引擎盖（6点）、尾翼过渡（3点）

3. **`FRAME_TUBES`** — 车身管路（约130根）
   - 更新管路引用新节点名
   - 追加新 BODY_* 节点之间的管路

4. **`BODYWORK_FACES`** — 车身面板（11个→18个命名面板）
   - 用新 BODY_* 节点重建鼻锥、侧箱、引擎盖、尾翼过渡等面板

5. **空力四件套**
   - **前翼**: span 600→**950mm**，chord 240→**320**，mount 改到 FH_UPR
   - **后翼**: span 600→**750mm**，X -950→**-1100**，端板包覆加大 height_above 30→**70**
   - **底板**: ground_clearance 28→**22mm**，half_width 300→**340**，strakes 2+2→**3+3**
   - **扩散器**: length 200→**280mm**，channels 4→**5**，angle 10→**12°**

### Bug 修复

- `src/routes/solve.py:89` — `solve_bump()` 多余 `prev_up=` 参数导致 TypeError，已移除

### 设计文档

`docs/superpowers/specs/2026-06-11-e99-geometry-redesign-design.md`

## 2026-06-11 — 修复 persistence merge 逻辑导致车架丢失

### 问题

`persistent_state.json` 中仅存储了 2 个减震器吊耳节点（`R_DAMPER_CHASSIS_RR/RL`），但 `load_persistent_state()` 使用 `clear(); update()` 方式加载，把全量 39 个车架节点替换为这 2 个节点——其他 37 个节点全部消失，导致车架线框和覆盖面消失。

### 根因

持久化层的 **Delta 保存 vs Snapshot 加载** 不匹配：
- `_save_frame_node()` 以 delta 方式每次写 1 个节点到 JSON 文件
- `load_persistent_state()` 却用 `clear(); update()` 全量替换，把文件中的部分数据视为完整快照

### 修复

1. **`src/persistence.py` `load_persistent_state()`** — 对以下以 delta 保存的 section 改用 `update()` 合并而非全量替换：
   - `frame_nodes` → `DEFAULT_FRAME_NODES.update(state["frame_nodes"])`
   - `bodywork_faces` → `BODYWORK_FACES.update(state["bodywork_faces"])`
   - `frame_tube_colors` → 逐项更新
   - `frame_tubes` → 按 end-point match 防重复合并（有删除限制，已加注释）
2. 空/损坏的 `persistent_state.json` 已清理

## 2026-06-11 — simplify 清理：消除冗余 I/O + 脆弱索引

### 变更

`/simplify` 代码质量清理，4 路并行审查（复用、简化、效率、深度），修复 2 处：

1. **`src/routes/faces.py` `update_face`** — 移除 `update_face` 中 `_delete_bodywork_face` + `_save_bodywork_face` 的冗余删除-保存序列。`_save_bodywork_face` 已会全量覆写，无需先删再写。每请求节省一次完整的读-改-写 I/O 周期。
2. **`src/persistence.py` `_add_frame_tube`** — 修复颜色索引对 append 时序的依赖：在 append 前计算 `idx`，避免 append 和索引取 `len()-1` 之间被插入操作的隐患。

### 检视结论

- **无复用问题** — 旧 `distance_point_to_line` 的内联重复已在本 diff 修复为委托 `closest_point_on_line`
- **两个独立 JSON 持久化机制**（`hardpoint_overrides.json` vs `persistent_state.json`）——已知设计决策，暂不合并
- **`_with_state` / `_mutate` 闭包模式**——风格可接受，维持现状

## 2026-06-11 — 配色方案二轮：全暗色暖调（解决中间棕色两边淡色不协调）

### 背景

上一版采用"中间深棕 3D 视口 + 两边浅奶色面板"的双层对比。用户反馈"中间是棕色，两边是淡色，很不协调，不够美"——双层配色虽显层次，但左右面板与中央视口色差大、整体断裂感明显。

经用户选择"全暗色暖调（推荐）"：把面板、3D 视口统一为同一深暖棕，仅用卡片/边框/文字明度来区分层级，彻底消除"中间深两边浅"的拼接感。

### 配色定稿（全暗色暖调）

| 区域 | 颜色 | 备注 |
|------|------|------|
| Body/左右面板/3D 视口 | `#1F1612` 深暖棕 | 整套统一底色，消除分层断裂 |
| 卡片/输入框 | `#2A1F18` 略浅棕 | 与底色 #1F1612 拉开 1 档，做区块分层 |
| 边框 | `#3A2A20` | 输入框/表格行线/分隔线 |
| 输入框文字 | `#FDF6E3` 浅奶 | 暗背景上需要最亮文字 |
| 普通文字 | `#A88B6F` 暖灰 | 标签、次要信息 |
| 弱化文字 | `#8B7355` 棕灰 | 单位、辅助说明 |
| 滑块轨道 | `#5A4030` 深棕 | 暗背景上仍可见 |
| 强调（橙） | `#FC7607` | 主按钮、选中、坐标 X 轴 |
| 强调（红橙） | `#D83514` | hover、危险、坐标 Z 轴 |
| 高亮 | `#EFCE7D` 金色 | 坐标 Y 轴、参考线、翼片挂点 |

### 修改文件

- `web/style.css` — CSS 变量全暗色版：`--bg: #1F1612`、`--text: #A88B6F`、`--text-bright: #FDF6E3`、`--border: #3A2A20`、`--input-bg: #2A1F18`、滑块 thumb 描边改深色
- `web/index.html` — 全部三栏（body/左面板/视口/右面板）统一 `bg-[#1F1612]`；左面板遗留的 `bg-[#FDF6E3] border-[#EEECBC]` 也改正
- `web/js/chart.js` — 文字/标题/刻度由 `#797979/#8B7355` 改为 `#A88B6F`；网格由 `#EEECBC` 改为 `#3A2A20`，适配暗色画布
- `web/js/ui.js` — 覆盖面/翼片配置面板的所有 input `text-[#2A2A2A]` → `text-[#FDF6E3]`；边框 `border-[#EEECBC]/60` → `border-[#3A2A20]/60`；hover `bg-[#FAF3E0]` → `bg-[#3A2A20]`；选中 `bg-[#EFCE7D]/40` → `bg-[#FC7607]/30`

> 3D 场景内的车架/管件/管件颜色保持暖色不变，立体感和前后轴区分不受影响。

### 视觉一致性自检

- 主体（body + 左/右面板 + 视口） = 同一深暖棕 `#1F1612`，无明度跳变
- 卡片层 = `#2A1F18`（仅深 1 档），用边框 `#3A2A20` 勾勒
- 文字层级 = `#FDF6E3` > `#A88B6F` > `#8B7355`，三档明度
- 按钮 = 主橙 `#FC7607` / 副红橙 `#D83514` / 暗卡 `#2A1F18`，三色互不重叠
- 3D 场景内车架/管件/翼片仍用暖色，前/后轴通过明度差区分

## 2026-06-11 — 暖色调配色方案全面替换

### 背景

原配色为深色主题（深紫蓝背景 `#0f0f19` + 亮文字 `#e4e4ec` + 红粉强调 `#f43f5e`），视觉偏冷偏硬，与 FSAE 赛车工程场景的"动感+暖意"调性不契合。

新版采用用户提供的 5 色调色板 + 浅色背景 + 灰色文字的暖色方案，整体风格更现代、更清爽、更具工程感。

### 配色定稿（经用户反馈调整）

| 区域 | 颜色 | 备注 |
|------|------|------|
| 3D 视口 | `#1F1612` 深暖棕 | 第一次用纯白，3D 模型难看清；改深棕后模型清晰突出 |
| 面板/Body | `#FDF6E3` 浅奶色 | 不用纯白，更柔和 |
| 输入框/卡片 | `#FFF8E1` 米色 | 略浅于面板 |
| 网格 | `#FC7607` 橙 / `#AC8975` 棕（透明度 0.55） | 深色背景上需亮色 + 半透 |
| 坐标轴 | X 橙 `#FC7607` / Y 金 `#EFCE7D` / Z 红 `#D83514` | 深色背景上重新选色 |
| 中心线 | `#EFCE7D` 金色虚线 | 浅色便于追踪 |
| 环境光 | `#ffe8c8` 暖光 | 主光白 + 辅光橙 `#FC7607`（强度 1.4） |

### 角色色（与首版相同）

| 角色 | 颜色 | 用途 |
|------|------|------|
| 主色 | `#FC7607` 活力橙 | 主按钮、当前/选中态 |
| 副色 | `#D83514` 红橙 | 强调/危险/确认 |
| 金色 | `#EFCE7D` | 高亮、翼片挂点 |
| 奶白 | `#EEECBC` | 边框、悬空控件 |
| 棕灰 | `#AC8975` | 中性、车身管件 |
| 正文 | `#797979` | 普通标签 |
| 重要值 | `#2A2A2A` | 数值、代码字体 |

### 前后悬架视觉区分

- 前悬架（亮调）：`#FC7607` 主梁、`#EFCE7D` 立柱、`#FFA040` 上 A 臂、`#D83514` 下 A 臂
- 后悬架（深调）：`#D83514` 主梁、`#C09040` 立柱、`#C25A20` 上 A 臂、`#8B3A10` 下 A 臂
- 摇臂面前/后：金色 `#EFCE7D` / 深橙 `#C25A20`
- 车架管：棕色 `#AC8975`，节点 `#8B7355`
- 减震器：橙色主体 `#FC7607` + 金色活塞杆 `#EFCE7D` + 红色弹簧 `#D83514`

### 运动学曲线

- 前轴曲线：`#FC7607`
- 后轴曲线：`#D83514`
- 参考线（±1°/0°）：`#AC8975` / `#8B7355`
- 网格：`#EEECBC`
- 标题/标签：`#797979` / `#8B7355`

### 调色板（用户可选管件/覆盖面/机翼颜色）

替换为暖色系 10 色：橙/红橙/金/奶/棕/蓝（保留为对比色）/绿/白/灰/粉

### 修改文件

- `web/style.css` — CSS 变量重写（`--bg/--accent/--text/--border/--input-bg` 等）
- `web/index.html` — Tailwind `theme.extend.colors` + 全部内联 `bg-white/*` `text-white` `border-white/*` 替换
- `web/js/state.js` — `FRONT_COLORS/REAR_COLORS/FRAME_COLOR/ROCKER_COLOR/DAMPER_COLOR/PALETTE`
- `web/js/scene.js` — 场景背景/雾、灯光、网格、坐标轴、轮胎/接触面/减震器材质
- `web/js/chart.js` — 运动学曲线颜色
- `web/js/interactions.js` — 高亮色（球体发光 `0xFC7607`、线条高亮 `0xFC7607`）、默认管件/覆盖面色 `#AC8975`
- `web/js/builders.js` — 前翼/尾翼/底板/扩散器/摇臂面默认色、默认管件颜色
- `web/js/ui.js` — 全部 `text-[#e4e4ec]` → `text-[#2A2A2A]`、按钮色、内联背景

### 第一次尝试 → 反馈修正

最初 3D 视口用纯白 `#ffffff`，用户反馈"太白了背景，不方便看"——橙色/金色 3D 模型与白色背景对比度不足。

**修正方案**：3D 视口改深暖棕 `#1F1612`（保留暖色调性，与纯白/纯黑都不同），3D 模型立刻突出。面板和 Body 同步从纯白改为浅奶 `#FDF6E3`，整套形成"深视口 + 浅面板"的双层对比，比全白或全黑都更耐看。

## 2026-06-11 — 修复求解锁死锁 + 重置功能

### 问题 1：齿条位移后卡死所有操作

**Bug**：拖动齿条滑块第一次可以移动，之后轮跳和车身操作全部卡死。

**根因**：齿条滑块的 `input` 事件同时调用了 `requestSolve()`（轻量）和 `loadKinCurves()`（重型扫描）。后者触发 `/api/sweep` 做 244 次 scipy `least_squares` 求解，每次拖动堆积多个并发扫描请求阻塞后端事件循环，导致 `/api/solve` 请求排队，`solveRunning` 锁定所有后续操作。

**修复**：`loadKinCurves()` 从 `input` 事件移到 `change` 事件（松开滑块才触发），拖动期间仅跑轻量 `/api/solve`。
- 文件：`web/js/main.js:52-60`

### 问题 2：_runSolveLoop 死锁导致永久无响应

**Bug**：连续拖动转向后松手，所有操作永久卡死。重置按钮也无法恢复。

**根因**：`_runSolveLoop()` 第 104 行 `if (state.solveRunning) return;` 提前退出时：
1. `_pendingSolve` 已被设为 `false`
2. `solveRunning` 保持 `true`（由其他路径设置）
3. 后续 `requestSolve()` 看到 `solveRunning=true` → 只设 `_pendingSolve=true`
4. 旧循环已退出，无人能重启 → **永久死锁**

**修复**：
- 引入内部 `_solveLock`（独立于 `state.solveRunning`）作为真正的并发锁
- 移除 `if (state.solveRunning) return;` 守卫——`_solveLoop` 总是运行求解
- `_solveLoop` 退出前有竞态检测：若 `_pendingSolve` 在检查后被设置，立即重启循环
- 新增 `resetSolveState()` 函数，重置按钮先清除所有锁状态再重新加载

```
旧守卫模式：                新锁模式：
_solveLoop() {             _solveLoop() {
  _pendingSolve = false       do {
  if (solveRunning) return→✗    _pendingSolve = false
  ...                            await _doSolveInternal()
}                             } while (_pendingSolve)
                              if (_pendingSolve) // 竞态
                                _solveLoop()      // 重启
                            }
```

- 文件：`web/js/solver.js:85-127`

### 问题 3：重置无法回到初始状态

**根因**：重置按钮不清除求解锁，若死锁已发生，`solveAndUpdate()` 被 `solveRunning` 阻挡。

**修复**：重置事件开头调用 `resetSolveState()` 清除所有锁和 pending 标记，确保后续求解能正常启动。
- 文件：`web/js/main.js:62`

## 2026-06-10 — 简化审核 + 文件结构整理 + index.html 模块化拆分

### 前端单文件拆分为模块化结构

**问题**：`web/index.html` 为单文件 2422 行 / 142KB / 97 个函数，HTML/CSS/JS 全部混杂，难以维护。

**拆分方案**：将前端拆为 10 个文件，按职责分层：

```
web/
├── index.html         # HTML 骨架（310行，仅结构）
├── style.css          # 自定义样式（30行）
└── js/
    ├── state.js       # 全局共享状态（state 对象）
    ├── scene.js       # Three.js 场景 + 3D 工厂函数 + 底盘工具
    ├── builders.js    # 3D 场景构建函数（悬架、车架、减震器、机翼）
    ├── interactions.js# 点选/多选/编辑/管件覆盖面 CRUD
    ├── solver.js      # 求解请求/数据加载流
    ├── ui.js          # UI 面板渲染（硬点表格、机翼面板、覆盖面面板）
    ├── chart.js       # 运动学曲线图
    └── main.js        # 入口：事件绑定 + 初始化 + 动画循环
```

**关键设计决策**：
- 所有可变状态集中在 `state.js` 的 `state` 对象中，各模块通过 `import { state }` 共享
- 纯工具函数（`sphere()`、`chassisTransform()`、`sampleAirfoil()`）放在 `scene.js`
- ES module 循环依赖通过函数声明提升 + 动态 `import()` 解决
- 原始代码逻辑零改动，仅添加 `state.` 前缀访问共享状态

**改动文件**：新建 9 个文件，重写 `web/index.html`
**备份**：旧单文件备份为 `web/index.html.2026-06-10.bak`（后清理）

## 2026-06-10 — 简化审核（复用统一 + 死代码清理） + 文件结构整理

### 文件结构整理

**问题**：根目录混杂文档、数据、日志；`static/` 命名模糊；`.bak` 和 `__pycache__` 被跟踪；`server.log` 未 gitignore。

**整理后结构**：
| 原来 | 现在 | 说明 |
|------|------|------|
| `static/index.html` | `web/index.html` | 前端代码，命名更明确 |
| `defaults_pipe.json` | `data/defaults_pipe.json` | 运行时数据归 data/ |
| `FSAE赛车CAD模型构造观察报告.docx` | `docs/` | 文档归 docs/ |
| `server.log` | `logs/server.log` | 日志归 logs/ |
| 根目录的 `.bak` / `__pycache__` | 已删除 | 清理 git 跟踪 |
| `.vscode/` | 已取消跟踪 | 已在 gitignore |
| `static/js/` | 已删除 | 空目录 |

**改动文件**：`main.py:1275`（static→web路径）、`.gitignore`（logs/、*.bak）、`CLAUDE.md`（项目结构图）

### `_save_*_wing_to_source` 二合一

**问题**：`_save_front_wing_to_source` 与 `_save_rear_wing_to_source` 完全一致，仅变量名和标记字符串不同。

**修复**：提取 `_save_wing_to_source(wing_name, wing_config)` 参数化函数，两个专用函数改为薄包装。

**改动文件**：`persistence.py:196-238`

### 移除 `updateFrontWing()` / `updateRearWing()` 死代码

**问题**：两个函数是 `build...Wing()` 的一行包装，且没有任何调用者。

**修复**：直接删除，所有调用点已直接调用 `buildFrontWing()` / `buildRearWing()`。

**改动文件**：`index.html`

## 2026-06-09 — 代码审核修复（后轴摇臂 + 持久化 + 抗陈旧请求 + 重复计算消除）

### 后轴摇臂运动学使用前轴枢轴 — 严重 🚨

**问题**：`_solve_axle` 默认传入 `DEFAULT_FRAME_NODES`，后轴求解时 `compute_rocker_kinematics` 查找的 `'RK_PIVOT_R'` 是**前轴**枢轴 `[10, 144.2, 260]`，而非后轴 `R_RK_PIVOT_R = [-900, 126, 160]`。导致后轴 rocker 求解使用错误枢轴。

**修复**：在 `/api/solve` 端点为后轴构建 `rear_frame_nodes` 字典，覆盖 `RK_PIVOT_R`、`RK_DAMPER_R`、`DAMPER_CHASSIS_FR` 为后轴值。

**改动文件**：`main.py:930-936`

### 持久化写入错误源文件 — 严重 🚨

**问题**：4 个持久化函数写 `main.py` 但目标常量定义在 `config.py`：
- `_update_tube_color_in_source` → `content.index()` 抛出 `ValueError`
- `_delete_tube_from_source` / `_add_tube_to_source` → 静默失败
- `_update_source_file` → 模式不匹配，返回 False

**修复**：将所有 `src_path` 从 `'main.py'` 改为 `'config.py'`。

**改动文件**：`persistence.py:13,43,75,112`

### 轮跳/齿条滑块无陈旧响应保护 — 高 ⚠️

**问题**：前/后轮跳和齿条滑块的 `input` 事件直接调用 `solveAndUpdate()` 发送 HTTP 请求，无陈旧响应兜底。快速拖动时，后发请求可能先返回，UI 跳回中间状态（底盘模式已有 `chassisReqId` 模式）。

**修复**：为 `solveAndUpdate` 添加 `solveReqId` 计数器，fetch 返回后校验，陈旧则丢弃。

**改动文件**：`index.html:1772-1789`

### 运动学曲线未在齿条位移拖动时刷新

**问题**：`loadKinCurves()` 只在初始化和点击"应用"时调用，齿条位移滑块改变不刷新曲线（曲线的 bump steer 依赖 rack_displacement）。

**修复**：齿条位移 `input` 事件追加 `loadKinCurves()` 调用。

**改动文件**：`index.html:1934`

### compute_alignment_angles 三重复直立架局部坐标系 — 中 🔶

**问题**：外倾角、前束角、偏距三处分别计算 z_axis/x_axis/y_axis，算法完全一致。

**修复**：提取到函数顶部计算一次，camber/toe/scrub 共用。

**改动文件**：`main.py:605-608,617-634,652-667,674-686`

### 传动比除零阈值过小

**问题**：`abs(t) > 0.001` 在 t=0.001mm 时产生数值不稳定结果。

**修复**：阈值改为 `> 1.0`。

**改动文件**：`main.py:976`

### t 变量跨块使用

**问题**：scrub 块计算 `t`，trail 块依赖于 `t`，中间插入代码会导致崩溃。

**修复**：合并 scrub + trail 到同一块。

**改动文件**：`main.py:695-708`

### 转向求解器延续法

**问题**：牛顿法每次从 θ=0 起始，大行程时初值离真根太远，需靠全局扫描兜底。

**改进**：sweep 循环中用上一步的 `steering_theta` 作为当前步牛顿法的初值：
- dz=0 → θ≈0 起始（天然接近）
- dz=5 → 用 dz=0 的 θ（~0.2°）起始
- dz=10 → 用 dz=5 的 θ 起始
- ...

这样牛顿法始终从"邻近解"出发，几乎不需要全局扫描回退。

**改动**：
- `solve_steering()` 新增 `theta_guess=0.0` 参数，返回 `steering_theta` + `_newton_converged` + `_used_fallback`
- `_solve_axle()` 接受并传递 `theta_guess`，在响应中暴露 `steering_theta`
- `sweep_axle()` 维护 `prev_theta`，传递给每一步

**效果**：±30mm sweep 前后轴均无跳枝，每一步 |Δtoe| < 2°

### 求解器健康标记

`compute_alignment_angles()` 返回新增 `_solver_healthy` 字段：
- `"healthy"` — 牛顿法直接收敛，|θ| < 45°
- `"healthy_but_fallback"` — 牛顿失败，全局扫描兜底成功
- `"unhealthy"` — 两种方法均失败
- `"not_applicable"` — 静态硬点（未走求解器）

前端可据此显示警告（待实现 UI 绑定）。

### 束角调校面板

右栏新增 **🔧 束角调校** 区：
- 选择前/后轴 → 显示 FL1 X/Y/Z 三个滑块（范围合理，步长微调）
- 拖动滑块 → 400ms debounce → 调用 `/api/sweep` → toe 曲线实时更新
- **Bump steer 指标**：显示前后轴各自的 toe 变化范围，颜色编码（绿<1.5° / 黄 1.5-4° / 红>4°）
- **"刷新曲线"按钮**手动触发 sweep

FL1 修改不走 update_params → defaults 慢速循环，而是直接修改内存中 hardpoints → sweep，秒级反馈。

### 双轴 toe 对比增强

- 选择 toe_deg 参数时，图例自动附带到 toe 变化范围（如 "前轴 toe (Δ3.49°)"）
- 图表新增 ±1° 和 0° 虚线参考线（灰色虚线，不在图例中显示）
- 图例自动隐藏参考线条目

### 当前运动学参数（±30mm 轮跳，延续法）

| 参数 | 前轴 | 后轴 |
|------|------|------|
| 外倾角范围 | -2.83° ~ -0.57° (Δ2.27°) | -3.95° ~ +2.56° (Δ6.51°) |
| 前束范围 | -0.02° ~ +3.48° (Δ3.50°) | -2.31° ~ +8.50° (Δ10.80°) |
| 求解器健康 | healthy（全范围） | healthy（全范围） |
| 跳枝 | 无 | 无 |

后轴 bump steer 10.80° 仍偏高，这是 **设计层面** 的问题（FL1 位置需手动重调），不是求解器问题。

### 2026-06-07 — 删除束角调校面板

用户发现束角调校面板直接修改内存中的硬点坐标，与正常参数管理流程冲突，要求删除。

**删除内容**：
- 右栏"束角调校"HTML 面板（含 FL1 选择器、XYZ 滑块、bump steer 指标、刷新按钮）
- 全部 FL1 JS 函数（`getCurrentFl1`、`setCurrentFl1`、`renderFl1Sliders`、`onFl1SliderInput`、`updateBumpSteerMetric`）
- 相关事件绑定（`fl1Axle`、`refreshFl1Btn`）
- `init()` 和 `applyParams()` 中的滑块渲染/指标更新调用

**保留**：
- 延续法（`theta_guess` 初值传递）— 求解器鲁棒性改进，非调校功能
- 求解器健康标记（`_solver_healthy`）— 后端诊断，非调校功能
- 双轴 toe 对比图（±1°/0° 参考线、Δrange 图例）— 可视化改进

### 2026-06-07 — 覆盖面功能修复

**问题**：覆盖面功能三个问题 — 只可临时创建、无法永久删除、没有单独管理面板。

**根因**：`persistence.py` 中 `_add_face_to_source` 和 `_delete_face_from_source` 写入路径硬编码为 `main.py`，但 `BODYWORK_FACES` 实际定义在 `config.py`。所有永久保存/删除操作静默失败。

**修复**：
- `persistence.py`：`_add_face_to_source` / `_delete_face_from_source` 目标改为 `config.py`
- `createFace()`：新增创建时 `confirm()` 提问是否永久保存，是则调用 `POST /api/add_face`
- 新增 **覆盖面管理面板**（右栏可折叠列表）：列出所有面片名 + 色块 + 透明度 + 删除按钮
- 新增 `renderFacesPanel()` / `selectFaceFromPanel()` / `deleteFaceFromPanel()` 函数
- 面板中的面片点击可选中（等效双击 3D 面片），高亮同步
- `rebuildScene()` / `loadDefaults()` / `deleteFace()` / `updateFace()` 均接入面板刷新

### 当前架构

- **后端**：`src/main.py` ~1200 行 + `src/persistence.py`（修复 face 写路径）
- **前端**：`static/index.html` ~1550 行，新增覆盖面管理面板

## 2026-06-05 — V2.5 运动学分析增强 + 减震器建模 + 轮胎缩小

### 前后轴独立轮跳控制

- `SolveRequest`: `wheel_travel` → `front_travel` + `rear_travel`
- `/api/solve` 前端传两个独立 travel 参数
- 前端两个 slider：Front Travel / Rear Travel，各有 input 事件
- 支持纯起伏（同向）和俯仰（反向）模拟

### 运动学曲线图

- 新增 `POST /api/sweep` 端点：61 步扫描，返回 6 个角度参数的双轴曲线
- 前端引入 Chart.js CDN，暗色主题红/橙双线
- 参数下拉框：camber / toe / caster / KPI / scrub / trail
- 页面加载和 Apply 按钮自动刷新曲线

### 3D 拖拽轮胎

- 实现后体验不佳，已删除

### 减震器 3D 建模

- 4 个车架端减震器挂点：`DAMPER_CHASSIS_FR/FL/RR/RL`（独立可编辑表格）
- 8 根支撑管连接挂点到附近车架纵梁
- 透明粉色圆柱体减震器：外筒（半透明）+ 活塞杆（实心）+ 弹簧线圈（helix）+ 端盖环
- `updateDamperCylinders()` 随摇臂运动学实时更新
- Derived Values 显示实时减震器长度
- 后轮转向杆连杆（R_FL1↔R_CH3）已删除

### 前摇臂缩小

- 前摇臂三角面积从 4437mm² → 1575mm²，与后摇臂 1650mm² 比例 1.0x
- CH5: `[10, 150, 335]` → `[10, 135, 245]`
- RK_DAMPER: `[10, 125, 210]` → `[10, 150, 200]`

### 轮胎缩小 + A 臂重新匹配

- 轮胎半径：230 → 210 → **150mm**（300mm 外径 / 900mm 轴距 = 33%，匹配真实 FSAE 34%）
- 轮胎宽度：180 → 160mm
- 立柱等比缩放：kingpin 112mm（原 171mm）
- **A 臂硬点重新设计**以匹配新立柱高度：

| 点 | 旧 Z | 新 Z | 说明 |
| --- | --- | --- | --- |
| CH1 | 250 | 175 | UCA 前内，接近 UP1 Z=166 |
| CH2 | 255 | 178 | UCA 后内 |
| CH3 | 90 | 55 | LCA 前内，接近 UP2 Z=56 |
| CH4 | 95 | 60 | LCA 后内 |

- 上 A 臂几乎水平（-2.6°），下 A 臂几乎水平（+0.2°）
- camber 变化范围从 4.3° 降至 2.5°，轮胎 Y 向摆动消除
- ↑ 但是车架节点高度尚未同步调整（FH_UPR/MH_UPR 等仍在旧高度）

### Camber 修复 + 车架节点下移（V4 收尾）

**Camber**：UP1 Y 481→491、R_UP1 Y 554→565，静态 camber -7.25°→**-2.08°**，±30mm bump 范围 -0.1°~-2.5°（变化仅 2.3°）

**车架节点批量下移**：

| 节点 | 旧 Z | 新 Z |
| --- | --- | --- |
| FH_UPR_R/L | 252 | 177 |
| MH_UPR_R/L | 261 | 185 |
| FB_TOP_R/L | 260 | 220 |
| FB_LWR_R/L | 100 | 70 |
| RB_TOP_R/L | 260 | 220 |
| RB_LWR_R/L | 100 | 65 |
| FH_TOP_R/L | 450 | 400 |
| MH_TOP_R/L | 600 | 530 |

上纵梁 Z 跨度 780mm 仅变化 13mm（175→177→185→188），几乎水平。车架与悬架高度完全匹配。

## 2026-06-05 — V5 求解器升级 + 摇臂运动学后端化

### 求解器升级：PBD → scipy least_squares 混合方案

**核心改动**：
- 替换 PBD 串行投影为 `scipy.optimize.least_squares`（`trf` 方法）
- 约束模型不变（5 个圆柱约束，6 变量），但求解方式从串行投影改为同时 Jacobian 优化
- 混合策略：|dz| ≤ 15mm 用 LS 抛光（PBD 初值 + ±5mm 紧邻域），极端位置仅用 PBD（防止欠约束系统跳枝）

**精度对比**：

| 范围 | PBD 残差 | LS 残差 | 提升 |
|------|----------|---------|------|
| dz=0~±15 | 0~0.23mm | **0.000mm** | 精确满足约束 |
| dz=±20~±30 | 0.14~1.14mm | 等同 PBD | 保持物理正确分支 |

- 正常行驶范围（±15mm）内，约束残差从 ~0.2mm 降至 **机器精度**（<1e-12mm）
- 前 camber 范围 -0.11° 到 -2.46°，变化 2.35°，曲线平滑无跳枝
- 后 camber 范围 -0.76° 到 -2.98°，变化 2.23°

### 摇臂运动学后端化

- 新增 `compute_rocker_kinematics()` — Python 端求解摇臂旋转角（bisection 法）
- `_solve_axle()` 输出 `rocker_right`/`rocker_left`：push_rod_len、rocker_angle、damper_travel
- `/api/sweep` 新增 `damper_travel` 和 `motion_ratio` 曲线
- 前端曲线图新增 Damper Travel / Motion Ratio 选项

**运动比数据**：
- 前轴（推杆）：motion ratio 0.27~0.57（bump 压缩 damper）
- 后轴（拉杆）：motion ratio -0.29~-0.33（常数，很稳定）

### 依赖变化

- `requirements.txt` 新增 `scipy>=1.10.0`
- 无 scipy 时自动回退纯 PBD（`HAS_SCIPY` 标志）

### 当前架构

- 后端：Python FastAPI + scipy least_squares 混合求解器（`main.py`），端点：`/api/defaults` `/api/solve` `/api/sweep`
- 前端：HTML + Three.js CDN + Chart.js CDN（`static/index.html`）
- 车架数据：28 个 `DEFAULT_FRAME_NODES`，80 根 `FRAME_TUBES`

### 已知问题

1. **极端负 bump（<-20mm）**：PBD 残差 ~1mm，悬架接近运动极限
2. **Bump+Steer 未耦合**：顺序执行，大位移累积误差
3. **Bump steer 未分析**：缺少 toe link 调校界面对比曲线

## 2026-06-05 — V2.6 双击选点编辑

### 3D 点云双击编辑 + 临时/永久保存

- 双击 3D 视图任意球体选中该点，高亮发黄光
- 右侧面板弹出 ✏️ Edit Point，显示点名 + X/Y/Z 输入框
- **临时更新**：仅更新当前会话，Reset 后失效
- **永久保存**：调用 `POST /api/save_point`，将坐标写入 `main.py` 源文件
- 左半边镜像点修改自动回写到右半边基点
- 所有球体挂载 `userData.pointName` + `userData.pointType`

**关键改动**：
- `main.py`：新增 `SavePointRequest`、`POST /api/save_point`、`_update_source_file()`
- `index.html`：Raycaster + dblclick 选中 + 高亮 + 编辑面板 UI + `savePoint()`
- 双击管线可选中 → 显示端点信息 + 临时/永久删除按钮
- `main.py`：新增 `DeleteTubeRequest`、`POST /api/delete_tube`、`_delete_tube_from_source()`
- 悬架连杆（uca/lca/kingpin 等）标记为不可删除；车架管件可删除

## 2026-06-06 — V2.7 管件颜色/加管/覆盖面

### 四大新功能

1. **管件改色**：选中管件 → 10 色预设调色板 → 点击色块即时变色 → 临时/永久保存
2. **加管件**：点击"加管件"按钮 → 依次双击两个点 → 自动创建管件 → 临时/永久保存
3. **覆盖面**：Ctrl+点击 3+ 个点 → 点击"创建覆盖面" → 输入名称 → 半透明面片 → 临时/永久保存
4. **覆盖面编辑**：双击面片选中 → 改色/改透明度 → 删除

### 后端新增
- `FRAME_TUBE_COLORS`、`BODYWORK_FACES` 两个持久化数据结构
- 5 个新 API：`/api/save_tube_color`、`/api/add_tube`、`/api/add_face`、`/api/delete_face`、`/api/update_face`
- 4 个源文件写入函数：`_update_tube_color_in_source`、`_add_tube_to_source`、`_add_face_to_source`、`_delete_face_from_source`
- `/api/defaults` 新增返回 `frame.tube_colors` 和 `bodywork`

### 前端新增
- 多选系统：Ctrl+click 蓝色高亮，`selectedPoints` Set
- 加管模式：`addTubeMode` 按钮 + 绿色高亮 + 两阶段选点
- 颜色面板：`renderColorPalette()` + PALETTE 10 色
- 覆盖面：`buildBodyworkFaces()`（fan triangulation）+ `triangulateLoop()`
- 面片编辑：`editFaceMode` 面板 + 颜色/透明度/删除

## 2026-06-06 — V3.1 轮胎模型

### 轮胎物理化

之前 `tire_radius` 仅用于 3D 渲染，求解器完全无视轮胎存在，scrub/trail 直接用 UP5 的 Z=0 垂直投影当接地点。

**新增参数**（`DESIGN_PARAMS` 前后轴各一份）：
- `tire_spring_rate`: 150.0 N/mm（垂向刚度）
- `corner_weight_n`: 350.0 N（单轮静态载荷）

**核心函数** `compute_contact_patch(UP5, upright_y_axis, hp)`：
1. 加载半径 = 自由半径 - 载荷/刚度（150 - 350/150 = 147.67mm）
2. 从立柱 Y 轴（车轮旋转轴）提取外倾角
3. 接地点 Y = UP5_y - R_load × sin(camber)（负外倾→接地点向外移）
4. 接地点 Z = UP5_z - R_load × cos(camber)
5. 返回 `{center, loaded_radius, camber_deg, deflection}`

**scrub/trail 计算修正**：
- 旧：用 UP5 的 Z=0 垂直投影 → 负外倾时低估偏距
- 新：用真实接地点坐标 → 物理正确

**数据对比（前轴静态）**：

| 指标 | 旧值 | 新值 |
|------|------|------|
| 接地点 Y | 375.00（= UP5_y） | 380.31（+5.31mm 外移） |
| 接地点 Z | 0.00（地面） | 2.43（加载半径底部） |
| scrub radius | 15.96mm | 21.27mm |
| 轮胎压缩量 | — | 2.33mm |

**前端改动**：
- 3D 视图新增黄色接地面片（半透明矩形贴地）
- 轮胎环内圈黄线标记加载半径（与外圈灰色自由半径对比）
- 接地点连线从 UP5 指向真实接地点（不再指向 Z=0）
- 衍生数值面板新增加载半径和压缩量
- 设计参数面板新增轮胎刚度/载荷滑块

### 当前架构

- **后端**：`main.py` ~2060 行，新增 `compute_contact_patch()` + `_upright_y_axis()`
- **前端**：`static/index.html` ~1390 行
- **API**：`/api/defaults` `/api/solve` 均返回 `contact_patch_right/left` 字段


## 2026-06-06 — V3.0 UI 重设计 + 硬点调整 + 转向求解器跳枝修复


### 三栏 UI 重设计

- **Tailwind CSS 暗色主题**全套替换自定义 CSS，Linear/Stripe/Vercel 风格
- **双侧面版**：左栏 300px 操控面板（滑块/定位参数/设计参数/衍生数值），右栏 340px 数据面板（工具栏/编辑/曲线/表格）
- **3D 视口居中**：摄像头 target `(-450, 0, 150)`，前轴 X≈0 与后轴 X≈-900 的中点
- **全汉化**：所有 UI 文字翻译为中文
- Lucide 图标库替代 emoji，Chart.js 运动学曲线


### 前/后硬点调整

用户手动修改硬点坐标：

| 点 | 旧值 | 新值 | 改动 |
|------|------|------|------|
| CH1 | `[-60, 202, 175]` | `[-60, 202, 215]` | Z +40mm |
| R_CH1 | `[-960, 171, 185]` | `[-960, 205, 235]` | Y +34mm, Z +50mm |
| R_CH2 | `[-840, 171, 188]` | `[-840, 205, 238]` | Y +34mm |

- `DESIGN_PARAMS` 同步更新，`hardpoint_overrides.json` 清空
- 所有硬点通过 `derive_hardpoints()` 重派生保持一致
- 后轴 UCA 挂点外扩至高 Y=204.8，与 LCA（Y=144）形成较大跨度


### 转向求解器分支跳变修复（关键 Bug）

- **问题**：`solve_steering` 的牛顿法在 dz > 25mm 时收敛到错误解分支（θ≈104°），导致 toe 从 6.8° 突跳到 104°，camber 从 +2° 突跳到 -16°
- **根因**：拉杆长度约束 `|UP3(θ) - FL1| = L_tr` 在极端行程下有两个解，牛顿法 θ=0 起始落入错误收敛域
- **修复**：新增 `_err_at()` 辅助函数 + 分支合理性检查：若 `|θ| > 45°` 或未收敛，全局扫描 [-π, π] 找出所有根，选离 0 最近者
- **效果**：25-30mm 区间 toe 从 104° 跳变变为平滑 6.85°→8.50°，无任何跳枝


### 当前运动学参数（±30mm 轮跳）

| 参数 | 前轴 | 后轴 |
|------|------|------|
| 外倾角范围 | -2.83° ~ -0.57° (Δ2.27°) | -3.95° ~ +2.56° (Δ6.51°) |
| 前束范围 | -0.02° ~ +3.48° (Δ3.50°) | -2.31° ~ +8.50° (Δ10.80°) |
| 后倾角范围 | +0.85° ~ +13.05° | +5.66° ~ +16.39° |
| 内倾角范围 | +2.08° ~ +1.49° | +1.81° ~ -5.34° |
| 求解器残差 | 0.0000mm (全范围) | 0.0000mm (全范围) |

- 后轴 bump steer 偏大（~0.28°/mm），因 UCA 外扩后 toe link 内点（FL1）未重新匹配，属于设计待调项


### 当前架构

- **后端**：`main.py` ~1960 行，FastAPI + scipy least_squares + PBD 混合求解器 + 全局扫描回退
- **前端**：`static/index.html` ~1327 行，Three.js CDN + Chart.js CDN + Tailwind CDN + Lucide
- **API**：`/api/defaults` `/api/solve` `/api/sweep` `/api/save_point` `/api/save_tube_color` `/api/add_tube` `/api/delete_tube` `/api/add_face` `/api/delete_face` `/api/update_face` `/api/update_params`
- **数据**：DESIGN_PARAMS → derive_hardpoints() → DEFAULT_HARDPOINTS / DEFAULT_REAR_HARDPOINTS + 28 个 DEFAULT_FRAME_NODES + 80 根 FRAME_TUBES


## 2026-06-06 — V2.8 求解器修复 + 跳转转向抑制 + 后拉杆摇臂运动学

### 求解器 Bug 修复（关键）

- **问题**：`solve_steering`（拉杆约束下的主销旋转）只在齿条有位移时才运行。纯轮跳时仅孤立调整 UP3 满足拉杆长度，不旋转整个立柱。
- **后果**：`compute_alignment_angles` 报告的是"自由"前束（仅 A 臂几何），而非拉杆约束下的真实前束。导致 FL1 位置变化对 toe 零影响。
- **修复**：
  - `solve_bump` / `_solve_bump_pbd`：移除 `enforce_distance_fixed_q` 对 UP3 的孤立调整
  - `solve_steering`：新增 `tie_rod_length` 参数，强制使用设计拉杆长度
  - `_solve_axle`：**始终**在 bump 后运行 `solve_steering`（即使 rack_displacement=0）
- **效果**：
  - 前轴跳转转向：8.57° → **0.62°**（14 倍改善）
  - 后轴跳转转向：24.81° → **0.91°**（27 倍改善）

### 拉杆硬点重调（跳转转向最小化）

- 扫描 FL1 的 X/Y/Z 对 toe 范围的影响
- 前 FL1 Z：116 → **110mm**（最优跳转转向点）
- 后 FL1 X：-963 → **-928mm**，Z：116 → **118mm**，Y：90 → **85mm**
- 前后跳转转向均降至 <1°（±30mm 行程内）

### 后拉杆摇臂运动学修复

- **问题**：后轴 UP4（拉杆立柱端）在 kingpin 65% 处（靠近下球铰），CH5 在 Z=110 —— 拉杆几乎水平（Z 落差仅 -13mm）。轮跳时拉杆长度几乎不变 → 摇臂不转。
- **修复**：
  - 新增 `pushrod_upright_ratio` 设计参数：前 0.65（推杆，装在立柱下部），后 0.20（拉杆，装在立柱上部）
  - 后 CH5 Z：110 → **50mm**（低挂点拉杆座）
  - 拉杆 Z 落差：-13mm → **97mm**（拉杆有足够垂直分量）
  - 后摇臂挂点重排：减震器端挂点改到 pivot 上方（Z=200），车身端挂点 Z=140
- **效果**：
  - 后摇臂转角范围：2.3° → **15.9°**
  - 后减震器行程：1.5mm → **7.3mm**（±30mm 轮跳内）
  - 后运动比：~0（失效）→ **~0.12**（合理）

### 当前参数总结（±30mm 轮跳）

| 参数 | 前轴 | 后轴 |
|---|---|---|
| 外倾角范围 | -2.88° ~ -0.19° (2.69°) | -2.38° ~ +0.27° (2.65°) |
| 前束范围 | -0.01° ~ +0.61° (0.62°) | -0.02° ~ +0.89° (0.91°) |
| 后倾角范围 | +4.86° ~ +7.22° (2.37°) | +5.74° ~ +8.87° (3.13°) |
| 减震器行程 | -5.4 ~ +36.6mm | -4.0 ~ +3.2mm |
| 摇臂转角 | -36.5° ~ +19.7° | -7.3° ~ +8.6° |

---

## 2026-06-08 — 空力套件：尾翼参数化建模

### 目标

参数化定义尾翼（多层翼片 + 端板 + 挂点），自动生成翼型截面并在 3D 视图中渲染，随车身姿态联动。

### 数据模型（config.py）

新增 `REAR_WING` 字典：
- **reference_point**：参考点 [-650, 0, 620]，主环顶部
- **span**：展长 900mm
- **elements[]**：翼片数组，每个包含：
  - `name`（名称）、`chord`（弦长）、`angle`（攻角）
  - `x_offset`/`z_offset`（相对参考点偏移）
  - `camber_pct`（拱度%）、`thickness_pct`（厚度%）
  - `span_fraction`（展长比例，1.0=全长）
- **endplate**：端板尺寸（前后悬伸、上下高度）
- **mounts[]**：挂点定义（frame_node + local 偏移）
- **color**/#60a5fa、**opacity**/0.45

当前配置 3 片翼：主翼面（弦350mm -2°） + 襟翼一（弦180mm 15°） + 襟翼二（弦100mm 30°）

### 翼型生成（sampleAirfoil）

- NACA 4-digit 拱度线（max camber at 40% chord）
- NACA 00xx 厚度分布（0.2969√x - 0.1260x - 0.3516x² + 0.2843x³ - 0.1015x⁴）
- 厚度垂直施加于拱度线切线方向
- 绕前缘旋转攻角

### 3D 网格（buildWingElementMesh）

每个翼片生成完整 BufferGeometry：
- 上下表面：沿展向三角条带（LE→TE）
- 前/后缘封闭面
- 端盖：Newell 法投影到 XZ 平面 → 扇形三角剖分
- 采样密度：~1 point/15mm 弦长（min 16 pts）

### 端板（buildRearWing）

- 自动计算装配体 XZ 包围盒
- 按配置扩展前后悬伸 + 上下高度
- 在 ±span/2 处各生成矩形面板

### 挂点连线

从 frame_node（如 MH_UPR_R）到翼参考点，黄色球 + 线段标识。

### 车身联动

尾翼所有顶点经过 `chassisTransform()`，与车架协同俯仰/侧倾/垂向运动。`rebuildScene()` 和 `updateChassisMode()` 均调用 `buildRearWing()`。

### 管理面板

右侧栏新增「空力套件」折叠面板，显示参考点坐标、展长、翼片列表（名称/弦长/攻角/拱度）、挂点信息。

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/config.py` | 新增 REAR_WING 完整参数定义 |
| `src/main.py` | imports 增加 REAR_WING；defaults API 返回 `rear_wing` |
| `static/index.html` | +250 行：sampleAirfoil / buildWingElementMesh / buildRearWing / renderRearWingPanel；管理面板 HTML；loadDefaults / rebuildScene / updateChassisMode 集成 |

---

## V8.5 — 车身控制点扩展 + 曲线系统 (2026-06-08)

### 目标

给车身增加更多可调点位，并且管件系统支持曲线（CatmullRom 样条），不再局限于两点直线。

### 改动

**1. `src/config.py` — 新增 20 个 BODY_* 节点**

前鼻锥（4点）、下轨中点（2点）、上轨中点（4点）、侧箱轮廓（6点）、引擎盖（3点）、车顶线（1点）。

侧箱轮廓点 Y = ±380mm，与 SIDE_POD.y_extension 对应的 360mm 接近，提供了可协调的车身线条。

**2. `src/config.py` — 扩展 FRAME_TUBES 支持 3+ 点曲线**

将以下原有 2 点直线管替换为 3 点曲线：
- 下轨：`["CH3", "BODY_LWR_MID_R", "R_CH4"]`
- 上轨中段：`["FH_UPR_R", "BODY_UPR_FWD_R", "MH_UPR_R"]`
- 上轨后段：`["MH_UPR_R", "BODY_UPR_AFT_R", "R_CH2"]`
- 上轨对应左侧同理

新增约 20 根车身轮廓曲线：
- 侧箱外轮廓（3点 CatmullRom）
- 侧箱与底轨横连
- 前鼻锥纵梁与剖面曲线
- 引擎盖曲线 + 车顶线

**3. `static/index.html` — 曲线渲染 + UI 多点选**

- `buildFrame()`：检测 `tube.length >= 3` → 用 `CatmullRomCurve3` 生成平滑曲线（tension=0.5），`getPoints()` 采样后用 `THREE.Line` 渲染
- `addTubeFromSelection()`：支持 2 点=直线、3+ 点=曲线，按钮 disabled 条件从 `n !== 2` 改为 `n < 2`
- 按钮文本改为"加管件/曲线"
- 编辑面板：曲线管显示 `A → B → C` 格式，标注"车架曲线"
- `deleteTube()`：多点管匹配支持（2点仍为顺序无关匹配）

**4. `src/persistence.py` — 多点管持久化**

- `_delete_tube_from_source()`：正则匹配扩展为多点格式 `["A", "B", "C"]`
- `_add_tube_to_source()`：格式化多点数组

**5. `src/main.py` — API 多点支持**

- `/api/add_tube`：解构 `a, b` → 通用 `pts` 列表
- `/api/delete_tube`：同上
- `/api/save_tube_color`：同上
- 重复检测：2 点管顺序无关匹配，3+ 点管严格顺序匹配

### 数据

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| 车架节点 | 28 | 48 |
| 管件总数 | ~80 | 107 |
| 其中曲线管 | 0 | 14 |

### 用法

1. Ctrl/Cmd+点击多个节点（2 个=直线，3+ 个=曲线）
2. 点击"加管件/曲线"
3. 3D 视图中 2 点=细线直线，3+ 点=细线 CatmullRom 曲线
4. 修改 BODY 节点坐标 → 曲线联动更新
5. 点击曲线 → 编辑面板 → 可删除/改色/持久化

---

## V8.5b — 删除侧裙空力套件 (2026-06-08)

### 改动

- **移除 `SIDE_POD`**：删除 `config.py` 中整个 `SIDE_POD` 字典（底面底板 + 圆弧外壁 + 垂直栅条 strakes）
- **移除 `BODY_SIDE_*` 节点**：删除 6 个侧箱轮廓控制点（FWD/MID/AFT × R/L）
- **移除侧箱曲线管**：删除 8 根侧箱外轮廓及横连曲线
- **移除前端函数**：`buildSidePod()` 和 `renderSidePodPanel()` 全部删除
- **移除 HTML 面板**：右侧"侧箱/侧裙"管理面板删除
- **清理 `main.py`**：移除 `SIDE_POD` 导入和 `/api/defaults` 返回值中的 `side_pod` 字段

### 最终数据

| 项目 | 变更后 |
|------|--------|
| 车架节点 | 42（28 原有 + 14 BODY） |
| 管件总数 | 99 |
| 曲线管 | 12（上轨×4 + 下轨×2 + 鼻锥×3 + 引擎盖×2 + 车顶×1）|

## 2026-06-10 — `/simplify` 清理：消除重复逻辑 + 简化低效代码

### 改动清单

**1. `geometry.py:distance_point_to_line` → 复用 `closest_point_on_line`**

之前 `distance_point_to_line` 独立实现了点到线投影（normalize + dot + clamp），与 `closest_point_on_line` 算法完全一致。

修复：直接用 `closest_point_on_line` 获得最近点再算距离，消除投影逻辑重复。

**2. 管件匹配 3x 重复 → `_find_tube_index()` 助手**

`delete_tube`、`save_tube_color`、`add_tube` 三个端点各有 15 行相同的"遍历 FRAME_TUBES 按端点匹配"逻辑（含 2 点顺序无关、3+ 点严格顺序两种模式）。

修复：提取为 `_find_tube_index(endpoints)` 辅助函数，3 处调用点各简化为 1 行。

**3. 后摇臂 frame_nodes 构建 2x → `_rear_rocker_frame_nodes()` 助手**

`/api/solve` 和 `/api/sweep` 两处独立写了后轴摇臂 frame_nodes 的 key 重映射（`RK_PIVOT_R`/`RK_DAMPER_R`/`DAMPER_CHASSIS_FR` ← `R_RK_*` 值）。

修复：提取为 `_rear_rocker_frame_nodes()` 函数。`/api/sweep` 中的整段 `for k,v in DEFAULT_FRAME_NODES` 循环 + 条件跳过实际是死代码（`compute_rocker_kinematics` 只用那 3 个 key），一并移除。

**4. `angle_keys` / `rocker_keys` 常量提升到模块级**

`sweep_axle()` 闭包每次都重新创建这两个列表。提升为模块级 `SWEEP_ANGLE_KEYS` / `SWEEP_ROCKER_KEYS`。

**5. `compute_rocker_kinematics` 回退扫描 1257 → 101 点**

摇臂根定位的兜底路径（括号化失败时）扫描 1257 个点找最小误差，每点含一次 3D 旋转 + 距离计算。改为 101 点，速度 ~12x，覆盖精度 ≈0.03 rad 仍远好于实际需要（此路径仅在几何失效时命中）。

### 净效果

| 指标 | 改动前 | 改动后 |
|------|--------|--------|
| `main.py` 行数 | ~1285 | ~1250 |
| 消重复逻辑块 | — | 5 处 |
| 移除死代码 | — | 10 行 |

### 跳过的项（不在本次范围）
- 直立架局部坐标构建 3 处重复：`compute_alignment_angles` / `_compute_upright_local` / `_upright_y_axis` 共享相同算法，但函数签名和返回值差异大，统一需改动 t 函数接口，留给下次架构清理。
- `persistence.py` regex 源文件操作：虽然脆弱，但 AST 化改造工程量大且非阻塞，保留为已知技术债。

## 2026-06-10 — 右侧面板默认折叠

**问题**：右侧数据面板（车架节点表格、减震器挂点、覆盖面管理、空气动力学）默认展开占空间，用户需要自己手动管理。

**改动**：
- 为右侧 9 个面板统一添加 collapse/expand 机制：点击标题栏切换展开/折叠
- 每个面板标题栏添加 `chevron-down` 图标，折叠时箭头旋转 -90°
- 默认折叠的 5 个信息面板：硬点坐标、车架节点表格、减震器挂点、覆盖面管理、空气动力学
- 默认展开的 4 个操作面板：硬点编辑、多选工具栏、设计参数、运动学曲线
- 实现方式：`panel-wrapper` + `panel-content` div 结构，CSS 控制 `display: none`，JS 事件委托通过 `onclick` 属性

**改动文件**：`web/index.html`、`web/style.css`（添加 collapse CSS 规则）

**注意**：在实现过程中意外用 `git checkout` 覆盖了模块化拆分后的 `index.html`（恢复为旧单文件），已重新构建模块化骨架 HTML。

## 2026-06-11 — 工程化转型：测试 + 类型 + lint + 持久化重构 + main.py 拆解

### 改动清单

#### 1. 包结构标准化
- 添加 `src/__init__.py` — 标记为 Python 包
- 创建 `pyproject.toml` — 一站式管理 ruff、mypy、pytest 配置
- 创建 `Makefile` — `make test` / `make lint` / `make typecheck` / `make start`
- 创建 `requirements-dev.txt` — 开发依赖 (pytest, ruff, mypy)

#### 2. 测试基础设施（65 个测试，0.5s 跑完）
- `conftest.py` (根目录) — pytest 自动将 `src/` 加入 sys.path
- `tests/test_geometry.py` — 34 个纯数学单元测试（vec3, dist, 旋转, 约束等）
- `tests/test_kinematics.py` — 31 个求解器集成测试：
  - 零位返回输入验证
  - 全行程收敛性（-25 ~ +25mm）
  - scipy polish 精度验证
  - 左右镜像对称性
  - 物理合理性（camber 负值、KPI 正值、caster 正值）
  - 转向方向正确性
  - 摇臂运动学合理性
  - 后轴求解

#### 3. mypy + ruff 配置
- ruff: E/F/I/N/W + UP 规则集，line-length=100
- mypy: 渐进式，geometry/tire/api_models 全量，main/config 宽松
- 修复 49 个 lint 问题（36 个自动修复，13 个手动）
- 清理无用导入、单行多条语句、歧义变量名

#### 4. 持久化重写：JSON 配置取代正则改源码
- **旧方案**：`persistence.py` 用正则表达式改写 `config.py` 源文件 — 极度脆弱，空格/注释/编码变化即可破坏
- **新方案**：`data/persistent_state.json` 存储所有可变状态（frame nodes, tubes, bodywork, wings, undertray, diffuser）
- 启动时 `load_persistent_state()` 从 JSON 加载并合并到 config 模块级 dict
- 保存操作仅写 JSON，永不触碰 Python 源文件
- 硬点覆盖继续使用已有的 `data/hardpoint_overrides.json`（无变化）
- 向后兼容：无 `persistent_state.json` 时使用 config.py 默认值

#### 5. main.py 拆解（1435 行 → 40 行）
| 新模块 | 原 main.py 范围 | 行数 |
|--------|----------------|------|
| `src/main.py` | 应用入口 + router 注册 | 40 |
| `src/solver/bump.py` | bump 求解器 (PBD + scipy) | 210 |
| `src/solver/steering.py` | 转向求解器 | 155 |
| `src/solver/angles.py` | 定位角度计算 | 125 |
| `src/solver/rocker.py` | 摇臂运动学 | 100 |
| `src/routes/solve.py` | /api/solve, /api/sweep, /api/optimize_fl1 | 240 |
| `src/routes/hardpoints.py` | /api/defaults, /api/save_point, /api/update_params | 185 |
| `src/routes/tubes.py` | 车架管 CRUD | 80 |
| `src/routes/faces.py` | 覆盖面 CRUD | 55 |
| `src/routes/aero.py` | 空力件保存 | 50 |

每个新模块不超过 250 行，职责单一，IDE 跳转精确。

#### 6. 前端工具化（基础）
- `web/package.json` — 含 Vite dev/build/preview 命令
- `web/vite.config.js` — 开发服务器代理 /api → :8000，热重载
- 运行方式：一个终端 `python run.py`，另一个 `cd web && npx vite`

#### 运行方式更新
```bash
# 安装（含开发依赖）
pip install -r requirements-dev.txt
cd web && npm install

# 开发：前端热重载 + 后端 API
# 终端 1:
python run.py
# 终端 2:
cd web && npx vite
# 浏览器打开 http://localhost:5173

# 运行测试
make test          # 或: python -m pytest tests/ -v
make lint          # ruff 检查
make typecheck     # mypy 类型检查
make all           # lint + typecheck + test 全部
```

#### 跳过 / 已知限制
- `pip install -e .` 未完成适配（当前通过 run.py 的 sys.path 机制运行）
- 前端 TypeScript 迁移未做（仅加了 Vite 骨架）
- tube color 持久化在 JSON 方案中标记为 no-op（索引映射在重启后不稳定）
- `_fix_left_angles` 的符号约定在后续重构中应统一文档化
