"""grill-me 修复波次回归测试（2026-08-30，报告 F-09/F-15/F-16/F-22/F-24/F-25/F-63）。

断言物理性质而非魔法数（第 11 讲方法论）：
- TLLTD 符号对称性（F-09：负 g 不再恒 50%）
- 侧倾中心 0 值不被回退吞掉（F-15）
- 侧倾失稳显式上报（F-16）
- 松弛解析解在极端步长下不振荡发散（F-24）
- 响应 JSON 严格合法（F-25：无 NaN/Infinity 字面量）
- 洗刷函数边界行为（F-25）
- compliance 锚点映射失败显式抛错（F-63）
"""
import json
import math
import sys

sys.path.insert(0, "src")

import numpy as np
from fastapi.testclient import TestClient

from server import app  # noqa: E402
from src.api.v3models import QuasiInputs, VehicleSpec   # noqa: E402
from src.api.chassis import quasi_loads                 # noqa: E402
from src.solver.transient import _wash_json             # noqa: E402

client = TestClient(app)

FRONT = {
    "LCA_F": [260, 140, 130], "LCA_R": [260, -120, 140], "UCA_F": [350, 110, 340],
    "UCA_R": [350, -100, 350], "LBJ": [640, 10, 150], "UBJ": [590, -15, 410],
    "WC": [710, 0, 280], "TRO": [600, -120, 185], "RACK": [220, -135, 180],
    "STRUT_OUT": [595, 10, 185], "RCK_AX_A": [300, 15, 330], "RCK_AX_B": [300, 70, 328],
    "STRUT_IN": [315, 45, 400], "RCK_DMP": [230, 48, 345], "DMP_BODY": [30, 48, 170],
}
REAR = {
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
        "front": {"points": FRONT, "arch": "pushrod", "camber_deg": -1.2,
                  "toe_deg": 0.05, "tire_radius": 305.0, "spring_rate": 110.0,
                  "spring_mass_kg": 300.0, "unsprung_kg": 38.0,
                  "motion_ratio": 0.75},
        "rear": {"points": REAR, "arch": "pullrod", "camber_deg": -1.5,
                 "toe_deg": 0.1, "tire_radius": 310.0, "spring_rate": 130.0,
                 "spring_mass_kg": 340.0, "unsprung_kg": 42.0,
                 "motion_ratio": 0.78},
    }


def _req(**over):
    body = {
        "vehicle": _vehicle(),
        "quasi": {"gy": 0.0, "gx": 0.0, "aero_force_n": 0.0, "aero_bias": 0.5},
        "travel": {"fl": 0.0, "fr": 0.0, "rl": 0.0, "rr": 0.0},
        "rack": 0.0,
    }
    body.update(over)
    return body


# ── F-09：TLLTD 符号对称性 ─────────────────────────────────────

def test_tlltd_negative_g_not_pinned_at_50():
    """左转（gy<0）时 TLLTD 必须镜像而非恒 50%；右转/左转前轴份额对称相等。

    物理：TLLTD = dFz_f_tot / (dFz_f_tot + dFz_r_tot)。gy 变号时分子分母
    同号翻转，比值不变（左右镜像对称车）→ pos ≈ neg（并非互补 100）。
    F-09 修复目标：gy<0 不再因 `sum_transfer > 1` 守卫误判而恒回退 50%。
    """
    pos = client.post("/api/v3/chassis/solve",
                      json=_req(quasi={"gy": 1.0, "gx": 0.0, "aero_force_n": 0.0,
                                       "aero_bias": 0.5})).json()["loads"]["tlltd_pct"]
    neg = client.post("/api/v3/chassis/solve",
                      json=_req(quasi={"gy": -1.0, "gx": 0.0, "aero_force_n": 0.0,
                                       "aero_bias": 0.5})).json()["loads"]["tlltd_pct"]
    assert pos != 50.0 and neg != 50.0, (pos, neg)
    assert abs(pos - neg) < 1.0, (pos, neg)   # 镜像对称：左右转前轴份额相等
    assert 0.0 < pos < 100.0 and 0.0 < neg < 100.0, (pos, neg)


# ── F-15：合法 0 值不被回退吞掉 ────────────────────────────────

def _zero_sweep():
    """合法最小 rc_sw：travel/rc_h 键齐备；恒定 0 —— 0 行程迁移保持 0。

    注意：dFz_geo 取迭代**迁移后**的 zrc_f（sweep 插值），故 sweep 必须
    恒定 0 才能让"rc_h=0 恰在地面"场景的几何传力路径精确为 0；
    两侧非零的 sweep 会因侧倾迁移（dt_f≠0）引入非零 geo，误伤断言。
    """
    return {"front": {"travel": [-90.0, -60.0, 0.0, 60.0, 90.0],
                      "rc_h": [0.0, 0.0, 0.0, 0.0, 0.0]},
            "rear": {"travel": [-90.0, -60.0, 0.0, 60.0, 90.0],
                     "rc_h": [0.0, 0.0, 0.0, 0.0, 0.0]}}


