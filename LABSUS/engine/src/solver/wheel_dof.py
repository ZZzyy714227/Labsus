"""逐轮转速自由度（M18 / G48，2026-09-20）—— 引擎状态扩容的地基件

为什么需要它
────────────
引擎瞬态求解器 `transient.py` 的状态是**平面 6 状态** `[X, Y, ψ, vx, vy, r]`：
**没有轮转自由度**，纵向"滑移率"是由轮心速度算出的**开环量**（`slip_k = (vx − vx_w)/max(vx,0.5)`），
既不是轮速状态、也无法反映驱动/制动扭矩与地面力之间的平衡。后果有三：

1. **滑差式差速器做不了**（前端 `16-powertrain.js::distributeAxle` 的 `Δω = ω_R − ω_L` 需要真实轮速）
   —— 这是 R-0931 已定的差速器同源方案的硬前提；
2. 驱动/制动无法通过轮胎滑移特性闭环（现在是 `Fx = min(0.75μFz, 动力包络)`，与滑移无关）；
3. 制动锁死、轮抱死、空转等现象无法表达。

本模块只做**轮的转动动力学**，是纯函数、与积分器无关；`transient.py` 接线是下一步。
**默认不启用**（接线时用开关控制），因此现有数值逐位不变。

物理
────
    滑移率   κ = (ω·Re − vx) / max(|vx|, v_min)        v_min = 0.5 m/s（与项目既有下限一致）
    轮动力学 I_eff·dω/dt = T_drive − T_brake·sgn(ω) − Fx·Re
    轮胎对轮的力矩**反向**：地面把车往前推（Fx>0）⇒ 对轮是阻转力矩 −Fx·Re
    制动**不得把轮反向拖动**：一步内若制动足以越过零点，则直接锁死（ω=0），
                    这是"抱死"的正确表现，也避免数值上出现 ω<0 的假自转

惯量口径与前端一致（`11-stages.js:367`、`:920`）：
    I_wheel = max(0.35, 1.2·m/1250)  kg·m²     （FSAE 235kg ⇒ 0.35）
    驱动轮另加传动链反射惯量 I_reflected（前端 `POWERTRAIN.reflectedInertiaPerDriveWheel()`）
"""

from __future__ import annotations

import math
from dataclasses import dataclass

WHEELS = ("FL", "FR", "RL", "RR")
V_MIN = 0.5          # m/s：滑移率分母下限（与项目既有 max(vx,0.5) 口径一致）


def wheel_inertia(mass_kg: float) -> float:
    """单轮转动惯量（kg·m²），与前端 `this.Iw = Math.max(0.35, 1.2*(m/1250))` 同式。"""
    return max(0.35, 1.2 * (mass_kg / 1250.0))


