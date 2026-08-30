"""/api/v3 整车分析业务层（S2-5；quasi 内核 P0 统一 2026-08-22）。

四角装配（FR/FL/RR/RL）：
- FR = vehicle.front.points（右轮，X=外侧）；FL = 镜像（x→−x）+ steer_axis 反号；
- RR = vehicle.rear.points；RL = 镜像。
每角用引擎机制求解器（solve_pose）出定位角；准静态载荷转移与前端
solveQuasiStatic 同一内核（侧倾耦合迭代 3 轮：rc_h 引擎扫掠迁移 +
kw 前端曲线迁移 → 三路径解耦 + TLLTD 随 gy 单调变化）。

坐标系与前端一致：X=外侧 / Y=向前 / Z=向上；轮跳正 = 压缩。
"""
from __future__ import annotations

import bisect
import math
import threading
import time

import numpy as np

from src.api.v3models import (
    AxleSpec, ChassisLoads, ChassisPoseResponse, ChassisRequest, ChassisSweepResponse,
    CornerTravel, DesignSpec, QuasiInputs, VehicleSpec,
)
from src.api.v3service import _new_mech, mirror_left, pose_metrics
from src.metrics.kandc import _slope  # F-13：单一差分内核（全局共用）
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
    """单角求解：返回 (metrics, residual, warnings)。P2：arch→strut 附着拓扑。"""
    mech = _new_mech(points, left=left, arch=ax.arch)
    rep = solve_pose(mech, travel, rack)
    m = pose_metrics(mech, ax.tire_radius,
                     DesignSpec(camber_deg=ax.camber_deg, toe_deg=ax.toe_deg))
    warn = [] if rep.ok else [f"{'L' if left else 'R'} corner residual {rep.residual:.3f} mm"]
    m["residual"] = float(rep.residual)
    return m, float(rep.residual), warn


def mr_at_zero(ax: AxleSpec, points: dict, left: bool) -> float:
    """MR@0：damper 对轮跳的中心差分导数绝对值（|ΔL/Δtravel|，±2mm）。

    P2（2026-08-22）：依赖 rocker 真实三维轴 + strut_attach（ax.arch）；
    旧固定 X 轴下压缩侧摇臂无解 → RK_DAMPER 不更新 → ±2mm 差分失真（3.98）。

    MR 取绝对值：下游仅用 mr²（kw=kS·mr²、kphi∝mr²），符号无关。符号在
    pullrod/uca 布局可为负（压缩行程减振器伸长，实测后轴 -0.167），若不加
    abs 会被旧 max(0.05) 地板掩盖。分支/数值与前端 mrRef 常量的差距
    （前 0.47 vs 0.75、后 0.17 vs 0.78）登记 OpenItem-B：摇臂双根分支选择
    （最近根 vs 投影全局解）与 FE 弹簧力平衡分支的差异。

    F-67（2026-08-30）：不再吞异常 —— 任一姿态求解失败即抛出让调用方
    _resolve_mr 统一兜底（此前 except 静默返回 0.75，后轴也被回退到前轴
    常量）；同时检查 solve_pose 的 rep.ok，失败解的 damper 长度不再进 MR。
    """
    mech = _new_mech(points, left=left, arch=ax.arch)
    rep1 = solve_pose(mech, 2.0, 0.0)
    if not rep1.ok:
        raise RuntimeError(f"mr_at_zero: +2mm pose 残差 {rep1.residual:.3f}mm > 0.02")
    d1 = mech.node("RK_DAMPER").pos - mech.node("DAMPER_CHASSIS").pos
    lp = float(np.linalg.norm(d1))
    mech2 = _new_mech(points, left=left, arch=ax.arch)
    rep2 = solve_pose(mech2, -2.0, 0.0)
    if not rep2.ok:
        raise RuntimeError(f"mr_at_zero: -2mm pose 残差 {rep2.residual:.3f}mm > 0.02")
    d2 = mech2.node("RK_DAMPER").pos - mech2.node("DAMPER_CHASSIS").pos
    lm = float(np.linalg.norm(d2))
    return max(0.02, abs(-(lp - lm) / 4.0))


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


