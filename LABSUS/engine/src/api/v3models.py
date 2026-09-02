"""/api/v3 请求/响应模型（S2 服务层）。

命名约定：请求中的硬点一律使用前端 `dwb-pro-fullchassis.html` 的 DWB 命名
（LCA_F / LCA_R / LBJ / UCA_F / UCA_R / UBJ / WC / TRO / RACK /
STRUT_OUT / RCK_AX_A / RCK_AX_B / STRUT_IN / RCK_DMP / DMP_BODY），
由 v3service 在内部映射为引擎机构点（CH*/UP*/FL1/RK_*）。

坐标系（与前端一致）：X = 外侧（右轮 +X）/ Y = 向前 / Z = 向上。
"""
from __future__ import annotations

import math
from pydantic import BaseModel, Field, field_validator, model_validator

# ── 前端 DWB 硬点键（同 HP_META） ────────────────────────────────────
DWB_KEYS = frozenset({
    "LCA_F", "LCA_R", "LBJ", "UCA_F", "UCA_R", "UBJ", "WC", "TRO",
    "RACK", "STRUT_OUT", "RCK_AX_A", "RCK_AX_B", "STRUT_IN",
    "RCK_DMP", "DMP_BODY",
})


def _check_points_values(points: dict) -> None:
    """F-45（2026-08-30）：硬点值兜底校验 —— 3 分量 + 全部有限。

    pydantic 默认 allow_inf_nan=True，NaN/Inf 硬点可直达求解器（引擎天然
    免疫 NaN 但会报 SOLVER_FAILED；前端 F-01/F-02 防线已补）。这里在
    服务边界统一拒绝非法几何，同时避免超长列表（长度 != 3 直接拒绝）。
    """
    for k, v in points.items():
        if not isinstance(v, (list, tuple)) or len(v) != 3:
            raise ValueError(f"hardpoint {k!r} must be a length-3 list, got {v!r}")
        if not all(math.isfinite(float(c)) for c in v):
            raise ValueError(f"hardpoint {k!r} contains non-finite value: {v!r}")

# 衬套可挂节点：引擎摇臂模型为单枢轴（RCK_AX_A->RK_PIVOT），RCK_AX_B
# 未建模（OpenItem：精确轴方向），挂它的衬套无法解析 -> 明确拒绝。
BUSHING_NODES = frozenset(DWB_KEYS - {"RCK_AX_B"})


class BushingSpec(BaseModel):
    """衬套定义（S2）：挂在某个前端命名节点上的 6DOF 线性衬套。"""
    name: str
    node: str                                # 前端 DWB 命名节点（如 "LCA_F"）
    kT: list[float] = Field(default_factory=lambda: [500.0] * 3)
    kR: list[float] = Field(default_factory=lambda: [8e4] * 3)
    preload: list[float] = Field(default_factory=lambda: [0.0] * 6)

    @model_validator(mode="after")
    def _check(self):
        if self.node not in BUSHING_NODES:
            raise ValueError(f"unsupported bushing node {self.node!r} "
                             f"(engine rocker is single-pivot RCK_AX_A->RK_PIVOT; "
                             f"supported: {sorted(BUSHING_NODES)})")
        if len(self.kT) != 3 or len(self.kR) != 3 or len(self.preload) != 6:
            raise ValueError("kT/kR must be length 3, preload length 6")
        return self


class SweepSpec(BaseModel):
    """扫掠范围（mm 或 N，随工况语义变化）。"""
    min: float = -50.0
    max: float = 50.0
    n: int = Field(default=21, ge=3, le=201)

    @model_validator(mode="after")
    def _check_range(self):
        # F-45（2026-08-30）：min/max 有限性 + 方向校验（允许 min==max 的单点
        # 扫掠——test_bump_no_bushing_matches_pose_consistency 即用 7..7；仅
        # 拒绝 min>max 的反向扫掠）
        if not (math.isfinite(self.min) and math.isfinite(self.max)):
            raise ValueError(f"sweep min/max must be finite: {self.min}/{self.max}")
        if self.min > self.max:
            raise ValueError(f"sweep requires min <= max, got min={self.min} max={self.max}")
        return self


