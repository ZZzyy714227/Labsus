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
from metrics.kinematics import (
    ackermann_pct,
    anti_dive,
    anti_squat,
    bump_steer_deg_per_25,
    camber_gain_deg_per_25,
    included_angle,
    jacking,
    motion_ratio,
    roll_center_height,
    side_view_ic,
    steering_camber_gain,
    svic_point,
    wheelbase_change,
)
from metrics.roll import compute_instant_center
from routes.solve import DEFAULT_FRAME_NODES, _rear_rocker_frame_nodes, _solve_axle

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


def _solve_corner(axle_hp, travel: float, rack: float, track: float) -> dict:
    """求解一个角（方案中独立存储的硬点，polish=True 分析路径）。

    返回 result/angles/residual/status/pose/cp/rocker；异常向上抛出，
    由调用方按角隔离。
    """
    hp = axle_hp.flat()
    hp.setdefault("track_width", track)
    ax = _solve_axle(hp, travel, rack, mirror=False, polish=True)
    result = ax["right"]
    angles = {k: ax["angles_right"].get(k) for k in _ANGLE_KEYS}
    residual = float(ax.get("geometry_residual_mm", 0.0))
    status = _status_for_residual(residual)
    pose = _wheel_pose("", travel, result, angles, ax.get("contact_patch_right"))
    return {
        "result": result, "angles": angles, "residual": residual,
        "status": status, "pose": pose, "cp": ax.get("contact_patch_right"),
        "rocker": ax.get("rocker_right"),
    }


class SweepV2Request(BaseModel):
    design_id: str
    case_id: str
    design_version: int | None = None
    case_version: int | None = None
    axle: str = "front"          # front | rear
    axis: str = "travel"         # travel | rack
    min: float = -25.0
    max: float = 25.0
    points: int = 21


def _axle_pair(dv, axle: str):
    if axle == "rear":
        return ("rear_right", dv.rear_right, "rear_left", dv.rear_left,
                "rear_track_mm", _rear_rocker_frame_nodes())
    return ("front_right", dv.front_right, "front_left", dv.front_left,
            "front_track_mm", DEFAULT_FRAME_NODES)


