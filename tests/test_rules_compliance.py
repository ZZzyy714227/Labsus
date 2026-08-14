"""
Rules-compliance tests for the true-scale frame (2025 FSAE rules,
ref/chassis_rules.txt chapters 3.10–3.21).

Task 2: node-level checks. Task 3 adds tube-level checks.
"""
import math
import os
import sys

_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
if _src not in sys.path:
    sys.path.insert(0, _src)

import pytest

from config import DEFAULT_FRAME_NODES, DESIGN_PARAMS, FRAME_TUBES

N = DEFAULT_FRAME_NODES
FLOOR_Z = 40.0  # cockpit floor panel height (bodywork), audit report §5


def dist_xy(a, b):
    """Distance in the X-Z plane (side view)."""
    return math.hypot(N[a][0] - N[b][0], N[a][2] - N[b][2])


class TestTrueScaleDimensions:
    def test_wheelbase_1550(self):
        f = DESIGN_PARAMS["front"]["wheel_center_x"]
        r = DESIGN_PARAMS["rear"]["wheel_center_x"]
        assert abs((f - r) - 1550.0) < 1.0

    def test_track_true_scale(self):
        assert DESIGN_PARAMS["front"]["track"] == 1220.0
        assert DESIGN_PARAMS["rear"]["track"] == 1180.0

    def test_tire_true_scale(self):
        assert DESIGN_PARAMS["front"]["tire_radius"] == 260.0

    def test_all_nodes_are_3d_lists(self):
        for name, v in N.items():
            assert isinstance(v, list) and len(v) == 3, f"{name}: {v}"
            assert all(isinstance(c, (int, float)) for c in v), f"{name}: {v}"


class TestMainHoopRules:
    def test_inner_width_ge_380(self):
        """3.11.6: inside distance between chassis attachment points ≥380mm."""
        inner = 2 * abs(N["MH_LEG_R"][1])
        assert inner >= 380.0, f"main hoop inner width {inner}mm < 380"

    def test_top_height_clears_driver(self):
        """3.10.5 spirit: hoop top well above head (95th percentile ~950mm)."""
        assert N["MH_TOP_R"][2] >= 1100.0

    def test_brace_attach_within_160_of_top(self):
        """3.13.4: brace attach ≤160mm below main hoop top."""
        drop = N["MH_TOP_R"][2] - N["MH_BRACE_R"][2]
        assert 0 < drop <= 160.0, f"brace attach {drop}mm below top"

    def test_brace_angle_ge_30(self):
        """3.13.4: main hoop brace ≥30° from horizontal (side view)."""
        dx = N["MH_BRACE_END_R"][0] - N["MH_BRACE_R"][0]
        dz = N["MH_BRACE_R"][2] - N["MH_BRACE_END_R"][2]
        angle = math.degrees(math.atan2(dz, abs(dx)))
        assert angle >= 30.0, f"brace angle {angle:.1f}°"

    def test_brace_is_straight_same_y(self):
        """3.13.5: brace must be straight (Y constant here)."""
        assert N["MH_BRACE_R"][1] == N["MH_BRACE_END_R"][1]


class TestFrontHoopRules:
    def test_rake_within_20deg(self):
        """3.12.6: front hoop above SIS ≤20° from vertical."""
        dx = N["FH_TOP_R"][0] - N["FH_LEG_R"][0]
        dz = N["FH_TOP_R"][2] - N["FH_LEG_R"][2]
        rake = math.degrees(math.atan2(abs(dx), dz))
        assert rake <= 20.0, f"front hoop rake {rake:.1f}°"

    def test_brace_attach_within_160_of_top(self):
        """3.14.4: front hoop brace attach ≤160mm below front hoop top."""
        drop = N["FH_TOP_R"][2] - N["FH_BRACE_R"][2]
        assert 0 < drop <= 160.0, f"front brace attach {drop}mm below top"

    def test_steering_wheel_below_hoop_top(self):
        """3.12.4: steering wheel top below front hoop top (wheel top ≈700)."""
        assert N["FH_TOP_R"][2] > 700.0


