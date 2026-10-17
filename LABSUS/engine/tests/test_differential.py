"""差速器模型测试（M16 / G46）

这些断言把差速器的**物理不变量**钉住，而不是"函数能跑"：
开放式受弱侧拖累、锁死式按附着分配、限滑介于两者之间、对称工况三者必须完全一致
（否则就是引入了伪差异）、以及任何情况下不得超出单轮附着与可用力。
"""

from __future__ import annotations

import math

import pytest

from src.components.differential import (
    KIND_LOCKED,
    KIND_LSD,
    KIND_OPEN,
    Differential,
    axle_static_capacity_split,
    distribute_axle,
)

R = 230.0                     # FSAE 前胎半径 mm
CAP_SOFT = 300.0              # 弱侧轮纵向附着上限 N（弯内/抬轮/湿滑）
CAP_GRIP = 1200.0             # 强侧轮纵向附着上限 N


def test_open_diff_is_limited_by_the_weaker_wheel():
    """开放式：整轴 ≤ 2·min(cap)，且严格 50/50 —— 弱侧拖死整轴（FSAE 出弯最要紧的一条）。"""
    d = Differential(kind=KIND_OPEN, radius_mm=R)
    fl, fr = axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e6, d)     # 可用力给到极大，看差速器自身上限
    assert fl == pytest.approx(CAP_SOFT, rel=1e-12)
    assert fr == pytest.approx(CAP_SOFT, rel=1e-12)
    assert fl + fr == pytest.approx(2 * CAP_SOFT, rel=1e-12)
    assert fl == pytest.approx(fr), "开放式必须左右等扭矩"


def test_locked_diff_uses_full_axle_traction():
    """锁死：两轮同速 ⇒ 各达自身附着上限，整轴 = cap_l + cap_r。"""
    d = Differential(kind=KIND_LOCKED, radius_mm=R)
    fl, fr = axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e6, d)
    assert fl == pytest.approx(CAP_SOFT, rel=1e-12)
    assert fr == pytest.approx(CAP_GRIP, rel=1e-12)
    assert fl + fr == pytest.approx(CAP_SOFT + CAP_GRIP, rel=1e-12)


def test_lsd_interpolates_and_is_monotonic_in_bias():
    """限滑：整轴能力介于 open 与 locked 之间，且随偏置系数单调不减。"""
    open_cap = sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9, Differential(KIND_OPEN, radius_mm=R)))
    lock_cap = sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9, Differential(KIND_LOCKED, radius_mm=R)))
    seq = [sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9,
                          Differential(KIND_LSD, bias_ratio=b, radius_mm=R)))
           for b in (0.0, 0.25, 0.5, 1.0, 2.0)]
    assert open_cap <= seq[0] <= seq[-1] <= lock_cap + 1e-9, f"能力链：{open_cap} {seq} {lock_cap}"
    for i in range(1, len(seq)):
        assert seq[i] >= seq[i - 1] - 1e-9, f"偏置增大能力不得下降（{seq[i-1]} → {seq[i]}）"
    assert seq[0] == pytest.approx(open_cap, rel=1e-12), "偏置=0 且无预载 ⇒ 等价开放式"
    # 偏置足够大时达到锁死能力（转移能力不再受限）
    assert seq[-1] == pytest.approx(lock_cap, rel=1e-9)


def test_lsd_preload_alone_allows_transfer_without_input():
    """预载：即使输入扭矩为零（f_in=0）也能转移 preload/r 的力差。

    分工：预载负责"入弯收油时仍有锁紧"（与输入无关），偏置随输入扭矩增长。
    ⚠ 力差是 preload/r，不是 2·preload/r —— 初版注释写错，测试当场抓出。
    """
    preload_nm = 25.0
    d = Differential(kind=KIND_LSD, preload_nm=preload_nm, bias_ratio=0.0, radius_mm=R)
    df = d.lock_force_n(0.0)
    assert df == pytest.approx(preload_nm / (R / 1000.0), rel=1e-12)
    fl, fr = axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9, d)
    assert fr - fl == pytest.approx(df, rel=1e-9), "力差应恰为预载允许量"
    assert Differential(kind=KIND_LSD, radius_mm=R).lock_force_n(0.0) == 0.0


