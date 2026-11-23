"""基线数字与目录树一致性门禁（2026-11-23）。

确保 README.md / README.en.md / VERIFICATION.md 中的门禁条目数、Node 套件数、
核心测试断言数与模块目录树跟实际代码同步，防止文档基线漂移。

用法：
  python tools/gates/check_baselines.py          # 秒级静态与跨文档一致性检查
  python tools/gates/check_baselines.py --live   # 额外运行实时计数校验
"""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path

LABSUS = Path(__file__).resolve().parents[2]
REPO_ROOT = LABSUS.parent


def _load_check_all():
    spec = importlib.util.spec_from_file_location(
        "labsus_check_all", LABSUS / "tools" / "gates" / "check_all.py"
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _extract_first(pattern: str, text: str, label: str) -> int:
    m = re.search(pattern, text, re.MULTILINE)
    if not m:
        raise ValueError(f"未找到基线字段: {label} (pattern={pattern!r})")
    return int(m.group(1))


def check_static(errors: list[str]) -> dict[str, int]:
    ca = _load_check_all()
    full_cnt = len(ca.gates(quick=False))
    quick_cnt = len(ca.gates(quick=True))
    node_cnt = len(ca.NODE_SUITES)

    readme_zh_path = REPO_ROOT / "README.md"
    readme_en_path = REPO_ROOT / "README.en.md"
    verif_path = LABSUS / "VERIFICATION.md"

    zh = readme_zh_path.read_text(encoding="utf-8")
    en = readme_en_path.read_text(encoding="utf-8")
    verif = verif_path.read_text(encoding="utf-8")

    def check_doc_match(name: str, val: int, expected: int | None = None) -> None:
        if expected is not None and val != expected:
            errors.append(f"{name}: 文档写 {val}，实际代码为 {expected}")

    try:
        zh_full = _extract_first(r"check_all\.py\s+#\s*(\d+)\s*项", zh, "README.md check_all full")
        zh_quick = _extract_first(
            r"check_all\.py\s+--quick\s+#\s*(\d+)\s*项", zh, "README.md check_all quick"
        )
        zh_node_cmd = _extract_first(
            r"check_all\.py.*?(?:ruff\s*/\s*pytest\s*/\s*)(\d+)\s*套\s*node",
            zh,
            "README.md check_all node suites",
        )
        zh_node_tree = _extract_first(r"test/\s+#\s*前端\s*(\d+)\s*套回归", zh, "README.md web/test tree")
        check_doc_match("README.md check_all full", zh_full, full_cnt)
        check_doc_match("README.md check_all --quick", zh_quick, quick_cnt)
        check_doc_match("README.md check_all node 套件数", zh_node_cmd, node_cnt)
        check_doc_match("README.md web/test/ 目录树套件数", zh_node_tree, node_cnt)
    except ValueError as exc:
        errors.append(str(exc))

    try:
        en_full = _extract_first(
            r"check_all\.py\s+#\s*(\d+)\s*checks", en, "README.en.md check_all full"
        )
        en_quick = _extract_first(
            r"check_all\.py\s+--quick\s+#\s*(\d+)\b", en, "README.en.md check_all quick"
        )
        en_node_cmd = _extract_first(
            r"check_all\.py.*?(\d+)\s*node\s*suites", en, "README.en.md check_all node suites"
        )
        en_node_tree = _extract_first(
            r"test/\s+#\s*(\d+)\s*regression\s*suites", en, "README.en.md web/test tree"
        )
        check_doc_match("README.en.md check_all full", en_full, full_cnt)
        check_doc_match("README.en.md check_all --quick", en_quick, quick_cnt)
        check_doc_match("README.en.md check_all node suites", en_node_cmd, node_cnt)
        check_doc_match("README.en.md web/test/ tree suites", en_node_tree, node_cnt)
    except ValueError as exc:
        errors.append(str(exc))

    # Cross-doc parity for pytest / test_dom / stage_boot_check / physics_audit
    pairs = [
        (
            "pytest passed (badge)",
            r"pytest-(\d+)%20passed",
            None,
        ),
        (
            "pytest passed (cmd)",
            r"pytest engine/tests -q\s+#\s*(\d+)\s*passed",
            None,
        ),
        (
            "test_dom assertions",
            r"node web/test/test_dom\.js\s+#\s*(\d+)",
            r"`web/test/test_dom\.js`（(\d+)\s*项）",
        ),
        (
            "stage_boot_check assertions",
            r"node web/test/stage_boot_check\.js\s+#\s*(\d+)",
            r"`web/test/stage_boot_check\.js`（(\d+)\s*项）",
        ),
        (
            "physics_audit checks",
            r"(?:物理审计|Physics audit)（(\d+)\s*(?:项|checks)",
            None,
        ),
    ]
    extracted: dict[str, int] = {}
    for label, pat, vpat in pairs:
        try:
            v_zh = _extract_first(pat, zh, f"README.md {label}")
            v_en = _extract_first(pat, en, f"README.en.md {label}")
            if v_zh != v_en:
                errors.append(f"{label} 不一致: README.md={v_zh} vs README.en.md={v_en}")
            if vpat:
                v_ve = _extract_first(vpat, verif, f"VERIFICATION.md {label}")
                if v_ve != v_zh:
                    errors.append(f"{label} 不一致: VERIFICATION.md={v_ve} vs README.md={v_zh}")
            extracted[label] = v_zh
        except ValueError as exc:
            errors.append(str(exc))

    # Every JS file under web/js/ must appear in both README structure trees
    js_files = sorted(p.name for p in (LABSUS / "web" / "js").glob("*.js"))
    for name in js_files:
        if name not in zh:
            errors.append(f"README.md 结构树缺少前端模块: {name}")
        if name not in en:
            errors.append(f"README.en.md 结构树缺少前端模块: {name}")

    if (LABSUS / "web" / "vendor" / "three.min.js").exists():
        for doc_name, txt in (("README.md", zh), ("README.en.md", en)):
            if "vendor/" not in txt:
                errors.append(f"{doc_name} 结构树缺少离线依赖目录: vendor/")

    extracted["full_gates"] = full_cnt
    extracted["quick_gates"] = quick_cnt
    extracted["node_suites"] = node_cnt
    return extracted


def check_live(extracted: dict[str, int], errors: list[str]) -> None:
    py_exe = sys.executable
    dom_out = subprocess.run(
        ["node", "web/test/test_dom.js"], cwd=LABSUS, capture_output=True, text=True
    )
    m_dom = re.search(r"(\d+)\s*项断言全过", dom_out.stdout)
    if dom_out.returncode != 0 or not m_dom:
        errors.append("实时运行 test_dom.js 失败")
    elif int(m_dom.group(1)) != extracted.get("test_dom assertions"):
        errors.append(
            f"test_dom live={m_dom.group(1)} != doc={extracted.get('test_dom assertions')}"
        )

    boot_out = subprocess.run(
        ["node", "web/test/stage_boot_check.js"], cwd=LABSUS, capture_output=True, text=True
    )
    m_boot = re.search(r"(\d+)\s*项全过", boot_out.stdout)
    if boot_out.returncode != 0 or not m_boot:
        errors.append("实时运行 stage_boot_check.js 失败")
    elif int(m_boot.group(1)) != extracted.get("stage_boot_check assertions"):
        errors.append(
            f"stage_boot_check live={m_boot.group(1)} != doc={extracted.get('stage_boot_check assertions')}"
        )

    pa_out = subprocess.run(
        ["node", "web/test/physics_audit.js", "--ci"], cwd=LABSUS, capture_output=True, text=True
    )
    m_pa = re.search(r"physics_audit PASS：\d+/(\d+)", pa_out.stdout)
    if pa_out.returncode != 0 or not m_pa:
        errors.append("实时运行 physics_audit.js --ci 失败")
    elif int(m_pa.group(1)) != extracted.get("physics_audit checks"):
        errors.append(
            f"physics_audit live={m_pa.group(1)} != doc={extracted.get('physics_audit checks')}"
        )

    pt_out = subprocess.run(
        [py_exe, "-m", "pytest", "engine/tests", "--collect-only", "-q", "-W", "ignore"],
        cwd=LABSUS,
        capture_output=True,
        text=True,
    )
    if pt_out.returncode == 0:
        collected = sum(
            int(line.rsplit(": ", 1)[1])
            for line in pt_out.stdout.splitlines()
            if ": " in line and line.rsplit(": ", 1)[1].strip().isdigit()
        )
        doc_passed = extracted.get("pytest passed (cmd)", 0)
        if collected < doc_passed:
            errors.append(f"pytest collected={collected} < doc passed={doc_passed}")


def main() -> int:
    live = "--live" in sys.argv[1:]
    errors: list[str] = []
    extracted = check_static(errors)
    if live:
        check_live(extracted, errors)

    if errors:
        print("基线数字/目录树一致性检查失败:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(
        f"基线数字一致性 PASS (gates {extracted.get('full_gates')} full / "
        f"{extracted.get('quick_gates')} quick, {extracted.get('node_suites')} node suites)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
