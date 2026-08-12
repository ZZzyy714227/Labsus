"""Dynamics metric tests — closed-form checks."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import math
from metrics.dynamics import (wheel_rate, ride_frequency_hz, damping_ratio,
                              sprung_mass_per_corner, load_transfer_n,
                              roll_stiffness_split_pct)


def test_wheel_rate():
    assert abs(wheel_rate(30.0, 0.7) - 14.7) < 1e-9


def test_ride_freq_hand():
    """k=14.7 N/mm → 14700 N/m, m=120kg → f = 1/(2π)·√(14700/120) = 1.761 Hz"""
    f = ride_frequency_hz(30.0, 0.7, 120.0)
    expected = (1 / (2 * math.pi)) * math.sqrt(14700 / 120)
    assert abs(f - expected) < 1e-9
    assert 1.7 < f < 1.8


def test_damping_ratio():
    """c=1500 N·s/m, mr=0.7 → ζ = 1500*0.49 / (2*√(14700*120)) = 735/2656 = 0.277"""
    zeta = damping_ratio(30.0, 0.7, 120.0, 1500.0)
    assert abs(zeta - 0.277) < 0.01


def test_sprung_mass():
    m = sprung_mass_per_corner(280.0, 0.5, 20.0)
    assert abs(m - 60.0) < 1e-9


def test_load_transfer():
    """280kg, 1.3g, h=300, t=840 → ΔF = 280*1.3*9.81*300/840 = 1275 N"""
    dF = load_transfer_n(280.0, 1.3, 300.0, 840.0)
    assert abs(dF - 1275.3) < 1.0


def test_roll_split():
    assert abs(roll_stiffness_split_pct(5000.0, 5000.0) - 50.0) < 1e-9
    assert abs(roll_stiffness_split_pct(7000.0, 3000.0) - 70.0) < 1e-9
