#!/usr/bin/env python
"""根目录文档与 LABSUS/ 子目录副本的一致性同步器（M5 批次 1）。

背景：仓库根与 `LABSUS/` 各有一份 `README.md` / `README.en.md` / `LICENSE`。
根那份是 GitHub 落地页（正文里的相对路径均以仓库根为基准，例如
`LABSUS/assets/labsus_v4_formula_light.png`），**根副本为真源**；`LABSUS/` 下的
副本只是为了让浏览子目录的人也能看到同样的说明。两份必须逐字节相同，否则
GitHub 首页与子目录说明会分叉（历史上已实际发生过一次，靠手工 copy 补救）。

用法：
    python LABSUS/scripts/sync_root_docs.py            # 用根副本覆盖 LABSUS/ 副本
    python LABSUS/scripts/sync_root_docs.py --check    # 只检查，不一致则退出码 1

CI / pre-commit 里用 --check。
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

# scripts/ → LABSUS/ → 仓库根
LABSUS = Path(__file__).resolve().parents[1]
ROOT = LABSUS.parent
FILES = ("README.md", "README.en.md", "LICENSE")


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="只校验，不写入（不一致时退出码 1）")
    args = ap.parse_args()

    missing = [f for f in FILES if not (ROOT / f).exists()]
    if missing:
        print(f"[sync_root_docs] 根目录缺少真源文件: {missing}", file=sys.stderr)
        return 2

    drift, synced = [], []
    for name in FILES:
        src, dst = ROOT / name, LABSUS / name
        same = dst.exists() and _sha(src) == _sha(dst)
        if same:
            continue
        if args.check:
            drift.append(name)
        else:
            shutil.copy2(src, dst)
            synced.append(name)

    if args.check:
        if drift:
            print("[sync_root_docs] 不一致（根为真源）: " + ", ".join(drift), file=sys.stderr)
            print("  修复: python LABSUS/scripts/sync_root_docs.py", file=sys.stderr)
            return 1
        print("[sync_root_docs] OK — 根与 LABSUS/ 副本逐字节一致")
        return 0

    if synced:
        print("[sync_root_docs] 已同步: " + ", ".join(synced))
    else:
        print("[sync_root_docs] OK — 无需同步")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
