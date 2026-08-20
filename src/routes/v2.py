"""版本化 v2 API（设计文档 §11.3）。

旧 /api/* 端点原样保留为兼容包装；新分析入口只接受明确的
design_id/version + case_id，不再接受"全局当前硬点"。

v2 solve 当前直通顺序 bump→steer 求解器，显式标记 APPROXIMATE；
是否升级为统一约束解由 P1 误差基准决定（§5.2）。
左轮用方案中独立存储的左侧硬点直接求解（§5.1：运动状态左右独立），
报告值经 fix_left_angles 翻号对齐右轮符号（现状显示约定，K-2 待 P2 统一）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from core.models import DesignVersion, ResultStatus
from core.store import DataStore
from routes.solve import _solve_axle
from solver.angles import fix_left_angles

router = APIRouter(prefix="/api/v2")

SOLVER_NAME = "sequential-bump-steer-v1"
RESIDUAL_WARN_TOL = 0.02  # mm，设计文档 §13.2

_ANGLE_KEYS = ("camber_deg", "toe_deg", "caster_deg", "kpi_deg",
               "scrub_radius_mm", "caster_trail_mm")


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
    residuals: dict[str, float] = {}
    metrics: dict[str, dict] = {}

    corners = [
        ("front_right", dv.front_right, t.fr, veh.get("front_track_mm", 0.0)),
        ("front_left", dv.front_left, t.fl, veh.get("front_track_mm", 0.0)),
        ("rear_right", dv.rear_right, t.rr, veh.get("rear_track_mm", 0.0)),
        ("rear_left", dv.rear_left, t.rl, veh.get("rear_track_mm", 0.0)),
    ]
    for name, axle_hp, travel, track in corners:
        hp = axle_hp.flat()
        hp.setdefault("track_width", track)
        ax = _solve_axle(hp, travel, cv.rack_displacement, mirror=False)
        angles = dict(ax["angles_right"])
        residual = float(ax["right"].get("max_residual", 0.0))
        residuals[name] = round(residual, 6)
        if residual > RESIDUAL_WARN_TOL:
            warnings.append(f"{name}: 几何残差 {residual:.4f}mm 超过阈值 "
                            f"{RESIDUAL_WARN_TOL}mm（§13.2 警告状态）")
        metrics[name] = {k: angles.get(k) for k in _ANGLE_KEYS}
        metrics[name]["contact_patch"] = ax.get("contact_patch_right")

    # 左轮报告值翻号对齐右轮符号（现状显示约定，K-2 待 P2 统一）
    for left, right in (("front_left", "front_right"), ("rear_left", "rear_right")):
        aligned = fix_left_angles(metrics[left], metrics[right])
        aligned["contact_patch"] = metrics[left]["contact_patch"]
        metrics[left] = aligned

    return {
        "design_id": req.design_id, "design_version": dv.version,
        "case_id": req.case_id, "case_version": cv.version,
        "solver": SOLVER_NAME,
        "status": ResultStatus.APPROXIMATE.value,
        "residuals": residuals,
        "metrics": metrics,
        "pose_labels": cv.derived_pose(veh.get("front_track_mm", 1200.0),
                                       veh.get("rear_track_mm", 1200.0),
                                       veh.get("wheelbase_mm", 1550.0)),
        "warnings": warnings,
    }
