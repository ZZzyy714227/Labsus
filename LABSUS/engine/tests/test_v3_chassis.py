"""/api/v3 整车分析端点验收测试（S2-5）。

覆盖：四角装配 / 单点整车求解（姿态+载荷转移）/ 载荷守恒与对称性 /
整车 bump·roll·steer 扫掠 / 非法输入。
"""
import numpy as np
from fastapi.testclient import TestClient

from server import app  # noqa: E402

client = TestClient(app)

FRONT = {
    "LCA_F": [240.0, 180.0, 145.0], "LCA_R": [240.0, -160.0, 155.0],
    "LBJ": [730.0, 10.0, 165.0], "UCA_F": [360.0, 140.0, 380.0],
    "UCA_R": [360.0, -130.0, 390.0], "UBJ": [675.0, -15.0, 455.0],
    "WC": [810.0, 0.0, 320.0], "TRO": [685.0, -145.0, 205.0],
    "RACK": [269.2, -165.0, 198.1],
    "STRUT_OUT": [683.4, 12.0, 205.5],
    "RCK_AX_A": [305.3, 20.0, 366.4], "RCK_AX_B": [306.1, 90.0, 365.0],
    "STRUT_IN": [324.4, 57.9, 445.6], "RCK_DMP": [234.8, 60.0, 385.0],
    "DMP_BODY": [29.3, 60.1, 181.1],
}
REAR = {
    "LCA_F": [230.0, 180.0, 125.0], "LCA_R": [230.0, -170.0, 135.0],
    "LBJ": [720.0, 10.0, 145.0], "UCA_F": [340.0, 140.0, 360.0],
    "UCA_R": [340.0, -140.0, 370.0], "UBJ": [660.0, -15.0, 435.0],
    "WC": [790.0, 0.0, 330.0], "TRO": [670.0, -150.0, 185.0],
    "RACK": [230.0, -160.0, 175.0],
    "STRUT_OUT": [645.0, -15.0, 425.0],
    "RCK_AX_A": [377.0, 30.0, 318.9], "RCK_AX_B": [376.7, 90.0, 320.1],
    "STRUT_IN": [414.7, 55.0, 282.5], "RCK_DMP": [337.8, 75.0, 297.6],
    "DMP_BODY": [18.5, 78.4, 346.4],
}


def _req(**over):
    body = {
        "vehicle": {
            "wheelbase_mm": 2750.0, "mass_kg": 1420.0, "sprung_mass_kg": 1260.0,
            "hcg_mm": 350.0, "hs_mm": 370.0,
            "front": {"points": FRONT, "arch": "pushrod", "camber_deg": -1.2,
                      "toe_deg": 0.05, "tire_radius": 325.0, "spring_rate": 110.0,
                      "spring_mass_kg": 330.0, "unsprung_kg": 38.0},
            "rear": {"points": REAR, "arch": "pullrod", "camber_deg": -1.5,
                     "toe_deg": 0.1, "tire_radius": 330.0, "spring_rate": 130.0,
                     "spring_mass_kg": 380.0, "unsprung_kg": 42.0},
        },
        "quasi": {"gy": 0.0, "gx": 0.0, "aero_force_n": 0.0, "aero_bias": 0.5},
        "travel": {"fl": 0.0, "fr": 0.0, "rl": 0.0, "rr": 0.0},
        "rack": 0.0,
    }
    body.update(over)
    return body


def test_chassis_solve_baseline():
    r = client.post("/api/v3/chassis/solve", json=_req())
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "VALID"
    assert set(b["pose"]) == {"FL", "FR", "RL", "RR"}
    for key in ("FL", "FR", "RL", "RR"):
        m = b["pose"][key]
        assert "cam" in m and "toe" in m and "rc_h" in m and "residual" in m
    # 姿态：静态 zero → heave=0
    assert abs(b["attitude"]["heave_mm"]) < 1e-6
    # 载荷：gy=0 → 左右对称 + 静态前轴总和 ≈ 前轴承载
    f = b["loads"]["fz"]
    assert abs(f["FL"] - f["FR"]) < 1.0
    assert abs(f["RL"] - f["RR"]) < 1.0
    assert b["loads"]["tlltd_pct"] == 50.0
    assert abs(b["loads"]["roll_deg"]) < 1e-6
    assert b["mr"]["front"] > 0.05 and b["mr"]["rear"] > 0.05
    # 静态守恒：四轮总和 ≈ 整车总质量 × g（±2%）
    total = f["FL"] + f["FR"] + f["RL"] + f["RR"]
    assert abs(total - 1420.0 * 9.81) < 0.02 * 1420.0 * 9.81


