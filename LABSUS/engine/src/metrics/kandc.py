"""K&C 增益指标层：由扫掠曲线提取工业常用增益（°/25mm、°/kN、MR 矩阵、RC 迁移）。"""
import numpy as np


def _slope(y: list[float], x: list[float], at: float) -> float:
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    if len(x) < 2:
        return 0.0
    return float(np.interp(at + 2.0, x, y) - np.interp(at - 2.0, x, y)) / 4.0


def camber_gain_deg_per_25(camber: list[float], travel: list[float], at: float) -> float:
    return round(25.0 * _slope(camber, travel, at), 6)


def bump_steer_deg_per_25(toe: list[float], travel: list[float], at: float) -> float:
    return round(25.0 * _slope(toe, travel, at), 6)


def compliance_toe_deg(toe: list[float], force: list[float], at: float) -> float:
    """单位 °/1000N（对力曲线斜率）。"""
    return round(1000.0 * _slope(toe, force, at), 6)


def mr_matrix(damper_travel: list[float], wheel_travel: list[float], at: float) -> float:
    """d(DamperTravel)/d(WheelTravel)（导数矩阵对角线项，S1 每轮单值）。"""
    return round(_slope(damper_travel, wheel_travel, at), 6)


def rc_migration(rc_heights: list[float], travel: list[float]) -> tuple[float, float]:
    """RC 高度迁移：返回 (工作段 max−min, 起止差值 start−end)。"""
    return (round(float(np.max(rc_heights) - np.min(rc_heights)), 2),
            round(float(rc_heights[0] - rc_heights[-1]), 2))
