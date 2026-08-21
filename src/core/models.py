"""V1 核心数据模型（设计文档 §3/§4/§10/§11）。

- ChassisDesign：整车底盘方案，append-only 版本列表；左右硬点为独立实例，
  左侧可由右侧模板镜像初始化（§5.1），之后独立编辑。
- AnalysisCase：工况。四轮轮跳 + 齿条位移是唯一几何驱动量；
  heave/roll/pitch 仅为派生标签（§4.1）。
- AnalysisResult：不可变结果，绑定方案版本 + 工况版本 + 求解器（§3.1）。
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator

from core.convention import DEFAULT_CONVENTION, CoordinateConvention

POINT_KEYS = frozenset({"CH1", "CH2", "CH3", "CH4", "CH5",
                        "UP1", "UP2", "UP3", "UP4", "UP5", "FL1"})
# PRO 拓扑新键：STRUT_OUT（推/拉杆外端，随 LCA/UCA 铰链）、
# RCK_AX_A/B（摇臂转轴两点）。为兼容存量数据允许缺省（validator 只查 bad 不查 missing）。
PRO_POINT_KEYS = frozenset({"STRUT_OUT", "RCK_AX_A", "RCK_AX_B"})
ALL_POINT_KEYS = POINT_KEYS | PRO_POINT_KEYS

TIRE_KEYS = ("tire_radius", "tire_width", "tire_spring_rate", "corner_weight_n")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ResultStatus(str, Enum):
    """结果可信度状态（设计文档 §10）。"""
    VALID = "VALID"
    APPROXIMATE = "APPROXIMATE"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    SOLVER_FAILED = "SOLVER_FAILED"
    EQUILIBRIUM_FAILED = "EQUILIBRIUM_FAILED"
    OUT_OF_RANGE = "OUT_OF_RANGE"


class AxleHardpoints(BaseModel):
    """单轴单侧硬点实例。points 键必须属于 POINT_KEYS ∪ PRO_POINT_KEYS
    （无前缀，轴由字段名区分；PRO 新键可缺省以兼容存量数据）。"""
    points: dict[str, list[float]]
    tire: dict[str, float] = Field(default_factory=dict)

    @field_validator("points")
    @classmethod
    def _check_keys(cls, v):
        bad = set(v) - ALL_POINT_KEYS
        missing = POINT_KEYS - set(v)
        if bad or missing:
            raise ValueError(
                f"invalid point keys: bad={sorted(bad)} missing={sorted(missing)}")
        return v

    def mirrored(self) -> AxleHardpoints:
        """镜像生成对侧实例（§5.1：仅用于模板初始化）。"""
        return AxleHardpoints(
            points={k: [p[0], -p[1], p[2]] for k, p in self.points.items()},
            tire=dict(self.tire))

    def flat(self) -> dict:
        """还原为旧求解器使用的扁平 hp dict（点 + 轮胎标量）。"""
        out: dict = {k: list(p) for k, p in self.points.items()}
        out.update(self.tire)
        return out


class DesignVersion(BaseModel):
    version: int
    name: str = ""
    notes: str = ""
    created_at: str = Field(default_factory=_now_iso)
    convention: CoordinateConvention = Field(default_factory=lambda: DEFAULT_CONVENTION)
    front_right: AxleHardpoints
    front_left: AxleHardpoints
    rear_right: AxleHardpoints
    rear_left: AxleHardpoints
    vehicle: dict[str, float] = Field(default_factory=dict)

    @staticmethod
    def from_right_template(*, version: int, front_right: AxleHardpoints,
                            rear_right: AxleHardpoints, vehicle: dict[str, float],
                            name: str = "", notes: str = "") -> DesignVersion:
        """从右侧模板镜像初始化左侧实例（§5.1：镜像仅用于初始化）。"""
        return DesignVersion(
            version=version, name=name, notes=notes,
            front_right=front_right, front_left=front_right.mirrored(),
            rear_right=rear_right, rear_left=rear_right.mirrored(),
            vehicle=vehicle)


class ChassisDesign(BaseModel):
    design_id: str
    versions: list[DesignVersion]
    latest: int


class WheelTravel(BaseModel):
    """四轮轮跳输入（mm，正 = 车轮向上压缩）。V1 唯一几何驱动量。"""
    fl: float = 0.0
    fr: float = 0.0
    rl: float = 0.0
    rr: float = 0.0


class LoadsInput(BaseModel):
    """外部载荷输入（单位 g）。az 为相对设计基准的额外垂向加速度，
    重力基准已含于静态垂向载荷，不重复叠加（§8.1）。"""
    ax_g: float = 0.0
    ay_g: float = 0.0
    az_g: float = 0.0
    brake_split_front: float = 0.5
    drive_split_rear: float = 1.0


class CaseOptions(BaseModel):
    arb_enabled: bool = True
    compute_wheel_forces: bool = True
    friction_check: bool = True


class CaseVersion(BaseModel):
    version: int
    name: str = ""
    description: str = ""
    travel: WheelTravel = Field(default_factory=WheelTravel)
    rack_displacement: float = 0.0
    loads: LoadsInput = Field(default_factory=LoadsInput)
    options: CaseOptions = Field(default_factory=CaseOptions)

    def derived_pose(self, front_track_mm: float, rear_track_mm: float,
                     wheelbase_mm: float) -> dict[str, float]:
        """由四轮轮跳反推的姿态标签（§4.1：不作为独立输入）。
        roll_deg 正 = 车身向右倾（左侧悬架伸长）；
        pitch_deg 正 = 车头下沉（前悬架压缩）。"""
        t = self.travel
        heave = (t.fl + t.fr + t.rl + t.rr) / 4.0
        track_avg = (front_track_mm + rear_track_mm) / 2.0
        roll_deg = math.degrees(
            math.atan2(((t.fl + t.rl) - (t.fr + t.rr)) / 2.0, track_avg))
        pitch_deg = math.degrees(
            math.atan2(((t.fl + t.fr) - (t.rl + t.rr)) / 2.0, wheelbase_mm))
        return {"heave_mm": round(heave, 4), "roll_deg": round(roll_deg, 4),
                "pitch_deg": round(pitch_deg, 4)}


class AnalysisCase(BaseModel):
    case_id: str
    versions: list[CaseVersion]
    latest: int


class AnalysisResult(BaseModel):
    """不可变分析结果。绑定方案版本 + 工况版本 + 求解器状态（§3.1）。"""
    result_id: str
    design_id: str
    design_version: int
    case_id: str
    case_version: int
    solver: str
    status: ResultStatus
    created_at: str = Field(default_factory=_now_iso)
    residuals: dict[str, float] = Field(default_factory=dict)
    metrics: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