def test_chassis_solve_lateral_load_transfer():
    r = client.post("/api/v3/chassis/solve",
                    json=_req(quasi={"gy": 1.0, "gx": 0.0, "aero_force_n": 0.0,
                                     "aero_bias": 0.5}))
    assert r.status_code == 200
    b = r.json()
    L = b["loads"]
    assert L["roll_deg"] > 0.5            # 1g 侧向 → 明显车身侧倾
    assert 0 < L["roll_grad_deg_per_g"] < 10
    assert L["tlltd_pct"] != 50.0
    # 载荷转移守恒：FL+FR 不变（横向转移只换边；fz 输出舍入 2 位 → 容差 0.05N）
    base = client.post("/api/v3/chassis/solve", json=_req()).json()["loads"]["fz"]
    lat = b["loads"]["fz"]
    assert abs((lat["FL"] + lat["FR"]) - (base["FL"] + base["FR"])) < 0.05
    assert abs((lat["RL"] + lat["RR"]) - (base["RL"] + base["RR"])) < 0.05


def test_chassis_solve_attitude():
    r = client.post("/api/v3/chassis/solve",
                    json=_req(travel={"fl": 30.0, "fr": 30.0, "rl": -30.0, "rr": -30.0}))
    assert r.status_code == 200
    b = r.json()
    # heave=0、roll=0、pitch：前压后伸 → 车头下沉（模型约定 pitch 正 = 车头下沉）
    assert abs(b["attitude"]["heave_mm"]) < 1e-6
    assert abs(b["attitude"]["roll_deg"]) < 0.2
    assert b["attitude"]["pitch_deg"] > 0


def test_chassis_sweep_bump():
    r = client.post("/api/v3/chassis/kandc/bump",
                    json=_req(sweep={"min": -40, "max": 40, "n": 17}))
    assert r.status_code == 200
    b = r.json()
    assert b["case"] == "bump"
    assert len(b["curves"]["travel"]) == 17
    for k in ("cam_FR", "cam_FL", "cam_RR", "cam_RL", "toe_FR", "toe_RR"):
        assert len(b["curves"][k]) == 17
    assert "camber_gain_front" in b["gains"] and "camber_gain_rear" in b["gains"]
    assert abs(b["gains"]["camber_gain_front"]) > 0.3


def test_chassis_sweep_roll_symmetry():
    r = client.post("/api/v3/chassis/kandc/roll",
                    json=_req(sweep={"min": -30, "max": 30, "n": 13}))
    assert r.status_code == 200
    b = r.json()
    assert len(b["curves"]["roll_deg"]) == 13
    # 左轮 -t / 右轮 +t → 镜像对称：cam_FL[i] ≈ cam_FR[i]（±0.3°）
    cf = b["curves"]["cam_FL"]
    cr = b["curves"]["cam_FR"]
    assert max(abs(a - c) for a, c in zip(cf, cr)) < 0.3
    assert "roll_camber_gain_front" in b["gains"]


def test_chassis_sweep_steer():
    r = client.post("/api/v3/chassis/kandc/steer",
                    json=_req(sweep={"min": -8, "max": 8, "n": 17}))
    assert r.status_code == 200
    b = r.json()
    assert "toe_FR" in b["curves"] and "toe_FL" in b["curves"]
    assert "steer_toe_gain_deg_per_mm" in b["gains"]
    # 方向一致：rack+ → FR toe+（与单角 steer 一致）
    assert b["curves"]["toe_FR"][-1] > b["curves"]["toe_FR"][0]


def test_chassis_invalid_points_422():
    body = _req()
    body["vehicle"]["front"]["points"] = {"LCA_F": [1, 2, 3]}
    r = client.post("/api/v3/chassis/solve", json=body)
    assert r.status_code == 422


