"""P5 深化测试：联合滑移 / 标定 / ARB 几何 / kingpin / yaw / 调平闭环。"""
import math

import pytest

from metrics.arb_geometry import arb_geometry_from_vehicle, arb_geometry_stiffness
from metrics.handling import yaw_analysis, yaw_gain_curve
from metrics.steering_metrics import align_moment_summary, kingpin_moment
from metrics.tire_model import fit_magic_formula, tire_combined_force

V = {"mass_kg": 280.0, "front_axle_frac": 0.5, "rear_axle_frac": 0.5,
     "cg_height_mm": 300.0, "wheelbase_mm": 1550.0,
     "front_track_mm": 1220.0, "rear_track_mm": 1180.0}


class TestCombinedSlip:
    def test_pure_lateral(self):
        c = tire_combined_force(V, 3.0, 1000.0, 0.0, 0.0)
        assert c["fx_n"] == 0.0

    def test_brake_takes_slip_capacity(self):
        free = tire_combined_force(V, 3.0, 1000.0, 0.0, 0.0)
        braked = tire_combined_force(V, 3.0, 1000.0, 0.0, kappa=0.12)
        assert braked["fy_n"] < free["fy_n"] or braked["saturated"]
        assert braked["fx_n"] > 0.0

    def test_ellipse_bounds(self):
        c = tire_combined_force(V, 8.0, 1000.0, 0.0, 0.12)
        ell = math.sqrt((c["fx_n"] / (1.5 * 1000.0)) ** 2
                        + (c["fy_n"] / (1.4 * 1000.0)) ** 2)
        assert ell <= 1.0 + 1e-6


class TestCalibration:
    def test_fit_recovers_params(self):
        samples = []
        for fz in (700.0, 1000.0, 1300.0):
            for alpha in (-8, -4, -1, 0, 1, 4, 8):
                c = tire_combined_force(V, float(alpha), fz, 0.0, 0.0)
                samples.append({"fz_n": fz, "alpha_deg": float(alpha),
                                "fy_n": c["fy_n"]})
        fit = fit_magic_formula(samples)
        assert fit["status"] == "VALID"
        assert abs(fit["params"]["tire_calpha"] - 350.0) < 120.0
        assert abs(fit["params"]["tire_mu_peak_y"] - 1.4) < 0.4
        assert fit["r2"] > 0.98

    def test_too_few_samples(self):
        assert fit_magic_formula([{"fz_n": 1, "alpha_deg": 0, "fy_n": 0}])["status"] == "SOLVER_FAILED"


class TestArbGeometry:
    def test_stiffness_formula(self):
        d, L, arm, track, G = 16.0, 550.0, 140.0, 1220.0, 79000.0
        j = math.pi * d ** 4 / 32.0
        expect = (G * j / L) * (track / 2.0 / arm) ** 2
        assert arb_geometry_stiffness(d, L, arm, track, G) == pytest.approx(expect, rel=1e-9)

    def test_vehicle_prefers_geometry(self):
        veh = {"front_track_mm": 1220.0, "k_arb_f": 9.99e6,
               "arb_f_bar_d_mm": 16.0, "arb_f_bar_length_mm": 550.0, "arb_f_arm_mm": 140.0}
        assert arb_geometry_from_vehicle(veh, True) != 9.99e6
        assert arb_geometry_from_vehicle({"front_track_mm": 1220.0, "k_arb_f": 5.0}, True) == 5.0


class TestKingpin:
    def test_self_centering_sign(self):
        m = kingpin_moment(trail_mm=22.4, scrub_mm=29.9, fy_n=1200.0, fx_n=0.0, fz_n=800.0)
        assert m["total_moment_nmm"] == pytest.approx(-22.4 * 1200.0, abs=1e-6)
        assert m["self_centering"] is True

    def test_scrub_brake_term(self):
        m = kingpin_moment(22.4, 29.9, 0.0, -1200.0, 800.0)
        assert m["scrub_moment_nmm"] == pytest.approx(-35880.0, abs=1e-6)

    def test_alignment_summary_aggregates(self):
        s = align_moment_summary(22.4, 29.9, 1000.0, 1000.0, 0.0, 0.0, 700.0, 700.0)
        assert s["total_nmm"] == pytest.approx(2 * (-22.4 * 1000.0), abs=1e-6)
        assert s["self_centering"]


class TestYawDynamics:
    def test_neutral_yaw_gain_v_over_l(self):
        a = yaw_analysis(V, 350.0, 350.0, 15.0)
        assert a["status"] == "VALID"
        assert a["yaw_rate_gain_1_over_s"] == pytest.approx(15.0 / 1.55, rel=1e-3)
        assert a["stable"] is True and a["damping_zeta"] > 0.8

    def test_gain_curve_linear_neutral(self):
        g = yaw_gain_curve(V, 350.0, 350.0, v_max_m_s=30.0, points=7)
        for v, gv in zip(g["v_m_s"], g["yaw_rate_gain_1_over_s"]):
            if gv is not None and v > 0:
                assert gv == pytest.approx(v / 1.55, rel=1e-2)

    def test_bad_input(self):
        assert yaw_analysis({"mass_kg": 0.0}, 350.0, 350.0, 10.0)["status"] == "SOLVER_FAILED"
