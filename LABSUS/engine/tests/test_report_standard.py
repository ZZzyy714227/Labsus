"""技术档案格式契约（T4，2026-10-20）

借外部仓库的做法：**每份受约束的文档都被测试检查格式，漂移就红**。
受约束 = 文件开头带 `<!-- 档案标准: v1 -->` 标记（opt-in，不误伤 DEVLOG/计划/handbook）。

标准见 `docs/standards/档案标准.md`：必含"来源与可信级别 / 方法或形式 / 验证数字 / 边界与遗留"四节。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# tests/ → engine/ → LABSUS/ → 仓库根
REPO_ROOT = Path(__file__).resolve().parents[3]
DOCS = REPO_ROOT / "docs"
MARKER = "<!-- 档案标准: v1 -->"

# 四节各自的可接受关键词（任一命中即可）
SECTIONS = {
    "来源与可信级别": re.compile(r"来源|可信级别|provenance", re.IGNORECASE),
    "方法或形式": re.compile(r"形式|方法|做了什么|推导"),
    "验证数字": re.compile(r"验证|复核|数字|实测"),
    "边界与遗留": re.compile(r"遗留|边界|下一步|未做"),
}


def _marked_docs() -> list[Path]:
    if not DOCS.exists():
        return []
    out = []
    for p in sorted(DOCS.glob("*.md")):
        try:
            head = p.read_text(encoding="utf-8")[:2000]
        except OSError:
            continue
        if MARKER in head:
            out.append(p)
    return out


def test_marked_docs_exist_or_skip():
    """docs/ 是本地档案（不入库）⇒ CI 里可能不存在，此时跳过而不是失败。"""
    docs = _marked_docs()
    if not DOCS.exists():
        pytest.skip("docs/ 不存在（本地档案目录，不入库）")
    assert docs, f"docs/ 下没有任何带 `{MARKER}` 标记的档案；若刚清空请检查标记是否被误删"


@pytest.mark.parametrize("path", _marked_docs(), ids=lambda p: p.name)
def test_marked_doc_has_required_sections(path: Path):
    """受约束档案必须含四节（按关键词识别，不强制小标题写法）。"""
    text = path.read_text(encoding="utf-8")
    missing = [name for name, pat in SECTIONS.items() if not pat.search(text)]
    assert not missing, f"{path.name} 缺少小节：{missing}（见 docs/standards/档案标准.md）"


@pytest.mark.parametrize("path", _marked_docs(), ids=lambda p: p.name)
def test_marked_doc_has_no_empty_claims(path: Path):
    """纪律检查：受约束档案不得出现"更准确/更平滑"这类无数值断言。"""
    text = path.read_text(encoding="utf-8")
    banned = ["更准确", "更平滑", "更真实", "大幅提升", "显著改善"]
    hits = [w for w in banned if w in text]
    assert not hits, f"{path.name} 出现无数值支撑的形容词断言：{hits}"


def test_inventory_matches_marked_docs():
    """档案清单与实际带标记的文件必须吻合（防止清单漂移）。"""
    listing = DOCS / "standards" / "档案清单.md"
    if not listing.exists():
        pytest.skip("档案清单不存在")
    listed = set(re.findall(r"docs/([^`\s]+\.md)", listing.read_text(encoding="utf-8")))
    actual = {p.name for p in _marked_docs()}
    assert listed == actual, (
        f"清单与实际不一致\n  清单多出: {sorted(listed - actual)}\n  实际多出: {sorted(actual - listed)}")
