"""
Shared fixtures for solver integration tests.
Provides known-good hardpoints and default parameters.
"""
import os
import sys

# Ensure src/ is importable (in case conftest.py at root hasn't run)
_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
if _src not in sys.path:
    sys.path.insert(0, _src)

import pytest

from config import DEFAULT_FRAME_NODES
from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, mirror_left
from solver.bump import HAS_SCIPY  # noqa: F401 — used by test marks

# ── shared hardpoint dicts (immutable copies to prevent test pollution) ──

@pytest.fixture
def hp_front():
    """Front right hardpoints (deep copy, safe to mutate)."""
    return {k: (list(v) if isinstance(v, list) else v)
            for k, v in DEFAULT_HARDPOINTS.items()}


@pytest.fixture
def hp_rear():
    """Rear right hardpoints (deep copy, safe to mutate)."""
    return {k: (list(v) if isinstance(v, list) else v)
            for k, v in DEFAULT_REAR_HARDPOINTS.items()}


@pytest.fixture
def hp_front_left():
    """Front left (mirrored from right)."""
    return mirror_left(DEFAULT_HARDPOINTS)


@pytest.fixture
def frame_nodes():
    """Frame nodes dict."""
    return dict(DEFAULT_FRAME_NODES)


# ── expected geometry constants ──

# Known-good static alignment angles for the DEFAULT_HARDPOINTS
# (computed by running the solver; update if defaults change)
STATIC_ALIGNMENT = {
    "camber_deg": -1.0,        # placeholder — update after first test run
    "kpi_deg": 2.07,
    "caster_deg": 5.18,
}

# Tolerance for solver residual
SOLVER_RESIDUAL_TOL = 0.1      # mm (loose — PBD default)
POLISH_RESIDUAL_TOL = 1e-4     # mm (strict — with scipy)
