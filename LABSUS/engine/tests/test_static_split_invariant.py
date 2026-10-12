"""前后轴静载分配不变量（M5，2026-09-20）。

背景（本轮实证修复的物理错误）：a/b 的语义是 **a = CG→前轴距、b = CG→后轴距**
（讲义 ch10 §2.1 定义 z_ra = (b/L)·z_rc,f + (a/L)·z_rc,r，即前轴权重 = b/L）。
两轴簧载按点质量模型推导：
    a = L·m_r/(m_f+m_r)      b = L·m_f/(m_f+m_r)
故静载本来就是"簧载重的一端承担更多"。

旧实现（`chassis.py` / `03-mechanism.js` / `11-stages.js` 三处一致）写成
    b = L·m_r/(m_f+m_r)
即把"后簧载份额"当成 CG→后轴距，使**前后轴静载整体对调**。实测
`spring_mass_kg` 前 300 / 后 340 时前轴占比 52.2%，物理正确值应为 46.9%。
三处一致 ⇒ 双端对拍与镜像测试都无法发现（它们只查自洽性），故本文件直接钉
物理不变量：**簧载质量大的一端，静载必须更大**。

本测试在旧代码下必然 FAIL（这正是它的价值）。
"""
import math

from src.api.chassis import solve_chassis
from src.api.v3models import ChassisRequest, VehicleSpec
from src.api.v3service import DEFAULT_DWB_POINTS

G = 9.81


def _vehicle(f_ms: float, r_ms: float, m_sprung: float = 420.0,
             mu_f: float = 22.0, mu_r: float = 24.0) -> VehicleSpec:
    return VehicleSpec(**{
        "wheelbase_mm": 1620.0, "mass_kg": m_sprung + 2 * mu_f + 2 * mu_r,
        "sprung_mass_kg": m_sprung, "hcg_mm": 320.0, "hs_mm": 330.0,
        "front": {"points": DEFAULT_DWB_POINTS, "arch": "pushrod",
                  "camber_deg": -1.2, "toe_deg": 0.05, "tire_radius": 305.0,
                  "spring_rate": 110.0, "spring_mass_kg": f_ms,
                  "unsprung_kg": mu_f, "motion_ratio": 0.6},
        "rear": {"points": DEFAULT_DWB_POINTS, "arch": "pullrod",
                 "camber_deg": -1.5, "toe_deg": 0.1, "tire_radius": 310.0,
                 "spring_rate": 130.0, "spring_mass_kg": r_ms,
                 "unsprung_kg": mu_r, "motion_ratio": 0.7},
    })


def _axle_loads(f_ms: float, r_ms: float, mu_f: float = 22.0, mu_r: float = 24.0):
    out = solve_chassis(ChassisRequest(vehicle=_vehicle(f_ms, r_ms, 420.0, mu_f, mu_r)))
    fz = out.loads.fz
    return fz["FL"] + fz["FR"], fz["RL"] + fz["RR"]


def test_front_axle_heavier_when_front_sprung_mass_heavier():
    """簧载重的一端必须承担更多静载（旧代码在此对调，必然 FAIL）。"""
    F, R = _axle_loads(340.0, 300.0)      # 前轴簧载更重
    assert F > R, f"前轴簧载 340 > 后轴 300，前轴静载应更大，实测 F={F:.1f} R={R:.1f}"


def test_rear_axle_heavier_when_rear_sprung_mass_heavier():
    F, R = _axle_loads(300.0, 340.0)      # 后轴簧载更重（FSAE 典型）
    assert R > F, f"后轴簧载 340 > 前轴 300，后轴静载应更大，实测 F={F:.1f} R={R:.1f}"


def test_static_split_matches_point_mass_model():
    """定量锚：Fz_axle = m_sprung·g·(m_axle/Σm) + m_unsprung_axle·g（±0.5%）。"""
    f_ms, r_ms, mS = 300.0, 340.0, 420.0
    mu_f, mu_r = 22.0, 24.0
    F, R = _axle_loads(f_ms, r_ms, mu_f, mu_r)
    expF = mS * G * (f_ms / (f_ms + r_ms)) + 2 * mu_f * G
    expR = mS * G * (r_ms / (f_ms + r_ms)) + 2 * mu_r * G
    assert abs(F - expF) / expF < 0.005, (F, expF)
    assert abs(R - expR) / expR < 0.005, (R, expR)
    assert abs((F + R) - (expF + expR)) / (expF + expR) < 0.005


def test_split_is_ratio_driven_not_absolute():
    """只与两轴簧载比例有关：等比例放大 10 倍，静载占比不变。"""
    f1, r1 = _axle_loads(30.0, 34.0, 2.2, 2.4)
    f2, r2 = _axle_loads(300.0, 340.0, 22.0, 24.0)
    s1, s2 = f1 / (f1 + r1), f2 / (f2 + r2)
    # 容差 3e-3：非簧载/弹簧刚度在两种量级下经准静态侧倾闭环后的二阶差异
    # （实测 1.5e-3），不改变"比例驱动"这一结论。
    assert abs(s1 - s2) < 3e-3, (s1, s2)
    # 并且占比与"前簧载份额"同向（前 30/64 = 46.9%）
    assert abs(s2 - 0.469) < 0.03, s2


def test_split_direction_matches_cg_distance():
    """方向自洽：b/L 必须等于前轴簧载份额（a/b 的语义锚）。"""
    f_ms, r_ms = 480.0, 160.0      # 极端前置偏置
    F, R = _axle_loads(f_ms, r_ms, 22.0, 24.0)
    sprung_share = f_ms / (f_ms + r_ms)
    # 去掉非簧载贡献后，前轴占比应接近 sprung_share
    unsprung_f = 2 * 22.0 * G
    approx_share = (F - unsprung_f) / (F + R - (2 * 22.0 + 2 * 24.0) * G)
    assert math.isclose(approx_share, sprung_share, rel_tol=0.01), (approx_share, sprung_share)
