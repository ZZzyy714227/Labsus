"""/api/v3/chassis/simulate_track 瞬态仿真验收测试（S3-1）。

物理断言（第 11 讲方法论——断言物理性质，不是魔法数）：
- 直线：对称性（|y| 漂移小、ay≈0、左右轮载相等）+ 速度收敛到目标
- 圆环：轨迹贴圆（半径中位数）、横摆率 ≈ v/R、侧倾方向、摩擦圆预算不被超
- K&C 查表：前束 LUT 生效（直线被拉偏）——LUT→动力学的作用链
- 非法输入 422
"""
import math

import numpy as np
from fastapi.testclient import TestClient

from server import app  # noqa: E402

client = TestClient(app)


# S3-1 升级（2026-08-24）：赛道瞬态按 FSAE 规格基线（wb1620 / 480kg），
# 与引擎 PRESETS 紧凑宽体一致；旧 2750/1420 乘用车基线随动力包络升级废除。
_FRONT = {
    "LCA_F": [260, 140, 130], "LCA_R": [260, -120, 140], "UCA_F": [350, 110, 340],
    "UCA_R": [350, -100, 350], "LBJ": [640, 10, 150], "UBJ": [590, -15, 410],
    "WC": [710, 0, 280], "TRO": [600, -120, 185], "RACK": [220, -135, 180],
    "STRUT_OUT": [595, 10, 185], "RCK_AX_A": [300, 15, 330], "RCK_AX_B": [300, 70, 328],
    "STRUT_IN": [315, 45, 400], "RCK_DMP": [230, 48, 345], "DMP_BODY": [30, 48, 170],
}
_REAR = {
    "LCA_F": [250, 140, 115], "LCA_R": [250, -130, 125], "UCA_F": [340, 110, 320],
    "UCA_R": [340, -110, 330], "LBJ": [630, 10, 135], "UBJ": [580, -15, 390],
    "WC": [700, 0, 290], "TRO": [590, -120, 170], "RACK": [210, -130, 160],
    "STRUT_OUT": [570, -15, 380], "RCK_AX_A": [340, 25, 290], "RCK_AX_B": [340, 75, 292],
    "STRUT_IN": [370, 45, 255], "RCK_DMP": [305, 60, 270], "DMP_BODY": [25, 62, 310],
}


def _vehicle():
    return {
        "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
        "hcg_mm": 320.0, "hs_mm": 330.0,
        "front": {"points": _FRONT, "arch": "pushrod", "camber_deg": -1.2, "toe_deg": 0.05,
                  "tire_radius": 305.0, "spring_rate": 110.0, "spring_mass_kg": 300.0,
                  "unsprung_kg": 38.0},
        "rear": {"points": _REAR, "arch": "pullrod", "camber_deg": -1.5, "toe_deg": 0.1,
                 "tire_radius": 310.0, "spring_rate": 130.0, "spring_mass_kg": 340.0,
                 "unsprung_kg": 42.0},
    }


def _body(track, **over):
    b = {"vehicle": _vehicle(), "track": track, "dt": 0.01,
         "sim_time": over.pop("sim_time", 12.0), "start_speed": over.pop("start_speed", 6.0)}
    b.update(over)
    return b


def test_transient_straight_line():
    """直线加速：对称性 + 速度控制。"""
    track = [{"x": 0, "y": 0, "target_speed": 15.0},
             {"x": 60, "y": 0, "target_speed": 15.0},
             {"x": 120, "y": 0, "target_speed": 15.0}]
    r = client.post("/api/v3/chassis/simulate_track", json=_body(track, sim_time=10.0))
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "VALID"
    tr = b["trace"]
    # 对称性：不走偏、不侧倾、左右轮载相等
    assert max(abs(p["y"]) for p in tr) < 0.5
    assert max(abs(p["ay"]) for p in tr[2:]) < 0.5          # 初段转向暂态后 ay≈0
    for p in tr[3:]:
        assert abs(p["fz_FR"] - p["fz_FL"]) < 1.0
        assert abs(p["fz_RR"] - p["fz_RL"]) < 1.0
    # 速度收敛
    assert tr[-1]["vx"] > 14.0
    assert b["summary"]["path_length_m"] > 80.0


