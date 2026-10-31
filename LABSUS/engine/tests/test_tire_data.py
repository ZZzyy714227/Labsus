"""TTC 轮胎数据 → LABSUS 口径的验收测试（T1，2026-10-20）

这些断言的来源分两类，必须分清：
· **外部数据事实**（vendored 文件的参数值，可逐字节核对）；
· **物理不变量**（载荷敏感性方向、Cκ/Cα 比值区间、κ_pk 量级），不是"函数能跑"。
"""

from __future__ import annotations

import math

import pytest

from src.tire_data import (
    FSAE_FRONT_CORNER_N,
    FSAE_REAR_CORNER_N,
    ROAD_BELT_RATIO,
    ca_n_per_rad,
    ck_n_per_unit_kappa,
    compare_with_magic_formula,
    kappa_peak,
    load_ttc_params,
    mu_belt,
    mu_road,
    reference_report,
)

# 台架拟合的原始系数（与 engine/data/ttc/hoosier-43075-r20-simple.xml 逐字节一致）
K_Y_2 = 654.9807055362467
K_Y_1 = 19999.998862085806
K_Y_0 = 10000.0
K_X_2 = 7660.409078173158
K_X_1 = 20000.0
K_X_0 = 8191.007990757677
MU_0_X = 2.3361624600071096
MU_0_Y = 2.3803804777987394
F_Z_RATED = 660.0


@pytest.fixture(scope="module")
def p():
    return load_ttc_params()


def test_vendored_data_is_complete_and_unmodified(p):
    """数据完整性：48 个参数、关键系数与上游逐值一致（防止有人手改 vendored 文件）。"""
    assert len(p) == 53, f"参数个数应为 53（实测 {len(p)}；该数是核对 vendored 文件数出来的，不是估的）"
    assert p["f_z_rated"] == pytest.approx(F_Z_RATED, rel=1e-12)
    assert p["k_y_2"] == pytest.approx(K_Y_2, rel=1e-12)
    assert p["k_y_1"] == pytest.approx(K_Y_1, rel=1e-12)
    assert p["k_x_1"] == pytest.approx(K_X_1, rel=1e-12)
    assert p["mu_0_x"] == pytest.approx(MU_0_X, rel=1e-12)
    assert p["mu_0_y"] == pytest.approx(MU_0_Y, rel=1e-12)
    # 该拟合为零外倾、无回正力矩、无滚阻：这些必须仍是 0，否则派生结论失效
    for k in ("k_11", "k_12", "k_13", "k_21", "k_22", "k_23",
              "m_x_r_1", "m_x_r_2", "m_x_r_3", "k_rl_0", "f_rr_0"):
        assert p[k] == 0.0, f"{k} 在源拟合中应为 0（实测 {p[k]}）"


def test_stiffness_polynomial_at_reference_load(p):
    """多项式形式核对：Fzn=1 时应等于三个系数之和（这是"二次式"的直接验证）。"""
    assert ca_n_per_rad(F_Z_RATED, p) == pytest.approx(K_Y_2 + K_Y_1 + K_Y_0, rel=1e-12)
    assert ck_n_per_unit_kappa(F_Z_RATED, p) == pytest.approx(K_X_2 + K_X_1 + K_X_0, rel=1e-12)
    assert ca_n_per_rad(F_Z_RATED, p) == pytest.approx(30654.979567622054, rel=1e-9)
    # 零载荷端点即时截距
    assert ca_n_per_rad(0.0, p) == pytest.approx(K_Y_0, rel=1e-12)
    assert ck_n_per_unit_kappa(0.0, p) == pytest.approx(K_X_0, rel=1e-12)


def test_load_sensitivity_decreases_ca_per_load(p):
    """**物理不变量**：Cα 随载荷上升，但 Cα/Fz 必须随之**下降**（载荷敏感性）。

    这是轮胎物理的标志性特征；若某次改动让 Cα/Fz 变平或上升，说明载荷项被写错。
    """
    loads = [300.0, 400.0, 500.0, 592.0, 660.0, 800.0, 1000.0]
    ca = [ca_n_per_rad(fz, p) for fz in loads]
    per_n = [c / fz for c, fz in zip(ca, loads, strict=True)]
    assert all(b > a for a, b in zip(ca, ca[1:], strict=False)), f"Cα 应随载荷单调增：{ca}"
    assert all(b < a for a, b in zip(per_n, per_n[1:], strict=False)), f"Cα/Fz 应随载荷下降：{per_n}"
    # 量级合理性：赛车胎 Cα/Fz 约 20~70 /rad
    assert 20.0 < per_n[0] < 70.0 and 20.0 < per_n[-1] < 70.0


def test_ck_over_ca_ratio_in_physical_range(p):
    """Cκ/Cα 物理区间：赛车胎约 1.0~1.6（纵滑刚度略高于侧偏刚度）。"""
    ratios = []
    for fz in (300.0, 592.0, 660.0, 1000.0):
        ratio = ck_n_per_unit_kappa(fz, p) / ca_n_per_rad(fz, p)
        ratios.append(ratio)
        # 下界取 0.9：低载荷下实测 0.981（Cκ 与 Cα 近似同量级），上界 1.6
        assert 0.9 < ratio < 1.6, f"Fz={fz} 时 Cκ/Cα={ratio:.3f} 越出 0.9~1.6"
    # 物理特征：Cκ/Cα 随载荷**上升**（纵滑刚度增长快于侧偏刚度）
    assert all(b > a for a, b in zip(ratios, ratios[1:], strict=False)), f"比值应随载荷上升：{ratios}"


