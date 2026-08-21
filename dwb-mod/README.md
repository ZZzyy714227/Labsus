# dwb-mod —— 魔改 DWB（参考原型 · 独立版本）

> 本目录承载 **`double-wishbone-suspension.html` 的魔改演进版**（git 历史中以
> `dwb` / `dwb-modeling` 前缀提交标注），与自研系统**完全独立、互不引用**。

## 这是什么

- 单文件双叉臂悬架运动学/动力学仿真台（DWB-SIM）的魔改版：在原始参考原型上持续加入
  后轴、双轴同屏、逐角拖拽、逐角行程/俯仰滑块、轴距滑块、后轴 ARB、轴视图 T6/T7 读数等。
- 相比自研系统，它是一套**浏览器内自足**的实验/可视化版本：无后端、无构建、双击即开。

## 运行

```
直接用浏览器打开 double-wishbone-suspension.html
```

## 边界（重要）

- **坐标系与自研系统不同**：本文件 X=外侧(右) / Y=向前 / Z=向上；
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