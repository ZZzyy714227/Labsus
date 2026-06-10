# 开发日志

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
