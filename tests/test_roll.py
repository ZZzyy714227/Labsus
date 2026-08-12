"""Roll metrics tests — hand-computed geometry."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from metrics.roll import (compute_instant_center, compute_roll_center,
                          compute_roll_gradient, compute_roll_stiffness_suspension,
                          compute_anti_dive)


def test_ic_intersection_horizontal_arms():
    """UCA at z=200 (y 100→300), LCA at z=50 (y 100→300): parallel → None."""
    hp = {"CH1": [0, 100, 200], "CH3": [0, 100, 50]}
    result = {"UP1": [0, 300, 200], "UP2": [0, 300, 50]}
    assert compute_instant_center(hp, result) is None


def test_ic_intersection_known():
    """Lines: z1 = 200 - 0.2y ; z2 = 50 + 0.1y → y=500, z=100."""
    hp = {"CH1": [0, 0.0, 200.0], "CH3": [0, 0.0, 50.0]}
    result = {"UP1": [0, 100.0, 180.0], "UP2": [0, 100.0, 60.0]}
    ic = compute_instant_center(hp, result)
    assert ic is not None
    assert abs(ic[0] - 500.0) < 1e-6 and abs(ic[1] - 100.0) < 1e-6


def test_roll_center_symmetric():
    hp = {"CH1": [0, 0.0, 200.0], "CH3": [0, 0.0, 50.0]}
    result = {"UP1": [0, 100.0, 180.0], "UP2": [0, 100.0, 60.0]}
    rc = compute_roll_center(hp, result)
    assert rc["y"] == 500.0 and rc["z"] == 100.0


def test_roll_gradient_known():
    """m=280kg, h_cg=300mm, rc_z=100 → h=200mm.
    K_f=0.5*30*0.7^2*840^2=5.18e6 N·mm/rad, K_total=1.04e7
    → phi = 280*9.81*200/1.04e7 = 0.0528 rad = 3.03 deg/g"""
    K_f = compute_roll_stiffness_suspension(30.0, 0.7, 840.0)
    phi = compute_roll_gradient({"mass_kg": 280, "cg_height_mm": 300}, K_f, K_f, 100.0)
    assert abs(phi - 3.03) < 0.05, phi


def test_anti_dive_zero_when_ic_low():
    """IC at ground level → theta=0 → 0%."""
    hp = {"CH1": [0, -500.0, 0.0], "CH3": [0, -500.0, 0.0]}
    result = {"UP1": [0, 0.0, 0.0], "UP2": [0, 0.0, 0.0], "UP5": [0, 375.0, 0.0]}
    ad = compute_anti_dive(hp, result, 900.0, 300.0)
    assert abs(ad) < 1e-6
