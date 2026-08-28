"""P5 深化 (4a)：防倾杆几何刚度（去掉直接给 k_arb，由扭杆几何+材料计算）。

K_arb_roll [N·mm/rad] 由扭杆几何推导：扭杆扭转刚度 kt = G·J/L（J=πd⁴/32），
经摇臂（arm）与轮距换算到整车滚转：
    K_roll = kt · (track/2 / arm)²
其中 (track/2/arm) 为摇臂力臂到轮的杠杆比（近似，轮位移↔扭杆转角换算）。
"""
import math


def arb_geometry_stiffness(d_mm: float, bar_length_mm: float, arm_mm: float,
                           track_mm: float, g_mod_mpa: float = 79000.0) -> float:
    """由扭杆几何/材料计算整车滚转刚度贡献（N·mm/rad）。"""
    if d_mm <= 0 or bar_length_mm <= 0 or arm_mm <= 0 or track_mm <= 0:
        raise ValueError("d/length/arm/track 必须为正")
    j = math.pi * d_mm ** 4 / 32.0
    kt = g_mod_mpa * j / bar_length_mm            # N·mm/rad（扭杆自身）
    return kt * (track_mm / 2.0 / arm_mm) ** 2    # 换算到整车滚转刚度


def arb_geometry_from_vehicle(vehicle: dict, front: bool) -> float | None:
    """从 vehicle 参数取几何（arb_bar_d_mm/arb_bar_length_mm/arb_arm_mm），
    有则计算 k_arb_roll；无则回退直接 k_arb_f/r 键（兼容），都没有返回 None。"""
    prefix = "arb_" + ("f" if front else "r")
    d = vehicle.get(prefix + "_bar_d_mm")
    ln = vehicle.get(prefix + "_bar_length_mm")
    arm = vehicle.get(prefix + "_arm_mm")
    if d and ln and arm:
        track = vehicle.get("front_track_mm" if front else "rear_track_mm", 1220.0)
        return arb_geometry_stiffness(float(d), float(ln), float(arm), float(track))
    return vehicle.get("k_arb_f" if front else "k_arb_r")
