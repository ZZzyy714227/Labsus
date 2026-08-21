# FSAE 悬架分析软件 · 项目梳理（2026-08-21）

> 面向"这个项目做了很多版、整体比较杂"的现状，做一次全量清点。
> 目标：弄清楚「现在线上跑的是哪套 / 哪些是旧版 / 哪些可以删 / 哪些是文档垃圾」，后续开发不再重复造。

---

## 0. 一句话结论

项目其实经历了 **三代产品**，但三代代码/界面/文档仍然全部堆在工作区里共存，互相引用、层层兼容，所以看起来乱：

1. **2026-06 的代**：V1–V9 悬架分析器（双叉臂线框 + 运动学 + 空力车架），Python FastAPI + 浏览器 Three.js。
2. **2026-08-12 的代**：V10 快速迭代工作台（Neo-Brutalist 前端 `web/index.html` + `web/js/*`）。
3. **2026-08-14 之后的"V1 重造"**：产品重新定位为「底盘硬点迭代分析工具」，砍掉展示器路 线，建立了数据地基（P0）+ 状态机（P1）+ 指标层（P2）+ 载荷层（P3）+ 工程工作流（P4）+ 轮胎/台架（P5/P6），前端收敛到**单文件 `web/modeler.html`**。

现在**真正线上跑的是第 3 代**：`/` 已经重定向到 `web/modeler.html`；`src/routes/v2.py` 是新主 API。但 1、2 代的旧路由（`/api/*`）、旧界面（`web/index.html` + `web/js/*`）、旧文档、备份文件、参考图全部还留在原地。

---

## 1. 演进时间线

| 时期 | 版本/阶段 | 干了什么 | 现在的痕迹 |
|---|---|---|---|
| 2026-06 | V1–V6 | 双叉臂线框 → 求解器 PBD+LS → 延续法 → 摇臂/减震器 | `src/solver/*`、`src/routes/solve.py`、`src/geometry.py`、`src/tire.py` |
| 2026-06 | V7–V9 | 空力套件（尾翼/前翼/底板/扩散器）、E99 整车几何大修 | `src/config.py`（DESIGN_PARAMS，仍被硬点派生使用）、`src/routes/{aero,faces,tubes}.py`、`src/persistence.py`、`docs/AERO_SIDE_DEVICES.md` |
| 2026-08-12 | V10 | 快速迭代设计工作台（指标 4 层 + 前端重写） | `web/index.html` + `web/js/*` + `web/car3d/*` + `web/style.css`（旧界面） |
| 2026-08-14 | PBR 重建 | 全尺寸整车 PBR 渲染（10 个 car3d 模块） | `web/js/car3d/*`、`web/dist/` |
| 2026-08-14~20 | **V1 重造 P0–P4** | 产品重置：坐标规范、方案/工况/结果三层模型、版本化存储、v2 API、求解误差论证、指标层、载荷/轮边受力、A/B/敏感性/导出 | `src/core/*`、`src/routes/v2.py`、`src/metrics/*`、`src/solver/coupled_candidate.py`、`tests/*` 大量新测试 |
| 2026-08-20~21 | P5/P6 + 前端收敛 | Magic Formula 轮胎、操稳、ride、四轮 7-DOF 时域台架、F1 配色；前端全部挪进 `web/modeler.html` | `src/metrics/{tire_model,handling,ride,bounce}.py`、`web/modeler.html` |

---

## 2. 当前运行链（线上活的这一套）

```
run.py
 └─ src/main.py (FastAPI app)
     ├─ 挂载路由：solve(旧) / hardpoints(旧) / tubes / faces / aero / analyze(旧) / v2(new)
     ├─ load_persistent_state()          # 读 data/persistent_state.json
     ├─ DataStore() + legacy_import      # 幂等导入 legacy-import 方案 + 14 个预置工况
     └─ StaticFiles(web/),  GET / → 重定向 /modeler.html
```

**核心数据流（新 V1）**：

