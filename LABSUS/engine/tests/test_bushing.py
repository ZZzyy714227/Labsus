import numpy as np
import pytest
from src.components.bushing import Bushing6DOF, Curve, bush_force, bush_force_jac

def _lin_curve(k):
    return Curve(kind="linear", k=k)

def test_linear_force_and_jac():
    b = Bushing6DOF(
        name="LB1", anchor=np.array([0.,0.,0.]),
        kT=[_lin_curve(50.)]*3, kR=[_lin_curve(2000.)]*3,
        cT=[0.0]*3, cR=[0.0]*3, preload=np.zeros(6))
    d = np.array([0.01, -0.02, 0.005, 0.001, 0.0, -0.002])
    f = bush_force(b, d)
    assert np.allclose(f[:3], [0.5, -1.0, 0.25], atol=1e-9)
    assert np.allclose(f[3:], [2000*0.001, 0.0, 2000*(-0.002)], atol=1e-9)  # [2.0, 0.0, -4.0]
    J = bush_force_jac(b, d)          # 解析（样条/线性）导数
    fd = np.zeros((6, 6))
    h = 1e-7
    for i in range(6):
        dp = d.copy(); dp[i] += h
        dm = d.copy(); dm[i] -= h
        fd[:, i] = (bush_force(b, dp) - bush_force(b, dm)) / (2 * h)
    assert np.allclose(J, fd, atol=1e-3)

def test_curve_interp_force():
    b = Bushing6DOF(name="LB1", anchor=np.zeros(3),
                    kT=[Curve(kind="table", xs=[0,5,10,15], ys=[0,60,200,500])]*3,
                    kR=[_lin_curve(1000.)]*3, cT=[0.]*3, cR=[0.]*3, preload=np.zeros(6))
    f = bush_force(b, np.array([10.,0,0,0,0,0]))
    assert abs(f[0] - 200.0) < 1e-9   # 表为"力-位移"直接插值
