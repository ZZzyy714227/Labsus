"""旧数据导入与预置工况（设计文档 §11.2 / §4.3）。

- 启动时把 DEFAULT_HARDPOINTS / DEFAULT_REAR_HARDPOINTS / VEHICLE_PARAMS
  当前状态导入为 `legacy-import` 方案（幂等）。
- 预置 §4.3 工况集（幂等）。
"""
from __future__ import annotations

from config import REAR_PREFIX, VEHICLE_PARAMS
from core.models import AxleHardpoints, CaseVersion, DesignVersion, LoadsInput, WheelTravel
from core.store import DataStore
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix

LEGACY_DESIGN_ID = "legacy-import"

_TIRE_KEYS = ("tire_radius", "tire_width", "tire_spring_rate", "corner_weight_n")


def _split_hp(hp: dict) -> AxleHardpoints:
    """把旧扁平 hp dict 拆成 点集 + 轮胎标量。track_width 等轴级量不进入 tire。"""
    points = {k: list(v) for k, v in hp.items()
              if isinstance(v, list) and len(v) == 3}
    tire = {k: float(v) for k, v in hp.items() if k in _TIRE_KEYS}
    return AxleHardpoints(points=points, tire=tire)


def build_legacy_design_version() -> DesignVersion:
    front = _split_hp(DEFAULT_HARDPOINTS)
    rear = _split_hp(strip_prefix(DEFAULT_REAR_HARDPOINTS, REAR_PREFIX))
    return DesignVersion.from_right_template(
        version=0, front_right=front, rear_right=rear,
        vehicle={k: float(v) for k, v in VEHICLE_PARAMS.items()},
        name="Legacy import",
        notes="启动时从 DESIGN_PARAMS/DEFAULT_HARDPOINTS/VEHICLE_PARAMS 导入")


def ensure_legacy_import(store: DataStore) -> str:
    """幂等：已存在则直接返回 id。"""
    if any(d["design_id"] == LEGACY_DESIGN_ID for d in store.list_designs()):
        return LEGACY_DESIGN_ID
    store.create_design(build_legacy_design_version(), design_id=LEGACY_DESIGN_ID)
    return LEGACY_DESIGN_ID


def _cv(name: str, description: str = "", **kw) -> CaseVersion:
    return CaseVersion(version=0, name=name, description=description, **kw)


_PRESETS: list[tuple[str, CaseVersion]] = [
    ("static", _cv("静态设计位置", "全零几何输入，无外部载荷")),
    ("fl-comp", _cv("前左单轮压缩", travel=WheelTravel(fl=20.0))),
    ("fr-comp", _cv("前右单轮压缩", travel=WheelTravel(fr=20.0))),
    ("rl-comp", _cv("后左单轮压缩", travel=WheelTravel(rl=20.0))),
    ("rr-comp", _cv("后右单轮压缩", travel=WheelTravel(rr=20.0))),
    ("front-twin", _cv("前轴双轮同向跳", travel=WheelTravel(fl=20.0, fr=20.0))),
    ("rear-twin", _cv("后轴双轮同向跳", travel=WheelTravel(rl=20.0, rr=20.0))),
    ("heave-4w", _cv("四轮 heave",
                     travel=WheelTravel(fl=20.0, fr=20.0, rl=20.0, rr=20.0))),
    ("roll-diff", _cv("四轮左右差动轮跳",
                      travel=WheelTravel(fl=20.0, fr=-20.0, rl=20.0, rr=-20.0))),
    ("pure-steer", _cv("纯转向", rack_displacement=10.0)),
    ("bump-steer", _cv("轮跳+转向", travel=WheelTravel(fl=20.0, fr=20.0),
                       rack_displacement=10.0)),
    ("lat-1p3g", _cv("1.3g 纯侧向", loads=LoadsInput(ay_g=1.3))),
    ("brake-1p2g", _cv("1.2g 纯制动", loads=LoadsInput(ax_g=1.2))),
    ("accel-1p0g", _cv("1.0g 纯加速", loads=LoadsInput(ax_g=1.0))),
]


def ensure_preset_cases(store: DataStore) -> list[str]:
    """幂等：按 case_id 去重，已存在的工况不覆盖。"""
    existing = {c["case_id"] for c in store.list_cases()}
    for case_id, cv in _PRESETS:
        if case_id not in existing:
            store.create_case(cv, case_id=case_id)
    return [case_id for case_id, _ in _PRESETS]
