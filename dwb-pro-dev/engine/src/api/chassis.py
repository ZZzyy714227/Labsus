"""/api/v3 整车分析业务层（S2-5）。

四角装配（FR/FL/RR/RL）：
- FR = vehicle.front.points（右轮，X=外侧）；FL = 镜像（x→−x）+ steer_axis 反号；
- RR = vehicle.rear.points；RL = 镜像。
每角用引擎机制求解器（solve_pose）出定位角；准静态载荷转移严格镜像
单文件版 solveQuasiStatic 公式（三路径解耦 + 稳态侧倾角 + TLLTD）。

坐标系与前端一致：X=外侧 / Y=向前 / Z=向上；轮跳正 = 压缩。
"""
from __future__ import annotations

import math
import time

import numpy as np

from src.api.v3models import (
    AxleSpec, ChassisLoads, ChassisPoseResponse, ChassisRequest, ChassisSweepResponse,
    CornerTravel, DesignSpec, QuasiInputs, VehicleSpec,
)
from src.api.v3service import _new_mech, mirror_left, pose_metrics
from src.solver.mechanism.solver import solve_pose

R2D = 180.0 / math.pi
D2R = math.pi / 180.0
G = 9.81

CORNER_KEYS = ("FL", "FR", "RL", "RR")


def make_corners(vehicle: VehicleSpec) -> dict[str, dict]:
    """四角装配：返回 {角名: {points, left: bool}}。"""
    f_r = vehicle.front.points
    r_r = vehicle.rear.points
    return {
        "FR": {"points": f_r, "left": False},
        "FL": {"points": mirror_left(f_r), "left": True},
        "RR": {"points": r_r, "left": False},
        "RL": {"points": mirror_left(r_r), "left": True},
    }


def corner_pose(ax: AxleSpec, points: dict, travel: float, rack: float,
                left: bool) -> tuple[dict, float, list[str]]:
    """单角求解：返回 (metrics, residual, warnings)。"""
    mech = _new_mech(points, left=left) if left else _new_mech(points)
    rep = solve_pose(mech, travel, rack)
    m = pose_metrics(mech, ax.tire_radius,
                     DesignSpec(camber_deg=ax.camber_deg, toe_deg=ax.toe_deg))
    warn = [] if rep.ok else [f"{'L' if left else 'R'} corner residual {rep.residual:.3f} mm"]
    m["residual"] = float(rep.residual)
    return m, float(rep.residual), warn


def mr_at_zero(ax: AxleSpec, points: dict, left: bool) -> float:
    """MR@0：damper 对轮跳的中心差分导数（-ΔL/Δtravel，±2mm）。"""
    mech = _new_mech(points, left=left) if left else _new_mech(points)
    try:
        solve_pose(mech, 2.0, 0.0)
        d1 = mech.node("RK_DAMPER").pos - mech.node("DAMPER_CHASSIS").pos
        lp = float(np.linalg.norm(d1))
        mech2 = _new_mech(points, left=left) if left else _new_mech(points)
        solve_pose(mech2, -2.0, 0.0)
        d2 = mech2.node("RK_DAMPER").pos - mech2.node("DAMPER_CHASSIS").pos
        lm = float(np.linalg.norm(d2))
        return max(0.05, -(lp - lm) / 4.0)
    except Exception:
        return 0.75


def arb_geom(points: dict, arb) -> dict:
    """横向稳定杆几何（镜像前端 arbGeom，全部用设计位硬点）。"""
    F = np.asarray(points["LCA_F"], float)
    B = np.asarray(points["LBJ"], float)
    t = arb.t
    P0 = F + (B - F) * t
    xa = float(P0[0])
    ay = float(F[1] + arb.dy)
    az = float(F[2] + arb.dz)
    a = ay - float(P0[1])
    E0 = np.array([xa, ay - a, az])
    ldl = float(np.linalg.norm(E0 - P0))
    P = F + (B - F) * t
    A = ay - float(P[1])
    Bz = az - float(P[2])
    R = math.hypot(A, Bz)
    K = (xa - float(P[0])) ** 2 + A * A + Bz * Bz + a * a - ldl * ldl
    denom = 2 * a * R
    c = float(np.clip(K / (denom if abs(denom) > 1e-9 else 1e-9), -1.0, 1.0))
    f0 = math.atan2(Bz, A)
    sg = 1.0 if math.atan2(az - float(P0[2]), ay - float(P0[1])) >= 0 else -1.0
    psi = f0 - sg * math.acos(c)
    E = np.array([xa, ay - a * math.cos(psi), az - a * math.sin(psi)])
    return {"xa": xa, "ay": ay, "az": az, "a": a, "ldl": ldl, "P": P,
            "P0": P0, "E": E, "psi": psi}


