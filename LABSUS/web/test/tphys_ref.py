#!/usr/bin/env python
"""TPHYS 对拍 Python 参考端（F-58 修复，2026-08-30）。

读入与 tphys_parity.cjs 相同的 input.json（{"body": <TrackSimRequest dict>}），
跑引擎 transient.run_track_sim，输出与 JS 端同构的 summary 供比较。

usage: python tphys_ref.py <input.json> <output.json>
"""
import json
import os
import sys

# G10（2026-08-31）：自 web/ 迁入 web/test/，根目录改为向上三层（web/test -> web -> LABSUS）
_HERE = os.path.dirname(os.path.abspath(__file__))
_LABSUS_ROOT = os.path.dirname(os.path.dirname(_HERE))
_ENGINE = os.path.join(_LABSUS_ROOT, "engine")
_SRC = os.path.join(_ENGINE, "src")
# 与 server.py / scripts/kandc_run.py 同款双路径注入：engine/（from src.xxx）
# 与 engine/src/（from geometry / from solver.xxx）都必须在 sys.path。
for _p in (_ENGINE, _SRC):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from src.api.v3models import TrackSimRequest          # noqa: E402
from src.solver.transient import run_track_sim        # noqa: E402


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: python tphys_ref.py <in.json> <out.json>", file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    body = dict(data.get("body") or {})
    body.pop("_closed", None)          # 前端私有字段，非 TrackSimRequest 模型字段
    res = run_track_sim(TrackSimRequest(**body))
    out = {
        "status": res["status"],
        "finished": bool(res.get("finished")),
        "traceLen": len(res.get("trace") or []),
        "steps": res.get("steps", 0),
        "summary": res.get("summary") or {},
        "warnings": res.get("warnings") or [],
    }
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, allow_nan=False)
    print("PY ref ok: " + json.dumps(out["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
