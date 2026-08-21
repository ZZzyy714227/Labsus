import numpy as np
from src.solver.forces import LinkForce, force_balance_2lines

def test_two_link_balance():
    """二杆汇交于球头：已知球头力，反解两杆轴向力——平面 2 杆示例闭合检验。"""
    f1 = LinkForce(a=np.array([0.,0.,0.]), b=np.array([1.,0.,0.]), id="L1")
    f2 = LinkForce(a=np.array([0.,0.,0.]), b=np.array([0.,1.,0.]), id="L2")
    sf = lambda x: np.array([100., 50., 0.])     # 球头反作用外力
    out = force_balance_2lines(f1, f2, sf(np.zeros(3)))
    assert abs(out[0].mag - (-100.0)) < 1e-9
    assert abs(out[1].mag - (-50.0)) < 1e-9
    r = sf(np.zeros(3)) + out[0].mag*f1.unit() + out[1].mag*f2.unit()
    assert np.linalg.norm(r) < 1e-9
