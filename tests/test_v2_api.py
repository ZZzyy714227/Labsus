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
        assert body["solver"] == "sequential-bump-steer-v1"
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
        # fr-comp 为压缩工况：诚实残差 0.053mm 超 0.02 → APPROXIMATE + 警告
        assert body["front"]["right"]["status"] == "APPROXIMATE"
        assert body["residuals"]["front_right"] > 0.02
        assert any("front_right" in w and "残差" in w for w in body["warnings"])
        assert body["front"]["right"]["angles"]["camber_deg"] != pytest.approx(-2.49)
        assert body["status"] == "APPROXIMATE"

    def test_extreme_travel_reports_out_of_range(self, client):
        """K-4 全行程残差经 v2 如实暴露：-30mm 残差 0.748 → OUT_OF_RANGE。"""
        DataStore().create_case(
            CaseVersion(version=1, name="extreme", travel=WheelTravel(fr=-30.0)),
            case_id="extreme-neg")
        body = self._solve(client, case_id="extreme-neg")
        assert body["front"]["right"]["status"] == "OUT_OF_RANGE"
        assert body["residuals"]["front_right"] > 0.02
        assert body["status"] == "OUT_OF_RANGE"
        assert any("front_right" in w and "残差" in w for w in body["warnings"])

    def test_solve_missing_design_404(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "nope", "case_id": "static"})
        assert r.status_code == 404