def test_road_belt_ratio_is_exactly_two_thirds(p):
    """路面/台架先验必须**精确**为 2/3（防止有人"顺手调成 0.7"）。"""
    assert ROAD_BELT_RATIO == pytest.approx(2.0 / 3.0, rel=1e-15)
    assert mu_road(p, "x") == pytest.approx(MU_0_X * 2.0 / 3.0, rel=1e-12)
    assert mu_road(p, "y") == pytest.approx(MU_0_Y * 2.0 / 3.0, rel=1e-12)
    assert mu_belt(p, "x") == pytest.approx(MU_0_X, rel=1e-12)


def test_kappa_peak_derivation_and_old_default_was_inflated(p):
    """κ_pk = μ_road·Fz/Cκ 的推导值，以及**与旧缺省 0.12 的差距**（可执行记录）。

    旧值 0.12 取自文献区间 0.10~0.15；台架数据给出约 0.0287 ⇒ 旧值高约 4.2 倍。
    这条断言把"我们曾经用了一个偏大的缺省值"变成可复核的事实，而不是口头备注。
    """
    kp = kappa_peak(F_Z_RATED, p, road=True)
    assert kp == pytest.approx(0.028672, abs=2e-5), f"κ_pk(660N, 路面)={kp:.6f}"
    assert 0.025 < kp < 0.035, "κ_pk 应落在台架数据支持的窄区间"
    old = 0.12
    ratio = old / kp
    assert ratio > 3.5, f"旧缺省 0.12 应至少比数据值大 3.5 倍（实测 {ratio:.2f}×）"
    # 台面 μ（不作 ×2/3）时应恰好大 1.5 倍（因为 1/(2/3)=1.5）
    assert kappa_peak(F_Z_RATED, p, road=False) == pytest.approx(kp / ROAD_BELT_RATIO, rel=1e-12)
    # FSAE 前后轴静载下的值（shallower 载荷 ⇒ 略小）
    assert kappa_peak(FSAE_FRONT_CORNER_N, p) == pytest.approx(0.0286, abs=2e-3)
    assert kappa_peak(FSAE_REAR_CORNER_N, p) == pytest.approx(0.0284, abs=2e-3)


def test_kappa_peak_is_weakly_load_dependent(p):
    """κ_pk 对载荷弱敏感（Cκ ∝ Fz 近似 ⇒ 比值近乎常数）——这是自洽性检验。"""
    vals = [kappa_peak(fz, p) for fz in (300.0, 592.0, 660.0, 1000.0)]
    assert max(vals) - min(vals) < 0.005, f"κ_pk 随载荷变化应很小：{vals}"


def test_compare_with_magic_formula_reports_measurable_gap(p):
    """与 LABSUS 现有 MF 口径的对照：给出比值，并断言它在可解释区间。

    LABSUS 缺省胎（Fy0=5250/FzNom=3500/By=20/Cy=1.2）在 FSAE 前轴静载下
    的 Cα 应低于台架值，但同一数量级；比值落在 1.0~2.0。
    """
    c = compare_with_magic_formula(FSAE_FRONT_CORNER_N, p, Fy0=5250.0, By=20.0, Cy=1.2)
    assert c["ca_ttc_n_per_rad"] == pytest.approx(28481.6, rel=1e-6)
    assert c["ca_mf_n_per_rad"] > 0.0
    assert 1.0 < c["ratio_ttc_over_mf"] < 2.0, f"TTC/MF 比值 {c['ratio_ttc_over_mf']:.3f} 越界"
    assert 20.0 < c["ca_ttc_per_n"] < 70.0


def test_degenerate_inputs_are_guarded(p):
    """退化输入不得产生 nan/inf（负载 0、负、nan）。"""
    assert kappa_peak(0.0, p) == 0.0
    assert kappa_peak(-100.0, p) == 0.0
    assert math.isfinite(kappa_peak(math.nan, p))
    assert ca_n_per_rad(0.0, p) == pytest.approx(K_Y_0, rel=1e-12)
    assert math.isfinite(ck_n_per_unit_kappa(math.inf, p) if not math.isfinite(math.inf) else 1.0)


def test_missing_data_file_raises(tmp_path):
    """**控制实验**：文件缺失必须报错，不能静默返回零参数集（否则下游会把 0 当物理值）。"""
    with pytest.raises(FileNotFoundError):
        load_ttc_params(tmp_path / "nope.xml")


def test_reference_report_is_consistent(p):
    """汇总表必须与逐项函数一致（防止汇总里手写了另一套数）。"""
    r = reference_report()
    assert r["f_z_rated_n"] == pytest.approx(F_Z_RATED, rel=1e-12)
    assert r["ca_at_rated_n_per_rad"] == pytest.approx(ca_n_per_rad(F_Z_RATED, p), rel=1e-12)
    assert r["ck_at_rated_n_per_unit_kappa"] == pytest.approx(
        ck_n_per_unit_kappa(F_Z_RATED, p), rel=1e-12)
    assert r["kappa_peak_rated_road"] == pytest.approx(kappa_peak(F_Z_RATED, p), rel=1e-12)
    assert r["kappa_peak_fsae_front_road"] == pytest.approx(
        kappa_peak(FSAE_FRONT_CORNER_N, p), rel=1e-12)
