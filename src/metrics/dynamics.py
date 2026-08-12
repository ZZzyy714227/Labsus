"""Ride frequency, damping ratio, load transfer metrics."""
from __future__ import annotations

import math


def wheel_rate(k_spring_n_mm: float, mr: float) -> float:
    return k_spring_n_mm * mr * mr


def ride_frequency_hz(k_spring_n_mm: float, mr: float, sprung_mass_kg: float) -> float:
    kw = wheel_rate(k_spring_n_mm, mr) * 1000.0        # N/m
    return (1.0 / (2.0 * math.pi)) * math.sqrt(kw / max(sprung_mass_kg, 1e-6))


def damping_ratio(k_spring_n_mm: float, mr: float, sprung_mass_kg: float,
                  c_damper_n_s_m: float) -> float:
    kw = wheel_rate(k_spring_n_mm, mr) * 1000.0
    cc = 2.0 * math.sqrt(kw * max(sprung_mass_kg, 1e-6))
    return (c_damper_n_s_m * mr * mr) / max(cc, 1e-9)


def sprung_mass_per_corner(total_mass_kg: float, axle_frac: float,
                           unsprung_kg: float = 20.0) -> float:
    return (total_mass_kg * axle_frac - unsprung_kg) / 2.0


def load_transfer_n(total_mass_kg: float, ay_g: float, cg_height_mm: float,
                   track_mm: float) -> float:
    return total_mass_kg * ay_g * 9.81 * cg_height_mm / track_mm


def roll_stiffness_split_pct(k_roll_f, k_roll_r) -> float:
    total = k_roll_f + k_roll_r
    return 100.0 * k_roll_f / max(total, 1e-9)
