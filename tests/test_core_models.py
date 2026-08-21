"""核心 schema 测试：版本结构、姿态派生标签、结果状态枚举。"""
import pytest
from pydantic import ValidationError

from core.models import (
    AnalysisResult,
    AxleHardpoints,
    CaseVersion,
    ChassisDesign,
    DesignVersion,
    ResultStatus,
    WheelTravel,
)


def _axle(y=610.0):
    return AxleHardpoints(
        points={
            "CH1": [0, 400, 350], "CH2": [100, 400, 350],
            "CH3": [0, 380, 100], "CH4": [100, 380, 100],
            "CH5": [10, 150, 300], "FL1": [60, 300, 250],
            "UP1": [0, 500, 400], "UP2": [0, 500, 100],
            "UP3": [50, 500, 250], "UP4": [0, 500, 150],
            "UP5": [0, y, 250],
        },
        tire={"tire_radius": 260.0, "tire_width": 205.0,
              "tire_spring_rate": 150.0, "corner_weight_n": 700.0},
    )


class TestDesignVersion:
    def test_from_right_template_mirrors_left(self):
        dv = DesignVersion.from_right_template(
            version=1, front_right=_axle(), rear_right=_axle(y=590.0),
            vehicle={"mass_kg": 280.0}, name="t")
        assert dv.front_left.points["UP5"][1] == pytest.approx(-610.0)
        assert dv.rear_left.points["UP5"][1] == pytest.approx(-590.0)
        # 镜像只初始化：此后左右是独立实体（字段独立可改）
        dv.front_left.points["UP5"][1] = -600.0
        assert dv.front_right.points["UP5"][1] == pytest.approx(610.0)

    def test_convention_embedded(self):
        dv = DesignVersion.from_right_template(
            version=1, front_right=_axle(), rear_right=_axle(), vehicle={})
        assert dv.convention.y_axis == "right"

    def test_point_keys_validated(self):
        with pytest.raises(ValidationError):
            AxleHardpoints(points={"BAD_KEY": [0, 0, 0]})

    def test_flat_round_trip_for_solver(self):
        hp = _axle().flat()
        assert hp["UP5"] == pytest.approx([0, 610.0, 250])
        assert hp["tire_radius"] == pytest.approx(260.0)


class TestCaseVersion:
    def test_derived_pose_labels(self):
        cv = CaseVersion(version=1, travel=WheelTravel(fl=20, fr=-20, rl=20, rr=-20))
        pose = cv.derived_pose(front_track_mm=1220, rear_track_mm=1180, wheelbase_mm=1550)
        assert pose["heave_mm"] == pytest.approx(0.0)
        assert pose["roll_deg"] > 0          # 左侧抬起 → 车身右倾为正
        assert pose["pitch_deg"] == pytest.approx(0.0)

    def test_heave_label(self):
        cv = CaseVersion(version=1, travel=WheelTravel(fl=20, fr=20, rl=20, rr=20))
        pose = cv.derived_pose(1220, 1180, 1550)
        assert pose["heave_mm"] == pytest.approx(20.0)
        assert pose["roll_deg"] == pytest.approx(0.0)
        assert pose["pitch_deg"] == pytest.approx(0.0)


class TestAnalysisResult:
    def test_binds_design_case_and_solver(self):
        r = AnalysisResult(
            result_id="r1", design_id="d1", design_version=2,
            case_id="c1", case_version=1,
            solver="sequential-bump-steer-v1", status=ResultStatus.APPROXIMATE)
        assert r.design_version == 2
        assert r.status == "APPROXIMATE"

    def test_all_statuses_defined(self):
        names = {s.value for s in ResultStatus}
        assert names == {"VALID", "APPROXIMATE", "NOT_APPLICABLE", "NOT_IMPLEMENTED",
                         "SOLVER_FAILED", "EQUILIBRIUM_FAILED", "OUT_OF_RANGE"}


class TestContainerDocs:
    def test_design_latest_tracks_versions(self):
        d = ChassisDesign(design_id="x", versions=[], latest=0)
        assert d.latest == 0


def test_new_pro_keys_optional_but_valid():
    from core.models import AxleHardpoints
    base = {k: [0.0, 100.0, 200.0] for k in
            ("CH1","CH2","CH3","CH4","CH5","UP1","UP2","UP3","UP4","UP5","FL1")}
    hp = AxleHardpoints(points=base)          # 旧 11 键仍合法（新键可缺省）
    hp2 = AxleHardpoints(points={**base,
        "STRUT_OUT": [0.0, 500.0, 150.0],
        "RCK_AX_A": [0.0, 120.0, 300.0],
        "RCK_AX_B": [0.0, 80.0, 300.0]})
    assert "STRUT_OUT" in hp2.points
    assert hp2.points["RCK_AX_A"] == [0.0, 120.0, 300.0]
    # 部分新键缺省仍合法（RCK_AX_A/B 可不提供）
    hp3 = AxleHardpoints(points={**base, "STRUT_OUT": [0.0, 500.0, 150.0]})
    assert "RCK_AX_A" not in hp3.points
    # 拼错新键被拒
    with pytest.raises(ValidationError):
        AxleHardpoints(points={**base, "STRUT_OUTT": [0.0, 500.0, 150.0]})
    # 缺核心键被拒
    with pytest.raises(ValidationError):
        AxleHardpoints(points={k: v for k, v in base.items() if k != "CH1"})
