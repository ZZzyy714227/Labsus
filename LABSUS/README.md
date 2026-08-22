# LABSUS —— 前后端隔离开发工作区

> **隔离声明（2026-08-21）**：本目录承载工业级底盘分析软件（对标 OptimumK/ADAMS）的**全部后续开发**。
> 主仓库其余文件（`dwb-mod/versions/*`、`web/`、`src/` 等）自本目录建立起**冻结隔离**，不再被开发改动。

## 结构

```
LABSUS/
├── web/
│   └── dwb-pro-fullchassis.html      ← 前端起点（Gemini v4 版复制，后续前端开发只在这里）
├── engine/                           ← Python 引擎（S1 起，Subagent-Driven 执行）
│   ├── src/
│   │   ├── components/               bushing 6DOF 元件（T1）
│   │   ├── solver/
│   │   │   ├── mechanism/            机制求解器基线快照（复用，不改签名）
│   │   │   ├── forces.py             二力杆/球铰静力层（T2）
│   │   │   ├── compliance_transform.py  衬套小角变换（T3）
│   │   │   └── compliance.py         K&C 两层求解器（T4/T8）
│   │   ├── metrics/kandc.py          K&C 增益指标（T6）
│   │   ├── core/                     数据模型基线快照（CaseVersion 等）
│   │   └── tire_mf.py                Pacejka 子集（T7）
│   ├── tests/                        pytest（含 S1 验收门）
│   └── benchmarks/optimumk_examples.py   OptimumK 对照基准
└── README.md
```

## 迭代约定

- 引擎任务按 `docs/superpowers/plans/2026-08-21-chassis-analyzer-s1.md` 执行（T1–T10），工作区根 = `engine/`；
- 前端后续开发仅修改 `web/dwb-pro-fullchassis.html`（复制当前主力 → 改 → 稳定后入档）；
- 提交信息沿用 `feat(engine)/feat(web)` 前缀；本目录内提交与其他文件互不牵扯。