class DesignSpec(BaseModel):
    """设计位轮轴参数（前端 PRESETS cam0/toe0；决定 camber/toe 的绝对基准）。"""
    camber_deg: float = -1.2
    toe_deg: float = 0.05


class CaseLoad(BaseModel):
    """接地点准静态载荷（N / N·mm，全局坐标）。"""
    fx: float = 0.0
    fy: float = 0.0
    fz: float = 3000.0
    mx: float = 0.0
    my: float = 0.0
    mz: float = 0.0


class KandcRequest(BaseModel):
    """K&C 工况请求（bump / roll / steer / compliance 共用）。"""
    points: dict[str, list[float]] | None = None   # 缺省 → PRO 基线
    arch: str = "pushrod"                          # pushrod | pullrod（记录用，机构同构）
    bushings: list[BushingSpec] = Field(default_factory=list)
    sweep: SweepSpec = Field(default_factory=SweepSpec)
    case: CaseLoad = Field(default_factory=CaseLoad)
    design: DesignSpec = Field(default_factory=DesignSpec)
    compliance_axis: str = "fy"                    # compliance 工况扫掠力轴：fx|fy|mz
    tire_radius: float = 325.0                     # 接地点计算
    track_width: float = 1580.0                    # roll 工况两侧轮距（mm）

    @model_validator(mode="after")
    def _check(self):
        if self.points is not None:
            bad = set(self.points) - DWB_KEYS
            if bad:
                raise ValueError(f"unknown hardpoint keys: {sorted(bad)}")
            missing = DWB_KEYS - set(self.points)
            if missing:
                raise ValueError(f"missing hardpoint keys: {sorted(missing)}")
            _check_points_values(self.points)   # F-45：3 分量 + 有限性
        if self.compliance_axis not in ("fx", "fy", "mz"):
            raise ValueError("compliance_axis must be fx|fy|mz")
        return self


class GainsModel(BaseModel):
    """工况增益表（数值随工况不同）。"""
    extra: dict[str, float] = Field(default_factory=dict)


class KandcResponse(BaseModel):
    """K&C 工况响应：曲线 + 增益表 + 可信度状态。"""
    case: str                                    # bump | roll | steer | compliance
    status: str                                  # VALID | APPROXIMATE | SOLVER_FAILED | ...
    ms: float = 0.0
    curves: dict[str, list] = Field(default_factory=dict)
    gains: dict[str, float] = Field(default_factory=dict)
    bushing_deltas: dict[str, list] | None = None
    warnings: list[str] = Field(default_factory=list)


class PoseRequest(BaseModel):
    """单点机制求解请求。"""
    points: dict[str, list[float]] | None = None
    arch: str = "pushrod"
    travel: float = 0.0
    rack: float = 0.0
    tire_radius: float = 325.0
    design: DesignSpec = Field(default_factory=DesignSpec)

    @model_validator(mode="after")
    def _check(self):
        if self.points is not None:
            bad = set(self.points) - DWB_KEYS
            if bad:
                raise ValueError(f"unknown hardpoint keys: {sorted(bad)}")
            missing = DWB_KEYS - set(self.points)
            if missing:
                raise ValueError(f"missing hardpoint keys: {sorted(missing)}")
            _check_points_values(self.points)   # F-45：3 分量 + 有限性
        return self


class PoseResponse(BaseModel):
    """单点求解响应：姿态 + 定位角。"""
    status: str
    ms: float = 0.0
    residual_mm: float = 0.0
    travel: float = 0.0
    rack: float = 0.0
    pose: dict[str, list[float]] = Field(default_factory=dict)   # {引擎点: [x,y,z]}
    metrics: dict[str, float] = Field(default_factory=dict)      # cam/toe/kpi/cast/scrub/trail/...
    rocker: dict | None = None
    warnings: list[str] = Field(default_factory=list)


# ── 整车分析（S2-5：四角装配 + 准静态载荷转移，镜像单文件版 solveQuasiStatic） ──

class ArbSpec(BaseModel):
    """横向稳定杆（每轴）。d<=0.5 视为拆除。"""
    d: float = 18.0              # 直径 mm
    t: float = 0.55              # 连杆位置比（LCA_F→LBJ 插值）
    dy: float = 50.0             # 纵向偏置 mm
    dz: float = 120.0            # 高度偏置 mm
    G: float = 79000.0           # 剪切模量 MPa


