"""/api/v3 业务服务层（S2）：DWB 硬点 → 引擎机构 → 工况扫掠 → 曲线 + 增益。

坐标系与前端 `dwb-pro-fullchassis.html` 一致：X = 外侧（右轮 +X）/ Y = 向前 / Z = 上。
硬点命名映射（前端 DWB 名 → 引擎机构点）：
    LCA_F→CH1  LCA_R→CH2  UCA_F→CH3  UCA_R→CH4
    LBJ→UP1    UBJ→UP2    TRO→UP3    STRUT_OUT→UP4  WC→UP5
    RACK→FL1   STRUT_IN→CH5
    RCK_AX_A→RK_PIVOT   RCK_DMP→RK_DAMPER   DMP_BODY→DAMPER_CHASSIS

基线硬点（DWB 命名）取自前端 PRESETS["前悬架 (推杆 Pushrod 架构)"]，
与 S1 测试常量 PRO_POINTS 同源（数值一致）。
"""
from __future__ import annotations

import math
import time

import numpy as np

from src.api.v3models import (
    BushingSpec, CaseLoad, DesignSpec, KandcRequest, KandcResponse, PoseRequest,
    PoseResponse,
)
from src.components.bushing import Bushing6DOF, Curve
from src.solver.compliance import solve_compliance_full
from src.solver.forces import QSLoad
from src.solver.mechanism.models import build_mechanism
from src.solver.mechanism.solver import solve_pose

R2D = 180.0 / math.pi

# ── 前端 DWB 命名 → 引擎机构点 ───────────────────────────────────────
DWB_TO_ENGINE = {
    "LCA_F": "CH1", "LCA_R": "CH2", "UCA_F": "CH3", "UCA_R": "CH4",
    "LBJ": "UP1", "UBJ": "UP2", "TRO": "UP3", "STRUT_OUT": "UP4", "WC": "UP5",
    "RACK": "FL1", "STRUT_IN": "CH5",
    "RCK_AX_A": "RK_PIVOT", "RCK_DMP": "RK_DAMPER", "DMP_BODY": "DAMPER_CHASSIS",
}
ENGINE_TO_DWB = {v: k for k, v in DWB_TO_ENGINE.items()}
_ENGINE_KEYS = tuple(DWB_TO_ENGINE.values())

# ── 缺省基线（前端 PRESETS 前悬架推杆 / S1 PRO_POINTS 同源） ─────────
DEFAULT_DWB_POINTS: dict[str, list[float]] = {
    "LCA_F": [240.0, 180.0, 145.0], "LCA_R": [240.0, -160.0, 155.0],
    "LBJ": [730.0, 10.0, 165.0], "UCA_F": [360.0, 140.0, 380.0],
    "UCA_R": [360.0, -130.0, 390.0], "UBJ": [675.0, -15.0, 455.0],
    "WC": [810.0, 0.0, 320.0], "TRO": [685.0, -145.0, 205.0],
    "RACK": [269.2, -165.0, 198.1],
    "STRUT_OUT": [683.4, 12.0, 205.5],
    "RCK_AX_A": [305.3, 20.0, 366.4], "RCK_AX_B": [306.1, 90.0, 365.0],
    "STRUT_IN": [324.4, 57.9, 445.6], "RCK_DMP": [234.8, 60.0, 385.0],
    "DMP_BODY": [29.3, 60.1, 181.1],
}


def mirror_left(points: dict[str, list[float]]) -> dict[str, list[float]]:
    """左侧镜像：X（外侧轴）取负。"""
    return {k: [-p[0], p[1], p[2]] for k, p in points.items()}


def to_engine_points(points: dict[str, list[float]]) -> dict[str, np.ndarray]:
    """DWB 命名 → 引擎机构点 dict（含 frame 节点）。"""
    out: dict[str, np.ndarray] = {}
    for dwb, eng in DWB_TO_ENGINE.items():
        out[eng] = np.asarray(points[dwb], dtype=float)
    # 摇臂轴用 RCK_AX_A 单点（S1 引擎 solve_rocker 固定绕 X 轴，OpenItem：精确轴方向）
    return out


