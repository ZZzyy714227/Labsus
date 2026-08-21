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

import math
import os

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
from metrics.bounce import simulate as bounce_simulate
from metrics.dynamics import damping_ratio, ride_frequency_hz, sprung_mass_per_corner
from metrics.handling import understeer_curve, understeer_gradient
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
from metrics.loads import arb_droplink_force, solve_upright_forces
from metrics.ride import ride_level
from metrics.roll import compute_instant_center, compute_roll_stiffness_suspension
from metrics.targets import TARGET_BANDS
from metrics.wheel_loads import distribute_vehicle_loads
from routes.solve import DEFAULT_FRAME_NODES, _rear_rocker_frame_nodes, _solve_axle

router = APIRouter(prefix="/api/v2")

# DWB 式机制求解模式：环境开关（机制为生产默认；sequential 保留为回退）
_SOLVER_MODE = os.environ.get("DWB_SOLVER_MODE", "mechanism")
SOLVER_NAME = {
    "mechanism": "dwb-mechanism-v1",
    "sequential": "sequential-bump-steer-v1",
}.get(_SOLVER_MODE, "sequential-bump-steer-v1")
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
    settle_ride: bool = False            # P5 调平闭环：把 case 轮跳平移到 ride_mm 调平位形再求解
    ride_mm: dict[str, float] | None = None        # 调平目标轮跳偏移（来自 /handling ride_level）


def _solve_corner(axle_hp, travel: float, rack: float, track: float,
                  solver: str | None = None) -> dict:
    """求解一个角（方案中独立存储的硬点，polish=True 分析路径）。

    返回 result/angles/residual/status/pose/cp/rocker；异常向上抛出，
    由调用方按角隔离。solver: 'mechanism'|'mw' 走 DWB 机制求解；否则按
    模块 `_SOLVER_MODE`（默认 sequential，顺序解为回退）。
    """
    hp = axle_hp.flat()
    hp.setdefault("track_width", track)
    if solver in ("mechanism", "mw", "sequential"):
        mode = solver
    else:
        mode = _SOLVER_MODE
    if mode in ("mechanism", "mw"):
        from solver.mechanism.v2adapter import solve_corner_mechanism

        result, angles, residual, cp, rocker, rocker_ok = solve_corner_mechanism(
            hp, travel, rack)
    else:
        ax = _solve_axle(hp, travel, rack, mirror=False, polish=True)
        result = ax["right"]
        angles = {k: ax["angles_right"].get(k) for k in _ANGLE_KEYS}
        residual = float(ax.get("geometry_residual_mm", 0.0))
        cp = ax.get("contact_patch_right")
        rocker = ax.get("rocker_right")
        rocker_ok = rocker is not None
    status = _status_for_residual(residual)
    if rocker_ok is False and status is ResultStatus.VALID:
        # 轮侧几何可达但摇臂/推杆闭环不可达（伸张端减振器布局极限）→ OUT_OF_RANGE
        status = ResultStatus.OUT_OF_RANGE
    pose = _wheel_pose("", travel, result, angles, cp)
    return {
        "result": result, "angles": angles, "residual": residual,
        "status": status, "pose": pose, "cp": cp,
        "rocker": rocker,
    }


def _hp_for_corner(name: str, dv) -> dict:
    """取角对应的扁平 hp dict（含 CH1..CH5/UP1..UP5/FL1 设计坐标）。"""
    axle = {"front_right": dv.front_right, "front_left": dv.front_left,
            "rear_right": dv.rear_right, "rear_left": dv.rear_left}[name]
    hp = axle.flat()
    track = dv.vehicle.get("front_track_mm" if name.startswith("front")
                           else "rear_track_mm", 0.0)
    hp.setdefault("track_width", track)
    return hp


def _axle_motion_ratio(axle_hp, travel: float, rack: float, track: float,
                       frame_nodes) -> float | None:
    """几何 Motion Ratio：±2.5mm rocker mini-sweep 的 |Δdamper/Δwheel|。"""
    try:
        hp = axle_hp.flat()
        hp.setdefault("track_width", track)
        a0 = _solve_axle(hp, travel - 2.5, rack, mirror=False, polish=True,
                         frame_nodes=frame_nodes)
        a1 = _solve_axle(hp, travel + 2.5, rack, mirror=False, polish=True,
                         frame_nodes=frame_nodes)
        d0 = a0.get("rocker_right", {}).get("damper_travel")
        d1 = a1.get("rocker_right", {}).get("damper_travel")
        if d0 is None or d1 is None:
            return None
        return abs(float(d1) - float(d0)) / 5.0
    except Exception:  # noqa: BLE001
        return None


