"""F-45 请求校验缺口回归测试（2026-08-30，R-0830-3 波次）。

覆盖：硬点 3 分量/有限性、SweepSpec 有限性/方向、TireParams 正数约束、
TrackPoint target_speed 非负。这些都是 pydantic 服务边界防线——
非法 JSON 直达求解器将被 422 拒绝（F-60 测试盲区① 补全）。
"""
from fastapi.testclient import TestClient

from server import app  # noqa: E402

client = TestClient(app)


def _base_points():
    return {
        "LCA_F": [260.0, 140.0, 130.0], "LCA_R": [260.0, -120.0, 140.0],
        "UCA_F": [350.0, 110.0, 340.0], "UCA_R": [350.0, -100.0, 350.0],
        "LBJ": [640.0, 10.0, 150.0], "UBJ": [590.0, -15.0, 410.0],
        "WC": [710.0, 0.0, 280.0], "TRO": [600.0, -120.0, 185.0],
        "RACK": [220.0, -135.0, 180.0], "STRUT_OUT": [595.0, 10.0, 185.0],
        "RCK_AX_A": [300.0, 15.0, 330.0], "RCK_AX_B": [300.0, 70.0, 328.0],
        "STRUT_IN": [315.0, 45.0, 400.0], "RCK_DMP": [230.0, 48.0, 345.0],
        "DMP_BODY": [30.0, 48.0, 170.0],
    }


def test_pose_rejects_nan_hardpoint():
    """F-45：NaN 硬点必须 422（pydantic allow_inf_nan 默认 True 的缺口已封）。

    注意：TestClient json 参数用严格编码（拒绝 NaN 字面量本身），改用字符串
    "NaN" —— pydantic v2 在 allow_inf_nan 下会解析为 float('nan')，恰好能
    打到 _check_points_values 的 isfinite 卫哨（旧代码会放行进求解器）。
    """
    pts = _base_points()
    pts["LBJ"] = [640.0, "NaN", 150.0]
    r = client.post("/api/v3/solve/pose", json={"points": pts})
    assert r.status_code == 422


def test_pose_rejects_wrong_length_point():
    """F-45：长度 != 3 的硬点列表必须 422。"""
    pts = _base_points()
    pts["WC"] = [710.0, 0.0]
    r = client.post("/api/v3/solve/pose", json={"points": pts})
    assert r.status_code == 422


def test_bump_rejects_reversed_sweep():
    """F-45：min > max 的反向扫掠必须 422（旧版静默产出空/反向曲线）。"""
    r = client.post("/api/v3/kandc/bump", json={"sweep": {"min": 50.0, "max": -50.0}})
    assert r.status_code == 422


def test_bump_rejects_nonfinite_sweep():
    r = client.post("/api/v3/kandc/bump",
                    json={"sweep": {"min": "Infinity", "max": 50.0}})
    assert r.status_code == 422


def test_track_rejects_bad_tire_params():
    """F-45：FzNom<=0 / By<=0 必须 422（tire_mf._d 除零、MF 形状退化防线）。"""
    body = {
        "vehicle": {
            "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
            "hcg_mm": 320.0, "hs_mm": 330.0,
            "front": {"points": _base_points(), "arch": "pushrod",
                      "camber_deg": -1.2, "toe_deg": 0.05, "tire_radius": 305.0,
                      "spring_rate": 110.0, "spring_mass_kg": 300.0,
                      "unsprung_kg": 38.0},
            "rear": {"points": _base_points(), "arch": "pullrod",
                     "camber_deg": -1.5, "toe_deg": 0.1, "tire_radius": 310.0,
                     "spring_rate": 130.0, "spring_mass_kg": 340.0,
                     "unsprung_kg": 42.0},
        },
        "track": [{"x": 0.0, "y": 0.0, "target_speed": 10.0},
                  {"x": 50.0, "y": 0.0, "target_speed": 10.0}],
    }
    bad = dict(body); bad["tire"] = {"Fy0": 8000.0, "FzNom": 0.0}
    assert client.post("/api/v3/chassis/simulate_track", json=bad).status_code == 422
    bad2 = dict(body); bad2["tire"] = {"Fy0": 8000.0, "By": -1.0}
    assert client.post("/api/v3/chassis/simulate_track", json=bad2).status_code == 422


def test_track_rejects_negative_target_speed():
    """F-45：target_speed < 0 必须 422（负速度使松弛/漂移模型无意义）。"""
    body = {
        "vehicle": {
            "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
            "hcg_mm": 320.0, "hs_mm": 330.0,
            "front": {"points": _base_points(), "arch": "pushrod",
                      "camber_deg": -1.2, "toe_deg": 0.05, "tire_radius": 305.0,
                      "spring_rate": 110.0, "spring_mass_kg": 300.0,
                      "unsprung_kg": 38.0},
            "rear": {"points": _base_points(), "arch": "pullrod",
                     "camber_deg": -1.5, "toe_deg": 0.1, "tire_radius": 310.0,
                     "spring_rate": 130.0, "spring_mass_kg": 340.0,
                     "unsprung_kg": 42.0},
        },
        "track": [{"x": 0.0, "y": 0.0, "target_speed": -5.0},
                  {"x": 50.0, "y": 0.0, "target_speed": 10.0}],
    }
    assert client.post("/api/v3/chassis/simulate_track", json=body).status_code == 422


def test_chassis_rejects_nonfinite_axle_point():
    """F-45：整车 axle points 非有限同样 422（ChassisRequest 校验）。"""
    pts = _base_points()
    pts["WC"] = ["NaN", 0.0, 280.0]
    body = {
        "vehicle": {
            "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
            "hcg_mm": 320.0, "hs_mm": 330.0,
            "front": {"points": pts, "arch": "pushrod"},
            "rear": {"points": _base_points(), "arch": "pullrod"},
        }
    }
    assert client.post("/api/v3/chassis/solve", json=body).status_code == 422