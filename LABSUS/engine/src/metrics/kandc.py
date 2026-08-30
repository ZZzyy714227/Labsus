"""K&C 增益指标层：由扫掠曲线提取工业常用增益（°/25mm、°/kN、MR 矩阵、RC 迁移）。

单一实现约定（F-12/F-13，2026-08-30）：
- `_slope` 是本模块与全引擎唯一的中央差分内核（供 v3service/chassis 共用，
  删除了两处逐字拷贝）。数学 = 最近邻采样点中央差分（讲义第五讲钦定
  h 窗口的精神：噪声来自位移残差 1e-13，差分窗口取实际采样步长最稳）。
- `kinematics.py` 的同名指标为状态机包装（MetricResult），其数值内核
  委托本模块 `_slope`，两边数学恒等（F-12 双语义收敛）。
- 端点用单侧窗口（只有一个邻点时用该侧差分），不再放大端点增益。
"""
import numpy as np

# F-10（讲义 A.2 修订）：力轴差分不适用固定 ±2N 窗口（力噪声量级与位移不同），
# 统一走最近邻中央差分（实际步长），由 `window` 参数显式控制期望窗口宽度。
def _slope(y: list, x: list, at: float) -> float:
    """最近邻采样点中央差分 dy/dx @ at。

    - 有效点：自动跳过 None（扫掠中偶发求解失败的曲线点）。
    - 取 at 两侧最近的两个**有效**采样点做差商；单侧不足时退化为单侧
      差分（端点不再虚高一倍）。少于 2 个有效点 → 0.0。
    """
    xs = [float(x[i]) for i in range(len(x)) if y[i] is not None]
    ys = [float(y[i]) for i in range(len(y)) if y[i] is not None]
    n = len(xs)
    if n < 2:
        return 0.0
    # 找到 at 两侧最近的有效点
    below = [i for i in range(n) if xs[i] <= at]
    above = [i for i in range(n) if xs[i] >= at]
    lo = below[-1] if below else 0
    hi = above[0] if above else n - 1
    if lo == hi:
        # at 恰落在采样点上（或全在一侧）：放宽为最近邻对
        if lo > 0:
            lo -= 1
        elif hi < n - 1:
            hi += 1
        else:
            return 0.0
    dx = xs[hi] - xs[lo]
    if abs(dx) < 1e-12:
        return 0.0
    return (ys[hi] - ys[lo]) / dx


def camber_gain_deg_per_25(camber: list, travel: list, at: float) -> float:
    return round(25.0 * _slope(camber, travel, at), 6)


def bump_steer_deg_per_25(toe: list, travel: list, at: float) -> float:
    return round(25.0 * _slope(toe, travel, at), 6)


def compliance_toe_deg(toe: list, force: list, at: float) -> float:
    """单位 °/1000N（对力曲线斜率，最近邻中央差分——F-10 不再用 ±2N 窗口）。"""
    return round(1000.0 * _slope(toe, force, at), 6)


def mr_matrix(damper_travel: list, wheel_travel: list, at: float) -> float:
    """d(DamperTravel)/d(WheelTravel)（导数矩阵对角线项，S1 每轮单值）。"""
    return round(_slope(damper_travel, wheel_travel, at), 6)


def rc_migration(rc_heights: list, travel: list) -> tuple[float, float]:
    """RC 高度迁移：返回 (工作段 max−min, 起止差值 start−end)。"""
    return (round(float(np.max(rc_heights) - np.min(rc_heights)), 2),
            round(float(rc_heights[0] - rc_heights[-1]), 2))


# ── F-12：kinematics.py 状态机版本的数值内核（单一实现） ──────────
def slope_at_travel(curve: list, travel: list, at_travel: float):
    """供 metrics/kinematics.py 委托的差商接口：返回 (slope, i_lo, i_hi) 或 None。

    None 曲线点自动跳过；两侧最近有效点对做中央差分；单侧退化为单侧差分。
    """
    valid = [(i, float(v)) for i, v in enumerate(curve) if v is not None]
    if len(valid) < 2:
        return None
    below = [p for p in valid if travel[p[0]] <= at_travel]
    above = [p for p in valid if travel[p[0]] >= at_travel]
    lo = below[-1] if below else valid[0]
    hi = above[0] if above else valid[-1]
    if lo[0] == hi[0]:
        if valid[0][0] == valid[-1][0]:
            return None
        lo, hi = valid[0], valid[1]
    dx = travel[hi[0]] - travel[lo[0]]
    if abs(dx) < 1e-12:
        return None
    return (hi[1] - lo[1]) / dx, lo[0], hi[0]