"""版本化 v2 API（设计文档 §11.3）。

旧 /api/* 端点原样保留为兼容包装；新分析入口只接受明确的
design_id/version + case_id，不再接受"全局当前硬点"。

v2 solve 输出 P2-1 统一 VehicleResult：
  front/rear × left/right（指标+残差+状态）+ per_wheel_geometry（姿态/接地点/
  主销轴/球头/轨迹）+ residuals + solver_status + pose_labels + warnings。
四轮均用方案中独立存储的硬点直接求解（§5.1：运动状态左右独立）；
compute_alignment_angles 按轮心 Y 自动判别左右侧并输出车辆全局符号约定
（P2-0：不再需要 fix_left_angles 翻号）。
求解路径为顺序 bump→steer（P1 冻结的生产预览路径），polish=True（LS 精修）；
每轮诚实几何残差 = max(bump 残差, 横拉杆长度残差)，按 §13.2 阈值映射为
VALID / APPROXIMATE / OUT_OF_RANGE，单轮异常隔离为 SOLVER_FAILED。
"""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from core.models import DesignVersion, ResultStatus
from core.results import (
    AxleResults,
    ContactPatch,
    SteeringAxis,
    VehicleResult,
    WheelAngles,
    WheelPose,
    WheelReport,
)
from core.store import DataStore
from routes.solve import _solve_axle

router = APIRouter(prefix="/api/v2")

SOLVER_NAME = "sequential-bump-steer-v1"
RESIDUAL_VALID_TOL = 0.02      # mm，设计文档 §13.2 正常状态
RESIDUAL_OUT_OF_RANGE_TOL = 0.5  # mm，超过则几何不可信（K-4 全行程最差 ~0.75）

_ANGLE_KEYS = ("camber_deg", "toe_deg", "caster_deg", "kpi_deg",
               "scrub_radius_mm", "caster_trail_mm")

# 整车状态优先级：SOLVER_FAILED > OUT_OF_RANGE > APPROXIMATE > VALID
_STATUS_PRIORITY = {
    ResultStatus.SOLVER_FAILED: 0,
    ResultStatus.OUT_OF_RANGE: 1,
    ResultStatus.APPROXIMATE: 2,
    ResultStatus.VALID: 3,
}


def _status_for_residual(residual: float | None) -> ResultStatus:
    """由单轮几何残差推导结果状态（P2-3 状态机前置）。"""
    if residual is None:
        return ResultStatus.SOLVER_FAILED
    if residual <= RESIDUAL_VALID_TOL:
        return ResultStatus.VALID
    if residual <= RESIDUAL_OUT_OF_RANGE_TOL:
        return ResultStatus.APPROXIMATE
    return ResultStatus.OUT_OF_RANGE


def _worst_status(statuses) -> ResultStatus:
    best = min((_STATUS_PRIORITY.get(s, 9) for s in statuses), default=3)
    for s, p in _STATUS_PRIORITY.items():
        if p == best:
            return s
    return ResultStatus.VALID


def _steering_axis(result: dict) -> SteeringAxis:
    """主销轴：UP1(上球头)→UP2(下球头) 单位方向 + 地面 z=0 交点。"""
    UP1 = np.asarray(result["UP1"], dtype=float)
    UP2 = np.asarray(result["UP2"], dtype=float)
    vec = UP2 - UP1
    n = float(np.linalg.norm(vec))
    direction = [float(v) for v in (vec / n if n > 1e-12 else np.zeros(3))]
    ground = None
    if n > 1e-12 and abs(direction[2]) > 1e-9:
        t = -float(UP1[2]) / direction[2]
        ground = [round(float(g), 4) for g in (UP1 + t * np.asarray(direction))]
    return SteeringAxis(
        direction=[round(float(v), 9) for v in direction],
        ground_point=ground,
    )


def _wheel_pose(name: str, travel: float, result: dict,
                angles: dict, cp: dict | None) -> WheelPose:
    UP5 = [round(float(v), 4) for v in result["UP5"]]
    cp_model = ContactPatch(
        center=[round(float(v), 4) for v in cp["center"]],
        loaded_radius=round(float(cp["loaded_radius"]), 4),
        camber_deg=round(float(cp["camber_deg"]), 4),
        deflection=round(float(cp["deflection"]), 4),
    ) if cp and cp.get("center") else ContactPatch(
        center=[UP5[0], UP5[1], 0.0], loaded_radius=0.0, camber_deg=0.0, deflection=0.0)
    return WheelPose(
        travel_mm=round(float(travel), 4),
        wheel_center=UP5,
        ball_joints={
            "upper": [round(float(v), 4) for v in result["UP1"]],
            "lower": [round(float(v), 4) for v in result["UP2"]],
        },
        tie_rod_inner=([round(float(v), 4) for v in result["FL1"]]
                       if "FL1" in result else None),
        contact_patch=cp_model,
        steering_axis=_steering_axis(result),
    )


def get_store() -> DataStore:
    return DataStore()


def _ensure_seeded(store: DataStore) -> None:
    ensure_legacy_import(store)
    ensure_preset_cases(store)


