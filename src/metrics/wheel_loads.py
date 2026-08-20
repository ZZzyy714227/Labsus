"""P3-1 整车载荷分配（设计文档 §8、进展文档 P3 整车层）。

输入：vehicle 参数 + case 载荷 + 轴滚转刚度/RC/滚转角 → 四轮 Fx/Fy/Fz。

符号约定（写入 core/models.py LoadsInput 文档）：
- ax_g > 0 = 减速（制动），< 0 = 加速；ax 的 Fx 前/后分配按 brake_split_front / drive_split_rear。
- ay_g > 0 = 向右（车辆 +Y 侧）；Fz 正 = 向上压向车轮。
- Fx 正 = 沿车辆前进方向（+X）的驱动力；制动时 Fx < 0。

载荷转移（横向，按轴）：
  几何转移   ΔFz_geo = ay·m_axle·g·h_rc / track
  弹性转移   ΔFz_ela = ay·m_axle·g·(h_cg − h_rc)·(k_axle/k_total) / track
  非簧载转移 ΔFz_unsp = ay·m_unsprung_axle·g·h_unsp / track
纵向转移（前轴 +，后轴 −）：
  ΔFz_long = ax·m_total·g·h_cg / wheelbase
"""
from __future__ import annotations

import math

import numpy as np

G = 9.81


def _vehicle(vehicle: dict, *keys: str, default: float = 0.0) -> float:
    return float(vehicle.get(keys[0], default))