def _compute_vehicle_loads(dv, cv, sols: dict, veh: dict, roll_deg: float) -> dict:
    """P3 载荷层：整车分配 + 每轮轮边受力 + Jacking。

    sols: {corner: _solve_corner 结果}；veh: 整车参数。
    返回 {} 表示载荷不可用（MR/轮距缺失等），调用方应如实标记。
    """
    tr_f = float(veh.get("front_track_mm", 0.0))
    tr_r = float(veh.get("rear_track_mm", 0.0))
    k_spring_f = float(veh.get("k_spring_f", 0.0))
    k_spring_r = float(veh.get("k_spring_r", 0.0))
    k_arb_f = float(veh.get("k_arb_f", 0.0))
    k_arb_r = float(veh.get("k_arb_r", 0.0))

    mr_f = _axle_motion_ratio(dv.front_right, cv.travel.fr, cv.rack_displacement,
                              tr_f, DEFAULT_FRAME_NODES)
    mr_r = _axle_motion_ratio(dv.rear_right, cv.travel.rr, cv.rack_displacement,
                              tr_r, _rear_rocker_frame_nodes())
    if mr_f is None or mr_r is None or tr_f <= 0 or tr_r <= 0:
        return {}
    k_f = compute_roll_stiffness_suspension(k_spring_f, mr_f, tr_f) + k_arb_f
    k_r = compute_roll_stiffness_suspension(k_spring_r, mr_r, tr_r) + k_arb_r

    # 有效滚转角：行程派生（kinematic） + ay 平衡滚转（φ = ay·m_s·g·(h−rc)/k_total）
    m_total = float(veh.get("mass_kg", 0.0))
    h_cg = float(veh.get("cg_height_mm", 300.0))
    unsprung = float(veh.get("unsprung_kg", 20.0))
    m_s = max(m_total - unsprung * 4.0, 1e-6)

    def axle_rc_z(r_name, l_name):
        sol_r, sol_l = sols[r_name], sols[l_name]
        hp_r = _hp_for_corner(r_name, dv)
        hp_l = _hp_for_corner(l_name, dv)
        ic_r = compute_instant_center(hp_r, sol_r["result"])
        ic_l = compute_instant_center(hp_l, sol_l["result"])
        cp_r = sol_r["cp"]["center"] if sol_r["cp"] else None
        cp_l = sol_l["cp"]["center"] if sol_l["cp"] else None
        if ic_r is None or cp_r is None or cp_l is None:
            return 0.0
        m = roll_center_height(
            (float(ic_r[0]), float(ic_r[1])),
            (float(ic_l[0]), float(ic_l[1])) if ic_l is not None else None,
            (float(cp_r[1]), 0.0), (float(cp_l[1]), 0.0))
        return float(m.value) if m.value is not None else 0.0

    rc_f = axle_rc_z("front_right", "front_left")
    rc_r = axle_rc_z("rear_right", "rear_left")

    # ay 平衡滚转（rad）：φ = ay·m_s·g·(h_cg − rc_avg) / (k_f + k_r)
    phi_ay = 0.0
    if float(cv.loads.ay_g) != 0.0 and k_f + k_r > 1e-9:
        rc_avg = (rc_f + rc_r) / 2.0
        phi_ay = (float(cv.loads.ay_g) * m_s * 9.81 * (h_cg - rc_avg)
                  / (k_f + k_r))
    roll_deg_eff = float(roll_deg) + math.degrees(phi_ay)

    try:
        dist = distribute_vehicle_loads(veh, cv.loads, k_f, k_r, rc_f, rc_r, roll_deg_eff)
    except (ValueError, TypeError, ZeroDivisionError):
        return {}

    loads_out: dict[str, dict] = {}
    corners = [
        ("front_right", tr_f, k_arb_f, True),
        ("front_left", tr_f, k_arb_f, False),
        ("rear_right", tr_r, k_arb_r, True),
        ("rear_left", tr_r, k_arb_r, False),
    ]
    for name, track, k_arb, right_side in corners:
        sol = sols[name]
        d = dict(dist[name])
        f_tire = np.array([d["fx_n"], d["fy_n"], d["fz_n"]], dtype=float)
        f_drop = (arb_droplink_force(k_arb, roll_deg_eff, track, right_side)
                  if cv.options.arb_enabled else np.zeros(3))
        cp = sol["cp"]["center"] if sol["cp"] else None
        hp = _hp_for_corner(name, dv)
        try:
            we = solve_upright_forces(hp, sol["result"], f_tire,
                                      f_drop=f_drop, contact_patch=cp)
        except Exception as exc:  # noqa: BLE001
            we = {"status": "SOLVER_FAILED", "explanation": str(type(exc).__name__),
                  "member_forces": None, "ball_joints": None,
                  "chassis_reactions": None, "force_residual_n": None,
                  "moment_residual_nmm": None}
        jacking_n = None
        if we.get("status") != "SOLVER_FAILED":
            ic = compute_instant_center(hp, sol["result"])
            if ic is not None:
                dy = float(ic[0]) - float(sol["result"]["UP5"][1])
                if abs(dy) > 1e-9:
                    jacking_n = round(d["fy_n"] * (float(ic[1]) - 0.0) / dy, 3)
        d["wheel_end"] = we
        d["jacking_force_n"] = jacking_n
        d["status"] = we.get("status", ResultStatus.SOLVER_FAILED.value)
        loads_out[name] = d
    return loads_out


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


def _sweep_curves(dv, cv, axle: str, axis: str, _min: float, _max: float,
                  points: int, absolute: bool = False) -> dict:
    """轴级扫掠曲线（sweep 端点与 compare 共用）。

    返回 {values, curves, warnings}；不抛 HTTP 异常（参数校验由调用方完成）。
    """
    r_name, r_hp, l_name, l_hp, track_key, frame_nodes = _axle_pair(dv, axle)
    track = float(dv.vehicle.get(track_key, 0.0))
    veh = dv.vehicle
    t = cv.travel
    axis_vals = [_min + (_max - _min) * i / (points - 1) for i in range(points)]

    def solve_axle(axis_val):
        if axis == "rack":
            travel_r = t.fr if axle == "front" else t.rr
            travel_l = t.fl if axle == "front" else t.rl
            rack = axis_val
        else:
            base_r = 0.0 if absolute else (t.fr if axle == "front" else t.rr)
            base_l = 0.0 if absolute else (t.fl if axle == "front" else t.rl)
            travel_r = base_r + axis_val
            travel_l = base_l + axis_val
            rack = cv.rack_displacement
        sol_r = _solve_corner(r_hp, travel_r, rack, track)
        sol_l = _solve_corner(l_hp, travel_l, rack, track)
        return sol_r, sol_l

    curves: dict[str, list] = {k: [] for k in (
        "right_camber_deg", "right_toe_deg", "right_scrub_radius_mm",
        "right_caster_trail_mm", "right_kpi_deg",
        "left_camber_deg", "left_toe_deg", "left_scrub_radius_mm",
        "left_caster_trail_mm", "left_kpi_deg",
        "roll_center_height_mm", "motion_ratio", "track_change_mm",
        "ackermann_pct")}
    warnings: list[str] = []
    ack_pts: list[float | None] = []

    hp_r = r_hp.flat()
    hp_r.setdefault("track_width", track)
    hp_l = l_hp.flat()
    hp_l.setdefault("track_width", track)

    for av in axis_vals:
        try:
            sol_r, sol_l = solve_axle(av)
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
                       .value if axis == "rack" else None)
    curves["ackermann_pct"] = ack_pts
    return {"values": [round(float(v), 3) for v in axis_vals],
            "curves": curves, "warnings": warnings}

