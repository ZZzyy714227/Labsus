"""v2 API 测试（设计文档 §11.3）。使用隔离 DataStore，不触碰真实 data/。"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.store as store_mod
from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from core.models import CaseVersion, WheelTravel
from core.store import DataStore
from routes.v2 import router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store_mod, "DEFAULT_ROOT", tmp_path / "store")
    store = DataStore()
    ensure_legacy_import(store)
    ensure_preset_cases(store)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class TestDesigns:
    def test_list_contains_legacy(self, client):
        r = client.get("/api/v2/designs")
        assert r.status_code == 200
        assert any(d["design_id"] == "legacy-import" for d in r.json()["designs"])

    def test_get_design_default_latest(self, client):
        r = client.get("/api/v2/designs/legacy-import")
        assert r.status_code == 200
        body = r.json()
        assert body["version"] == 1
        assert "UP5" in body["front_right"]["points"]

    def test_get_missing_404(self, client):
        assert client.get("/api/v2/designs/nope").status_code == 404

    def test_copy_design(self, client):
        r = client.post("/api/v2/designs",
                        json={"copy_from": "legacy-import", "design_id": "b1",
                              "name": "copy B"})
        assert r.status_code == 200
        assert r.json()["design_id"] == "b1"
        got = client.get("/api/v2/designs/b1").json()
        assert got["name"] == "copy B"

    def test_add_version(self, client):
        base = client.get("/api/v2/designs/legacy-import").json()
        base["notes"] = "edited"
        r = client.post("/api/v2/designs/legacy-import/versions", json=base)
        assert r.status_code == 200
        assert r.json()["version"] == 2
        assert client.get("/api/v2/designs/legacy-import").json()["version"] == 2


class TestCases:
    def test_list_and_get(self, client):
        ids = [c["case_id"] for c in client.get("/api/v2/cases").json()["cases"]]
        assert "static" in ids and "lat-1p3g" in ids
        cv = client.get("/api/v2/cases/lat-1p3g").json()
        assert cv["loads"]["ay_g"] == pytest.approx(1.3)


class TestSolve:
    """P2-1 统一 VehicleResult 结构（front/rear × left/right + 几何层 + 状态）。"""

    def _solve(self, client, case_id="static"):
        r = client.post("/api/v2/solve",
                        json={"design_id": "legacy-import", "case_id": case_id})
        assert r.status_code == 200
        return r.json()

    def test_solve_static_matches_golden(self, client):
        body = self._solve(client)
        assert body["solver"] == "dwb-mechanism-v1"  # 机制求解已切主（顺序解回退）
        # P2-1：静态工况残差 0 → 每轮 VALID，整车 VALID（原为固定 APPROXIMATE）
        assert body["status"] == "VALID"
        assert body["solver_status"] == {
            "front_right": "VALID", "front_left": "VALID",
            "rear_right": "VALID", "rear_left": "VALID",
        }
        fr = body["front"]["right"]["angles"]
        assert fr["camber_deg"] == pytest.approx(-2.49, abs=0.005)
        assert fr["caster_deg"] == pytest.approx(5.005, abs=0.005)
        assert fr["scrub_radius_mm"] == pytest.approx(29.90, abs=0.01)
        assert body["design_id"] == "legacy-import"
        assert body["design_version"] == 1
        assert body["case_id"] == "static"

    def test_unified_result_structure(self, client):
        body = self._solve(client)
        for section in ("front", "rear"):
            assert set(body[section]) == {"left", "right"}
        assert set(body["per_wheel_geometry"]) == {
            "front_right", "front_left", "rear_right", "rear_left"}
        assert set(body["residuals"]) == set(body["solver_status"])
        assert set(body["per_wheel_geometry"]) == set(body["residuals"])
        assert "heave_mm" in body["pose_labels"] and "roll_deg" in body["pose_labels"]
        assert isinstance(body["warnings"], list)
        for name in body["per_wheel_geometry"]:
            g = body["per_wheel_geometry"][name]
            assert len(g["wheel_center"]) == 3
            assert set(g["contact_patch"]) == {"center", "loaded_radius", "camber_deg", "deflection"}
            assert set(g["steering_axis"]) == {"direction", "ground_point"}
            assert set(g["ball_joints"]) == {"upper", "lower"}
            assert g["trajectory"] == []  # 单点解；扫掠端点 P2-2 填充
            # 主销轴单位方向 + 地面交点 z≈0
            d = g["steering_axis"]["direction"]
            assert abs(sum(v * v for v in d) - 1.0) < 1e-6
            assert abs(g["steering_axis"]["ground_point"][2]) < 1e-6

    def test_static_front_mirror_symmetric(self, client):
        """P2-0 属性经 v2 路径复验：静态左右六项指标完全一致。"""
        body = self._solve(client)
        ar = body["front"]["right"]["angles"]
        al = body["front"]["left"]["angles"]
        for key in ar:
            assert ar[key] == pytest.approx(al[key], abs=1e-6), (
                f"{key}: R={ar[key]} L={al[key]}"
            )

    def test_solve_bump_case_residual_reported(self, client):
        body = self._solve(client, case_id="fr-comp")
        assert "front_right" in body["residuals"]
        # 机制求解：fr-comp 压缩工况残差 ~1e-13 → VALID（K-4 已消解）
        assert body["front"]["right"]["status"] == "VALID"
        assert body["residuals"]["front_right"] <= 0.02
        assert not any("front_right" in w and "残差" in w for w in body["warnings"])
        assert body["status"] == "VALID"

    def test_extreme_travel_mechanism_out_of_range(self, client):
        """机制求解：-30mm 残差 ~1e-13 → VALID（K-4 消解）；
        -120mm 伸张端摇臂/推杆闭环不可达 → OUT_OF_RANGE。"""
        DataStore().create_case(
            CaseVersion(version=1, name="extreme-neg30", travel=WheelTravel(fr=-30.0)),
            case_id="extreme-neg30")
        body = self._solve(client, case_id="extreme-neg30")
        assert body["front"]["right"]["status"] == "VALID"
        assert body["residuals"]["front_right"] <= 0.02
        assert body["status"] == "VALID"
        DataStore().create_case(
            CaseVersion(version=1, name="extreme-neg120", travel=WheelTravel(fr=-120.0)),
            case_id="extreme-neg120")
        body2 = self._solve(client, case_id="extreme-neg120")
        assert body2["front"]["right"]["status"] == "OUT_OF_RANGE"

    def test_solve_missing_design_404(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "nope", "case_id": "static"})
        assert r.status_code == 404


class TestP3Loads:
    """P3 载荷层：四轮 Fx/Fy/Fz + 轮边受力 + 左右独立（禁止镜像）。"""

    def _solve(self, client, case_id):
        r = client.post("/api/v2/solve",
                        json={"design_id": "legacy-import", "case_id": case_id})
        assert r.status_code == 200
        return r.json()

    def test_static_loads_layer(self, client):
        body = self._solve(client, "static")
        assert set(body["loads"]) == {"front_right", "front_left",
                                      "rear_right", "rear_left"}
        fr = body["loads"]["front_right"]
        assert fr["fz_n"] == pytest.approx(280.0 * 9.81 / 4.0, abs=0.01)
        assert fr["fx_n"] == 0.0 and fr["fy_n"] == 0.0
        assert fr["off_ground"] is False
        we = fr["wheel_end"]
        assert we["status"] == "VALID"
        assert set(we["member_forces"]) == {
            "uca_front_n", "uca_rear_n", "lca_front_n", "lca_rear_n",
            "pushrod_n", "tie_rod_n"}
        assert we["force_residual_n"] < 1e-6
        assert len(we["ball_joints"]["ubj"]) == 3
        assert set(we["chassis_reactions"]) == {
            "ch1", "ch2", "ch3", "ch4", "ch5", "fl1"}

    def test_lateral_loads_not_mirrored(self, client):
        """1.3g 侧向：左右 Fz 不对称，禁止镜像受力（P3 要求）。"""
        body = self._solve(client, "lat-1p3g")
        fr, fl = body["loads"]["front_right"], body["loads"]["front_left"]
        assert abs(fr["fz_n"] - fl["fz_n"]) > 100.0
        assert fr["fz_n"] != pytest.approx(fl["fz_n"], abs=1e-6)
        # 轮边受力同样不镜像（球头反力分量不同）
        assert fr["wheel_end"]["ball_joints"]["ubj"] !=             pytest.approx(fl["wheel_end"]["ball_joints"]["ubj"], abs=1e-6)
        # 摩擦圆一致（Fy 与 Fz 同比例）
        assert fr["friction_util"] == pytest.approx(fl["friction_util"], abs=1e-3)

    def test_brake_case_loads(self, client):
        """预置 lat-1p3g 的 loads 为 0（该工况无纵向/侧向输入），载荷层仍有效。"""
        body = self._solve(client, "lat-1p3g")
        for name, d in body["loads"].items():
            assert d["wheel_end"]["status"] == "VALID"

    def test_extreme_lateral_warnings(self, client):
        """极端侧向 → 摩擦圆饱和警告（util>1）或离地警告（P3 警告路径）。"""
        from core.models import LoadsInput, WheelTravel
        DataStore().create_case(
            CaseVersion(version=1, name="extreme-lat",
                        travel=WheelTravel(),
                        loads=LoadsInput(ay_g=3.0)),
            case_id="extreme-lat")
        body = self._solve(client, "extreme-lat")
        assert any("摩擦" in w or "离地" in w for w in body["warnings"])
        # 3g 侧向：所有轮摩擦圆利用率 > 1（饱和）
        assert all(d["friction_util"] > 1.0 for d in body["loads"].values())


_STATES = {"VALID", "APPROXIMATE", "NOT_APPLICABLE", "NOT_IMPLEMENTED",
          "SOLVER_FAILED", "EQUILIBRIUM_FAILED", "OUT_OF_RANGE"}
_VALUE_STATES = {"VALID", "APPROXIMATE", "OUT_OF_RANGE"}


class TestP23StateMachineContract:
    """P2-3：v2 表面所有指标显式带七状态，禁止 None 空白。"""

    def test_solve_every_corner_has_status(self, client):
        body = client.post("/api/v2/solve", json={
            "design_id": "legacy-import", "case_id": "static"}).json()
        for section in ("front", "rear"):
            for side in ("left", "right"):
                report = body[section][side]
                assert report["status"] in _STATES
                # VALID/APPROXIMATE 角必须有角度值；其余角可为 None 但状态说明
                if report["status"] in _VALUE_STATES:
                    assert report["angles"] is not None
                    assert all(v is not None for v in report["angles"].values())
        assert all(s in _STATES for s in body["solver_status"].values())

    def test_sweep_metrics_all_have_status(self, client):
        body = client.post("/api/v2/sweep", json={
            "design_id": "legacy-import", "case_id": "static",
            "axle": "front", "axis": "travel", "min": -25, "max": 25,
            "points": 11}).json()
        for key, m in body["metrics"].items():
            assert m["status"] in _STATES, f"{key}: bad status {m['status']}"
            if m["status"] in _VALUE_STATES:
                assert m["value"] is not None, f"{key}: value-state without value"
            else:
                assert m["value"] is None, f"{key}: {m['status']} must not carry value"

    def test_sweep_rack_metrics_all_have_status(self, client):
        body = client.post("/api/v2/sweep", json={
            "design_id": "legacy-import", "case_id": "static",
            "axle": "front", "axis": "rack", "min": -20, "max": 20,
            "points": 9}).json()
        for key, m in body["metrics"].items():
            assert m["status"] in _STATES, f"{key}: bad status {m['status']}"
            if m["status"] in _VALUE_STATES:
                assert m["value"] is not None, f"{key}: value-state without value"


class TestInlineSolve:
    """交互建模内联求解：硬点内联（不落库）+ 实时指标 + sweep。"""

    def _base_payload(self, client):
        d = client.get("/api/v2/designs/legacy-import").json()
        return {
            "case_id": "static",
            "travel": {"fl": 0.0, "fr": 0.0, "rl": 0.0, "rr": 0.0},
            "rack_displacement": 0.0,
            "loads": {"ay_g": 0.0, "ax_g": 0.0},
            "arb_enabled": True,
            "label": "modeler",
            "front_right": {"points": d["front_right"]["points"],
                            "tire": d["front_right"]["tire"]},
        }

    def _post(self, client, payload):
        r = client.post("/api/v2/solve/hardpoints", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_baseline_matches_golden(self, client):
        body = self._post(client, self._base_payload(client))
        assert body["status"] == "VALID"
        assert body["front"]["right"]["angles"]["camber_deg"] == pytest.approx(-2.49, abs=0.01)
        # 载荷层可用且 util 有限（无 inf）
        ld = body["loads"]["front_right"]
        assert ld["fz_n"] == pytest.approx(280.0 * 9.81 / 4.0, abs=0.01)
        assert ld["friction_util"] == 0.0

    def test_drag_hardpoint_changes_metrics(self, client):
        """拖拽模拟：下球头 UP2 内移 20mm → KPI 显著改变（建模闭环）。"""
        p = self._base_payload(client)
        p["front_right"]["points"]["UP2"][1] -= 20.0
        body = self._post(client, p)
        kpi = body["front"]["right"]["angles"]["kpi_deg"]
        assert abs(kpi - 2.51) > 3.0   # 从 ~2.51 显著变负

    def test_sweep_returns_curves(self, client):
        p = self._base_payload(client)
        p["sweep"] = {"axis": "travel", "axle": "front", "min": -25, "max": 25, "points": 21}
        body = self._post(client, p)
        assert "right_camber_deg" in body["sweep"]["curves"]
        assert len(body["sweep"]["values"]) == 21

    def test_lateral_load_asymmetric(self, client):
        p = self._base_payload(client)
        p["loads"]["ay_g"] = 1.3
        body = self._post(client, p)
        fr = body["loads"]["front_right"]["fz_n"]
        fl = body["loads"]["front_left"]["fz_n"]
        assert abs(fr - fl) > 100.0

    def test_missing_front_right_422(self, client):
        r = client.post("/api/v2/solve/hardpoints", json={
            "front_left": {"points": {"UP1": [0, 0, 0]}}})
        assert r.status_code == 422

    def test_p1_side_metrics_present(self, client):
        body = self._post(client, self._base_payload(client))
        p1 = body["p1"]
        assert "front" in p1["roll_stiffness"] and p1["roll_stiffness"]["front"] > 0
        assert 0 < p1["roll_stiffness"]["front_pct"] < 100
        assert "lateral_total" in p1["transfer"]["front"]
        assert p1["instant_center"]["front"]["svic_x"] is not None
        assert p1["ride"]["ride_freq_f_hz"] > 0.5
        assert any(t["key"] == "ride_freq_f" for t in p1["targets"])
        assert all(t["status"] in ("green", "yellow", "red") for t in p1["targets"])


class TestP5Handling:
    """P5 操稳：understeer / K 曲线 / 调平（整合 v2）。"""

    def test_understeer_expected_direction(self, client):
        body = client.post("/api/v2/handling", json={
            "design_id": "legacy-import", "case_id": "static",
            "ay_g": 1.0}).json()
        assert body["understeer"]["status"] == "VALID"
        assert body["understeer"]["alpha_f_deg"] is not None
        # 对称默认车接近中性；给定 K 为有限值
        assert abs(body["understeer"]["k_deg_per_g"]) < 5.0
        assert "k_curve" in body
        assert len(body["k_curve"]["ay_g"]) == 13
        # 调平：静态预载=静载（ride=0）
        fl = body["ride_level"]["wheels"]["fl"]
        assert fl["spring_force_n"] == pytest.approx(fl["fz_static_n"], abs=1e-3)
        assert body["ride_level"]["balance_residual_n"] == pytest.approx(0.0, abs=1e-6)

    def test_ride_custom_height(self, client):
        body = client.post("/api/v2/handling", json={
            "design_id": "legacy-import", "case_id": "static",
            "ay_g": 0.0, "ride_mm": {"fl": 15.0, "fr": 15.0, "rl": 0.0, "rr": 0.0}}).json()
        # 前轴压缩 15 → roll/pitch 姿态非零
        pose = body["ride_level"]["pose"]
        assert abs(pose["roll_deg"]) < 1e-9          # 左右对称
        assert pose["pitch_deg"] != 0.0              # 前后不等



    def test_handling_yaw_kingpin(self, client):
        """P5 深化：handling 端点含 yaw 动力学 + kingpin 回正。"""
        body = client.post("/api/v2/handling", json={
            "design_id": "legacy-import", "case_id": "static", "ay_g": 1.0}).json()
        y = body["yaw"]
        assert y["status"] == "VALID"
        assert y["yaw_rate_gain_1_over_s"] == pytest.approx(15.0 / 1.55, rel=1e-3)
        assert len(y["gain_curve"]["v_m_s"]) == 21
        kp = body["kingpin"]
        assert kp is not None and kp["geometry"]["trail_mm"] > 0
        assert kp["total_nmm"] < 0            # 回正方向

    def test_handling_arb_geometry(self, client):
        """几何 ARB：新车参数含几何键 → k_arb 由几何计算。"""
        # legacy 方案 vehicle 已含 arb_f_*_mm 几何（config 默认注入）
        body = client.post("/api/v2/handling", json={
            "design_id": "legacy-import", "case_id": "static", "ay_g": 0.2}).json()
        # K 曲线基于完整分布（含几何 ARB）— 确保不抛且 understeer VALID
        assert body["understeer"]["status"] == "VALID"

    def test_settle_ride_translates_pose(self, client):
        """调平闭环：settle_ride=ride_mm 平移 → 静态姿态体现调平偏移。"""
        body = client.post("/api/v2/solve", json={
            "design_id": "legacy-import", "case_id": "static",
            "settle_ride": True,
            "ride_mm": {"fl": -10.0, "fr": -10.0, "rl": 0.0, "rr": 0.0}}).json()
        # 前轴伸张 10 → pitch 非零；-10mm 处残差属 K-4 区间 → VALID/APPROXIMATE 均可
        assert body["pose_labels"]["pitch_deg"] != 0.0
        assert body["status"] in {"VALID", "APPROXIMATE"}

class TestP4:
    """P4 工程迭代工作流：A/B 对比 / 敏感性 / 导出 / 版本回退。"""

    def _make_b_design(self, client):
        store = DataStore()
        store.create_design(store.get_design("legacy-import", 1), design_id="b1")
        dv = store.get_design("b1", 1)
        pts = dict(dv.front_right.points)
        pts["UP1"] = [pts["UP1"][0] + 5.0, pts["UP1"][1], pts["UP1"][2]]
        new = dv.model_copy(deep=True)
        new.front_right = new.front_right.model_copy(update={"points": pts})
        store.add_design_version("b1", new)
        return store

    def test_compare_hardpoint_and_metric_diffs(self, client):
        self._make_b_design(client)
        body = client.post("/api/v2/compare", json={
            "design_a_id": "legacy-import", "design_b_id": "b1",
            "case_id": "static", "axle": "front"}).json()
        assert body["design_b"]["version"] == 2
        assert body["hardpoint_diffs"]["front_right"]["UP1"] == [5.0, 0.0, 0.0]
        assert body["metric_diffs"]["front_right"]["caster_deg"] < 0
        assert "curve_overlay" in body
        for side_curve in ("design_a", "design_b"):
            assert "right_camber_deg" in body["curve_overlay"][side_curve]
        assert set(body["status_a"]) == {"front_right", "front_left",
                                         "rear_right", "rear_left"}

    def test_compare_version_rollback_same_design(self, client):
        self._make_b_design(client)
        body = client.post("/api/v2/compare", json={
            "design_a_id": "b1", "design_a_version": 1, "design_b_version": 2,
            "case_id": "static"}).json()
        assert body["hardpoint_diffs"]["front_right"]["UP1"] == [5.0, 0.0, 0.0]

    def test_compare_404(self, client):
        r = client.post("/api/v2/compare", json={
            "design_a_id": "nope", "design_b_id": "b1", "case_id": "static"})
        assert r.status_code == 404

    def test_sensitivity_matrix(self, client):
        body = client.post("/api/v2/sensitivity", json={
            "design_id": "legacy-import", "case_id": "static",
            "corner": "front_right", "hardpoints": ["UP1", "CH1"],
            "metrics": ["camber_deg", "toe_deg", "caster_deg"]}).json()
        assert body["baseline"]["camber_deg"] == pytest.approx(-2.49, abs=0.01)
        assert body["baseline_status"] == "VALID"
        assert "UP1" in body["sensitivity"] and "CH1" in body["sensitivity"]
        assert "x" in body["summary_per_mm"]["UP1"]
        assert "per_mm" in next(iter(body["sensitivity"]["UP1"].values()))

    def test_sensitivity_bad_delta(self, client):
        r = client.post("/api/v2/sensitivity", json={
            "design_id": "legacy-import", "case_id": "static",
            "hardpoints": ["UP1"], "delta_mm": 0.0})
        assert r.status_code == 422

    def test_export_sweep_csv(self, client):
        body = client.post("/api/v2/export", json={
            "design_id": "legacy-import", "case_id": "static",
            "kind": "sweep", "format": "csv", "axle": "front", "points": 5}).json()
        assert body["filename"].endswith(".csv")
        lines = body["data"].strip().splitlines()
        assert len(lines) == 6
        assert lines[0].startswith("value,right_camber_deg")

    def test_export_solve_csv(self, client):
        body = client.post("/api/v2/export", json={
            "design_id": "legacy-import", "case_id": "static",
            "kind": "solve", "format": "csv"}).json()
        assert body["filename"].endswith(".csv")
        lines = body["data"].strip().splitlines()
        assert len(lines) == 5
        assert "corner" in lines[0]

    def test_export_solve_json(self, client):
        body = client.post("/api/v2/export", json={
            "design_id": "legacy-import", "case_id": "static",
            "kind": "solve", "format": "json"}).json()
        assert body["solver"] == "dwb-mechanism-v1"
        assert "loads" in body

    def test_sweep_performance_budget(self, client):
        import time
        t0 = time.perf_counter()
        r = client.post("/api/v2/sweep", json={
            "design_id": "legacy-import", "case_id": "static",
            "axle": "front", "axis": "travel", "min": -25, "max": 25,
            "points": 25})
        elapsed = time.perf_counter() - t0
        assert r.status_code == 200
        # 机制求解单姿态 ~17ms（残差 1e-11mm）；25 点双角扫掠预算放宽（原顺序解 <1s 对应 0.03–0.7mm 残差精度）
        assert elapsed < 3.0, f"sweep too slow: {elapsed:.2f}s"


class TestSweep:
    """P2-2 曲线端点：轮跳/转向扫掠 + 派生指标（七状态）。"""

    def _sweep(self, client, **over):
        req = {"design_id": "legacy-import", "case_id": "static",
               "axle": "front", "axis": "travel", "min": -25, "max": 25,
               "points": 11}
        req.update(over)
        r = client.post("/api/v2/sweep", json=req)
        assert r.status_code == 200, r.text
        return r.json()

    def test_travel_sweep_curves_and_metrics(self, client):
        body = self._sweep(client)
        assert body["axle"] == "front" and body["axis"] == "travel"
        assert len(body["values"]) == 11
        for ck in ("right_camber_deg", "right_toe_deg", "right_scrub_radius_mm",
                   "right_caster_trail_mm", "left_camber_deg", "left_toe_deg",
                   "roll_center_height_mm", "motion_ratio", "track_change_mm"):
            assert ck in body["curves"], f"missing curve {ck}"
            assert len(body["curves"][ck]) == 11
        # 静态点 toe≈0（P2-0 约定）
        assert body["curves"]["right_toe_deg"][5] == pytest.approx(0.0, abs=1e-6)
        # 派生指标：MR 几何值（非硬编码 0.7/0.6）
        mr = body["metrics"]["motion_ratio"]
        assert mr["status"] == "VALID" and mr["value"] is not None
        assert mr["value"] != pytest.approx(0.7, abs=1e-9)
        # 状态机：jacking 显式 NOT_IMPLEMENTED，不伪造
        assert body["metrics"]["jacking"]["status"] == "NOT_IMPLEMENTED"
        assert body["metrics"]["jacking"]["value"] is None

    def test_travel_sweep_mirror_symmetric(self, client):
        """P2-4 镜像验证：对称默认几何上，heave 扫掠全程左右曲线相等（1e-3 容差，
        浮点/分支差异）。"""
        body = self._sweep(client, min=-30, max=30, points=13)
        for key in ("camber_deg", "toe_deg", "scrub_radius_mm",
                    "caster_trail_mm", "kpi_deg"):
            r_key = f"right_{key}"
            l_key = f"left_{key}"
            r_curve = body["curves"][r_key]
            l_curve = body["curves"][l_key]
            for i in range(len(r_curve)):
                if r_curve[i] is None or l_curve[i] is None:
                    continue
                assert r_curve[i] == pytest.approx(l_curve[i], abs=1e-3), (
                    f"{key}@{body['values'][i]}: R={r_curve[i]} L={l_curve[i]}")

    def test_bump_steer_sign_track(self, client):
        """P2-4 符号方向：默认几何 bump steer 为 +（压缩时 toe-in 增加，P2-0 约定）。"""
        body = self._sweep(client)
        bs = body["metrics"]["bump_steer_right"]
        assert bs["status"] == "VALID"
        toes = body["curves"]["right_toe_deg"]
        assert toes[5] == pytest.approx(0.0, abs=1e-6)
        assert toes[-1] > toes[0]

    def test_rack_sweep_ackermann_and_scg(self, client):
        body = self._sweep(client, axis="rack", min=-20, max=20, points=9)
        toes = body["curves"]["right_toe_deg"]
        assert all(toes[i + 1] > toes[i] for i in range(len(toes) - 1))
        ack = body["curves"]["ackermann_pct"]
        assert any(v is not None for v in ack), "ackermann curve empty"
        assert body["metrics"]["ackermann"]["status"] == "NOT_APPLICABLE"
        scg = body["metrics"]["steering_camber_gain_right"]
        assert scg["status"] in {"VALID", "NOT_APPLICABLE"}
        if scg["status"] == "VALID":
            assert abs(scg["value"]) < 1.0

    def test_sweep_invalid_args(self, client):
        assert client.post("/api/v2/sweep", json={
            "design_id": "legacy-import", "case_id": "static",
            "axle": "middle", "min": 0, "max": 10}).status_code == 422
        assert client.post("/api/v2/sweep", json={
            "design_id": "legacy-import", "case_id": "static",
            "axle": "front", "min": 10, "max": 0}).status_code == 422


class TestRig:
    """P0 四轮时域台架端点：静态稳定 / 四轮响应 / 相位耦合。"""

    def _payload(self, client, **exc):
        d = client.get("/api/v2/designs/legacy-import").json()
        return {
            "front_right": {"points": d["front_right"]["points"],
                            "tire": d["front_right"]["tire"]},
            "excitation": {**{"kind": "step", "amplitude_mm": 15.0, "freq_hz": 1.0,
                              "duration_s": 1.0, "corners": []}, **exc},
            "dt_s": 0.002,
            "ns": 10,
        }

    def test_static_is_stable(self, client):
        r = client.post("/api/v2/rig", json=self._payload(client, amplitude_mm=0.0))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["wheels"]["fr"]["fs"][0] > 0
        assert len(body["t"]) == len(body["body"]["zc"])
        assert max(abs(v) for v in body["body"]["zc"]) < 1.0

    def test_four_wheel_coupling(self, client):
        r = client.post("/api/v2/rig", json=self._payload(
            client, kind="sine", amplitude_mm=10.0, freq_hz=2.0,
            duration_s=1.0, corners=["fr"]))
        body = r.json()
        amp = {c: max(abs(v) for v in body["wheels"][c]["dzu"]) for c in body["wheels"]}
        assert amp["fr"] > 5.0
        assert amp["fl"] < amp["fr"] * 0.5
        assert amp["fl"] > 0.05
        assert body["meta"]["mr"]["fr"] > 0