def test_symmetric_load_gives_identical_split_for_all_differentials():
    """对称工况（左右附着相同）三种差速器必须给出**完全相同**结果——否则是伪差异。

    这条是防"模型引入了不该有的左右偏置"的守门断言。
    """
    for avail in (100.0, 500.0, 5000.0):
        outs = [axle_static_capacity_split(800.0, 800.0, avail, Differential(kind=k, radius_mm=R))
                for k in (KIND_OPEN, KIND_LSD, KIND_LOCKED)]
        for fl, fr in outs:
            assert fl == pytest.approx(fr, rel=1e-12), f"对称工况左右必须相等（{fl} vs {fr}）"
        # 同一个可用力下三种差速器必须给出同一结果（跨 avail 互比是无意义的——初版就错在这）
        for o in outs[1:]:
            assert o[0] == pytest.approx(outs[0][0], rel=1e-12), f"avail={avail} 三种应一致"


def test_never_exceeds_available_force_or_per_wheel_grip():
    """任何组合下：左右之和 ≤ 可用力，且任一轮不得超过自身附着上限。"""
    for k in (KIND_OPEN, KIND_LSD, KIND_LOCKED):
        for bias in (0.0, 0.5, 1.0, 5.0):
            for avail in (0.0, 100.0, 700.0, 1500.0, 1e6):
                d = Differential(kind=k, preload_nm=10.0, bias_ratio=bias, radius_mm=R)
                fl, fr = axle_static_capacity_split(CAP_SOFT, CAP_GRIP, avail, d)
                assert fl >= -1e-9 and fr >= -1e-9, "力不得为负"
                assert fl + fr <= avail + 1e-6, f"总力超可用：{fl}+{fr} > {avail}"
                assert fl <= CAP_SOFT + 1e-6, f"弱侧超附着：{fl} > {CAP_SOFT}"
                assert fr <= CAP_GRIP + 1e-6, f"强侧超附着：{fr} > {CAP_GRIP}"


def test_torque_bias_goes_to_the_grippier_wheel():
    """优先给附着更大的一侧（锁紧时按附着分配）——横摆力矩方向即由此而来。"""
    for k in (KIND_LSD, KIND_LOCKED):
        fl, fr = axle_static_capacity_split(CAP_GRIP, CAP_SOFT, 1e9, Differential(kind=k, bias_ratio=1.0, radius_mm=R))
        assert fl > fr, "左侧附着更大时应得到更多驱动（传入顺序不得颠倒语义）"
        assert fl <= CAP_GRIP + 1e-6 and fr <= CAP_SOFT + 1e-6


def test_differential_capability_changes_achievable_drive_force():
    """三种差速器在同一"一侧打滑"工况下的整轴能力差异（这是它在赛道上的意义）。

    弱侧 300N / 强侧 1200N：开放式 600N、锁死 1500N、限滑(预载15N·m+偏置0.8) 介于其间。
    差距可达 2.5 倍 —— 这就是"出弯能不能把动力放到地上"。
    """
    caps = {"open": sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9, Differential(KIND_OPEN, radius_mm=R))),
            "locked": sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9, Differential(KIND_LOCKED, radius_mm=R)))}
    assert caps["open"] == pytest.approx(600.0, rel=1e-12)
    assert caps["locked"] == pytest.approx(1500.0, rel=1e-12)
    assert caps["locked"] / caps["open"] == pytest.approx(2.5, rel=1e-9)
    # 限滑要用**真实可用驱动力**才看得出区别：f_avail 给天文数字时，偏置扭矩 0.8·f_avail
    # 足以完全解锁 ⇒ 限滑退化为锁死（这本身是重要物理结论：LSD 的优势与输入扭矩同量级）
    d = Differential(KIND_LSD, preload_nm=15.0, bias_ratio=0.8, radius_mm=R)
    lsd_real = sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1000.0, d))
    lsd_huge = sum(axle_static_capacity_split(CAP_SOFT, CAP_GRIP, 1e9, d))
    assert caps["open"] < lsd_real < caps["locked"], f"真实输入下限滑应介于其间（{lsd_real}）"
    assert lsd_huge == pytest.approx(caps["locked"], rel=1e-9), "输入足够大时限滑应能完全锁定"


