"""悬架模态交叉审计验收（T5-b / P9 接入，2026-10-20）

核心断言是那条**结构性限制**：任何 ARB 组合都做不出 `k_roll ≠ k_warp`。
其余断言用来保证这个结论不是实现错误造成的假象（解析式 + 能量 + 退化情形）。
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from src.components.suspension_audit import (
    AuditInvalid,
    arb_corner_stiffness,
    arb_modal_rates,
    modal_audit,
    per_corner_stiffness_matrix,
    roll_warp_ratio_is_constrained,
)
from src.components.suspension_modes import MODE_NAMES, TRANSFORM, FourModeSetup

T = 0.62  # 半轮距 [m]


# ── ARB 刚度矩阵本身 ────────────────────────────────
def test_arb_corner_matrix_matches_analytic_entries():
    """角刚度 a = k_arb/(4t²)，且矩阵形如 a·[[1,−1],[−1,1]]（半区独立）。"""
    k = 40000.0
    K = arb_corner_stiffness(k, k, T, T)
    a = k / (4.0 * T * T)
    assert K[0, 0] == pytest.approx(a, rel=1e-15)
    assert K[0, 1] == pytest.approx(-a, rel=1e-15)
    assert K[2, 2] == pytest.approx(a, rel=1e-15)
    # 前后轴之间不得有耦合
    assert K[0, 2] == 0.0 and K[0, 3] == 0.0 and K[1, 2] == 0.0
    assert np.allclose(K, K.T)


def test_arb_does_not_resist_heave_or_pitch():
    """ARB 对沉浮/俯仰刚度贡献**恒为零**（解析结论，非近似）。"""
    for kf, kr in ((0.0, 0.0), (40000.0, 40000.0), (50000.0, 30000.0), (0.0, 90000.0)):
        r = arb_modal_rates(kf, kr, T, T)
        assert r["heave"] == pytest.approx(0.0, abs=1e-12)
        assert r["pitch"] == pytest.approx(0.0, abs=1e-12)


def test_equal_arbs_are_diagonal_in_roll_warp():
    """前后 ARB 相等 ⇒ 模态基在 (roll, warp) 子空间严格对角、耦合为零。"""
    r = arb_modal_rates(40000.0, 40000.0, T, T)
    assert r["roll"] == pytest.approx(r["warp"], rel=1e-15)
    assert r["roll_warp_coupling"] == pytest.approx(0.0, abs=1e-12)
    Km = modal_audit(arb_corner_stiffness(40000.0, 40000.0, T, T))
    assert Km["coupling_ratio"] == pytest.approx(0.0, abs=1e-12)


def test_unequal_arbs_coupling_matches_analytic():
    """前后 ARB 不等 ⇒ 耦合 = a_f − a_r（解析值），但两个对角值**仍然相等**。"""
    kf, kr = 50000.0, 30000.0
    a_f, a_r = kf / (4 * T * T), kr / (4 * T * T)
    r = arb_modal_rates(kf, kr, T, T)
    assert r["roll_warp_coupling"] == pytest.approx(a_f - a_r, rel=1e-12)
    assert r["roll"] == pytest.approx(a_f + a_r, rel=1e-12)
    assert r["warp"] == pytest.approx(a_f + a_r, rel=1e-12)
    Km = modal_audit(arb_corner_stiffness(kf, kr, T, T))
    assert Km["coupling"][1, 3] == pytest.approx(a_f - a_r, rel=1e-12)


# ── 核心结构性限制 ─────────────────────────────────
def test_arb_topology_cannot_decouple_roll_and_warp():
    """**结构性限制**：无论怎么配 ARB，k_roll/k_warp 恒为 1（`can_decouple=False`）。

    这条断言是审计的主结论：要独立调节 roll 与 warp 刚度必须换拓扑
    （液压解耦 / 第三连杆），而不是"把参数调一调"。
    """
    cases = [
        (0.0, 0.0), (40000.0, 40000.0), (50000.0, 30000.0),
        (10000.0, 90000.0), (90000.0, 10000.0), (1.0, 200000.0),
    ]
    for kf, kr in cases:
        r = roll_warp_ratio_is_constrained(kf, kr, T, T)
        if r["warp"] > 0.0:
            assert r["ratio"] == pytest.approx(1.0, rel=1e-12), f"kf={kf} kr={kr} 出现 ratio={r['ratio']}"
        assert r["can_decouple"] is False


# ── 逐角 vs 模态的口径一致性 ────────────────────────
def test_spring_only_diagonal_entries_are_mean_rate():
    """仅逐角弹簧时，模态**对角元**恒等于四角刚度的平均（/2 归一化的推论）。"""
    for rates in ([30000, 30000, 35000, 35000], [10000, 20000, 30000, 40000], [50000] * 4):
        a = modal_audit(np.diag(rates))
        mean = float(np.mean(rates))
        for n in MODE_NAMES:
            assert a["modal_rates"][n] == pytest.approx(mean, rel=1e-12), f"{n} 应为均值 {mean}"


def test_coupling_structure_matches_analytic_form():
    """**耦合的解析结构**（模态对角化不是想当然的）。

    对对角矩阵 K = diag(k_FL, k_FR, k_RL, k_RR)，代入 T 可得：

        K_m[heave, pitch] = K_m[roll, warp] = ¼·(前轴总 − 后轴总)          ← 轴差族
        K_m[heave, roll]  = K_m[pitch, warp] = ¼·(左侧总 − 右侧总)          ← 侧差族
        K_m[heave, warp]  = K_m[roll, pitch] = ¼·(kFL − kFR − kRL + kRR)    ← 对角族

    ⇒ 三族互相独立 ⇒ **零耦合的充要条件是四角刚度全相等**。
    "前后总相等且左右总相等"只消掉前两族，**第三族仍在** —— 这点我先后猜错过两次，
    所以把三族都写成断言，不再依赖"物理直觉"。
    """
    def check(rates):
        a = modal_audit(np.diag(np.asarray(rates, dtype=float)))
        km = np.diag([a["modal_rates"][n] for n in MODE_NAMES]) + a["coupling"]
        front_rear = 0.25 * ((rates[0] + rates[1]) - (rates[2] + rates[3]))
        left_right = 0.25 * ((rates[0] + rates[2]) - (rates[1] + rates[3]))
        diag_diff = 0.25 * (rates[0] - rates[1] - rates[2] + rates[3])
        assert km[0, 2] == pytest.approx(front_rear, rel=1e-12, abs=1e-9), "heave↔pitch"
        assert km[1, 3] == pytest.approx(front_rear, rel=1e-12, abs=1e-9), "roll↔warp"
        assert km[0, 1] == pytest.approx(left_right, rel=1e-12, abs=1e-9), "heave↔roll"
        assert km[2, 3] == pytest.approx(left_right, rel=1e-12, abs=1e-9), "pitch↔warp"
        assert km[0, 3] == pytest.approx(diag_diff, rel=1e-12, abs=1e-9), "heave↔warp"
        assert km[1, 2] == pytest.approx(diag_diff, rel=1e-12, abs=1e-9), "roll↔pitch"
        # 对角元恒为均值
        mean = float(np.mean(rates))
        for n in MODE_NAMES:
            assert a["modal_rates"][n] == pytest.approx(mean, rel=1e-12)
        return a

    # 四角全等 ⇒ 全零
    assert check([40000.0] * 4)["coupling_ratio"] == pytest.approx(0.0, abs=1e-12)
    # 前≠后 ⇒ heave↔pitch 与 roll↔warp 同时耦合
    a1 = check([30000.0, 30000.0, 35000.0, 35000.0])
    assert a1["coupling_ratio"] > 0.0
    # 左≠右 ⇒ heave↔roll 与 pitch↔warp 同时耦合
    assert check([30000.0, 35000.0, 30000.0, 35000.0])["coupling_ratio"] > 0.0
    # **对角族**：前/后总相等且左/右总相等，但逐角不等 ⇒ 仍会通过第三族耦合（heave↔warp）。
    # 三条组合互相独立 ⇒ 只有四角**全等**才真正无耦合；这点我先前猜错过两次，故写死在此。
    a3 = check([30000.0, 35000.0, 35000.0, 30000.0])
    assert a3["coupling_ratio"] > 0.0, "对角型不对称仍会引入 heave↔warp / roll↔pitch 耦合"


def test_full_setup_adds_arb_equally_to_roll_and_warp():
    """弹簧 + ARB ⇒ roll 与 warp 各加 a_f+a_r，两者仍相等；heave/pitch 只由弹簧决定。"""
    rates = [30000, 30000, 35000, 35000]
    kf, kr = 50000.0, 30000.0
    a = modal_audit(per_corner_stiffness_matrix(rates, arb_front_nm_rad=kf,
                                                arb_rear_nm_rad=kr,
                                                half_track_front_m=T, half_track_rear_m=T))
    mean = float(np.mean(rates))
    add = kf / (4 * T * T) + kr / (4 * T * T)
    assert a["modal_rates"]["heave"] == pytest.approx(mean, rel=1e-9)
    assert a["modal_rates"]["pitch"] == pytest.approx(mean, rel=1e-9)
    assert a["modal_rates"]["roll"] == pytest.approx(mean + add, rel=1e-9)
    assert a["modal_rates"]["warp"] == pytest.approx(mean + add, rel=1e-9)
    # 前后不等 ⇒ 有耦合；能量差非零但很小
    assert a["coupling_ratio"] > 0.0
    assert 0.0 < a["energy_rel_diff"] < 0.05


def test_four_mode_reference_is_fully_decoupled():
    """**对照案例**：上游四模式布置（模态刚度直接给定）⇒ 模态基严格对角、能量差 0。

    与 ARB 布置形成对照：四种模式可独立取值 ⇒ 这是 ARB 拓扑做不到的。
    """
    s = FourModeSetup.upstream_proposed()
    a = modal_audit(s.corner_stiffness_matrix())
    assert a["coupling_ratio"] == pytest.approx(0.0, abs=1e-12)
    assert a["energy_rel_diff"] == pytest.approx(0.0, abs=1e-12)
    for n in MODE_NAMES:
        assert a["modal_rates"][n] == pytest.approx(s.rates[n], rel=1e-12)
    # 上游 PROPOSED 的 roll/warp 比远离 1 —— 这正是 ARB 布置给不出的比值
    ratio = s.rates["roll"] / s.rates["warp"]
    assert ratio == pytest.approx(2.30, rel=1e-2), f"roll/warp={ratio:.3f}"
    assert abs(ratio - 1.0) > 0.5


def test_energy_two_paths_agree_for_diagonal_case():
    """能量两条路径（全矩阵 vs 只取对角）在对角情形下必须一致。"""
    s = FourModeSetup.upstream_proposed()
    K = s.corner_stiffness_matrix()
    z = np.array([0.012, -0.007, 0.004, 0.009])
    e_full = 0.5 * float(z @ K @ z)
    m = TRANSFORM @ z
    e_diag = 0.5 * float(np.sum([s.rates[n] for n in MODE_NAMES] * m * m))
    assert e_full == pytest.approx(e_diag, rel=1e-12)


# ── 契约 ──────────────────────────────────────────
def test_invalid_inputs_are_rejected():
    """**控制实验**：非法输入必须报错。"""
    with pytest.raises(AuditInvalid):
        modal_audit(np.zeros((3, 3)))
    with pytest.raises(AuditInvalid):
        K = np.zeros((4, 4))
        K[0, 1] = 1.0        # 非对称（只填一侧）
        modal_audit(K)
    with pytest.raises(AuditInvalid):
        per_corner_stiffness_matrix([1, 2, 3])     # 长度错
    with pytest.raises(AuditInvalid):
        per_corner_stiffness_matrix([1, 2, 3, -4])  # 负刚度
    with pytest.raises(AuditInvalid):
        arb_corner_stiffness(-1.0, 1.0, T, T)      # 负 ARB
    with pytest.raises(AuditInvalid):
        arb_corner_stiffness(1.0, 1.0, 0.0, T)     # 半轮距非正
    with pytest.raises(AuditInvalid):
        arb_corner_stiffness(1.0, 1.0, math.nan, T)
