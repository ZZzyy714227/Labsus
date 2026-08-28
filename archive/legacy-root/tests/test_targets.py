"""Target band evaluation tests."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import pytest
from metrics.targets import (TARGET_BANDS, TARGET_BANDS_OVERRIDES,
                             evaluate_metric, evaluate_all, set_band)


@pytest.fixture(autouse=True)
def _clean_overrides():
    """Every test starts with a clean override table (other tests may set it)."""
    TARGET_BANDS_OVERRIDES.clear()
    yield
    TARGET_BANDS_OVERRIDES.clear()


def test_green_in_band():
    assert evaluate_metric("bump_steer_f", 0.5) == "green"


def test_yellow_beyond_green():
    assert evaluate_metric("bump_steer_f", 1.5) == "yellow"


def test_red_beyond_warn():
    assert evaluate_metric("bump_steer_f", 2.5) == "red"


def test_bounded_band():
    assert evaluate_metric("roll_gradient", 1.2) == "green"
    assert evaluate_metric("roll_gradient", 0.6) == "yellow"
    assert evaluate_metric("roll_gradient", 3.0) == "red"


def test_none_is_neutral():
    assert evaluate_metric("bump_steer_f", None) == "green"


def test_override_changes_result():
    set_band("bump_steer_f", (None, 1.5, None, 3.0))
    try:
        assert evaluate_metric("bump_steer_f", 1.2) == "green"
    finally:
        TARGET_BANDS_OVERRIDES.clear()


def test_evaluate_all_returns_list():
    res = evaluate_all({"bump_steer_f": 0.5, "roll_gradient": 3.0, "nonsense": 1.0})
    assert len(res) == 2          # unknown keys skipped
    assert res[0]["light"] == "green"
    assert res[1]["light"] == "red"


def test_all_preset_keys_defined():
    """Every preset band must be a 4-tuple."""
    for k, b in TARGET_BANDS.items():
        assert len(b) == 4, k
