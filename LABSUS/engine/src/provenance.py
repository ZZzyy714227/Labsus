"""外部数据资产溯源注册表（T4，2026-10-20）

## 为什么需要它

项目里现在有若干**外部数据资产**（TTC 台架拟合、实车减振器台架数据、跨语言对拍用例）。
它们分别来自外部仓库、来自本仓库生成、或来自实测，可信级别完全不同。
缺一个强制机制时，最容易发生的事是：**某天有人把 PROPOSED 值当实测值引用**。

本模块把"每个数据文件的可信级别"变成**可执行契约**：
`engine/data/**` 下任何文件都必须在 `REGISTRY` 里登记，否则测试红。
新增数据却忘了登记 ⇒ 立刻被发现，而不是三个月后被引用进某份报告。

## 可信级别（allowed levels）

| level | 含义 |
|---|---|
| `measured` | 实测（台架/车载/称重等），可直接作为标定依据 |
| `lab-fit` | 台架拟合得到的参数集（数据实测，参数是拟合产物） |
| `literature` | 取自文献/公开资料的量级值，**未针对本车标定** |
| `proposed` | 拟定值（作者/上游标注 PROPOSED），**不得当实测引用** |
| `derived` | 由其他已登记资产或本项目代码生成（可复现） |
| `vendored` | 逐字节取自外部来源的原始文件（未改动内容） |

⚠ 一个文件可同时是 `vendored` 且内含 `lab-fit`/`proposed` 数据 —— 这种情况在 `note`
里必须写清"文件级别"与"内容级别"的区别。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

DATA_ROOT = Path(__file__).resolve().parents[1] / "data"

ALLOWED_LEVELS = ("measured", "lab-fit", "literature", "proposed", "derived", "vendored")


@dataclass(frozen=True)
class AssetProvenance:
    """一个外部/生成数据资产的可信级别与出处。"""

    path: str                      # 相对 engine/data 的路径
    level: str                     # 见 ALLOWED_LEVELS
    source: str                    # 出处（URL / 生成脚本 / 实测说明）
    note: str = ""                 # 已知局限、缺陷、使用禁区
    content_level: str = ""        # 可选：文件级别之外，内容本身的可信级别
    tags: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if self.level not in ALLOWED_LEVELS:
            raise ValueError(f"{self.path}: level={self.level!r} 不在 {ALLOWED_LEVELS}")
        if self.content_level and self.content_level not in ALLOWED_LEVELS:
            raise ValueError(f"{self.path}: content_level={self.content_level!r} 非法")
        if not self.source.strip():
            raise ValueError(f"{self.path}: source 不得为空（必须能追到出处）")


REGISTRY: tuple[AssetProvenance, ...] = (
    AssetProvenance(
        path="ttc/hoosier-43075-r20-simple.xml",
        level="vendored",
        content_level="lab-fit",
        source=("github.com/Alphabet1671/Simplified-Vehicle-Models :: "
                "models/tires/hoosier-43075-r20-simple.xml → TTC B2356 runs 8/72"),
        note=("参数为台架拟合值；`k_y_0/k_y_1/k_x_1` 为整数（疑为拟合固定值）；"
              "零外倾拟合、无回正力矩、无滚阻；纵向数据取自 43100 的 run 72（代理）。"
              "路面须乘 2/3 先验（非本车验证）。详见 docs/tire-data-provenance.md"),
        tags=("tire", "TTC", "fsae"),
    ),
    AssetProvenance(
        path="ttc/iem24_murphy_real_unitire.xml",
        level="vendored",
        content_level="derived",
        source=("同源派生：hoosier-43075-r20-simple.xml 的四个 mu_0_*/mu_s_* 各 ×2/3"),
        note="2/3 为 TTC Round 9 队伍经验的**路面先验**，非本车验证；用途仅作路面量级参考",
        tags=("tire", "road-prior"),
    ),
    AssetProvenance(
        path="dampers/multimatic_dssv_vc01_front.csv",
        level="vendored",
        content_level="measured",
        source=("github.com/Alphabet1671/Simplified-Vehicle-Models :: tests/fixtures/damper_vc01.csv"
                "（Multimatic DSSV VC01 实车台架数据；上游私有工作簿标识未入库）"),
        note=("12 档 × 25 速度点（±500 mm/s）；上游标注 RAW and uncorrected（修正未复现）。"
              "**上游自述缺陷原样保留**：click 8 @ +300 mm/s = 671 N（应为 761 N），"
              "由 KNOWN_DEFECTS 与测试锁住，不得静默修正"),
        tags=("damper", "P4"),
    ),
    AssetProvenance(
        path="diff_parity_cases.json",
        level="derived",
        source="本项目生成：跨语言差速器对拍用例（Python 端生成，162 例）",
        note="由 engine 侧代码生成，可复现；用于 JS/Python 双实现一致性校验，非物理实测",
        tags=("differential", "parity"),
    ),
)


def get(path: str) -> AssetProvenance:
    """按相对路径取登记项；未登记直接报错（不返回默认条目）。"""
    rel = path.replace("\\", "/").lstrip("/")
    for item in REGISTRY:
        if item.path == rel:
            return item
    raise KeyError(f"数据资产未登记溯源：{rel}（请在 engine/src/provenance.py 的 REGISTRY 里登记）")


def unregistered_files(root: Path | None = None) -> list[str]:
    """列出 engine/data 下存在但未登记的文件（相对路径，已排序）。"""
    base = Path(root) if root is not None else DATA_ROOT
    if not base.exists():
        return []
    known = {item.path for item in REGISTRY}
    found: list[str] = []
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(base).as_posix()
        if rel not in known:
            found.append(rel)
    return found


def stale_entries(root: Path | None = None) -> list[str]:
    """列出已登记但文件不存在的条目（防止删了文件忘了删登记）。"""
    base = Path(root) if root is not None else DATA_ROOT
    return sorted(item.path for item in REGISTRY if not (base / item.path).exists())


def requires_level(path: str, *, min_levels: tuple[str, ...]) -> bool:
    """该资产的可信级别是否落在允许集合内（供下游决定能否当标定依据）。"""
    item = get(path)
    effective = item.content_level or item.level
    return effective in min_levels


def summarise() -> str:
    """一行摘要（供门禁输出）。"""
    return f"{len(REGISTRY)} 个数据资产已登记，级别覆盖 {sorted({i.level for i in REGISTRY})}"
