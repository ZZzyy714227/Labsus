import numpy as np

from solver.mechanism.models import Node
from solver.mechanism.project import project_distance, project_hinge


def mk(ids, p0, fix=False, mass=1.0):
    """构造节点，pos 用 numpy 数组；fix 可传 bool 或与 ids 等长的逐节点列表。"""
    out = {}
    for j, name in enumerate(ids):
        p = np.asarray(p0[j], dtype=float)
        is_fix = fix[j] if isinstance(fix, (list, tuple)) else bool(fix)
        out[name] = Node(id=name, p0=p.copy(), pos=p.copy(), prev=p.copy(),
                         vel=np.zeros(3), fix=is_fix, mass=mass)
    return out


def test_distance_projects_to_L0():
    n = mk(["A", "B"], [[0, 0, 0], [10, 0, 0]])
    d = project_distance(n, "A", "B", L0=6.0)
    assert abs(float(np.linalg.norm(n["B"].pos - n["A"].pos)) - 6.0) < 1e-9
    assert abs(d - 4.0) < 1e-9


def test_distance_respects_fixed_node():
    n = mk(["A", "B"], [[0, 0, 0], [10, 0, 0]], fix=[True, False])
    project_distance(n, "A", "B", L0=6.0)
    assert np.allclose(n["A"].pos, [0, 0, 0])
    assert abs(float(np.linalg.norm(n["B"].pos - n["A"].pos)) - 6.0) < 1e-9


def test_hinge_already_optimal_unchanged():
    anchor = np.array([0.0, 0.0, 0.0])
    member_p0 = np.array([0.0, 100.0, 0.0])
    n = mk(["O", "M"], [anchor, member_p0])
    axis = np.array([0.0, 0.0, 1.0])
    th = np.deg2rad(30.0)
    ct, st = np.cos(th), np.sin(th)
    rotated = np.array([member_p0[0] * ct - member_p0[1] * st,
                        member_p0[0] * st + member_p0[1] * ct, member_p0[2]])
    n["M"].pos = rotated.copy()
    err = project_hinge(n, "O", axis, ["M"], [member_p0 - anchor], [1.0])
    assert err < 1e-9                        # 已是最优 → 无位移
    assert np.allclose(n["M"].pos, rotated)  # 保持不动


def test_hinge_pulls_perturbed_member_onto_circle():
    anchor = np.array([0.0, 0.0, 0.0])
    member_p0 = np.array([0.0, 100.0, 0.0])
    n = mk(["O", "M"], [anchor, member_p0])
    axis = np.array([0.0, 0.0, 1.0])
    n["M"].pos = np.array([0.0, 115.0, 3.0])  # 径向 +15、轴向 +3 偏离
    err = project_hinge(n, "O", axis, ["M"], [member_p0 - anchor], [1.0])
    # 投影后回到最近旋转位：|M| ≈ 100 且轴向 ≈ 0
    assert abs(float(np.linalg.norm(n["M"].pos)) - 100.0) < 1e-9
    assert abs(float(n["M"].pos[2])) < 1e-9
    assert err > 0.0  # 确实发生了位移（≈15.3）
