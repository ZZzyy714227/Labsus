"""质量与惯量属性体系测试（M14 / G44）

这些断言的意义不在于"函数能跑"，而在于**把 FSAE 清单的物理可信度钉住**：
总和与声明口径一致、质心位置符合真车量级、惯量半径落在行业带内、左右对称性成立、
以及"清单 vs 声明"的一致性校验本身是有效的（构造偏差时必须报出来）。
"""

from __future__ import annotations

from src.api.mass_properties import (
    FSAE_MASS_ITEMS,
    MassItem,
    check_mass_consistency,
    compute_mass_properties,
    fsae_mass_items,
)

WB = 1550.0
DECLARED = {"mass_kg": 235.0, "sprung_mass_kg": 183.0, "hcg_mm": 270.0, "hs_mm": 285.0}


def _fsae():
    return compute_mass_properties(fsae_mass_items(), WB)


# ── 清单与声明口径 ──────────────────────────────────────────────────────────
def test_mass_totals_match_declared_budget():
    """总质量/簧载/非簧载必须精确闭合到预设口径（235 / 183 / 52）。"""
    p = _fsae()
    assert p.mass_kg == 235.0, f"总质量 {p.mass_kg}"
    assert p.sprung_mass_kg == 183.0, f"簧载 {p.sprung_mass_kg}"
    assert p.unsprung_kg == 52.0, f"非簧载合计 {p.unsprung_kg}"
    assert p.unsprung_front_corner_kg == 12.0, f"前每角 {p.unsprung_front_corner_kg}"
    assert p.unsprung_rear_corner_kg == 14.0, f"后每角 {p.unsprung_rear_corner_kg}"


def test_consistency_check_reports_all_four_declared_fields():
    diffs = check_mass_consistency(_fsae(), DECLARED)
    assert {d["field"] for d in diffs} == set(DECLARED)
    bad = [d for d in diffs if not d["ok"]]
    assert not bad, f"清单与声明超差：{bad}"


def test_consistency_check_detects_deliberate_error():
    """校验必须是**有效**的：人为把清单加 20kg 配重，必须报出质量超差。

    只断言"当前数据通过"等于没验证校验器——这类"守卫本身是否有效"的对照，
    在本项目已有先例（测试 gate 曾长期假绿）。
    """
    heavy = fsae_mass_items() + [
        MassItem("test_ballast", "测试配重", 20.0, 0.0, 800.0, 250.0, "sprung")
    ]
    p = compute_mass_properties(heavy, WB)
    diffs = check_mass_consistency(p, DECLARED)
    mass_row = next(d for d in diffs if d["field"] == "mass_kg")
    assert not mass_row["ok"], "加 20kg 后一致性校验必须报超差"
    assert abs(mass_row["delta"] - 20.0) < 1e-6


# ── 质心 ────────────────────────────────────────────────────────────────────
def test_cg_height_and_sprung_cg_match_declared_within_tolerance():
    p = _fsae()
    assert abs(p.cg_mm[2] - DECLARED["hcg_mm"]) <= 2.0, f"整车质心高 {p.cg_mm[2]:.2f}"
    assert abs(p.sprung_cg_z_mm - DECLARED["hs_mm"]) <= 4.0, f"簧载质心高 {p.sprung_cg_z_mm:.2f}"
    assert p.sprung_cg_z_mm > p.cg_mm[2], "簧载质心必须高于整车质心（非簧载在轮心高度拉低整车质心）"


def test_cg_is_laterally_symmetric():
    """左右对称车：x 质心与两个横-纵/横-垂惯性积必须≈0。

    首版把散热器只放在 +X 侧 ⇒ x 质心偏 4.3mm、Ixy 达 Izz 的 0.6%。这条断言就是为它加的。
    """
    p = _fsae()
    assert abs(p.cg_mm[0]) < 1.0, f"x 质心应≈0（实际 {p.cg_mm[0]:.2f}mm）"
    assert abs(p.inertia["Ixy"]) / p.inertia["Izz"] < 0.01, "Ixy/Izz 应 <1%"
    assert abs(p.inertia["Ixz"]) / p.inertia["Izz"] < 0.01, "Ixz/Izz 应 <1%"
    assert not p.warnings, f"不应有对称性警告：{p.warnings}"