```
config.py DESIGN_PARAMS
  → hardpoints.py derive_hardpoints()  →  DEFAULT_HARDPOINTS / DEFAULT_REAR_HARDPOINTS
  → core/legacy_import.py               →  data/store/chassis_designs/legacy-import.json（唯一设计方案）
  → routes/v2.py POST /api/v2/solve/hardpoints
       ├─ routes/solve.py _solve_axle()      # 复用旧顺序求解 {bump → steering}
       ├─ solver/{angles,bump,rocker,steering}.py
       ├─ metrics/kinematics.py 定位角/主销/瞬心/...
       ├─ metrics/wheel_loads.py P3 载荷
       ├─ metrics/loads.py 轮边杆件受力
       └─ core/results.py VehicleResult（四轮 + 状态机）
  → 前端 web/modeler.html 呈现
```

**前端现状**：`web/modeler.html` 是**唯一生产界面**（单文件 111KB，内置全部 CSS/JS/主题，只调 `/api/v2/*`）。`web/index.html` 是旧 V10 工作台，仍可经 `/index.html` 访问（`src/main.py` 注释里明确称它为"旧 index.html"）。

**API 端点存活清单**：

| 前缀 | 现状 |
|---|---|
| `/api/v2/*`（solve/hardpoints 内联、sweep、rig、handling、compare、sensitivity、export、designs、cases） | ✅ **新主 API**，modeler.html 只用这一族 |
| `/api/solve`、`/api/sweep`、`/api/optimize_fl1` | 🟡 旧 API，兼容保留；`v2` 的求解还复用 `solve.py` 内部函数 |
| `/api/analyze`、`/api/vehicle`、`/api/targets` | 🟡 旧 API，旧 `index.html` 工作台在用 |
| `/api/defaults`、`/api/save_point`、`/api/update_params`、`/api/apply_params` | 🟡 旧 API，旧工作台/脚本在用 |
| `/api/add_tube`、`/api/save_tube_color`、`/api/delete_tube` | 🟡 旧 API（车架管件，已无活跃前端用） |
| `/api/*_face`、`/api/save_*_wing` 等 | 🟡 旧 API（覆盖面/空力，V9 产物，已无活跃前端用） |

---

## 3. 全量库存清单

### 3.1 后端 `src/`

| 文件/目录 | 归属代 | 状态 |
|---|---|---|
| `config.py` | 旧 V1–V9 | 🟢 活跃（DESIGN_PARAMS / VEHICLE_PARAMS / 车架节点，硬点派生之源） |
| `hardpoints.py` | 旧 | 🟢 活跃（派生生源，legacy-import 依赖） |
| `geometry.py` / `tire.py` / `api_models.py` / `persistence.py` | 旧 | 🟢 仍被旧路由使用；留存为兼容层 |
| `config_backup_20260611.py` | 旧备份 | 🔴 **垃圾**（E99 几何大修备份，已 git 跟踪，应移出 `src/` 或删除） |
| `routes/solve.py` | 旧 | 🟡 兼容 + `_solve_axle` 被 v2 复用（别删） |
| `routes/{hardpoints,tubes,faces,aero,analyze}.py` | 旧 | 🟡 兼容层，旧前端在用 |
| `routes/v2.py`（65KB） | **新 V1** | 🟢 主 API（单文件过大，见 §4.9） |
| `core/*`（convention/models/results/store/legacy_import/metrics） | 新 | 🟢 数据地基，全活 |
| `metrics/*`（14 个） | 新 | 🟢 全活（kinematics / wheel_loads / loads / handling / tire_model / bounce / ride / dynamics / targets / roll / arb_geometry / steering_metrics） |
| `solver/{bump,steering,rocker,angles}.py` | 旧升级 | 🟢 求解内核（v2 依赖） |
| `solver/coupled_candidate.py` + `solver/p1_benchmark.py` | 新 P1 | 🟢 P1 高精度验证候选 + 基准 CLI，保留 |

### 3.2 前端

| 文件/目录 | 归属 | 状态 |
|---|---|---|
| `web/modeler.html` | 新 V1 | 🟢 **唯一生产界面**（自包含单文件） |
| `web/index.html` + `web/js/*` + `web/js/car3d/*` + `web/style.css` | V10 工作台 | 🟡 **旧界面**，仍被维护（2026-08-21 还加了主题系统 `web/js/theme.js`），但不是入口 → 去留需决策 |
| `web/dist/` + `package.json` + `vite.config.js` | V10 构建 | 🔴 index.html 若弃用，这是残留构建产物（且 `node_modules` 未跟踪） |
| `dwb-mod/`（`double-wishbone-suspension.html` + README） | 魔改 DWB 独立版本 | 📗 已归位：与自研系统互不引用的独立演化版（git 历史 `dwb/dwb-modeling` 前缀）；当前工作区仍有 62 行未提交魔改 |
| `color-scheme-preview.html` + `ref1/ref2.png` + `iso/rear/side/top.png` + `data/pbr_check.png` | 设计临时产物/截图 | ✅ 已按用户指示删除（截图无需保留） |

