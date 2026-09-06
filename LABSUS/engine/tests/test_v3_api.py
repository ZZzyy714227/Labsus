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


# ── G31-P7：Python 端可选 PowertrainSpec（缺省 None，不污染对拍锚）──

_PT_FRONT = {
    "LCA_F": [260, 140, 130], "LCA_R": [260, -120, 140], "UCA_F": [350, 110, 340],
    "UCA_R": [350, -100, 350], "LBJ": [640, 10, 150], "UBJ": [590, -15, 410],
    "WC": [710, 0, 280], "TRO": [600, -120, 185], "RACK": [220, -135, 180],
    "STRUT_OUT": [595, 10, 185], "RCK_AX_A": [300, 15, 330], "RCK_AX_B": [300, 70, 328],
    "STRUT_IN": [315, 45, 400], "RCK_DMP": [230, 48, 345], "DMP_BODY": [30, 48, 170],
}
_PT_REAR = {
    "LCA_F": [250, 140, 115], "LCA_R": [250, -130, 125], "UCA_F": [340, 110, 320],
    "UCA_R": [340, -110, 330], "LBJ": [630, 10, 135], "UBJ": [580, -15, 390],
    "WC": [700, 0, 290], "TRO": [590, -120, 170], "RACK": [210, -130, 160],
    "STRUT_OUT": [570, -15, 380], "RCK_AX_A": [340, 25, 290], "RCK_AX_B": [340, 75, 292],
    "STRUT_IN": [370, 45, 255], "RCK_DMP": [305, 60, 270], "DMP_BODY": [25, 62, 310],
}


def _pt_min_body(**over):
    """最小合法 TrackSimRequest 构造字典（vehicle 全 15 键 + ≥2 track 点）。"""
    b = {
        "vehicle": {
            "wheelbase_mm": 2750.0, "mass_kg": 1420.0, "sprung_mass_kg": 1260.0,
            "hcg_mm": 350.0, "hs_mm": 370.0,
            "front": {"points": dict(_PT_FRONT)},
            "rear": {"points": dict(_PT_REAR)},
        },
        "track": [{"x": 0.0, "y": 0.0, "target_speed": 15.0},
                  {"x": 60.0, "y": 0.0, "target_speed": 15.0}],
    }
    b.update(over)
    return b


def test_powertrain_optional_field():
    from src.api.v3models import TrackSimRequest, PowertrainSpec  # noqa: F401
    # 带 powertrain：架构/齿轮比嵌套解析
    req = TrackSimRequest(**_pt_min_body(powertrain={
        "architecture": "ice",
        "ice": {"map": [[800, 1200], [9000, 1200]]},
        "gearbox": {"ratios": [3, 2, 1], "finalDrive": 3.9}}))
    assert req.powertrain.architecture == "ice"
    assert req.powertrain.gearbox.ratios == [3, 2, 1]
    assert req.powertrain.ice is not None
    # 向后兼容：旧 T_max/P_kw 标量键仍被识别（PowertrainSpec 继承 PowertrainParams）
    req2 = TrackSimRequest(**_pt_min_body(
        powertrain={"T_max": 320.0, "P_kw": 120.0, "drive_split_f": 1.0}))
    assert req2.powertrain.T_max == 320.0
    assert req2.powertrain.drive_split_f == 1.0
    # 缺省不污染对拍：未下发 powertrain → model_dump 中该键为 None
    d = TrackSimRequest(**_pt_min_body()).model_dump()
    assert d.get("powertrain") is None


def test_powertrain_frontend_shape_extra_ignored():
    """G31-P10-4：前端 09-track.js 下发的形状（标量+嵌套+JS 专有字段）被接受。

    fricA/fricB/fricC/throttleTau（IceSpec）、autoUpFrac/autoDownFrac（GearboxSpec）、
    diff/centerDiff（PowertrainSpec）均为 Python 不消费的 JS 字段，extra=ignore 吸收
    ——防全局 strict 化后 422；同时验证 transient 消费门控依赖的 ice 嵌套完整可达。"""
    from src.api.v3models import TrackSimRequest
    req = TrackSimRequest(**_pt_min_body(powertrain={
        "T_max": 250, "P_kw": 80, "brake_split_f": 0.6,       # 标量共存（继承）
        "architecture": "ice", "drive": "rwd", "splitFront": 0.0,
        "ice": {"cyl": 8, "layout": "V8", "map": [[800, 520], [6500, 520]],
                 "redlineRpm": 8500, "fuelCutRpm": 8700,
                 "fricA": 8, "fricB": 0.002, "fricC": 2.2e-6, "throttleTau": 0.02},
        "gearbox": {"type": "manual", "ratios": [3.0, 2.2, 1.7, 1.4, 1.15, 0.95],
                     "finalDrive": 3.9, "shiftTimeMs": 120, "eff": 0.97,
                     "autoUpFrac": 0.92, "autoDownFrac": 0.55},
        "diff": {"type": "lsd", "bias": 3, "lockNm": 120, "slipRefRadS": 8}}))
    assert getattr(req.powertrain.ice, "fricA", None) is None   # extra=ignore：静默丢弃（非 422）
    assert req.powertrain.gearbox.ratios[0] == 3.0
    assert req.powertrain.drive == "rwd"
    # transient 门控可达：ice is not None → 等效轮上扭矩覆盖生效路径可用
    assert req.powertrain.ice.map[0][1] == 520


