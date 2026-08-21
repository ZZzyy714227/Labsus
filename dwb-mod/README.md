# dwb-mod —— DWB-SIM 单文件系列版本库

> 本目录承载 **DWB-SIM 单文件悬架仿真台的全部开发版本**（git 历史中以
> `dwb` / `dwb-modeling` 前缀提交标注），与自研系统（`web/` + `src/`）**完全独立、互不引用**。

## 这是什么

浏览器内自足的单文件悬架运动学/动力学仿真台系列：无后端、无构建、双击即开。
所有大版本归档在 `versions/`，每个文件即一个完整可运行的开发版本。

## 版本索引

| 文件 | 定位 | 说明 |
|---|---|---|
| `versions/v4-dwb-pro-fullchassis.html` | **当前主力** | PRO 闭式求解器 · 前推杆+后拉杆全车 · 每轴独立弹性参数 · 四轮独立行程/俯仰/轴距 · 轴视图过滤 · 四轮定位表 · 激励/路面/持久化全功能 |
| `versions/v3-dwb-pro-chassis.html` | 整车化第一版 | PRO 求解器四机构同屏（全局弹性参数，较 v4 功能少） |
| `versions/v2-dwb-fullchassis-fsr06.html` | 投影 GS 正式版 | 原 `double-wishbone-suspension.html`：全底盘 T1-T6 · FSR-06 前推后拉预设 · 首帧卡死修复后状态 |
| `versions/v1-dwb-fullchassis-fsr06-early.html` | FSR-06 早期快照 | FSR-06 预设已加入、泪滴渲染尚未落地的中间态（2396 行） |
| `web/versions/v1-dwb-web-simview.html` | 自研线历史版 | 从 git 历史恢复的自包含 sim-view 版（曾因模块化重构被删除） |

## 运行

```
直接用浏览器打开 versions/v4-dwb-pro-fullchassis.html   （推荐，当前主力）
```

## 边界（重要）

- **坐标系与自研系统不同**：本系列 X=外侧(右) / Y=向前 / Z=向上；
  自研系统（`src/core/convention.py`）为 X=向前 / Y=右侧 / Z=向上。
  两边的硬点/指标数值**不可直接互引**，跨边取数必须先换算。
- 本目录文件**不参与**自研系统运行链（`run.py` → `src/` → `web/modeler.html`）。
- 对两侧的解算差异与 DWB 方法论，见：
  - 深度研究报告：`docs/research/2026-08-21-dwb-sim-deep-research/`
  - 系统方法论：`docs/superpowers/specs/2026-08-16-dwb-sim-system-methodology.md`
- 自研侧已按 DWB 建模完成第①子阶段（机制级求解器，残差 ~1e-13mm）：
  `docs/superpowers/specs/2026-08-21-dwb-mechanism-solver-design.md`
  `docs/superpowers/plans/2026-08-21-dwb-mechanism-solver.md`

## 版本约定

- 对本目录做修改时，提交信息沿用 `dwb(...)` / `fix(dwb-modeling): ...` 前缀，
  与自研系统（`feat(v2)/fix(...)` 等）在 git 历史中可一眼区分。
- 新版本落版时：复制当前主力 → 修改 → 稳定后以 `v<N+1>` 纳入 `versions/` 并更新本表。