def distribute_vehicle_loads(vehicle: dict, loads,
                             roll_stiffness_f: float | None,
                             roll_stiffness_r: float | None,
                             rc_z_f: float, rc_z_r: float,
                             roll_deg: float = 0.0) -> dict:
    """四轮载荷分配。返回 {corner: {fx, fy, fz, static_fz, friction_util,
    off_ground, transfers:{...}}}。

    roll_stiffness_f/r 为含 ARB 的轴滚转刚度（N·mm/rad）；None 表示不可用
    （弹性转移退化为按 axle_frac 均分）。
    """
    m_total = _vehicle(vehicle, "mass_kg")
    h_cg = _vehicle(vehicle, "cg_height_mm")
    wb = _vehicle(vehicle, "wheelbase_mm")
    tr_f = _vehicle(vehicle, "front_track_mm")
    tr_r = _vehicle(vehicle, "rear_track_mm")
    frac_f = _vehicle(vehicle, "front_axle_frac", default=0.5)
    frac_r = _vehicle(vehicle, "rear_axle_frac", default=0.5)
    unsprung = _vehicle(vehicle, "unsprung_kg", default=20.0)
    h_unsp = _vehicle(vehicle, "unsprung_cg_height_mm", default=255.0)
    mu = _vehicle(vehicle, "mu_peak", default=1.4)

    ax = float(loads.ax_g)
    ay = float(loads.ay_g)
    az = float(loads.az_g)
    brake_split = float(loads.brake_split_front)
    drive_split = float(loads.drive_split_rear)

    W = m_total * G
    if wb <= 0 or tr_f <= 0 or tr_r <= 0:
        raise ValueError("wheelbase/track 必须为正")

    # 纵向转移（ax>0 制动：前轴增载；ax<0 加速：后轴增载）
    dFz_long = ax * W * h_cg / wb
    long_f = dFz_long
    long_r = -dFz_long

    # 总横向载荷与刚度分配
    kf = float(roll_stiffness_f or 0.0)
    kr = float(roll_stiffness_r or 0.0)
    k_total = kf + kr
    share_f = (kf / k_total if k_total > 0 else frac_f)
    share_r = (kr / k_total if k_total > 0 else frac_r)

    m_s_total = m_total - unsprung * 4.0  # 整车簧上质量
    m_s_axle_f = m_total * frac_f - unsprung * 2.0
    m_s_axle_r = m_total * frac_r - unsprung * 2.0

    def corner_loads(name, axle_frac, track, share, rc_z, m_s_axle, m_axle):
        fz_static = W * axle_frac / 2.0
        # az：相对设计基准的额外垂向加速度（重力基准已含于静态载荷，§8.1）
        fz_extra = az * fz_static
        # 横向转移三部分（正确分解）：
        #   几何  = ay·m_s_axle·g·h_rc / track（轴簧上质量经 RC）
        #   弹性  = ay·m_s_total·g·(h_cg−h_rc)·(k_axle/k_total) / track（整车滚转力矩按刚度份额）
        #   非簧载= ay·m_u_axle·g·h_unsp / track
        geo = ay * m_s_axle * G * rc_z / track
        ela = ay * m_s_total * G * (h_cg - rc_z) * share / track
        unsp = ay * (unsprung * 2.0) * G * h_unsp / track
        total_transfer = geo + ela + unsp
        fz_out = fz_static + fz_extra + total_transfer / 2.0 + (long_f if "front" in name else long_r) / 2.0
        fz_in = fz_static + fz_extra - total_transfer / 2.0 + (long_f if "front" in name else long_r) / 2.0
        # 侧向力按轮 Fz 占比分配
        fy_axle = ay * m_axle * G
        fz_pair = fz_out + fz_in
        fy_out = fy_axle * (fz_out / fz_pair) if fz_pair > 0 else fy_axle / 2.0
        fy_in = fy_axle - fy_out
        # 纵向力（ax>0 制动：前轴按 brake_split；ax<0 加速：后轴按 drive_split）
        if ax > 0:
            fx_total = -ax * W
            fx_out = fx_total * brake_split / 2.0 if "front" in name else fx_total * (1 - brake_split) / 2.0
            fx_in = fx_out
        elif ax < 0:
            fx_total = -ax * W  # 正（驱动方向）
            fx_out = fx_total * (1 - drive_split) / 2.0 if "front" in name else fx_total * drive_split / 2.0
            fx_in = fx_out
        else:
            fx_out = fx_in = 0.0
        return {
            "outboard": {"fx": fx_out, "fy": fy_out, "fz": fz_out},
            "inboard": {"fx": fx_in, "fy": fy_in, "fz": fz_in},
            "static_fz": fz_static,
            "transfers": {
                "lateral_total": total_transfer,
                "geometric": geo, "elastic": ela, "unsprung": unsp,
                "longitudinal": dFz_long,
            },
        }

    m_f = m_total * frac_f
    m_r = m_total * frac_r
    front = corner_loads("front", frac_f, tr_f, share_f, rc_z_f, m_s_axle_f, m_f)
    rear = corner_loads("rear", frac_r, tr_r, share_r, rc_z_r, m_s_axle_r, m_r)

    out: dict[str, dict] = {}
    mapping = [
        ("front_right", front, front["outboard"], 1.0),
        ("front_left", front, front["inboard"], -1.0),
        ("rear_right", rear, rear["outboard"], 1.0),
        ("rear_left", rear, rear["inboard"], -1.0),
    ]
    for name, corner, wheel, sign in mapping:
        fx, fy, fz = wheel["fx"], wheel["fy"], wheel["fz"]
        util = (math.hypot(fx, fy) / (mu * fz)) if fz > 1e-9 else float("inf")
        out[name] = {
            "fx_n": round(fx, 3), "fy_n": round(fy, 3), "fz_n": round(fz, 3),
            "static_fz_n": round(corner["static_fz"], 3),
            "friction_util": round(util, 4),
            "off_ground": bool(fz <= 1e-9),
            "transfers": {k: round(v, 3) for k, v in corner["transfers"].items()},
            "lateral_sign": sign,
        }
    return out


def tire_force_vector(fx: float, fy: float, fz: float) -> np.ndarray:
    """轮胎作用于转向节的三向力 [Fx, Fy, Fz]（N）。"""
    return np.array([fx, fy, fz], dtype=float)
