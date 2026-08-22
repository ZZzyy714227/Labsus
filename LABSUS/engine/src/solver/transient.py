"""整车平面瞬态动力学（S3-1）：3-DOF 车体 + 四轮 MF + 准静态载荷转移 + 纯追踪驾驶员。

模型范围（诚实声明，见第 10 讲方法论）：
- 车体：平面 5 状态 [X, Y, ψ, vx, vy, r]（世界位置 + 车体系纵/横速度 + 横摆率），
  侧倾/俯仰/轮跳不作为动力学状态——由准静态内核（quasi_loads，P0 统一版）代数解出，
  其侧倾角用于 K&C 查表的行程索引（travel = φ·半轮距 + 该轮静态行程 0）。
- 轮胎：四轮独立魔术公式 Fy(α, Fz)；纵向 Fx 由油门/刹车需求给出并受摩擦圆约束
  （μ = tire.Fy0/FzNom，与 MF 峰值一致——修复第 8 讲"回退 μ 脱钩"观察的约定）。
- 载荷：四轮 Fz 每步调用 quasi_loads（用上一步的 ay/gx，打破代数环——准静态滞后
  一个 dt，物理上对应侧倾建立的时间尺度 ~100ms）。
- 转向：纯追踪（pure pursuit）驾驶员 → 自行车转向角 → 阿克曼分轮；
  前束/外倾由 K&C 查表叠加（toe 进侧偏角、cam 暂不进 MF——子集无外倾项，仅记录）。
- 积分：RK2（中点法），dt 默认 0.01s；速度钳位防发散。

单位纪律（第 1 讲）：本模块全程 SI（m / m/s / N / rad / kg·m²）；
K&C 查表入口 mm/deg → 内部换算一次性完成。
"""
from __future__ import annotations

import math
import time

import numpy as np

from src.api.chassis import axle_rc_sweep, quasi_loads
from src.api.v3models import QuasiInputs, TrackSimRequest, TireParams, VehicleSpec
from src.tire_mf import MagicFormulaSub, load_tir_params

R2D = 180.0 / math.pi
D2R = math.pi / 180.0
G = 9.81

# 车轮布局（车体系：x 前 / y 右）：位置 + 是否转向轮 + 驱动轮标记
_WHEELS = ("FR", "FL", "RR", "RL")


def _lut(lut: dict, travel_mm: float, key: str, default: float) -> float:
    """K&C 查表（mm/deg），端点钳位；缺键 → default。"""
    if not lut or key not in lut or "travel" not in lut:
        return default
    xs = np.asarray(lut["travel"], float)
    ys = np.asarray(lut[key], float)
    if len(xs) != len(ys) or len(xs) < 2:
        return default
    return float(np.interp(travel_mm, xs, ys))