def make_bushings(specs: list[BushingSpec],
                  points: dict[str, list[float]]) -> dict[str, Bushing6DOF]:
    """BushingSpec 列表 → 引擎 Bushing6DOF 集合（member_nodes = 引擎锚点）。"""
    out: dict[str, Bushing6DOF] = {}
    for s in specs:
        eng = DWB_TO_ENGINE[s.node]
        anchor = np.asarray(points[s.node], dtype=float)
        b = Bushing6DOF(
            name=s.name, anchor=anchor.copy(),
            kT=[Curve("linear", k=k) for k in s.kT],
            kR=[Curve("linear", k=k) for k in s.kR],
            cT=[0.0] * 3, cR=[0.0] * 3, preload=np.asarray(s.preload, dtype=float),
        )
        b.member_nodes = [eng]
        b.member_p0 = {eng: anchor.copy()}
        out[s.name] = b
    return out


def _qsload(c: CaseLoad) -> QSLoad:
    return QSLoad(fx=c.fx, fy=c.fy, fz=c.fz, mx=c.mx, my=c.my, mz=c.mz)


def _lerp3(a, b, t):
    return a + (b - a) * t


def _isect2(p1, d1, p2, d2):
    """2D 直线交点（与前端 isect2 一致），返回 (x, z) 或 None。"""
    denom = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(denom) < 1e-12:
        return None
    t = p2 - p1
    s = (t[0] * d2[1] - t[1] * d2[0]) / denom
    return p1 + s * d1


def _axis_at_y(a, b, y):
    t = (y - a[1]) / ((b[1] - a[1]) or 1e-9)
    return _lerp3(a, b, t)


def _wheel_axis(design: DesignSpec) -> np.ndarray:
    """设计位轮轴（前端同款：axW = [cos(toe)cos(cam), sin(toe), -sin(cam)]）。"""
    cam = design.camber_deg * math.pi / 180.0
    toe = design.toe_deg * math.pi / 180.0
    v = np.array([math.cos(toe) * math.cos(cam), math.sin(toe), -math.sin(cam)])
    return v / (float(np.linalg.norm(v)) or 1.0)


_KNUCKLE_IDS = ["UP1", "UP2", "UP3", "UP4", "UP5"]


def _estimate_rotation(m) -> np.ndarray:
    """最小二乘姿态估计（Kabsch/SVD）：knuckle 设计位 → 当前位 的旋转矩阵。

    引擎求解器只输出节点位置（distance-only 约束），不输出刚体四元数；
    轮轴等 knuckle 标签方向须由姿态估计恢复（前端由四元数直接给出）。
    """
    A = np.stack([m.node(k).p0 for k in _KNUCKLE_IDS])
    B = np.stack([m.node(k).pos for k in _KNUCKLE_IDS])
    c0, c1 = A.mean(0), B.mean(0)
    H = (B - c1).T @ (A - c0)
    u, _s, vt = np.linalg.svd(H)
    R = u @ vt
    if np.linalg.det(R) < 0.0:
        vt[-1] *= -1.0
        R = u @ vt
    return R


def pose_metrics(m, tire_R: float, design: DesignSpec) -> dict:
    """从已求解机构提取定位指标（与前端 metrics() 同数学，纯 numpy 重写）。"""
    P = {k: m.node(k).pos for k in _ENGINE_KEYS}
    wc, lbj, ubj = P["UP5"], P["UP1"], P["UP2"]
    ax = _estimate_rotation(m) @ _wheel_axis(design)

    cam = -math.asin(float(np.clip(ax[2], -1.0, 1.0))) * R2D
    toe = math.atan2(float(ax[1]), float(ax[0])) * R2D

    # 接地点：沿主销轴水平投影（前端同款）
    z_hat = np.array([0.0, 0.0, 1.0])
    rad = z_hat - ax * float(np.dot(z_hat, ax))
    rn = float(np.linalg.norm(rad)) or 1e-12
    rad = rad / rn
    cp = wc - rad * tire_R

    dz = float(ubj[2] - lbj[2]) or 1e-9
    kpi = math.atan2(-(ubj[0] - lbj[0]), dz) * R2D
    cast = math.atan2(-(ubj[1] - lbj[1]), dz) * R2D
    t0 = (float(cp[2]) - float(ubj[2])) / dz
    kg = _lerp3(ubj, lbj, t0)
    scrub = float(cp[0]) - float(kg[0])
    trail = float(kg[1]) - float(cp[1])

    # 侧倾中心高度（侧视瞬心 → 接地点垂线交点）
    lp = _axis_at_y(P["CH1"], P["CH2"], float(wc[1]))
    up = _axis_at_y(P["CH3"], P["CH4"], float(wc[1]))
    ic = _isect2(np.array([lp[0], lp[2]]), np.array([lbj[0] - lp[0], lbj[2] - lp[2]]),
                 np.array([up[0], up[2]]), np.array([ubj[0] - up[0], ubj[2] - up[2]]))
    rc_h = None
    if ic is not None:
        r = _isect2(np.array([cp[0], cp[2]]), np.array([ic[0] - cp[0], ic[1] - cp[2]]),
                    np.array([0.0, 0.0]), np.array([0.0, 1.0]))
        if r is not None:
            rc_h = float(r[1])

    damper = float(np.linalg.norm(P["RK_DAMPER"] - P["DAMPER_CHASSIS"]))
    return {
        "cam": cam, "toe": toe, "kpi": kpi, "cast": cast,
        "scrub": scrub, "trail": trail, "rc_h": rc_h,
        "damper": damper, "wc_x": float(wc[0]), "wc_z": float(wc[2]),
    }


