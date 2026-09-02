"""整车平面瞬态动力学（S3-1 升级版 · 2026-08-24）：3-DOF 车体 + 四轮 MF(复合滑移+松弛+外倾项) + 动力/气动 + 准静态载荷耦合。

模型范围（相对初版升级点标注 ★）：
- 车体：平面 6 状态 [X, Y, ψ, vx, vy, r]；侧倾/俯仰不作为状态、由准静态内核代数解
  并经 ★一阶滞后滤波（τ_roll/τ_pitch，模拟侧倾/俯仰建立时标），滤波值用于 K&C 查表
  行程索引与姿态输出。
- 轮胎（★复合滑移支撑 + ★松弛长度 + ★外倾推力项）：
  - 松弛：α_lat 按一阶滞后跟随运动学侧偏角（τ = L_σ / vx），瞬态响应真实化；
  - Fy = MF(α_lat, Fz, γ)（外倾项线性增益 Cγ，MF 子集扩展）；
  - Fx 由动力需求给出，摩擦圆约束 lat_avail = √((μFz)² − Fx²)，μ = Fy0/FzNom（与
    MF 峰值同源），并输出每轮摩擦利用率 μ_use = |F|/(μFz)。
- 动力（★ PowertrainParams）：峰值扭矩-恒功率包络 Fx = min(T/R, P/v)，
  驱动分配 drive_split_f（默认 0=纯后驱）；制动按 brake_split_f 参数化（默认 60:40）。
- 气动（★ aero）：F_down_f/r = k_down·v² 直接进入准静态载荷转移；阻力 F_drag = k_drag·v²。
  P2a（2026-09-02）：cl(h) 地面效应（ge_gain 缺省 0 = 关闭，向后兼容）+ DRS
  开翼（直道 && vx>阈值 ⇒ 阻力 ×drs_cd_scale、后轴 cl ×drs_cl_scale）。
- 载荷：每步 quasi_loads（上一步 ay/gx 破环），aero 下压力与分配比传入。
- 驾驶员：纯追踪横向 + ★PI 速度纵向控制（消除稳态误差）。
"""
from __future__ import annotations

import math
import time

import numpy as np

from src.api.chassis import axle_rc_sweep, quasi_loads
from src.api.v3models import (QuasiInputs, TrackSimRequest, TireParams, VehicleSpec)
from src.tire_mf import MagicFormulaSub, load_tir_params

R2D = 180.0 / math.pi
D2R = math.pi / 180.0
G = 9.81

_WHEELS = ("FR", "FL", "RR", "RL")


class TireState:
    """每轮瞬态状态：松弛侧偏（rad）与纵向滑移缓存。

    alpha_st：本步侧偏目标（rad），由 derivs 记录、step() 末尾统一积分用——
    F-22 修复后 derivs 保持纯函数，RK2 中间评估不得污染滞后状态。
    """
    __slots__ = ("alpha_lat", "kappa_dyn", "alpha_st")
    def __init__(self):
        self.alpha_lat = 0.0
        self.kappa_dyn = 0.0
        self.alpha_st = 0.0


def _lut(lut: dict, travel_mm: float, key: str, default: float) -> float:
    if not lut or key not in lut or "travel" not in lut:
        return default
    xs = np.asarray(lut["travel"], float)
    ys = np.asarray(lut[key], float)
    if len(xs) != len(ys) or len(xs) < 2:
        return default
    return float(np.interp(travel_mm, xs, ys))


def _ge_factor(h_m: float, gain: float, href_m: float, hmin_m: float,
               floor_v: float) -> float:
    """cl(h) 地面效应增强因子（P2a，与前端 qs.ge* 同构）：

    ge(h) = clamp(1 + gain·(href/max(h, hmin) − 1), floor, 1 + gain·(href/hmin − 1))
    h 越低（贴地）增强越强、直到 hmin 饱和；h > href 时衰减但不下 floor。
    """
    h = max(h_m, hmin_m)
    ge_max = 1.0 + gain * (href_m / hmin_m - 1.0)
    return max(floor_v, min(ge_max, 1.0 + gain * (href_m / h - 1.0)))