class VehiclePlanar:
    """平面 3-DOF 整车：力/运动学计算 + RK2 步进。"""

    def __init__(self, vehicle: VehicleSpec, tire: TireParams,
                 kc_luts: dict, iz: float):
        self.v = vehicle
        self.tires = {w: MagicFormulaSub(load_tir_params(tire.model_dump())) for w in _WHEELS}
        self.mu = tire.Fy0 / tire.FzNom          # 摩擦圆预算与 MF 峰值同源（第 8 讲约定）
        self.lut_f = kc_luts.get("front", {})
        self.lut_r = kc_luts.get("rear", {})
        self.iz = iz

        # 纵向几何（与 chassis.py 记账一致：a=CG→前轴 / b=CG→后轴）
        f_ms, r_ms = vehicle.front.spring_mass_kg, vehicle.rear.spring_mass_kg
        self.L = vehicle.wheelbase_mm / 1000.0
        self.b = self.L * (r_ms / (f_ms + r_ms))
        self.a = self.L - self.b
        self.hf = abs(vehicle.front.points["WC"][0]) / 1000.0   # 半轮距
        self.hr_ = abs(vehicle.rear.points["WC"][0]) / 1000.0
        self.pos = {                           # 车体系轮心位置 (x前, y右)
            "FR": (self.a, +self.hf), "FL": (self.a, -self.hf),
            "RR": (-self.b, +self.hr_), "RL": (-self.b, -self.hr_),
        }
        # 准静态内核依赖（MR/RC）：一次构建，步进中复用
        self.mr = {"front": vehicle.front.motion_ratio or 0.75,
                   "rear": vehicle.rear.motion_ratio or 0.78}
        swf = axle_rc_sweep(vehicle.front)
        swr = axle_rc_sweep(vehicle.rear)
        rc0 = lambda sw: float(np.interp(0.0, sw["travel"],
                                         [v if v is not None else 55.0 for v in sw["rc_h"]]))
        self.rcH = {"FR": rc0(swf), "RR": rc0(swr)}             # mm
        self.rc_sw = {"front": swf, "rear": swr}
        self.prev_ay = 0.0
        self.prev_ax = 0.0

    # ── 四轮载荷（准静态内核，上一步加速度打破代数环） ──────────────
    def wheel_loads(self) -> dict[str, float]:
        q = QuasiInputs(gy=self.prev_ay / G, gx=self.prev_ax / G)
        loads = quasi_loads(self.v, q, self.mr, self.rcH, self.rc_sw)
        self.roll_deg = loads.roll_deg
        return dict(loads.fz)                                   # {FL,FR,RL,RR} N

    # ── 阿克曼分轮 ─────────────────────────────────────────────────
    def steer_angles(self, delta: float) -> dict[str, float]:
        if abs(delta) < 1e-6:
            return {"FR": 0.0, "FL": 0.0}
        R = self.L / math.tan(delta)                            # 右转 δ>0 → 圆心在 +y
        sgn = 1.0 if R > 0 else -1.0
        R = abs(R)
        d_in = math.atan(self.L / max(0.5, R - self.hf))        # 内侧（转向侧）角更大
        d_out = math.atan(self.L / (R + self.hf))
        return {"FR": sgn * d_in if sgn > 0 else sgn * d_out,
                "FL": sgn * d_out if sgn > 0 else sgn * d_in}

    # ── 单轮力求：侧偏角 → MF → 摩擦圆 → 车体系分量 ────────────────
    def wheel_force(self, w: str, vx_w: float, vy_w: float, delta: float,
                    fz: float, throttle: float, brake: float) -> dict:
        lut = self.lut_f if w in ("FR", "FL") else self.lut_r
        travel_mm = math.radians(getattr(self, "roll_deg", 0.0)) * \
            abs(self.pos[w][1]) * 1000.0                        # φ·|y|（外侧压缩为正）
        toe_deg = _lut(lut, travel_mm, "toe", 0.0)
        cam_deg = _lut(lut, travel_mm, "cam", 0.0)              # 记录（MF 子集无外倾项）
        d = delta + toe_deg * D2R                               # 有效指向角

        cd, sd = math.cos(d), math.sin(d)
        vwx = vx_w * cd + vy_w * sd                             # 轮体系速度分量
        vwy = -vx_w * sd + vy_w * cd
        speed = math.hypot(vwx, vwy)
        if speed < 0.8 or fz <= 1.0:
            alpha_deg, fy_w, fx_w = 0.0, 0.0, 0.0
        else:
            alpha_deg = math.degrees(math.atan2(vwy, max(abs(vwx), 0.5)))
            fy_w = -float(self.tires[w].fy(alpha_deg, fz))      # 力对抗侧滑（稳定性符号）
            # 纵向：驱动（后轮）/ 制动（四轮 60/40），受摩擦圆预算约束
            mu_fz = self.mu * fz
            fx_w = 0.0
            if w in ("RR", "RL") and throttle > 0:
                fx_w = min(throttle * 5000.0, 0.95 * mu_fz)
            if brake > 0:
                share = 0.30 if w in ("FR", "FL") else 0.20
                fx_w = -math.copysign(brake * share * 12000.0, vwx)
                fx_w = max(-mu_fz, min(mu_fz, fx_w))
            # 摩擦圆：侧向可用 = √(预算² − Fx²)
            lat_avail = math.sqrt(max(0.0, mu_fz * mu_fz - fx_w * fx_w))
            fy_w = max(-lat_avail, min(lat_avail, fy_w))
        # 轮系 → 车体系
        return {"fx": fx_w * cd - fy_w * sd, "fy": fx_w * sd + fy_w * cd,
                "alpha": alpha_deg, "toe": toe_deg, "cam": cam_deg, "fz": fz}

    # ── 状态导数（车体系牛顿-欧拉，平面） ───────────────────────────
    def derivs(self, s: np.ndarray, delta: float, throttle: float,
               brake: float) -> tuple[np.ndarray, dict]:
        vx, vy, r = s[3], s[4], s[5]
        fz = self.wheel_loads()
        steer = self.steer_angles(delta)
        Fx = Fy = Mz = 0.0
        diag = {}
        for w in _WHEELS:
            lx, ly = self.pos[w]
            vx_w = vx - r * ly                                  # 刚体轮心速度（车体系）
            vy_w = vy + r * lx
            fw = self.wheel_force(w, vx_w, vy_w, steer.get(w, 0.0), fz[w],
                                  throttle, brake)
            Fx += fw["fx"]
            Fy += fw["fy"]
            Mz += lx * fw["fy"] - ly * fw["fx"]
            diag[w] = fw
        m = self.v.mass_kg
        ax = Fx / m + r * vy
        ay = Fy / m - r * vx
        ar = Mz / self.iz
        return np.array([0.0, 0.0, 0.0, ax, ay, ar]), diag

    def step(self, s: np.ndarray, dt: float, delta: float, throttle: float,
             brake: float) -> tuple[np.ndarray, dict]:
        # RK2 中点法
        k1, diag = self.derivs(s, delta, throttle, brake)
        mid = s + 0.5 * dt * k1
        mid[3:] = np.clip(mid[3:], -90.0, 90.0)
        k2, _ = self.derivs(mid, delta, throttle, brake)
        s2 = s + dt * k2
        s2[3:] = np.clip(s2[3:], -90.0, 90.0)
        # 世界系运动学：ψ̇ = r（z 上，右手：r>0 = 顺时针俯视 = 向右转）
        psi = s2[2]
        s2[0] += dt * (s2[3] * math.cos(psi) - s2[4] * math.sin(psi))
        s2[1] += dt * (s2[3] * math.sin(psi) + s2[4] * math.cos(psi))
        s2[2] += dt * s2[5]
        self.prev_ax = k2[3] - s2[5] * s2[4]
        self.prev_ay = k2[4] + s2[5] * s2[3]
        return s2, diag