### 3.3 文档 `docs/`

| 文件 | 状态 |
|---|---|
| `DEVLOG.md` / `PLAN.md` | 🟢 活跃，但文件被反复追加，出现**重复的 `# 开发日志` / `# 开发计划` 标题**（§4） |
| `docs/superpowers/specs/`（V1 设计基线、DWB-SIM 方法论、P1 报告等 2026-08 的） | 🟢 活跃设计文档 |
| `docs/superpowers/plans/`(2026-08-12/14/20 …) | 🟢 实施计划档案 |
| `docs/superpowers/specs|plans/2026-06-*`（aero-proportions / floor-diffuser / dynamic-track / e99，另有 `8cb7318` 提交已宣称 retire 部分） | 🟡 历史归档候选 |
| `docs/FAULT_ANALYSIS_REPORT.md` | 📘 2026-06 旧 PBD 求解器故障报告（求解器已重写），历史归档候选 |
| `docs/AERO_SIDE_DEVICES.md`、`docs/FSAE_3D仿真提示词.md` | 🟡 历史/随笔，归档候选 |
| `.superpowers/brainstorm/*` | 🔴 已被 gitignore，纯噪音，可清 |

### 3.4 数据 / 运行时

| 路径 | 状态 |
|---|---|
| `data/store/`（chassis_designs/legacy-import.json + 14 个 analysis_cases） | 🟢 运行时权威存储（gitignore，启动自动重建） |
| `data/persistent_state.json` / `hardpoint_overrides.json`(`{}`) / `defaults_pipe.json` | 🟢/🟡 运行时数据（gitignore）；overrides 已空，历史遗留 |
| `data/pbr_check.png` | 截图 | ✅ 已删除（2026-08-21 用户指示截图全删） |
| `logs/server.log` | 🔴 运行时日志（gitignore） |
| `.pytest_cache` / `.ruff_cache` | 🔴 垃圾 |
| `.workbuddy/` | 🟡 跨会话记忆，未跟踪；建议进 .gitignore |

### 3.5 工程化与 Git

- `run.py` / `Makefile` / `pyproject.toml` / `requirements.txt` / `start_modeler.bat` — 🟢 正常。
- **分支**：`main` 已被 `workbench-rewrite` 完全包含（workbench 超前 62 个提交，main 无独有提交），`main` 是过期祖先 → 可合并/删除。
- **工作区**：有 6 个已修改未提交 + 8 个未跟踪文件（bounce.py、theme.js、test_bounce.py、color-scheme-preview.html、ref1/2.png、.workbuddy、.superpowers 等）——**最近 2026-08-21 的 Rig 台架 / F1 配色工作还没提交**。
- `.vscode/settings.json` 里 `"git.enabled": false` —— VS Code 图形化 git 面板被关掉（可能是故意的，注意）。

---

## 4. 杂乱点登记（按发现列出）

