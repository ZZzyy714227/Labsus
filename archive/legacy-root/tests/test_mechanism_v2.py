"""v2 集成回归：机制求解器通过 _solve_corner 接入，默认顺序解路径不受影响。"""
from core.models import AxleHardpoints, ResultStatus
from hardpoints import DEFAULT_HARDPOINTS
from routes.v2 import _solve_corner

_TIRE = ("tire_radius", "tire_width", "tire_spring_rate", "corner_weight_n", "track_width")


def _fr():
    points = {k: v for k, v in DEFAULT_HARDPOINTS.items() if k not in _TIRE}
    tire = {k: v for k, v in DEFAULT_HARDPOINTS.items() if k in _TIRE}
    return AxleHardpoints(points=points, tire=tire)


def test_mechanism_mode_valid_tiny_residual():
    sol = _solve_corner(_fr(), 10.0, 5.0, 1220.0, solver="mw")
    assert sol["status"] == ResultStatus.VALID
    assert sol["residual"] <= 0.02
    assert sol["result"]["UP5"] and sol["pose"] is not None
    assert sol["rocker"] is not None and sol["rocker"]["damper_travel"] is not None


def test_default_mode_is_mechanism():
    sol = _solve_corner(_fr(), 10.0, 5.0, 1220.0, solver=None)
    assert sol["status"] == ResultStatus.VALID
    assert sol["residual"] <= 0.02


def test_sequential_fallback_explicit():
    sol = _solve_corner(_fr(), 10.0, 5.0, 1220.0, solver="sequential")
    # 顺序解该工况残差 ~0.03mm（K-4 现状），回退路径可用
    assert sol["status"] == ResultStatus.APPROXIMATE
    assert sol["result"]["UP5"] and sol["pose"] is not None
