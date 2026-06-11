import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from dynamics.vehicle import Vehicle
from dynamics.terrain import Terrain


def test_static_equilibrium():
    """On flat ground at static ride height, acceleration should be near zero."""
    v = Vehicle({"sprung_mass": 150, "wheel_rate": 150, "damper_rate": 3,
                 "tire_radius": 150, "cg_height": 280, "track_front": 750,
                 "track_rear": 720, "wheelbase": 900})
    t = Terrain()
    z = v.static_z()
    state = np.array([z, 0.0, 0.0, 0.0, 0.0, 0.0])
    dstate = v.compute_derivatives(state, (0, 0, 0), t)
    # Near equilibrium: acceleration small
    assert abs(dstate[1]) < 500, f"zdd should be small near equilibrium, got {dstate[1]}"
    assert abs(dstate[3]) < 1.0, f"roll accel should be small, got {dstate[3]}"
    assert abs(dstate[5]) < 1.0, f"pitch accel should be small, got {dstate[5]}"


def test_dropped_from_height():
    """Vehicle dropped from above equilibrium should accelerate downward."""
    v = Vehicle()
    t = Terrain()
    z = v.static_z() + 20  # 20mm above equilibrium
    state = np.array([z, 0.0, 0.0, 0.0, 0.0, 0.0])
    dstate = v.compute_derivatives(state, (0, 0, 0), t)
    # Gravity dominates → negative zdd (downward)
    assert dstate[1] < 0, f"Should fall, got zdd={dstate[1]}"


def test_roll_on_kerb():
    """Right wheels on a kerb should cause positive roll moment."""
    v = Vehicle()
    # Kerb along X at Y ≈ track/2 so right wheels hit it
    kerb_y = v.track_f / 2 + 10  # slightly outboard of FR
    t = Terrain([{"type": "kerb", "x_start": -600, "y_start": kerb_y,
                  "x_end": 600, "y_end": kerb_y, "width": 200, "height": 50}])
    z = v.static_z()
    state = np.array([z, 0.0, 0.0, 0.0, 0.0, 0.0])
    dstate = v.compute_derivatives(state, (0, 0, 0), t)
    # Right side hits kerb → positive roll acceleration
    assert dstate[3] > 0, f"Expected positive roll accel on right kerb, got {dstate[3]}"


def test_init_params():
    v = Vehicle({"sprung_mass": 200, "wheelbase": 1000, "track_front": 800})
    assert v.mass == 200.0
    assert v.wb == 1000.0
    assert v.track_f == 800.0


def test_state_shape():
    v = Vehicle()
    t = Terrain()
    dstate = v.compute_derivatives(np.zeros(6), (0, 0, 0), t)
    assert len(dstate) == 6
    assert dstate.dtype == float