def _new_mech(points: dict[str, list[float]], *, left: bool = False):
    eng = to_engine_points(points)
    sa = np.array([0.0, -1.0, 0.0]) if left else np.array([0.0, 1.0, 0.0])
    return build_mechanism(eng, wheel="UP5", tie_outer="UP3", tie_inner="FL1",
                           pushrod_from="UP4", pushrod_to="CH5", steer_axis=sa)


def _solve_point(points, bushings, case: CaseLoad, travel: float, rack: float,
                 tire_R: float, design: DesignSpec):
    """单点求解：有衬套走 K&C 全链路，无衬套走纯运动学。返回 (metrics, status, warn)。"""
    mech = _new_mech(points)
    if bushings:
        res = solve_compliance_full(mech, bushings=bushings, case=_qsload(case),
                                    travel=travel, rack=rack)
        status = res.status
        warn = [] if status in ("VALID", "APPROXIMATE") else [f"compliance status={status}"]
        return pose_metrics(mech, tire_R, design), status, warn, res
    rep = solve_pose(mech, travel, rack)
    status = "VALID" if rep.ok else "SOLVER_FAILED"
    warn = [] if rep.ok else [f"kinematics residual {rep.residual:.3f} mm > 0.02"]
    return pose_metrics(mech, tire_R, design), status, warn, None


def _gains_from_curves(x: list[float], y: dict[str, list[float]], axis_key: str) -> dict:
    """中心差分增益表（复用 S1 metrics/kandc.py 的斜率约定）。"""
    from src.metrics.kandc import (bump_steer_deg_per_25, camber_gain_deg_per_25,
                                   compliance_toe_deg, _slope)
    gains: dict[str, float] = {}
    if "cam" in y:
        gains["camber_gain_deg_per_25"] = camber_gain_deg_per_25(y["cam"], x, at=0.0)
    if "toe" in y:
        gains["bump_steer_deg_per_25"] = bump_steer_deg_per_25(y["toe"], x, at=0.0)
    if "damper" in y and "wheel" in y:
        tr = y["wheel"]
        gains["mr_at_0"] = round(float(_slope([-d for d in y["damper"]], tr, 0.0)), 6)
    if "toe" in y and axis_key in ("force", "rack"):
        gains["toe_gain_per_unit"] = round(float(_slope(y["toe"], x, 0.0)), 6)
    return gains


# ── 四工况 ───────────────────────────────────────────────────────────

