"""Target bands definition + evaluation (green/yellow/red)."""
from __future__ import annotations

# band = (green_lo, green_hi, warn_lo, warn_hi); None = unbounded
# warn extends beyond green on both sides; anything outside warn = red
TARGET_BANDS: dict[str, tuple] = {
    # --- kinematics (front/rear, key suffix _f/_r) ---
    "camber_delta_f":    (None, 3.5, None, 5.0),
    "camber_delta_r":    (None, 3.5, None, 5.0),
    "bump_steer_f":      (None, 1.0, None, 2.0),
    "bump_steer_r":      (None, 1.0, None, 2.0),
    "caster_delta_f":    (None, 3.0, None, 5.0),
    "caster_delta_r":    (None, 3.0, None, 5.0),
    "kpi_delta_f":       (None, 3.0, None, 5.0),
    "kpi_delta_r":       (None, 3.0, None, 5.0),
    "scrub_delta_f":     (None, 15.0, None, 25.0),
    "scrub_delta_r":     (None, 15.0, None, 25.0),
    # --- attitude ---
    "roll_gradient":     (0.8, 1.5, 0.5, 2.0),
    "rc_height":         (20.0, 60.0, 10.0, 80.0),
    "rc_height_delta":   (None, 30.0, None, 50.0),
    "anti_dive":         (20.0, 40.0, 10.0, 60.0),
    "anti_squat":        (20.0, 40.0, 10.0, 60.0),
    "jacking":           (None, 5.0, None, 15.0),
    # --- dynamics ---
    "ride_freq_f":       (2.0, 2.5, 1.7, 2.8),
    "ride_freq_r":       (2.5, 3.0, 2.2, 3.3),
    "freq_ratio":        (1.15, 1.30, 1.05, 1.40),
    "damping_ratio_f":   (0.5, 0.9, 0.3, 1.1),
    "damping_ratio_r":   (0.5, 0.9, 0.3, 1.1),
    "motion_ratio_f":    (0.5, 0.9, 0.35, 1.1),
    "motion_ratio_r":    (0.4, 1.0, 0.25, 1.2),
    "load_transfer_f":   (45.0, 55.0, 40.0, 60.0),
    # --- structural ---
    "pushrod_force":     (None, 1500.0, None, 2500.0),
    "uca_lca_force":     (None, 800.0, None, 1400.0),
    "tie_rod_force":     (None, 300.0, None, 600.0),
}

# User overrides (loaded from persistent_state.json "target_bands" section)
TARGET_BANDS_OVERRIDES: dict[str, tuple] = {}


def get_band(key: str) -> tuple:
    return TARGET_BANDS_OVERRIDES.get(key, TARGET_BANDS[key])


def set_band(key: str, band: tuple) -> None:
    TARGET_BANDS_OVERRIDES[key] = tuple(band)


def evaluate_metric(key: str, value: float) -> str:
    """Return 'green' | 'yellow' | 'red' for a metric value."""
    if value is None:
        return "green"          # not applicable → neutral
    g_lo, g_hi, w_lo, w_hi = get_band(key)
    in_green = (g_lo is None or value >= g_lo) and (g_hi is None or value <= g_hi)
    if in_green:
        return "green"
    in_warn = (w_lo is None or value >= w_lo) and (w_hi is None or value <= w_hi)
    return "yellow" if in_warn else "red"


def evaluate_all(metrics: dict[str, float]) -> list[dict]:
    """Evaluate every metric key present in `metrics`."""
    out = []
    for key, value in metrics.items():
        if key in TARGET_BANDS:
            if value is None:
                out.append({"key": key, "value": None, "light": "green"})
            else:
                out.append({"key": key, "value": round(float(value), 3),
                            "light": evaluate_metric(key, value)})
    return out