@router.post("/sweep")
def sweep_v2(req: SweepV2Request):
    """P2-2 曲线：选定轴在轮跳/转向上的扫掠曲线与派生指标。

    axis=travel：轴双轮同向轮跳（heave），rack 保持工况值；
    axis=rack：rack 扫掠，行程保持工况值。
    返回逐轮角度/几何曲线 + 轴级曲线（RC 高、Motion Ratio、Track Change、
    Ackermann 随转向）+ 静态点派生指标（含七状态）。
    """
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(req.design_id, req.design_version)
        cv = store.get_case(req.case_id, req.case_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    if req.axle not in ("front", "rear"):
        raise HTTPException(status_code=422, detail="axle must be front|rear")
    if req.points < 3 or req.points > 101:
        raise HTTPException(status_code=422, detail="points must be in [3, 101]")
    if req.max <= req.min:
        raise HTTPException(status_code=422, detail="max must be > min")

    r_name, r_hp, l_name, l_hp, track_key, frame_nodes = _axle_pair(dv, req.axle)
    track = float(dv.vehicle.get(track_key, 0.0))
    veh = dv.vehicle
    t = cv.travel
    axis_vals = [req.min + (req.max - req.min) * i / (req.points - 1)
                 for i in range(req.points)]

    def solve_axle(axis_val):
        """axis=travel → 双轮同向轮跳；axis=rack → 双轮同 rack。"""
        if req.axis == "rack":
            travel_r = t.fr if req.axle == "front" else t.rr
            travel_l = t.fl if req.axle == "front" else t.rl
            rack = axis_val
        else:
            travel_r = (t.fr if req.axle == "front" else t.rr) + axis_val
            travel_l = (t.fl if req.axle == "front" else t.rl) + axis_val
            rack = cv.rack_displacement
        sol_r = _solve_corner(r_hp, travel_r, rack, track)
        sol_l = _solve_corner(l_hp, travel_l, rack, track)
        return sol_r, sol_l, travel_r, travel_l, rack

    curves: dict[str, list] = {k: [] for k in (
        "right_camber_deg", "right_toe_deg", "right_scrub_radius_mm",
        "right_caster_trail_mm", "right_kpi_deg",
        "left_camber_deg", "left_toe_deg", "left_scrub_radius_mm",
        "left_caster_trail_mm", "left_kpi_deg",
        "roll_center_height_mm", "motion_ratio", "track_change_mm",
        "ackermann_pct")}
    warnings: list[str] = []
    ack_pts: list[float | None] = []

    for av in axis_vals:
        try:
            sol_r, sol_l, tr, tl, rack = solve_axle(av)
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"扫掠点 {av:.1f}: {type(exc).__name__}")
            for k in curves:
                curves[k].append(None)
            ack_pts.append(None)
            continue
        a_r, a_l = sol_r["angles"], sol_l["angles"]
        for ck, key in (("right_camber_deg", "camber_deg"),
                        ("right_toe_deg", "toe_deg"),
                        ("right_scrub_radius_mm", "scrub_radius_mm"),
                        ("right_caster_trail_mm", "caster_trail_mm"),
                        ("right_kpi_deg", "kpi_deg"),
                        ("left_camber_deg", "camber_deg"),
                        ("left_toe_deg", "toe_deg"),
                        ("left_scrub_radius_mm", "scrub_radius_mm"),
                        ("left_caster_trail_mm", "caster_trail_mm"),
                        ("left_kpi_deg", "kpi_deg")):
            curves[ck].append(a_r.get(key) if ck.startswith("right") else a_l.get(key))
        # RC 高（正视 IC + 接地点）
        hp_r = r_hp.flat()
        hp_r.setdefault("track_width", track)
        hp_l = l_hp.flat()
        hp_l.setdefault("track_width", track)
        ic_r = compute_instant_center(hp_r, sol_r["result"])
        ic_l = compute_instant_center(hp_l, sol_l["result"])
        cp_r = sol_r["cp"]["center"] if sol_r["cp"] else None
        cp_l = sol_l["cp"]["center"] if sol_l["cp"] else None
        if ic_r is not None and cp_r:
            rc = roll_center_height(
                (float(ic_r[0]), float(ic_r[1])),
                (float(ic_l[0]), float(ic_l[1])) if ic_l is not None else None,
                (float(cp_r[1]), 0.0), (float(cp_l[1]), 0.0) if cp_l else None)
            curves["roll_center_height_mm"].append(rc.value)
        else:
            curves["roll_center_height_mm"].append(None)
        # Motion Ratio（rockers damper travel 曲线差分）
        damper = sol_r["rocker"]["damper_travel"] if sol_r["rocker"] else None
        curves["motion_ratio"].append(damper)
        # Track change（轮距变化）
        wc_y_r = float(sol_r["result"]["UP5"][1])
        wc_y_l = float(sol_l["result"]["UP5"][1])
        curves["track_change_mm"].append(
            (abs(wc_y_r) - abs(float(hp_r["UP5"][1])))
            + (abs(wc_y_l) - abs(float(hp_l["UP5"][1]))))
        # Ackermann（rack 扫掠时有效）
        ack_pts.append(ackermann_pct(a_l["toe_deg"], a_r["toe_deg"],
                                     track, float(veh.get("wheelbase_mm", 1550.0)))
                       .value if req.axis == "rack" else None)
    curves["ackermann_pct"] = ack_pts

    # 静态点派生指标（axis_val=0 或 rack=0）
    try:
        sol_r0, sol_l0, _, _, _ = solve_axle(0.0)
        a_r0, a_l0 = sol_r0["angles"], sol_l0["angles"]
    except Exception as exc:  # noqa: BLE001
        sol_r0 = sol_l0 = None
        warnings.append(f"静态点求解失败: {type(exc).__name__}")

    metrics: dict[str, dict] = {}
    if sol_r0 is not None and sol_l0 is not None:
        metrics["included_angle_right"] = included_angle(
            a_r0["kpi_deg"], a_r0["camber_deg"]).with_key("included_angle_right").model_dump()
        metrics["included_angle_left"] = included_angle(
            a_l0["kpi_deg"], a_l0["camber_deg"]).with_key("included_angle_left").model_dump()
        metrics["bump_steer_right"] = bump_steer_deg_per_25(
            curves["right_toe_deg"], axis_vals, 0.0).with_key("bump_steer_right").model_dump()
        metrics["camber_gain_right"] = camber_gain_deg_per_25(
            curves["right_camber_deg"], axis_vals, 0.0).with_key("camber_gain_right").model_dump()
        if sol_r0["rocker"]:
            metrics["motion_ratio"] = motion_ratio(
                curves["motion_ratio"], axis_vals, 0.0).with_key("motion_ratio").model_dump()
        else:
            metrics["motion_ratio"] = motion_ratio(
                [], axis_vals, 0.0).with_key("motion_ratio").model_dump()
        if req.axis == "rack":
            # Steering Camber Gain：从 rack 曲线在 rack=0 处的 camber-vs-toe 斜率
            toe_c = curves["right_toe_deg"]
            cam_c = curves["right_camber_deg"]
            idx0 = min(range(len(axis_vals)),
                      key=lambda i: abs(float(axis_vals[i]) - 0.0))
            cam0 = cam_c[idx0] if idx0 < len(cam_c) else None
            toe0 = toe_c[idx0] if idx0 < len(toe_c) else None
            if cam0 is not None and toe0 is not None:
                # 取 rack=0 邻域差分
                d_cam = 0.0
                d_toe = 0.0
                for j in range(max(0, idx0 - 1), min(len(toe_c), idx0 + 2)):
                    if j == idx0 or toe_c[j] is None or cam_c[j] is None:
                        continue
                    d_cam += float(cam_c[j]) - float(cam0)
                    d_toe += float(toe_c[j]) - float(toe0)
                metrics["steering_camber_gain_right"] = steering_camber_gain(
                    cam0, cam0 + d_cam, toe0, toe0 + d_toe
                ).with_key("steering_camber_gain_right").model_dump()
            else:
                metrics["steering_camber_gain_right"] = {
                    "key": "steering_camber_gain_right", "value": None,
                    "unit": "deg/deg", "status": ResultStatus.SOLVER_FAILED.value,
                    "note": "rack 曲线在 0 处不可用"}
            metrics["ackermann"] = ackermann_pct(
                a_l0["toe_deg"], a_r0["toe_deg"],
                track, float(veh.get("wheelbase_mm", 1550.0))).with_key("ackermann").model_dump()
        # 侧视瞬心 + Anti-dive/squat（静态点，SVIC 重写）
        hp_r0 = r_hp.flat()
        hp_r0.setdefault("track_width", track)
        hp_l0 = l_hp.flat()
        hp_l0.setdefault("track_width", track)
        svic_r = side_view_ic(hp_r0["CH1"], hp_r0["CH2"], sol_r0["result"]["UP1"],
                              hp_r0["CH3"], hp_r0["CH4"], sol_r0["result"]["UP2"]
                              ).with_key("side_view_ic_right")
        metrics["side_view_ic_right"] = svic_r.model_dump()
        sv = svic_point(hp_r0["CH1"], hp_r0["CH2"], sol_r0["result"]["UP1"],
                        hp_r0["CH3"], hp_r0["CH4"], sol_r0["result"]["UP2"])
        if sv is not None:
            cp_r0 = sol_r0["cp"]["center"] if sol_r0["cp"] else None
            if cp_r0:
                wb = float(veh.get("wheelbase_mm", 1550.0))
                hcg = float(veh.get("cg_height_mm", 300.0))
                if req.axle == "front":
                    metrics["anti_dive"] = anti_dive(
                        sv, (float(cp_r0[0]), float(cp_r0[2])), wb, hcg,
                        float(veh.get("ax_brake", 1.2)),
                        float(veh.get("brake_front_frac", 0.6))).with_key("anti_dive").model_dump()
                else:
                    metrics["anti_squat"] = anti_squat(
                        sv, (float(cp_r0[0]), float(cp_r0[2])), wb, hcg,
                        float(veh.get("ax_accel", 1.0)),
                        float(veh.get("drive_rear_frac", 1.0))).with_key("anti_squat").model_dump()
        metrics["jacking"] = jacking(0.0).with_key("jacking").model_dump()
        # Wheelbase Change：静态点求解另一轴
        try:
            other_axle = "rear" if req.axle == "front" else "front"
            o_name, o_r_hp, o_l_name, o_l_hp, o_track_key, _fn = _axle_pair(dv, other_axle)
            o_track = float(dv.vehicle.get(o_track_key, 0.0))
            o_travel_r = t.rr if other_axle == "rear" else t.fr
            o_travel_l = t.rl if other_axle == "rear" else t.fl
            sol_or = _solve_corner(o_r_hp, o_travel_r, cv.rack_displacement, o_track)
            sol_ol = _solve_corner(o_l_hp, o_travel_l, cv.rack_displacement, o_track)
            wb = float(veh.get("wheelbase_mm", 1550.0))
            fx = (float(sol_r0["result"]["UP5"][0]) + float(sol_l0["result"]["UP5"][0])) / 2.0
            rx = (float(sol_or["result"]["UP5"][0]) + float(sol_ol["result"]["UP5"][0])) / 2.0
            fx0 = (float(hp_r0["UP5"][0]) + float(hp_l0["UP5"][0])) / 2.0
            rx0 = (float(o_r_hp.flat()["UP5"][0]) + float(o_l_hp.flat()["UP5"][0])) / 2.0
            metrics["wheelbase_change"] = wheelbase_change(
                fx, rx, fx0, rx0).with_key("wheelbase_change").model_dump()
        except Exception as exc:  # noqa: BLE001
            metrics["wheelbase_change"] = {
                "key": "wheelbase_change", "value": None, "unit": "mm",
                "status": ResultStatus.SOLVER_FAILED.value,
                "note": f"另一轴求解失败: {type(exc).__name__}"}
        metrics["track_change"] = {
            "key": "track_change", "value": round(curves["track_change_mm"][0] or 0.0, 4),
            "unit": "mm", "status": ResultStatus.VALID.value, "note": "静态点轴轮距变化"}

    return {
        "design_id": req.design_id, "case_id": req.case_id,
        "axle": req.axle, "axis": req.axis,
        "values": [round(float(v), 3) for v in axis_vals],
        "curves": curves,
        "metrics": metrics,
        "warnings": warnings,
    }


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
        try:
            sol = _solve_corner(axle_hp, travel, cv.rack_displacement, track)
            angles = sol["angles"]
            residual = sol["residual"]
            status = sol["status"]
            pose = sol["pose"]
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
