"""后端模块角色审计（2026-11-20，N-后端梳理）

## 为什么有这把工具

长线开发里会出现几类"看着像代码、其实没人用"的东西，肉眼分不清：

1. **真死代码**——没人 import、没测试、也没被文档引用 ⇒ 该删
2. **设计期参考实现**——运行时消费者是前端 JS，Python 版是"可核对的真源"，
   只有测试在跑 ⇒ 该保留但要**显式登记角色**，否则下一个人以为是死代码
3. **只在测试里活着**——生产路径根本不经过，测试自己造信心 ⇒ 要么接线要么删
4. **未接线的设计**——模块写好了、自述"接入"，但生产代码没调用它

本工具把每个模块的实际引用关系算出来，并对照 `tools/audit/module_roles.json`
的分类表，报出「未分类」与「分类与实际不符」的模块。

## 用法

    python tools/audit/backend_audit.py            # 打印报告
    python tools/audit/backend_audit.py --check    # 未分类/不符则 exit 1（供门禁）
    python tools/audit/backend_audit.py --json     # 机器可读

## 口径

- "生产消费者" = `engine/` 内非测试的 .py、或 `server.py` 的路由、或 `scripts/`
- "测试消费者" = `engine/tests/**`
- 模块名按 `src.x.y` 形式归一（去掉 `.py`、`__init__`）
- 端点：`server.py` 的 `@app.<method>` 装饰器 vs `web/**` 里的字面量路径
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

REPO = Path(__file__).resolve().parents[2]          # …/LABSUS
ENGINE = REPO / "engine"
ROLES_FILE = Path(__file__).resolve().parent / "module_roles.json"
WEB = REPO / "web"


def module_name(path: Path, root: Path) -> str:
    rel = path.relative_to(root).with_suffix("")
    parts = [p for p in rel.parts if p != "__init__"]
    return ".".join(parts)


def collect_py_files(root: Path, *, include_tests: bool) -> list[Path]:
    out = []
    for p in root.rglob("*.py"):
        if "__pycache__" in p.parts:
            continue
        is_test = "tests" in p.parts
        if is_test != include_tests:
            continue
        out.append(p)
    return sorted(out)


def imported_modules(path: Path) -> set[str]:
    """本文件 import 了哪些 `src.*` 模块（按模块名归一）。"""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return set()
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module and node.module.startswith("src"):
                found.add(node.module)
            elif node.level and node.module is None:
                pass
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name.startswith("src"):
                    found.add(a.name)
    return found


def top_level_defs(path: Path) -> list[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []
    return [n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]


def endpoints() -> list[dict]:
    """server.py 的路由。"""
    src = (ENGINE / "server.py").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'@app\.(get|post|put|delete)\("([^"]+)"[^)]*\)\s*\ndef\s+(\w+)', src):
        out.append({"method": m.group(1).upper(), "path": m.group(2), "handler": m.group(3)})
    return out


def frontend_api_calls() -> set[str]:
    calls: set[str] = set()
    for p in list(WEB.rglob("*.js")) + list(WEB.rglob("*.html")):
        if "__pycache__" in p.parts:
            continue
        for m in re.finditer(r"""['"`](/?api/v3/[^'"`\s?]+)""", p.read_text(encoding="utf-8", errors="ignore")):
            calls.add(m.group(1))
    return calls