def _sweep_metrics(dv, cv, axle: str, axis: str, sw: dict,
                   absolute: bool = False) -> dict:
    """从一条轴级扫掠({values,curves})派生静态点整车指标（sweep 与内联建模共用）。

    axle: front|rear；axis: travel|rack。返回 metrics dict（值 + 状态 + 单位）。
    """
    curve_list = sw["curves"]
    axis_vals = sw["values"]
    veh = dv.vehicle
    t = cv.travel
    _r_name, r_hp, _l_name, l_hp, track_key, _fn = _axle_pair(dv, axle)
    track = float(dv.vehicle.get(track_key, 0.0))

    def solve_axle(axis_val):
        if axis == "rack":
            travel_r = t.fr if axle == "front" else t.rr
            travel_l = t.fl if axle == "front" else t.rl
            rack = axis_val
        else:
            base_r = 0.0 if absolute else (t.fr if axle == "front" else t.rr)
            base_l = 0.0 if absolute else (t.fl if axle == "front" else t.rl)
            travel_r = base_r + axis_val
            travel_l = base_l + axis_val
            rack = cv.rack_displacement
        sol_r = _solve_corner(r_hp, travel_r, rack, track)
        sol_l = _solve_corner(l_hp, travel_l, rack, track)
        return sol_r, sol_l

    metrics: dict[str, dict] = {}
    try:
        sol_r0, sol_l0 = solve_axle(0.0)
        a_r0, a_l0 = sol_r0["angles"], sol_l0["angles"]
    except Exception:
        return metrics
    metrics["included_angle_right"] = included_angle(
        a_r0["kpi_deg"], a_r0["camber_deg"]).with_key("included_angle_right").model_dump()
    metrics["included_angle_left"] = included_angle(
        a_l0["kpi_deg"], a_l0["camber_deg"]).with_key("included_angle_left").model_dump()
    metrics["bump_steer_right"] = bump_steer_deg_per_25(
        curve_list["right_toe_deg"], axis_vals, 0.0).with_key("bump_steer_right").model_dump()
    metrics["camber_gain_right"] = camber_gain_deg_per_25(
        curve_list["right_camber_deg"], axis_vals, 0.0).with_key("camber_gain_right").model_dump()
    if sol_r0["rocker"]:
        metrics["motion_ratio"] = motion_ratio(
            curve_list["motion_ratio"], axis_vals, 0.0).with_key("motion_ratio").model_dump()
    else:
        metrics["motion_ratio"] = motion_ratio(
            [], axis_vals, 0.0).with_key("motion_ratio").model_dump()
    if axis == "rack":
        toe_c = curve_list["right_toe_deg"]
        cam_c = curve_list["right_camber_deg"]
        idx0 = min(range(len(axis_vals)),
                   key=lambda i: abs(float(axis_vals[i]) - 0.0))
        cam0 = cam_c[idx0] if idx0 < len(cam_c) else None
        toe0 = toe_c[idx0] if idx0 < len(toe_c) else None
        if cam0 is not None and toe0 is not None:
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
    hp_r0 = r_hp.flat()
    hp_r0.setdefault("track_width", track)
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
            if axle == "front":
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
    try:
        other_axle = "rear" if axle == "front" else "front"
        _o_name, o_r_hp, _ol, _ol2, o_track_key, _ofn = _axle_pair(dv, other_axle)
        o_track = float(dv.vehicle.get(o_track_key, 0.0))
        o_travel_r = t.rr if other_axle == "rear" else t.fr
        o_travel_l = t.rl if other_axle == "rear" else t.fl
        sol_or = _solve_corner(o_r_hp, o_travel_r, cv.rack_displacement, o_track)
        sol_ol = _solve_corner(o_r_hp.mirrored(), o_travel_l, cv.rack_displacement, o_track)
        wb = float(veh.get("wheelbase_mm", 1550.0))
        fx = (float(sol_r0["result"]["UP5"][0]) + float(sol_l0["result"]["UP5"][0])) / 2.0
        rx = (float(sol_or["result"]["UP5"][0]) + float(sol_ol["result"]["UP5"][0])) / 2.0
        fx0 = (float(hp_r0["UP5"][0]) + float(r_hp.mirrored().flat()["UP5"][0])) / 2.0
        rx0 = (float(o_r_hp.flat()["UP5"][0]) + float(o_r_hp.mirrored().flat()["UP5"][0])) / 2.0
        metrics["wheelbase_change"] = wheelbase_change(
            fx, rx, fx0, rx0).with_key("wheelbase_change").model_dump()
    except Exception as exc:  # noqa: BLE001
        metrics["wheelbase_change"] = {
            "key": "wheelbase_change", "value": None, "unit": "mm",
            "status": ResultStatus.SOLVER_FAILED.value,
            "note": f"另一轴求解失败: {type(exc).__name__}"}
    metrics["track_change"] = {
        "key": "track_change", "value": round(curve_list["track_change_mm"][0] or 0.0, 4),
        "unit": "mm", "status": ResultStatus.VALID.value, "note": "静态点轴轮距变化"}
    return metrics




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

    sw = _sweep_curves(dv, cv, req.axle, req.axis, req.min, req.max, req.points)
    axis_vals = sw["values"]
    curves = sw["curves"]
    warnings = list(sw["warnings"])
    t = cv.travel
    r_name, r_hp, l_name, l_hp, track_key, frame_nodes = _axle_pair(dv, req.axle)
    track = float(dv.vehicle.get(track_key, 0.0))

    def solve_axle(axis_val):
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
        return sol_r, sol_l

    return {
        "design_id": req.design_id, "case_id": req.case_id,
        "axle": req.axle, "axis": req.axis,
        "values": [round(float(v), 3) for v in axis_vals],
        "curves": curves,
        "metrics": _sweep_metrics(dv, cv, req.axle, req.axis, sw),
        "warnings": warnings,
    }


# ---------- 交互建模：内联求解（不落库 / 不计版本） ----------

class CornerHardpointsIn(BaseModel):
    points: dict[str, list[float]]
    tire: dict[str, float] = {}


class SweepInline(BaseModel):
    axis: str = "travel"        # travel | rack
    axle: str = "front"         # front | rear
    min: float = -25.0
    max: float = 25.0
    points: int = 21


class SolveInlineRequest(BaseModel):
    case_id: str = "static"
    travel: dict[str, float] = {"fl": 0.0, "fr": 0.0, "rl": 0.0, "rr": 0.0}
    rack_displacement: float = 0.0
    loads: dict[str, float] = {"ax_g": 0.0, "ay_g": 0.0, "az_g": 0.0,
                               "brake_split_front": 0.5, "drive_split_rear": 1.0}
    arb_enabled: bool = True
    label: str = "modeler"
    solver: str | None = None    # "mw"/"mechanism" → DWB 机制求解；None 按 SOLVER_MODE
    sweep: SweepInline | None = None
    front_right: CornerHardpointsIn
    front_left: CornerHardpointsIn | None = None
    rear_right: CornerHardpointsIn | None = None
    rear_left: CornerHardpointsIn | None = None


@router.post("/solve/hardpoints")
def solve_hardpoints_v2(req: SolveInlineRequest):
    """交互建模专用：用请求内硬点直接求解四轮（P4 建模前端 / modeler.html）。

    与版本化 solve 不同：此端点不写 store、不计版本，仅用于交互式
    「拖拽/编辑硬点 → 实时结果」循环。左右/后轴缺省时由右前镜像生成
    （模板初始化语义 §5.1），但求解时按角独立计算。
    """
    from core.models import AxleHardpoints, CaseVersion, DesignVersion, WheelTravel

    tracks = {
        "front": float(req.front_right.tire.get("track_width", 1220.0)),
        "rear": float((req.rear_right or req.front_right).tire.get("track_width", 1180.0)),
    }
    # 完整整车参数：config.VEHICLE_PARAMS 为基底，再按当前轮距/轴距覆盖
    from config import VEHICLE_PARAMS as _VP
    veh = dict(_VP)
    veh["front_track_mm"] = tracks["front"]
    veh["rear_track_mm"] = tracks["rear"]

    def mk(points, tire):
        hp = AxleHardpoints(points=points, tire=tire)
        return hp

    fr = mk(req.front_right.points, req.front_right.tire)
    fl = mk(req.front_left.points, req.front_left.tire) if req.front_left else fr.mirrored()
    rr = mk(req.rear_right.points, req.rear_right.tire) if req.rear_right else fr.mirrored()
    rl = mk(req.rear_left.points, req.rear_left.tire) if req.rear_left else rr.mirrored()
    dv = DesignVersion(version=1, front_right=fr, front_left=fl,
                       rear_right=rr, rear_left=rl, vehicle=veh)
    cv = CaseVersion(
        version=1,
        travel=WheelTravel(**{k: float(req.travel.get(k, 0.0))
                              for k in ("fl", "fr", "rl", "rr")}),
        rack_displacement=float(req.rack_displacement),
        loads=_as_loads(req.loads),
        options=_as_options(req),
    )
    body = _solve_vehicle(dv, cv, design_id="inline", case_id=req.case_id,
                          solver=req.solver)
    body["label"] = req.label
    body["p1"] = _p1_metrics(dv, cv, body)
    if req.sweep is not None:
        if req.sweep.axle not in ("front", "rear") or \
           req.sweep.axis not in ("travel", "rack"):
            raise HTTPException(status_code=422, detail="sweep axle|axis bad")
        sw = _sweep_curves(dv, cv, req.sweep.axle, req.sweep.axis,
                           req.sweep.min, req.sweep.max, req.sweep.points,
                           absolute=True)
        sw["metrics"] = _sweep_metrics(dv, cv, req.sweep.axle, req.sweep.axis, sw,
                                       absolute=True)
        body["sweep"] = sw
    return body


