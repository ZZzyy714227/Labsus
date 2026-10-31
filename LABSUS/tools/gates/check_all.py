"""一条命令跑完全部门禁（T4，2026-10-20）

把散落在 CLAUDE.md / DEVLOG / CI 里的验收判据收敛成**可执行检查**，
逐条输出 PASS/FAIL，任一失败则退出码非零。

用法（在 LABSUS/ 下）：

    python tools/gates/check_all.py            # 全部
    python tools/gates/check_all.py --quick    # 只跑秒级检查（ruff/溯源/文档）
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

LABSUS = Path(__file__).resolve().parents[2]       # tools/gates/check_all.py → LABSUS/
PY = sys.executable

# 子进程输出解码（实测缺陷，2026-10-31）：
#   默认 text=True 用**系统 locale**（中文 Windows = GBK）解码子进程输出，而 node
#   与 ruff 输出 UTF-8 ⇒ 每个 node 子进程都在 reader 线程里抛 UnicodeDecodeError，
#   结果码仍对（所以门禁"看起来正常"），但**失败时的错误尾部全丢**，反而在最需要
#   看错误的时刻失明。
#   修法：显式 utf-8 + errors="replace"（永不崩），并让 Python 子进程也输出 UTF-8
#   （PYTHONIOENCODING/PYTHONUTF8），两侧口径统一。
_CHILD_ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

# 前端 16 套（与 .github/workflows/ci.yml 的清单保持一致）
NODE_SUITES = (
    "test_dom.js", "stage_boot_check.js", "test_15dof_steady.js", "test_lap_15dof.js",
    "proving_ground_test.js", "undulating_road_test.js", "test_p2a_aero.js",
    "test_p2b_damper.js", "test_circuit_ui.js", "test_racingline.js",
    "test_tire_wiring.js", "test_kc_wiring.js", "test_mpc.js", "test_powertrain.js",
    "test_tire_lab.js", "test_engine_sound.js",
)

PROVENANCE_CMD = (
    "import sys;sys.path.insert(0,'engine');"
    "from src.provenance import unregistered_files,stale_entries,hash_mismatches,summarise;"
    "u=unregistered_files();s=stale_entries();h=hash_mismatches();"
    "print(summarise());"
    "print('未登记:',u,'失效:',s,'hash不符:',[(p,e[:8],a[:8]) for p,e,a in h]);"
    "sys.exit(1 if (u or s or h) else 0)"
)


def _run(cmd: list[str], *, cwd: Path | None = None) -> tuple[bool, str]:
    try:
        r = subprocess.run(cmd, cwd=str(cwd or LABSUS), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", env=_CHILD_ENV,
                           timeout=1800)
    except subprocess.TimeoutExpired:
        return False, "超时（1800 s）"
    except FileNotFoundError as exc:
        return False, f"命令缺失：{exc}"
    out = (r.stdout or "") + (r.stderr or "")
    tail = "\n".join(out.strip().splitlines()[-3:])
    return r.returncode == 0, tail


def gates(quick: bool = False) -> list[tuple[str, list[str]]]:
    g: list[tuple[str, list[str]]] = [
        ("ruff（引擎静态检查）", [PY, "-m", "ruff", "check", "engine"]),
        ("溯源注册表覆盖", [PY, "-c", PROVENANCE_CMD]),
        ("文档一致性（根↔LABSUS）", [PY, "scripts/sync_root_docs.py", "--check"]),
    ]
    if not quick:
        g.insert(1, ("pytest（引擎测试）", [PY, "-m", "pytest", "engine/tests", "-q",
                                          "-p", "no:warnings", "--tb=line"]))
        g += [(f"node {n}", ["node", f"web/test/{n}"]) for n in NODE_SUITES]
        g.append(("跨语言对拍 tphys_parity", ["node", "web/test/tphys_parity.cjs"]))
    return g


def main() -> int:
    # Windows 控制台默认 GBK：打印 "↔" 这类字符会 UnicodeEncodeError（实测崩过一次）。
    # 修法是**保留平台编码**、只把不可编码字符降级为 '?'：
    # 强制 UTF-8 会反过来让调用方（PowerShell 管道）以 GBK 解码而报错，两边都不能硬来。
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")   # type: ignore[union-attr]
        except (AttributeError, OSError):
            pass
    ap = argparse.ArgumentParser(description="跑完 LABSUS 的全部门禁")
    ap.add_argument("--quick", action="store_true", help="只跑秒级检查（ruff/溯源/文档）")
    args = ap.parse_args()

    todo = gates(args.quick)
    print(f"LABSUS 门禁：共 {len(todo)} 项（{'quick' if args.quick else 'full'}）\n")
    failures: list[str] = []
    t0 = time.perf_counter()
    for name, cmd in todo:
        t = time.perf_counter()
        ok, tail = _run(cmd)
        print(f"  [{'PASS' if ok else 'FAIL'}] {name:34s} {time.perf_counter() - t:6.1f}s")
        if not ok:
            failures.append(name)
            for line in tail.splitlines():
                print(f"         {line}")
    print(f"\n结果：{len(todo) - len(failures)}/{len(todo)} 通过，"
          f"用时 {time.perf_counter() - t0:.1f}s")
    if failures:
        print("失败项：" + "、".join(failures))
        return 1
    print("全部通过 ✓")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