def run_bump(req: KandcRequest) -> KandcResponse:
    points = req.points or DEFAULT_DWB_POINTS
    bushings = make_bushings(req.bushings, points) if req.bushings else {}
    t0 = time.perf_counter()
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"travel": [round(float(v), 4) for v in xs]}
    statuses: set[str] = set()
    warnings: list[str] = []
    for tr in xs:
        m, st, warn, _ = _solve_point(points, bushings, req.case, float(tr), 0.0,
                                      req.tire_radius, req.design)
        statuses.add(st)
        warnings.extend(warn)
        for k, v in m.items():
            curves.setdefault(k, []).append(None if v is None else round(float(v), 6))
    # mr：damper 对 travel 的数值导数（-dL/dt，前端同款）
    trav = curves["travel"]
    dmp = curves["damper"]
    curves["mr"] = []
    for k in range(len(trav)):
        k0, k1 = max(0, k - 1), min(len(trav) - 1, k + 1)
        dt = trav[k1] - trav[k0] or 1e-9
        curves["mr"].append(round(-(dmp[k1] - dmp[k0]) / dt, 6))
    curves["wheel"] = trav
    gains = _gains_from_curves(trav, {**curves, "wheel": trav}, "travel")
    if any(v is not None for v in curves["rc_h"]):
        rc = [v for v in curves["rc_h"] if v is not None]
        if rc:
            gains["rc_migration_mm"] = round(float(np.max(rc) - np.min(rc)), 2)
    delta = None
    if bushings:
        _, _, _, res = _solve_point(points, bushings, req.case, 0.0, 0.0,
                                    req.tire_radius, req.design)
        if res is not None and res.delta:
            delta = {k: [round(float(v), 6) for v in d] for k, d in res.delta.items()}
    return KandcResponse(
        case="bump", status=_merge_status(statuses), ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains, bushing_deltas=delta,
        warnings=list(dict.fromkeys(warnings))[:8],
    )


def run_roll(req: KandcRequest) -> KandcResponse:
    """侧倾扫掠：右轮 +t / 左轮 −t（track_width 换算 roll_deg）。"""
    points_r = req.points or DEFAULT_DWB_POINTS
    points_l = mirror_left(points_r)
    bush_r = make_bushings(req.bushings, points_r) if req.bushings else {}
    bush_l = make_bushings(req.bushings, points_l) if req.bushings else {}
    t0 = time.perf_counter()
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"travel": [], "roll_deg": []}
    statuses: set[str] = set()
    warnings: list[str] = []
    for t in xs:
        roll_deg = math.degrees(math.atan2(2.0 * t, req.track_width))
        ml, sl, wl, _ = _solve_point(points_l, bush_l, req.case, float(-t), 0.0,
                                     req.tire_radius, req.design)
        mr, sr, wr, _ = _solve_point(points_r, bush_r, req.case, float(t), 0.0,
                                     req.tire_radius, req.design)
        statuses.update((sl, sr))
        warnings.extend(wl + wr)
        curves["travel"].append(round(float(t), 4))
        curves["roll_deg"].append(round(float(roll_deg), 5))
        for k in ("cam", "toe", "cast", "kpi", "scrub", "trail"):
            curves.setdefault(f"{k}_r", []).append(round(float(mr[k]), 6))
            curves.setdefault(f"{k}_l", []).append(round(float(ml[k]), 6))
    gains: dict[str, float] = {}
    rd = curves["roll_deg"]
    if rd[-1] != rd[0]:
        gains["roll_camber_gain_deg_per_deg"] = round(
            float(_slope(curves["cam_r"], rd, 0.0)), 6)
        gains["roll_steer_gain_deg_per_deg"] = round(
            float(_slope(curves["toe_r"], rd, 0.0)), 6)
    return KandcResponse(
        case="roll", status=_merge_status(statuses), ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains,
        warnings=list(dict.fromkeys(warnings))[:8],
    )


def run_steer(req: KandcRequest) -> KandcResponse:
    """转向扫掠：rack 位移扫掠，travel=0。"""
    points = req.points or DEFAULT_DWB_POINTS
    bushings = make_bushings(req.bushings, points) if req.bushings else {}
    t0 = time.perf_counter()
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"rack": [round(float(v), 4) for v in xs]}
    statuses: set[str] = set()
    warnings: list[str] = []
    for rk in xs:
        m, st, warn, _ = _solve_point(points, bushings, req.case, 0.0, float(rk),
                                      req.tire_radius, req.design)
        statuses.add(st)
        warnings.extend(warn)
        for k in ("cam", "toe", "cast", "kpi", "scrub", "trail"):
            curves.setdefault(k, []).append(round(float(m[k]), 6))
    curves["steer"] = [-v for v in curves["toe"]]
    gains = _gains_from_curves(xs.tolist(), curves, "rack")
    return KandcResponse(
        case="steer", status=_merge_status(statuses), ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains, warnings=list(dict.fromkeys(warnings))[:8],
    )


