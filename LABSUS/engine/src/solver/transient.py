"""整车平面瞬态动力学（S3-1 升级版 · 2026-08-24）。

3-DOF 车体 + 四轮 MF(复合滑移+松弛+外倾项) + 动力/气动 + 准静态载荷耦合。

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
from src.api.v3models import QuasiInputs, TireParams, TrackSimRequest, VehicleSpec
from src.core.json_util import wash_json as _wash_json
from src.tire_mf import MagicFormulaSub, load_tir_params

R2D = 180.0 / math.pi
D2R = math.pi / 180.0
G = 9.81

_WHEELS = ("FR", "FL", "RR", "RL")


from src.components.differential import distribute_axle, split_from_spec
from src.solver.wheel_dof import quasi_steady_omega, quasi_steady_slip


class TireState:
    """每轮瞬态滞后状态：侧偏松弛（rad）。

    alpha_st：本步侧偏目标（rad），由 derivs 记录、step() 末尾统一积分用——
    F-22 修复后 derivs 保持纯函数，RK2 中间评估不得污染滞后状态。

    M5（2026-09-20）：删除 `kappa_dyn` 字段——它只被初始化、从未读写，是
    纵向滑移反馈的占位残骸。本模型的纵向力由动力需求包络给出（见
    `wheel_force` 的 f_avail / 制动分支），**纵滑是开环量**：`slip_k` 每步算出
    仅用于观测，不进入 Kr 反馈。该缺口已在 INTENTIONAL_DIFFERENCES.md 登记。
    """
    __slots__ = ("alpha_lat", "alpha_st")
    def __init__(self):
        self.alpha_lat = 0.0
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
        # ── 按胎宽配平的轴侧偏刚度（M5，2026-09-20）────────────────────────
        # k_axle = W_axle / mean(W_f, W_r)，只放大 MF 的刚度因子 By，不动峰值
        # （μ·Fz 与胎宽基本无关）。与 chassis.quasi_loads 的 Cα 配平同源，
        # 保证"准静态说不足转向 / 瞬态也真不足转向"两内核口径一致。
        # 任一轴缺 tire_width ⇒ k≡1，旧行为逐位不变（tphys_parity 锚安全）。
        _kf = vehicle.front.tire_width_scale(vehicle.rear)
        _kr = vehicle.rear.tire_width_scale(vehicle.front)
        self.tires = {}
        for _w in _WHEELS:
            _tp = tire.model_dump()
            _sc = _kf if _w in ("FR", "FL") else _kr
            if abs(_sc - 1.0) > 1e-12:
                _tp["By"] = float(_tp["By"]) * _sc
            self.tires[_w] = MagicFormulaSub(load_tir_params(_tp))
        self.kW_F, self.kW_R = _kf, _kr
        self.mu = tire.Fy0 / tire.FzNom
        self.Cg = float(getattr(tire, "Cg", 6.0))        # 外倾推力系数 1/rad（缺省 6.0
                                                          #   ⇒ 21 kN/rad @ FzNom=3500，真实量级）
                                                          # G24-S3：回退值随缺省同步 0.5→6.0，防 tire
                                                          # 缺属性时静默降级成旧占位量级
        self.Ls = float(getattr(tire, "Ls", 0.35))       # 松弛长度 m
        self.lut_f = kc_luts.get("front", {})
        self.lut_r = kc_luts.get("rear", {})
        self.iz = iz
        # M19（2026-09-20）：轮自由度开关。**默认关** ⇒ 状态仍为平面 6 状态、数值逐位不变。
        # 打开后：纵向力受 μFz 限制（而非历史的 0.75μFz 余量）、并输出准稳态滑移率与轮速，
        # 供差速器的 Δω 使用。开关由请求字段 TrackSimRequest.wheel_dof 控制（默认关）。
        self.wheel_dof = False
        self.kappa_peak = float(getattr(tire, "kappa_peak", 0.12))
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
        def rc0(sw):
            """travel=0 处的侧倾中心高（缺失点按 55mm 兜底）。"""
            return float(np.interp(0.0, sw["travel"],
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
                    vx: float, dt: float,
                     diff_force_n: float | None = None) -> dict:
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
        # M19：轮自由度输出量的初值必须在**分支之前**统一给出 —— 本函数有
        # 「失活轮（speed<0.8 或 fz<=1）→ 早退」与「主路径」两条分支，
        # 只在主路径初始化会让失活轮的返回字典引用到未绑定变量（实测 UnboundLocalError）。
        kappa_q = omega_q = 0.0
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
            if diff_force_n is not None:
                # M16：轴级差速器已决定本轮该轮纵向力（N，含锁紧约束）
                fx_w = float(diff_force_n)
            elif throttle > 0:
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
                    # 历史路径用 0.75·μFz 作为单轮纵向余量（出处未说明）；轮自由度打开后
                    # 该余量由滑移曲线与附着共同决定 ⇒ 改用 μFz，并把差异登记为刻意差异。
                    cap = mu_fz if self.wheel_dof else 0.75 * mu_fz
                    fx_w = min(cap, f_avail * share) * 0.5
            if brake > 0:
                sp_f = float(self.pt.get("brake_split_f", 0.60))
                share = (sp_f / 2.0) if w in ("FR", "FL") else ((1.0 - sp_f) / 2.0)
                fx_w = -math.copysign(min(mu_fz, brake * share * 14000.0), vwx)
            # M19：轮自由度打开时输出**准稳态**滑移率与轮速（代数解，不引入刚性）
            kappa_q = omega_q = 0.0
            if self.wheel_dof:
                # ⚠ 轮半径必须在此独立取：上方 `t_r_mm` 只在 `elif throttle > 0` 分支内定义，
                # 而走差速器路径（`diff_force_n` 非 None）时该分支被跳过 ⇒ 引用它会
                # UnboundLocalError。这是"开关开 + 差速器规格"的端到端集成测试当场抓出的，
                # 单测（只开开关、不给差速器）覆盖不到 —— 集成缺口比 bug 本身更值得记。
                r_use_mm = (self.v.front.tire_radius if w in ("FR", "FL")
                            else self.v.rear.tire_radius) or 325.0
                kappa_q = quasi_steady_slip(fx_w, mu_fz, self.kappa_peak)
                omega_q = quasi_steady_omega(vx, kappa_q, r_use_mm / 1000.0)
            # ★ 摩擦圆 + 利用率输出
            lat_avail = math.sqrt(max(0.0, mu_fz * mu_fz - fx_w * fx_w))
            fy_w = max(-lat_avail, min(lat_avail, fy_w))
            mu_use = min(1.0, math.hypot(fx_w, fy_w) / max(mu_fz, 1.0))
            slip_k = (vx - vwx) / max(vx, 0.5)
        return {"fx": fx_w * cd - fy_w * sd, "fy": fx_w * sd + fy_w * cd,
                "alpha": math.degrees(alpha_st), "alpha_lat": math.degrees(ts.alpha_lat),
                "toe": toe_deg, "cam": math.degrees(cam_deg), "fz": fz,
                "mu_use": mu_use, "slip_k": slip_k,
                # M19：轮自由度输出（开关关闭时恒 0，不改变任何既有消费方）
                "kappa_qs": kappa_q, "omega_qs": omega_q}

    def _diff_shares(self, fz: dict, throttle: float, vx: float) -> dict:
        """按差速器算两轴左右驱动力（N）。未给规格的轴不在此返回 ⇒ 沿用历史逐轮路径。

        **两条路径**（由 `self.wheel_dof` 决定）：

        · **开关开（真源路径）**：用 `distribute_axle`（扭矩单位，逐字移植前端
          `web/js/16-powertrain.js::distributeAxle`）。它需要左右**轮速差 Δω**，而准稳态下
          `ω_w = vx·(1+κ_w)/Re`、`κ_w` 又取决于本轮的扭矩分配 ⇒ 一个小不动点，两轮迭代即可
          收敛（首轮用等分扭矩起算）。T2 对拍工件 `engine/data/diff_parity_cases.json`
          保证这一侧与前端逐例一致（worst rel < 1e-9）。
        · **开关关（历史路径）**：没有 Δω 可用 ⇒ 退回力式准静态分配 `split_from_spec`，
          保持 M16 引入的行为与数值**逐位不变**。

        差速器是**轴级**装置：左右分配必须先于逐轮受力计算，逐轮独立算必然退化成
        "每轮各自用满附着"（= 隐式锁死轴），这正是 M16 要修的东西。
        """
        out: dict = {}
        if throttle <= 0:
            return out
        t_max = float(self.pt.get("T_max", 250.0))
        p_w = float(self.pt.get("P_kw", 80.0)) * 1000.0
        split_f = float(self.pt.get("drive_split_f", 0.0))
        for axle, wheels, key, share in (("front", ("FL", "FR"), "front_diff", split_f),
                                         ("rear", ("RL", "RR"), "rear_diff", 1.0 - split_f)):
            spec = self.pt.get(key)
            if not spec or share <= 0.0:
                continue
            r_mm = (self.v.front.tire_radius if axle == "front" else self.v.rear.tire_radius) or 325.0
            r_m = r_mm / 1000.0
            f_avail = min(t_max / r_m, p_w / max(0.8, vx)) * throttle * share
            cap_l = 0.75 * self.mu * fz[wheels[0]]
            cap_r = 0.75 * self.mu * fz[wheels[1]]
            if self.wheel_dof:
                # 真源路径：扭矩域分配 + 两轮不动点求 Δω
                t_axle = f_avail * r_m
                t_l, t_r = distribute_axle(t_axle, 0.0, 0.0,
                                           fz[wheels[0]], fz[wheels[1]], spec)
                for _ in range(2):
                    om = []
                    for _w, _t in ((wheels[0], t_l), (wheels[1], t_r)):
                        _k = quasi_steady_slip(_t / r_m, self.mu * fz[_w], self.kappa_peak)
                        om.append(quasi_steady_omega(vx, _k, r_m))
                    t_l, t_r = distribute_axle(t_axle, om[0], om[1],
                                               fz[wheels[0]], fz[wheels[1]], spec)
                out[wheels[0]] = min(self.mu * fz[wheels[0]], t_l / r_m)
                out[wheels[1]] = min(self.mu * fz[wheels[1]], t_r / r_m)
            else:
                f_l, f_r = split_from_spec(cap_l, cap_r, f_avail, spec, r_mm)
                out[wheels[0]] = f_l
                out[wheels[1]] = f_r
        return out

    def derivs(self, s: np.ndarray, delta: float, throttle: float,
               brake: float, dt: float, drs: bool = False) -> tuple[np.ndarray, dict]:
        """纯函数导数（F-22 修复，2026-08-30）：不再推进 roll_deg/pitch_deg/
        alpha_lat 等滞后状态——旧实现让 RK2 的 k1/k2 两次评估各推一次滞后，
        τ_eff 减半且中点状态被污染。滞后推进统一移到 step() 末尾。

        P2a：drs 为步内常量输入（同 delta/throttle 语义，不影响纯函数性）。"""
        vx, vy, r = s[3], s[4], s[5]
        fz = self.wheel_loads(vx, drs)
        steer = self.steer_angles(delta)
        # M16：轴级差速器分配（无规格的轴不在字典里 ⇒ 该轴沿用历史逐轮路径）
        dshare = self._diff_shares(fz, throttle, vx)
        Fx = Fy = Mz = 0.0
        diag = {}
        for w in _WHEELS:
            lx, ly = self.pos[w]
            vx_w = vx - r * ly
            vy_w = vy + r * lx
            fw = self.wheel_force(w, vx_w, vy_w, steer.get(w, 0.0), fz[w],
                                  throttle, brake, vx, dt, dshare.get(w))
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
    for k in range(idx, len(track_xy) - 1):
        seg = track_xy[k + 1] - track_xy[k]
        sl = float(np.linalg.norm(seg))
        if acc + sl >= ld and sl > 1e-9:
            return track_xy[k] + seg * ((ld - acc) / sl)
        acc += sl
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


def run_track_sim(req: TrackSimRequest) -> dict:
    t0 = time.perf_counter()
    v = req.vehicle
    track_xy = np.array([[p.x, p.y] for p in req.track], float)
    tgt_speed = np.array([p.target_speed for p in req.track], float)
    L = v.wheelbase_mm / 1000.0
    # M15（2026-09-20）：缺省不再一律用均质矩形板近似（对 FSAE 偏高 41%），
    # 改走 mass_properties.resolve_yaw_inertia 三档（显式 > FSAE 部件清单 > 矩形近似）
    from src.api.mass_properties import resolve_yaw_inertia
    iz, _iz_src = resolve_yaw_inertia(req.iz_kg_m2, v.mass_kg, v.wheelbase_mm)
    _iz_source = _iz_src
    pt = req.powertrain.model_dump() if req.powertrain else {}
    # G31-P7：请求带 powertrain.ice 时，用其等效轮上扭矩上限覆盖 T_max（一档）；
    # 缺省（None 或无 ice）保持旧 T_max/P_kw 路径逐位不变（对拍锚）。
    # 旧路径把 T_max 视为**轮上扭矩** N·m（wheel_force 内按每轮 tire_radius 折力），
    # 故此处只给“曲轴扭矩×变速箱比×主减速×效率”的轮端扭矩，不再除半径。
    if req.powertrain is not None and req.powertrain.ice is not None:
        _ps = req.powertrain
        _t_crank = max((p[1] for p in _ps.ice.map), default=0.0)      # 曲轴峰值扭矩 N·m
        _gb = _ps.gearbox
        _ratio = _gb.ratios[0] if (_gb and _gb.ratios) else 1.0        # 一档传动比
        _final = _gb.finalDrive if _gb else 1.0                        # 主减速
        _eff = _gb.eff if _gb else 1.0                                 # 传动效率
        _t_wheel = _t_crank * _ratio * _final * _eff
        if _t_wheel > 0.0:
            pt["T_max"] = _t_wheel
        # 峰值功率由 map 估算：P[kW] = max(T×n)/9550（保留恒功率包络高速上限）
        _p_kw = max((p[0] * p[1] for p in _ps.ice.map), default=0.0) / 9550.0
        if _p_kw > 0.0:
            pt["P_kw"] = _p_kw
    aero = req.aero.model_dump() if req.aero else {}
    car = VehiclePlanar(v, req.tire, req.kc_luts, iz, pt, aero)
    # M19：轮自由度开关（默认关 ⇒ 历史数值逐位不变）
    car.wheel_dof = bool(getattr(req, "wheel_dof", False))
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
                row[f"slip_{w}"] = round(diag[w]["slip_k"], 4)   # M5：纵滑可观（原算出即丢）
                # M19：轮自由度可观（关闭时恒 0，不改变既有输出语义）
                row[f"kappa_{w}"] = round(diag[w]["kappa_qs"], 5)
                row[f"omega_{w}"] = round(diag[w]["omega_qs"], 4)
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