def test_chassis_unknown_case_404():
    r = client.post("/api/v3/chassis/kandc/doe", json=_req())
    assert r.status_code == 404


def test_chassis_solve_with_arb():
    """带防倾杆：侧倾刚度占比 > 0 且侧倾角减小。"""
    body = _req(quasi={"gy": 1.0, "gx": 0.0, "aero_force_n": 0.0, "aero_bias": 0.5})
    r = client.post("/api/v3/chassis/solve", json=body)
    assert r.status_code == 200
    n_arb = r.json()["loads"]
    body2 = _req(quasi={"gy": 1.0, "gx": 0.0, "aero_force_n": 0.0, "aero_bias": 0.5})
    body2["vehicle"]["front"]["arb"] = {"d": 22.0, "t": 0.62, "dy": 50.0, "dz": 120.0}
    body2["vehicle"]["rear"]["arb"] = {"d": 20.0, "t": 0.6, "dy": 50.0, "dz": 120.0}
    r2 = client.post("/api/v3/chassis/solve", json=body2)
    w_arb = r2.json()["loads"]
    assert w_arb["arb_share_f"] > 0 and w_arb["arb_share_r"] > 0
    assert abs(w_arb["roll_deg"]) < abs(n_arb["roll_deg"])   # ARB 减小侧倾


# ── P0 quasi 内核统一：侧倾耦合迭代（2026-08-22） ──────────────────────

def _kw_curve(kw0: float, quad: float = 8e-5, lin: float = 0.0):
    """前端同源形态的合成 kw 曲线（N/mm，随压缩变软）。线性项经 ±dt 均值抵消，
    二次项是迁移主效应——与真实机构 mr² 曲率一致。"""
    xs = [round(-80.0 + 160.0 * k / 44.0, 2) for k in range(45)]
    return {"travel": xs,
            "kw": [round(kw0 * (1.0 - quad * t * t - lin * t), 4) for t in xs]}


def test_chassis_tlltd_varies_with_gy():
    """TLLTD 随 gy 单调变化 + kphi 随行程迁移（修复线性恒定，对齐前端）。"""
    gys = [0.05, 0.5, 1.0, 1.5, 2.0]
    loads = []
    for gy in gys:
        body = _req(quasi={"gy": gy, "gx": 0.0, "aero_force_n": 0.0, "aero_bias": 0.5})
        body["vehicle"]["front"]["motion_ratio"] = 0.75
        body["vehicle"]["rear"]["motion_ratio"] = 0.78
        body["vehicle"]["front"]["kw_curve"] = _kw_curve(110.0 * 0.75 * 0.75)
        body["vehicle"]["rear"]["kw_curve"] = _kw_curve(130.0 * 0.78 * 0.78, quad=3e-5)
        r = client.post("/api/v3/chassis/solve", json=body)
        assert r.status_code == 200
        loads.append(r.json()["loads"])
    ts = [L["tlltd_pct"] for L in loads]
    assert abs(ts[-1] - ts[0]) > 0.3            # 不再是常数
    assert all(a >= b for a, b in zip(ts, ts[1:])), ts   # 随 gy 单调（软前轴 → 前轴占比降）
    # kphi 随侧倾行程迁移（压缩 → 变软）
    assert loads[-1]["kphi_f"] < loads[0]["kphi_f"]
    assert loads[-1]["kphi_r"] < loads[0]["kphi_r"]
    # 侧倾角随 gy 增长
    rolls = [L["roll_deg"] for L in loads]
    assert all(a < b for a, b in zip(rolls, rolls[1:]))


def test_chassis_kw_curve_validation_422():
    body = _req()
    body["vehicle"]["front"]["kw_curve"] = {"travel": [0.0, 10.0], "kw": [60.0]}
    assert client.post("/api/v3/chassis/solve", json=body).status_code == 422
    body2 = _req()
    body2["vehicle"]["front"]["kw_curve"] = {"travel": [0.0, 10.0], "kw": [60.0, -1.0]}
    assert client.post("/api/v3/chassis/solve", json=body2).status_code == 422