def _curvature_radius(xy: np.ndarray) -> np.ndarray:
    """每点局部曲率半径 m（相邻 3 点外接圆；共线/退化解 → 1e6 ≈ 直线）。

    边界点沿用邻点；供 run_track_sim 的 DRS 直道判定用（一次性预处理 O(n)）。
    """
    n = len(xy)
    out = np.full(n, 1e6)
    if n < 3:
        return out
    a, b, c = xy[:-2], xy[1:-1], xy[2:]
    ab = np.linalg.norm(b - a, axis=1)
    bc = np.linalg.norm(c - b, axis=1)
    ca = np.linalg.norm(a - c, axis=1)
    cross = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1])
                   - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
    with np.errstate(divide="ignore", invalid="ignore"):
        r = ab * bc * ca / (2.0 * cross)        # R = abc / (4Δ) = abc / (2·|cross|)
    r[~np.isfinite(r) | (r <= 0)] = 1e6
    out[1:-1] = r
    out[0], out[-1] = out[1], out[-2]
    return out


class VehiclePlanar:
    """平面 3-DOF 整车（升级版）：MF+复合滑移+松弛+外倾项+动力/气动条目。"""

    def __init__(self, vehicle: VehicleSpec, tire: TireParams,
                 kc_luts: dict, iz: float, powertrain, aero):
        self.v = vehicle
        self.tire = tire
        self.tires = {w: MagicFormulaSub(load_tir_params(tire.model_dump())) for w in _WHEELS}
        self.mu = tire.Fy0 / tire.FzNom
        self.Cg = float(getattr(tire, "Cg", 6.0))        # 外倾推力系数 1/rad（缺省 6.0
                                                          #   ⇒ 21 kN/rad @ FzNom=3500，真实量级）
                                                          # G24-S3：回退值随缺省同步 0.5→6.0，防 tire
                                                          # 缺属性时静默降级成旧占位量级
        self.Ls = float(getattr(tire, "Ls", 0.35))       # 松弛长度 m
        self.lut_f = kc_luts.get("front", {})
        self.lut_r = kc_luts.get("rear", {})
        self.iz = iz
        self.pt = powertrain
        self.aero_p = aero
        self._ts = {w: TireState() for w in _WHEELS}
        self.roll_deg = 0.0
        self.pitch_deg = 0.0
        self.roll_ss = 0.0
        self.pitch_ss = 0.0
        self._t = 0.0

        f_ms, r_ms = vehicle.front.spring_mass_kg, vehicle.rear.spring_mass_kg
        self.L = vehicle.wheelbase_mm / 1000.0
        self.b = self.L * (r_ms / (f_ms + r_ms))
        self.a = self.L - self.b
        self.hf = abs(vehicle.front.points["WC"][0]) / 1000.0
        self.hr_ = abs(vehicle.rear.points["WC"][0]) / 1000.0
        self.pos = {
            "FR": (self.a, +self.hf), "FL": (self.a, -self.hf),
            "RR": (-self.b, +self.hr_), "RL": (-self.b, -self.hr_),
        }
        self.mr = {"front": vehicle.front.motion_ratio or 0.75,
                   "rear": vehicle.rear.motion_ratio or 0.78}
        # F-19（2026-08-30）：MR 链与准静态一致——引擎侧 chassis._resolve_mr_fb
        # 是 显式 > mr_at_zero 推导 > 分轴常量，但 transient 无机构上下文，
        # 静态回退分轴常量保持 0.75/0.78（与准静态的最终回退相同，不再漂移）；
        # 显式输入依旧优先，差额登记"故意不同清单"（transient 无摇臂链）。
        swf = axle_rc_sweep(vehicle.front)
        swr = axle_rc_sweep(vehicle.rear)
        rc0 = lambda sw: float(np.interp(0.0, sw["travel"],
                                         [v if v is not None else 55.0 for v in sw["rc_h"]]))
        self.rcH = {"FR": rc0(swf), "RR": rc0(swr)}
        self.rc_sw = {"front": swf, "rear": swr}
        self.prev_ay = 0.0
        self.prev_ax = 0.0

        # P2a（2026-09-02）：cl(h)/DRS 参数缓存（缺省与 AeroParams 同源；
        # ge_gain 缺省 0 = 高度链路关闭，旧请求零行为变化）
        ap = aero or {}
        self.ge_gain = float(ap.get("ge_gain", 0.0))
        self.ge_h0 = float(ap.get("ge_h0_mm", 100.0)) / 1000.0
        self.ge_href = float(ap.get("ge_href_mm", 100.0)) / 1000.0
        self.ge_hmin = float(ap.get("ge_hmin_mm", 30.0)) / 1000.0
        self.ge_floor = float(ap.get("ge_floor", 0.80))
        self.drs_cd_scale = float(ap.get("drs_cd_scale", 0.72))
        self.drs_cl_scale = float(ap.get("drs_cl_scale", 0.90))
        self._ge_f = 1.0                  # 最近步 ge 快照（trace 输出用，同 roll_ss 先例）
        self._ge_r = 1.0
        self._aero_down_n = 0.0           # 末步总下压快照（含 ge/DRS）

    # ── 气动（★ + P2a cl(h)/DRS）────────────────────────────
    def _ride_h(self) -> tuple[float, float]:
        """本步车底净高估计 (h_f, h_r) m：名义 ge_h0 ± 姿态俯仰（抬头 → 前增后减，
        与前端 0.11 + Z ± a/b·θ 同号；平面模型无 heave 状态，静态项即基准）。"""
        p = math.radians(self.pitch_deg)
        return self.ge_h0 + self.a * math.tan(p), self.ge_h0 - self.b * math.tan(p)

    def aero_forces(self, vx: float, h_f: float | None = None,
                    h_r: float | None = None, drs: bool = False) -> tuple[float, float, float]:
        """返回 (F_down_f, F_down_r, F_drag) N（SI；k 单位 N/(m/s)²）。

        h_f/h_r 车底净高 m（缺省名义 ge_h0）：ge_gain>0 时 cl 随 h 增强；
        drs=True 时总阻力 ×drs_cd_scale、后轴 cl ×drs_cl_scale（尾翼襟翼）。
        """
        v2 = vx * vx
        kf = float(self.aero_p.get("k_down_f", 0.55))
        kr = float(self.aero_p.get("k_down_r", 0.45))
        kd = float(self.aero_p.get("k_drag", 0.35))
        h_f = self.ge_h0 if h_f is None else h_f
        h_r = self.ge_h0 if h_r is None else h_r
        if self.ge_gain > 0.0:
            gf = _ge_factor(h_f, self.ge_gain, self.ge_href, self.ge_hmin, self.ge_floor)
            gr = _ge_factor(h_r, self.ge_gain, self.ge_href, self.ge_hmin, self.ge_floor)
        else:
            gf = gr = 1.0
        self._ge_f, self._ge_r = gf, gr        # 快照（RK2 两次评估覆盖 → 终值 = k2）
        cd = self.drs_cd_scale if drs else 1.0
        clr = self.drs_cl_scale if drs else 1.0
        return kf * v2 * gf, kr * v2 * gr * clr, kd * v2 * cd

    def drag_force(self, vx: float, drs: bool = False) -> float:
        """纵向气动阻力 N（CdA 与 h 无关，独立求值；不触碰 ge 快照——
        drag 的 aero_forces 调用若以名义高覆盖快照，trace 的 ge_f/ge_r
        会恒为 1（P2a-4 调试实证），下压快照唯一来源 = wheel_loads）。"""
        v2 = vx * vx
        kd = float(self.aero_p.get("k_drag", 0.35))
        cd = self.drs_cd_scale if drs else 1.0
        return kd * v2 * cd

    def wheel_loads(self, vx: float, drs: bool = False) -> dict[str, float]:
        q = QuasiInputs(gy=self.prev_ay / G, gx=self.prev_ax / G)
        # ★ 气动下压力注入（aero_force_n / aero_bias 已有语义）。
        # 勘误（2026-08-30，F-23 复核）：dfn_f/dfn_r 是前/后轴下压力，阻力不入垂向
        # 载荷——审查报告误把 dr 读成 drag；实际阻力在 derivs 中单独作用于 Fx，
        # 本函数物理正确，仅重命名消歧义。
        # P2a：h 用姿态估计（抬头 → 前净高增 / 后净高减），ge_gain>0 时生效。
        h_f, h_r = self._ride_h()
        dfn_f, dfn_r, _ = self.aero_forces(vx, h_f, h_r, drs)
        self._aero_down_n = dfn_f + dfn_r      # 末步真实下压快照（含 ge/DRS，summary 用）
        q.aero_force_n = dfn_f + dfn_r
        q.aero_bias = dfn_f / max(1.0, dfn_f + dfn_r)
        loads = quasi_loads(self.v, q, self.mr, self.rcH, self.rc_sw)
        self.roll_ss = loads.roll_deg          # 准静态侧倾（滤波在 derivs 中做）
        return dict(loads.fz)

    # ── 阿克曼分轮 ─────────────────────────────────────────────
    def steer_angles(self, delta: float) -> dict[str, float]:
        if abs(delta) < 1e-6:
            return {"FR": 0.0, "FL": 0.0}
        R = self.L / math.tan(delta)
        sgn = 1.0 if R > 0 else -1.0
        R = abs(R)
        d_in = math.atan(self.L / max(0.5, R - self.hf))
        d_out = math.atan(self.L / (R + self.hf))
        return {"FR": sgn * d_in if sgn > 0 else sgn * d_out,
                "FL": sgn * d_out if sgn > 0 else sgn * d_in}

    # ── 单轮力（★复合/松弛/外倾）────────────────────────────────
    def wheel_force(self, w: str, vx_w: float, vy_w: float, delta: float,
                    fz: float, throttle: float, brake: float,
                    vx: float, dt: float) -> dict:
        lut = self.lut_f if w in ("FR", "FL") else self.lut_r
        travel_mm = math.radians(self.roll_deg) * abs(self.pos[w][1]) * 1000.0
        toe_deg = _lut(lut, travel_mm, "toe", 0.0)
        cam_deg = _lut(lut, travel_mm, "cam", 0.0) * D2R
        d = delta + toe_deg * D2R

        cd, sd = math.cos(d), math.sin(d)
        vwx = vx_w * cd + vy_w * sd
        vwy = -vx_w * sd + vy_w * cd
        speed = math.hypot(vwx, vwy)
        ts = self._ts[w]
        if speed < 0.8 or fz <= 1.0:
            alpha_st, fy_w, fx_w, mu_use, slip_k = 0.0, 0.0, 0.0, 0.0, 0.0
            ts.alpha_st = ts.alpha_lat    # 失活轮：松弛目标=当前值（不衰减，状态冻结）
        else:
            alpha_st = math.atan2(vwy, max(abs(vwx), 0.5))
            # ★ 松弛（F-22/F-24 修复，2026-08-30）：derivs 保持纯函数——只记录
            #   侧偏目标，不推进状态（RK2 中间评估不得污染滞后状态）；推进在
            #   step() 末尾用解析精确解 1−e^(−dt·vx/σ) 每步积分一次（无条件稳定）。
            ts.alpha_st = alpha_st
            a_lat = ts.alpha_lat
            mu_fz = self.mu * fz
            # ★ 外倾推力项（线性增益，与 MF 峰值解耦采用 μ 归一）
            fy_w = -float(self.tires[w].fy(math.degrees(a_lat), fz))
            fy_w += -self.Cg * cam_deg * fz              # ★ 外倾推力（cam_deg 为弧度，γ>0 产生反向 Fy）
            # 纵向：动力包络（★ 恒扭矩-恒功率，前后分配 drive_split_f）或制动（参数化分配）
            fx_w = 0.0
            if throttle > 0:
                # F-26（2026-08-30）：轮半径不再硬编码 0.30（默认 tire 325mm 却按
                # 300mm 算力会虚高 ~8%）——取本轴 tire_radius 折算扭矩→力。
                is_f = w in ("FR", "FL")
                t_r_mm = (self.v.front.tire_radius if is_f else self.v.rear.tire_radius) or 325.0
                t_eff = self.pt.get("T_max", 250.0) / (t_r_mm / 1000.0)   # N·m→N（一档直驱近似）
                p_eff = (self.pt.get("P_kw", 80.0) * 1000.0) / max(0.8, vx)
                f_avail = min(t_eff, p_eff) * throttle
                split = float(self.pt.get("drive_split_f", 0.0))
                share = (1.0 - split) if w in ("RR", "RL") else split
                if share > 0.0:
                    fx_w = min(0.75 * mu_fz, f_avail * share) * 0.5
            if brake > 0:
                sp_f = float(self.pt.get("brake_split_f", 0.60))
                share = (sp_f / 2.0) if w in ("FR", "FL") else ((1.0 - sp_f) / 2.0)
                fx_w = -math.copysign(min(mu_fz, brake * share * 14000.0), vwx)
            # ★ 摩擦圆 + 利用率输出
            lat_avail = math.sqrt(max(0.0, mu_fz * mu_fz - fx_w * fx_w))
            fy_w = max(-lat_avail, min(lat_avail, fy_w))
            mu_use = min(1.0, math.hypot(fx_w, fy_w) / max(mu_fz, 1.0))
            slip_k = (vx - vwx) / max(vx, 0.5)
        return {"fx": fx_w * cd - fy_w * sd, "fy": fx_w * sd + fy_w * cd,
                "alpha": math.degrees(alpha_st), "alpha_lat": math.degrees(ts.alpha_lat),
                "toe": toe_deg, "cam": math.degrees(cam_deg), "fz": fz,
                "mu_use": mu_use, "slip_k": slip_k}

    def derivs(self, s: np.ndarray, delta: float, throttle: float,
               brake: float, dt: float, drs: bool = False) -> tuple[np.ndarray, dict]:
        """纯函数导数（F-22 修复，2026-08-30）：不再推进 roll_deg/pitch_deg/
        alpha_lat 等滞后状态——旧实现让 RK2 的 k1/k2 两次评估各推一次滞后，
        τ_eff 减半且中点状态被污染。滞后推进统一移到 step() 末尾。

        P2a：drs 为步内常量输入（同 delta/throttle 语义，不影响纯函数性）。"""
        vx, vy, r = s[3], s[4], s[5]
        fz = self.wheel_loads(vx, drs)
        steer = self.steer_angles(delta)
        Fx = Fy = Mz = 0.0
        diag = {}
        for w in _WHEELS:
            lx, ly = self.pos[w]
            vx_w = vx - r * ly
            vy_w = vy + r * lx
            fw = self.wheel_force(w, vx_w, vy_w, steer.get(w, 0.0), fz[w],
                                  throttle, brake, vx, dt)
            Fx += fw["fx"]
            Fy += fw["fy"]
            Mz += lx * fw["fy"] - ly * fw["fx"]
            diag[w] = fw
        # ★ 气动阻力（P2a：独立求值，不覆盖 ge 快照）
        f_drag = self.drag_force(vx, drs)
        Fx -= f_drag * 1.0
        m = self.v.mass_kg
        ax = Fx / m + r * vy
        ay = Fy / m - r * vx
        ar = Mz / self.iz
        return np.array([0.0, 0.0, 0.0, ax, ay, ar]), diag

    def step(self, s: np.ndarray, dt: float, delta: float, throttle: float,
             brake: float, drs: bool = False) -> tuple[np.ndarray, dict]:
        k1, diag = self.derivs(s, delta, throttle, brake, dt, drs)
        mid = s + 0.5 * dt * k1
        mid[3:] = np.clip(mid[3:], -90.0, 90.0)
        k2, _ = self.derivs(mid, delta, throttle, brake, dt, drs)
        s2 = s + dt * k2
        s2[3:] = np.clip(s2[3:], -90.0, 90.0)
        psi = s2[2]
        s2[0] += dt * (s2[3] * math.cos(psi) - s2[4] * math.sin(psi))
        s2[1] += dt * (s2[3] * math.sin(psi) + s2[4] * math.cos(psi))
        s2[2] += dt * s2[5]
        self.prev_ax = k2[3] - s2[5] * s2[4]
        self.prev_ay = k2[4] + s2[5] * s2[3]
        # —— 滞后状态推进（F-22 修复：移出 derivs，每个 RK2 步只积分一次）——
        self.roll_deg += (self.roll_ss - self.roll_deg) * (dt / 0.18)
        pitch_ss = math.degrees(math.atan2(self.prev_ax, G)) * 0.55
        self.pitch_deg += (pitch_ss - self.pitch_deg) * (dt / 0.25)
        # —— 松弛滞后（F-24 修复：解析精确解，无条件稳定；显式欧拉在
        #    dt·vx/σ > 2 时发散，dt=0.05/vx=40/σ=0.3 时比率高达 6.7）——
        sigma = max(0.3, self.Ls)
        vx_now = max(float(s2[3]), 0.0)
        for w in _WHEELS:
            tsw = self._ts[w]
            tsw.alpha_lat += (tsw.alpha_st - tsw.alpha_lat) * (
                1.0 - math.exp(-dt * vx_now / sigma))
        self._t += dt
        return s2, diag