_RC_SWEEP_CACHE: dict[tuple, dict] = {}
_RC_SWEEP_LOCK = threading.Lock()  # F-70：FastAPI 端点跑线程池，缓存读写加锁


def axle_rc_sweep(ax: AxleSpec, lim: float = 90.0, n: int = 21) -> dict:
    """单轴 rc_h-行程扫掠（右轮机构，rack=0）——侧倾耦合迭代用。

    rc_h 只依赖双叉臂几何（CH1-4 / LBJ / UBJ / WC），不受 STRUT_OUT 拓扑
    影响，引擎可权威计算（对比：damper 链 MR 在引擎拓扑下失真，kw 迁移
    改由前端 kw_curve 下发）。按轴参数缓存，重复 solve 免重算。

    F-70（2026-08-30）：dict 淘汰/写入此前无锁（CPython 下竞态良性但
    非零风险）；加锁保证并发的 Hit/Miss 与 LRU 淘汰原子化。
    """
    key = (tuple(sorted((k, tuple(map(float, v))) for k, v in ax.points.items())),
           float(ax.tire_radius), float(ax.camber_deg), float(ax.toe_deg),
           ax.arch, float(lim), int(n))
    with _RC_SWEEP_LOCK:
        hit = _RC_SWEEP_CACHE.get(key)
        if hit is not None:
            return hit
    mech = _new_mech(ax.points, arch=ax.arch)
    design = DesignSpec(camber_deg=ax.camber_deg, toe_deg=ax.toe_deg)
    xs = [float(v) for v in np.linspace(-lim, lim, n)]
    rc: list[float | None] = []
    for t in xs:
        solve_pose(mech, t, 0.0)
        m = pose_metrics(mech, ax.tire_radius, design)
        rc.append(None if m["rc_h"] is None else float(m["rc_h"]))
    out = {"travel": xs, "rc_h": rc}
    with _RC_SWEEP_LOCK:
        if len(_RC_SWEEP_CACHE) > 16:
            _RC_SWEEP_CACHE.pop(next(iter(_RC_SWEEP_CACHE)))
        _RC_SWEEP_CACHE[key] = out
    return out


def _interp_fb(xs: list[float], ys: list, x: float, fb: float) -> float:
    """线性插值 + 端点钳位（镜像前端 sampleSweep）；任一邻点 None → 回退 fb。"""
    if x <= xs[0]:
        return ys[0] if ys[0] is not None else fb
    if x >= xs[-1]:
        return ys[-1] if ys[-1] is not None else fb
    i = bisect.bisect_right(xs, x)
    y0, y1 = ys[i - 1], ys[i]
    if y0 is None or y1 is None:
        return fb
    t = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) or 1e-9)
    return float(y0 + (y1 - y0) * t)


def _kw_at(ax: AxleSpec, tr: float, kw0_nm: float) -> float:
    """轮端刚度 @行程（N/m）：kw_curve 插值（N/mm→N/m）优先，否则常数 kw0。"""
    cur = ax.kw_curve
    if cur is None:
        return kw0_nm
    v = _interp_fb(cur.travel, cur.kw, tr, math.nan)
    if v is None or not math.isfinite(v) or v <= 0:
        return kw0_nm
    return v * 1000.0


