"""K&C cross-language parity & direct/rocker kinematics regression tests."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_LABSUS = Path(__file__).resolve().parents[2]
_KC_JS = _LABSUS / "web" / "test" / "kc_parity.cjs"

sys.path.insert(0, str(_LABSUS / "engine"))
from src.api import chassis, v3models, v3service  # noqa: E402


def _collect_js() -> dict:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js unavailable")
    raw = subprocess.check_output([node, str(_KC_JS), "--json"], cwd=str(_LABSUS), text=True)
    return json.loads(raw)


_JS_DATA = None


def _js() -> dict:
    global _JS_DATA
    if _JS_DATA is None:
        _JS_DATA = _collect_js()
    return _JS_DATA


@pytest.mark.parametrize("preset", ["formula", "baja", "gt3", "gt3_sport"])
@pytest.mark.parametrize("axle", ["front", "rear"])
def test_kc_bump_sweep_parity(preset: str, axle: str) -> None:
    d = _js()[preset]
    ax_d = d[axle]
    sw_rows = d["swF" if axle == "front" else "swR"]
    req = v3models.KandcRequest(
        points=ax_d["hp"],
        arch=ax_d["arch"],
        sweep=v3models.SweepSpec(min=-40, max=40, n=9),
        design=v3models.DesignSpec(camber_deg=ax_d["cam0"], toe_deg=ax_d["toe0"]),
        tire_radius=ax_d["tire"]["R"],
        track_width=abs(ax_d["hp"]["WC"][0]) * 2,
    )
    res = v3service.run_bump(req)
    c = res.curves
    assert res.status == "VALID"
    assert max(abs(a - b) for a, b in zip(c["cam"], [x["cam"] for x in sw_rows])) < 1e-4
    assert max(abs(a - b) for a, b in zip(c["toe"], [x["toe"] for x in sw_rows])) < 1e-4
    assert max(abs(a - b) for a, b in zip(c["rc_h"], [x["rcH"] for x in sw_rows])) < 1e-3
    assert max(abs(a - b) for a, b in zip(c["damper"], [x["damper"] for x in sw_rows])) < 1e-3
    assert max(abs(a - b) for a, b in zip(c["mr"], [x["mr"] for x in sw_rows])) < 1e-4


@pytest.mark.parametrize("preset", ["formula", "baja", "gt3", "gt3_sport"])
def test_arb_and_modal_audit_parity(preset: str) -> None:
    d = _js()[preset]
    f, r = d["front"], d["rear"]
    ax = v3models.AxleSpec(
        points=f["hp"],
        arch=f["arch"],
        camber_deg=f["cam0"],
        toe_deg=f["toe0"],
        tire_radius=f["tire"]["R"],
        tire_rim_w=f["tire"].get("rimW", 178),
        tire_et=f["tire"].get("et", 20),
        tire_width=f["tire"]["W"],
        spring_rate=f["kS"],
        spring_mass_kg=f["mS"],
        unsprung_kg=f["mU"],
        motion_ratio=d["mrRefF"],
        arb=v3models.ArbSpec(**f["arb"]),
    )
    rax = v3models.AxleSpec(
        points=r["hp"],
        arch=r["arch"],
        camber_deg=r["cam0"],
        toe_deg=r["toe0"],
        tire_radius=r["tire"]["R"],
        tire_rim_w=r["tire"].get("rimW", 178),
        tire_et=r["tire"].get("et", 20),
        tire_width=r["tire"]["W"],
        spring_rate=r["kS"],
        spring_mass_kg=r["mS"],
        unsprung_kg=r["mU"],
        motion_ratio=d["mrRefR"],
        arb=v3models.ArbSpec(**r["arb"]),
    )
    py_arb_f = chassis.arb_rate(ax)
    assert abs(py_arb_f["k"] - d["arbF"]["k"]) < 1e-6

    creq = v3models.ChassisRequest(
        vehicle=v3models.VehicleSpec(
            wheelbase_mm=d["S_wb"],
            mass_kg=d["S_mTotal"],
            sprung_mass_kg=d["S_mSprung"],
            hcg_mm=d["S_hcg"],
            hs_mm=d["S_hs"],
            front=ax,
            rear=rax,
        )
    )
    ld = chassis.solve_chassis(creq).loads
    assert abs(ld.warp_rate_n_m - d["modal"]["kWarp"]) / max(1.0, ld.warp_rate_n_m) < 5e-3
    assert abs(ld.mode_coupling_ratio - d["modal"]["coupleRatio"]) < 5e-3


def test_direct_run_pose_measures_strut_out_to_dmp_body() -> None:
    d = _js()["baja"]
    f = d["front"]
    req = v3models.PoseRequest(
        points=f["hp"],
        arch="direct",
        travel=20.0,
        rack=0.0,
        tire_radius=f["tire"]["R"],
        design=v3models.DesignSpec(camber_deg=f["cam0"], toe_deg=f["toe0"]),
    )
    res = v3service.run_pose(req)
    assert res.status == "VALID"
    # Baja direct coilover at +20mm bump must shorten damper below design ~411.6mm
    assert 370.0 < res.metrics["damper"] < 410.0
    assert res.rocker is not None
    assert abs(res.rocker["damper_len_mm"] - res.metrics["damper"]) < 1e-3