def _as_loads(loads: dict):
    from core.models import LoadsInput
    return LoadsInput(
        ax_g=float(loads.get("ax_g", 0.0)),
        ay_g=float(loads.get("ay_g", 0.0)),
        az_g=float(loads.get("az_g", 0.0)),
        brake_split_front=float(loads.get("brake_split_front", 0.5)),
        drive_split_rear=float(loads.get("drive_split_rear", 1.0)),
    )


def _as_options(req: SolveInlineRequest):
    from core.models import CaseOptions
    return CaseOptions(arb_enabled=bool(req.arb_enabled))


# ---------- P4：A/B 对比 / 敏感性 / 导出 ----------

# ---------- Rig：四轮时域台架（7-DOF 动力学） ----------

def _band_status(band, v):
    """target band → green/yellow/red。band=(green_lo,green_hi,warn_lo,warn_hi)。"""
    if v is None:
        return None
    gl, gh, wl, wh = band

    def inside(a, b):
        return (a is None or v >= a) and (b is None or v <= b)
    if inside(gl, gh):
        return "green"
    if inside(wl, wh):
        return "yellow"
    return "red"


def _p1_metrics(dv, cv, body) -> dict:
    """P1 呈现补全：侧倾刚度 / 载荷转移分解 / 瞬心坐标 / ride 频率·阻尼 / 目标带。

    纯派生：复用 /solve/hardpoints 已算的 loads 与 per_wheel_geometry，+ 几何 MR。
    """
    veh = dv.vehicle
    tr_f = float(veh.get("front_track_mm", 0.0))
    tr_r = float(veh.get("rear_track_mm", 0.0))
    mr_f = _axle_motion_ratio(dv.front_right, cv.travel.fr, cv.rack_displacement,
                              tr_f, DEFAULT_FRAME_NODES) or 0.4
    mr_r = _axle_motion_ratio(dv.rear_right, cv.travel.rr, cv.rack_displacement,
                              tr_r, _rear_rocker_frame_nodes()) or 0.55
    k_spring_f = float(veh.get("k_spring_f", 26.0))
    k_spring_r = float(veh.get("k_spring_r", 47.0))
    k_arb_f = float(veh.get("k_arb_f", 0.0))
    k_arb_r = float(veh.get("k_arb_r", 0.0))
    k_f = compute_roll_stiffness_suspension(k_spring_f, mr_f, tr_f) + k_arb_f
    k_r = compute_roll_stiffness_suspension(k_spring_r, mr_r, tr_r) + k_arb_r
    k_tot = max(k_f + k_r, 1e-9)
    front_pct = 100.0 * k_f / k_tot

    # 载荷转移分解（轴级，来自 body.loads 每角 transfers）
    def tras(corner):
        t = ((body.get("loads") or {}).get(corner, {}).get("transfers") or {})
        return {k: round(float(t.get(k, 0.0)), 1) for k in
                ("lateral_total", "geometric", "elastic", "unsprung", "longitudinal")}

    # 瞬心坐标（侧视 SVIC + 主销 YZ IC），来自当前姿态球头
    def inst(corner_name, hp):
        g = (body.get("per_wheel_geometry") or {}).get(corner_name, {})
        bj = g.get("ball_joints") or {}
        up1, up2 = bj.get("upper"), bj.get("lower")
        if not up1 or not up2:
            return {"svic_x": None, "svic_z": None, "ic_y": None, "ic_z": None}
        p = svic_point(hp["CH1"], hp["CH2"], up1, hp["CH3"], hp["CH4"], up2)
        icp = compute_instant_center(hp, {"UP1": up1, "UP2": up2})
        return {
            "svic_x": round(p[0], 1) if p else None,
            "svic_z": round(p[1], 1) if p else None,
            "ic_y": round(icp[0], 1) if icp is not None else None,
            "ic_z": round(icp[1], 1) if icp is not None else None,
        }

    # ride 频率 / 阻尼
    m_total = float(veh.get("mass_kg", 280.0))
    frac = float(veh.get("front_axle_frac", 0.5))
    unsp = float(veh.get("unsprung_kg", 20.0))
    ms_f = sprung_mass_per_corner(m_total, frac, unsp)
    ms_r = sprung_mass_per_corner(m_total, max(1e-6, 1.0 - frac), unsp)
    c_damp = float(veh.get("c_damper_n_s_m", 2200.0))
    ride_f = ride_frequency_hz(k_spring_f, mr_f, ms_f)
    ride_r = ride_frequency_hz(k_spring_r, mr_r, ms_r)
    damp_f = damping_ratio(k_spring_f, mr_f, ms_f, c_damp)
    damp_r = damping_ratio(k_spring_r, mr_r, ms_r, c_damp)
    freq_ratio = (ride_r / ride_f) if ride_f > 1e-9 else None

    # 目标带评估（可算的动态/几何项）
    def band_out(key, label, value, unit=""):
        b = TARGET_BANDS.get(key)
        return {"key": key, "label": label, "value": (round(value, 3) if value is not None else None),
                "unit": unit, "status": _band_status(b, value) if b else None}
    targets = [
        band_out("ride_freq_f", "前轴固有频率", ride_f, "Hz"),
        band_out("ride_freq_r", "后轴固有频率", ride_r, "Hz"),
        band_out("damping_ratio_f", "前阻尼比", damp_f, ""),
        band_out("damping_ratio_r", "后阻尼比", damp_r, ""),
        band_out("motion_ratio_f", "前运动比", mr_f, ""),
        band_out("motion_ratio_r", "后运动比", mr_r, ""),
        band_out("load_transfer_f", "前轴横向转移占比", front_pct, "%"),
    ]

    return {
        "roll_stiffness": {"front": round(k_f, 1), "rear": round(k_r, 1),
                           "total": round(k_tot, 1), "front_pct": round(front_pct, 1)},
        "transfer": {"front": tras("front_right"), "rear": tras("rear_right")},
        "instant_center": {"front": inst("front_right", dict(dv.front_right.points)),
                           "rear": inst("rear_right", dict(dv.rear_right.points))},
        "ride": {"ride_freq_f_hz": round(ride_f, 3), "ride_freq_r_hz": round(ride_r, 3),
                 "damping_f": round(damp_f, 3), "damping_r": round(damp_r, 3),
                 "freq_ratio": round(freq_ratio, 3) if freq_ratio else None,
                 "mr_f": round(mr_f, 3), "mr_r": round(mr_r, 3)},
        "targets": targets,
        "note": "P1 派生：纯复用 /solve/hardpoints 已算结果 + 几何 MR。",
    }

