"""悬架 LUT schema 验收（T2，2026-10-20）

断言分两类：
· **等价性**：节点上必须与旧 `np.interp` 完全一致（迁移不改变已有数值）；
· **新性质**：C1 连续、保单调、越界显式拒绝 —— 这是旧实现缺的，也是本次升级的目的。
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from src.components.suspension_lut import (
    KIND_CONSTITUTIVE,
    KIND_GEOMETRIC,
    LUTInvalidTable,
    LUTOutOfRange,
    SuspensionCornerLUT,
    build,
    derivative,
    evaluate,
    from_kc_lut,
    max_deviation_vs_piecewise,
    monotone_cubic_slopes,
)

TRAVEL = (-50.0, -25.0, 0.0, 25.0, 50.0)
CAM = (-0.5, -1.0, -1.5, -2.0, -2.5)          # 递减（外倾随压缩更负）
TOE = (0.10, 0.075, 0.05, 0.025, 0.0)          # 递减
# 渐增弹簧：F = 110 N/mm · s + 0.02 · s²（非线性，用于检验插值差异是否真实存在）
SPRING = tuple(110.0 * s + 0.02 * s * s for s in TRAVEL)


@pytest.fixture()
def ds() -> SuspensionCornerLUT:
    return build(TRAVEL, geometric={"cam": CAM, "toe": TOE},
                 constitutive={"spring_force_n": SPRING},
                 units={"cam": "deg", "toe": "deg", "spring_force_n": "N"})


def test_channels_are_classified_by_kind(ds):
    """三类输出必须分开登记（几何 / 本构），不能混成一个字典。"""
    assert set(ds.geometric_channels()) == {"cam", "toe"}
    assert set(ds.constitutive_channels()) == {"spring_force_n"}
    assert ds.kinds["cam"] == KIND_GEOMETRIC
    assert ds.kinds["spring_force_n"] == KIND_CONSTITUTIVE
    assert ds.units["spring_force_n"] == "N"
    assert ds.travel_range_mm == (-50.0, 50.0)


def test_knots_are_exact_and_match_legacy_piecewise(ds):
    """**等价性**：节点上必须与旧 np.interp 逐点一致（迁移不改已有数据点）。"""
    xs = np.asarray(ds.travel_mm)
    for name, ys in ds.channels.items():
        legacy = np.interp(xs, xs, np.asarray(ys))
        for t, want, leg in zip(xs, ys, legacy, strict=True):
            got = evaluate(ds, name, float(t))
            assert got == pytest.approx(want, rel=0, abs=1e-12), f"{name}@{t} 节点值不符"
            assert got == pytest.approx(float(leg), rel=0, abs=1e-12)


def test_c1_continuity_at_interior_knots(ds):
    """C1：节点两侧一阶导数必须一致（旧分段线性在这里跳变）。"""
    xs = np.asarray(ds.travel_mm)
    for name in ds.channels:
        for k in range(1, len(xs) - 1):
            x = float(xs[k])
            dl = derivative(ds, name, x - 1e-7)
            dr = derivative(ds, name, x + 1e-7)
            scale = max(1.0, abs(dl), abs(dr))
            assert abs(dl - dr) / scale < 1e-4, f"{name} 在 x={x} 导数不连续：{dl} vs {dr}"


def test_monotone_data_gives_monotone_interpolant(ds):
    """保单调：数据单调时，插值结果在整段内不得反转（Fritsch–Carlson 的核心保证）。"""
    grid = np.linspace(-50.0, 50.0, 1001)
    for name in ("cam", "toe", "spring_force_n"):
        ys = [evaluate(ds, name, float(t)) for t in grid]
        diffs = np.diff(ys)
        # 三个通道的原始数据都是单调递增或递减；这里只要求**方向一致**
        src_decreasing = ds.channels[name][0] > ds.channels[name][-1]
        if src_decreasing:
            assert np.all(diffs <= 1e-12), f"{name} 应单调递减，出现反转 {diffs[diffs > 1e-12][:3]}"
        else:
            assert np.all(diffs >= -1e-12), f"{name} 应单调递增，出现反转 {diffs[diffs < -1e-12][:3]}"


def test_out_of_range_raises_by_default(ds):
    """**外插必须显式拒绝**（旧 np.interp 会静默夹紧 —— 这正是被点出的缺陷）。"""
    with pytest.raises(LUTOutOfRange):
        evaluate(ds, "cam", 50.001)
    with pytest.raises(LUTOutOfRange):
        evaluate(ds, "cam", -50.001)
    with pytest.raises(LUTOutOfRange):
        evaluate(ds, "cam", math.nan)


def test_clamp_policy_is_opt_in():
    """要夹紧必须**显式**声明，且仍返回端点值（不可静默）。"""
    ds = build(TRAVEL, geometric={"cam": CAM}, extrapolation="clamp")
    assert evaluate(ds, "cam", 999.0) == pytest.approx(CAM[-1], rel=0, abs=1e-12)
    assert evaluate(ds, "cam", -999.0) == pytest.approx(CAM[0], rel=0, abs=1e-12)


def test_deviation_vs_piecewise_is_measured_not_claimed(ds):
    """把"换了插值方式"变成**数字**：非线性通道的偏差必须存在但受控。

    若偏差为 0 ⇒ 说明样条退化成线性（实现错了）；若过大 ⇒ 说明用了非保形样条。
    """
    dev_spring = max_deviation_vs_piecewise(ds, "spring_force_n")
    span = max(SPRING) - min(SPRING)
    assert dev_spring > 0.5, f"非线性通道应有可见偏差（实测 {dev_spring:.2f} N）"
    assert dev_spring < 0.05 * span, f"偏差应小于量程 5%（实测 {dev_spring/span*100:.2f}%）"
    # 近线性通道的偏差应显著更小
    dev_cam = max_deviation_vs_piecewise(ds, "cam")
    assert dev_cam < dev_spring


def test_invalid_tables_are_rejected():
    """**控制实验**：不合法的表必须报错，不得"勉强插值"。"""
    with pytest.raises(LUTInvalidTable):
        build((0.0, 0.0, 10.0), geometric={"cam": (1.0, 2.0, 3.0)})        # travel 非递增
    with pytest.raises(LUTInvalidTable):
        build((0.0, 10.0), geometric={"cam": (1.0, 2.0, 3.0)})             # 长度不匹配
    with pytest.raises(LUTInvalidTable):
        build((0.0,), geometric={"cam": (1.0,)})                            # 点太少
    with pytest.raises(LUTInvalidTable):
        build((0.0, 10.0), geometric={"cam": (1.0, math.nan)})              # 非有限
    with pytest.raises(LUTInvalidTable):
        build((0.0, 10.0), geometric={"cam": (1.0, 2.0)}, extrapolation="zero")  # 策略非法
    with pytest.raises(LUTInvalidTable):
        build((0.0, 10.0))                                                  # 无通道


def test_from_kc_lut_adapter_matches_legacy_dict():
    """适配器：现有 `kc_luts` 字典 → 新 schema，且节点值与字典逐点一致。"""
    legacy = {"travel": list(TRAVEL), "toe": list(TOE), "cam": list(CAM)}
    ds = from_kc_lut("front", legacy)
    assert set(ds.geometric_channels()) == {"toe", "cam"}
    assert ds.extrapolation == "raise"
    for name, ys in (("toe", TOE), ("cam", CAM)):
        for t, want in zip(TRAVEL, ys, strict=True):
            assert evaluate(ds, name, t) == pytest.approx(want, rel=0, abs=1e-12)


def test_monotone_slopes_are_finite_and_sign_consistent():
    """斜率本身的自洽性：与数据同号（或零），且有限。"""
    xs = np.asarray(TRAVEL)
    ys = np.asarray(CAM)
    m = monotone_cubic_slopes(xs, ys)
    assert np.all(np.isfinite(m))
    assert np.all(m <= 1e-12), "CAM 递减 ⇒ 斜率应为负"
    assert abs(m[2]) > 0.0