class KwCurve(BaseModel):
    """轮端刚度-行程特性（quasi 侧倾耦合迭代用）。

    travel mm / kw N/mm；由前端随 payload 下发（前端扫掠 kw=kS·mr(tr)²）。
    P2（2026-08-22）：STRUT_OUT OpenItem 关闭（rocker 真实三维轴 RCK_AX_A→B +
    strut_attach 按 arch 对齐前端），引擎已可用 mr_at_zero 权威推导 MR 与
    常数 kw；kw_curve 通道保留为**可选细化**（真实 mr(tr)² 曲率），缺省
    回退常数 kS·(engine_mr)²，不再依赖前端曲线才能工作。
    """
    travel: list[float]
    kw: list[float]

    @model_validator(mode="after")
    def _check(self):
        if len(self.travel) != len(self.kw) or len(self.travel) < 2:
            raise ValueError("kw_curve travel/kw must be equal length >= 2")
        if any(k <= 0 for k in self.kw):
            raise ValueError("kw_curve values must be > 0 (N/mm)")
        return self


class AxleSpec(BaseModel):
    """单轴（右轮）定义；左轮由镜像生成。

    arch（P2，2026-08-22 起为功能参数）：pushrod → STRUT_OUT 挂下臂（前端
    FRONT strutOutAttach:"lca"）；pullrod → 挂上臂（REAR:"uca"）；其余 → knuckle
    （up4 固定转向节，历史行为）。
    """
    points: dict[str, list[float]]          # 15 键 DWB 命名
    arch: str = "pushrod"                   # pushrod|pullrod（→ strut 附着拓扑）
    camber_deg: float = -1.2
    toe_deg: float = 0.05
    tire_radius: float = 325.0
    spring_rate: float = 110.0              # kS N/mm
    spring_mass_kg: float = 330.0           # 本轴簧载质量（CG 分配用）
    unsprung_kg: float = 38.0               # mU 单侧
    motion_ratio: float | None = None       # 缺省 → 引擎 mr_at_zero 数值推导
    kw_curve: KwCurve | None = None         # 缺省 → 常数 kw = kS·mr²（见 KwCurve）
    arb: ArbSpec = Field(default_factory=ArbSpec)


class VehicleSpec(BaseModel):
    wheelbase_mm: float = 2750.0
    mass_kg: float = 1420.0                 # mTotal
    sprung_mass_kg: float = 1260.0          # mS
    hcg_mm: float = 350.0
    hs_mm: float = 370.0                    # 簧载质心高
    front: AxleSpec
    rear: AxleSpec


class QuasiInputs(BaseModel):
    gy: float = 0.0                         # 侧向加速度 g
    gx: float = 0.0                         # 纵向加速度 g（+ 加速）
    aero_force_n: float = 0.0
    aero_bias: float = 0.5                  # 前轴气动分配


class CornerTravel(BaseModel):
    fl: float = 0.0
    fr: float = 0.0
    rl: float = 0.0
    rr: float = 0.0


class ChassisRequest(BaseModel):
    """整车分析请求（solve 单点 / kandc 扫掠共用）。"""
    vehicle: VehicleSpec
    quasi: QuasiInputs = Field(default_factory=QuasiInputs)
    travel: CornerTravel = Field(default_factory=CornerTravel)
    rack: float = 0.0
    sweep: SweepSpec = Field(default_factory=lambda: SweepSpec(min=-50, max=50, n=21))
    # 轮胎 MF 参数：稳态不足转向梯度（US Gradient）用（前向引用，文件末尾 rebuild）
    tire: "TireParams" = Field(default_factory=lambda: TireParams())

    @model_validator(mode="after")
    def _check(self):
        for ax in (self.vehicle.front, self.vehicle.rear):
            bad = set(ax.points) - DWB_KEYS
            if bad:
                raise ValueError(f"unknown axle hardpoint keys: {sorted(bad)}")
            missing = DWB_KEYS - set(ax.points)
            if missing:
                raise ValueError(f"missing axle hardpoint keys: {sorted(missing)}")
            _check_points_values(ax.points)   # F-45：3 分量 + 有限性
        return self


