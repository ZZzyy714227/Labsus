import numpy as np
from src.components.bushing import Bushing6DOF, Curve
from src.solver.compliance import solve_compliance_full
from src.solver.forces import QSLoad
from src.solver.mechanism.models import build_mechanism

PRO_POINTS = {  # 前轴推杆侧硬点（PRO 前悬架）
    "CH1": np.array([240.0, 180.0, 145.0]),  "CH2": np.array([240.0, -160.0, 155.0]),
    "CH3": np.array([360.0, 140.0, 380.0]),  "CH4": np.array([360.0, -130.0, 390.0]),
    "UP1": np.array([730.0, 10.0, 165.0]),   "UP2": np.array([675.0, -15.0, 455.0]),
    "UP3": np.array([685.0, -145.0, 205.0]), "UP4": np.array([683.4, 12.0, 205.5]),
    "UP5": np.array([810.0, 0.0, 320.0]),
    "FL1": np.array([269.2, -165.0, 198.1]), "CH5": np.array([324.4, 57.9, 445.6]),
    "RK_PIVOT": np.array([305.3, 20.0, 366.4]),
    "DAMPER_CHASSIS": np.array([29.3, 60.1, 181.1]),
    "RK_DAMPER": np.array([234.8, 60.0, 385.0]),
}

def _mech():
    return build_mechanism(PRO_POINTS, wheel="UP5", tie_outer="UP3", tie_inner="FL1",
                           pushrod_from="UP4", pushrod_to="CH5")

def test_integration_vertical_load_compliance():
    """整车链路：接地点垂向 3000N → 二力杆静力 → LCA 前衬套压缩形变。"""
    bush = Bushing6DOF(
        name="bCH1", anchor=PRO_POINTS["CH1"].copy(),
        kT=[Curve("linear", k=500.0)]*3, kR=[Curve("linear", k=8e4)]*3,
        cT=[0.0]*3, cR=[0.0]*3, preload=np.zeros(6))
    bush.member_nodes = ["CH1"]
    bush.member_p0 = {"CH1": PRO_POINTS["CH1"].copy()}
    res = solve_compliance_full(_mech(), bushings={"bCH1": bush},
                                case=QSLoad(fz=3000.0), travel=0.0, rack=0.0)
    assert res.status in ("VALID", "APPROXIMATE")
    assert abs(res.delta["bCH1"][2]) > 0.01   # 形变 >0.01mm（UCA 近水平，垂向分担小）
