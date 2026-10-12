"""V1 冻结线（历史血脉）——**生产不可达，勿在新代码中引用**。

`src/legacy/` 收纳的是 2026-08-30（G12/V1→v3 隔离）之前的第一代实现：
坐标系为 **X 前 / Y 右 / Z 上**，与 v3 主线（X 外侧 / Y 前 / Z 上）是两套
刻意并存的坐标血脉，登记真源见 `LABSUS/INTENTIONAL_DIFFERENCES.md`。

| 模块 | 原位置 | 现状 |
|---|---|---|
| `models.py` | `src/core/models.py` | V1 数据模型（ChassisDesign / AxleHardpoints / AnalysisCase…）；**仅 `ResultStatus` 被 legacy 内部使用** |
| `metrics.py` | `src/core/metrics.py` | 七状态 `MetricResult` 状态机（P2-3）；生产返回裸 float/dict |
| `kinematics.py` | `src/metrics/kinematics.py` | V1 指标；仅 4 个函数被门禁测试引用 |
| `angles.py` | `src/solver/angles.py` | V1 定位角（X 前系）；S1 门禁手算对照 |
| `pose.py` | `src/solver/mechanism/pose.py` | V1 求解→定位角适配器 |

## 为什么保留而不是删除

1. **门禁价值**：`tests/test_s1_gate.py` / `test_w4_consistency.py` /
   `test_metric_pipeline_governance.py` 用它们做**手算对照**与
   **F-12 差分内核单一实现**守卫（legacy 状态机版必须与 `kandc` 浮点版逐位一致）。
2. **坐标系代差守卫**：`test_metric_pipeline_governance.py` 钉住 V1 与 v3
   两套坐标系的指纹（88.24° / 175.07°），防止有人把两套血脉混用。
3. **历史可读性**：手册若干章引用 V1 公式，保留实现便于对照。

## 红线

- **生产代码（`src/api/`、`src/solver/`、`src/metrics/kandc.py`、`server.py`）
  不得 import 本包** —— 由 `tests/test_legacy_isolation.py` 自动守卫。
- 新功能一律走 v3 主线；本包只接受"为门禁保持可运行"的最小维护。
- `src/core/convention.py` **例外留在原位**：它是 V1 坐标约定的定义真源，
  被手册直接引用，且 `legacy/models.py` 依赖它（留原位可避免文档路径漂移）。
"""