# ---------- designs ----------

class CopyDesignRequest(BaseModel):
    copy_from: str
    design_id: str
    name: str = ""
    copy_version: int | None = None


@router.get("/designs")
def list_designs():
    store = get_store()
    _ensure_seeded(store)
    return {"designs": store.list_designs()}


@router.get("/designs/{design_id}")
def get_design(design_id: str, version: int | None = None):
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(design_id, version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return dv.model_dump()


@router.post("/designs")
def copy_design(req: CopyDesignRequest):
    store = get_store()
    _ensure_seeded(store)
    try:
        src = store.get_design(req.copy_from, req.copy_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    new = src.model_copy(deep=True)
    new.name = req.name or new.name
    new.notes = f"copied from {req.copy_from} v{src.version}"
    try:
        doc = store.create_design(new, design_id=req.design_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"design_id": doc.design_id, "version": doc.latest}


@router.post("/designs/{design_id}/versions")
def add_version(design_id: str, version: DesignVersion):
    store = get_store()
    try:
        dv = store.add_design_version(design_id, version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return dv.model_dump()


# ---------- cases ----------

@router.get("/cases")
def list_cases():
    store = get_store()
    _ensure_seeded(store)
    return {"cases": store.list_cases()}


@router.get("/cases/{case_id}")
def get_case(case_id: str, version: int | None = None):
    store = get_store()
    _ensure_seeded(store)
    try:
        cv = store.get_case(case_id, version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return cv.model_dump()


# ---------- solve ----------

class SolveV2Request(BaseModel):
    design_id: str
    case_id: str
    design_version: int | None = None
    case_version: int | None = None


@router.post("/solve")
def solve_v2(req: SolveV2Request):
    """四轮统一 VehicleResult（P2-1）。

    每轮独立求解（方案中独立存储的左右硬点），逐轮输出：
    定位角、残差、状态、姿态/接地点/主销轴/球头几何。
    单轮求解异常被隔离为 SOLVER_FAILED，不使整个请求失败。
    """
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(req.design_id, req.design_version)
        cv = store.get_case(req.case_id, req.case_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    veh = dv.vehicle
    t = cv.travel
    warnings: list[str] = []
    residuals: dict[str, float | None] = {}
    reports: dict[str, WheelReport] = {}
    geometry: dict[str, WheelPose | None] = {}

    corners = [
        ("front_right", dv.front_right, t.fr, veh.get("front_track_mm", 0.0)),
        ("front_left", dv.front_left, t.fl, veh.get("front_track_mm", 0.0)),
        ("rear_right", dv.rear_right, t.rr, veh.get("rear_track_mm", 0.0)),
        ("rear_left", dv.rear_left, t.rl, veh.get("rear_track_mm", 0.0)),
    ]
    for name, axle_hp, travel, track in corners:
        hp = axle_hp.flat()
        hp.setdefault("track_width", track)
        try:
            # polish=True：v2 为分析路径，使用 LS 精修几何（与 P1 基准残差语义一致）
            ax = _solve_axle(hp, travel, cv.rack_displacement, mirror=False,
                             polish=True)
            result = ax["right"]
            angles = {k: ax["angles_right"].get(k) for k in _ANGLE_KEYS}
            residual = float(ax.get("geometry_residual_mm", 0.0))
            status = _status_for_residual(residual)
            pose = _wheel_pose(name, travel, result, angles,
                               ax.get("contact_patch_right"))
        except Exception as exc:  # noqa: BLE001 — 逐轮隔离，保留整请求
            angles = None
            residual = None
            status = ResultStatus.SOLVER_FAILED
            pose = None
            warnings.append(f"{name}: 求解失败（{type(exc).__name__}）")
        residuals[name] = round(residual, 6) if residual is not None else None
        if residual is not None and residual > RESIDUAL_VALID_TOL:
            warnings.append(f"{name}: 几何残差 {residual:.4f}mm 超过阈值 "
                            f"{RESIDUAL_VALID_TOL}mm（§13.2 警告状态，状态="
                            f"{status.value}）")
        reports[name] = WheelReport(
            angles=WheelAngles(**angles) if angles else None,
            residuals={"geometry_residual_mm": residual}
            if residual is not None else {},
            status=status,
        )
        geometry[name] = pose

    result = VehicleResult(
        design_id=req.design_id, design_version=dv.version,
        case_id=req.case_id, case_version=cv.version,
        solver=SOLVER_NAME,
        status=_worst_status(r.status for r in reports.values()),
        front=AxleResults(left=reports["front_left"], right=reports["front_right"]),
        rear=AxleResults(left=reports["rear_left"], right=reports["rear_right"]),
        per_wheel_geometry=geometry,
        residuals=residuals,
        solver_status={name: reports[name].status.value for name in reports},
        pose_labels=cv.derived_pose(veh.get("front_track_mm", 1200.0),
                                    veh.get("rear_track_mm", 1200.0),
                                    veh.get("wheelbase_mm", 1550.0)),
        warnings=warnings,
    )
    return result.model_dump()