def test_spec_validation_rejects_nonsense():
    with pytest.raises(ValueError):
        Differential(kind="helical")
    with pytest.raises(ValueError):
        Differential(kind=KIND_LSD, preload_nm=-1.0)
    with pytest.raises(ValueError):
        Differential(kind=KIND_LSD, bias_ratio=-0.5)
    with pytest.raises(ValueError):
        Differential(kind=KIND_LOCKED, radius_mm=0.0)


def test_locked_lock_force_is_infinite_open_is_zero():
    assert Differential(kind=KIND_OPEN, radius_mm=R).lock_force_n(500.0) == 0.0
    assert math.isinf(Differential(kind=KIND_LOCKED, radius_mm=R).lock_force_n(500.0))


# ═══════════════════════════════════════════════════════════════════════════
# M19（T2）· 运行时分配 distribute_axle —— 真源同前端 16-powertrain.js::distributeAxle
# ═══════════════════════════════════════════════════════════════════════════
def test_distribute_axle_open_is_strict_5050_and_ignores_load():
    """open/未知类型/缺省：严格 50/50，**不按载荷**（弱侧打滑时整轴上限自然被拖住）。"""
    for fz in ((500.0, 1500.0), (0.0, 0.0), (1200.0, 1200.0)):
        tl, tr = distribute_axle(400.0, 10.0, 10.0, fz[0], fz[1], {"type": "open"})
        assert tl == pytest.approx(200.0, rel=1e-12) and tr == pytest.approx(200.0, rel=1e-12)
    tl, tr = distribute_axle(400.0, 10.0, 10.0, 500.0, 1500.0, None)
    assert (tl, tr) == (200.0, 200.0), "缺省（None）应等同 open"
    tl, tr = distribute_axle(400.0, 10.0, 10.0, 500.0, 1500.0, {"type": "helical"})
    assert (tl, tr) == (200.0, 200.0), "未知类型应失效安全到对称"


def test_distribute_axle_locked_follows_vertical_load():
    """locked：按垂直载荷分配；载荷和 <=0 退化 50/50。"""
    tl, tr = distribute_axle(400.0, 10.0, 10.0, 400.0, 1200.0, {"type": "locked"})
    assert tl == pytest.approx(100.0, rel=1e-12) and tr == pytest.approx(300.0, rel=1e-12)
    tl, tr = distribute_axle(400.0, 0.0, 0.0, 0.0, 0.0, {"type": "locked"})
    assert (tl, tr) == (200.0, 200.0), "载荷和 0 应退化 50/50"


def test_distribute_axle_lsd_transfers_from_fast_to_slow_wheel():
    """lsd：从快轮向慢轮转移；dw>=0（右轮快）=> 向左轮（tL 增大）——与前端 Tsign 同号。"""
    spec = {"type": "lsd", "bias": 1.6, "lockNm": 25.0, "slipRefRadS": 8.0}
    tl, tr = distribute_axle(200.0, 10.0, 14.0, 600.0, 600.0, spec)
    assert tl > 100.0 and tr < 100.0, f"右轮快应向左轮转移（tL={tl}, tR={tr}）"
    tl2, tr2 = distribute_axle(200.0, 14.0, 10.0, 600.0, 600.0, spec)
    assert tl2 < 100.0 and tr2 > 100.0, "左轮快应向右轮转移"


