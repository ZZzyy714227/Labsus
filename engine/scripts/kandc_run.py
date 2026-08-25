"""K&C 单点求解 CLI（S1 演示/回归入口）。

用法：python scripts/kandc_run.py --travel 10 --fz 3000 --bush-k 500
"""
import argparse
import os
import sys

# 确保 engine/ 和 engine/src 都在 sys.path
# engine/   → from src.xxx import …（顶层脚本用）
# engine/src → from geometry / from solver.xxx import …（引擎内部模块用）
_ENGINE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_SRC = os.path.join(_ENGINE_ROOT, "src")
for _p in (_ENGINE_ROOT, _SRC):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import numpy as np

from src.components.bushing import Bushing6DOF, Curve
from src.solver.compliance import solve_compliance_full
from src.solver.forces import QSLoad
from src.solver.mechanism.models import build_mechanism

PRO_POINTS = {
    "CH1": np.array([240.0, 180.0, 145.0]), "CH2": np.array([240.0, -160.0, 155.0]),
    "CH3": np.array([360.0, 140.0, 380.0]), "CH4": np.array([360.0, -130.0, 390.0]),
    "UP1": np.array([730.0, 10.0, 165.0]),  "UP2": np.array([675.0, -15.0, 455.0]),
    "UP3": np.array([685.0, -145.0, 205.0]), "UP4": np.array([683.4, 12.0, 205.5]),
    "UP5": np.array([810.0, 0.0, 320.0]),
    "FL1": np.array([269.2, -165.0, 198.1]), "CH5": np.array([324.4, 57.9, 445.6]),
    "RK_PIVOT": np.array([305.3, 20.0, 366.4]),
    "DAMPER_CHASSIS": np.array([29.3, 60.1, 181.1]), "RK_DAMPER": np.array([234.8, 60.0, 385.0]),
}


def main() -> int:
    ap = argparse.ArgumentParser(description="K&C 单点求解（S1）")
    ap.add_argument("--travel", type=float, default=0.0, help="轮跳 mm")
    ap.add_argument("--rack", type=float, default=0.0, help="齿条 mm")
    ap.add_argument("--fz", type=float, default=3000.0, help="接地垂向力 N")
    ap.add_argument("--fy", type=float, default=0.0, help="接地侧向力 N")
    ap.add_argument("--bush-k", type=float, default=500.0, help="CH1 衬套垂向刚度 N/mm")
    args = ap.parse_args()

    mech = build_mechanism(PRO_POINTS, wheel="UP5", tie_outer="UP3", tie_inner="FL1",
                           pushrod_from="UP4", pushrod_to="CH5")
    b = Bushing6DOF(name="bCH1", anchor=PRO_POINTS["CH1"].copy(),
                     kT=[Curve("linear", k=args.bush_k)] * 3,
                     kR=[Curve("linear", k=8e4)] * 3,
                     cT=[0.0] * 3, cR=[0.0] * 3, preload=np.zeros(6))
    b.member_nodes = ["CH1"]
    b.member_p0 = {"CH1": PRO_POINTS["CH1"].copy()}

    res = solve_compliance_full(mech, bushings={"bCH1": b},
                                case=QSLoad(fz=args.fz, fy=args.fy),
                                travel=args.travel, rack=args.rack)
    print(f"status           : {res.status}")
    print(f"kin_residual     : {res.kin_residual:.3e} mm")
    print(f"force_balance    : {res.force_balance_residual:.3e} N")
    print(f"iterations       : {res.iterations}  [{res.ms:.1f} ms]")
    if "bCH1" in res.delta:
        dz = res.delta["bCH1"]
        print(f"bCH1 delta [mm]  : {dz[0]:+.3f}, {dz[1]:+.3f}, {dz[2]:+.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