# ── G31-P7 审查修复：IceSpec.map 边界校验（畸形输入 → ValidationError/422，
#    而非 transient 内 p[0]/p[1] 触发的 IndexError/500）。语义对齐前端
#    16-powertrain.js validate 的 ice.map / ice.map(ascending)。──

def test_icespec_map_malformed_raises_validation_error():
    """三条畸形 map 各自触发 pydantic ValidationError（模型层）。"""
    from pydantic import ValidationError
    from src.api.v3models import IceSpec
    # (1) 每项长度 != 2（缺扭矩分量）——transient 会 p[1] → IndexError
    with pytest.raises(ValidationError):
        IceSpec(map=[[800]])
    # (2) rpm 非严格递增（重复 800 → 插值分母为零/负）
    with pytest.raises(ValidationError):
        IceSpec(map=[[800, 1], [800, 2]])
    # (3) 含 NaN（pydantic 默认 allow_inf_nan=True → 需显式拒绝）
    with pytest.raises(ValidationError):
        IceSpec(map=[[800, float("nan")], [9000, 1200]])
    # 附加：空 map 亦拒绝（断言 map 非空）
    with pytest.raises(ValidationError):
        IceSpec(map=[])


def test_icespec_map_valid_passes():
    """合法 map（非空 + 每项长度 2 + 全有限 + rpm 严格递增）通过校验。"""
    from src.api.v3models import IceSpec
    ice = IceSpec(map=[[800, 1200], [5000, 1400], [9000, 1100]])
    assert ice.map == [[800, 1200], [5000, 1400], [9000, 1100]]
    # 缺省 map 亦合法（[[800,1200],[9000,1200]]，rpm 严格递增）
    assert IceSpec().map == [[800, 1200], [9000, 1200]]


def test_icespec_map_malformed_422_not_500():
    """端到端：畸形 ice.map 经 simulate_track 端点 → 422（ValidationError），
    而非 500（IndexError）。这是本修复的核心验收口径。

    只跑 JSON 可渲染的两种畸形：[[800]] 正是旧路径会在 transient
    `p[1] for p in ice.map` 触发 IndexError（500）的用例。NaN 已在
    test_icespec_map_malformed_raises_validation_error 模型层证实：它的
    HTTP 回路会被 Starlette 阻断——JSONResponse.render 用 allow_nan=False
    序列化 422 详情（回显非法输入），与引擎无关的框架限制。"""
    for bad_map in ([[800]], [[800, 1], [800, 2]]):
        r = client.post("/api/v3/chassis/simulate_track",
                        json=_pt_min_body(powertrain={
                            "architecture": "ice", "ice": {"map": bad_map}}))
        assert r.status_code == 422, (bad_map, r.status_code, r.text)
        assert "IndexError" not in r.text


def test_server_error_handling_500_on_crash(monkeypatch):
    """验证 server.py 错误分流：非客户端输入异常（如内部 ZeroDivisionError）
    返回 HTTP 500（脱敏详情），而非错误地归为 422 客户端错误。"""
    from src.api import v3service

    def _crash_run_pose(req):
        raise ZeroDivisionError("simulated internal calculation bug")

    monkeypatch.setattr(v3service, "run_pose", _crash_run_pose)
    body = {"travel": 0.0, "rack": 0.0}
    r = client.post("/api/v3/solve/pose", json=body)
    assert r.status_code == 500
    assert "ZeroDivisionError" in r.text
    assert "simulated internal calculation bug" not in r.text  # F-46 脱敏验证


def test_server_error_handling_422_on_value_error(monkeypatch):
    """验证 server.py 错误分流：数值或输入异常（ValueError）返回 HTTP 422。"""
    from src.api import v3service

    def _value_err_run_pose(req):
        raise ValueError("unsolvable linkage configuration")

    monkeypatch.setattr(v3service, "run_pose", _value_err_run_pose)
    body = {"travel": 0.0, "rack": 0.0}
    r = client.post("/api/v3/solve/pose", json=body)
    assert r.status_code == 422
    assert "ValueError" in r.text


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))