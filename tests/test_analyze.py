"""Analyze endpoint integration test."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from fastapi.testclient import TestClient
from main import app
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS

client = TestClient(app)


def _hp(d):
    return {k: list(v) if isinstance(v, (list, tuple)) else v for k, v in d.items()}


def test_analyze_returns_all_dimensions():
    resp = client.post("/api/analyze", json={
        "front_hardpoints": _hp(DEFAULT_HARDPOINTS),
        "rear_hardpoints": _hp(DEFAULT_REAR_HARDPOINTS),
    })
    assert resp.status_code == 200
    data = resp.json()
    m = data["metrics"]
    for key in ["camber_delta_f", "bump_steer_f", "roll_gradient",
                "ride_freq_f", "ride_freq_r", "pushrod_force"]:
        assert key in m, key
    assert data["lights"], "lights list must be non-empty"
    assert all(light["light"] in ("green", "yellow", "red")
               for light in data["lights"])
    assert "curves" in data and "front" in data["curves"]


def test_analyze_with_vehicle_override():
    resp = client.post("/api/analyze", json={
        "front_hardpoints": _hp(DEFAULT_HARDPOINTS),
        "rear_hardpoints": _hp(DEFAULT_REAR_HARDPOINTS),
        "vehicle": {"mass_kg": 300.0},
    })
    assert resp.status_code == 200
    assert resp.json()["vehicle"]["mass_kg"] == 300.0


def test_targets_roundtrip():
    resp = client.post("/api/targets", json={"bands": {"bump_steer_f": [0, 1.5, 0, 3.0]}})
    assert resp.status_code == 200
    resp2 = client.get("/api/targets")
    assert resp2.json()["bands"]["bump_steer_f"][1] == 1.5
    # restore
    client.post("/api/targets", json={"bands": {}})


def test_vehicle_roundtrip():
    resp = client.get("/api/vehicle")
    assert resp.status_code == 200
    assert "mass_kg" in resp.json()["params"]
    resp2 = client.post("/api/vehicle", json={"params": {"mass_kg": 285.0}})
    assert resp2.status_code == 200
    resp3 = client.get("/api/vehicle")
    assert resp3.json()["params"]["mass_kg"] == 285.0
    client.post("/api/vehicle", json={"params": {"mass_kg": 280.0}})