def arb_rate(ax: AxleSpec) -> dict:
    """稳定杆扭转刚度 → 等效侧倾刚度系数（镜像前端 arbRate，mrArb=0.55 常量）。"""
    d = ax.arb.d
    if d <= 0.5:
        return {"k": 0.0, "J": 0.0, "kt": 0.0}
    J = math.pi * d ** 4 / 32.0
    g = arb_geom(ax.points, ax.arb)
    L = 2 * g["xa"]
    kt = ax.arb.G * J / L
    mr_arb = 0.55
    k = kt / (g["a"] * g["a"]) * mr_arb * mr_arb
    return {"k": k, "J": J, "kt": kt, "a": g["a"], "L": L}


def quasi_loads(vehicle: VehicleSpec, q: QuasiInputs,
                mr: dict[str, float], rcH: dict[str, float]) -> ChassisLoads:
    """准静态载荷转移（严格镜像单文件版 solveQuasiStatic）。"""
    wb = vehicle.wheelbase_mm
    L = wb / 1000.0
    mS = vehicle.sprung_mass_kg
    mT = vehicle.mass_kg
    mU_f = vehicle.front.unsprung_kg * 2
    mU_r = vehicle.rear.unsprung_kg * 2

    f_ms = vehicle.front.spring_mass_kg
    r_ms = vehicle.rear.spring_mass_kg
    b = L * (r_ms / (f_ms + r_ms))
    a = L - b

    tf = (abs(vehicle.front.points["WC"][0]) * 2) / 1000.0
    tr = (abs(vehicle.rear.points["WC"][0]) * 2) / 1000.0
    huf = vehicle.front.tire_radius / 1000.0
    hur = vehicle.rear.tire_radius / 1000.0
    hs = vehicle.hs_mm / 1000.0

    zrc_f = (rcH.get("FR") or 45.0) / 1000.0
    zrc_r = (rcH.get("RR") or 65.0) / 1000.0
    hra = zrc_f + (a / L) * (zrc_r - zrc_f)
    hArm = max(0.05, hs - hra)

    mrF = mr.get("front") or 0.75
    mrR = mr.get("rear") or 0.78
    kwF = vehicle.front.spring_rate * 1000.0 * mrF * mrF
    kwR = vehicle.rear.spring_rate * 1000.0 * mrR * mrR

    arF = arb_rate(vehicle.front)
    arR = arb_rate(vehicle.rear)
    kphi_arb_f = arF["k"] * 1000.0 * tf * tf / 2.0
    kphi_arb_r = arR["k"] * 1000.0 * tr * tr / 2.0

    kphi_f = 0.5 * kwF * tf * tf + kphi_arb_f
    kphi_r = 0.5 * kwR * tr * tr + kphi_arb_r
    kphi_tot = kphi_f + kphi_r

    F_aero = q.aero_force_n
    Fzf0 = mS * G * (b / L) + mU_f * G + F_aero * q.aero_bias
    Fzr0 = mS * G * (a / L) + mU_r * G + F_aero * (1 - q.aero_bias)

    ay = q.gy * G
    ax = q.gx * G

    denom = kphi_tot - mS * G * hArm
    roll_rad = (mS * ay * hArm) / denom if denom > 100 else 0.0
    roll_deg = roll_rad * R2D
    roll_grad = ((mS * G * hArm) / denom) * R2D if denom > 100 else 0.0

    dFz_u_f = mU_f * ay * (huf / tf)
    dFz_u_r = mU_r * ay * (hur / tr)
    dFz_geo_f = (mS * ay * (b / L)) * (zrc_f / tf)
    dFz_geo_r = (mS * ay * (a / L)) * (zrc_r / tr)
    dFz_elas_f = (kphi_f * roll_rad) / tf
    dFz_elas_r = (kphi_r * roll_rad) / tr
    dFz_f_tot = dFz_u_f + dFz_geo_f + dFz_elas_f
    dFz_r_tot = dFz_u_r + dFz_geo_r + dFz_elas_r

    sum_transfer = dFz_f_tot + dFz_r_tot
    tlltd = (dFz_f_tot / sum_transfer) * 100 if sum_transfer > 1 else 50.0
    dFz_long = (mT * ax * (vehicle.hcg_mm / 1000.0)) / L

    sgn_y = 1.0 if q.gy >= 0 else -1.0
    fz = {
        "FL": max(0.0, (Fzf0 - dFz_long) / 2 - dFz_f_tot * sgn_y),
        "FR": max(0.0, (Fzf0 - dFz_long) / 2 + dFz_f_tot * sgn_y),
        "RL": max(0.0, (Fzr0 + dFz_long) / 2 - dFz_r_tot * sgn_y),
        "RR": max(0.0, (Fzr0 + dFz_long) / 2 + dFz_r_tot * sgn_y),
    }
    return ChassisLoads(
        roll_deg=roll_deg, roll_grad_deg_per_g=roll_grad,
        kphi_f=kphi_f * D2R, kphi_r=kphi_r * D2R, kphi_tot=kphi_tot * D2R,
        arb_share_f=(kphi_arb_f / kphi_f) * 100 if kphi_f > 0 else 0,
        arb_share_r=(kphi_arb_r / kphi_r) * 100 if kphi_r > 0 else 0,
        dFz_u_f=dFz_u_f, dFz_geo_f=dFz_geo_f, dFz_elas_f=dFz_elas_f, dFz_f_tot=dFz_f_tot,
        dFz_u_r=dFz_u_r, dFz_geo_r=dFz_geo_r, dFz_elas_r=dFz_elas_r, dFz_r_tot=dFz_r_tot,
        dFz_long=dFz_long, tlltd_pct=tlltd, fz={k: round(float(v), 2) for k, v in fz.items()},
    )


