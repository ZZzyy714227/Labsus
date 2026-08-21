"""P2-2 运动学指标（设计文档 §6、进展文档 P2-2）。

从已求解的四轮几何（WheelPose + WheelAngles）与整车参数派生 P2-2 指标。
所有函数返回 `MetricResult`（七状态状态机，P2-3），禁止静默 None。

约定（P2-0 冻结）：
- 坐标系 X 前 / Y 右 / Z 上；Toe-in 正；Camber 负=内倾；KPI 正=轴上端向内；
  Caster 正=轴上端后倾；Scrub 正=印迹外侧；Trail 正=主销接地点在前。
- Included Angle = KPI + Camber（代数和，与参考实现 DWB-SIM 一致）。
"""
from __future__ import annotations

import math

import numpy as np

from core.metrics import MetricResult, not_applicable, not_implemented, ok, solver_failed

R2D = 180.0 / math.pi
D2R = math.pi / 180.0


# ---------------------------------------------------------------- helpers

def _line_intersect_2d(p1, d1, p2, d2):
    """2D 直线交点：p1 + s*d1 与 p2 + t*d2。返回 (x, y) 或 None（平行/退化）。"""
    denom = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(denom) < 1e-12:
        return None
    t = np.asarray(p2, dtype=float) - np.asarray(p1, dtype=float)
    s = (t[0] * d2[1] - t[1] * d2[0]) / denom
    return np.asarray(p1, dtype=float) + s * np.asarray(d1, dtype=float)


def _slope_at(curve, x, index=0):
    """在 index 处的一阶导数 dy/dx：取两侧最近有效点作中央差分。

    返回 (slope, i0, i1) 或 None。curve 中 None 视为无效点。
    """
    valid = [(i, float(v)) for i, v in enumerate(curve) if v is not None]
    if len(valid) < 2:
        return None
    below = [p for p in valid if p[0] < index]
    above = [p for p in valid if p[0] > index]
    lo = below[-1] if below else valid[0]
    hi = above[0] if above else valid[-1]
    if lo[0] == hi[0]:
        # index 落在唯一有效点：退化为前两点
        if valid[0][0] == valid[-1][0]:
            return None
        lo, hi = valid[0], valid[1]
    dx = x[hi[0]] - x[lo[0]]
    if abs(dx) < 1e-12:
        return None
    return (hi[1] - lo[1]) / dx, lo[0], hi[0]


# ---------------------------------------------------------------- per-wheel

def included_angle(kpi_deg: float, camber_deg: float) -> MetricResult:
    """Included Angle = KPI + Camber（代数和）。"""
    return ok(kpi_deg + camber_deg, "deg")


def steering_camber_gain(camber_0: float, camber_1: float,
                         toe_0: float, toe_1: float) -> MetricResult:
    """Steering Camber Gain：Δcamber / Δsteer，deg/deg。

    steer 角取本轮 toe 相对直行（rack=0）的变化量。
    """
    d_steer = toe_1 - toe_0
    if abs(d_steer) < 1e-6:
        return not_applicable("steering_camber_gain", "deg/deg",
                              "无转向输入（Δsteer≈0）")
    return ok((camber_1 - camber_0) / d_steer, "deg/deg")


def bump_steer_deg_per_25(toe_curve, travel_curve, at_travel: float) -> MetricResult:
    """Bump Steer：Δtoe/Δtravel，归一化 °/25mm（中央差分）。"""
    idx = min(range(len(travel_curve)),
              key=lambda i: abs(float(travel_curve[i]) - at_travel))
    slope = _slope_at(toe_curve, [float(t) for t in travel_curve], idx)
    if slope is None:
        return solver_failed("bump_steer", "deg/25mm", "扫掠曲线不足以计算导数")
    return ok(slope[0] * 25.0, "deg/25mm")


def camber_gain_deg_per_25(camber_curve, travel_curve, at_travel: float) -> MetricResult:
    idx = min(range(len(travel_curve)),
              key=lambda i: abs(float(travel_curve[i]) - at_travel))
    slope = _slope_at(camber_curve, [float(t) for t in travel_curve], idx)
    if slope is None:
        return solver_failed("camber_gain", "deg/25mm", "扫掠曲线不足以计算导数")
    return ok(slope[0] * 25.0, "deg/25mm")


def track_change_mm(wc_y_solved: float, wc_y_design: float) -> MetricResult:
    """单轮轮距变化：|y_solved| - |y_design|（正 = 轮距加宽）。"""
    return ok(abs(wc_y_solved) - abs(wc_y_design), "mm")