def normalize_route(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "", path).rstrip("/")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="未分类/不符则非零退出")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    def _keep(p: Path) -> bool:
        return p.name != "__init__.py" and "__pycache__" not in p.parts
    prod_files = [p for p in collect_py_files(ENGINE / "src", include_tests=False) if _keep(p)] + [
        ENGINE / "server.py",
    ] + [p for p in collect_py_files(ENGINE / "scripts", include_tests=False) if _keep(p)]
    test_files = collect_py_files(ENGINE / "tests", include_tests=True)

    modules = {module_name(p, ENGINE): p for p in prod_files}
    prod_imports: dict[str, set[str]] = {}
    test_imports: dict[str, set[str]] = {}
    for p in prod_files:
        for mod in imported_modules(p):
            prod_imports.setdefault(mod, set()).add(module_name(p, ENGINE))
    for p in test_files:
        for mod in imported_modules(p):
            test_imports.setdefault(mod, set()).add(p.name)

    doc = {}
    if ROLES_FILE.exists():
        doc = json.loads(ROLES_FILE.read_text(encoding="utf-8"))
    roles = doc.get("modules", {})
    ep_roles = doc.get("__endpoints__", {})
    exported_ok = doc.get("__exported_ok__", {})

    rows = []
    for name in sorted(modules):
        if name in ("server",):
            continue
        prod_users = sorted(prod_imports.get(name, set()) - {name})
        test_users = sorted(test_imports.get(name, set()))
        if name in ("server",) or name.startswith("scripts."):
            kind = "entrypoint"
        elif prod_users:
            kind = "runtime"
        elif test_users:
            kind = "test_only"
        else:
            kind = "orphan"
        declared = roles.get(name, {}).get("role")
        rows.append({
            "module": name,
            "loc": len(modules[name].read_text(encoding="utf-8").splitlines()),
            "kind": kind,
            "prod_users": prod_users,
            "test_users": test_users,
            "declared": declared,
            "note": roles.get(name, {}).get("note", ""),
        })

    # ── 模块内"定义了但外部没人引用"的顶层函数/类 ──────────────
    prod_src = {p: p.read_text(encoding="utf-8", errors="ignore") for p in prod_files}
    unused_defs = []
    for path in prod_files:
        text = prod_src[path]
        others = "\n".join(v for k, v in prod_src.items() if k != path)
        for name in top_level_defs(path):
            if name.startswith("_"):
                continue
            if re.search(r"\b" + re.escape(name) + r"\b", others):
                continue
            # 本文件内除定义行外还有引用 ⇒ 模块内部使用，不算死代码
            if len(re.findall(r"\b" + re.escape(name) + r"\b", text)) > 1:
                continue
            mod = module_name(path, ENGINE)
            mod_role = roles.get(mod, {}).get("role", "runtime")
            # 非运行时模块的 public 面天然只被测试用，不报"无外部引用"
            if mod_role in ("design_reference", "research_tool", "frozen_archive",
                            "gate_data", "test_fixture"):
                continue
            if name in exported_ok.get(mod, {}):
                continue
            if path.name == "server.py":       # 路由处理器由框架调用
                continue
            unused_defs.append({"module": mod, "name": name})

    eps = endpoints()
    calls = frontend_api_calls()
    call_norm = {normalize_route(c) for c in calls}
    for ep in eps:
        ep_norm = normalize_route(ep["path"])
        ep["frontend"] = any(ep_norm.startswith(c) or c.startswith(ep_norm) for c in call_norm if c)

    problems = []
    for r in rows:
        if r["kind"] == "runtime":
            continue
        if not r["declared"]:
            problems.append(f"未分类：{r['module']}（实际 role={r['kind']}）")
        elif r["kind"] == "test_only" and r["declared"] not in ("design_reference", "research_tool", "test_fixture", "frozen_archive", "gate_data"):
            problems.append(f"只被测试引用但声明为 {r['declared']}：{r['module']}")
        elif r["kind"] == "orphan" and r["declared"] != "dead_pending_removal":
            problems.append(f"无人引用但声明为 {r['declared']}：{r['module']}")
    for ep in eps:
        if not ep["frontend"] and not ep_roles.get(ep["path"]):
            problems.append(f"端点无前端调用且未登记理由：{ep['method']} {ep['path']}")

    if args.json:
        print(json.dumps({"modules": rows, "endpoints": eps, "problems": problems,
                          "unused_defs": unused_defs},
                         ensure_ascii=False, indent=2))
    else:
        print(f"{'模块':<42}{'LOC':>5}  {'角色':<12} 生产消费者 / 测试消费者")
        print("-" * 118)
        for r in rows:
            users = ",".join(r["prod_users"][:3]) or "-"
            tests = f"{len(r['test_users'])} 个测试文件" if r["test_users"] else "-"
            flag = "" if (r["kind"] == "runtime" or r["declared"]) else " [!]未分类"
            print(f"{r['module']:<42}{r['loc']:>5}  {r['kind']:<12} {users} / {tests}{flag}")
        print()
        print("端点：")
        for ep in eps:
            print(f"  {'YES' if ep['frontend'] else '---'} {ep['method']:<5} {ep['path']:<40} → {ep['handler']}")
        print()
        total = sum(r["loc"] for r in rows)
        print(f"合计 {len(rows)} 个模块 / {total} 行")
        if unused_defs:
            print(f"\n模块内无外部引用的顶层定义（{len(unused_defs)} 个；")
            print("确属独立参考实现/设计期校核的，在 module_roles.json 的 __exported_ok__ 里登记）：")
            for u in unused_defs:
                print(f"  - {u['module']}.{u['name']}")
        if problems:
            print(f"\n发现 {len(problems)} 个待处理项：")
            for p in problems:
                print("  - " + p)
        else:
            print("\n所有模块与端点均已分类，无待处理项。")

    return 1 if (args.check and problems) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
