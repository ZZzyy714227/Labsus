"""Bounce rig unit tests — four-wheel time-domain dynamics (7-DOF)."""
from __future__ import annotations

import numpy as np
import pytest

from metrics import bounce

MR = {"fl": 0.7, "fr": 0.7, "rl": 0.6, "rr": 0.6}


def _sim(*a, **k):
    return bounce.simulate(None, MR, *a, **k)


def test_static_by_no_input_is_stable():
    """无激励时系统应保持静平衡（数值漂移 < 1mm）。"""
    o = _sim({"kind": "step", "amplitude_mm": 0, "duration_s": 1.0, "freq_hz": 1.0},
             dt_s=0.002, ns=10)
    assert max(abs(v) for v in o["body"]["zc"]) < 1.0
    for c in ("fl", "fr", "rl", "rr"):
        assert max(abs(v) for v in o["wheels"][c]["dzu"]) < 1.0
    assert abs(o["body"]["zc"][-1]) < 1.0          # 未发散
    # 无激励时轮端垂向加速度应 ≈ 0（均值远小于重力 g=9810 mm/s²）
    for c in ("fl", "fr", "rl", "rr"):
        a = np.asarray(o["wheels"][c]["acc"])
        assert float(np.mean(np.abs(a))) < 300.0   # 静态噪声
        assert float(np.max(np.abs(a))) < 3000.0   # 无巨大冲击


def test_tire_force_balances_weight():
    """静平衡时轮胎法向力 ≈ 簧上+簧下重量。"""
    o = _sim({"kind": "step", "amplitude_mm": 0, "duration_s": 0.1, "freq_hz": 1.0},
             dt_s=0.001, ns=10)
    fr_ft = np.mean(o["wheels"]["fr"]["ft"])
    sprung = 200.0 * 0.48 / 2.0
    expected = (sprung + 8.0) * 9.81
    assert abs(fr_ft - expected) / expected < 0.15   # ±15%（有轻微数值振荡均值）


def test_single_corner_excitation_couples_all():
    """只激励右前轮：右前响应最大，其余轮经车身/胎产生较小耦合——证明四轮联动。"""
    o = _sim({"kind": "sine", "amplitude_mm": 10, "freq_hz": 2.0, "duration_s": 1.0},
             dt_s=0.002, ns=10, corners=["fr"])
    amp = {c: max(abs(v) for v in o["wheels"][c]["dzu"]) for c in ("fl", "fr", "rl", "rr")}
    assert amp["fr"] > 5.0                          # 直接激励轮强响应
    assert amp["fl"] < amp["fr"] * 0.5              # 同轴对侧远小于
    assert amp["rl"] < amp["fr"] * 0.5              # 后轴耦合远小于
    assert amp["rl"] > 0.1                          # 仍传递（非单轮孤立）


def test_symmetric_step_moves_all_wheels_together():
    """四轮同步阶跃：四轮与车身同向抬升。"""
    o = _sim({"kind": "step", "amplitude_mm": 15, "duration_s": 1.5, "freq_hz": 1.0},
             dt_s=0.002, ns=10)
    fr_mid = o["wheels"]["fr"]["dzu"][len(o["t"]) // 2]
    fl_mid = o["wheels"]["fl"]["dzu"][len(o["t"]) // 2]
    rr_mid = o["wheels"]["rr"]["dzu"][len(o["t"]) // 2]
    # 同向且量级接近（±60%）
    assert fr_mid > 0 and fl_mid > 0 and rr_mid > 0
    assert min(fr_mid, fl_mid, rr_mid) / max(fr_mid, fl_mid, rr_mid) > 0.4


def test_wheel_rate_helper():
    assert bounce.wheel_rate(26.0, 0.7) == pytest.approx(12.74)