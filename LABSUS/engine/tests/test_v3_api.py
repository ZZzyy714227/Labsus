"""/api/v3 服务层验收测试（S2）。

覆盖：健康检查 / 单点求解 / K&C 四工况 / 衬套装配 / 非法输入 / 未知工况。
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from server import app  # noqa: E402  (sys.path 注入由 server 完成)

client = TestClient(app)


def test_health():
    r = client.get("/api/v3/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "bump" in body["kandc"] and "compliance" in body["kandc"]


def test_version():
    r = client.get("/api/v3/version")
    assert r.status_code == 200
    assert r.json()["api"] == "v3"


def test_solve_pose_baseline():
    r = client.post("/api/v3/solve/pose", json={"travel": 10.0, "rack": 0.0})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "VALID"
    assert body["residual_mm"] < 0.02
    m = body["metrics"]
    # 基线前悬 推杆：静态 cam ≈ -1.2°（PRESETS cam0），travel+10 后外倾向负/小变化
    assert -3.0 < m["cam"] < 0.0
    assert "kpi" in m and "cast" in m and "scrub" in m and "trail" in m
    assert "UP5" in body["pose"] and "RK_PIVOT" in body["pose"]


def test_solve_pose_custom_points():
    pts = {
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
    r = client.post("/api/v3/solve/pose",
                    json={"points": pts, "travel": -25.0, "rack": 3.0})
    assert r.status_code == 200
    assert r.json()["status"] == "VALID"


def test_solve_pose_invalid_keys():
    r = client.post("/api/v3/solve/pose",
                    json={"points": {"BOGUS": [1, 2, 3]}, "travel": 0})
    assert r.status_code == 422


def test_bump_curves_and_gains():
    r = client.post("/api/v3/kandc/bump",
                    json={"sweep": {"min": -40, "max": 40, "n": 17}})
    assert r.status_code == 200
    b = r.json()
    assert b["case"] == "bump"
    assert b["status"] in ("VALID", "APPROXIMATE")
    assert len(b["curves"]["travel"]) == 17
    assert len(b["curves"]["cam"]) == 17
    assert len(b["curves"]["toe"]) == 17
    # 外倾曲线单调有物理量级（前悬推杆：压缩行程 cam 越负）
    assert all(v is not None for v in b["curves"]["cam"])
    assert abs(b["curves"]["cam"][0] - b["curves"]["cam"][-1]) > 0.5
    assert "camber_gain_deg_per_25" in b["gains"]
    assert "bump_steer_deg_per_25" in b["gains"]
    assert b["ms"] > 0


def test_bump_with_bushing():
    r = client.post("/api/v3/kandc/bump", json={
        "sweep": {"min": -10, "max": 10, "n": 9},
        "case": {"fz": 3000.0},
        "bushings": [{"name": "bLCA_F", "node": "LCA_F",
                      "kT": [500.0, 500.0, 500.0], "kR": [8e4, 8e4, 8e4]}],
    })
    assert r.status_code == 200
    b = r.json()
    assert b["status"] in ("VALID", "APPROXIMATE")
    assert b["bushing_deltas"] is not None and "bLCA_F" in b["bushing_deltas"]
    # 衬套形变 dz 应有限（万 3mm 量级：3000N 分配后 < 6mm）
    dz = b["bushing_deltas"]["bLCA_F"][2]
    assert abs(dz) < 10.0


def test_bump_no_bushing_matches_pose_consistency():
    """服务层内部一致性：bump 无衬套在某点应与单点 solve_pose 同（travel=7）。"""
    b_r = client.post("/api/v3/kandc/bump",
                      json={"sweep": {"min": 7, "max": 7, "n": 3}})
    p_r = client.post("/api/v3/solve/pose", json={"travel": 7.0, "rack": 0.0})
    assert b_r.status_code == 200 and p_r.status_code == 200
    cam_b = b_r.json()["curves"]["cam"][0]
    cam_p = p_r.json()["metrics"]["cam"]
    assert abs(cam_b - cam_p) < 1e-3


def test_roll_both_sides():
    r = client.post("/api/v3/kandc/roll",
                    json={"sweep": {"min": -30, "max": 30, "n": 13},
                          "track_width": 1580.0})
    assert r.status_code == 200
    b = r.json()
    assert b["case"] == "roll"
    assert "cam_r" in b["curves"] and "cam_l" in b["curves"]
    assert len(b["curves"]["roll_deg"]) == 13
    # 对称性不变量（2026-08-22 P0 修复后收紧）：左轮行程 = -t →
    # cam_l[i]（left at -t）应与反转行程索引 cam_r[n-1-i]（right at -t）
    # 逐点相等——机构镜像精确。旧断言 cam_l[i]≈cam_r[i] 比较的是不同行程，
    # 物理上不成立（差值=外倾增益×2t）；其曾以 <0.3° 通过是因左角设计轮轴
    # 未镜像的缺陷恰好污染抵消（见 r2 研究报告发现 B）。
    cam_r = b["curves"]["cam_r"]
    cam_l = b["curves"]["cam_l"]
    n = len(cam_r)
    dcam = [abs(cam_l[i] - cam_r[n - 1 - i]) for i in range(n)]
    assert max(dcam) < 1e-6
    assert "roll_camber_gain_deg_per_deg" in b["gains"]


def test_steer_sweep():
    r = client.post("/api/v3/kandc/steer",
                    json={"sweep": {"min": -8, "max": 8, "n": 17}})
    assert r.status_code == 200
    b = r.json()
    assert b["case"] == "steer"
    assert len(b["curves"]["toe"]) == 17
    # rack 输入 → toe/steer 方向合理。2026-08-22 steer_axis 修正为 (-1,0,0)
    # （齿条整体沿世界 −X 平移，与前端 setChassis RACK.x −= rack 逐位一致）：
    # rack+ → FR toe 负向（实测 ±8mm ≈ ±3.9°，灵敏度 ~0.39°/mm，旧横拉杆式
    # 轴向模型仅 ~0.019°/mm，差 20.8:1 —— 旧值不可信）。
    toe = b["curves"]["toe"]
    span = abs(toe[-1] - toe[0])
    assert 1.0 < span < 20.0
    assert toe[-1] < toe[0]                      # rack+ → toe−（方向一致性）
    assert "steer" in b["curves"]
    assert "toe_gain_per_unit" in b["gains"]


def test_compliance_no_bushing_warns():
    r = client.post("/api/v3/kandc/compliance",
                    json={"sweep": {"min": -2000, "max": 2000, "n": 9},
                          "compliance_axis": "fy"})
    assert r.status_code == 200
    b = r.json()
    assert any("无衬套" in w for w in b["warnings"])
    # 纯几何：力扫掠不影响姿态 → toe 恒定
    toe = b["curves"]["toe"]
    assert len(set(round(v, 4) for v in toe)) == 1


def test_compliance_with_bushing():
    r = client.post("/api/v3/kandc/compliance", json={
        "sweep": {"min": -2000, "max": 2000, "n": 9},
        "compliance_axis": "fy",
        "case": {"fz": 3000.0},
        "bushings": [{"name": "bLCA_F", "node": "LCA_F",
                      "kT": [300.0, 300.0, 300.0], "kR": [4e4, 4e4, 4e4]}],
    })
    assert r.status_code == 200
    b = r.json()
    assert b["bushing_deltas"] is not None
    assert "compliance_toe_deg_per_kn" in b["gains"]


def test_unknown_case_404():
    r = client.post("/api/v3/kandc/doe", json={})
    assert r.status_code == 404


def test_invalid_bushing_node_422():
    r = client.post("/api/v3/kandc/bump", json={
        "bushings": [{"name": "bX", "node": "NOPE"}]})
    assert r.status_code == 422


def test_bushing_rck_ax_b_422_clear_message():
    """RCK_AX_B 未建模（摇臂单枢轴）：422 且错误信息明确，而非裸 KeyError。"""
    r = client.post("/api/v3/kandc/bump", json={
        "bushings": [{"name": "bRck", "node": "RCK_AX_B"}]})
    assert r.status_code == 422
    assert "RCK_AX_B" in r.text
    assert "KeyError" not in r.text


def test_invalid_compliance_axis_422():
    r = client.post("/api/v3/kandc/compliance",
                    json={"sweep": {"min": 0, "max": 1, "n": 3},
                          "compliance_axis": "fx",
                          "points": {"LCA_F": [1, 2, 3]}})
    assert r.status_code == 422  # 缺硬点键 → 422


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))