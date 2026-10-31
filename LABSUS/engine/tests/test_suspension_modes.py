"""四模式模态悬架验收（T3-b / P9，2026-10-20）

断言分三类：
· **代数恒等式**：T 正交/对称/自逆 —— 可逆重构的根基；
· **物理性质**：纯模式激励只激该模式、对称载荷 warp 为零、能量等价、均匀刚度退化；
· **契约**：非法输入拒绝、PROPOSED 标注不可丢。
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from src.components.suspension_modes import (
    CORNER_ORDER,
    MODE_NAMES,
    TRANSFORM,
    UPSTREAM_PROPOSED_RATES,
    FourModeInvalid,
    FourModeSetup,
    corner_forces,
    from_modes,
    modal_energy,
    roll_stiffness_nm_per_rad,
    to_modes,
)


@pytest.fixture(scope="module")
def setup():
    return FourModeSetup.upstream_proposed()


# ── 代数恒等式 ─────────────────────────────────────────────
def test_transform_is_orthonormal():
    """T·Tᵀ = I（上游文档声明的性质）。"""
    assert np.allclose(TRANSFORM @ TRANSFORM.T, np.eye(4), atol=1e-15)


def test_transform_is_symmetric_and_involutive():
    """Tᵀ = T 且 T² = I ⇒ **同一个矩阵同时做正变换与逆变换**。

    这是本模块最重要的结构性质：逆变换不需要单独实现，也就不可能与正变换写岔。
    若有人改动归一化因子（比如去掉 /2 改成 /4），这条必红。
    """
    assert np.allclose(TRANSFORM, TRANSFORM.T, atol=1e-15)
    assert np.allclose(TRANSFORM @ TRANSFORM, np.eye(4), atol=1e-15)


def test_round_trip_is_machine_precision():
    """任意轮跳 → 模式 → 轮跳，误差应在机器精度量级。"""
    rng = np.random.default_rng(20261020)
    for _ in range(20):
        z = rng.uniform(-0.05, 0.05, 4)
        back = from_modes(to_modes(z))
        err = max(abs(back[c] - z[i]) for i, c in enumerate(CORNER_ORDER))
        assert err < 1e-15, f"往返误差 {err:.2e}"


# ── 物理性质 ───────────────────────────────────────────────
def test_pure_heave_excites_only_heave():
    """纯 heave（四角同向）⇒ 其余三模式为零。"""
    m = to_modes((0.01, 0.01, 0.01, 0.01))
    assert m["heave"] == pytest.approx(0.02, rel=0, abs=1e-15)
    for name in ("roll", "pitch", "warp"):
        assert abs(m[name]) < 1e-15, f"{name} 应为 0，实得 {m[name]:.2e}"


def test_symmetric_load_has_zero_warp(setup):
    """**对称载荷 ⇒ warp 模式必须为零**（任务显式要求的退化工况）。"""
    for d in (0.001, 0.01, 0.05):
        m = to_modes((d, d, d, d))
        assert m["warp"] == pytest.approx(0.0, abs=1e-15)
        # 也不得通过 warp 通道产生力
        f = corner_forces((d, d, d, d), setup)
        assert all(abs(v - setup.rates["heave"] * d) < 1e-9 for v in f.values()), f


def test_pure_roll_pitch_warp_isolation():
    """纯 roll / pitch / warp 各自只激一个模式。"""
    cases = {
        "roll": (0.01, -0.01, 0.01, -0.01),
        "pitch": (0.01, 0.01, -0.01, -0.01),
        "warp": (0.01, -0.01, -0.01, 0.01),
    }
    for want, z in cases.items():
        m = to_modes(z)
        others = [n for n in MODE_NAMES if n != want]
        assert abs(m[want]) > 0.01, f"{want} 未激起来：{m[want]}"
        for name in others:
            assert abs(m[name]) < 1e-15, f"纯 {want} 却激起了 {name}={m[name]:.2e}"


def test_uniform_modal_rates_reduce_to_conventional_suspension():
    """**归一化自洽性**：四个模式刚度相等 ⇒ 等价逐角刚度矩阵 = k·I。

    含义：均匀模态刚度等价于四根相同弹簧的常规悬架。
    若 /2 因子写错（例如写成 /4 或 1），这条必红 —— 它同时验证了变换与刚度换算。
    """
    for k in (1e4, 5e4, 1.2e5):
        s = FourModeSetup({n: k for n in MODE_NAMES})
        assert np.allclose(s.corner_stiffness_matrix(), k * np.eye(4), atol=1e-9 * k)


def test_energy_is_consistent_between_forms(setup):
    """能量等价：½Σk_m·mode² 必须等于 ½zᵀKz（两条独立路径）。"""
    rng = np.random.default_rng(7)
    K = setup.corner_stiffness_matrix()
    for _ in range(10):
        z = rng.uniform(-0.03, 0.03, 4)
        e_modal = modal_energy(z, setup)
        e_quad = 0.5 * float(z @ K @ z)
        assert e_modal == pytest.approx(e_quad, rel=1e-12, abs=1e-15)


def test_stiffness_matrix_symmetric_positive_definite(setup):
    """K 必须对称且正定（物理上：任意变形都要正弹性能）。"""
    K = setup.corner_stiffness_matrix()
    assert np.allclose(K, K.T, atol=1e-9)
    eig = np.linalg.eigvalsh(K)
    assert np.all(eig > 0.0), f"K 非正定，特征值 {eig}"
    # 特征值应恰为四个模态刚度（相似变换不改变谱）
    assert np.allclose(np.sort(eig), np.sort(list(setup.rates.values())), rtol=1e-12)


def test_heave_force_balance(setup):
    """纯 heave 时每个角力 = k_heave·d ⇒ 四角合力 = 4·k_heave·d。"""
    d = 0.008
    f = corner_forces((d, d, d, d), setup)
    assert sum(f.values()) == pytest.approx(4.0 * setup.rates["heave"] * d, rel=1e-12)


def test_roll_stiffness_formula(setup):
    """侧倾刚度解析式 K_r = 4·k_roll·t²，且对 t 是二次、对 k_roll 是线性。"""
    t = 0.620
    kr = roll_stiffness_nm_per_rad(setup, t)
    assert kr == pytest.approx(4.0 * setup.rates["roll"] * t * t, rel=1e-15)
    assert kr == pytest.approx(123867.0, rel=1e-4), f"实得 {kr:.1f}"
    assert roll_stiffness_nm_per_rad(setup, 2 * t) == pytest.approx(4 * kr, rel=1e-12)


# ── 契约与数据 ─────────────────────────────────────────────
def test_upstream_proposed_rates_are_marked_proposed():
    """⚠ 上游四个模式刚度**全部是 PROPOSED**，标注不得丢。

    这条断言防止后人把"拟定值"当实测引用；要改成实测必须同时改 provenance 与文档。
    """
    s = FourModeSetup.upstream_proposed()
    assert "PROPOSED" in s.provenance.upper()
    assert set(s.rates) == set(MODE_NAMES)
    assert all(v > 0.0 for v in s.rates.values())
    # 与上游 XML 逐值一致
    for name, want in UPSTREAM_PROPOSED_RATES.items():
        assert s.rates[name] == pytest.approx(want, rel=1e-15)
    # 上游 documented 事实：heave 与 pitch 相同、warp 最软
    assert s.rates["heave"] == s.rates["pitch"]
    assert s.rates["warp"] < min(s.rates["heave"], s.rates["roll"])


def test_invalid_inputs_are_rejected():
    """**控制实验**：非法输入必须报错。"""
    with pytest.raises(FourModeInvalid):
        to_modes((0.01, 0.01, 0.01))
    with pytest.raises(FourModeInvalid):
        to_modes((0.01, 0.01, 0.01, math.nan))
    with pytest.raises(FourModeInvalid):
        from_modes({"heave": 0.01})
    with pytest.raises(FourModeInvalid):
        FourModeSetup({"heave": 1e4, "roll": 1e4, "pitch": 1e4})           # 缺 warp
    with pytest.raises(FourModeInvalid):
        FourModeSetup({**{n: 1e4 for n in MODE_NAMES}, "extra": 1e4})     # 多余键
    with pytest.raises(FourModeInvalid):
        FourModeSetup({**{n: 1e4 for n in MODE_NAMES}, "warp": 0.0})      # 非正
    with pytest.raises(FourModeInvalid):
        roll_stiffness_nm_per_rad(FourModeSetup.upstream_proposed(), 0.0)