def solve_chassis(req: ChassisRequest) -> ChassisPoseResponse:
    """整车单点：四角运动学 + 姿态 + 准静态载荷。"""
    t0 = time.perf_counter()
    corners = make_corners(req.vehicle)
    tr = req.travel
    trav = {"FL": tr.fl, "FR": tr.fr, "RL": tr.rl, "RR": tr.rr}
    pose: dict[str, dict] = {}
    warnings: list[str] = []
    statuses: set[str] = set()
    rcH: dict[str, float] = {}
    # MR：显式参数优先；缺省用前端同源常量（SIM.mrRefF||0.75 / mrRefR||0.78）。
    # 注：引擎 STRUT_OUT 固定于 knuckle 刚体（前端挂 LCA/UCA 铰链），拓扑差异使
    # 引擎数值推导 MR 失真（实测 3.98 vs 前端 0.75）→ 采用前端常量回退（OpenItem）。
    mr_f = req.vehicle.front.motion_ratio if req.vehicle.front.motion_ratio is not None else 0.75
    mr_r = req.vehicle.rear.motion_ratio if req.vehicle.rear.motion_ratio is not None else 0.78
    mr = {"front": round(mr_f, 4), "rear": round(mr_r, 4)}

    for key in CORNER_KEYS:
        ax = req.vehicle.front if key in ("FL", "FR") else req.vehicle.rear
        c = corners[key]
        m, res, warn = corner_pose(ax, c["points"], trav[key],
                                   req.rack if key in ("FL", "FR") else 0.0, c["left"])
        statuses.add("VALID" if res < 0.02 else "SOLVER_FAILED")
        warnings.extend(warn)
        out = {k: (None if v is None else round(float(v), 6))
               for k, v in m.items() if k != "residual"}
        out["residual"] = round(res, 6)
        pose[key] = out
        if m["rc_h"] is not None:
            rcH[key] = float(m["rc_h"])

    loads = quasi_loads(req.vehicle, req.quasi, mr, rcH)
    attitude = _attitude(trav, req.vehicle)
    return ChassisPoseResponse(
        status="SOLVER_FAILED" if "SOLVER_FAILED" in statuses else "VALID",
        ms=(time.perf_counter() - t0) * 1000.0,
        pose=pose, attitude=attitude, loads=loads, mr=mr,
        warnings=list(dict.fromkeys(warnings))[:8],
    )


def _attitude(trav: dict[str, float], vehicle: VehicleSpec) -> dict[str, float]:
    """由四轮轮跳推导整车姿态（heave/roll/pitch，同 core/models derived_pose）。"""
    t = trav
    heave = (t["FL"] + t["FR"] + t["RL"] + t["RR"]) / 4.0
    track_avg = (abs(vehicle.front.points["WC"][0]) * 2
                 + abs(vehicle.rear.points["WC"][0]) * 2) / 2.0
    roll = math.degrees(math.atan2(((t["FL"] + t["RL"]) - (t["FR"] + t["RR"])) / 2.0,
                                   track_avg))
    pitch = math.degrees(math.atan2(((t["FL"] + t["FR"]) - (t["RL"] + t["RR"])) / 2.0,
                                    vehicle.wheelbase_mm))
    return {"heave_mm": round(heave, 4), "roll_deg": round(roll, 4),
            "pitch_deg": round(pitch, 4)}


def _merged_status(ss: set[str]) -> str:
    return "SOLVER_FAILED" if "SOLVER_FAILED" in ss else "VALID"