def test_distribute_axle_lsd_zero_slip_is_5050_when_no_lock():
    """偏置与锁紧都为 0 => 严格 50/50（无锁紧能力的 LSD 等同 open）。"""
    tl, tr = distribute_axle(300.0, 5.0, 9.0, 600.0, 600.0,
                             {"type": "lsd", "bias": 1.0, "lockNm": 0.0})
    assert (tl, tr) == (150.0, 150.0)


def test_distribute_axle_transfer_is_exactly_the_source_formula():
    """转移量必须精确等于 ((bias-1)/(bias+1))*|tAxle|/2 + ramp（未触 clamp 的工况）。"""
    bias, lock, slip, taxle = 1.6, 25.0, 8.0, 200.0
    wl, wr = 10.0, 12.0
    ramp = lock * min(1.0, abs(wr - wl) / slip)
    expect = min(lock, ((bias - 1.0) / (bias + 1.0)) * abs(taxle) / 2.0 + ramp)
    tl, _tr = distribute_axle(taxle, wl, wr, 600.0, 600.0,
                              {"type": "lsd", "bias": bias, "lockNm": lock, "slipRefRadS": slip})
    assert tl - taxle / 2.0 == pytest.approx(expect, rel=1e-12)


def test_distribute_axle_conserves_torque_and_clamps_transfer():
    """守恒：tL+tR == tAxle（1e-12 内）；转移量不得超过 lockNm（clamp 生效）。"""
    import itertools
    specs = [None, {"type": "open"}, {"type": "locked"},
             {"type": "lsd", "bias": 1.6, "lockNm": 25.0, "slipRefRadS": 8.0},
             {"type": "lsd", "bias": 2.0, "lockNm": 0.0},
             {"type": "lsd", "bias": 0.5, "lockNm": -3.0},
             {"type": "lsd", "bias": 1.5, "lockNm": 10.0, "slipRefRadS": 0.0}]
    for spec, taxle, dw, fzl, fzr in itertools.product(
            specs, (0.0, 200.0, -350.0), (-20.0, 0.0, 20.0), (0.0, 700.0), (0.0, 900.0)):
        tl, tr = distribute_axle(taxle, 10.0, 10.0 + dw, fzl, fzr, spec)
        assert abs(tl + tr - taxle) < 1e-12, f"守恒被破坏：{tl}+{tr}!={taxle}"
        lock = (spec or {}).get("lockNm") or 0.0
        if (spec or {}).get("type") == "lsd":
            assert abs(tl - taxle / 2.0) <= max(lock, 0.0) + 1e-12, "转移量不得超过 lockNm"


def test_distribute_axle_matches_cross_language_artifact():
    """跨语言对拍（Python 侧）：逐例比对 engine/data/diff_parity_cases.json。

    该 JSON 由本模块生成；前端 JS 侧由 web/test/test_dom.js 读同一文件比对
    （做法同 M15 的跨语言守卫）⇒ 两侧任一方改了公式都会立刻失败。
    """
    import json
    import pathlib
    art = pathlib.Path(__file__).resolve().parents[1] / "data" / "diff_parity_cases.json"
    assert art.exists(), f"对拍工件缺失：{art}（应随代码入库）"
    data = json.loads(art.read_text(encoding="utf-8"))
    cases = data["cases"]
    assert len(cases) >= 24, f"对拍用例太少（{len(cases)}），覆盖不住三型与边界"
    worst = 0.0
    for i, c in enumerate(cases):
        tl, tr = distribute_axle(c["t_axle"], c["w_l"], c["w_r"], c["fz_l"], c["fz_r"], c["diff"])
        for got, exp, tag in ((tl, c["t_l"], "t_l"), (tr, c["t_r"], "t_r")):
            denom = max(1.0, abs(exp))
            rel = abs(got - exp) / denom
            worst = max(worst, rel)
            assert rel < 1e-9, f"用例 {i} {tag}: {got} != {exp} (rel={rel:.2e}, diff={c['diff']})"
    print(f"[parity] distribute_axle worst rel = {worst:.2e}（{len(cases)} 例）")
