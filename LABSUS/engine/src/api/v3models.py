"""/api/v3 请求/响应模型（S2 服务层）。

命名约定：请求中的硬点一律使用前端 `dwb-pro-fullchassis.html` 的 DWB 命名
（LCA_F / LCA_R / LBJ / UCA_F / UCA_R / UBJ / WC / TRO / RACK /
STRUT_OUT / RCK_AX_A / RCK_AX_B / STRUT_IN / RCK_DMP / DMP_BODY），
由 v3service 在内部映射为引擎机构点（CH*/UP*/FL1/RK_*）。

坐标系（与前端一致）：X = 外侧（右轮 +X）/ Y = 向前 / Z = 向上。
"""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

# ── 前端 DWB 硬点键（同 HP_META） ────────────────────────────────────
DWB_KEYS = frozenset({
    "LCA_F", "LCA_R", "LBJ", "UCA_F", "UCA_R", "UBJ", "WC", "TRO",
    "RACK", "STRUT_OUT", "RCK_AX_A", "RCK_AX_B", "STRUT_IN",
    "RCK_DMP", "DMP_BODY",
})


class BushingSpec(BaseModel):
    """衬套定义（S2）：挂在某个前端命名节点上的 6DOF 线性衬套。"""
    name: str
    node: str                                # 前端 DWB 命名节点（如 "LCA_F"）
    kT: list[float] = Field(default_factory=lambda: [500.0] * 3)
    kR: list[float] = Field(default_factory=lambda: [8e4] * 3)
    preload: list[float] = Field(default_factory=lambda: [0.0] * 6)

    @model_validator(mode="after")
    def _check(self):
        if self.node not in DWB_KEYS:
            raise ValueError(f"unknown bushing node {self.node!r} (DWB keys: {sorted(DWB_KEYS)})")
        if len(self.kT) != 3 or len(self.kR) != 3 or len(self.preload) != 6:
            raise ValueError("kT/kR must be length 3, preload length 6")
        return self


class SweepSpec(BaseModel):
    """扫掠范围（mm 或 N，随工况语义变化）。"""
    min: float = -50.0
    max: float = 50.0
    n: int = Field(default=21, ge=3, le=201)


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
    引擎 STRUT_OUT 拓扑与前端不一致（OpenItem），自身 damper 链推不出可信
    kw 迁移 → 前端曲线优先，缺省回退常数 kS·motion_ratio²。拓扑对齐后可撤。
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
    """单轴（右轮）定义；左轮由镜像生成。"""
    points: dict[str, list[float]]          # 15 键 DWB 命名
    arch: str = "pushrod"
    camber_deg: float = -1.2
    toe_deg: float = 0.05
    tire_radius: float = 325.0
    spring_rate: float = 110.0              # kS N/mm
    spring_mass_kg: float = 330.0           # 本轴簧载质量（CG 分配用）
    unsprung_kg: float = 38.0               # mU 单侧
    motion_ratio: float | None = None       # 缺省 → 引擎推 MR@0
    kw_curve: KwCurve | None = None         # 缺省 → 常数 kw（见 KwCurve）
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

    @model_validator(mode="after")
    def _check(self):
        for ax in (self.vehicle.front, self.vehicle.rear):
            bad = set(ax.points) - DWB_KEYS
            if bad:
                raise ValueError(f"unknown axle hardpoint keys: {sorted(bad)}")
            missing = DWB_KEYS - set(ax.points)
            if missing:
                raise ValueError(f"missing axle hardpoint keys: {sorted(missing)}")
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


class ChassisPoseResponse(BaseModel):
    status: str
    ms: float = 0.0
    pose: dict[str, dict] = Field(default_factory=dict)     # FL/FR/RL/RR → 定位角
    attitude: dict[str, float] = Field(default_factory=dict)  # heave/roll/pitch
    loads: ChassisLoads = Field(default_factory=ChassisLoads)
    mr: dict[str, float] = Field(default_factory=dict)
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


class TireParams(BaseModel):
    """四轮共用的 MF 参数（缺省 = tire_mf 默认）。μ 由 Fy0/FzNom 推导用于摩擦圆。"""
    Fy0: float = 8000.0
    By: float = 9.0
    Cy: float = 1.2
    Ey: float = -0.5
    Sh: float = 0.0
    Sv: float = 0.0
    FzNom: float = 3500.0


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