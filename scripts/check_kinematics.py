"""
Kinematics validation tool — prints static alignment angles and bump/steer
sweep ranges for both axles, checked against design targets.

Usage: python scripts/check_kinematics.py
(Expects the project root on sys.path via the relative insert below.)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix
from routes.solve import _solve_axle

# Design targets (audit report §5)
TARGETS = {
    "camber_static": (-2.5, -1.5),
    "caster": (4.0, 6.0),
    "kpi": (2.0, 4.0),
    "scrub": (-25.0, 25.0),
    "delta_camber_bump": 1.5,   # max over ±25mm travel
    "delta_toe_bump": 1.0,      # max over ±25mm travel
}


def static_angles(hp):
    r = _solve_axle(dict(hp), 0.0, 0.0, mirror=False)
    return r["angles_right"]


def sweep_angles(hp, travel=(-25, 25), step=5):
    out = {}
    dz = travel[0]
    while dz <= travel[1] + 1e-6:
        out[dz] = static_angles_for_travel(hp, dz)
        dz += step
    return out


def static_angles_for_travel(hp, dz):
    r = _solve_axle(dict(hp), float(dz), 0.0, mirror=False)
    return r["angles_right"]


def rack_toes(hp, racks=(-15, 0, 15)):
    return [static_angles_for_rack(hp, r)["toe_deg"] for r in racks]


def static_angles_for_rack(hp, rack):
    r = _solve_axle(dict(hp), 0.0, float(rack), mirror=False)
    return r["angles_right"]


def main():
    for name, hp_raw in [("front", DEFAULT_HARDPOINTS),
                         ("rear", strip_prefix(DEFAULT_REAR_HARDPOINTS, "R_"))]:
        hp = dict(hp_raw)
        a = static_angles(hp)
        sw = sweep_angles(hp)
        cambers = [v["camber_deg"] for v in sw.values()]
        toes = [v["toe_deg"] for v in sw.values()]
        r_toes = rack_toes(hp)

        print(f"== {name} ==")
        print(f"  static: camber={a['camber_deg']:.2f}deg caster={a['caster_deg']:.2f}deg "
              f"kpi={a['kpi_deg']:.2f}deg scrub={a['scrub_radius_mm']:.1f}mm "
              f"toe={a['toe_deg']:.2f}deg trail={a.get('caster_trail_mm', 0):.1f}mm")
        print(f"  bump +-25: dCamber={max(cambers)-min(cambers):.2f}deg "
              f"dToe={max(toes)-min(toes):.2f}deg "
              f"(camber {min(cambers):.2f}..{max(cambers):.2f})")
        print(f"  rack +-15: toe {r_toes[0]:.2f} -> {r_toes[2]:.2f}deg "
              f"(d={abs(r_toes[2]-r_toes[0]):.2f}deg)")

        checks = {
            "camber_static": TARGETS["camber_static"][0] <= a["camber_deg"] <= TARGETS["camber_static"][1],
            "caster": TARGETS["caster"][0] <= a["caster_deg"] <= TARGETS["caster"][1],
            "kpi": TARGETS["kpi"][0] <= a["kpi_deg"] <= TARGETS["kpi"][1],
            "scrub": TARGETS["scrub"][0] <= a["scrub_radius_mm"] <= TARGETS["scrub"][1],
            "delta_camber_bump": max(cambers) - min(cambers) <= TARGETS["delta_camber_bump"],
            "delta_toe_bump": max(toes) - min(toes) <= TARGETS["delta_toe_bump"],
        }
        failed = [k for k, ok in checks.items() if not ok]
        print("  " + ("ALL TARGETS OK" if not failed else f"TARGETS FAILED: {failed}"))
        print()


if __name__ == "__main__":
    main()