class ChassisLoads(BaseModel):
    """准静态载荷转移输出（镜像 solveQuasiStatic）。"""
    roll_deg: float = 0.0
    roll_grad_deg_per_g: float = 0.0
    kphi_f: float = 0.0                      # N·m/°
    kphi_r: float = 0.0
    kphi_tot: float = 0.0
    arb_share_f: float = 0.0                 # %
    arb_share_r: float = 0.0
    dFz_u_f: float = 0.0                     # 非簧载直接转移
    dFz_geo_f: float = 0.0                   # RC 几何力矩
    dFz_elas_f: float = 0.0                  # 弹性力矩
    dFz_f_tot: float = 0.0
    dFz_u_r: float = 0.0
    dFz_geo_r: float = 0.0
    dFz_elas_r: float = 0.0
    dFz_r_tot: float = 0.0
    dFz_long: float = 0.0                    # 纵向转移
    tlltd_pct: float = 50.0
    fz: dict[str, float] = Field(default_factory=dict)   # FL/FR/RL/RR
    # 稳态不足转向梯度（线性区，含载荷敏感性：真实四轮载荷下的侧偏刚度）
    us_grad_deg_per_g: float = 0.0           # (αf−αr)/ay；|gy|<0.02 时不可信，置 0
    alpha_f_deg: float = 0.0                 # 前轴侧偏角 @当前工况（线性近似）
    alpha_r_deg: float = 0.0
    # Jacking 效应：侧向力经 RC 传递的垂向分量（正 = 抬升簧载）
    jacking_f_n: float = 0.0
    jacking_heave_mm: float = 0.0


class ChassisPoseResponse(BaseModel):
    status: str
    ms: float = 0.0
    pose: dict[str, dict] = Field(default_factory=dict)     # FL/FR/RL/RR → 定位角
    attitude: dict[str, float] = Field(default_factory=dict)  # heave/roll/pitch
    loads: ChassisLoads = Field(default_factory=ChassisLoads)
    mr: dict[str, float] = Field(default_factory=dict)
    # 不足转向特性 δ-ay 扫掠（gy 0→2g 均匀 21 点；与 loads.us_grad 同口径）
    us_curve: dict[str, list] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ChassisSweepResponse(BaseModel):
    case: str
    status: str
    ms: float = 0.0
    curves: dict[str, list] = Field(default_factory=dict)
    gains: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


# ── 整车瞬态赛道仿真（S3-1：平面 3-DOF + 四轮 MF + 准静态载荷转移） ──

class TrackPoint(BaseModel):
    """赛道中心线点（世界坐标 m，target_speed m/s）。"""
    x: float
    y: float
    target_speed: float = 15.0

    @model_validator(mode="after")
    def _check(self):
        # F-45：target_speed 必须有限且 >= 0（负速度会使松弛/漂移模型无意义）
        if not math.isfinite(self.x) or not math.isfinite(self.y):
            raise ValueError(f"track point must be finite: ({self.x}, {self.y})")
        if not math.isfinite(self.target_speed) or self.target_speed < 0:
            raise ValueError(f"target_speed must be finite >= 0, got {self.target_speed}")
        return self