def longitudinal_change_mm(wc_x_solved: float, wc_x_design: float) -> MetricResult:
    """单轮纵向位移（用于 Wheelbase Change）。"""
    return ok(wc_x_solved - wc_x_design, "mm")


# ---------------------------------------------------------------- axle

def ackermann_pct(toe_left: float, toe_right: float,
                  track_mm: float, wheelbase_mm: float) -> MetricResult:
    """Ackermann %：基于左右轮转向角（toe 相对直行）。

    内轮 δi = max(|Δtoe_l|, |Δtoe_r|)，外轮 δo = min（外轮转向角绝对值较小）。
    理想外轮角：δo_ideal = atan(L / (L/tan(δi) + t))。
    Ackermann % = (δi - δo) / (δi - δo_ideal) * 100。
    平行转向 0%，完全阿克曼 100%，反阿克曼 < 0%。
    """
    steer_l = toe_left
    steer_r = toe_right
    # 以本轴静态 toe 为基准需要传入直行参考；此处约定入参已是相对直行的转向角。
    mag_l, mag_r = abs(steer_l), abs(steer_r)
    inner = max(mag_l, mag_r)
    outer = min(mag_l, mag_r)
    if inner < 0.5:
        return not_applicable("ackermann", "%", "转向角过小（|δi|<0.5°）")
    if wheelbase_mm <= 0 or track_mm <= 0:
        return solver_failed("ackermann", "%", "无效 wheelbase/track")
    tan_inner = math.tan(inner * D2R)
    if tan_inner <= 1e-12:
        return not_applicable("ackermann", "%", "内轮转向角为 0")
    ideal_outer = math.atan2(wheelbase_mm,
                             wheelbase_mm / tan_inner + track_mm) * R2D
    denom = inner - ideal_outer
    if abs(denom) < 1e-9:
        return ok(100.0, "%")
    pct = (inner - outer) / denom * 100.0
    return ok(pct, "%")


def roll_center_height(ic_right, ic_left, cp_right, cp_left) -> MetricResult:
    """轴侧倾中心高：两侧 IC→接地点连线在 YZ 平面的交点。

    一侧 IC 缺失时退化为单侧 IC→接地点连线与中心线 y=0 的交点。
    ic/cp 为 (y, z) 元组。返回 z（mm），正 = 高于地面。
    """
    if ic_right is not None and ic_left is not None:
        p = _line_intersect_2d(
            (ic_right[0], ic_right[1]),
            (cp_right[0] - ic_right[0], cp_right[1] - ic_right[1]),
            (ic_left[0], ic_left[1]),
            (cp_left[0] - ic_left[0], cp_left[1] - ic_left[1]),
        )
        if p is not None:
            return ok(float(p[1]), "mm")
    # 单侧退化：IC→接地点连线与 y=0 的交点
    for ic, cp in ((ic_right, cp_right), (ic_left, cp_left)):
        if ic is None:
            continue
        y_ic, z_ic = float(ic[0]), float(ic[1])
        y_cp = float(cp[0])
        denom = y_ic - y_cp
        if abs(denom) < 1e-9:
            return ok(z_ic, "mm")
        z_rc = z_ic * (0.0 - y_cp) / denom
        return ok(z_rc, "mm")
    return solver_failed("roll_center_height", "mm", "两侧 IC 均不可用")


def svic_point(ch1, ch2, up1, ch3, ch4, up2):
    """侧视瞬心原始点 (x, z)，无则 None。

    构造（DWB-SIM 参考实现）：每条摆臂的侧视线 = 球头 + 摆臂轴方向
    （车架铰点连线 CH1→CH2 / CH3→CH4 在 X-Z 平面的投影方向）。
    两条侧视线在 X-Z 平面的交点即 SVIC。
    """
    uca_dir = (float(ch2[0]) - float(ch1[0]), float(ch2[2]) - float(ch1[2]))
    lca_dir = (float(ch4[0]) - float(ch3[0]), float(ch4[2]) - float(ch3[2]))
    p = _line_intersect_2d(
        (float(up1[0]), float(up1[2])), uca_dir,
        (float(up2[0]), float(up2[2])), lca_dir,
    )
    if p is None:
        return None
    return (float(p[0]), float(p[1]))


