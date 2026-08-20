"""End-to-end test: sweep endpoint should produce smooth curves (no branch jumps)."""
import os
os.environ["DEBUG_BRANCH_JUMPS"] = "1"
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from fastapi.testclient import TestClient
from main import app
from hardpoints import DEFAULT_HARDPOINTS

client = TestClient(app)


def make_req():
    """Build a SweepRequest with the default hardpoints."""
    hp = {k: list(v) if isinstance(v, (list, tuple)) else v
          for k, v in DEFAULT_HARDPOINTS.items()}
    return {
        "front_hardpoints": hp,
        "rear_hardpoints": hp,
        "start": -30.0, "end": 30.0, "steps": 121,
        "rack_displacement": 0.0,
    }


def test_sweep_curves_are_smooth():
    """Verify that the sweep endpoint produces smooth camber/toe/caster/KPI curves.

    The pre-fix solver had branch jumps at ~-15.5mm and ~-1mm on the front
    axle. With the post-processor, these should be smoothed out.
    """
    r = client.post("/api/sweep", json=make_req())
    assert r.status_code == 200
    data = r.json()
    front = data["front"]

    # Find any large jumps in camber (compared to neighbors)
    camber = front["camber_deg"]
    deltas = [(i, abs(camber[i+1] - camber[i]))
              for i in range(len(camber) - 1)]
    big_jumps = [(i, d) for i, d in deltas if d > 0.4]
    if big_jumps:
        for i, d in big_jumps[:5]:
            print(f"  camber big jump at idx {i}: {camber[i]:.3f} -> {camber[i+1]:.3f} "
                  f"(delta {d:.3f})")
    assert not big_jumps, f"camber still has {len(big_jumps)} jumps > 0.4°"

    # Same for caster
    caster = front["caster_deg"]
    deltas_caster = [(i, abs(caster[i+1] - caster[i]))
                     for i in range(len(caster) - 1)]
    big_jumps_caster = [(i, d) for i, d in deltas_caster if d > 0.5]
    if big_jumps_caster:
        for i, d in big_jumps_caster[:5]:
            print(f"  caster big jump at idx {i}: {caster[i]:.3f} -> {caster[i+1]:.3f} "
                  f"(delta {d:.3f})")
    assert not big_jumps_caster, f"caster still has {len(big_jumps_caster)} jumps > 0.5°"

    # Same for KPI
    kpi = front["kpi_deg"]
    deltas_kpi = [(i, abs(kpi[i+1] - kpi[i]))
                  for i in range(len(kpi) - 1)]
    big_jumps_kpi = [(i, d) for i, d in deltas_kpi if d > 0.4]
    if big_jumps_kpi:
        for i, d in big_jumps_kpi[:5]:
            print(f"  KPI big jump at idx {i}: {kpi[i]:.3f} -> {kpi[i+1]:.3f} "
                  f"(delta {d:.3f})")
    assert not big_jumps_kpi, f"KPI still has {len(big_jumps_kpi)} jumps > 0.4°"

    # Print remaining max deltas for visibility
    print(f"  camber max delta: {max(d for _, d in deltas):.4f}°")
    print(f"  caster max delta: {max(d for _, d in deltas_caster):.4f}°")
    print(f"  KPI max delta:    {max(d for _, d in deltas_kpi):.4f}°")


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
