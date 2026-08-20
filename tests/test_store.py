"""DataStore 测试：版本化 CRUD、原子写、幂等读取（tmp_path 隔离）。"""
import pytest

from core.models import AnalysisResult, AxleHardpoints, CaseVersion, DesignVersion, ResultStatus
from core.store import DataStore


def _axle():
    pts = {"CH1": [0, 400, 350], "CH2": [100, 400, 350], "CH3": [0, 380, 100],
           "CH4": [100, 380, 100], "CH5": [10, 150, 300], "FL1": [60, 300, 250],
           "UP1": [0, 500, 400], "UP2": [0, 500, 100], "UP3": [50, 500, 250],
           "UP4": [0, 500, 150], "UP5": [0, 610, 250]}
    return AxleHardpoints(points=pts, tire={"tire_radius": 260.0})


def _dv(name="v"):
    return DesignVersion.from_right_template(
        version=0, front_right=_axle(), rear_right=_axle(), vehicle={}, name=name)


@pytest.fixture
def store(tmp_path):
    return DataStore(root=tmp_path / "store")


class TestDesigns:
    def test_create_assigns_version_1(self, store):
        doc = store.create_design(_dv(), design_id="d1")
        assert doc.design_id == "d1"
        assert doc.latest == 1
        assert doc.versions[0].version == 1

    def test_create_duplicate_id_rejected(self, store):
        store.create_design(_dv(), design_id="d1")
        with pytest.raises(ValueError):
            store.create_design(_dv(), design_id="d1")

    def test_add_version_increments(self, store):
        store.create_design(_dv("a"), design_id="d1")
        v2 = store.add_design_version("d1", _dv("b"))
        assert v2.version == 2
        assert store.get_design("d1").name == "b"          # 默认取 latest
        assert store.get_design("d1", version=1).name == "a"

    def test_get_missing_raises(self, store):
        with pytest.raises(KeyError):
            store.get_design("nope")
        store.create_design(_dv(), design_id="d1")
        with pytest.raises(KeyError):
            store.get_design("d1", version=9)

    def test_list_designs_summary(self, store):
        store.create_design(_dv("a"), design_id="d1")
        summary = store.list_designs()
        assert summary == [{"design_id": "d1", "latest": 1, "name": "a"}]

    def test_persists_across_instances(self, tmp_path):
        s1 = DataStore(root=tmp_path / "store")
        s1.create_design(_dv("a"), design_id="d1")
        s2 = DataStore(root=tmp_path / "store")
        assert s2.get_design("d1").name == "a"


class TestCases:
    def test_case_crud(self, store):
        cv = CaseVersion(version=0, name="static")
        doc = store.create_case(cv, case_id="static")
        assert doc.latest == 1
        assert store.get_case("static").name == "static"
        assert store.list_cases() == [
            {"case_id": "static", "latest": 1, "name": "static"}]

    def test_case_duplicate_rejected(self, store):
        store.create_case(CaseVersion(version=0), case_id="c1")
        with pytest.raises(ValueError):
            store.create_case(CaseVersion(version=0), case_id="c1")


class TestResults:
    def test_save_and_filter(self, store):
        r = AnalysisResult(result_id="r1", design_id="d1", design_version=1,
                           case_id="static", case_version=1,
                           solver="s", status=ResultStatus.VALID)
        store.save_result(r)
        assert store.list_results(design_id="d1")[0]["result_id"] == "r1"
        assert store.list_results(design_id="other") == []

    def test_save_duplicate_rejected(self, store):
        r = AnalysisResult(result_id="r1", design_id="d1", design_version=1,
                           case_id="c", case_version=1, solver="s",
                           status=ResultStatus.VALID)
        store.save_result(r)
        with pytest.raises(ValueError):
            store.save_result(r)
