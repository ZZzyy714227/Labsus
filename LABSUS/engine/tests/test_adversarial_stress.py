"""Adversarial stress and compliance parameter verification test suite.

Author: Challenger M1_2 (teamwork_preview_challenger)
Mission:
1. Malformed JSON, invalid numbers, and boundary loads against FastAPI test client on
   /api/v3/kandc/{case}, /api/v3/chassis/{case}, /api/v3/tire/fit to verify HTTP 422 vs 500
   error classification and desensitization.
2. Verify solve_compliance_full contact patch moment behavior under varied tire_radius
   (e.g. 200mm, 325mm, 450mm).
"""
import math
import numpy as np
import pytest
from fastapi.testclient import TestClient

from server import app
from src.components.bushing import Bushing6DOF, Curve
from src.solver.compliance import solve_compliance_full
from src.solver.forces import QSLoad, corner_to_anchor_loads, LinkForce
from src.api import v3service
from src.api.v3models import KandcRequest, BushingSpec, SweepSpec
from tests.test_compliance_integration import _mech, PRO_POINTS
from tests.test_v3_chassis import FRONT, REAR, _req as _chassis_req_body

client = TestClient(app)


# ==============================================================================
# SECTION 1: Adversarial API Error Handling & Desensitization
# ==============================================================================