@dataclass(frozen=True)
class WheelDof:
    """一轮的转动状态与参数。状态只有一个量：转速 ω (rad/s)。"""

    omega: float = 0.0              # 转速 rad/s（正 = 前进方向滚动）
    radius_m: float = 0.23          # 有效滚动半径 m
    inertia_kg_m2: float = 0.35     # 轮自身转动惯量
    reflected_kg_m2: float = 0.0    # 传动链反射惯量（仅驱动轮 >0）
    driven: bool = False

    @property
    def effective_inertia(self) -> float:
        return self.inertia_kg_m2 + (self.reflected_kg_m2 if self.driven else 0.0)

    def slip_ratio(self, vx: float) -> float:
        """κ = (ω·Re − vx)/max(|vx|, V_MIN)。κ>0 驱动滑转、κ<0 制动滑移、=0 纯滚动。"""
        return (self.omega * self.radius_m - vx) / max(abs(vx), V_MIN)

    def free_roll_omega(self, vx: float) -> float:
        """纯滚动（κ=0）对应转速。"""
        return vx / self.radius_m

    def omega_dot(self, t_drive: float, t_brake: float, fx: float) -> float:
        """角加速度 rad/s²。`fx` 为地面纵向力（N，正 = 推动车辆前进）。"""
        i_eff = self.effective_inertia
        if i_eff <= 0.0:
            return 0.0
        t_brake_eff = -t_brake * (1.0 if self.omega > 0.0 else (-1.0 if self.omega < 0.0 else 0.0))
        return (t_drive + t_brake_eff - fx * self.radius_m) / i_eff

    def advance(self, t_drive: float, t_brake: float, fx: float, dt: float) -> WheelDof:
        """推进一个步长，返回**新**状态（纯函数，不原地改）。

        制动抱死处理：若本步内制动足以把 ω 拉过零点，则钳到 0（锁定）而不是让它反向自转。
        """
        net = t_drive - fx * self.radius_m          # 作用在轮上的净力矩（不含制动）
        i_eff = self.effective_inertia
        if i_eff <= 0.0:
            return self
        if self.omega == 0.0 and t_brake > 0.0:
            # ⚠ 抱死/静止状态必须按**静摩擦**处理：`sign(0)=0` 会让制动在 ω=0 处失效，
            # 地面力随即把轮重新甩起来（初版就漏了这一步，抱死测试当场抓出）。
            if abs(net) <= t_brake:
                return WheelDof(omega=0.0, radius_m=self.radius_m, inertia_kg_m2=self.inertia_kg_m2,
                                reflected_kg_m2=self.reflected_kg_m2, driven=self.driven)
            new_omega = self.omega + (net - math.copysign(t_brake, net)) / i_eff * dt
        else:
            new_omega = self.omega + self.omega_dot(t_drive, t_brake, fx) * dt
            if self.omega != 0.0 and new_omega * self.omega < 0.0 and t_brake > 0.0:
                new_omega = 0.0        # 制动把轮拖到换向 ⇒ 直接抱死（耗散不得致其反转）
        return WheelDof(omega=new_omega, radius_m=self.radius_m, inertia_kg_m2=self.inertia_kg_m2,
                        reflected_kg_m2=self.reflected_kg_m2, driven=self.driven)


def steady_slip_ratio(t_drive: float, cornering_stiffness_n: float, radius_m: float) -> float:
    """线性轮胎 `Fx = Cκ·κ` 下，驱动扭矩达到平衡时的滑移率（解析解，供测试与设计用）。

    `I·dω/dt = T_drive − Fx·Re = 0` ⇒ `Cκ·κ·Re = T_drive` ⇒ `κ = T_drive/(Cκ·Re)`。
    """
    if cornering_stiffness_n <= 0.0 or radius_m <= 0.0:
        return 0.0
    return t_drive / (cornering_stiffness_n * radius_m)


def quasi_steady_slip(fx_demand_n: float, mu_fz_n: float, kappa_peak: float) -> float:
    """准稳态滑移率（**代数解，不积分 ω**）。

    线性轮胎 `Fx = Cκ·κ`，取 `Cκ = μFz/κ_peak`（峰值处恰好达到附着上限）⇒

        κ = clamp(Fx_demand / Cκ, −κ_peak, +κ_peak)

    为什么用代数解而不是积分 ω：轮自由度是**刚性的** ——
    `τ_eff = I·vx/(Cκ·Re²) ≈ 0.55~2.2 ms`（见 `test_step_size_constraint_is_speed_dependent`），
    而引擎子步约 1.6 ms ⇒ 显式积分临界甚至发散。令 `I·dω/dt = 0` 解出 κ 即得稳定、便宜
    且与准静态内核同风格（项目里侧倾/俯仰也由准静态内核代数解）的等价形式。

    ⚠ **已知局限**：`|κ| ≤ κ_peak` ⇒ **完全抱死（κ=−1）在代数形式里表达不出来**；
    抱死/锁死必须走动态形式（`WheelDof.advance`，已单独测试）。
    """
    if mu_fz_n <= 0.0 or kappa_peak <= 0.0:
        return 0.0
    ck = mu_fz_n / kappa_peak
    return max(-kappa_peak, min(kappa_peak, fx_demand_n / ck))


def quasi_steady_omega(vx: float, kappa: float, radius_m: float) -> float:
    """准稳态轮速 ω = vx·(1+κ)/Re（rad/s）。"""
    if radius_m <= 0.0:
        return 0.0
    return vx * (1.0 + kappa) / radius_m
