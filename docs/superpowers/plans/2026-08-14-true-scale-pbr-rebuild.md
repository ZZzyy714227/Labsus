# FSAE 真实尺寸重建 + PBR 整车渲染 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FSAE 悬架工作台从 0.6 比例缩小模型重建为真实尺寸（轴距 1550mm），车架按 2025 赛规合规重建，并以 PBR 渲染整车，提供完整三维点阵坐标导出。

**Architecture:** 后端仅替换建模数据（config.py 全部几何常量 + 车辆参数 + 目标带），求解器代码不动；前端新增 `web/js/car3d/` 程序化生成 PBR 网格（数据全部来自 `/api/defaults` + `/api/solve`），静态/动态分组保证 60fps；点阵收集直接读几何顶点（整车系坐标）。

**Tech Stack:** Python FastAPI + numpy/scipy（不动）；Three.js 0.160（CDN importmap）+ Vite 6。

**设计输入文档：**
- 审计报告：`docs/superpowers/specs/2026-08-14-geometry-audit-report.md`（§5 基线参数表）
- 设计规格：`docs/superpowers/specs/2026-08-14-pbr-full-car-model-design.md`
- 赛规：`ref/chassis_rules.txt`（3.4.1/3.11/3.12/3.13/3.14/3.19/4.1）

---

## Phase 1 — 几何基线（后端数据）

### Task 1: 真实尺寸悬架硬点（DESIGN_PARAMS + 派生验证）

**Files:**
- Modify: `src/config.py`（DESIGN_PARAMS 段）
- Modify: `src/hardpoints.py`（如派生逻辑有小比例假设则修正）
- Test: `tests/test_kinematics.py`（更新期望值）

- [ ] **Step 1: 读 `src/hardpoints.py` 派生逻辑**，确认所有参数语义（caster/kpi/wheel_offset_y/kingpin_length/track 如何组合出 UP1-5、CH1-5、FL1）
- [ ] **Step 2: 重写 DESIGN_PARAMS**（真实尺寸）：
  - front: track 1220, wheel_center_x 0, wheel_center_z 258（=加载半径）, tire_radius 260, caster 5.0, kpi 2.5, kingpin_length 150, wheel_offset_y 32, uca 内点 Y≈185/Z≈300, lca 内点 Y≈150/Z≈100, 前后腿距 ±100/±130, tierod 内点, pushrod 参数, tire_spring_rate 150, corner_weight_n 700
  - rear: track 1180, wheel_center_x -1550, wheel_center_z 258, 其余同思路（拉杆配置）
- [ ] **Step 3: 运行派生验证脚本**，检查：kingpin 长度=150±0.5、静态 camber −1.5~−2.5°、caster 4–6°、KPI 2–4°、scrub ≤25mm
- [ ] **Step 4: 运行 sweep 验证**：±25mm 轮跳 Δcamber ≤1.5°、Δtoe ≤1.0°（前后轴）。不达标则调 tierod/pushrod 硬点迭代至达标（记录每次迭代数值）
- [ ] **Step 5: 更新 `tests/test_kinematics.py` 中的硬编码期望值**（零位往返、对称性、物理合理性断言），`pytest tests/ -x -q` 全绿
- [ ] **Step 6: Commit** `feat(config): true-scale suspension hardpoints (wheelbase 1550)`

### Task 2: 赛规合规车架节点（DEFAULT_FRAME_NODES）

**Files:**
- Modify: `src/config.py`（DEFAULT_FRAME_NODES 段全量重写）
- Test: `tests/test_rules_compliance.py`（新建）

- [ ] **Step 1: 定义节点方案**（全部真实尺寸、结构节点，语义化命名，车身轮廓点迁出）：
  - 前隔板 FB_*（X=+420，宽 ~450，高 ~350，底 Z=70）
  - 前环 FH_*（X≈-140，顶 Z≈850，宽随上纵梁 Y≈±200 收至 ±150）
  - 主环 MH_*（X≈-730，顶 Z≈1150，底部连接点 Y=±250 → 内宽 500≥380）
  - 后隔板 RB_*（X≈-1560，宽 ~430，高 ~280）
  - 悬架挂点：前 CH1-4 即车架节点（UCA/LCA 内外点）、后 R_CH1-4；摇臂枢轴/减震器挂点 RK_*/DAMPER_*（前后）
  - 座舱地板参考点 FLOOR_*（Z=40）