1. **两代前端并存**：`web/index.html`(V10) 与 `web/modeler.html`(新) — 用户实际只用后者，前者还占着 `web/js/*`、`car3d/*`、`vite`、`dist/`。
2. **两代主题系统**：`web/js/theme.js`（旧工作台） vs `modeler.html` 内置 `PAL` — 2026-08-21 两边都做了配色改造，很容易改错文件（内存记录里就发生过错改旧版再迁移的事）。
3. **旧 API 与新 API 并存**：`/api/*`(约 20 个端点) 与 `/api/v2/*`(约 14 个) — v2 是主，旧的是兼容包装，除非彻底迁移否则都在。
4. **`src/config_backup_20260611.py` 躺在源码树里**（备份，git 可找回）。
5. **文档重复标题**：`DEVLOG.md` 有 3+ 个 `# 开发日志` 大标题堆叠；`PLAN.md` 有 2 个 `# 开发计划`，且上半段写"当前进度 V10"、下半段旧的还写"当前进度 V9"，互相矛盾。
6. **指标层有重叠实现**：`metrics/roll.py` 的 `compute_anti_dive / anti_squat / compute_jacking` 疑似没人调（v2 用的是 `kinematics.py` 的新版）；`analyze.py` 还在用 roll.py 的旧 `compute_roll_center` —— 属于"新旧两套并存"的又一处。
7. ~~根目录堆了参考件~~ ✅ 已处理：魔改 DWB 归位 `dwb-mod/`，截图类 PNG 全部删除（2026-08-21）。
8. **参考文档/旧报告未归档**：2026-06 的 specs/plans、FAULT_ANALYSIS_REPORT、AERO_SIDE_DEVICES。
9. **`v2.py` 65KB 单文件**：设计/store/cases/results/metrics 全挤在一个路由文件，已超出"路由"职责。
10. **数据模型双轨**：旧 `config.py DESIGN_PARAMS`（参数化几何） 与 新 `data/store`（方案/工况/结果三层）并存，legacy-import 是二者之间的胶水——设计如此，但新开发要明白入口在 store、几何源在 config。

---

## 5. 清理方案（按风险分档）

### A. 安全 & 立即收益（不动运行逻辑）
- [x] 本梳理文档 `docs/PROJECT_MAP.md`（就是这份）。
- [ ] 修 `DEVLOG.md` / `PLAN.md` 的重复标题，把 `PLAN.md` 的"当前进度"改到一致（以 V1 重造为准）。
- [ ] 提交当前未提交的工作（bounce/rig、theme、F1 配色等），给 `workbench-rewrite` 一个干净基线。
- [ ] 把 `.workbuddy/`、根目录临时 PNG 加进 `.gitignore` 规则梳理。
- [ ] 删 `.pytest_cache` / `.ruff_cache` / `logs/server.log`（可执行文件操作，不动 git）。

### B. 归档 / 移出活跃树（git 历史都能找回）
- [ ] `src/config_backup_20260611.py` → 删或移到 `ref/`。
- [x] 根目录 `double-wishbone-suspension.html` → `dwb-mod/`（独立版本目录 + README）；截图类 PNG 已全删（用户指示）。
- [ ] 2026-06 的 specs/plans + `FAULT_ANALYSIS_REPORT.md` + `AERO_SIDE_DEVICES.md` + `FSAE_3D仿真提示词.md` → `docs/archive/`。
- [ ] `.superpowers/brainstorm/*`、`data/pbr_check.png`、`logs/` → 清。

### C. 需要你拍板（涉及功能取舍）
- [ ] **前端单轨化**：以 `modeler.html` 为标准 → `web/index.html` + `web/js/*` + `car3d/*` + `dist/` + vite 全部退役删除？还是保留 `index.html` 作为"展示版"并存？（若删，旧 /api 的 analyze/tubes/faces/aero 会失去唯一调用方）
- [ ] **旧 `/api/*` 是否保留**：彻底迁移后删掉，还是永久当兼容层？（v2 的求解还要借 `solve.py` 的 `_solve_axle`，暂时不能整体删 solve.py）
- [ ] **`metrics/roll.py` 死代码清理**（先让小脚本确认无引用再删）。

### D. 长期（可选，重构）
- [ ] 把 `v2.py`(65KB) 按资源拆成 `routes/v2/{designs,cases,solve,analysis}.py`。
- [ ] 指标层去重：统一 `kinematics.py` 为新标准，`roll.py`/`analyze.py` 收敛到它。
- [ ] 数据访问统一走 `store`，逐步弱化对 `config.py` 全局 dict 的依赖。

---

## 6. 需要你确认的三件事

1. **前端怎么收**：只留 `modeler.html`，旧 V10 工作台（`index.html` + `web/js/*`）删掉？还是保留并存？
2. **旧 `/api/*`**：保留作兼容，还是本轮一并规划迁移下线？
3. **清理的激进程度**：只做 **A**（文档 + 提交 + 修标题），还是 **A+B**（加归档），还是 **A+B+C**（连功能取舍一起处理）？
