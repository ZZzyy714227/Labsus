import numpy as np
from src.solver.compliance_transform import small_rot_matrix, transform_point, apply_bushing_to_anchors
from src.components.bushing import Bushing6DOF, Curve

def test_small_rot_and_transform():
    R = small_rot_matrix(np.array([0.01, 0.0, 0.0]))      # rx = 0.01 rad
    p = np.array([0., 10., 0.])
    q = R @ p
    assert abs(q[2] - 10 * 0.01) < 1e-6                    # 小角：z ≈ y·rx
    t = np.array([1., 2., 3.])
    assert np.allclose(transform_point(p, t, R), R @ p + t, atol=1e-12)

def test_apply_bushing_moves_anchor():
    b = Bushing6DOF(name="b1", anchor=np.array([100., 0., 50.]),
                    kT=[Curve("linear", k=1.)]*3, kR=[Curve("linear", k=1.)]*3,
                    cT=[0.]*3, cR=[0.]*3, preload=np.zeros(6))
    b.member_nodes = ["CH1"]
    b.member_p0 = {"CH1": np.array([100., 0., 55.])}       # 锚点上方 5mm
    delta = {"b1": np.array([0., 0., 2., 0., 0., 0.])}      # 垂向平动 +2mm
    out = apply_bushing_to_anchors({"b1": b}, delta)
    assert np.allclose(out["CH1"], [100., 0., 57.], atol=1e-9)
    # 旋转 DOF：rx=0.01 使 y 偏移 → x 向偏移 ≈ 0.01*0（小角线性）
    delta2 = {"b1": np.array([0., 0., 0., 0.01, 0., 0.])}
    out2 = apply_bushing_to_anchors({"b1": b}, delta2)
    # 绕锚点 x 轴转 0.01：相对矢量 (0,0,5) → (0, -0.05, 5)（返回绝对位置）
    assert abs(out2["CH1"][1] - (0.0 - 5*0.01)) < 1e-6
    assert abs(out2["CH1"][2] - 55.0) < 1e-6
