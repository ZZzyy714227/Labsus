# 开发日志

## 2026-08-22 — S2-2 前端引擎面板落地：dwb-pro-fullchassis.html 双模接入 /api/v3
- 前端主线 = `dwb-pro-dev/web/dwb-pro-fullchassis.html`（唯一前端核心，与用户决策对齐；"modeler 迁移"提法正式废弃）。
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

## 2026-08-22 — S2-1 引擎 /api/v3 服务层落地（隔离工作区 dwb-pro-dev/engine）
- 定位：S2 = 前端 `dwb-pro-dev/web/dwb-pro-fullchassis.html`（唯一前端核心，不换文件）接入引擎 `dwb-pro-dev/engine/`。本轮交付服务层，前端引擎面板下一轮。
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

## 2026-08-21 — 工业级设计 S1 引擎内核落地（隔离工作区 dwb-pro-dev/engine）
- 里程碑：K&C 弹性运动学分水岭打通——衬套 6DOF 元件 + 两层迭代求解器（TRF 外层力平衡 ⇄ 内层机构投影）+ 二力杆静力链 + MF 轮胎子集 + K&C 增益层，Subagent-Driven 双审查全流程通过。
- 隔离规则：开发仅写 `dwb-pro-dev/`（Gemini v4 为前端主线副本 + engine 引擎基线快照）；主仓库其余文件冻结；引擎任务提交前缀 `feat(engine)`。一次违规（T8 误改主仓库 DEVLOG，e5e6121）已 revert（b3ad00b）并确立 T10 controller 统一同步约定。
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
- 后续：S2（K&C 四工况驱动器 + /api/v3 + modeler 迁移）在 S1 基线上继续（仍走 dwb-pro-dev）。

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