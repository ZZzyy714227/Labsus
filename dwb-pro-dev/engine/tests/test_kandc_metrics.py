import numpy as np
from src.metrics.kandc import camber_gain_deg_per_25, bump_steer_deg_per_25, \
    compliance_toe_deg, mr_matrix, rc_migration

def test_gains_via_curves():
    cam = [0.0, -0.5, -1.0, -1.5, -2.0]
    tr = [-50, -25, 0, 25, 50]
    g = camber_gain_deg_per_25(cam, tr, at=0)
    assert abs(g - (-0.5)) < 1e-9           # -0.5°/25mm
    b = bump_steer_deg_per_25([0.4, 0.2, 0.0, -0.2, -0.4], tr, at=0)
    assert abs(b - (-0.2)) < 1e-9

def test_compliance_toe():
    toe = [0.05, 0.10, 0.15]
    fx = [0, 500, 1000]
    c = compliance_toe_deg(toe, fx, at=500)
    assert abs(c - 0.10) < 1e-9             # °/kN 斜率

def test_mr_matrix_diagonal():
    damper_travel = [-10, -5, 0, 5, 10]
    wheel_travel = [-25, -12.5, 0, 12.5, 25]
    M = mr_matrix(damper_travel, wheel_travel, at=0)
    assert abs(M - 0.4) < 1e-9              # d(damper)/d(wheel) = 0.4

def test_rc_migration():
    rc = [40.0, 50.0, 60.0, 55.0, 45.0]
    tr = [-50, -25, 0, 25, 50]
    v = rc_migration(rc, tr)
    assert v[0] == 20.0                      # max-min = 60-40
    assert abs(v[1] - (-5.0)) < 1e-9         # 起-终 = 40-45