class TestSideImpactZone:
    def test_upper_sis_in_240_320_zone(self):
        """Upper side-impact member 240–320mm above cockpit floor (3.19)."""
        for node in ["FH_UPPER_R", "MH_UPPER_R"]:
            h = N[node][2] - FLOOR_Z
            assert 240.0 <= h <= 320.0, f"{node}: {h:.0f}mm above floor"


class TestRockerMechanismNodes:
    def test_front_rocker_nodes_exist(self):
        for k in ["RK_PIVOT_R", "RK_DAMPER_R", "DAMPER_CHASSIS_FR"]:
            assert k in N, f"missing {k}"

    def test_rear_rocker_nodes_exist(self):
        for k in ["R_RK_PIVOT_R", "R_RK_DAMPER_R", "R_DAMPER_CHASSIS_RR"]:
            assert k in N, f"missing {k}"

    def test_rocker_arm_lengths_reasonable(self):
        """Rocker arms 40–100mm (mechanical sanity)."""
        d_arm = math.dist(N["RK_PIVOT_R"], N["RK_DAMPER_R"])
        assert 40.0 <= d_arm <= 100.0, f"front damper arm {d_arm:.0f}mm"
        d_arm_r = math.dist(N["R_RK_PIVOT_R"], N["R_RK_DAMPER_R"])
        assert 40.0 <= d_arm_r <= 100.0, f"rear damper arm {d_arm_r:.0f}mm"


class TestFrameTubes:
    """Tube-level rules checks (Task 3)."""

    @staticmethod
    def _allowed_endpoints():
        from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS
        allowed = set(N)
        for hp_dict in (DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS):
            for k, v in hp_dict.items():
                if isinstance(v, list) and len(v) == 3:
                    allowed.add(k)
                    allowed.add(k + "_L")
        return allowed

    def test_all_tube_endpoints_resolvable(self):
        allowed = self._allowed_endpoints()
        for i, tube in enumerate(FRAME_TUBES):
            for pt in tube:
                assert pt in allowed, f"tube {i} endpoint '{pt}' not resolvable"

    def test_sis_upper_connects_hoops(self):
        assert ["FH_UPPER_R", "MH_UPPER_R"] in FRAME_TUBES

    def test_sis_lower_connects_hoops(self):
        assert ["FH_LEG_R", "MH_LEG_R"] in FRAME_TUBES

    def test_sis_diagonal_present(self):
        assert ["FH_LEG_R", "MH_UPPER_R"] in FRAME_TUBES

    def test_main_hoop_continuous_curve(self):
        """3.11.3: main hoop as one continuous multi-point tube."""
        hoop = [t for t in FRAME_TUBES if len(t) >= 4 and "MH_TOP_R" in t]
        assert hoop, "no continuous main hoop curve"

    def test_front_hoop_continuous_curve(self):
        """3.12.2: front hoop as one continuous multi-point tube."""
        hoop = [t for t in FRAME_TUBES if len(t) >= 4 and "FH_TOP_R" in t]
        assert hoop, "no continuous front hoop curve"

    def test_main_hoop_brace_straight_member(self):
        assert ["MH_BRACE_R", "MH_BRACE_END_R"] in FRAME_TUBES

    def test_front_hoop_brace_present(self):
        assert ["FB_TOP_R", "FH_BRACE_R"] in FRAME_TUBES

    def test_suspension_mounts_attached_to_frame(self):
        """Every suspension chassis mount is part of ≥2 frame tubes."""
        two_pt = [set(t) for t in FRAME_TUBES if len(t) == 2]
        for mount in ["CH1", "CH2", "CH3", "CH4", "R_CH1", "R_CH2", "R_CH3", "R_CH4"]:
            n = sum(1 for t in two_pt if mount in t)
            assert n >= 2, f"{mount} attached by only {n} tubes"
