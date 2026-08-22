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


def _vehicle():
    from tests.test_v3_chassis import FRONT, REAR
    return {
        "wheelbase_mm": 2750.0, "mass_kg": 1420.0, "sprung_mass_kg": 1260.0,
        "hcg_mm": 350.0, "hs_mm": 370.0,
        "front": {"points": FRONT, "arch": "pushrod", "camber_deg": -1.2, "toe_deg": 0.05,
                  "tire_radius": 325.0, "spring_rate": 110.0, "spring_mass_kg": 330.0,
                  "unsprung_kg": 38.0},
        "rear": {"points": REAR, "arch": "pullrod", "camber_deg": -1.5, "toe_deg": 0.1,
                 "tire_radius": 330.0, "spring_rate": 130.0, "spring_mass_kg": 380.0,
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
    # 摩擦圆预算：√(Fx²+Fy²) ≤ μ·Fz（μ=Fy0/FzNom≈2.29，留 5% 数值余量）
    mu = 8000.0 / 3500.0
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
