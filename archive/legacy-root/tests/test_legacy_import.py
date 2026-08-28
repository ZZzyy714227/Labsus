"""legacy 导入与预置工况（设计文档 §11.2/§4.3）。"""
import pytest

from core.legacy_import import (
    LEGACY_DESIGN_ID,
    build_legacy_design_version,
    ensure_legacy_import,
    ensure_preset_cases,
)
from core.store import DataStore


@pytest.fixture
def store(tmp_path):
    return DataStore(root=tmp_path / "store")


class TestLegacyDesign:
    def test_version_captures_current_hardpoints(self):
        dv = build_legacy_design_version()
        from hardpoints import DEFAULT_HARDPOINTS
        assert dv.front_right.points["UP5"] == pytest.approx(DEFAULT_HARDPOINTS["UP5"])
        assert dv.front_left.points["UP5"][1] == pytest.approx(
            -DEFAULT_HARDPOINTS["UP5"][1])
        assert dv.vehicle["mass_kg"] == pytest.approx(280.0)

    def test_rear_stored_without_prefix(self):
        dv = build_legacy_design_version()
        assert "UP5" in dv.rear_right.points
        assert not any(k.startswith("R_") for k in dv.rear_right.points)

    def test_tire_scalars_split_from_points(self):
        dv = build_legacy_design_version()
        assert dv.front_right.tire["tire_radius"] > 0
        assert "track_width" not in dv.front_right.tire  # 轴级量归 vehicle

    def test_ensure_is_idempotent(self, store):
        id1 = ensure_legacy_import(store)
        id2 = ensure_legacy_import(store)
        assert id1 == id2 == LEGACY_DESIGN_ID
        assert store.get_design(LEGACY_DESIGN_ID).version == 1


class TestPresetCases:
    def test_seeds_all_preset_cases(self, store):
        ids = ensure_preset_cases(store)
        assert "static" in ids and "lat-1p3g" in ids and "bump-steer" in ids
        assert len(ids) >= 12

    def test_idempotent(self, store):
        ensure_preset_cases(store)
        ensure_preset_cases(store)
        assert store.get_case("static").version == 1

    def test_load_case_values(self, store):
        ensure_preset_cases(store)
        assert store.get_case("lat-1p3g").loads.ay_g == pytest.approx(1.3)
        assert store.get_case("brake-1p2g").loads.ax_g == pytest.approx(1.2)
        assert store.get_case("accel-1p0g").loads.ax_g == pytest.approx(1.0)
        assert store.get_case("pure-steer").rack_displacement == pytest.approx(10.0)
        roll_case = store.get_case("roll-diff")
        assert roll_case.travel.fl == pytest.approx(20.0)
        assert roll_case.travel.fr == pytest.approx(-20.0)