def test_static_axle_split_from_cg():
    """由质心纵坐标算出的静载分配应接近前后 50/50（轴距中点附近质心）。

    声明口径是两轴簧载质量相等（91.5/91.5 = 50.0%）；清单算出 51.4% —— 两者差 1.4%，
    属于"声明值 vs 部件清单"的口径差，登记为待查项，此处只钉住量级（不假装它是 50.0）。
    """
    p = _fsae()
    assert 48.0 < p.static_front_pct < 53.0, f"前轴静载占比 {p.static_front_pct:.1f}%"


# ── 惯量张量 ────────────────────────────────────────────────────────────────
def test_inertia_axis_mapping_and_magnitudes():
    """轴映射必须与文档一致：X=外→俯仰、Y=前→侧倾、Z=上→横摆。

    横摆惯量最大（质量沿车长铺开）、侧倾惯量最小（车宽窄、且低于重心），
    这是所有汽车的共同特征；若映射写反，这个不等式立刻不成立。
    """
    p = _fsae()
    assert p.i_yaw > p.i_pitch > p.i_roll, (
        f"应满足 Izz(横摆){p.i_yaw:.1f} > Ixx(俯仰){p.i_pitch:.1f} > Iyy(侧倾){p.i_roll:.1f}"
    )


def test_yaw_radius_of_gyration_in_industry_band():
    """横摆惯量半径 k_z/L ≈ 0.30~0.36（轿车 0.30~0.35、赛车 0.33~0.36）。

    这是比 Izz 绝对值更可靠的体量判据。首版把车架/车身各只写一件（质量全堆在质心
    附近）时 k_z/L 偏低；按前后分段后才落进带内——这条断言的作用就是守住它。
    """
    p = _fsae()
    ratio = p.radius_of_gyration_mm("yaw") / WB
    assert 0.30 <= ratio <= 0.36, f"k_z/L = {ratio:.3f}（应 0.30~0.36）"


def test_roll_yaw_coupling_is_present_and_small():
    """侧倾-横摆耦合 Iyz 应存在（前后质量高度不对称）但远小于 Izz。

    Iyz 恒为 0 说明清单把前后高度差抹平了（例如所有件同高）；过大则说明位置写错。
    """
    p = _fsae()
    rel = abs(p.inertia["Iyz"]) / p.inertia["Izz"]
    assert 0.001 < rel < 0.10, f"Iyz/Izz = {rel*100:.2f}%（应 0.1%~10%）"
    assert p.inertia["Iyz"] > 0, "驾驶员高而靠前、动力总成低而靠后 ⇒ Iyz 应为正（符号即物理）"


def test_inertia_scales_with_mass_position():
    """把一件质量从质心附近挪到车尾，Izz 必须增大——验证平行轴项算对了。"""
    base = [MassItem("a", "A", 10.0, 0.0, 775.0, 0.0, "sprung"),
            MassItem("b", "B", 10.0, 0.0, 775.0, 0.0, "sprung")]
    moved = [MassItem("a", "A", 10.0, 0.0, 775.0, 0.0, "sprung"),
             MassItem("b", "B", 10.0, 0.0, 1500.0, 0.0, "sprung")]
    i_base = compute_mass_properties(base, WB).i_yaw
    i_moved = compute_mass_properties(moved, WB).i_yaw
    assert i_moved > i_base, f"后移后 Izz 应变大（{i_moved:.3f} vs {i_base:.3f}）"


def test_inventory_is_auditable():
    """清单必须可审计：id 唯一、非簧载成对（左右各一）、余项显式且带说明。"""
    ids = [i.id for i in FSAE_MASS_ITEMS]
    assert len(ids) == len(set(ids)), "id 必须唯一"
    for i in FSAE_MASS_ITEMS:
        if i.kind.startswith("unsprung") and abs(i.x) > 1e-9:
            # 需要镜像的件：镜像后左右各一件
            pass
    ballast = [i for i in FSAE_MASS_ITEMS if "ballast" in i.id]
    assert len(ballast) == 1 and ballast[0].note, "余项必须显式且写明用途"
    items = fsae_mass_items()
    n_un = sum(1 for i in items if i.kind != "sprung")
    assert n_un % 2 == 0, "非簧载件必须成对（左右各一）"
    # 镜像后 x 方向质量矩应为 0
    assert abs(sum(i.mass_kg * i.x for i in items)) < 1e-9, "左右质量矩应精确抵消"
