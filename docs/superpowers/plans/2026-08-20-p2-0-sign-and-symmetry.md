# P2-0 坐标与符号规范冻结 + K-1/K-2/K-3 修复实施计划

> **For agentic workers:** 本计划直接在当前会话执行；完成后同步 DEVLOG 并提交。
> 依据：`docs/superpowers/specs/2026-08-20-v1-progress-sync.md` 六·P2-0、设计文档 §12、`src/core/convention.py` 已知问题登记。

## 目标

冻结八项定义（Camber/Toe/KPI-SAI/Caster/Scrub/Mechanical Trail/Ackermann），修复 K-1/K-2/K-3，
将 `fix_left_angles()` 与 `toe<90°` 类后处理特判移出规范层，镜像回归达设计文档 §13.2 的 1e-6 容差。

## 实测根因（2026-08-20 诊断数据）

1. **K-1 左右 Scrub 不对称（19.78 vs 17.84）**：
   `src/tire.py::compute_contact_patch` 使用旧坐标系遗留公式 `camber=-atan2(y_axis[0], …)`
   （注释 "X=up after axis swap"），只算得 -0.218°（正确 -2.49°），且横向偏移方向左右同向（均 +Y），
   左轮应向外（-Y）却向内。修复：改为轮面投影（DWB-SIM 式 `rad=normalize(Z - y_ax·y_ax[2])`），天然镜像对称。
2. **K-2 Toe 符号**：当前 toe-in = 负。冻结为 **toe-in = 正**（两侧），公式 `toe = -side·atan2(fwd_y, fwd_x)`，
   轮面前向迹线取 +X 方向；`fix_left_angles` 对 toe 的翻号与 180° 兜底（`abs<90`）一并删除。
3. **K-3 Caster/Trail 符号**：
   - `trail = kg_x - contact_x` 公式本身已是经典正确（正 = 主销接地点在印迹前方），
     `convention.py` 的 K-3 条款自相矛盾（括号定义与等式相反），修正文档。
   - `caster = atan2(-kp_vec[0], -kp_vec[2])` 与经典相反（top-forward 输出正号）。
     冻结为经典：**正 = 主销轴上端后倾**，`caster = atan2(kp_vec[0], -kp_vec[2])`。
   - **默认几何反 caster**：`derive_hardpoints` 的 `z_local` x 分量为 `-sin(ca)`，
     实际生成 top-forward（实测 UP1.x=+1.96 > UP2.x=-11.11），与注释 "tilt backward" 矛盾。
     修复为 `+sin(ca)`，使 `caster: 5.0` 生成经典正 caster。camber/KPI 不受影响（y/z 比例不变）。

## 冻结的八项定义（写入 convention.py + 设计文档 §12）

| 指标 | 定义 | 符号 | 公式（side = +1 右轮 / -1 左轮，按 UP5[1] 自动判别） |
|---|---|---|---|
| Camber | 前视，胎顶相对车辆中心线 | 负 = 胎顶向内（内倾） | `-atan2(spin_z, hypot(spin_x, spin_y))`（两侧相同） |
| Toe | 俯视，轮面前向水平迹线 | 正 = Toe-in | `-side·atan2(fwd_y, fwd_x)` |
| KPI/SAI | 正视转向轴与垂线夹角 | 正 = 轴上端向内 | `side·atan2(kp_vec[1], -kp_vec[2])` |
| Caster | 侧视转向轴与垂线夹角 | 正 = 轴上端后倾（经典） | `atan2(kp_vec[0], -kp_vec[2])`（两侧相同） |
| Scrub | 主销接地点与印迹中心横向距离 | 正 = 印迹在外侧 | `side·(contact_y - kg_y)` |
| Mechanical Trail | 主销接地点与印迹中心纵向距离 | 正 = 主销接地点在前（经典） | `kg_x - contact_x`（两侧相同） |
| Ackermann | 左转/右转内外轮转角关系 | 内轮转角大于外轮为正向 | P2-1/P2-2 随转向指标冻结百分比公式 |

## 实施步骤

1. `src/tire.py`：`compute_contact_patch` 改轮面投影（镜像对称），camber 字段用正确公式，z 钉 0 平面。
2. `src/solver/angles.py`：`compute_alignment_angles` 加 side 自动判别（UP5[1] 符号），
   应用上表公式；**删除 `fix_left_angles`**。
3. `src/hardpoints.py`：`derive_hardpoints` z_local x 分量 `-sin(ca)→+sin(ca)`。
4. `src/core/convention.py`：冻结定义、修正 K-3 自相矛盾、移除 K-1/K-2/K-3 登记（保留 K-4）、
   `spec_revision → v1-p2-0`。
5. 调用方：`src/routes/solve.py`、`src/routes/hardpoints.py`、`src/routes/v2.py` 移除 `fix_left_angles`。
6. 测试：
   - `tests/test_convention.py`：重新探针黄金值（caster +5.005、trail +22.3、scrub +29.8、camber -2.49、kpi +2.51、toe 0）；
     镜像对称 xfail 哨兵移除并升级为严格 1e-6；toe-in 为正断言；side 判别测试。
   - `tests/test_hand_benchmark.py`：合成用例修正为经典语义（top-rearward → +caster/+trail）。
   - `tests/test_kinematics.py`：镜像 camber 改为左右同号；转向 toe 方向断言按新约定修正；单调性方向反转。
   - `tests/test_full_validation.py`：camber 对称断言改同号。
7. 重新生成 `data/reports/p1_solver_gate.json`（`python -m src.solver.p1_benchmark --write-report …`）。
8. 验证：P1 聚焦 + P2-0 相关测试、Ruff、mypy、`git diff --check`；全量测试受 Windows 沙箱环境限制时如实记录。
9. 文档：convention.py 即规范真源；DEVLOG 新增条目；progress-sync 更新 K-1/K-2/K-3 状态。