class ExcitationIn(BaseModel):
    kind: str = "step"                 # step|sine|pulse
    amplitude_mm: float = 10.0
    freq_hz: float = 1.0
    duration_s: float = 3.0
    corners: list[str] = []            # 施加轮位；空=全部


class RigRequest(BaseModel):
    front_right: CornerHardpointsIn
    front_left: CornerHardpointsIn | None = None
    rear_right: CornerHardpointsIn | None = None
    rear_left: CornerHardpointsIn | None = None
    vehicle: dict = {}                 # bounce 参数覆盖（键名见 metrics.bounce.default_params）
    motion_ratio: dict[str, float] | None = None
    excitation: ExcitationIn = ExcitationIn()
    dt_s: float = 0.001
    ns: int = 10


@router.post("/rig")
def rig_v2(req: RigRequest):
    """四轮时域台架：全车 7-DOF（车身垂向·侧倾·俯仰 × 四角簧下），
    弹簧(分离压缩/拉伸阻尼)+缓冲块+轮胎垂向+路面 step/sine/pulse。
    运动比缺省由几何 rocker mini-sweep 求取，可显式传入覆盖。
    """
    from core.models import AxleHardpoints

    def _mk(points, tire):
        return AxleHardpoints(points=points, tire=tire)

    fr = _mk(req.front_right.points, req.front_right.tire)
    fl = _mk(req.front_left.points, req.front_left.tire) if req.front_left else fr.mirrored()
    rr = _mk(req.rear_right.points, req.rear_right.tire) if req.rear_right else fr.mirrored()
    rl = _mk(req.rear_left.points, req.rear_left.tire) if req.rear_left else rr.mirrored()
    tr_f = float(req.front_right.tire.get("track_width", 1220.0))
    tr_r = float((req.rear_right or req.front_right).tire.get("track_width", 1180.0))

    # 运动比：缺省几何；回退默认
    fallback = {"fl": 0.4, "fr": 0.4, "rl": 0.55, "rr": 0.55}
    if req.motion_ratio:
        mr = {k: float(v) for k, v in req.motion_ratio.items()}
    else:
        corners = [("fl", fl, tr_f, DEFAULT_FRAME_NODES),
                   ("fr", fr, tr_f, DEFAULT_FRAME_NODES),
                   ("rl", rl, tr_r, _rear_rocker_frame_nodes()),
                   ("rr", rr, tr_r, _rear_rocker_frame_nodes())]
        mr = {}
        for c, hp, track, fn in corners:
            v = _axle_motion_ratio(hp, 0.0, 0.0, track, fn)
            mr[c] = v if v and v > 0 else fallback[c]

    veh = dict(req.vehicle or {})
    veh.setdefault("front_track_mm", tr_f)
    veh.setdefault("rear_track_mm", tr_r)

    exc = {
        "kind": req.excitation.kind,
        "amplitude_mm": req.excitation.amplitude_mm,
        "freq_hz": req.excitation.freq_hz,
        "duration_s": req.excitation.duration_s,
    }
    res = bounce_simulate(veh, mr, exc, dt_s=req.dt_s, ns=req.ns,
                          corners=list(req.excitation.corners) or None)
    res["meta"]["track_mm"] = {"front": tr_f, "rear": tr_r}
    return res

# ---------- P5：稳态转向 / 整车调平 ----------

class HandlingRequest(BaseModel):
    design_id: str
    design_version: int | None = None
    case_id: str = "static"
    case_version: int | None = None
    ay_g: float = 1.0
    gamma_f_deg: float = 0.0
    gamma_r_deg: float = 0.0
    ride_mm: dict[str, float] = {"fl": 0.0, "fr": 0.0, "rl": 0.0, "rr": 0.0}
    motion_ratio: dict[str, float] | None = None      # 缺省用 rocker mini-sweep 几何 MR
    yaw_v_m_s: float = 15.0
    yaw_curve_v_max: float = 40.0
    brake_g: float = 0.0                              # 回正力矩工况的制动 g（选配制动分析）


