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