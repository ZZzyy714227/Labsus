"""K&C 两层迭代求解器（S1 引擎内核·分水岭）。

内层：衬套位移 δ 写入锚点（小角刚体变换）→ solve_pose（现有 least_squares TRF 机构投影）。
外层：δ 上力平衡 r(δ) = f_ext − bush_force(δ)（TRF + 数值雅可比）。
状态机：VALID / APPROXIMATE（最小范数超静定）/ COMPLIANCE_DIVERGED / SOLVER_FAILED。

符号约定（load 与 δ 的关系）：
    load: 作用于衬套锚点的外载荷向量（N，全局坐标 3 分量）。
    δ: 衬套 6DOF 位移 [dx, dy, dz, rx, ry, rz]（mm / rad）。
    平衡方程: r(δ) = f_ext − bush_force(δ) = 0
    bush_force(δ)[i] = k[i] * δ[i]（线性刚度，S1 阶段无耦合/预紧简化）。
    向上力 load_z = +500 → δz = +500/k_z（衬套正向位移，成员相对锚点上移）。
    向下力 load_z = −500 → δz = −500/k_z（衬套负向位移，成员相对锚点下移/压缩）。
    测试断言若需验证位移 magnitude，使用 abs(δ) 以避免符号歧义。

T4 载荷模型：单锚点直承外载（S1 阶段简化）。
T5 将对接 T2 静力层（接地点外载 → 二力杆 → 锚点合力）替换 load。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import time

import numpy as np
from scipy.optimize import least_squares

from src.components.bushing import Bushing6DOF, bush_force
from src.solver.mechanism.solver import solve_pose
from src.solver.compliance_transform import apply_bushing_to_anchors


@dataclass
class ComplianceSolverResult:
    """K&C 求解结果。"""
    status: str                               # VALID | APPROXIMATE | COMPLIANCE_DIVERGED | SOLVER_FAILED
    delta: dict[str, np.ndarray] = field(default_factory=dict)   # {衬套名: 6-DOF 位移}
    kin_residual: float = 0.0                 # 内层运动学最大残差（mm）
    force_balance_residual: float = 0.0       # 外层力平衡残差范数（N）
    iterations: int = 0                       # 外层函数评估次数
    ms: float = 0.0                           # 总耗时（ms）
    anchors: dict[str, np.ndarray] = field(default_factory=dict)  # 变换后的锚点位置
    bush_loads: dict[str, np.ndarray] = field(default_factory=dict)  # {衬套名: 6-抗力}


def solve_compliance(
    mech,
    *,
    bushings: dict[str, Bushing6DOF],
    load: np.ndarray,
    travel: float,
    rack: float,
    applied_at: dict[str, str] | None = None,
    max_disp_step: float = 0.5,
    max_nfev: int = 60,
) -> ComplianceSolverResult:
    """K&C 单点求解。

    Parameters
    ----------
    mech : Mechanism
        机构模型（由 build_mechanism 构造）。
    bushings : dict
        {衬套名: Bushing6DOF} 衬套集合。空字典 → 纯运动学回退。
    load : np.ndarray, shape (3,)
        作用于衬套锚点的外载荷向量（N，全局坐标）。单锚点直承模型。
    travel, rack : float
        轮跳 / 齿条位移（mm），传入内层 solve_pose。
    applied_at : dict, optional
        {衬套名: 节点名} 载荷作用点映射。默认取各衬套 member_nodes[0]。
    max_disp_step : float
        外层 TRF 变量缩放（mm），控制最大步长。
    max_nfev : int
        外层最大函数评估次数。

    Returns
    -------
    ComplianceSolverResult
    """
    t0 = time.perf_counter()
    names = list(bushings.keys())
    nd = len(names)

    # ── 无衬套回退：纯运动学 ──
    if nd == 0:
        rep = solve_pose(mech, travel, rack)
        return ComplianceSolverResult(
            status="VALID",
            kin_residual=rep.residual,
            force_balance_residual=0.0,
            iterations=0,
            ms=(time.perf_counter() - t0) * 1000.0,
        )

    # 载荷作用点映射
    at = applied_at or {n: next(iter(b.member_nodes)) for n, b in bushings.items()}

    # ── 辅助：打包/解包 δ 向量 ──
    def _pack(d: dict[str, np.ndarray]) -> np.ndarray:
        return np.concatenate([np.asarray(d[n], float) for n in names])

    def _unpack(x: np.ndarray) -> dict[str, np.ndarray]:
        return {n: x[6 * k: 6 * k + 6] for k, n in enumerate(names)}

    # ── 外层残差：力平衡 r(δ) = f_ext − bush_force(δ) ──
    kin_last = [0.0]  # closure for kin_residual

    def _residual(x: np.ndarray) -> np.ndarray:
        d = _unpack(x)
        # 1) 内层：衬套位移 → 锚点变换 → 机构重解
        anchors = apply_bushing_to_anchors(bushings, d)
        for node, pos in anchors.items():
            mech.nodes[node].pos = pos.copy()
        rep = solve_pose(mech, travel, rack, max_nfev=200, tol=1e-10)
        kin_last[0] = rep.residual

        # 2) 外层：力平衡残差
        r = np.zeros(6 * nd)
        f_ext = np.zeros(6)
        f_ext[:3] = load
        for k, n in enumerate(names):
            r[6 * k: 6 * k + 6] = f_ext - bush_force(bushings[n], d[n])
        return r

    # ── 外层求解：scipy TRF ──
    x0 = np.zeros(6 * nd)
    try:
        res = least_squares(
            _residual, x0, method="trf", max_nfev=max_nfev,
            xtol=1e-8, ftol=1e-8, gtol=1e-8,
            x_scale=np.ones(6 * nd) * max_disp_step,
        )
    except Exception:
        return ComplianceSolverResult(
            status="SOLVER_FAILED",
            kin_residual=kin_last[0],
            iterations=0,
            ms=(time.perf_counter() - t0) * 1000.0,
        )

    d = _unpack(res.x)

    # ── 状态判定 ──
    if res.cost < 1e-6:
        status = "VALID"
    elif not res.success and res.cost > 1e-3:
        status = "COMPLIANCE_DIVERGED"
    else:
        status = "APPROXIMATE"

    # ── 组装结果 ──
    # 重新应用最优解以获取最终锚点位置
    final_anchors = apply_bushing_to_anchors(bushings, d)

    return ComplianceSolverResult(
        status=status,
        delta=d,
        kin_residual=kin_last[0],
        force_balance_residual=float(np.sqrt(2 * res.cost)),
        iterations=int(res.nfev),
        ms=(time.perf_counter() - t0) * 1000.0,
        anchors=final_anchors,
        bush_loads={n: bush_force(bushings[n], d[n]) for n in names},
    )
