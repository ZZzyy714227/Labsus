"""求解结果契约（P1-2，2026-10-31）

## 为什么需要这份测试

`solve_pose` 过去只按**残差**判成功：
    ok = residual < 0.02 mm
这漏掉一种情况：scipy 可能在 `max_nfev` 处停下（`success=False`, `status=0`），
而残差恰好已经低于门限 —— 这种解**能用，但不是收敛来的**。调用方无从区分，
只能把"迭代耗尽"和"正常收敛"当成同一件事。

本测试锁住三件事：
1. 报告里 `converged` / `status` / `message` 三个字段**确实反映优化器状态**；
2. `degraded` 属性只在"残差合格但未收敛"时为真；
3. 半有限残差归一为 `inf`（旧式会让 `residual` 变成 nan 并流向下游）。
"""

from __future__ import annotations

import math

import numpy as np

from src.api.v3service import DEFAULT_DWB_POINTS, _new_mech
from src.solver.mechanism.solver import RESIDUAL_TOL_MM, SolveReport, solve_pose


def _mech():
    """用缺省 PRO 基线（推杆前悬架）造一台机构。"""
    return _new_mech(DEFAULT_DWB_POINTS, left=False, arch="pushrod")


# ── 1. 正常解：三个新字段必须反映真实的优化器状态 ─────────────────────────

def test_valid_pose_reports_converged_and_not_degraded():
    rep = solve_pose(_mech(), 0.0, 0.0)
    assert rep.ok, f"设计位应可解，残差 {rep.residual}"
    assert rep.converged is True, f"正常几何应正常收敛，status={rep.status} msg={rep.message}"
    assert rep.status > 0, "scipy 收敛时 status 应为正（0 = 命中 max_nfev）"
    assert isinstance(rep.message, str) and rep.message, "message 应保留 scipy 原始文本"
    assert rep.degraded is False
    assert rep.residual_tol_mm == RESIDUAL_TOL_MM
    # 迭代次数必须有记录（用于区分"一次到位"与"打满上限"）
    assert 0 < rep.iterations <= 200


def test_valid_pose_over_sweep_all_converged():
    """扫一遍轮跳：常规行程内不应出现"未收敛但残差达标"的退化解。"""
    bad = []
    for tr in (-40.0, -20.0, 0.0, 20.0, 40.0):
        rep = solve_pose(_mech(), tr, 0.0)
        if rep.degraded or not rep.ok:
            bad.append((tr, rep.degraded, rep.residual, rep.status, rep.message))
    assert not bad, f"常规行程出现退化/失败解: {bad}"


# ── 2. degraded 语义：残差合格 + 未收敛 ⇒ 可用但需告警 ──────────────────

def test_degraded_true_only_when_ok_but_not_converged():
    r = SolveReport(residual=1e-6, iterations=5, ok=True, ms=0.1, converged=False,
                    status=0, message="The maximum number of function evaluations is exceeded.")
    assert r.degraded is True


def test_degraded_false_when_converged():
    r = SolveReport(residual=1e-6, iterations=5, ok=True, ms=0.1, converged=True, status=2)
    assert r.degraded is False


def test_degraded_false_when_failed_even_if_not_converged():
    """ok=False 时由残差通道报告，degraded 不应再叠加（避免双重告警语义）。"""
    r = SolveReport(residual=0.5, iterations=5, ok=False, ms=0.1, converged=False, status=0)
    assert r.degraded is False


def test_tight_budget_yields_unconverged_report_not_silent_success():
    """**控制实验**：把 max_nfev 压到 1，优化器必然打满迭代。

    断言重点不是"一定失败"，而是**报告必须如实说出未收敛**：
    旧实现只会把 residual 交出去，调用方看不出"这是打满迭代的残次解"。
    """
    rep = solve_pose(_mech(), 30.0, 0.0, max_nfev=1)
    assert rep.converged is False, "max_nfev=1 不可能收敛"
    assert rep.status == 0, f"命中迭代上限时 status 应为 0，实际 {rep.status}"
    assert rep.message, "必须保留 scipy 的原始说明"
    # 残差不论是否达标，degraded 的定义都要成立
    assert rep.degraded == bool(rep.ok)


# ── 3. 非有限残差归一为 inf ─────────────────────────────────────────────

def test_nonfinite_residual_is_normalised_to_inf():
    """用几何退化把解推到非有限区，报告必须给 inf 而不是 nan。

    构造手法：把某个驱动点放到与目标重合的退化位置（travel 极端且齿条冲突），
    这里用极端的 travel 触发数值困难；无论是否真触发，断言都只校验
    "residual 绝不会是 nan" —— 这是给下游比较/格式化用的硬保证。
    """
    for tr in (1e6, -1e6):
        rep = solve_pose(_mech(), tr, 0.0, max_nfev=20)
        assert not math.isnan(rep.residual), f"travel={tr} 时 residual 不得为 nan"
        assert rep.residual == rep.residual  # NaN 自比较为 False
        assert rep.ok is False or rep.residual < RESIDUAL_TOL_MM


# ── 4. 残差门限常量与实际判据同源 ───────────────────────────────────────

def test_residual_threshold_is_single_source():
    """`ok` 必须用 RESIDUAL_TOL_MM 判，不能在别处硬编码 0.02。"""
    assert RESIDUAL_TOL_MM == 0.02
    rep = solve_pose(_mech(), 0.0, 0.0)
    assert rep.ok == (rep.residual < RESIDUAL_TOL_MM)
    assert rep.residual_tol_mm == RESIDUAL_TOL_MM
    assert np.isfinite(rep.residual)
