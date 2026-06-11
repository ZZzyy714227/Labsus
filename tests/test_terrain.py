import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from dynamics.terrain import Terrain


def test_empty():
    assert Terrain().height(0, 0) == 0.0
    assert Terrain().height(9999, -9999) == 0.0


def test_bump_center():
    t = Terrain([{"type": "bump", "x": 500, "y": 200,
                  "length": 300, "width": 150, "height": 30}])
    assert abs(t.height(500, 200) - 30.0) < 0.01


def test_bump_outside():
    t = Terrain([{"type": "bump", "x": 0, "y": 0,
                  "length": 100, "width": 50, "height": 10}])
    assert t.height(60, 0) == 0.0  # past end
    assert t.height(0, 30) == 0.0  # past side


def test_kerb_mid():
    t = Terrain([{"type": "kerb", "x_start": 0, "y_start": 0,
                  "x_end": 200, "y_end": 0, "width": 100, "height": 50}])
    assert abs(t.height(100, 0) - 50.0) < 0.01


def test_kerb_outside():
    t = Terrain([{"type": "kerb", "x_start": 0, "y_start": 0,
                  "x_end": 200, "y_end": 0, "width": 100, "height": 50}])
    assert t.height(100, 60) == 0.0  # outside width


def test_ramp():
    t = Terrain([{"type": "ramp", "x_start": 0, "y_start": 0,
                  "x_end": 100, "y_end": 0, "width": 50,
                  "h_start": 0, "height": 40}])
    assert abs(t.height(50, 0) - 20.0) < 0.01
    assert abs(t.height(100, 0) - 40.0) < 0.01


def test_max_obstacles():
    t = Terrain([
        {"type": "bump", "x": 0, "y": 0, "length": 200, "width": 100, "height": 20},
        {"type": "bump", "x": 0, "y": 0, "length": 200, "width": 100, "height": 40},
    ])
    assert abs(t.height(0, 0) - 40.0) < 0.01
