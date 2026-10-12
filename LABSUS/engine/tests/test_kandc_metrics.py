from src.metrics.kandc import (
    bump_steer_deg_per_25,
    camber_gain_deg_per_25,
    compliance_toe_deg,
)


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
