import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from dynamics.path import Path


def test_straight():
    p = Path([[0, 0], [1000, 0]])
    assert abs(p.total_length - 1000) < 15
    x, y, _ = p.sample(p.total_length)
    assert abs(x - 1000) < 5
    assert abs(y) < 1


def test_yaw():
    p = Path([[0, 0], [0, 1000]])
    _, _, yaw = p.sample(p.total_length / 2)
    assert abs(yaw - math.pi / 2) < 0.2


def test_three_pt():
    p = Path([[0, 0], [500, 0], [500, 500]])
    assert p.total_length > 500
    x, y, _ = p.sample(p.total_length)
    assert abs(x - 500) < 10 and abs(y - 500) < 10


def test_clamp():
    p = Path([[0, 0], [100, 0]])
    x, _, _ = p.sample(-10)
    assert abs(x) < 2
    x, _, _ = p.sample(9999)
    assert abs(x - 100) < 3


def test_min_pts():
    p = Path([[0, 0], [10, 0]])
    assert p.total_length > 5


def test_midpoint():
    """Sample at 50% arc-length should be near path midpoint."""
    p = Path([[0, 0], [1000, 0], [1000, 1000]])
    total = p.total_length
    x, y, _ = p.sample(total * 0.5)
    assert 400 < x < 1100  # somewhere in the middle
