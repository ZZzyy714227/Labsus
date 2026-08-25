"""K&C 两层迭代求解器（S1 引擎内核·分水岭）。

内层：衬套位移 δ 写入锚点（小角刚体变换）→ solve_pose（现有 least_squares TRF 机构投影）。
外层：δ 上力平衡 r(δ) = f_ext − bush_force(δ)（TRF + 数值雅可比 + Anderson 兜底）。
状态机：VALID / APPROXIMATE（最小范数超静定）/ COMPLIANCE_DIVERGED / SOLVER_FAILED。

符号约定（load 与 δ 的关系）：
    load: 作用于衬套锚点的外载荷向量（N，全局坐标3分量）。
    δ: 衬套 6DOF 位移 [dx, dy, dz, rx, ry, rz]（mm / rad）。
    平衡方程: r(δ) = f_ext − bush_force(δ) = 0
    bush_force(δ)[i] = k[i] * δ[i]（线性刚度，S1 阶段无耦合/预紧简化）。
    向上力 load_z = +500 → δz = +500/k_z（衬套正向位移，成员相对锚点上移）。
    向下力 load_z = −500 → δz = −500/k_z（衬套负向位移，成员相对锚点下移/压缩）。
    测试断言若需验证位移 magnitude，使用 abs(δ) 以避免符号歧义。

S1 载荷模型：单锚点直承外载（简化）。
T5 将对接 T2 静力层（接地点外载 → 二力杆 → 锚点合力）替换 load。

返回后 mech 处于最终一致姿态；result.anchors 为最终锚点位置。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import time

import numpy as np
from scipy.optimize import least_squares

from src.components.bushing import Bushing6DOF, bush_force
from src.solver.mechanism.solver import solve_pose
from src.solver.compliance_transform import apply_bushing_to_anchors

# ── 状态判定阈值（模块常量） ──
COST_VALID = 1e-6         # 外层代价函数低于此值 → VALID
COST_DIVERGED = 1e-3      # 外层代价函数高于此值且未收敛 → COMPLIANCE_DIVERGED
KIN_TOL = 1e-10           # 内层运动学求解器公差
KIN_MAX_NFEV = 200        # 内层最大函数评估次数
ANDERSON_BETA = 0.5       # Anderson 混合系数（简单不动点步长）
ANDERSON_MEM = 3          # Anderson 历史深度
ANDERSON_MAX_ITER = 40    # Anderson 最大迭代
ANDERSON_TOL = 1e-6       # Anderson 收敛阈值
ANDERSON_MAX_STEP = 5.0   # Anderson 单步最大位移（mm）


@dataclass
class ComplianceSolverResult:
    """K&C 求解结果。

    返回后 mech 处于最终一致姿态；anchors 为最终锚点位置。
    """
    status: str                               # VALID | APPROXIMATE | COMPLIANCE_DIVERGED | SOLVER_FAILED
    delta: dict[str, np.ndarray] = field(default_factory=dict)   # {衬套名: 6-DOF 位移}
    kin_residual: float = 0.0                 # 内层运动学最大残差（mm）
    force_balance_residual: float = 0.0       # 外层力平衡残差范数（N）
    iterations: int = 0                       # 外层函数评估次数
    ms: float = 0.0                           # 总耗时（ms）
    anchors: dict[str, np.ndarray] = field(default_factory=dict)  # 变换后的锚点位置
    bush_loads: dict[str, np.ndarray] = field(default_factory=dict)  # {衬套名: 6-抗力}


# ── Anderson 加速不动点迭代（C1: TRF 失败后的兜底） ──
def _anderson(residual_fun, x0, *, beta: float = ANDERSON_BETA,
              m: int = ANDERSON_MEM, max_iter: int = ANDERSON_MAX_ITER,
              tol: float = ANDERSON_TOL) -> tuple[np.ndarray, float, bool]:
    """Anderson-M 加速不动点迭代 δ_{k+1} = δ_k + r(δ_k)。

    无雅可比，仅使用历史差商做最小二乘外推。
    返回 (x, residual_norm, converged)。
    """
    x = np.asarray(x0, float).copy()
    xs: list[np.ndarray] = []
    fs: list[np.ndarray] = []

    for _ in range(max_iter):
        r = np.asarray(residual_fun(x), float)
        rnorm = float(np.linalg.norm(r))
        if rnorm < tol:
            return x, rnorm, True

        xs.append(x.copy())
        fs.append(r.copy())
        if len(xs) > m:
            xs.pop(0)
            fs.pop(0)

        if len(xs) > 1:
            # 最小化 ||F(x)+F'(x)dx|| 的最小二乘外推（无雅可比，使用历史差商）
            DX = np.column_stack([xs[k] - xs[k - 1] for k in range(1, len(xs))])
            DF = np.column_stack([fs[k] - fs[k - 1] for k in range(1, len(fs))])
            g, *_ = np.linalg.lstsq(DF, -fs[-1], rcond=None)
            x_new = xs[-1] + DX @ g
        else:
            x_new = x + beta * r

        # 限制步长
        step = np.linalg.norm(x_new - xs[-1])
        if step > ANDERSON_MAX_STEP:
            x_new = xs[-1] + (x_new - xs[-1]) * (ANDERSON_MAX_STEP / step)
        x = x_new

    # 最终评估
    r = np.asarray(residual_fun(x), float)
    rnorm = float(np.linalg.norm(r))
    return x, rnorm, rnorm < tol


def solve_compliance(
    mech,
    *,
    bushings: dict[str, Bushing6DOF],
    load: np.ndarray,
    loads: dict[str, np.ndarray] | None = None,
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
        默认外载荷向量（N，全局坐标），广播到所有衬套。
    loads : dict, optional
        {衬套名: np.ndarray(3,)} 各衬套独立外载荷。提供时覆盖 load 广播。
    travel, rack : float
        轮跳 / 齿条位移（mm），传入内层 solve_pose。
    applied_at : dict, optional
        {衬套名: 节点名} 载荷作用点映射（保留参数，T5 扩展用）。
    max_disp_step : float
        外层 TRF 变量缩放（mm），控制最大步长。
    max_nfev : int
        外层最大函数评估次数。

    Returns
    -------
    ComplianceSolverResult
        返回后 mech 处于最终一致姿态；anchors 为最终锚点位置。
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

    # 载荷映射：per-bushing loads 优先，否则广播 load
    load_broadcast = np.asarray(load, float)
    bush_ext: dict[str, np.ndarray] = {}
    for n in names:
        if loads is not None and n in loads:
            bush_ext[n] = np.asarray(loads[n], float)[:3].copy()
        else:
            bush_ext[n] = load_broadcast[:3].copy()

    def _unpack(x: np.ndarray) -> dict[str, np.ndarray]:
        return {n: x[6 * k: 6 * k + 6] for k, n in enumerate(names)}

    # ── 外层残差：力平衡 r(δ) = f_ext − bush_force(δ) ──
    # kin_last 通过结果赋值回传（M2: 避免 mutable closure）
    _kin_last = 0.0

    def _residual(x: np.ndarray) -> np.ndarray:
        nonlocal _kin_last
        d = _unpack(x)
        # 1) 内层：衬套位移 → 锚点变换 → 机构重解
        anchors = apply_bushing_to_anchors(bushings, d)
        for node, pos in anchors.items():
            mech.nodes[node].pos = pos.copy()
        rep = solve_pose(mech, travel, rack, max_nfev=KIN_MAX_NFEV, tol=KIN_TOL)
        _kin_last = rep.residual

        # 2) 外层：力平衡残差
        # S1: 外载仅作用于平移 DOF（3分量）；旋转 DOF 无外部力矩（M5 注释），
        # 因为 K&C 测试中衬套仅传递平移力，旋转约束由机构铰链承担。
        r = np.zeros(6 * nd)
        for k, n in enumerate(names):
            f_ext = np.zeros(6)
            f_ext[:3] = bush_ext[n]   # S1: 仅平移外载；旋转 DOF 无外部力矩
            r[6 * k: 6 * k + 6] = f_ext - bush_force(bushings[n], d[n])
        return r

    # ── 外层求解：scipy TRF ──
    x0 = np.zeros(6 * nd)
    trf_nfev = 0
    try:
        res = least_squares(
            _residual, x0, method="trf", max_nfev=max_nfev,
            xtol=1e-8, ftol=1e-8, gtol=1e-8,
            x_scale=np.ones(6 * nd) * max_disp_step,
        )
        trf_nfev = int(res.nfev)
    except Exception:
        # TRF 异常 → 尝试 Anderson 兜底
        res = None

    # ── C1: Anderson 固定点回退 ──
    anderson_ok = False
    anderson_rnorm = float("inf")
    if res is None or (not res.success and res.cost > COST_DIVERGED):
        anderson_x, anderson_rnorm, anderson_ok = _anderson(_residual, x0)
        anderson_nfev = ANDERSON_MAX_ITER  # 估算
        if res is None:
            # TRF 完全失败 → 用 Anderson 结果
            res_x = anderson_x
            final_nfev = anderson_nfev
        else:
            # TRF 和 Anderson 都跑了 → 选更好的
            trf_rnorm = float(np.sqrt(2 * res.cost))
            if anderson_rnorm < trf_rnorm:
                res_x = anderson_x
                final_nfev = trf_nfev + anderson_nfev
            else:
                res_x = res.x
                final_nfev = trf_nfev
    else:
        res_x = res.x
        final_nfev = trf_nfev

    d = _unpack(res_x)

    # ── 状态判定 ──
    # 重新评估最终残差以获取精确代价
    final_r = np.asarray(_residual(res_x), float)
    final_rnorm = float(np.linalg.norm(final_r))
    final_cost = 0.5 * final_rnorm ** 2

    if final_cost < COST_VALID:
        status = "VALID"
    elif anderson_ok:
        # Anderson 收敛（即使 TRF 没收敛）→ VALID
        status = "VALID"
    elif final_cost > COST_DIVERGED:
        status = "COMPLIANCE_DIVERGED"
    else:
        status = "APPROXIMATE"

    # ── C2: 最终一致性写回 ──
    # 将最优 δ 的锚点位置写入 mech.nodes，并运行最终 solve_pose 确保机构一致
    final_anchors = apply_bushing_to_anchors(bushings, d)
    for node, pos in final_anchors.items():
        mech.nodes[node].pos = pos.copy()
    solve_pose(mech, travel, rack, max_nfev=KIN_MAX_NFEV, tol=KIN_TOL)

    return ComplianceSolverResult(
        status=status,
        delta=d,
        kin_residual=_kin_last,
        force_balance_residual=final_rnorm,
        iterations=final_nfev,
        ms=(time.perf_counter() - t0) * 1000.0,
        anchors=final_anchors,
        bush_loads={n: bush_force(bushings[n], d[n]) for n in names},
    )


# ── T8: K&C 全链路求解 ──────────────────────────────────────────────

def solve_compliance_full(
    mech,
    *,
    bushings: dict[str, Bushing6DOF],
    case: "QSLoad",
    travel: float,
    rack: float,
    mk_links=None,
    cp_rel=None,
) -> ComplianceSolverResult:
    """K&C 全链路：接地点外载 →（二力杆静力）→ 锚点合力 → solve_compliance。

    mk_links: (mech) -> list[LinkForce] 回调；默认构造 PUSH(UP4→CH5) +
              LCA 前/后杆(CH3/CH4→UP2) + UCA 前/后杆(CH1/CH2→UP1)。
    cp_rel: 接地点相对轮心（默认 [0,0,-320] 近似，标注 APPROXIMATE）。

    依赖 T5 corner_to_anchor_loads 返回 {杆id: 锚点合力}；本函数把杆车身端映射到
    mech 节点名（位置 allclose 匹配），按节点聚合后传入 solve_compliance 的 loads。
    """
    from src.solver.forces import LinkForce, corner_to_anchor_loads, _chassis_end

    # 1) 运动学求解（确认机构可达当前姿态）
    rep = solve_pose(mech, travel, rack)
    if not rep.ok:
        return ComplianceSolverResult(status="SOLVER_FAILED", kin_residual=rep.residual)

    # 2) 构造二力杆列表
    if mk_links is not None:
        links = mk_links(mech)
    else:
        links = [
            LinkForce(a=mech.node("UP4").pos.copy(), b=mech.node("CH5").pos.copy(), id="PUSH"),
            LinkForce(a=mech.node("CH3").pos.copy(), b=mech.node("UP2").pos.copy(), id="LCA_F"),
            LinkForce(a=mech.node("CH4").pos.copy(), b=mech.node("UP2").pos.copy(), id="LCA_R"),
            LinkForce(a=mech.node("CH1").pos.copy(), b=mech.node("UP1").pos.copy(), id="UCA_F"),
            LinkForce(a=mech.node("CH2").pos.copy(), b=mech.node("UP1").pos.copy(), id="UCA_R"),
        ]

    # 3) 接地点外载 → 各杆轴向力 → 车身锚点合力
    hub_point = mech.node(mech.wheel).pos.copy()
    _cp = cp_rel if cp_rel is not None else np.array([0.0, 0.0, -320.0])
    corner = corner_to_anchor_loads(case, links, hub_point=hub_point, cp_rel=_cp)

    # 4) 杆车身端 → 节点名（位置 allclose 匹配）
    def _node_name(pos: np.ndarray) -> str:
        for nm, nd in mech.nodes.items():
            if np.allclose(nd.pos, pos, atol=1.0):
                return nm
        return ""

    # 5) 按节点聚合力（anchor_loads 值已是车身端力，直接累加）
    per_node: dict[str, np.ndarray] = {}
    for l in links:
        end = _chassis_end(l, hub_point)
        nm = _node_name(end)
        if nm:
            per_node[nm] = per_node.get(nm, np.zeros(3)) + corner.anchor_loads.get(l.id, np.zeros(3))

    # 6) 衬套载荷映射：{衬套名: 对应成员节点合力}
    loads: dict[str, np.ndarray] = {}
    for name, b in bushings.items():
        node = next(iter(b.member_nodes))
        loads[name] = per_node.get(node, np.zeros(3))

    # 7) 调用 T4 求解器
    return solve_compliance(mech, bushings=bushings, loads=loads,
                            load=np.zeros(3), travel=travel, rack=rack)
