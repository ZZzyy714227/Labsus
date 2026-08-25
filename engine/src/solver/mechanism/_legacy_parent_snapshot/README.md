# _legacy_parent_snapshot／父仓冻结快照（不可在 LABSUS 内运行）

> 状态：**死代码隔离区**（2026-08-22，r2 研究 P1 处置）。三个文件是 2026-08-21
> 从主仓库 `New_suspension` 复制进来的基线快照，**顶部直接依赖父仓模块**：
>
> - `bench.py` → `from hardpoints import DEFAULT_HARDPOINTS, ...`、
>   函数体内 `from routes.solve import _solve_axle`
> - `v2adapter.py` → `from config import DEFAULT_FRAME_NODES`、`from tire import compute_contact_patch`
> - `from_legacy.py` → `from config import ...; from hardpoints import ...`
>
> 而 conftest.py 的隔离边界只挂载 `engine/src`，父仓模块在本工作区**不可导入**
> （实测 ModuleNotFoundError）。它们不参与引擎/服务/测试的任何路径。

## 为什么保留

README 的快照约定：机制求解器的演化参照。删除会丢失与父仓顺序解
`_solve_axle` 头对头对比的历史基准定义（56 例矩阵 + G1–G4 门禁判据）。

## 如何重新启用（二选一）

1. **本地化依赖**：把 `DEFAULT_HARDPOINTS / DEFAULT_REAR_HARDPOINTS /
   mirror_left / DEFAULT_FRAME_NODES / compute_contact_patch / _solve_axle`
   移植为 engine 内等价实现，替换顶部绝对导入后移出本目录；
2. **回父仓环境运行**：仅当从主仓库根目录挂载 sys.path 时可用（父仓已冻结，
   不推荐）。

## 历史参考值（DEVLOG 记录，LABSUS 内不可复现）

4 角 × 7 行程 × 2 齿条 56 例：worst 残差 3.5e-11mm、单姿态 p95 21.95ms。
在 LABSUS 内重建等效门禁的正确路径是以本目录 `bench.py` 的矩阵定义为准、
用 `build_mechanism(PRO_POINTS)`（见 tests/test_s1_gate.py）替换
`build_side_from_legacy` 后重写 runner。
