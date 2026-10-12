import numpy as np

from src.solver.forces import LinkForce, QSLoad, corner_to_anchor_loads


def test_corner_to_anchor_two_link_closure():
    """二杆汇交于球头（LCA 水平 / PUSH 斜上），接地点外载 → 锚点合力闭合。"""
    hub = np.array([800., 0., 0.])
    lca = LinkForce(a=np.array([0., 0., 0.]), b=hub.copy(), id="LCA")              # 水平 x
    push = LinkForce(a=hub.copy(), b=np.array([500., -200., 1500.]), id="PUSH")    # 斜上偏内（含 y 分量）
    q = QSLoad(fz=-3000.0, fy=400.0)
    out = corner_to_anchor_loads(q, [lca, push], hub_point=hub, cp_rel=np.zeros(3))
    # 闭合：球头处 外载 + 所有杆端力 = 0
    f_sum = np.array([q.fx, q.fy, q.fz])
    # links 贡献：杆对球头的作用力 = mag·unit（从 lca.a→lca.b 方向为正向约定）
    for lk in (lca, push):
        f_sum = f_sum + lk.mag * lk.unit()
    assert np.linalg.norm(f_sum) < 1e-6
    # 锚点合力：车身端（非 hub 端）各杆传递的力 = -mag·unit（构件端在 hub 的反作用）
    for key, v in out.anchor_loads.items():
        assert np.linalg.norm(v) > 0.0
    assert out.residual < 1e-6