def sweep_bump(req: ChassisRequest) -> ChassisSweepResponse:
    """整车平行轮跳扫掠：四轮同向 ±travel。"""
    from src.metrics.kandc import bump_steer_deg_per_25, camber_gain_deg_per_25

    t0 = time.perf_counter()
    corners = make_corners(req.vehicle)
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"travel": [round(float(v), 4) for v in xs]}
    statuses: set[str] = set()
    warnings: list[str] = []
    for t in xs:
        for key in CORNER_KEYS:
            ax = req.vehicle.front if key in ("FL", "FR") else req.vehicle.rear
            c = corners[key]
            m, res, warn = corner_pose(ax, c["points"], float(t), 0.0, c["left"])
            statuses.add("VALID" if res < 0.02 else "SOLVER_FAILED")
            warnings.extend(warn)
            for kk in ("cam", "toe"):
                curves.setdefault(f"{kk}_{key}", []).append(round(float(m[kk]), 6))
    gains: dict[str, float] = {}
    for side, key in (("front", "FR"), ("rear", "RR")):
        gains[f"camber_gain_{side}"] = camber_gain_deg_per_25(
            curves[f"cam_{key}"], curves["travel"], at=0.0)
        gains[f"bump_steer_{side}"] = bump_steer_deg_per_25(
            curves[f"toe_{key}"], curves["travel"], at=0.0)
    return ChassisSweepResponse(
        case="bump", status=_merged_status(statuses),
        ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains, warnings=list(dict.fromkeys(warnings))[:8],
    )


def sweep_roll(req: ChassisRequest) -> ChassisSweepResponse:
    """整车侧倾扫掠：左轮 −t / 右轮 +t（前后同幅）。"""
    t0 = time.perf_counter()
    corners = make_corners(req.vehicle)
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"travel": [], "roll_deg": []}
    statuses: set[str] = set()
    warnings: list[str] = []
    track_avg = (abs(req.vehicle.front.points["WC"][0]) * 2
                 + abs(req.vehicle.rear.points["WC"][0]) * 2) / 2.0
    for t in xs:
        roll_deg = math.degrees(math.atan2(2.0 * t, track_avg))
        curves["travel"].append(round(float(t), 4))
        curves["roll_deg"].append(round(float(roll_deg), 5))
        for key, tt in (("FL", -t), ("FR", t), ("RL", -t), ("RR", t)):
            ax = req.vehicle.front if key in ("FL", "FR") else req.vehicle.rear
            c = corners[key]
            m, res, warn = corner_pose(ax, c["points"], float(tt), 0.0, c["left"])
            statuses.add("VALID" if res < 0.02 else "SOLVER_FAILED")
            warnings.extend(warn)
            for kk in ("cam", "toe"):
                curves.setdefault(f"{kk}_{key}", []).append(round(float(m[kk]), 6))
    gains: dict[str, float] = {}
    rd = curves["roll_deg"]
    if rd and abs(rd[-1] - rd[0]) > 1e-9:
        for side, key in (("front", "FR"), ("rear", "RR")):
            gains[f"roll_camber_gain_{side}"] = round(float(
                _slope(curves[f"cam_{key}"], rd, 0.0)), 6)
            gains[f"roll_steer_{side}"] = round(float(
                _slope(curves[f"toe_{key}"], rd, 0.0)), 6)
    return ChassisSweepResponse(
        case="roll", status=_merged_status(statuses),
        ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains, warnings=list(dict.fromkeys(warnings))[:8],
    )


def sweep_steer(req: ChassisRequest) -> ChassisSweepResponse:
    """整车转向扫掠：rack 位移扫描（前轴两轮；后轮 rack=0）。"""
    t0 = time.perf_counter()
    corners = make_corners(req.vehicle)
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"rack": [round(float(v), 4) for v in xs]}
    statuses: set[str] = set()
    warnings: list[str] = []
    for rk in xs:
        for key in ("FL", "FR"):
            ax = req.vehicle.front
            c = corners[key]
            m, res, warn = corner_pose(ax, c["points"], 0.0, float(rk), c["left"])
            statuses.add("VALID" if res < 0.02 else "SOLVER_FAILED")
            warnings.extend(warn)
            for kk in ("cam", "toe"):
                curves.setdefault(f"{kk}_{key}", []).append(round(float(m[kk]), 6))
    gains: dict[str, float] = {}
    if len(xs) >= 2:
        gains["steer_toe_gain_deg_per_mm"] = round(
            float(np.interp(0.0 + 2.0, xs, curves["toe_FR"])
                  - np.interp(0.0 - 2.0, xs, curves["toe_FR"])) / 4.0, 6)
    return ChassisSweepResponse(
        case="steer", status=_merged_status(statuses),
        ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains, warnings=list(dict.fromkeys(warnings))[:8],
    )


def _slope(y, x, at: float) -> float:
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    if len(x) < 2:
        return 0.0
    return float(np.interp(at + 2.0, x, y) - np.interp(at - 2.0, x, y)) / 4.0