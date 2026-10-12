"""前后端 API 契约守卫（M5，2026-09-20）。

动机：`web/js/06-ui-panels.js` 与 `web/js/09-track.js` 按**硬编码键名**读取引擎
响应（`d.curves["cam_r"]`、`L.tlltd_pct`、`d.loads.fz.FL` …）。后端改键名不会
报错，前端会静默空白——本文件把这条跨语言契约钉成可执行断言。

覆盖：
1. `/api/v3/chassis/simulate_track` 的响应键集 == `TrackSimResponse` 字段集
   （该端点唯一返回裸 dict，M5 起已绑 response_model）；
2. 各 K&C / 整车端点的响应里，前端实际读取的键**全部存在**；
3. `TrackSimResponse.summary` 允许 None（`_wash_json` 洗刷），键名仍被钉死。

注意：这些是**键存在性**断言，不是数值断言——数值正确性由
test_v3_chassis / test_v3_api / test_tphys_parity 等承担。
"""
import pytest
from fastapi.testclient import TestClient
from server import app

from src.api.v3models import (
    ChassisPoseResponse,
    ChassisSweepResponse,
    KandcResponse,
    PoseResponse,
    TrackSimResponse,
)

client = TestClient(app)

# ── 前端实际读取的键（2026-09-20 逐行核对 web/js/06-ui-panels.js）────────
FE_KANDC_CURVES = {
    "bump": ("travel", "cam", "toe", "cast"),
    "steer": ("rack", "cam", "toe", "cast"),
    "compliance": ("force", "cam", "toe", "cast"),
    "roll": ("travel", "cam_r", "cam_l", "toe_r", "toe_l"),
}
FE_CHASSIS_SOLVE_LOADS = (
    "roll_deg", "roll_grad_deg_per_g", "kphi_f", "kphi_r",
    "arb_share_f", "arb_share_r",
    "dFz_u_f", "dFz_geo_f", "dFz_elas_f", "dFz_f_tot",
    "tlltd_pct",
)
FE_CHASSIS_SOLVE_ATTITUDE = ("heave_mm", "roll_deg", "pitch_deg")
FE_CHASSIS_SWEEP_CURVES = ("cam_FL", "cam_FR", "cam_RL", "cam_RR")


def _vehicle() -> dict:
    from src.api.v3service import DEFAULT_DWB_POINTS
    return {"front": {"points": DEFAULT_DWB_POINTS}, "rear": {"points": DEFAULT_DWB_POINTS}}


# ── 1. simulate_track 裸 dict 键集 == 模型字段集 ────────────────────────

def test_simulate_track_keys_match_model():
    track = [{"x": 0, "y": 0, "target_speed": 15.0},
             {"x": 80, "y": 0, "target_speed": 15.0}]
    r = client.post("/api/v3/chassis/simulate_track",
                    json={"vehicle": _vehicle(), "track": track,
                          "dt": 0.02, "sim_time": 2.0, "start_speed": 8.0})
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    assert set(body) == set(TrackSimResponse.model_fields), (
        "响应键集与 TrackSimResponse 不一致——后端改键会让前端静默空白",
        sorted(set(body) ^ set(TrackSimResponse.model_fields)))
    # 前端 09-track.js 回放读取的 trace 行键。
    # 注意：行内**没有** "t" —— run_track_sim 用 `row.pop("t")` 把时间抽到
    # 与 trace 等长的平行数组 `t` 里（索引对齐），故此处同时断言长度一致。
    assert len(body["t"]) == len(body["trace"])
    if body["trace"]:
        row = body["trace"][0]
        for k in ("x", "y", "psi", "vx", "vy", "r", "roll", "pitch", "ay", "ax",
                  "delta", "throttle", "brake", "drs", "ge_f", "ge_r"):
            assert k in row, (k, sorted(row))
        for w in ("FL", "FR", "RL", "RR"):
            for pref in ("alpha_", "alphaL_", "fz_", "fy_", "fx_", "mu_", "slip_", "cam_"):
                assert f"{pref}{w}" in row, (f"{pref}{w}", sorted(row))


