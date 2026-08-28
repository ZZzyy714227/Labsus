"""Full-car 7-DOF bounce rig (时域动力学台架, 四轮版).

Tracks a four-wheel suspension as a classic full-car ride model in the
vertical plane:

    body (rigid): heave  z_c, roll  phi (about X, + right down), pitch theta
    unsprung:      4 x wheel-centre heave  z_u,i

Suspension is lumped at the wheel using wheel-rate factors (motion ratio²):
    k_w = k_spring * MR²        c_w = c_damper * MR²   (comp/rebound split)
plus bilinear bump-stop (compression beyond travel) and tire vertical spring
with damping + road penetration. ARB provides roll stiffness between a wheel
pair on the same axle.

Units: mm, s, N, kg, N/mm, N·s/mm, g = 9810 mm/s². Convention: heave + up,
roll φ (+ right down), pitch θ (+ nose up). Perturbation about the static
equilibrium (spring preload carries sprung weight, tire carries total), so
gravity is absorbed and no explicit g-term is needed in the ODEs.

Solver: semi-implicit (symplectic) Euler with NS substeps per recorded frame
for numerical stability at the stiff tire natural frequency.
"""
from __future__ import annotations

import math

import numpy as np

G = 9810.0  # mm/s²

# corner index order: fl=0, fr=1, rl=2, rr=3
_CORNERS = ["fl", "fr", "rl", "rr"]
_Y_SIGN = {"fl": -1.0, "fr": 1.0, "rl": -1.0, "rr": 1.0}      # right = +
_AXLE = {"fl": "f", "fr": "f", "rl": "r", "rr": "r"}


def default_params() -> dict:
    """指示性 FSAE 整车参数（N/mm 系基准）。"""
    return {
        "ms_total_kg": 200.0,       # 簧上总质量
        "front_axle_frac": 0.48,    # 前轴簧上质量占比
        "unsprung_kg": 8.0,         # 每轮簧下质量（可被 axle 细分覆盖）
        "k_spring_f_nmm": 26.0,
        "k_spring_r_nmm": 47.0,
        "c_comp_f_nsm": 1.2,        # 减振器压缩阻尼  N·s/mm
        "c_reb_f_nsm": 2.4,         # 减振器拉伸阻尼  N·s/mm
        "c_comp_r_nsm": 1.5,
        "c_reb_r_nsm": 3.0,
        "k_bs_nmm": 3.0,            # 缓冲块刚度（力 = k_bs·x²/20）
        "bs_comp_up_mm": 25.0,      # 超过该压缩量触发缓冲块（+）
        "tire_k_nmm": 150.0,
        "tire_c_nsm": 0.3,          # 轮胎垂向阻尼 N·s/mm
        "k_arb_f_nmm_rad": 0.0,     # 防倾杆滚刚度 N·mm/rad（前）
        "k_arb_r_nmm_rad": 0.0,     # 防倾杆滚刚度 N·mm/rad（后）
        "front_track_mm": 1220.0,
        "rear_track_mm": 1180.0,
        "wheelbase_mm": 1550.0,
    }


def wheel_rate(k_spring_nmm: float, mr: float) -> float:
    return k_spring_nmm * mr * mr