# ── 纯追踪驾驶员 + ★PI 纵向 ─────────────────────────────────────

def _closest_idx(track_xy: np.ndarray, p: np.ndarray, start: int) -> int:
    d = np.linalg.norm(track_xy[start:] - p, axis=1)
    return start + int(np.argmin(d))


def _lookahead_point(track_xy: np.ndarray, idx: int, ld: float) -> np.ndarray:
    acc = 0.0
    p = track_xy[idx].copy()
    for k in range(idx, len(track_xy) - 1):
        seg = track_xy[k + 1] - track_xy[k]
        sl = float(np.linalg.norm(seg))
        if acc + sl >= ld and sl > 1e-9:
            return track_xy[k] + seg * ((ld - acc) / sl)
        acc += sl
        p = track_xy[k + 1]
    return track_xy[-1]


class DriverPI:
    """纯追踪转向 + 纵向 PI。内部状态：积分误差。"""
    def __init__(self, kp_v=0.9, ki_v=0.12, gain=0.9):
        self.kp_v = kp_v
        self.ki_v = ki_v
        self.gain = gain
        self.e_int = 0.0

    def __call__(self, track_xy, state, idx, v_target, L,
                 dt: float = 0.05) -> tuple[float, float, float, int]:
        x, y, psi, vx = state[0], state[1], state[2], state[3]
        idx = _closest_idx(track_xy, np.array([x, y]), idx)
        ld = float(np.clip(3.0 + self.gain * vx, 4.0, 18.0))
        tgt = _lookahead_point(track_xy, idx, ld)
        dx, dy = tgt[0] - x, tgt[1] - y
        c, s = math.cos(psi), math.sin(psi)
        lx = dx * c + dy * s
        ly = -dx * s + dy * c
        alpha_ld = math.atan2(ly, max(lx, 1.0))
        delta = math.atan2(2.0 * L * math.sin(alpha_ld), ld)
        e = v_target - vx
        # F-27（2026-08-30）：积分按真实 dt 缩放（旧实现 e*0.05 隐含 dt=0.05，
        # 请求 dt 允许 0.0005~0.05 → 积分增益随步长漂移最多 100 倍）
        self.e_int = max(-2.0, min(2.0, self.e_int + e * dt))
        throttle = float(np.clip(self.kp_v * e + self.ki_v * self.e_int, 0.0, 1.0))
        brake = float(np.clip(-self.kp_v * e - 0.15, 0.0, 1.0)) if e < -0.5 else 0.0
        return delta, throttle, brake, idx