def test_track_summary_keys_survive_wash():
    """发散工况下 summary 的**键**必须仍在，值允许被洗成 None（F-25 × M5 相容点）。

    行为断言（替代原先的纯类型反射）：真实跑一次 simulate_track，检查
    ① `summary` 键集稳定；② 每个值都是 float 或 None（`_wash_json` 洗刷的契约）。
    """
    track = [{"x": 0, "y": 0, "target_speed": 15.0},
             {"x": 60, "y": 0, "target_speed": 15.0}]
    r = client.post("/api/v3/chassis/simulate_track",
                    json={"vehicle": _vehicle(), "track": track,
                          "dt": 0.02, "sim_time": 1.0, "start_speed": 8.0})
    assert r.status_code == 200, r.text[:400]
    summary = r.json()["summary"]
    expected = {"path_length_m", "v_end", "v_max", "max_ay_g",
                "max_slip_deg", "aero_n", "drs_frac", "ge_f", "ge_r"}
    assert set(summary) >= expected, sorted(summary)
    for k, v in summary.items():
        assert v is None or isinstance(v, (int, float)), (k, type(v))


# ── 2. 前端读取键的存在性 ──────────────────────────────────────────────

@pytest.mark.parametrize("case", ["bump", "steer", "compliance", "roll"])
def test_kandc_curves_contain_frontend_keys(case):
    r = client.post(f"/api/v3/kandc/{case}",
                    json={"points": _vehicle()["front"]["points"],
                          "sweep": {"min": -20, "max": 20, "n": 5}})
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert set(d) == set(KandcResponse.model_fields)
    missing = [k for k in FE_KANDC_CURVES[case] if k not in d["curves"]]
    assert not missing, (case, missing, sorted(d["curves"]))


def test_chassis_solve_contains_frontend_load_keys():
    r = client.post("/api/v3/chassis/solve",
                    json={"vehicle": _vehicle(), "quasi": {"gy": 0.8, "gx": 0.0}})
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert set(d) == set(ChassisPoseResponse.model_fields)
    for k in FE_CHASSIS_SOLVE_LOADS:
        assert k in d["loads"], (k, sorted(d["loads"]))
    assert set(d["loads"]["fz"]) == {"FL", "FR", "RL", "RR"}
    for k in FE_CHASSIS_SOLVE_ATTITUDE:
        assert k in d["attitude"], (k, sorted(d["attitude"]))
    # 前端「核心结论」还读 mr 与 us_curve
    assert d["mr"], "mr 为空会让前端 MR 读数静默留空"
    for k in ("gy", "us_angle_deg", "alpha_f_deg", "alpha_r_deg"):
        assert k in d["us_curve"], (k, sorted(d["us_curve"]))


def test_chassis_sweep_contains_frontend_keys():
    r = client.post("/api/v3/chassis/kandc/roll",
                    json={"vehicle": _vehicle(),
                          "sweep": {"min": -10, "max": 10, "n": 5}})
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert set(d) == set(ChassisSweepResponse.model_fields)
    # 前端按 d.case 选横轴键：roll → roll_deg，其余 → travel/rack
    xk = "roll_deg" if d["case"] == "roll" else "travel"
    assert xk in d["curves"], (xk, sorted(d["curves"]))
    missing = [k for k in FE_CHASSIS_SWEEP_CURVES if k not in d["curves"]]
    assert not missing, (missing, sorted(d["curves"]))


def test_pose_response_shape_is_declared():
    """/solve/pose 前端未调用，但模型仍须与返回一致（防契约腐化）。"""
    r = client.post("/api/v3/solve/pose", json={"travel": 0.0, "rack": 0.0})
    assert r.status_code == 200, r.text[:400]
    assert set(r.json()) == set(PoseResponse.model_fields)
