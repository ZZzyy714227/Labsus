"""P2-1 统一四轮结果结构（设计文档 §P2、进展文档 P2-1）。

VehicleResult
├── front { left, right }         每轮：角度指标 + 残差 + 状态
├── rear  { left, right }
├── per_wheel_geometry            每轮：姿态 / 接地点 / 主销轴 / 球头 / 轨迹
├── residuals                     四轮几何残差（mm）
├── solver_status                 四轮结果状态（ResultStatus 七状态）
├── pose_labels                   整车姿态标签（heave/roll/pitch）
└── warnings                      警告列表

状态机（P2-3 前置）：
- VALID         残差 ≤ 0.02 mm（设计文档 §13.2）
- APPROXIMATE   0.02 < 残差 ≤ 0.5 mm（警告区间）
- OUT_OF_RANGE  残差 > 0.5 mm（几何不可信，行程可疑）
- SOLVER_FAILED 求解异常（逐轮隔离，不使整个请求失败）
整车状态 = 四轮最差状态（SOLVER_FAILED > OUT_OF_RANGE > APPROXIMATE > VALID）。
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from core.models import ResultStatus


class WheelAngles(BaseModel):
    """单轮定位角（P2-0 车辆全局符号约定，两侧同号）。"""
    camber_deg: float | None = None
    toe_deg: float | None = None
    caster_deg: float | None = None
    kpi_deg: float | None = None
    scrub_radius_mm: float | None = None
    caster_trail_mm: float | None = None


class ContactPatch(BaseModel):
    center: list[float]
    loaded_radius: float
    camber_deg: float
    deflection: float


class SteeringAxis(BaseModel):
    """主销轴（转向轴）：单位方向向量 + 与地面 z=0 的交点。"""
    direction: list[float]
    ground_point: list[float] | None = None


class WheelPose(BaseModel):
    """单轮几何状态（per_wheel_geometry 层）。"""
    travel_mm: float
    wheel_center: list[float]
    ball_joints: dict[str, list[float]] = Field(default_factory=dict)
    tie_rod_inner: list[float] | None = None
    contact_patch: ContactPatch
    steering_axis: SteeringAxis
    trajectory: list[dict] = Field(
        default_factory=list,
        description="单点解为空列表；扫掠端点（P2-2）按行程填充轮心/接地点/主销接地轨迹。",
    )


class WheelReport(BaseModel):
    """单轮结果（front/rear 层）：指标 + 残差 + 状态。"""
    angles: WheelAngles | None = None
    residuals: dict[str, float] = Field(default_factory=dict)
    status: ResultStatus


class AxleResults(BaseModel):
    left: WheelReport
    right: WheelReport


class VehicleResult(BaseModel):
    """四轮统一分析结果（P2-1）。"""
    design_id: str
    design_version: int
    case_id: str
    case_version: int
    solver: str
    status: ResultStatus
    front: AxleResults
    rear: AxleResults
    per_wheel_geometry: dict[str, WheelPose | None] = Field(default_factory=dict)
    residuals: dict[str, float | None] = Field(default_factory=dict)
    solver_status: dict[str, str] = Field(default_factory=dict)
    pose_labels: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    loads: dict[str, dict] = Field(
        default_factory=dict,
        description="P3 载荷层：每轮 {tire_force, transfers, friction_util, "
                    "off_ground, wheel_end{...}, jacking_force_n, status}。"
                    "仅当工况 options.compute_wheel_forces 时填充。",
    )