def prepare(vehicle: dict | None, mr: dict) -> tuple[dict, dict]:
    """由外层 vehicle 字典 + 每角运动比，导出台架参数与四角几何量。

    返回 (params, geo)：
      geo = {corner: {yx: 半轮距, xx: 相对质心纵向距, ms: 角簧上质量,
                      ku: 轮率, k_t, cN:
                      c_comp, c_reb, q0(静延伸), d0(静轮胎挠度)}}。
    """
    p = default_params()
    if vehicle:
        for k in p:
            if k in vehicle and vehicle[k] is not None:
                p[k] = float(vehicle[k])

    tf = p["front_track_mm"] / 2.0
    tr = p["rear_track_mm"] / 2.0
    wb = p["wheelbase_mm"]
    mf = p["ms_total_kg"] * p["front_axle_frac"]
    mr_total = p["ms_total_kg"]
    Lf = wb * p["front_axle_frac"]       # CG → 前轴
    Lr = wb * (1.0 - p["front_axle_frac"])  # CG → 后轴

    geo = {}
    for c in _CORNERS:
        axle = _AXLE[c]
        m = float(mr.get(c, 0.65))
        sus_share = (mf if axle == "f" else mr_total - mf) / 2.0
        yx = (tf if axle == "f" else tr) * _Y_SIGN[c]
        xx = Lf if axle == "f" else -Lr
        ku = wheel_rate(p["k_spring_" + axle + "_nmm"], m)
        kt = p["tire_k_nmm"]
        # 静基准：使 ku*q0*1000 = 簧上重(kg·mm/s²)、kt*d0*1000 = 总重；与重力 −9810 精确相消
        d0 = (sus_share + p["unsprung_kg"]) * 9.81 / kt
        q0 = sus_share * 9.81 / ku
        geo[c] = {
            "yx": yx, "xx": xx,
            "ms": sus_share,
            "mu": p["unsprung_kg"],
            "ku": ku, "kt": kt, "ct": p["tire_c_nsm"],
            "c_comp": p["c_comp_" + axle + "_nsm"],
            "c_reb": p["c_reb_" + axle + "_nsm"],
            "q0": q0, "d0": d0,
            "mr": m,
        }
    # 刚体惯量（集中质量于四角）
    ixx = sum(g["ms"] * g["yx"] ** 2 for g in geo.values())
    iyy = sum(g["ms"] * g["xx"] ** 2 for g in geo.values())
    return p, {"geo": geo, "ixx": max(ixx, 1e-6), "iyy": max(iyy, 1e-6)}


def road_signal(t: float, kind: str, amp: float, f: float) -> float:
    """路面高程偏差 (mm)。kind ∈ step|sine|pulse。"""
    if kind == "sine":
        return amp * math.sin(2 * math.pi * f * t)
    if kind == "pulse":
        x = (t - 0.5) / 0.06
        return amp * math.exp(-x * x)
    # step: 平滑升阶
    x = (t - 0.4) / 0.030
    x = max(-6.0, min(6.0, x))
    return amp * 0.5 * (1.0 + math.tanh(x))


def _road_deriv(t: float, kind: str, amp, f) -> float:
    return (road_signal(t + 2e-4, kind, amp, f)
            - road_signal(t - 2e-4, kind, amp, f)) / 4e-4