class TestApiMalformedJsonAndPathParams:
    """Verify HTTP 422 for malformed JSON and 404 for unknown endpoints."""

    @pytest.mark.parametrize("case", ["bump", "roll", "steer", "compliance"])
    def test_kandc_malformed_json_bytes_yields_422(self, case: str):
        """Raw non-JSON bytes must be caught by FastAPI as 422 Unprocessable Entity."""
        r = client.post(
            f"/api/v3/kandc/{case}",
            content=b"{bad_json: unquoted_val",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 422
        assert "traceback" not in r.text.lower()

    def test_kandc_unknown_case_yields_404(self):
        """Unknown case path parameter yields 404 Not Found."""
        r = client.post("/api/v3/kandc/nonexistent_case", json={})
        assert r.status_code == 404
        assert "unknown K&C case" in r.text

    @pytest.mark.parametrize("case", ["bump", "roll", "steer"])
    def test_chassis_kandc_malformed_json_yields_422(self, case: str):
        r = client.post(
            f"/api/v3/chassis/kandc/{case}",
            content=b"{{invalid: json",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 422
        assert "traceback" not in r.text.lower()

    def test_chassis_solve_malformed_json_yields_422(self):
        r = client.post(
            "/api/v3/chassis/solve",
            content=b"malformed string not json",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 422
        assert "traceback" not in r.text.lower()

    def test_tire_fit_malformed_json_yields_422(self):
        r = client.post(
            "/api/v3/tire/fit",
            content=b"[{'unclosed': json",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 422
        assert "traceback" not in r.text.lower()


class TestApiTypeAndNumericalStress:
    """Verify type validation, boundary checks, and range enforcement."""

    def test_kandc_invalid_field_types_yield_422(self):
        """Passing non-dictionary to sweep, non-numeric to tire_radius -> 422."""
        bad_payloads = [
            {"sweep": "not-a-dict"},
            {"tire_radius": "huge_radius"},
            {"points": "not-a-point-map"},
            {"bushings": "not-a-list"},
            {"bushings": [{"name": 123, "node": "LCA_F"}]},
        ]
        for payload in bad_payloads:
            r = client.post("/api/v3/kandc/bump", json=payload)
            assert r.status_code == 422

    def test_kandc_sweep_range_violations_yield_422(self):
        """SweepSpec validates min <= max and 3 <= n <= 201."""
        # min > max
        r = client.post("/api/v3/kandc/bump", json={"sweep": {"min": 50.0, "max": -50.0, "n": 21}})
        assert r.status_code == 422
        assert "min <= max" in r.text

        # n < 3
        r = client.post("/api/v3/kandc/bump", json={"sweep": {"min": -10.0, "max": 10.0, "n": 1}})
        assert r.status_code == 422

        # n > 201
        r = client.post("/api/v3/kandc/bump", json={"sweep": {"min": -10.0, "max": 10.0, "n": 300}})
        assert r.status_code == 422

    def test_kandc_hardpoint_schema_violations_yield_422(self):
        """Points with unknown keys or invalid coordinate lengths -> 422."""
        # Unknown hardpoint key
        r = client.post("/api/v3/kandc/bump", json={"points": {"NON_EXISTENT_KEY": [100.0, 100.0, 100.0]}})
        assert r.status_code == 422

        # Incomplete coordinate length (2 elements instead of 3)
        r = client.post("/api/v3/kandc/bump", json={"points": {"LCA_F": [100.0, 100.0]}})
        assert r.status_code == 422

    def test_chassis_solve_invalid_vehicle_fields_yield_422(self):
        """Missing or malformed vehicle spec yields 422."""
        # Missing vehicle entirely
        r = client.post("/api/v3/chassis/solve", json={})
        assert r.status_code == 422

        # Vehicle with non-numeric mass
        bad_req = _chassis_req_body()
        bad_req["vehicle"]["mass_kg"] = "one_thousand"
        r = client.post("/api/v3/chassis/solve", json=bad_req)
        assert r.status_code == 422

    def test_tire_fit_edge_cases_and_robustness(self):
        """Empty curves, invalid curve structures, and insufficient points."""
        # Missing curves field -> 422
        r = client.post("/api/v3/tire/fit", json={})
        assert r.status_code == 422

        # Empty curves list -> Pydantic validates min_length=1 -> 422
        r = client.post("/api/v3/tire/fit", json={"curves": []})
        assert r.status_code == 422
        assert "at least 1 item" in r.text or "too_short" in r.text

        # Curve with < 5 points -> Pydantic validates min_length=5 -> 422
        short_curve = [{"fz": 3000.0, "alpha_deg": [0.0, 1.0], "fy": [0.0, 100.0]}]
        r = client.post("/api/v3/tire/fit", json={"curves": short_curve})
        assert r.status_code == 422
        assert "at least 5 items" in r.text or "too_short" in r.text

        # Curve with >= 5 points but peak < 10 N -> passes schema, but NOT_APPLICABLE in solver
        flat_curve = [{"fz": 3000.0, "alpha_deg": [0.0, 1.0, 2.0, 3.0, 4.0], "fy": [1.0, 1.0, 1.0, 1.0, 1.0]}]
        r = client.post("/api/v3/tire/fit", json={"curves": flat_curve})
        assert r.status_code == 200
        assert r.json()["status"] == "NOT_APPLICABLE"

        # Curve with mismatched types -> 422
        r = client.post("/api/v3/tire/fit", json={"curves": [{"fz": "abc", "alpha_deg": [0.0], "fy": [0.0]}]})
        assert r.status_code == 422


class TestApiDesensitizationAndErrorClassification:
    """Verify 422 (client error) vs 500 (internal crash) and zero traceback leakage."""

    def test_unexpected_internal_crash_yields_500_with_desensitized_detail(self, monkeypatch):
        """Simulate an unexpected internal calculation crash (e.g. ZeroDivisionError).

        Must return HTTP 500.
        Detail MUST NOT reveal local paths, line numbers, or code snippets.
        """
        def _exploding_runner(req):
            raise ZeroDivisionError("division by zero in solver matrix inversion")

        monkeypatch.setattr(v3service, "run_bump", _exploding_runner)

        r = client.post("/api/v3/kandc/bump", json={})
        assert r.status_code == 500
        body = r.json()
        assert "detail" in body
        # Desensitized: reports error type without leaking internal traceback
        assert "internal server error (ZeroDivisionError)" in body["detail"]
        assert "solver matrix inversion" not in r.text
        assert ".py" not in r.text
        assert "line " not in r.text

    def test_service_value_error_yields_422_with_desensitized_detail(self, monkeypatch):
        """Simulate a geometry/solver ValueError.

        Must return HTTP 422.
        Detail must be categorized as input error without leaking stack frames.
        """
        def _failing_runner(req):
            raise ValueError("singular geometry configuration detected")

        monkeypatch.setattr(v3service, "run_steer", _failing_runner)

        r = client.post("/api/v3/kandc/steer", json={})
        assert r.status_code == 422
        body = r.json()
        assert "detail" in body
        assert "input error (ValueError)" in body["detail"]
        assert ".py" not in r.text
        assert "line " not in r.text


class TestApiBoundaryLoads:
    """Test solver stability under extreme and singular physical boundary conditions."""

    def test_compliance_extreme_forces(self):
        """Fire large forces (e.g. 10^7 N) into compliance endpoint.

        System should handle either by reporting non-converged/approximate status or 422,
        never crashing with unhandled 500.
        """
        b = BushingSpec(name="bLCA_F", node="LCA_F", kT=[500.0, 500.0, 500.0], kR=[8e4, 8e4, 8e4])
        payload = {
            "bushings": [b.model_dump()],
            "compliance_axis": "fy",
            "sweep": {"min": -1e6, "max": 1e6, "n": 5},
            "case": {"fx": 0.0, "fy": 1e7, "fz": 1e7},
        }
        r = client.post("/api/v3/kandc/compliance", json=payload)
        # Should return valid JSON response (status code 200 with COMPLIANCE_DIVERGED/APPROXIMATE or 422)
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert data["status"] in ("VALID", "APPROXIMATE", "COMPLIANCE_DIVERGED", "SOLVER_FAILED")

    def test_chassis_extreme_lateral_acceleration(self):
        """Fire 50g lateral acceleration into chassis solve.

        Chassis quasi solver should calculate load transfer and return 200 without crashing.
        """
        req = _chassis_req_body()
        req["quasi"]["gy"] = 50.0  # extreme 50g
        r = client.post("/api/v3/chassis/solve", json=req)
        assert r.status_code == 200
        b = r.json()
        assert "pose" in b
        assert set(b["pose"]) == {"FL", "FR", "RL", "RR"}
        assert "loads" in b


# ==============================================================================
# SECTION 2: Compliance Contact Patch Moment & Tire Radius Verification
# ==============================================================================

class TestComplianceContactPatchMomentPhysics:
    """Verify solve_compliance_full and corner_to_anchor_loads moment physics."""

    def test_corner_to_anchor_loads_moment_linear_scaling_with_tire_radius(self):
        """Theory: r = [0, 0, -R_tire].

        For ground lateral load Fy:
          m_hub = r x [0, Fy, 0] = [R_tire * Fy, 0, 0]
          ||m_hub|| = R_tire * |Fy|

        For longitudinal load Fx:
          m_hub = r x [Fx, 0, 0] = [0, -R_tire * Fx, 0]
          ||m_hub|| = R_tire * |Fx|
        """
        hub = np.array([800.0, 0.0, 320.0])
        # Define links
        lca1 = LinkForce(a=np.array([240.0, 180.0, 145.0]), b=hub.copy(), id="LCA1")
        lca2 = LinkForce(a=np.array([240.0, -160.0, 155.0]), b=hub.copy(), id="LCA2")
        uca1 = LinkForce(a=np.array([360.0, 140.0, 380.0]), b=hub.copy(), id="UCA1")
        uca2 = LinkForce(a=np.array([360.0, -130.0, 390.0]), b=hub.copy(), id="UCA2")
        push = LinkForce(a=np.array([324.4, 57.9, 445.6]), b=hub.copy(), id="PUSH")
        links = [lca1, lca2, uca1, uca2, push]

        # 1. Pure lateral force Fy = 1500 N
        fy_val = 1500.0
        q_lat = QSLoad(fx=0.0, fy=fy_val, fz=0.0)

        for R in [200.0, 325.0, 450.0]:
            cp_rel = np.array([0.0, 0.0, -R])
            res = corner_to_anchor_loads(q_lat, links, hub_point=hub, cp_rel=cp_rel)
            expected_moment = R * fy_val
            assert math.isclose(res.moment_residual, expected_moment, rel_tol=1e-9), (
                f"For R={R}, expected moment={expected_moment}, got {res.moment_residual}"
            )

        # 2. Pure longitudinal force Fx = 2200 N
        fx_val = 2200.0
        q_long = QSLoad(fx=fx_val, fy=0.0, fz=0.0)
        for R in [200.0, 325.0, 450.0]:
            cp_rel = np.array([0.0, 0.0, -R])
            res = corner_to_anchor_loads(q_long, links, hub_point=hub, cp_rel=cp_rel)
            expected_moment = R * fx_val
            assert math.isclose(res.moment_residual, expected_moment, rel_tol=1e-9)

        # 3. Combined load Fx = 1200 N, Fy = 1600 N
        q_comb = QSLoad(fx=1200.0, fy=1600.0, fz=0.0)
        # ||m_hub|| = R * sqrt(Fx^2 + Fy^2) = R * 2000
        for R in [200.0, 325.0, 450.0]:
            cp_rel = np.array([0.0, 0.0, -R])
            res = corner_to_anchor_loads(q_comb, links, hub_point=hub, cp_rel=cp_rel)
            expected_moment = R * 2000.0
            assert math.isclose(res.moment_residual, expected_moment, rel_tol=1e-9)

    def test_solve_compliance_full_status_and_moment_under_varied_radii(self):
        """Verify solve_compliance_full across R=200, 325, 450 mm.

        With lateral load Fy=1000 N, overturning moment is non-zero,
        so solver correctly classifies status as APPROXIMATE per F-64.
        """
        bush = Bushing6DOF(
            name="bCH1",
            anchor=PRO_POINTS["CH1"].copy(),
            kT=[Curve("linear", k=500.0)] * 3,
            kR=[Curve("linear", k=8e4)] * 3,
            cT=[0.0] * 3,
            cR=[0.0] * 3,
            preload=np.zeros(6),
        )
        bush.member_nodes = ["CH1"]
        bush.member_p0 = {"CH1": PRO_POINTS["CH1"].copy()}
        bushings = {"bCH1": bush}

        radii = [200.0, 325.0, 450.0]
        results = {}
        for R in radii:
            m = _mech()
            case = QSLoad(fx=0.0, fy=1000.0, fz=3000.0)
            res = solve_compliance_full(m, bushings=bushings, case=case,
                                        travel=0.0, rack=0.0, tire_radius=R)
            results[R] = res
            # Due to contact patch moment (1000N * R != 0), ball-joint model has unclosed moment residual
            # -> Status MUST be APPROXIMATE
            assert res.status == "APPROXIMATE", f"Expected APPROXIMATE for R={R}, got {res.status}"
            assert res.delta["bCH1"] is not None
            assert len(res.delta["bCH1"]) == 6

    def test_pose_metrics_geometry_scales_with_tire_radius(self):
        """Verify pose_metrics ground intersection metrics (scrub radius, trail) scale with tire_R."""
        m = _mech()
        from src.api.v3models import DesignSpec
        d = DesignSpec(camber_deg=-1.2, toe_deg=0.05)

        m_200 = v3service.pose_metrics(m, 200.0, d)
        m_325 = v3service.pose_metrics(m, 325.0, d)
        m_450 = v3service.pose_metrics(m, 450.0, d)

        # As tire radius increases, contact patch z is lower -> KPI intersection moves further
        # -> scrub radius and trail must shift monotonically
        assert m_200["scrub"] != m_325["scrub"]
        assert m_325["scrub"] != m_450["scrub"]
        assert (m_450["scrub"] - m_325["scrub"]) * (m_325["scrub"] - m_200["scrub"]) > 0

        assert m_200["trail"] != m_325["trail"]
        assert m_325["trail"] != m_450["trail"]
        assert (m_450["trail"] - m_325["trail"]) * (m_325["trail"] - m_200["trail"]) > 0

    def test_kandc_compliance_endpoint_with_varied_radii(self):
        """End-to-end verification of /api/v3/kandc/compliance under R=200, 325, 450mm."""
        b = BushingSpec(name="bLCA_F", node="LCA_F", kT=[500.0, 500.0, 500.0], kR=[8e4, 8e4, 8e4])
        for R in [200.0, 325.0, 450.0]:
            payload = {
                "tire_radius": R,
                "compliance_axis": "fy",
                "sweep": {"min": -500.0, "max": 500.0, "n": 5},
                "bushings": [b.model_dump()],
            }
            r = client.post("/api/v3/kandc/compliance", json=payload)
            assert r.status_code == 200
            data = r.json()
            assert data["status"] in ("VALID", "APPROXIMATE")
            assert len(data["curves"]["force"]) == 5
            assert len(data["curves"]["toe"]) == 5

    def test_kandc_compliance_singular_zero_stiffness_divergence(self):
        """Singular zero stiffness kT=[0,0,0] degrades to COMPLIANCE_DIVERGED, no 500 crash."""
        b = BushingSpec(name="bLCA_F", node="LCA_F", kT=[0.0, 0.0, 0.0], kR=[0.0, 0.0, 0.0])
        payload = {
            "sweep": {"min": -10.0, "max": 10.0, "n": 5},
            "case": {"fz": 3000.0},
            "bushings": [b.model_dump()],
        }
        r = client.post("/api/v3/kandc/bump", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "COMPLIANCE_DIVERGED"

