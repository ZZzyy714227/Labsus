"""外部数据资产溯源契约（T4，2026-10-20）

规则：`engine/data/**` 下任何文件都必须在 `src/provenance.py` 的 REGISTRY 里登记，
且级别必须落在允许集合内、出处不得为空。

作用：新增数据资产却忘记登记溯源 ⇒ 测试立刻红。这比文档里写"请记得标注来源"有效得多。
"""

from __future__ import annotations

import pytest

from src.provenance import (
    ALLOWED_LEVELS,
    DATA_ROOT,
    REGISTRY,
    get,
    requires_level,
    stale_entries,
    summarise,
    unregistered_files,
)


def test_every_data_file_is_registered():
    """**核心契约**：数据目录下不得有未登记溯源的资产。"""
    missing = unregistered_files()
    assert not missing, (
        "以下数据资产未登记溯源（请在 engine/src/provenance.py 的 REGISTRY 里补上）:\n  "
        + "\n  ".join(missing))


def test_no_stale_registry_entries():
    """反向契约：已登记但文件不存在 ⇒ 说明删文件忘了删登记。"""
    stale = stale_entries()
    assert not stale, f"登记了但文件不存在: {stale}"


def test_all_entries_are_well_formed():
    """每条登记：级别合法、出处非空、路径相对且无盘符。"""
    assert REGISTRY, "注册表为空"
    for item in REGISTRY:
        assert item.level in ALLOWED_LEVELS, item.path
        assert item.source.strip(), f"{item.path}: source 为空"
        assert not item.path.startswith(("/", "\\")), item.path
        assert ":" not in item.path.replace("/", ""), f"{item.path}: 不应含盘符"
        if item.content_level:
            assert item.content_level in ALLOWED_LEVELS, item.path


def test_registered_paths_exist_on_disk():
    """登记项必须指向真实文件。"""
    for item in REGISTRY:
        assert (DATA_ROOT / item.path).exists(), f"{item.path} 不存在"


def test_key_assets_have_expected_levels():
    """关键资产的级别写死（防止有人把 proposed 悄悄改成 measured）。

    · TTC 胎参数：文件 vendored、**内容 lab-fit**（台架拟合，不是本车实测）；
    · 减振器表：文件 vendored、内容 **measured**（实车台架）；
    · 对拍用例：**derived**（本项目生成）。
    """
    ttc = get("ttc/hoosier-43075-r20-simple.xml")
    assert ttc.level == "vendored"
    assert ttc.content_level == "lab-fit"
    damper = get("dampers/multimatic_dssv_vc01_front.csv")
    assert damper.level == "vendored"
    assert damper.content_level == "measured"
    assert "671" in damper.note, "已知缺陷（671 N）的说明不得从溯源里消失"
    parity = get("diff_parity_cases.json")
    assert parity.level == "derived"


def test_requires_level_gate_blocks_non_measured_as_calibration():
    """下游判断"能否当标定依据"的门：lab-fit 资产不得被判为 measured。"""
    assert requires_level("dampers/multimatic_dssv_vc01_front.csv", min_levels=("measured",))
    assert not requires_level("ttc/hoosier-43075-r20-simple.xml", min_levels=("measured",))
    assert requires_level("ttc/hoosier-43075-r20-simple.xml", min_levels=("lab-fit", "measured"))


def test_unknown_asset_raises():
    """**控制实验**：未登记资产必须报错，不得静默返回默认值。"""
    with pytest.raises(KeyError):
        get("nope/does-not-exist.csv")


def test_summary_is_informative():
    s = summarise()
    assert str(len(REGISTRY)) in s
    assert "登记" in s
