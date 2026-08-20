"""v2 API 测试（设计文档 §11.3）。使用隔离 DataStore，不触碰真实 data/。"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.store as store_mod
from core.legacy_import import ensure_legacy_import, ensure_preset_cases
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
    def test_solve_static_matches_golden(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "legacy-import", "case_id": "static"})
        assert r.status_code == 200
        body = r.json()
        assert body["solver"] == "sequential-bump-steer-v1"
        assert body["status"] == "APPROXIMATE"
        fr = body["metrics"]["front_right"]
        assert fr["camber_deg"] == pytest.approx(-2.49, abs=0.005)
        assert body["design_id"] == "legacy-import"
        assert body["design_version"] == 1
        assert body["case_id"] == "static"

    def test_solve_bump_case_residual_reported(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "legacy-import", "case_id": "fr-comp"})
        assert r.status_code == 200
        body = r.json()
        assert "front_right" in body["residuals"]
        assert body["metrics"]["front_right"]["camber_deg"] != pytest.approx(-2.49)

    def test_solve_missing_design_404(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "nope", "case_id": "static"})
        assert r.status_code == 404