class TireParams(BaseModel):
    """四轮共用的 MF 参数（缺省 = tire_mf 默认）。μ 由 Fy0/FzNom 推导用于摩擦圆。

    G24（2026-09-02）：缺省值换为真实 GT3 光头胎量级。旧缺省 Fy0=8000 / By=9 是
    “先填个数让代码跑起来”的占位值，两处不真实：
      • μ = 8000/3500 = 2.29 —— 真实赛车胎峰值摩擦 1.5~1.6；2.29 意味着无空力
        的干地也能跑 2.29g，物理上做不到。
      • By = 9 —— 配合 Cy=1.2/Ey=-0.5 使峰值出现在侧偏角 17.87°，真实光头胎
        6~10°。后果：车需侧滑到 18° 才拿到满拓地力，实测前轴已过峰值饱和
        （20.5°）而后轴只用 23%（4.2°）⇒ 深度不足转向，自动驾驶在弯里爬（47km/h）。
    新缺省：μ = 5250/3500 = 1.50；By = 20 ⇒ 峰值侧偏角 atan(2.901/20) = 8.27°，
    峰值滑移率 2.901/(20×1.2) = 12.1%（真实胎 8~15%）。
    Cy/Ey/LS/FzNom 保留：LS=0.10 即“载荷翻倍 μ 降 10%”，已在真实量级。
    注：s_peak=2.901 仅由 Cy/Ey 定（解 1.5s−0.5·atan s = tan(π/(2Cy))），
    故调 By 就是线性地调峰值侧偏角。"""
    Fy0: float = 5250.0
    By: float = 20.0
    Cy: float = 1.2
    Ey: float = -0.5
    Sh: float = 0.0
    Sv: float = 0.0
    FzNom: float = 3500.0
    LS: float = 0.10               # 载荷敏感性（重载 μ 递减；0 = 线性基线）
    Cg: float = 6.0                # 外倾推力系数 1/rad（Fy += -Cg·γ·Fz）
                                   # G24-S3（2026-09-02）：0.5 → 6.0。0.5 只给 1750 N/rad
                                   # @ FzNom（真实 15~25 kN/rad），实测 camber 对总侧向力
                                   # 贡献 <3% ⇒ 调悬架几何改不动圈速（lap 回归 Δ=0.012%）。
                                   # 6.0 @ FzNom=3500 给 21 000 N/rad，入真实量级。
                                   # ⚠ 提级必须与摩擦圆钳位同来：线性外倾项在 MF 力之外
                                   #   叠加会顶破 μ·Fz（transient.wheel_force 用
                                   #   lat_avail=sqrt(μfz²-fx²) 钳位，前端 11-stages.js 同式）。
    Ls: float = 0.35               # 侧偏松弛长度 m（瞬态一阶滞后）

    @model_validator(mode="after")
    def _check(self):
        # F-45：FzNom=0 → tire_mf._d 除零；By<=0 → MF 形状退化；Cg/Ls 需有限
        if not math.isfinite(self.FzNom) or self.FzNom <= 0:
            raise ValueError(f"FzNom must be finite > 0, got {self.FzNom}")
        if not math.isfinite(self.By) or self.By <= 0:
            raise ValueError(f"By must be finite > 0, got {self.By}")
        for name, val in (("Cg", self.Cg), ("Ls", self.Ls), ("Fy0", self.Fy0)):
            if not math.isfinite(val):
                raise ValueError(f"{name} must be finite, got {val}")
        return self


class PowertrainParams(BaseModel):
    """动力总成（S3-1 升级）：恒扭矩-恒功率包络 + 制动分配。"""
    T_max: float = 250.0           # 峰值扭矩 N·m
    P_kw: float = 80.0             # 峰值功率 kW
    drive_split_f: float = 0.0     # 前轴驱动比例（0=纯后驱）
    brake_split_f: float = 0.6     # 前轴制动分配（剩余给后轴）


class AeroParams(BaseModel):
    """气动（S3-1 升级 + P2a 双端统一标定，2026-09-02）：

    基础：下压力/阻力随 v²，k 单位 N/(m/s)²。
    P2a 新增两链（与前端 qs ge*/drs* 同构）：
    - cl(h)：ge(h) = clamp(1 + ge_gain·(href/max(h,hmin) − 1), floor, 1+ge_gain·(href/hmin−1))，
      h 为该轴车底净高 m（平面模型无 heave 状态，用名义 ge_h0_mm ± 姿态俯仰估计）；
    - DRS：开翼削总阻力 ×drs_cd_scale、后轴 cl ×drs_cl_scale（尾翼襟翼物理），
      直道（局部曲率半径 > drs_curve_radius_m）且 vx > drs_v_ms 自动触发。
    向后兼容：缺省 ge_gain=0（h 无效应）⇒ 未显式配置新字段的旧请求行为不变。
    """
    k_down_f: float = 0.55         # 前轴下压力系数
    k_down_r: float = 0.45         # 后轴下压力系数
    k_drag: float = 0.35           # 纵向阻力系数
    # ── P2a cl(h) 地面效应（高度敏感）──
    ge_gain: float = 0.0           # 高度敏感强度；0 = 关闭（向后兼容缺省）
    ge_h0_mm: float = 100.0        # 名义车底净高 mm（h_f/h_r 姿态基准）
    ge_href_mm: float = 100.0      # ge=1 参考高 mm（h=href 时无增强）
    ge_hmin_mm: float = 30.0       # 车底净高下限 mm（触底防护，增强在此饱和）
    ge_floor: float = 0.80         # 高 h 下压衰减下限（cl 不归零）
    # ── P2a DRS 尾翼 ──
    drs_v_ms: float = 40.0         # 开翼速度阈值 m/s（前端预设同构，~144 km/h）
    drs_cd_scale: float = 0.72     # 开翼总阻力缩放（−28%）
    drs_cl_scale: float = 0.90     # 开翼后轴 cl 缩放（−10%）
    drs_curve_radius_m: float = 300.0   # 直道判定：局部曲率半径下限 m