def quasi_loads(vehicle: VehicleSpec, q: QuasiInputs,
                mr: dict[str, float], rcH: dict[str, float],
                rc_sw: dict[str, dict],
                warnings: list[str] | None = None) -> ChassisLoads:
    """准静态载荷转移 —— 侧倾耦合迭代（镜像前端 solveQuasiStatic 修复版）。

    3 轮迭代：每轮由当前侧倾角解外侧（压缩侧）轮行程差 dt=roll·半轮距 →
    rc_h 取引擎扫掠在 dt 处值（GEO 项随行程迁移）、kw 取 ±dt 处均值
    （ELA 项迁移，kw_curve 优先否则常数）→ 更新前后侧倾刚度 → 重解侧倾角。
    迁移后三路径不再与 ay 线性齐次 → TLLTD 随 gy 真实单调变化。

    warnings：可选收集列表（F-16：侧倾失稳时显式上报而非静默置零）。
    """
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

    ay = q.gy * G
    ax = q.gx * G

    # 初值/回退（F-15，2026-08-30）：`or 45.0` 会吞掉合法 0 值（侧倾中心恰在
    # 地面）；改为仅对 None/NaN/非正回退。MR≤0 物理退化（摇臂失效）仍走回退。
    _zf = rcH.get("FR")
    _zr = rcH.get("RR")
    zrc_f0 = _zf if (_zf is not None and math.isfinite(_zf)) else 45.0
    zrc_r0 = _zr if (_zr is not None and math.isfinite(_zr)) else 65.0
    zrc_f, zrc_r = zrc_f0 / 1000.0, zrc_r0 / 1000.0

    _mf = mr.get("front")
    _mrr = mr.get("rear")
    mrF = _mf if (_mf is not None and math.isfinite(_mf) and _mf > 0.05) else 0.75
    mrR = _mrr if (_mrr is not None and math.isfinite(_mrr) and _mrr > 0.05) else 0.78
    kw_f0 = vehicle.front.spring_rate * 1000.0 * mrF * mrF   # N/m
    kw_r0 = vehicle.rear.spring_rate * 1000.0 * mrR * mrR

    arF = arb_rate(vehicle.front)
    arR = arb_rate(vehicle.rear)
    kphi_arb_f = arF["k"] * 1000.0 * tf * tf / 2.0
    kphi_arb_r = arR["k"] * 1000.0 * tr * tr / 2.0

    kphi_f = 0.5 * kw_f0 * tf * tf + kphi_arb_f
    kphi_r = 0.5 * kw_r0 * tr * tr + kphi_arb_r
    kphi_tot = kphi_f + kphi_r
    roll_rad = 0.0

    swf, swr = rc_sw["front"], rc_sw["rear"]
    half_f = abs(vehicle.front.points["WC"][0])   # mm
    half_r = abs(vehicle.rear.points["WC"][0])
    _roll_unstable = False
    for _ in range(3):
        hra = zrc_f + (a / L) * (zrc_r - zrc_f)
        h_arm = max(0.05, hs - hra)
        denom = kphi_tot - mS * G * h_arm
        if denom > 100:
            roll_rad = (mS * ay * h_arm) / denom
        else:
            # 第 9 讲失稳判据：kphi_tot ≤ mS·g·h_arm（P-Δ 几何负刚度）→ 侧倾发散。
            # 防线保留（讲义钦定），但 F-16：显式上报，不再静默置零。
            _roll_unstable = True
            roll_rad = 0.0
        dt_f = roll_rad * half_f    # 侧倾角×半轮距 = 轮行程差 mm
        dt_r = roll_rad * half_r
        zrc_f = _interp_fb(swf["travel"], swf["rc_h"], dt_f, zrc_f0) / 1000.0
        zrc_r = _interp_fb(swr["travel"], swr["rc_h"], dt_r, zrc_r0) / 1000.0
        kwf = (_kw_at(vehicle.front, dt_f, kw_f0) + _kw_at(vehicle.front, -dt_f, kw_f0)) / 2.0
        kwr = (_kw_at(vehicle.rear, dt_r, kw_r0) + _kw_at(vehicle.rear, -dt_r, kw_r0)) / 2.0
        kphi_f = 0.5 * kwf * tf * tf + kphi_arb_f
        kphi_r = 0.5 * kwr * tr * tr + kphi_arb_r
        kphi_tot = kphi_f + kphi_r

    hra = zrc_f + (a / L) * (zrc_r - zrc_f)
    h_arm = max(0.05, hs - hra)
    denom = kphi_tot - mS * G * h_arm
    if denom > 100:
        roll_rad = (mS * ay * h_arm) / denom
        roll_grad = ((mS * G * h_arm) / denom) * R2D
    else:
        _roll_unstable = True
        roll_rad = 0.0
        roll_grad = 0.0
    if warnings is not None and _roll_unstable:
        warnings.append(
            "侧倾失稳：kphi_tot ≤ mS·g·h_arm（P-Δ 几何负刚度，第 9 讲判据），"
            "侧倾角置零——本工况载荷转移结果不可信")
    roll_deg = roll_rad * R2D

    F_aero = q.aero_force_n
    Fzf0 = mS * G * (b / L) + mU_f * G + F_aero * q.aero_bias
    Fzr0 = mS * G * (a / L) + mU_r * G + F_aero * (1 - q.aero_bias)

    dFz_u_f = mU_f * ay * (huf / tf)
    dFz_u_r = mU_r * ay * (hur / tr)
    dFz_geo_f = (mS * ay * (b / L)) * (zrc_f / tf)
    dFz_geo_r = (mS * ay * (a / L)) * (zrc_r / tr)
    dFz_elas_f = (kphi_f * roll_rad) / tf
    dFz_elas_r = (kphi_r * roll_rad) / tr
    dFz_f_tot = dFz_u_f + dFz_geo_f + dFz_elas_f
    dFz_r_tot = dFz_u_r + dFz_geo_r + dFz_elas_r

    sum_transfer = dFz_f_tot + dFz_r_tot
    # F-09（2026-08-30）：`sum_transfer > 1` 使左转（gy<0，sum<0）恒显示 50%。
    # 改 |sum|>1；50% 占位仅用于 ay≈0（讲义第九讲钦定约定，保留）。
    tlltd = (dFz_f_tot / sum_transfer) * 100 if abs(sum_transfer) > 1 else 50.0
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