- [ ] **Step 2: 写规则合规测试**（test_rules_compliance.py）：
  - 主环内宽 ≥380（3.11.6）
  - 前环侧视倾角 ≤20°（3.12.6）
  - 主环顶-前环顶净空 ≥50.8（3.10.4 精神，按 95 百分位模板近似）
  - 侧防撞上管 Z 在座舱底以上 240–320（3.19）
  - 所有节点为长度 3 的数值列表
- [ ] **Step 3: 运行测试直至全绿**
- [ ] **Step 4: Commit** `feat(config): rules-compliant true-scale frame nodes`

### Task 3: 车架管件（FRAME_TUBES 全量重写）

**Files:**
- Modify: `src/config.py`（FRAME_TUBES 段）
- Test: `tests/test_rules_compliance.py`（扩充）

- [ ] **Step 1: 按赛规生成管件集合**（每根管两端都是 DEFAULT_FRAME_NODES 键）：
  - 主环：连续单管（两侧底部→顶，整体一根由两个底端节点+顶部节点表达，渲染时以 3 点曲线闭合）+ 主环斜撑（直线、与主环夹角≥30°、连接点距顶≤160、底端双支撑构件）
  - 前环：连续管 + 前环斜撑（向前延伸至前隔板顶部 50mm 内）
  - 侧边防撞：上管（主环↔前环）、下管、对角管（两侧）
  - 上/下纵梁、前隔板 3 构件支撑、后隔板、三角化
  - 悬架挂点与最近车架节点的连接管（CH 点已是节点）
- [ ] **Step 2: 测试扩充**：每根管端点 ∈ 节点集；主环斜撑直线性；侧防撞连续性（上管连接主环与前环）
- [ ] **Step 3: 运行全绿后 Commit** `feat(config): rules-compliant true-scale frame tubes`

### Task 4: 车身面板 + 空力 + CABIN 示意件

**Files:**
- Modify: `src/config.py`（BODYWORK_FACES、FRONT_WING、REAR_WING、UNDERTRAY_CONFIG、DIFFUSER_CONFIG 重写；新增 CABIN）
- Modify: `src/routes/hardpoints.py`（/api/defaults 增返 cabin）

- [ ] **Step 1: 重写 BODYWORK_FACES**：语义命名（nose_top/nose_side_r/sidepod_r/floor/engine_cover 等）、平面环、真实涂装色（白/灰/黑+车队色）、opacity 1.0
- [ ] **Step 2: 重写空力配置**（真实尺寸）：前翼 span ~1000、chord 320、Z≈120（参考点）、端板；尾翼参考点 [-1620, 0, 1050]、span 900、主翼+双襟翼；底板 ground_clearance 30、半宽 380；扩散器 X 后缘 -1560、5 通道
- [ ] **Step 3: 新增 CABIN**：方向盘（X=-430, Z=560, 半径 140）、座椅（X=-600, 底板 Z=45, 背倾 30°）、发动机块（X=-1150, 500×380×320）、防火墙板（X=-680）、头枕（主环前 Z=950）
- [ ] **Step 4: /api/defaults 返回 `"cabin": CABIN`；运行后端冒烟（uvicorn 启动 + curl /api/defaults 检查字段）**
- [ ] **Step 5: Commit** `feat(config): true-scale bodywork, aero, cabin furniture`

### Task 5: 整车参数 + 目标带重标定

**Files:**
- Modify: `src/config.py`（VEHICLE 默认值 wheelbase_mm 900→1550、track 值）
- Modify: `src/metrics/targets.py`（目标带默认值按真实尺寸重标定：roll gradient 目标与 track 1220 对应）

- [ ] **Step 1: 更新 vehicle 默认：wheelbase_mm 1550、front_track_mm 1220、rear_track_mm 1180、cg_height_mm 300、mass_kg 280（保持）**
- [ ] **Step 2: 重标定目标带**（对照真实 FSAE 惯例：roll gradient 0.8–1.2 deg/g、ride freq 2.0–2.8 Hz、camber gain 等；具体数值写入代码注释标注依据）
- [ ] **Step 3: `pytest tests/ -q` 全绿 + 启动服务 curl /api/analyze 冒烟**
- [ ] **Step 4: Commit** `feat(metrics): recalibrate targets for true-scale geometry`

## Phase 2 — PBR 渲染（前端）

### Task 6: car3d 基础设施（materials + primitives）

**Files:**
- Create: `web/js/car3d/materials.js`、`web/js/car3d/primitives.js`

