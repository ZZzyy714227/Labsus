"""V1 冻结线的运动学指标（P2-2 设计文档 §6）——**生产不可达，仅门禁/对照用**。

本模块原位于 `src/metrics/kinematics.py`。M5 结构整理（2026-09-20）确认：
整条链 `legacy.models → legacy.metrics → legacy.kinematics` 在 `/api/v3`
生产路径上**零消费者**——生产指标走 `src/api/chassis.py`（准静态）与
`src/metrics/kandc.py`（差分内核真源）。故连同其余 4 个 V1 模块迁入
`src/legacy/`，保留给两类用途：

1. **S1 门禁手算对照**（`tests/test_s1_gate.py`、`tests/test_w4_consistency.py`）；
2. **F-12「差分内核单一实现」守卫**：本状态机版必须与 `kandc` 浮点版逐位一致。

因此以下 4 个函数被测试引用，**不得删除**：
`motion_ratio` / `jacking` / `bump_steer_deg_per_25` / `camber_gain_deg_per_25`。
其余 8 个函数（steering_camber_gain / roll_center_height / svic_point /
side_view_ic / anti_dive / anti_squat / pitch_center / _anti_pct_svic）
在生产与测试中均零引用，已随本次整理删除。

约定（P2-0 冻结）：坐标系 X 前 / Y 右 / Z 上；Toe-in 正；Camber 负=内倾。
"""
from __future__ import annotations

import math

from src.legacy.metrics import MetricResult, not_applicable, ok, solver_failed
from src.metrics.kandc import slope_at_travel


def bump_steer_deg_per_25(toe_curve, travel_curve, at_travel: float) -> MetricResult:
    """Bump Steer：Δtoe/Δtravel，归一化 °/25mm。

    F-12（2026-08-30）：数值内核委托 metrics/kandc.slope_at_travel（最近邻
    中央差分单一实现），不再维护第二份 _slope_at 差分逻辑。
    """
    slope = slope_at_travel(toe_curve, travel_curve, at_travel)
    if slope is None:
        return solver_failed("bump_steer", "deg/25mm", "扫掠曲线不足以计算导数")
    return ok(slope[0] * 25.0, "deg/25mm")


def camber_gain_deg_per_25(camber_curve, travel_curve, at_travel: float) -> MetricResult:
    """Camber Gain：Δcamber/Δtravel，归一化 °/25mm（内核同 bump steer）。"""
    slope = slope_at_travel(camber_curve, travel_curve, at_travel)
    if slope is None:
        return solver_failed("camber_gain", "deg/25mm", "扫掠曲线不足以计算导数")
    return ok(slope[0] * 25.0, "deg/25mm")


def motion_ratio(damper_travel_curve, travel_curve, at_travel: float) -> MetricResult:
    """几何 Motion Ratio：|Δdamper / Δwheel|（rockers 扫掠，中央差分）。

    取代 analyze.py 硬编码的 mr_f=0.7 / mr_r=0.6。
    F-12/F-13：数值内核委托 metrics/kandc.slope_at_travel（单一中央差分内核）。
    """
    slope = slope_at_travel(damper_travel_curve, travel_curve, at_travel)
    if slope is None:
        return solver_failed("motion_ratio", "-", "rockers 扫掠数据不足")
    return ok(abs(slope[0]), "-")


def jacking(fy_sprung_n: float, rc_h_mm: float, track_mm: float) -> MetricResult:
    """Jacking 垂向力：侧向力经悬架连杆传至侧倾中心（RC）时的垂向分量。

    ⚠️ 生产路径不调用本函数：`src/api/chassis.py` 的 `quasi_loads` 按轴就地
    展开同一公式（`f_jack_f = mS·ay·(b/L)·(2·zrc_f/tf)`）。本函数是测试用
    的单点对照实现（`tests/test_v3_chassis.py` 对拍两者）。

    侧视：每侧接地印迹的侧向力沿 接地点→IC 连线传递，双侧合成后作用在
    RC；等效垂向分量（对称轴，RC 在中线上）：
        F_jack = F_y · 2·z_RC / T
    正 RC → 抬升簧载（千斤顶效应）；负 RC → 下拉。抬升量由调用方除以
    轴垂向刚度得到。与讲义 EP10 拓展同源。
    """
    if not math.isfinite(fy_sprung_n):
        return solver_failed("jacking", "N", "Fy 非有限")
    if track_mm <= 0 or not math.isfinite(track_mm):
        return solver_failed("jacking", "N", "轮距无效")
    if not math.isfinite(rc_h_mm):
        return not_applicable("jacking", "N", "RC 高度不可用")
    return ok(fy_sprung_n * (2.0 * rc_h_mm / track_mm), "N",
              note="正=抬升簧载；抬升量需除以轴垂向刚度")