def _wash_json(obj):
    """F-25（2026-08-30）：递归把非有限浮点洗成 None，保证响应 JSON 严格合法。

    FastAPI 默认 json.dumps(allow_nan=True) 会输出 NaN/Infinity 字面量，
    前端 JSON.parse 直接抛 SyntaxError——发散仿真的错误路径本身不能炸。
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _wash_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_wash_json(v) for v in obj]
    return obj


def run_track_sim(req: TrackSimRequest) -> dict:
    t0 = time.perf_counter()
    v = req.vehicle
    track_xy = np.array([[p.x, p.y] for p in req.track], float)
    tgt_speed = np.array([p.target_speed for p in req.track], float)
    L = v.wheelbase_mm / 1000.0
    iz = req.iz_kg_m2 or v.mass_kg * (L * L + 1.6 * 1.6) / 12.0
    pt = req.powertrain.model_dump() if req.powertrain else {}
    aero = req.aero.model_dump() if req.aero else {}
    car = VehiclePlanar(v, req.tire, req.kc_luts, iz, pt, aero)
    drv = DriverPI(gain=req.lookahead_gain)

    state = np.zeros(6)
    state[3] = req.start_speed
    state[2] = math.atan2(track_xy[1, 1] - track_xy[0, 1], track_xy[1, 0] - track_xy[0, 0])
    state[0], state[1] = track_xy[0]

    n_steps = min(int(req.sim_time / req.dt), 60000)
    keep = max(1, n_steps // 1500)
    ts: list[float] = []
    trace: list[dict] = []
    idx = 0
    finished = False
    warnings: list[str] = []
    max_ay = 0.0
    # P2a DRS：局部曲率半径 > 阈值（直道）&& vx > 阈值 ⇒ 开翼（无轨道 DRS 区
    # 标记，直道判定替代；drs_v_ms 高阈值/ge_gain=0 ⇒ 旧请求零变化）
    drs_v_ms = float(aero.get("drs_v_ms", 40.0))
    drs_r_min = float(aero.get("drs_curve_radius_m", 300.0))
    curv = _curvature_radius(track_xy)
    drs_steps = 0
    for k in range(n_steps):
        t = k * req.dt
        v_target = float(tgt_speed[min(idx, len(tgt_speed) - 1)])
        delta, throttle, brake, idx = drv(track_xy, state, idx, v_target, L, req.dt)
        if throttle < 0.02 and brake < 0.02 and abs(v_target - state[3]) > 0.5:
            throttle = 0.05
        drs_on = state[3] > drs_v_ms and curv[min(idx, len(curv) - 1)] > drs_r_min
        state, diag = car.step(state, req.dt, delta, throttle, brake, drs_on)
        if drs_on:
            drs_steps += 1
        max_ay = max(max_ay, abs(car.prev_ay))
        if k % keep == 0 or k == n_steps - 1:
            row = {"t": round(t, 4), "x": round(state[0], 3), "y": round(state[1], 3),
                   "psi": round(state[2], 4), "vx": round(state[3], 3),
                   "vy": round(state[4], 3), "r": round(state[5], 4),
                   "roll": round(car.roll_deg, 3), "pitch": round(car.pitch_deg, 3),
                   "ay": round(car.prev_ay, 2), "ax": round(car.prev_ax, 2),
                   "delta": round(delta, 4),
                   "throttle": round(throttle, 2), "brake": round(brake, 2),
                   "drs": int(drs_on), "ge_f": round(car._ge_f, 4), "ge_r": round(car._ge_r, 4)}
            for w in _WHEELS:
                row[f"alpha_{w}"] = round(diag[w]["alpha"], 3)
                row[f"alphaL_{w}"] = round(diag[w]["alpha_lat"], 3)
                row[f"fz_{w}"] = round(diag[w]["fz"], 1)
                row[f"fy_{w}"] = round(diag[w]["fy"], 1)
                row[f"fx_{w}"] = round(diag[w]["fx"], 1)
                row[f"mu_{w}"] = round(diag[w]["mu_use"], 3)
                row[f"cam_{w}"] = round(diag[w]["cam"], 2)
            ts.append(row.pop("t"))
            trace.append(row)
        if np.linalg.norm(state[:2] - track_xy[-1]) < 6.0 and idx >= len(track_xy) - 3:
            finished = True
            break
        if not np.isfinite(state).all():
            warnings.append(f"diverged at t={t:.2f}s")
            break

    xy = np.array([[p["x"], p["y"]] for p in trace]) if trace else np.zeros((1, 2))
    seg = np.linalg.norm(np.diff(xy, axis=0), axis=1).sum() if len(xy) > 1 else 0.0
    npy = min(len(trace), 1200)
    lats = [max(abs(float(t[f"alphaL_{w}"])) for w in _WHEELS) for t in trace[-npy:]]
    return _wash_json({
        "status": "VALID" if np.isfinite(state).all() else "SOLVER_FAILED",
        "ms": (time.perf_counter() - t0) * 1000.0,
        "steps": len(ts), "finished": finished,
        "t": ts, "trace": trace,
        "summary": {"path_length_m": round(float(seg), 1),
                    "v_end": round(float(state[3]), 2),
                    "v_max": round(max((p["vx"] for p in trace), default=0.0), 2),
                    "max_ay_g": round(max_ay / G, 3),
                    "max_slip_deg": round(max(lats, default=0.0), 2),
                    "aero_n": round(car._aero_down_n, 1),
                    "drs_frac": round(drs_steps / max(1, n_steps), 5),
                    "ge_f": round(car._ge_f, 4), "ge_r": round(car._ge_r, 4)},
        "warnings": warnings,
    })