@router.post("/handling")
def handling_v2(req: HandlingRequest):
    """P5 整车操稳（准静态）：understeer 分析 + K(a_y) 曲线 + 整车调平。

    四轮 Fz 来自 P5 载荷分布（含横向转移）；轮胎用简化魔毯方程（P5-1）。
    """
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(req.design_id, req.design_version)
        cv = store.get_case(req.case_id, req.case_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    veh = dv.vehicle

    # 几何 MR（缺省 rocker mini-sweep）
    tr_f = float(veh.get("front_track_mm", 1220.0))
    tr_r = float(veh.get("rear_track_mm", 1180.0))
    if req.motion_ratio is not None:
        mr = req.motion_ratio
    else:
        mr = {
            "fl": _axle_motion_ratio(dv.front_left, cv.travel.fl,
                                     cv.rack_displacement, tr_f, DEFAULT_FRAME_NODES) or 0.216,
            "fr": _axle_motion_ratio(dv.front_right, cv.travel.fr,
                                     cv.rack_displacement, tr_f, DEFAULT_FRAME_NODES) or 0.216,
            "rl": _axle_motion_ratio(dv.rear_left, cv.travel.rl,
                                     cv.rack_displacement, tr_r, _rear_rocker_frame_nodes()) or 0.25,
            "rr": _axle_motion_ratio(dv.rear_right, cv.travel.rr,
                                     cv.rack_displacement, tr_r, _rear_rocker_frame_nodes()) or 0.25,
        }

    # 防倾杆刚度：优先几何（扭杆 d/臂长/力臂）计算，否则回退 k_arb_f/r
    from metrics.arb_geometry import arb_geometry_from_vehicle
    kfk = arb_geometry_from_vehicle(veh, True)
    krk = arb_geometry_from_vehicle(veh, False)

    # 静态四轮 Fz（P3 分布；ay=0）——完整载荷闭环的基础
    try:
        static = distribute_vehicle_loads(
            veh, cv.loads, kfk, krk, 0.0, 0.0, 0.0)
    except (ValueError, TypeError, ZeroDivisionError):
        raise HTTPException(status_code=422, detail="无法计算静态载荷")
    fz0 = {k: static[k]["fz_n"] for k in
           ("front_right", "front_left", "rear_right", "rear_left")}
    fz0_sym = {"fl": fz0["front_left"], "fr": fz0["front_right"],
               "rl": fz0["rear_left"], "rr": fz0["rear_right"]}

    # 完整载荷闭环：滚转刚度（含几何 ARB）→ 每 ay 用完整分布
    kf_full = compute_roll_stiffness_suspension(
        float(veh.get("k_spring_f", 26.0)), mr["fr"], tr_f) + float(kfk or 0.0)
    kr_full = compute_roll_stiffness_suspension(
        float(veh.get("k_spring_r", 47.0)), mr["rr"], tr_r) + float(krk or 0.0)

    def full_fz(ay):
        """P3 完整四轮分布（几何/弹性/非簧载转移），闭环 understeer。"""
        from core.models import LoadsInput
        ld = LoadsInput(ay_g=float(ay), ax_g=0.0, az_g=0.0)
        d = distribute_vehicle_loads(veh, ld, kf_full, kr_full, 0.0, 0.0, 0.0)
        return {"fl": d["front_left"]["fz_n"], "fr": d["front_right"]["fz_n"],
                "rl": d["rear_left"]["fz_n"], "rr": d["rear_right"]["fz_n"]}

    fz_cur = full_fz(float(req.ay_g))
    ug = understeer_gradient(veh, fz_cur, float(req.ay_g),
                             req.gamma_f_deg, req.gamma_r_deg)
    curve = understeer_curve(veh, fz0_sym, ay_max=1.2, points=13,
                             gamma_f=req.gamma_f_deg, gamma_r=req.gamma_r_deg,
                             lateral_transfer=lambda f0, ay: full_fz(ay))

    # yaw 横摆动力学（线性单车模型，以当前 af/ar 向下取 Cα）
    from metrics.handling import yaw_analysis, yaw_gain_curve
    yaw = {}
    if ug.get("ca_f_n_per_deg") and ug.get("ca_r_n_per_deg"):
        yaw = yaw_analysis(veh, ug["ca_f_n_per_deg"], ug["ca_r_n_per_deg"],
                           req.yaw_v_m_s)
        yaw["gain_curve"] = yaw_gain_curve(veh, ug["ca_f_n_per_deg"],
                                           ug["ca_r_n_per_deg"],
                                           v_max_m_s=req.yaw_curve_v_max)

    # 转向回正（kingpin moment）：需前轮几何 trail/scrub
    kingpin = None
    try:
        ax0 = _solve_corner(dv.front_right, cv.travel.fr, cv.rack_displacement, tr_f)
        a_fr = ax0["angles"]
        trail_f = float(a_fr.get("caster_trail_mm", 0.0))
        scrub_f = float(a_fr.get("scrub_radius_mm", 0.0))
        fy_fl = fz_cur["fl"] * abs(req.ay_g) * 9.81 * float(veh.get("mass_kg", 0.0)) / (
            fz_cur["fl"] + fz_cur["fr"] + fz_cur["rl"] + fz_cur["rr"])
        fx_fl = -float(req.brake_g) * 9.81 * float(veh.get("mass_kg", 0.0)) * 0.5 / 2.0             if req.brake_g else 0.0
        from metrics.steering_metrics import align_moment_summary
        kingpin = align_moment_summary(
            trail_f, scrub_f, fy_fl, fy_fl,
            fx_fl, fx_fl, fz_cur["fl"] * 0.02, fz_cur["fr"] * 0.02)
        kingpin["geometry"] = {"trail_mm": round(trail_f, 3),
                               "scrub_mm": round(scrub_f, 3)}
    except Exception:  # noqa: BLE001
        kingpin = None

    # 整车调平（设计 ride 位形）
    ride = ride_level(veh, fz0_sym, mr, req.ride_mm)

    return {
        "design_id": req.design_id, "case_id": req.case_id,
        "ay_g": req.ay_g,
        "understeer": ug,
        "k_curve": {k: v for k, v in curve.items()},
        "yaw": yaw,
        "kingpin": kingpin,
        "ride_level": ride,
        "warnings": [f"操稳分析 at ay={req.ay_g}g: {ug['explanation']}"]
        if ug["status"] != "VALID" else [],
    }


class CompareRequest(BaseModel):
    design_a_id: str
    design_a_version: int | None = None
    design_b_id: str | None = None      # 缺省 = 同方案另一版本（版本回退对比）
    design_b_version: int | None = None
    case_id: str
    case_version: int | None = None
    axle: str = "front"
    sweep_points: int = 21
    sweep_min: float = -25.0
    sweep_max: float = 25.0


def _corner_metrics(body: dict) -> dict:
    out = {}
    for section in ("front", "rear"):
        for side in ("left", "right"):
            rep = body[section][side]
            name = f"{section}_{side}"
            out[name] = {
                "status": rep["status"],
                "angles": rep.get("angles") or {},
                "residual": body["residuals"].get(name),
            }
            if body.get("loads", {}).get(name):
                out[name]["loads"] = body["loads"][name]
    return out


def _hardpoint_diffs(dv_a, dv_b) -> dict:
    diffs = {}
    for corner in ("front_right", "front_left", "rear_right", "rear_left"):
        ha = getattr(dv_a, corner).points
        hb = getattr(dv_b, corner).points
        cd = {}
        for key in ha:
            if key in hb:
                d = [round(b - a, 4) for a, b in zip(ha[key], hb[key])]
                if any(abs(v) > 1e-9 for v in d):
                    cd[key] = d
        diffs[corner] = cd
    return diffs


@router.post("/compare")
def compare_v2(req: CompareRequest):
    """P4 方案 A/B 对比（同方案版本回退或跨方案）。

    输出：硬点差异（网格级）、指标差异（逐轮定位角）、杆件力差异（载荷层）、
    曲线叠加（travel 扫掠双侧）、双侧残差/状态（P4 残差/假设/状态展示）。
    """
    store = get_store()
    _ensure_seeded(store)
    try:
        dv_a = store.get_design(req.design_a_id, req.design_a_version)
        cv = store.get_case(req.case_id, req.case_version)
        if req.design_b_id and req.design_b_id != req.design_a_id:
            dv_b = store.get_design(req.design_b_id, req.design_b_version)
        else:
            dv_b = store.get_design(req.design_a_id, req.design_b_version or dv_a.version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    if req.axle not in ("front", "rear"):
        raise HTTPException(status_code=422, detail="axle must be front|rear")

    ba = solve_v2(SolveV2Request(design_id=req.design_a_id,
                                 design_version=dv_a.version,
                                 case_id=req.case_id,
                                 case_version=cv.version))
    bb = solve_v2(SolveV2Request(design_id=(req.design_b_id or req.design_a_id),
                                 design_version=dv_b.version,
                                 case_id=req.case_id,
                                 case_version=cv.version))

    ma, mb = _corner_metrics(ba), _corner_metrics(bb)
    metric_diffs: dict[str, dict] = {}
    force_diffs: dict[str, dict] = {}
    for name in ma:
        da, db = ma[name], mb[name]
        if da["angles"] and db["angles"]:
            ad = {k: (round(db["angles"][k] - da["angles"][k], 4)
                      if da["angles"].get(k) is not None
                      and db["angles"].get(k) is not None else None)
                  for k in da["angles"]}
            metric_diffs[name] = ad
        if da.get("loads") and db.get("loads") and da["loads"].get("wheel_end") and db["loads"].get("wheel_end"):
            mfa = da["loads"]["wheel_end"].get("member_forces") or {}
            mfb = db["loads"]["wheel_end"].get("member_forces") or {}
            if mfa and mfb:
                force_diffs[name] = {k: round(mfb[k] - mfa[k], 3) for k in mfa if k in mfb}

    sw_a = _sweep_curves(dv_a, cv, req.axle, "travel", req.sweep_min, req.sweep_max,
                         req.sweep_points)
    sw_b = _sweep_curves(dv_b, cv, req.axle, "travel", req.sweep_min, req.sweep_max,
                         req.sweep_points)

    return {
        "design_a": {"id": req.design_a_id, "version": dv_a.version},
        "design_b": {"id": req.design_b_id or req.design_a_id, "version": dv_b.version},
        "case_id": req.case_id,
        "status_a": {k: v["status"] for k, v in ma.items()},
        "status_b": {k: v["status"] for k, v in mb.items()},
        "vehicle_status": {"a": ba["status"], "b": bb["status"]},
        "hardpoint_diffs": {corner: diffs for corner, diffs in
                            _hardpoint_diffs(dv_a, dv_b).items() if diffs},
        "metric_diffs": metric_diffs,
        "force_diffs": force_diffs,
        "curve_overlay": {
            "values": sw_a["values"],
            "design_a": {k: v for k, v in sw_a["curves"].items()
                         if k not in ("motion_ratio",)},
            "design_b": {k: v for k, v in sw_b["curves"].items()
                         if k not in ("motion_ratio",)},
        },
        "residuals_a": ba["residuals"],
        "residuals_b": bb["residuals"],
        "warnings_a": ba["warnings"],
        "warnings_b": bb["warnings"],
    }


class SensitivityRequest(BaseModel):
    design_id: str
    design_version: int | None = None
    case_id: str
    case_version: int | None = None
    corner: str = "front_right"
    hardpoints: list[str] = ["UP1", "UP2", "CH1", "CH3"]
    metrics: list[str] = ["camber_deg", "toe_deg", "caster_deg", "kpi_deg",
                          "scrub_radius_mm", "caster_trail_mm"]
    delta_mm: float = 1.0


@router.post("/sensitivity")
def sensitivity_v2(req: SensitivityRequest):
    """P4 敏感性分析第一版：硬点 ±1mm → 重算 → 指标变化矩阵。

    对每个选定硬点的 x/y/z 各做 +delta 与 −delta 两次求解，
    输出 per_mm 灵敏度（Δmetric/Δhp），方向与强度，以及副作用
    （几何残差变化、状态变化）。不做黑盒自动优化。
    """
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(req.design_id, req.design_version)
        cv = store.get_case(req.case_id, req.case_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    if req.corner not in ("front_right", "front_left", "rear_right", "rear_left"):
        raise HTTPException(status_code=422, detail="bad corner")
    if not 0.0 < abs(req.delta_mm) <= 5.0:
        raise HTTPException(status_code=422, detail="delta_mm must be in (0, 5]")

    axle_hp = getattr(dv, req.corner)
    track = float(dv.vehicle.get("front_track_mm" if req.corner.startswith("front")
                                  else "rear_track_mm", 0.0))
    _tmap = {"front_right": "fr", "front_left": "fl",
             "rear_right": "rr", "rear_left": "rl"}
    travel = getattr(cv.travel, _tmap[req.corner])

    def solve_metric(hp_points):
        flat: dict[str, object] = {k: list(v) for k, v in hp_points.items()}
        flat.update(axle_hp.tire)
        flat["track_width"] = track
        return _solve_corner_flat(flat, travel, cv.rack_displacement, track, dv)

    # 基线
    base_pts = {k: list(v) for k, v in axle_hp.points.items()}
    base_sol = solve_metric(base_pts)
    if base_sol is None:
        raise HTTPException(status_code=500, detail="基线求解失败")
    base_angles = base_sol["angles"]
    base_residual = base_sol["residual"]

    sens: dict[str, dict] = {}
    for hpk in req.hardpoints:
        if hpk not in axle_hp.points:
            continue
        axes = ("x", "y", "z")
        entry: dict[str, dict] = {}
        for ai, axname in enumerate(axes):
            for dm in (req.delta_mm, -req.delta_mm):
                pts = {k: list(v) for k, v in axle_hp.points.items()}
                pts[hpk][ai] += dm
                sol = solve_metric(pts)
                if sol is None:
                    continue
                delta = {}
                for mk in req.metrics:
                    b = base_angles.get(mk)
                    v = sol["angles"].get(mk)
                    if b is not None and v is not None:
                        delta[mk] = round(v - b, 6)
                if delta:
                    per_mm = {mk: round(d / dm, 6) for mk, d in delta.items()}
                    entry[f"{axname}{'+' if dm > 0 else '-'}"] = {
                        "delta": {mk: round(d, 4) for mk, d in delta.items()},
                        "per_mm": per_mm,
                        "residual_delta_mm": round(sol["residual"] - base_residual, 6)
                        if sol["residual"] is not None and base_residual is not None else None,
                        "status": sol["status"].value,
                    }
            # 该轴 ± 平均灵敏度（正向强度）
        sens[hpk] = entry

    summary = {}
    for hpk, axes_entry in sens.items():
        per_axis = {}
        for axname in axes:
            pos = axes_entry.get(f"{axname}+")
            neg = axes_entry.get(f"{axname}-")
            if pos and neg:
                per_axis[axname] = {
                    mk: round((pos["per_mm"][mk] - neg["per_mm"][mk]) / 2.0, 6)
                    for mk in pos["per_mm"]
                }
        summary[hpk] = per_axis

    return {
        "design_id": req.design_id, "design_version": dv.version,
        "case_id": req.case_id, "corner": req.corner, "delta_mm": req.delta_mm,
        "baseline": {k: base_angles.get(k) for k in req.metrics},
        "baseline_residual_mm": base_residual,
        "sensitivity": sens,
        "summary_per_mm": summary,
        # 副作用：基线状态
        "baseline_status": base_sol["status"].value,
    }


def _solve_corner_flat(flat_hp: dict, travel: float, rack: float, track: float,
                       dv) -> dict | None:
    """用扁平 hp 求解一个角（sensitivity 用；含角级异常隔离）。"""
    try:
        ax = _solve_axle(flat_hp, travel, rack, mirror=False, polish=True)
        angles = {k: ax["angles_right"].get(k) for k in _ANGLE_KEYS}
        residual = float(ax.get("geometry_residual_mm", 0.0))
        return {"angles": angles, "residual": residual,
                "status": _status_for_residual(residual)}
    except Exception:  # noqa: BLE001
        return None


class ExportRequest(BaseModel):
    design_id: str
    design_version: int | None = None
    case_id: str
    case_version: int | None = None
    kind: str = "solve"        # solve | sweep
    format: str = "json"       # json | csv
    axle: str = "front"
    axis: str = "travel"
    min: float = -25.0
    max: float = 25.0
    points: int = 21


@router.post("/export")
def export_v2(req: ExportRequest):
    """P4 基础导出：solve 结果或 sweep 曲线转 JSON/CSV。"""
    import csv
    import io

    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(req.design_id, req.design_version)
        cv = store.get_case(req.case_id, req.case_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    if req.format not in ("json", "csv"):
        raise HTTPException(status_code=422, detail="format must be json|csv")

    if req.kind == "solve":
        body = solve_v2(SolveV2Request(design_id=req.design_id,
                                       design_version=dv.version,
                                       case_id=req.case_id,
                                       case_version=cv.version))
        if req.format == "json":
            return body
        # CSV：每轮一行，列 = 角度/载荷字段
        buf = io.StringIO()
        w = csv.writer(buf)
        header = ["corner", "status"]
        angle_keys = ["camber_deg", "toe_deg", "caster_deg", "kpi_deg",
                      "scrub_radius_mm", "caster_trail_mm"]
        load_keys = ["fx_n", "fy_n", "fz_n", "friction_util", "off_ground"]
        header += angle_keys + load_keys
        w.writerow(header)
        for section in ("front", "rear"):
            for side in ("left", "right"):
                name = f"{section}_{side}"
                rep = body[section][side]
                angles = rep.get("angles") or {}
                ld = body.get("loads", {}).get(name, {})
                w.writerow([name, rep["status"]]
                           + [angles.get(k, "") for k in angle_keys]
                           + [ld.get(k, "") for k in load_keys])
        return {"content_type": "text/csv",
                "filename": f"solve_{req.design_id}_v{dv.version}_{req.case_id}.csv",
                "data": buf.getvalue()}

    # sweep
    if req.axle not in ("front", "rear"):
        raise HTTPException(status_code=422, detail="axle must be front|rear")
    sw = _sweep_curves(dv, cv, req.axle, req.axis, req.min, req.max, req.points)
    if req.format == "json":
        return {"design_id": req.design_id, "case_id": req.case_id,
                "axle": req.axle, "axis": req.axis,
                "values": sw["values"], "curves": sw["curves"],
                "warnings": sw["warnings"]}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["value"] + list(sw["curves"].keys()))
    for i, v in enumerate(sw["values"]):
        w.writerow([v] + [sw["curves"][k][i] if i < len(sw["curves"][k]) else ""
                          for k in sw["curves"]])
    return {"content_type": "text/csv",
            "filename": f"sweep_{req.design_id}_{req.case_id}_{req.axle}_{req.axis}.csv",
            "data": buf.getvalue()}


@router.post("/solve")
def solve_v2(req: SolveV2Request):
    """四轮统一 VehicleResult（P2-1）：从 store 取方案+工况求解。

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
    if req.settle_ride:
        cv = _settle_case(dv, cv, req.ride_mm)
    return _solve_vehicle(dv, cv, req.design_id, req.case_id)


def _settle_case(dv, cv, ride_mm=None):
    """P5 调平闭环：把工况轮跳基准平移到调平位形。

    ride_mm（缺省 0）来自 /handling ride_level（含 roll/pitch 姿态）；
    travel_i = case.travel_i + ride_mm[i]。忽略 dv（占位保持统一签名）。
    """
    from core.models import WheelTravel
    r = ride_mm or {}
    cv2 = cv.model_copy(deep=True)
    cv2.travel = WheelTravel(
        fl=cv.travel.fl + float(r.get("fl", 0.0)),
        fr=cv.travel.fr + float(r.get("fr", 0.0)),
        rl=cv.travel.rl + float(r.get("rl", 0.0)),
        rr=cv.travel.rr + float(r.get("rr", 0.0)))
    return cv2


def _solve_vehicle(dv, cv, design_id: str = "", case_id: str = "",
                   solver: str | None = None):
    """用给定的 DesignVersion + CaseVersion 求解四轮 VehicleResult。

    design_id/case_id 仅用于返回的响应标识（内联求解可传入空或自定义标签）。
    """
    veh = dv.vehicle
    t = cv.travel
    warnings: list[str] = []
    residuals: dict[str, float | None] = {}
    reports: dict[str, WheelReport] = {}
    geometry: dict[str, WheelPose | None] = {}
    sols: dict[str, dict] = {}

    corners = [
        ("front_right", dv.front_right, t.fr, veh.get("front_track_mm", 0.0)),
        ("front_left", dv.front_left, t.fl, veh.get("front_track_mm", 0.0)),
        ("rear_right", dv.rear_right, t.rr, veh.get("rear_track_mm", 0.0)),
        ("rear_left", dv.rear_left, t.rl, veh.get("rear_track_mm", 0.0)),
    ]
    for name, axle_hp, travel, track in corners:
        try:
            sol = _solve_corner(axle_hp, travel, cv.rack_displacement, track,
                                solver=solver)
            angles = sol["angles"]
            residual = sol["residual"]
            status = sol["status"]
            pose = sol["pose"]
            sols[name] = sol
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

    # P3 载荷层（工况启用 compute_wheel_forces 且四轮几何齐备时）
    loads: dict[str, dict] = {}
    pose_labels = cv.derived_pose(veh.get("front_track_mm", 1200.0),
                                  veh.get("rear_track_mm", 1200.0),
                                  veh.get("wheelbase_mm", 1550.0))
    if cv.options.compute_wheel_forces and len(sols) == 4:
        try:
            loads = _compute_vehicle_loads(dv, cv, sols, veh,
                                           float(pose_labels.get("roll_deg", 0.0)))
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"载荷计算不可用: {type(exc).__name__}")
        if not loads:
            warnings.append("载荷计算不可用：几何 Motion Ratio/轮距缺失，"
                            "每轮载荷未计算（显式非 None 空白）")
        else:
            for name, ld in loads.items():
                if ld.get("off_ground"):
                    warnings.append(f"{name}: 垂向载荷 Fz={ld['fz_n']:.1f}N≤0，"
                                    "车轮离地（P3 离地警告）")
                if (cv.options.friction_check and not ld.get("off_ground")
                        and ld.get("friction_util", 0.0) > 1.0):
                    warnings.append(f"{name}: 摩擦圆利用率 "
                                    f"{ld['friction_util']:.2f} > 1.0，轮胎饱和")

    result = VehicleResult(
        design_id=design_id or "", design_version=dv.version,
        case_id=case_id or "", case_version=cv.version,
        solver=SOLVER_NAME,
        status=_worst_status(r.status for r in reports.values()),
        front=AxleResults(left=reports["front_left"], right=reports["front_right"]),
        rear=AxleResults(left=reports["rear_left"], right=reports["rear_right"]),
        per_wheel_geometry=geometry,
        residuals=residuals,
        solver_status={name: reports[name].status.value for name in reports},
        pose_labels=pose_labels,
        warnings=warnings,
        loads=loads,
    )
    return result.model_dump()