def test_quasi_loads_zero_rc_height_not_swallowed():
    """rc_h=0（侧倾中心恰在地面）时几何传力路径必须为 0，而非按 45mm 兜底计算。"""
    v = VehicleSpec(**_vehicle())
    q = QuasiInputs(gy=1.0, gx=0.0, aero_force_n=0.0, aero_bias=0.5)
    loads = quasi_loads(v, q, {"front": 0.75, "rear": 0.78},
                        {"FR": 0.0, "RR": 0.0}, _zero_sweep())
    assert loads.dFz_geo_f == 0.0
    assert loads.dFz_geo_r == 0.0


# ── F-16：侧倾失稳显式上报 ─────────────────────────────────────

def test_quasi_loads_roll_instability_reports_warning():
    """kphi_tot 被削到极小 → denom ≤ 100 → 侧倾置零 + warning 显式上报。

    注意：必须显式拆掉 ARB（arb.d=0），否则默认 d=18 的扭杆刚度仍能
    支撑 kphi_tot > mS·g·h_arm，弹簧归零也触发不了失稳判据。
    """
    v = VehicleSpec(**_vehicle())
    v.front.spring_rate = 0.01          # 侧倾刚度近乎归零 → 触发失稳判据
    v.rear.spring_rate = 0.01
    v.front.arb.d = 0.0                 # 拆 ARB（d<=0.5 视为拆除）
    v.rear.arb.d = 0.0
    warns: list[str] = []
    q = QuasiInputs(gy=1.0, gx=0.0, aero_force_n=0.0, aero_bias=0.5)
    loads = quasi_loads(v, q, {"front": 0.75, "rear": 0.78},
                        {"FR": 50.0, "RR": 50.0}, _zero_sweep(),
                        warnings=warns)
    assert loads.roll_deg == 0.0
    assert any("失稳" in w for w in warns), warns


# ── F-24：解析松弛在极端步长下稳定 ─────────────────────────────

def test_relaxation_stable_at_extreme_dt():
    """dt=0.05 / vx=40 / σ=0.3（旧显式欧拉比率 6.7 → 发散）下仿真仍须收敛稳定。"""
    track = [{"x": R * math.cos(th), "y": R * math.sin(th), "target_speed": 40.0}
             for R in [30.0] for th in np.linspace(0, 2 * math.pi, 33)][:-1]
    body = {"vehicle": _vehicle(), "track": track, "dt": 0.05,
            "sim_time": 6.0, "start_speed": 40.0}
    r = client.post("/api/v3/chassis/simulate_track", json=body)
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "VALID", b.get("warnings")
    # 解析解保证 alpha_lat 有界：|alphaL| 不超过 2× 稳态运动学侧偏的上包络
    worst = max(max(abs(p[f"alphaL_{w}"]) for w in ("FR", "FL", "RR", "RL"))
                for p in b["trace"])
    assert worst < 60.0, worst


# ── F-25：响应 JSON 严格合法 ───────────────────────────────────

def test_track_response_strict_json_no_nan_literals():
    track = [{"x": 0, "y": 0, "target_speed": 15.0},
             {"x": 80, "y": 0, "target_speed": 15.0}]
    r = client.post("/api/v3/chassis/simulate_track",
                    json={"vehicle": _vehicle(), "track": track,
                          "dt": 0.01, "sim_time": 5.0, "start_speed": 8.0})
    assert r.status_code == 200
    for token in ("NaN", "Infinity", "-Infinity"):
        assert token not in r.text, token


def test_wash_json_boundaries():
    assert _wash_json(float("nan")) is None
    assert _wash_json(float("inf")) is None
    assert _wash_json(1.5) == 1.5
    assert _wash_json({"a": [float("nan"), 2]}) == {"a": [None, 2]}
    assert _wash_json("NaN") == "NaN"            # 字符串不动
    # 洗刷后的 dict 必须能通过严格 JSON 序列化
    json.dumps(_wash_json({"x": float("nan"), "y": [1, float("inf")]}),
               allow_nan=False)


# ── F-63：compliance 锚点映射失败必须显式报错 ──────────────────

def test_compliance_unmapped_anchor_raises():
    from src.solver.forces import LinkForce, QSLoad
    from src.solver.mechanism.models import build_mechanism
    from src.solver.compliance import solve_compliance_full
    from src.api.v3service import to_engine_points, DEFAULT_DWB_POINTS, make_bushings

    eng = to_engine_points(DEFAULT_DWB_POINTS)
    mech = build_mechanism(eng, steer_axis=np.array([-1.0, 0.0, 0.0]),
                           rocker_axis=(np.asarray(DEFAULT_DWB_POINTS["RCK_AX_B"], float)
                                        - np.asarray(DEFAULT_DWB_POINTS["RCK_AX_A"], float)))
    bushings = make_bushings([], DEFAULT_DWB_POINTS)
    far = np.array([9.9e5, 0.0, 0.0])   # 故意无法映射到任何机构节点的车身端
    with __import__("pytest").raises(ValueError, match="无法映射"):
        solve_compliance_full(
            mech, bushings=bushings, case=QSLoad(fy=-3000.0),
            travel=0.0, rack=0.0,
            mk_links=lambda m: [LinkForce(a=far, b=far.copy(), id="PUSH")])
