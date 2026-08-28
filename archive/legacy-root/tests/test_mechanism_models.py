import numpy as np

from solver.mechanism.models import Mechanism, build_mechanism  # noqa: F401


def _synthetic_points():
    # 右侧双叉臂+推杆+摇臂，mm（X 前 / Y 右 / Z 上）
    return {
        "CH1": np.array([-200.0, 120.0, 300.0]), "CH2": np.array([-200.0, -120.0, 300.0]),
        "CH3": np.array([-200.0, 150.0, 120.0]), "CH4": np.array([-200.0, -150.0, 120.0]),
        "UP1": np.array([-60.0, 0.0, 420.0]), "UP2": np.array([-60.0, 0.0, 150.0]),
        "UP3": np.array([-40.0, 0.0, 200.0]), "UP4": np.array([-55.0, 0.0, 260.0]),
        "UP5": np.array([0.0, 0.0, 300.0]),
        "FL1": np.array([140.0, 0.0, 200.0]),
        "RK_PIVOT": np.array([-220.0, 0.0, 340.0]),
        "CH5": np.array([-160.0, 0.0, 360.0]),
        "RK_DAMPER": np.array([-220.0, 0.0, 430.0]),
        "DAMPER_CHASSIS": np.array([-220.0, 0.0, 650.0]),
    }


def test_build_dof_is_2():
    m = build_mechanism(_synthetic_points())
    assert m.dof() == 2, f"actuated DOF should be 2 (travel+steer), got {m.dof()}"


def test_nodes_have_design_and_current_and_fix_flags():
    m = build_mechanism(_synthetic_points())
    assert list(m.nodes) == sorted(m.nodes)
    fixed = {"CH1", "CH2", "CH3", "CH4", "RK_PIVOT", "DAMPER_CHASSIS", "CH5", "RK_DAMPER"}
    for n in m.nodes.values():
        assert np.allclose(n.pos, n.p0)
        assert n.fix == (n.id in fixed), f"{n.id} fix={n.fix}"


def test_links_and_clusters_present():
    m = build_mechanism(_synthetic_points())
    assert {ln.id for ln in m.links} == {"TIE", "PUSHROD"}
    assert {c.kind for c in m.axis_clusters} == {"hinge", "rocker"}
    assert len(m.bodies) == 1 and m.bodies[0].name == "KNUCKLE"