# ── 纯追踪驾驶员 + 速度控制器 ─────────────────────────────────────

def _closest_idx(track_xy: np.ndarray, p: np.ndarray, start: int) -> int:
    d = np.linalg.norm(track_xy[start:] - p, axis=1)
    return start + int(np.argmin(d))


def _lookahead_point(track_xy: np.ndarray, idx: int, ld: float) -> np.ndarray:
    """沿折线从 idx 前进 ld 米的预视点。"""
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


def driver(track_xy: np.ndarray, state: np.ndarray, idx: int, v_target: float,
           L: float, gain: float) -> tuple[float, float, float, int]:
    x, y, psi, vx = state[0], state[1], state[2], state[3]
    idx = _closest_idx(track_xy, np.array([x, y]), idx)
    ld = float(np.clip(3.0 + gain * vx, 4.0, 18.0))
    tgt = _lookahead_point(track_xy, idx, ld)
    dx, dy = tgt[0] - x, tgt[1] - y
    c, s = math.cos(psi), math.sin(psi)
    lx = dx * c + dy * s                                        # 预视点车体系坐标
    ly = -dx * s + dy * c
    alpha_ld = math.atan2(ly, max(lx, 1.0))
    delta = math.atan2(2.0 * L * math.sin(alpha_ld), ld)   # δ = atan(L/R_pp), R_pp = ld/(2sinα)
    e = v_target - vx
    throttle = float(np.clip(0.35 * e, 0.0, 1.0))
    brake = float(np.clip(-0.25 * e - 0.1, 0.0, 1.0)) if e < -0.5 else 0.0
    return delta, throttle, brake, idx


# ── 主入口（供 server 调用） ───────────────────────────────────────

def run_track_sim(req: TrackSimRequest) -> dict:
    t0 = time.perf_counter()
    v = req.vehicle
    track_xy = np.array([[p.x, p.y] for p in req.track], float)
    tgt_speed = np.array([p.target_speed for p in req.track], float)
    L = v.wheelbase_mm / 1000.0
    iz = req.iz_kg_m2 or v.mass_kg * (L * L + 1.6 * 1.6) / 12.0
    car = VehiclePlanar(v, req.tire, req.kc_luts, iz)

    state = np.zeros(6)
    state[3] = req.start_speed
    # 起始朝向沿第一段
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
    for k in range(n_steps):
        t = k * req.dt
        v_target = float(tgt_speed[min(idx, len(tgt_speed) - 1)])
        delta, throttle, brake, idx = driver(track_xy, state, idx, v_target,
                                             L, req.lookahead_gain)
        if throttle < 0.02 and brake < 0.02 and abs(v_target - state[3]) > 0.5:
            throttle = 0.05                                    # 防静止死锁的微油
        state, diag = car.step(state, req.dt, delta, throttle, brake)
        max_ay = max(max_ay, abs(car.prev_ay))
        if k % keep == 0 or k == n_steps - 1:
            row = {"t": round(t, 4), "x": round(state[0], 3), "y": round(state[1], 3),
                   "psi": round(state[2], 4), "vx": round(state[3], 3),
                   "vy": round(state[4], 3), "r": round(state[5], 4),
                   "roll": round(getattr(car, "roll_deg", 0.0), 3),
                   "ay": round(car.prev_ay, 2), "delta": round(delta, 4),
                   "throttle": round(throttle, 2), "brake": round(brake, 2)}
            for w in _WHEELS:
                row[f"alpha_{w}"] = round(diag[w]["alpha"], 3)
                row[f"fz_{w}"] = round(diag[w]["fz"], 1)
                row[f"fy_{w}"] = round(diag[w]["fy"], 1)
                row[f"fx_{w}"] = round(diag[w]["fx"], 1)
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
    return {
        "status": "VALID" if np.isfinite(state).all() else "SOLVER_FAILED",
        "ms": (time.perf_counter() - t0) * 1000.0,
        "steps": len(ts), "finished": finished,
        "t": ts, "trace": trace,
        "summary": {"path_length_m": round(float(seg), 1),
                    "v_end": round(float(state[3]), 2),
                    "v_max": round(max((p["vx"] for p in trace), default=0.0), 2),
                    "max_ay_g": round(max_ay / G, 3)},
        "warnings": warnings,
    }