def side_view_ic(ch1, ch2, up1, ch3, ch4, up2) -> MetricResult:
    """侧视瞬心 SVIC：球头 + 摆臂轴方向（X-Z 平面）的两线交点。"""
    p = svic_point(ch1, ch2, up1, ch3, ch4, up2)
    if p is None:
        return not_applicable("side_view_ic", "mm", "上下摆臂线平行（无穷远）")
    return ok(p[0], "mm", note=f"SVIC z={p[1]:.1f}")


def _anti_pct_svic(svic, cp, wheelbase_mm, cg_height_mm, ax_frac_g: float) -> float | None:
    """anti % = 100 * tan(θ) * L * a_x / h_cg；θ = SVIC→接地点连线与水平夹角。"""
    if svic is None or wheelbase_mm <= 0 or cg_height_mm <= 0:
        return None
    dx = cp[0] - svic[0]
    if abs(dx) < 1e-9:
        return None
    slope = (svic[1] - cp[1]) / dx
    return 100.0 * slope * wheelbase_mm * ax_frac_g / cg_height_mm


def anti_dive(svic, cp, wheelbase_mm, cg_height_mm,
              brake_ax_g: float, brake_front_frac: float = 0.6) -> MetricResult:
    """前轴 Anti-dive %：SVIC 几何 + 制动减速与前后分配（重写，不再用正视 IC）。"""
    if svic is None:
        return not_applicable("anti_dive", "%", "SVIC 不可用")
    v = _anti_pct_svic(svic, cp, wheelbase_mm, cg_height_mm,
                       brake_ax_g * brake_front_frac)
    if v is None:
        return solver_failed("anti_dive", "%", "几何退化")
    return ok(v, "%")


def anti_squat(svic, cp, wheelbase_mm, cg_height_mm,
               accel_ax_g: float, drive_rear_frac: float = 1.0) -> MetricResult:
    """后轴 Anti-squat %：SVIC 几何 + 加速与驱动分配（重写）。"""
    if svic is None:
        return not_applicable("anti_squat", "%", "SVIC 不可用")
    v = _anti_pct_svic(svic, cp, wheelbase_mm, cg_height_mm,
                       accel_ax_g * drive_rear_frac)
    if v is None:
        return solver_failed("anti_squat", "%", "几何退化")
    return ok(v, "%")


def pitch_center(front_svic, front_cp, rear_svic, rear_cp) -> MetricResult:
    """Pitch Center：前后轴 SVIC→接地点连线在 X-Z 平面的交点。"""
    if front_svic is None or rear_svic is None:
        return not_applicable("pitch_center", "mm", "某轴 SVIC 不可用")
    p = _line_intersect_2d(
        (front_svic[0], front_svic[1]),
        (front_cp[0] - front_svic[0], front_cp[1] - front_svic[1]),
        (rear_svic[0], rear_svic[1]),
        (rear_cp[0] - rear_svic[0], rear_cp[1] - rear_svic[1]),
    )
    if p is None:
        return not_applicable("pitch_center", "mm", "两线平行（无穷远）")
    return ok(float(p[1]), "mm", note=f"PC x={p[0]:.1f} z={p[1]:.1f}")


def wheelbase_change(front_x_mean: float, rear_x_mean: float,
                     front_x_design: float, rear_x_design: float) -> MetricResult:
    """Wheelbase Change：轴距相对设计位形的变化（mm）。"""
    wb = rear_x_mean - front_x_mean
    wb0 = rear_x_design - front_x_design
    return ok(wb - wb0, "mm")


def motion_ratio(damper_travel_curve, travel_curve, at_travel: float) -> MetricResult:
    """几何 Motion Ratio：|Δdamper / Δwheel|（rockers 扫掠，中央差分）。

    取代 analyze.py 硬编码的 mr_f=0.7 / mr_r=0.6。
    """
    idx = min(range(len(travel_curve)),
              key=lambda i: abs(float(travel_curve[i]) - at_travel))
    slope = _slope_at(damper_travel_curve, [float(t) for t in travel_curve], idx)
    if slope is None:
        return solver_failed("motion_ratio", "-", "rockers 扫掠数据不足")
    return ok(abs(slope[0]), "-")


def jacking(roll_deg: float) -> MetricResult:
    """Jacking 抬升：依赖侧向载荷经 IC 的垂向分力（P3 载荷阶段实现）。

    P2-2 不伪造数值：显式 NOT_IMPLEMENTED。
    """
    return not_implemented("jacking", "mm",
                           "需要 P3 四轮载荷（Fy 经 IC 的垂向分量）")