def simulate(params, mr, exc, dt_s: float = 0.001, ns: int = 10,
             corners: list | None = None):
    """四轮时域台架。

    exc: {kind, amplitude_mm, freq_hz, duration_s, corners?}
    corners 限制激励施加轮位；缺省施加到全部四轮。
    返回 {t:[...], body:{zc,vc,phi_deg,theta_deg}, wheels:{fl|fr|rl|rr:{...}}}。
    """
    p, rig = prepare(params, mr)
    geo = rig["geo"]
    hot = set(corners) if corners else set(_CORNERS)

    h = dt_s / ns
    tr_end = float(exc.get("duration_s", 3.0))
    amp = float(exc.get("amplitude_mm", 10.0))
    f = float(exc.get("freq_hz", 1.0))
    kind = exc.get("kind", "step")
    n_frames = max(1, int(round(tr_end / dt_s)))

    # 状态（摄动）：dzu up+, du=轮速；车身 zc up+/φ(rad,右+)/θ(rad,抬头+)
    dzu = np.zeros(4); du = np.zeros(4)
    zc = vc = 0.0
    phi = wphi = 0.0
    theta = wth = 0.0
    ms = p["ms_total_kg"]; ixx = rig["ixx"]; iyy = rig["iyy"]

    out_w = {c: {"zr": [], "dzu": [], "vu": [], "ext": [],
                 "fs": [], "fd": [], "ft": [], "pen": [], "acc": []}
             for c in _CORNERS}
    out_b = {"t": [], "zc": [], "phi_deg": [], "theta_deg": [], "vc": []}

    for n in range(n_frames):
        tm = n * dt_s
        # 先做每轮（含子步半隐式积分），簧下轮在车身状态冻结下推进
        for rank, c in enumerate(_CORNERS):
            g = geo[c]
            mu = g["mu"]
            for su in range(ns):
                tt = tm + su * h
                zr = road_signal(tt, kind, amp, f) if c in hot else 0.0
                zr_d = _road_deriv(tt, kind, amp, f) if c in hot else 0.0
                s = dzu[rank] - (zc + g["yx"] * phi + g["xx"] * theta)  # 压缩量(+,轮高于体)
                s_dot = du[rank] - (vc + g["yx"] * wphi + g["xx"] * wth)
                cw = g["c_comp"] if s_dot > 0 else g["c_reb"]
                Fbs = 0.0
                if s > p["bs_comp_up_mm"]:
                    x = s - p["bs_comp_up_mm"]
                    Fbs = p["k_bs_nmm"] * x * x / 20.0
                pen_c = g["d0"] + zr - dzu[rank]
                Ft = 0.0 if pen_c <= 0.0 else max(
                    0.0, g["kt"] * pen_c + g["ct"] * (zr_d - du[rank]))
                Fsw = max(0.0, g["ku"] * (g["q0"] + s))   # 弹簧只能承压，不可拉伸
                a_u = (-(Fsw + cw * s_dot + Fbs) * 1000.0 + Ft * 1000.0) / mu - G
                du[rank] += a_u * h
                dzu[rank] += du[rank] * h
        # 车身（半隐式）：各角弹簧/阻尼/缓冲块向上反力 + 重力
        F_up = 0.0
        Mx = 0.0
        My = 0.0
        for rank, c in enumerate(_CORNERS):
            g = geo[c]
            s = dzu[rank] - (zc + g["yx"] * phi + g["xx"] * theta)
            s_dot = du[rank] - (vc + g["yx"] * wphi + g["xx"] * wth)
            cw = g["c_comp"] if s_dot > 0 else g["c_reb"]
            fbody = max(0.0, g["ku"] * (g["q0"] + s)) + cw * s_dot   # 弹簧/阻尼反力(+缓冲块)向上
            if s > p["bs_comp_up_mm"]:
                x = s - p["bs_comp_up_mm"]
                fbody += p["k_bs_nmm"] * x * x / 20.0
            F_up += fbody
            Mx += fbody * g["yx"]
            My += fbody * g["xx"]
        M_arb = -(p["k_arb_f_nmm_rad"] + p["k_arb_r_nmm_rad"]) * phi
        vc += ((F_up * 1000.0 / ms) - G) * h
        zc += vc * h
        wphi += ((Mx + M_arb) * 1000.0) / ixx * h
        phi += wphi * h
        wth += (My * 1000.0) / iyy * h
        theta += wth * h
        # 记录帧
        out_b["t"].append(tm)
        out_b["zc"].append(zc)
        out_b["phi_deg"].append(math.degrees(phi))
        out_b["theta_deg"].append(math.degrees(theta))
        out_b["vc"].append(vc)
        for rank, c in enumerate(_CORNERS):
            g = geo[c]
            s = dzu[rank] - (zc + g["yx"] * phi + g["xx"] * theta)
            s_dot = du[rank] - (vc + g["yx"] * wphi + g["xx"] * wth)
            zr = road_signal(tm, kind, amp, f) if c in hot else 0.0
            zr_d = _road_deriv(tm, kind, amp, f) if c in hot else 0.0
            pen_c = g["d0"] + zr - dzu[rank]
            Fs = max(0.0, g["ku"] * (g["q0"] + s))   # 弹簧承压
            cw = g["c_comp"] if s_dot > 0 else g["c_reb"]
            Fd = cw * s_dot
            Ft = 0.0 if pen_c <= 0.0 else max(0.0, g["kt"] * pen_c + g["ct"] * (zr_d - du[rank]))
            acc_c = (-(Fs + Fd) * 1000.0 + Ft * 1000.0) / g["mu"] - G
            out_w[c]["zr"].append(float(zr))
            out_w[c]["dzu"].append(float(dzu[rank]))
            out_w[c]["vu"].append(float(du[rank]))
            out_w[c]["ext"].append(float(-s))           # ext=拉伸量(负压缩) 保留向下兼容
            out_w[c]["fs"].append(float(Fs))
            out_w[c]["fd"].append(float(Fd))
            out_w[c]["ft"].append(float(Ft))
            out_w[c]["pen"].append(float(pen_c))
            out_w[c]["acc"].append(float(acc_c))

    def _r(v):
        return [round(float(x), 4) for x in (v if not isinstance(v, np.ndarray) else v.tolist())]

    out = {
        "t": _r(out_b["t"]),
        "body": {"zc": _r(out_b["zc"]), "vc": _r(out_b["vc"]),
                 "phi_deg": _r(out_b["phi_deg"]), "theta_deg": _r(out_b["theta_deg"])},
        "wheels": {c: {k: _r(out_w[c][k]) for k in out_w[c]} for c in _CORNERS},
        "meta": {"params": {k: round(float(v), 6) for k, v in p.items()},
                 "mr": {k: round(float(v), 4) for k, v in mr.items()}},
    }
    return out