def _resolve_mr_fb(ax: AxleSpec, points: dict, is_front: bool,
                   warnings: list[str]) -> tuple[float, bool]:
    """MR 三路优先级（F-19/F-67）：显式参数 > mr_at_zero 数值推导 > 分轴常量。

    返回 (mr, 是否回退常量)。回退常量分轴（前 0.75 / 后 0.78——旧实现恒
    0.75 使后轴也吃到前轴常量），且异常原因随 warning 上报（不再静默吞）。
    """
    if ax.motion_ratio is not None:
        return round(float(ax.motion_ratio), 4), False
    try:
        v = round(mr_at_zero(ax, points, False), 4)
        return v, False
    except Exception as exc:  # noqa: BLE001
        c = 0.75 if is_front else 0.78
        warnings.append(f"MR compute failed for {'front' if is_front else 'rear'}: "
                        f"{exc.__class__.__name__} {exc} → 回退常量 {c}")
        return c, True


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
    # MR 链（P2，2026-08-22；F-67 提取模块级）：显式参数 > 引擎数值推导
    # mr_at_zero（rocker 真实三维轴 + strut_attach 对齐后恢复可信）> 前端
    # 同源常量回退（SIM.mrRefF||0.75 / mrRefR||0.78，仅解算异常时使用）。
    mr_f, _fb_f = _resolve_mr_fb(req.vehicle.front, req.vehicle.front.points,
                                 is_front=True, warnings=warnings)
    mr_r, _fb_r = _resolve_mr_fb(req.vehicle.rear, req.vehicle.rear.points,
                                 is_front=False, warnings=warnings)
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

    rc_sw = {"front": axle_rc_sweep(req.vehicle.front),
             "rear": axle_rc_sweep(req.vehicle.rear)}
    # 守恒记账检查（2026-08-22）：hs 与 hcg 是独立输入，若
    # (mS·hs + mU·hu)/mT ≠ hcg，轴转移之和与整车力矩公式不严格闭合（第 9 讲发现）。
    v_ = req.vehicle
    h_weighted = (v_.sprung_mass_kg * v_.hs_mm
                  + v_.front.unsprung_kg * 2 * v_.front.tire_radius
                  + v_.rear.unsprung_kg * 2 * v_.rear.tire_radius) / v_.mass_kg
    if abs(h_weighted - v_.hcg_mm) > 20.0:
        warnings.append(f"hs/hcg 记账不自洽：加权高度 {h_weighted:.0f}mm vs hcg "
                        f"{v_.hcg_mm:.0f}mm（载荷转移之和与整车公式将有偏差）")
    loads = quasi_loads(req.vehicle, req.quasi, mr, rcH, rc_sw, warnings=warnings)
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