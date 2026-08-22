import numpy as np
from src.solver.mechanism.models import build_mechanism
from src.solver.mechanism.solver import solve_pose, find_limits

PRO = {  # 前推杆侧硬点（PRO 前悬架）
    "CH1": [240.0,180.0,145.0], "CH2": [240.0,-160.0,155.0],
    "CH3": [360.0,140.0,380.0], "CH4": [360.0,-130.0,390.0],
    "UP1": [730.0,10.0,165.0],  "UP2": [675.0,-15.0,455.0],
    "UP3": [685.0,-145.0,205.0],"UP4": [683.4,12.0,205.5],
    "UP5": [810.0,0.0,320.0],
    "FL1": [269.2,-165.0,198.1],"CH5": [324.4,57.9,445.6],
    "RK_PIVOT": [305.3,20.0,366.4],
    "DAMPER_CHASSIS": [29.3,60.1,181.1], "RK_DAMPER": [234.8,60.0,385.0],
}

def test_solve_and_limits():
    m = build_mechanism(PRO, wheel="UP5", tie_outer="UP3", tie_inner="FL1",
                        pushrod_from="UP4", pushrod_to="CH5")
    rep = solve_pose(m, 10.0, 0.0)
    assert rep.ok and rep.residual < 0.02
    lo, hi = find_limits(m, 0.0)
    assert hi > 60 and lo < -60