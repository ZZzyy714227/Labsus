"""指标结果模型 — 七状态状态机（设计文档 §P2-3、进展文档 P2-3）。

每个指标必须返回 `MetricResult`，其 status 为 ResultStatus 七状态之一：

    VALID / APPROXIMATE / NOT_APPLICABLE / NOT_IMPLEMENTED /
    SOLVER_FAILED / EQUILIBRIUM_FAILED / OUT_OF_RANGE

约定（禁止 None 空白）：
- value 为数值时 status 必须是 VALID / APPROXIMATE / OUT_OF_RANGE；
- value 为 None 仅允许 status ∈ {NOT_APPLICABLE, NOT_IMPLEMENTED,
  SOLVER_FAILED, EQUILIBRIUM_FAILED}，且 note 说明原因；
- 页面不得因 value=None 而显示空白/误以为已计算。

P2-3 指标状态机：
- VALID          输入满足几何/物理前提，数值可信
- APPROXIMATE    输入接近前提（如残差略超阈值），数值近似
- NOT_APPLICABLE 该指标对当前配置不适用（如无转向输入时 Ackermann）
- NOT_IMPLEMENTED 尚未实现或依赖后续阶段（如 Jacking 依赖 P3 载荷）
- SOLVER_FAILED  求解失败或输入缺失导致无法计算
- EQUILIBRIUM_FAILED 力平衡无法满足（P3 载荷指标使用）
- OUT_OF_RANGE   输入超出适用区间（如全行程残差超阈值）
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from core.models import ResultStatus

_VALUE_STATES = {ResultStatus.VALID, ResultStatus.APPROXIMATE,
                 ResultStatus.OUT_OF_RANGE}


def ok(value: float, unit: str = "", note: str = "") -> MetricResult:
    """便捷构造：数值有效（VALID）。"""
    return MetricResult(key="", value=round(float(value), 6), unit=unit,
                        status=ResultStatus.VALID, note=note)


def not_implemented(key: str, unit: str = "", note: str = "") -> MetricResult:
    return MetricResult(key=key, value=None, unit=unit,
                        status=ResultStatus.NOT_IMPLEMENTED, note=note)


def not_applicable(key: str, unit: str = "", note: str = "") -> MetricResult:
    return MetricResult(key=key, value=None, unit=unit,
                        status=ResultStatus.NOT_APPLICABLE, note=note)


def solver_failed(key: str, unit: str = "", note: str = "") -> MetricResult:
    return MetricResult(key=key, value=None, unit=unit,
                        status=ResultStatus.SOLVER_FAILED, note=note)


class MetricResult(BaseModel):
    """单个指标结果：值 + 单位 + 状态 + 说明。"""
    key: str
    value: float | None = None
    unit: str = ""
    status: ResultStatus = ResultStatus.NOT_IMPLEMENTED
    note: str = ""

    def model_post_init(self, __context) -> None:
        if self.status in _VALUE_STATES and self.value is None:
            raise ValueError(
                f"metric '{self.key}': status {self.status.value} requires a value")
        if self.status not in _VALUE_STATES and self.value is not None:
            raise ValueError(
                f"metric '{self.key}': status {self.status.value} must not carry a value")

    def with_key(self, key: str) -> MetricResult:
        self.key = key
        return self


class MetricSet(BaseModel):
    """一组指标：按域分组 + 结果状态机约束。"""
    axle: dict[str, MetricResult] = Field(default_factory=dict)
    vehicle: dict[str, MetricResult] = Field(default_factory=dict)
    curves: dict[str, list[float | None]] = Field(default_factory=dict)