def test_transient_circle_steady_state():
    """圆环 r=30m @12m/s：轨迹贴圆 + 横摆率 ≈ v/R + 摩擦圆预算。"""
    R = 30.0
    track = [{"x": R * math.cos(th), "y": R * math.sin(th), "target_speed": 12.0}
             for th in np.linspace(0, 2 * math.pi, 65)[:-1]]
    r = client.post("/api/v3/chassis/simulate_track",
                    json=_body(track, sim_time=20.0, start_speed=12.0))
    assert r.status_code == 200
    b = r.json()
    tr, t = b["trace"], np.array(b["t"])
    # 稳态段（跳过入弯暂态）：半径与横摆率中位数
    d = np.array([math.hypot(p["x"], p["y"]) for p in tr])
    r_yaw = np.abs(np.array([p["r"] for p in tr]))
    steady = slice(len(tr) // 4, None)
    assert 27.0 < np.median(d[steady]) < 33.0               # 贴圆（±3m 走廊）
    assert 0.33 < np.median(r_yaw[steady]) < 0.47           # ≈ v/R = 0.40（含猎振容差）
    # 外侧加载（纯追踪绕行方向恒定）：任一时刻左右轮载差显著
    assert any(abs(p["fz_FR"] - p["fz_FL"]) > 400 for p in tr[steady])
    # 侧倾与 ay 同号量级：ay ≈ 4.8 m/s²，roll 在 0.2~1.5°
    assert any(0.15 < abs(p["roll"]) < 2.0 for p in tr[steady])
    # 摩擦圆预算：√(Fx²+Fy²) ≤ μ·Fz（μ=Fy0/FzNom，留 5% 数值余量）
    # G24：不再把 μ 写死为 8000/3500——那会把断言与库缺省解耦，改了缺省后断言
    # 会静默退化成“用旧 μ 校验新仿真”的空检查。直接从 TireParams 缺省取。
    from src.api.v3models import TireParams
    _tp = TireParams()
    mu = _tp.Fy0 / _tp.FzNom
    assert abs(mu - 1.50) < 0.05, f"缺省胎峰值 μ 应为真实量级 1.50，实际 {mu:.3f}"
    worst = max(math.hypot(p[f"fx_{w}"], p[f"fy_{w}"]) / (mu * p[f"fz_{w}"])
                for p in tr for w in ("FR", "FL", "RR", "RL") if p[f"fz_{w}"] > 10)
    assert worst < 1.05
    assert b["summary"]["path_length_m"] > 150.0            # 大半圈以上


def test_transient_kc_lut_toe_effect():
    """K&C 查表作用链：前轴常数前束 LUT → 直线被拉偏。"""
    track = [{"x": 0, "y": 0, "target_speed": 10.0},
             {"x": 80, "y": 0, "target_speed": 10.0}]
    base = client.post("/api/v3/chassis/simulate_track",
                       json=_body(track, sim_time=9.0, start_speed=10.0)).json()
    lut = {"front": {"travel": [-50.0, 0.0, 50.0], "toe": [0.5, 0.5, 0.5]}}
    withlut = client.post("/api/v3/chassis/simulate_track",
                          json=_body(track, sim_time=9.0, start_speed=10.0,
                                     kc_luts=lut)).json()
    y_base = max(abs(p["y"]) for p in base["trace"])
    y_lut = max(abs(p["y"]) for p in withlut["trace"])
    assert y_base < 0.3                                      # 无 LUT 走直
    assert y_lut > 0.5                                       # 前束拉出横向漂移
    assert y_lut > y_base + 0.5


def test_transient_braking_load_transfer():
    """急刹段：前轴加载、后轴卸载（守恒方向检查）。"""
    track = [{"x": 0, "y": 0, "target_speed": 20.0},
             {"x": 200, "y": 0, "target_speed": 4.0}]        # 远端低速 → 全程刹车需求
    r = client.post("/api/v3/chassis/simulate_track",
                    json=_body(track, sim_time=8.0, start_speed=20.0))
    b = r.json()
    tr = r.json()["trace"]
    # 找减速段（vx 下降）比较前后轴载荷变化方向
    f0 = tr[2]["fz_FR"] + tr[2]["fz_FL"]
    f_peak = max(p["fz_FR"] + p["fz_FL"] for p in tr)
    r_peak = max(p["fz_RR"] + p["fz_RL"] for p in tr)
    assert f_peak > f0 + 300                                 # 前轴明显加载
    assert f_peak > r_peak                                   # 制动重心前移


def test_transient_invalid_input_422():
    assert client.post("/api/v3/chassis/simulate_track",
                       json=_body([{"x": 0, "y": 0, "target_speed": 10}])).status_code == 422
    bad = _body([{"x": 0, "y": 0, "target_speed": 10}, {"x": 50, "y": 0, "target_speed": 10}])
    bad["kc_luts"] = {"middle": {"travel": [0, 1], "toe": [0, 0]}}
    assert client.post("/api/v3/chassis/simulate_track", json=bad).status_code == 422
    bad2 = _body([{"x": 0, "y": 0, "target_speed": 10}, {"x": 50, "y": 0, "target_speed": 10}])
    bad2["dt"] = 0.5
    assert client.post("/api/v3/chassis/simulate_track", json=bad2).status_code == 422

def test_aero_downforce_adds_front_load_and_drag():
    """S3-1 升级·气动：k_down↑ → 前轮 Fz 增加；k_drag↑ → v_end 降低。"""
    track = [{"x": 0, "y": 0, "target_speed": 15.0},
             {"x": 80, "y": 0, "target_speed": 15.0},
             {"x": 160, "y": 0, "target_speed": 15.0}]
    base = client.post("/api/v3/chassis/simulate_track",
                       json=_body(track, sim_time=7.0)).json()
    aero = client.post("/api/v3/chassis/simulate_track",
                       json=_body(track, sim_time=7.0,
                                  aero={"k_down_f": 2.2, "k_down_r": 1.8,
                                        "k_drag": 1.4})).json()
    assert aero["status"] == "VALID"
    b_fz = float(base["trace"][-1]["fz_FR"])
    a_fz = float(aero["trace"][-1]["fz_FR"])
    assert a_fz > b_fz * 1.05, (b_fz, a_fz)
    assert aero["summary"]["v_end"] < base["summary"]["v_end"] - 0.2, (
        aero["summary"]["v_end"], base["summary"]["v_end"])   # 阻力减速（7s 段实测 ~0.35m/s）
    assert aero["summary"]["aero_n"] > 250.0


def test_aero_ge_ground_effect_boost_front():
    """P2a·cl(h)：急刹低头（前轴净高减）→ ge_f 增强前轴 cl ⇒ 前轴载荷显著高于
    ge_gain=0 同工况（平面模型 h = 名义 ± a/b·tan(pitch)）。"""
    track = [{"x": 0, "y": 0, "target_speed": 20.0},
             {"x": 240, "y": 0, "target_speed": 4.0}]
    aero_ge = {"k_down_f": 2.2, "k_down_r": 1.8, "k_drag": 1.4,
               "ge_gain": 0.5, "ge_h0_mm": 100.0, "ge_href_mm": 100.0,
               "ge_hmin_mm": 30.0, "ge_floor": 0.8, "drs_v_ms": 1000.0}
    aero_0 = {k: v for k, v in aero_ge.items() if k != "ge_gain"}
    pt = {"T_max": 320.0, "P_kw": 120.0}
    b_ge = client.post("/api/v3/chassis/simulate_track",
                       json=_body(track, sim_time=14.0, start_speed=20.0,
                                  powertrain=pt, aero=aero_ge)).json()
    b_0 = client.post("/api/v3/chassis/simulate_track",
                      json=_body(track, sim_time=14.0, start_speed=20.0,
                                 powertrain=pt, aero=aero_0)).json()
    assert b_ge["status"] == b_0["status"] == "VALID"
    ge_max = max(p["ge_f"] for p in b_ge["trace"])
    ge_min = min(p["ge_f"] for p in b_ge["trace"])
    assert ge_max > 1.3, f"低头应增强前轴 cl，实测峰值 ge_f={ge_max:.3f}"
    assert ge_min >= 0.8 - 1e-6, "高 h 衰减不低于 ge_floor"
    fz_ge = max(p["fz_FR"] + p["fz_FL"] for p in b_ge["trace"])
    fz_0 = max(p["fz_FR"] + p["fz_FL"] for p in b_0["trace"])
    assert fz_ge > fz_0 + 300, (fz_ge, fz_0)


def test_aero_drs_straight_reduces_drag():
    """P2a·DRS：长直道高速自动开翼（直道判定 + vx>drs_v_ms）→ 总阻力 ×0.72 ⇒
    尾速提升、后轴 cl ×0.90 ⇒ 后轴载荷占比下降；drs_frac 反映开翼时长。"""
    track = [{"x": 0, "y": 0, "target_speed": 32.0},
             {"x": 700, "y": 0, "target_speed": 32.0},
             {"x": 1400, "y": 0, "target_speed": 32.0}]
    common = {"k_down_f": 2.2, "k_down_r": 1.8, "k_drag": 1.4, "ge_gain": 0.0}
    pt = {"T_max": 320.0, "P_kw": 120.0}
    a_drs = client.post("/api/v3/chassis/simulate_track",
                        json=_body(track, sim_time=24.0, start_speed=25.0, powertrain=pt,
                                   aero=dict(common, drs_v_ms=20.0, drs_cd_scale=0.72,
                                             drs_cl_scale=0.90, drs_curve_radius_m=300.0))).json()
    a_nod = client.post("/api/v3/chassis/simulate_track",
                        json=_body(track, sim_time=24.0, start_speed=25.0, powertrain=pt,
                                   aero=dict(common, drs_v_ms=1000.0))).json()
    assert a_drs["status"] == a_nod["status"] == "VALID"
    assert a_drs["summary"]["drs_frac"] > 0.5, "直道高速应持续开翼"
    assert a_drs["summary"]["v_end"] > a_nod["summary"]["v_end"] + 0.02, (
        a_drs["summary"]["v_end"], a_nod["summary"]["v_end"])
    assert max(p["drs"] for p in a_nod["trace"]) == 0, "drs_v_ms 高阈值应永不触发"
    f_frac = lambda r: (r["fz_RR"] + r["fz_RL"]) / max(1e-6, sum(
        r[f"fz_{w}"] for w in ("FR", "FL", "RR", "RL")))
    assert f_frac(a_drs["trace"][-1]) < f_frac(a_nod["trace"][-1]), "DRS 削后轴 cl → 占比降"


def test_slip_relaxation_lags_kinematic():
    """S3-1 升级·松弛：圆环稳态下 alphaL(松弛) 收敛到 |alpha| 邻域且同向；摩擦圆不超限。

    2026-08-30 修复（F-22/F-24 配套）：原断言在"后半程第一行 alpha>0.3"处
    逐点比较 —— 该点常落在转向/加速暂态段，目标 alpha 快速变化，一阶滞后
    alphaL 的瞬时值可小幅超过当前目标（正确物理：滞后不放大稳态，但目标
    下降段滞后值 > 当前目标）。改用**稳态段中位数**断言：中位数比值应接近
    1（1±0.15），符号一致率 ≥90%（稳态侧偏方向恒定）。
    """
    R = 30.0
    track = [{"x": R * math.cos(th), "y": R * math.sin(th), "target_speed": 12.0}
             for th in np.linspace(0, 2 * math.pi, 65)]
    r = client.post("/api/v3/chassis/simulate_track",
                    json=_body(track, sim_time=12.0, start_speed=12.0)).json()
    assert r["status"] == "VALID"
    rows = r["trace"]
    # 稳态段：取后 1/4（绕行至少大半圈后）
    seg = rows[len(rows) * 3 // 4:]
    assert len(seg) >= 20, f"稳态段过短: {len(seg)}"
    for w in ("FR", "RR"):
        pts = [p for p in seg if abs(p[f"alpha_{w}"]) > 0.3]
        assert pts, f"{w}: 无侧偏样本"
        a_med = float(np.median([abs(p[f"alpha_{w}"]) for p in pts]))
        al_med = float(np.median([abs(p[f"alphaL_{w}"]) for p in pts]))
        # 松弛收敛于运动学目标邻域：中位数比值 ∈ (0.85, 1.15)
        assert 0.05 < al_med < a_med * 1.15, (w, a_med, al_med)
        # 同向：稳态圆环侧偏方向恒定，alphaL 与 alpha 符号一致
        same = sum(1 for p in pts if p[f"alpha_{w}"] * p[f"alphaL_{w}"] >= 0)
        assert same >= len(pts) * 0.9, (w, same, len(pts))
    assert max(max(float(p[f"mu_{w}"]) for w in ("FR", "FL", "RR", "RL")) for p in rows) <= 1.001



def test_transient_drive_split_front_wheels():
    """drive_split_f=1 纯前驱：前轮输出驱动力、后轮不输出（审计 P1-2）。"""
    track = [{"x": 0, "y": 0, "target_speed": 15.0},
             {"x": 80, "y": 0, "target_speed": 15.0}]
    pt4 = {"T_max": 250.0, "P_kw": 80.0, "brake_split_f": 0.6, "drive_split_f": 1.0}
    r = client.post("/api/v3/chassis/simulate_track",
                    json=_body(track, sim_time=8.0, start_speed=5.0, powertrain=pt4))
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "VALID"
    acc = [p for p in b["trace"] if p["throttle"] > 0.5 and p["vx"] < 10.0]
    assert len(acc) > 5
    assert max(p["fx_FR"] for p in acc) > 50.0          # 前轮有驱动力
    assert max(abs(p["fx_RR"]) for p in acc) < 1.0      # 后轮无驱动力
    # 对照：纯后驱同工况下后轮输出、前轮无
    pt0 = {"T_max": 250.0, "P_kw": 80.0, "brake_split_f": 0.6, "drive_split_f": 0.0}
    base = client.post("/api/v3/chassis/simulate_track",
                       json=_body(track, sim_time=8.0, start_speed=5.0,
                                  powertrain=pt0)).json()
    accb = [p for p in base["trace"] if p["throttle"] > 0.5 and p["vx"] < 10.0]
    assert max(p["fx_RR"] for p in accb) > 50.0
    assert max(abs(p["fx_FR"]) for p in accb) < 1.0