- [ ] **Step 1: materials.js**：PBR 调色板（steel/aluminum/carbon/rubber/paint/anodized 六组 MeshStandardMaterial）、RoomEnvironment+PMREMGenerator、平行光（castShadow）+半球光、地面接收阴影
- [ ] **Step 2: primitives.js**：`tube(a,b,r)`（CylinderGeometry 定位旋转）、`box3(c,sizes,center)`、`plate(points)`（三角化）、`torusAt(...)`、`disc(...)`、`coneAt(...)`；每个 Mesh 挂 `userData.part`
- [ ] **Step 3: 冒烟：initScene 后渲染一根测试管 + 立方体，浏览器控制台无错**
- [ ] **Step 4: Commit** `feat(web): car3d materials + primitives`

### Task 7: 车架 + 悬架 + 转向 + 车轮

**Files:**
- Create: `web/js/car3d/frame.js`、`web/js/car3d/suspension.js`、`web/js/car3d/steering.js`、`web/js/car3d/wheels.js`

- [ ] **Step 1: frame.js**：管件（2 点直线管 + 3+ 点 CatmullRom 曲线管；主环/前环 r=12.7，其余 r=9.5）+ 节点小球（r=4，仅悬架挂点）+ 焊点小球
- [ ] **Step 2: suspension.js**：A 臂（r=8 管+两端球铰壳）、立柱（kingpin 局部系内实体板+轴承座）、推/拉杆、摇臂三角板（RK_PIVOT/RK_DAMPER/CH5 三点）、减震器（外筒+活塞杆+弹簧螺旋 TubeGeometry）
- [ ] **Step 3: steering.js**：齿条（FL1 处横杆，随 rack_displacement 沿 Y 平移）、横拉杆（r=7+球头）、转向柱、方向盘（随 steering_theta×3.5 旋转）
- [ ] **Step 4: wheels.js**：轮胎（TorusGeometry，姿态=求解器 spin 轴+加载半径）、轮辋圆盘、制动盘、卡钳、接地面片（contact_patch）
- [ ] **Step 5: Commit** `feat(web): car3d frame/suspension/steering/wheels`

### Task 8: 车身 + 空力 + 示意件 + 点阵

**Files:**
- Create: `web/js/car3d/body.js`、`web/js/car3d/aero.js`、`web/js/car3d/furniture.js`、`web/js/car3d/pointset.js`、`web/js/car3d/car.js`

- [ ] **Step 1: body.js**：BODYWORK_FACES 三角化漆面板（双面渲染）；aero.js：翼型采样（NACA 拱度+厚度）放样+端板+底板+扩散器；furniture.js：CABIN 各件
- [ ] **Step 2: pointset.js**：遍历 carGroup，按 `userData.part` 分组收集顶点（整车系坐标），`toJSON()`/`toCSV()`/`download()`
- [ ] **Step 3: car.js**：`rebuildStatic(defaultsData)`（车架/车身/空力/CABIN → staticGroup）、`rebuildDynamic(designHp, solveResult)`（悬架/转向/车轮 → dynamicGroup）、carGroup 世界矩阵（world=(carX,carZ,-carY)）
- [ ] **Step 4: Commit** `feat(web): car3d body/aero/furniture/pointset/orchestrator`

### Task 9: 接线 + UI

**Files:**
- Modify: `web/js/scene3d.js`（重写为骨架）、`web/js/main.js`、`web/index.html`、`web/style.css`

- [ ] **Step 1: scene3d.js**：init（renderer/相机/OrbitControls/光照/地面/环境）→ 暴露 `initCar3d(container)` + 调用 car.rebuildStatic/rebuildDynamic
- [ ] **Step 2: main.js**：init 时传 defaults 数据 → rebuildStatic；runSolve 后 rebuildDynamic(displayHp 数据 + solveResult)
- [ ] **Step 3: index.html**：视口工具栏（视角预设 5 按钮 + 点阵导出按钮 + 导出面板）；style.css 样式
- [ ] **Step 4: Commit** `feat(web): PBR scene wiring + view presets + pointset export UI`

## Phase 3 — 验证与收尾

### Task 10: 端到端验证 + 文档

- [ ] **Step 1: `python run.py` + `cd web && pnpm dev`，浏览器验证**：整车完整（车架/悬架/转向/车轮/车身/空力/发动机示意）、无穿模/z-fighting；拖滑块联动正确；DevTools 帧率 ≥55fps；点阵 JSON/CSV 导出成功且数量级 10⁴–10⁵
- [ ] **Step 2: `pytest tests/ -q` 全绿；`pnpm build` 成功**
- [ ] **Step 3: DEVLOG 同步（本轮全部变更摘要）**
- [ ] **Step 4: Commit** `feat: true-scale PBR full-car rebuild complete`
