"""减振器四象限表验收（T3 / P4，2026-10-20）

断言分三类：
· **数据事实**：CSV 里的具体数值（含上游自述的缺陷）；
· **契约**：零速度零力、压缩力≥0/复原力≤0、档位越大越硬；
· **物理/数值性质**：节点精确、端点斜率线性外推、越界标志。
"""

from __future__ import annotations

import math

import pytest

from src.components.damper_table import (
    KNOWN_DEFECTS,
    DamperHalf,
    DamperTable,
    DamperTableInvalid,
    force,
    load_csv,
)


@pytest.fixture(scope="module")
def t():
    return load_csv()


def test_table_shape(t):
    """表结构：12 档；压缩轴含 0（13 点）、复原轴不含 0（12 点）。"""
    assert t.click_range == (0, 11)
    assert len(t.compression.velocity_m_s) == 13
    assert len(t.rebound.velocity_m_s) == 12
    assert t.compression.velocity_m_s[0] == 0.0
    assert t.rebound.velocity_m_s[-1] < 0.0 < t.compression.velocity_m_s[0] + 1e-12


def test_knot_values_match_csv(t):
    """节点值与 vendored CSV 逐点一致（抽若干档/速度，含两端与零点）。"""
    cases = [
        (0.0, 0, 0.0), (0.0, 11, 0.0),
        (0.100, 0, 124.0), (0.100, 11, None),
        (0.300, 7, 725.0), (0.300, 8, 671.0), (0.300, 9, 799.0),
        (0.500, 0, 874.0), (0.500, 11, None),
        (-0.100, 0, -132.0), (-0.500, 0, -813.0),
    ]
    for v, c, want in cases:
        f, _slope, out = force(t, v, click_c=c, click_r=c)
        assert out is False
        if want is not None:
            assert f == pytest.approx(want, rel=0, abs=1e-9), f"v={v} click={c} 得到 {f}，CSV 为 {want}"


def test_known_defect_is_preserved_not_silently_fixed(t):
    """**上游自述的数据缺陷必须原样保留**（click 8 @ +300 mm/s = 671 N，应为 761 N）。

    这条断言的作用不是"验证数值对"，而是"防止有人顺手改成 761 而不登记"。
    若将来真的修正，必须同时改 `KNOWN_DEFECTS` 并在 DEVLOG 登记。
    """
    for click, v_mm_s, actual, intended in KNOWN_DEFECTS:
        f, _s, _o = force(t, v_mm_s / 1000.0, click_c=click, click_r=click)
        assert f == pytest.approx(actual, rel=0, abs=1e-9), "缺陷值被改动"
        assert abs(f - intended) > 50.0, "缺陷似乎已被修正（与应有值接近）"
    # 缺陷的表现：该速度下力随档位**不单调**
    f7 = force(t, 0.300, click_c=7)[0]
    f8 = force(t, 0.300, click_c=8)[0]
    f9 = force(t, 0.300, click_c=9)[0]
    assert f8 < f7 and f8 < f9, f"缺陷表现应为中间低：{f7} → {f8} → {f9}"


def test_zero_velocity_zero_force(t):
    """契约：每个档位零速度零力（上游同款约束，构造时也会校验）。"""
    for c in range(t.compression.n_clicks):
        f, _s, _o = force(t, 0.0, click_c=c, click_r=c)
        assert f == pytest.approx(0.0, abs=1e-12), f"click {c} 零速非零力：{f}"


def test_sign_convention(t):
    """压缩正力、复原负力。"""
    for v in (0.025, 0.100, 0.300, 0.500):
        assert force(t, v, click_c=5)[0] > 0.0
    for v in (-0.025, -0.100, -0.300, -0.500):
        assert force(t, v, click_r=5)[0] < 0.0


def test_stiffer_click_means_more_force_except_at_defect(t):
    """档位越大越硬（在一组**不含缺陷**的速度点上检查），且档位间严格递增。"""
    for v in (0.050, 0.100, 0.200, 0.450):
        seq = [force(t, v, click_c=c)[0] for c in range(12)]
        assert all(b > a for a, b in zip(seq, seq[1:], strict=False)), f"v={v} 档位非严格递增：{seq}"
    for v in (-0.050, -0.100, -0.200, -0.450):
        seq = [force(t, v, click_r=c)[0] for c in range(12)]
        assert all(b < a for a, b in zip(seq, seq[1:], strict=False)), f"v={v} 复原档位应更负：{seq}"


def test_fractional_click_is_linear_blend(t):
    """档位插值是**线性**混合：click 7.5 = (F7 + F8)/2。"""
    f7 = force(t, 0.100, click_c=7)[0]
    f8 = force(t, 0.100, click_c=8)[0]
    f75 = force(t, 0.100, click_c=7.5)[0]
    assert f75 == pytest.approx(0.5 * (f7 + f8), rel=1e-12)


def test_extrapolation_is_linear_with_end_slope_and_flagged(t):
    """表外：按**端点斜率**线性延续，且置 out_of_range=True。"""
    v_max = t.compression.velocity_m_s[-1]
    f_end, slope_end, out_end = force(t, v_max, click_c=6)
    assert out_end is False
    d = 0.05
    f_out, _s, out = force(t, v_max + d, click_c=6)
    assert out is True, "超出表范围必须置越界标志"
    assert f_out == pytest.approx(f_end + slope_end * d, rel=1e-9), "外推应为端点斜率的线性延续"
    # 表内不得误报
    for v in (0.0, 0.05, 0.25, 0.5):
        assert force(t, v, click_c=6)[2] is False


def test_invalid_tables_are_rejected():
    """**控制实验**：不合法的表必须构造失败。"""
    ok_v = (0.0, 0.1, 0.2)
    with pytest.raises(DamperTableInvalid):        # 零速度非零力
        DamperTable(DamperHalf(ok_v, ((1.0, 2.0, 3.0),)),
                    DamperHalf((-0.2, -0.1), ((0.0, 0.0),)))
    with pytest.raises(DamperTableInvalid):        # 速度轴非递增
        DamperTable(DamperHalf((0.0, 0.2, 0.1), ((0.0, 1.0, 2.0),)),
                    DamperHalf((-0.2, -0.1), ((0.0, 0.0),)))
    with pytest.raises(DamperTableInvalid):        # 形状不匹配
        DamperTable(DamperHalf(ok_v, ((0.0, 1.0),)),
                    DamperHalf((-0.2, -0.1), ((0.0, 0.0),)))
    with pytest.raises(DamperTableInvalid):        # 压缩半区出现负力
        DamperTable(DamperHalf(ok_v, ((0.0, -5.0, -9.0),)),
                    DamperHalf((-0.2, -0.1), ((0.0, 0.0),)))


def test_bad_query_is_rejected(t):
    """非法查询：档位越界 / 速度非有限 / 通道形状非法。"""
    with pytest.raises(DamperTableInvalid):
        force(t, 0.1, click_c=12)
    with pytest.raises(DamperTableInvalid):
        force(t, 0.1, click_c=-1)
    with pytest.raises(DamperTableInvalid):
        force(t, math.nan, click_c=0)
    with pytest.raises(DamperTableInvalid):
        force(t, math.inf, click_c=0)


def test_missing_data_file_raises(tmp_path):
    """**控制实验**：数据缺失必须报错，不能静默返回空表。"""
    with pytest.raises(FileNotFoundError):
        load_csv(tmp_path / "nope.csv")