class TrackSimRequest(BaseModel):
    """赛道瞬态仿真请求。

    kc_luts：前端下发的 K&C 查表（与 KwCurve 同源思路）：
      {"front": {"travel": [mm...], "toe": [deg...], "cam": [deg...]}, "rear": {...}}
      缺省 toe/cam = 0（LUT 影响关闭）；travel 索引由准静态侧倾角×半轮距给出。
    """
    vehicle: VehicleSpec
    track: list[TrackPoint] = Field(min_length=2)
    dt: float = Field(0.01, gt=1e-4, le=0.05)
    sim_time: float = Field(30.0, gt=0.0, le=300.0)
    kc_luts: dict[str, dict[str, list[float]]] = Field(default_factory=dict)
    tire: TireParams = Field(default_factory=TireParams)
    powertrain: PowertrainParams = Field(default_factory=PowertrainParams)
    aero: AeroParams = Field(default_factory=AeroParams)
    iz_kg_m2: float | None = None          # 缺省 ≈ m(L²+t̄²)/12
    lookahead_gain: float = 0.9            # 纯追踪预视距离 = 3 + gain·vx（m）
    start_speed: float = 5.0               # 初始车速 m/s

    @model_validator(mode="after")
    def _check_luts(self):
        for ax, lut in self.kc_luts.items():
            if ax not in ("front", "rear"):
                raise ValueError(f"kc_luts axis must be front|rear, got {ax!r}")
            for key in ("travel",):
                if key in lut and len(lut[key]) < 2:
                    raise ValueError("kc_luts travel needs >= 2 points")
            for key in ("toe", "cam"):
                if key in lut and "travel" in lut and len(lut[key]) != len(lut["travel"]):
                    raise ValueError(f"kc_luts {ax}.{key} length must match travel")
        return self


class TrackSimResponse(BaseModel):
    status: str
    ms: float = 0.0
    steps: int = 0
    finished: bool = False
    t: list[float] = Field(default_factory=list)
    trace: list[dict] = Field(default_factory=list)
    summary: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


# ── 轮胎实测数据 → MF 参数辨识（真实开发数据链，讲义 EP08）──

class TireCurve(BaseModel):
    """单一载荷层级的侧偏扫掠实测曲线：α[°] 与 |Fy|[N]（对称，取绝对值拟合）。"""
    fz: float = Field(gt=0)                      # 该层级法向载荷 N
    alpha_deg: list[float] = Field(min_length=5)
    fy: list[float] = Field(min_length=5)

    @model_validator(mode="after")
    def _check(self):
        if len(self.alpha_deg) != len(self.fy):
            raise ValueError("alpha_deg/fy length must match")
        if not all(math.isfinite(v) for v in self.alpha_deg):
            raise ValueError("alpha_deg must be finite")
        if not all(math.isfinite(v) for v in self.fy):
            raise ValueError("fy must be finite")
        return self


class TireFitRequest(BaseModel):
    """MF 辨识请求：≥1 个载荷层级；LS 辨识需 ≥2 个不同层级。"""
    curves: list[TireCurve] = Field(min_length=1)
    fit_ls: bool = True


class TireFitResponse(BaseModel):
    status: str                                   # VALID / SOLVER_FAILED / NOT_APPLICABLE
    ms: float = 0.0
    params: TireParams | None = None              # 辨识出的 MF 子集参数（可直接回传仿真）
    rms_pct: float | None = None                  # 归一残差 RMS（% of 各层级峰值）
    per_load_rms_pct: dict[str, float] = Field(default_factory=dict)
    n_points: int = 0
    n_loads: int = 0
    note: str = ""


# ChassisRequest.tire 前向引用解析（TireParams 定义在本文件后部）
ChassisRequest.model_rebuild()