def run_compliance(req: KandcRequest) -> KandcResponse:
    """力 Compliance 扫掠：沿 compliance_axis（fx|fy|mz）扫力，travel=rack=0。

    无衬套时纯几何 → toe 不变（Compliance 位移为空），结果如实标注警告。
    """
    points = req.points or DEFAULT_DWB_POINTS
    bushings = make_bushings(req.bushings, points) if req.bushings else {}
    t0 = time.perf_counter()
    if not bushings:
        warnings = ["无衬套定义：Compliance 位移为 0（纯几何），请传入 bushings 列表"]
    else:
        warnings = []
    xs = np.linspace(req.sweep.min, req.sweep.max, req.sweep.n)
    curves: dict[str, list] = {"force": [round(float(v), 4) for v in xs]}
    statuses: set[str] = set()
    delta_last: dict[str, list] | None = None
    for f in xs:
        case = req.case.model_copy(deep=True)
        if req.compliance_axis == "fx":
            case.fx = float(f)
        elif req.compliance_axis == "fy":
            case.fy = float(f)
        else:
            case.mz = float(f)
        m, st, warn, res = _solve_point(points, bushings, case, 0.0, 0.0,
                                        req.tire_radius, req.design)
        statuses.add(st)
        warnings.extend(warn)
        for k in ("cam", "toe", "cast", "kpi", "scrub", "trail", "damper"):
            curves.setdefault(k, []).append(round(float(m[k]), 6))
        if res is not None and res.delta:
            delta_last = {k: [round(float(v), 6) for v in d] for k, d in res.delta.items()}
    gains: dict[str, float] = {}
    if len(xs) >= 2:
        from src.metrics.kandc import compliance_toe_deg
        gains["compliance_toe_deg_per_kn"] = compliance_toe_deg(
            curves["toe"], xs.tolist(), at=0.0)
        gains["compliance_camber_deg_per_kn"] = round(
            1000.0 * float(np.interp(0.0 + 2.0, xs, curves["cam"])
                           - np.interp(0.0 - 2.0, xs, curves["cam"])) / 4.0, 6)
    return KandcResponse(
        case="compliance", status=_merge_status(statuses),
        ms=(time.perf_counter() - t0) * 1000.0,
        curves=curves, gains=gains, bushing_deltas=delta_last,
        warnings=list(dict.fromkeys(warnings))[:8],
    )


def run_pose(req: PoseRequest) -> PoseResponse:
    points = req.points or DEFAULT_DWB_POINTS
    bushings = make_bushings([], points)
    t0 = time.perf_counter()
    mech = _new_mech(points)
    rep = solve_pose(mech, req.travel, req.rack)
    m = pose_metrics(mech, req.tire_radius, req.design)
    pose = {k: [round(float(v), 6) for v in mech.node(k).pos] for k in _ENGINE_KEYS}
    rocker = None
    if rep.rocker_ok and rep.damper_len is not None:
        rocker = {
            "damper_len_mm": round(float(rep.damper_len), 4),
            "rocker_theta_rad": round(float(rep.rocker_theta), 6),
        }
    return PoseResponse(
        status="VALID" if rep.ok else "SOLVER_FAILED",
        ms=(time.perf_counter() - t0) * 1000.0,
        residual_mm=round(float(rep.residual), 6),
        travel=req.travel, rack=req.rack, pose=pose,
        metrics={k: (None if v is None else round(float(v), 6)) for k, v in m.items()},
        rocker=rocker,
        warnings=[] if rep.ok else [f"kinematics residual {rep.residual:.3f} mm"],
    )


def _merge_status(statuses: set[str]) -> str:
    if "SOLVER_FAILED" in statuses or "COMPLIANCE_DIVERGED" in statuses:
        return "SOLVER_FAILED" if "SOLVER_FAILED" in statuses else "COMPLIANCE_DIVERGED"
    if "APPROXIMATE" in statuses:
        return "APPROXIMATE"
    return "VALID"


def _slope(y, x, at: float) -> float:
    """中心差分斜率（与 metrics/kandc._slope 同款，供本模块内部用）。"""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    if len(x) < 2:
        return 0.0
    return float(np.interp(at + 2.0, x, y) - np.interp(at - 2.0, x, y)) / 4.0