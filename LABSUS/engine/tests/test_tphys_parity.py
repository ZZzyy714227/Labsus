"""TPHYS(JS) <-> transient.py(Python) 两实现数值对拍（审计 D1 / P0-3）。

同一 payload（FSAE 1620/480kg 基线）+ 同一 rc/kw 上下文（ctx 由引擎侧
axle_rc_sweep 产出）分别喂给：
  - 引擎：run_track_sim(TrackSimRequest)
  - 内置 JS 物理：dwb-pro-allinone.html 内 TPHYS 闭包（node vm 抽取直调）
断言物理概要指标一致（路径/极速相对差 <=5%，峰值侧向绝对差 <=0.06g），
这是 README "JS 直译、数值对标" 承诺的第一个可执行 harness。
若 node 缺失则整组 skip。
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from src.api.chassis import axle_rc_sweep
from src.api.v3models import TrackSimRequest
from src.solver.transient import run_track_sim

_LABSUS = Path(__file__).resolve().parents[2]
_HTML = _LABSUS / "web" / "dwb-pro-allinone.html"
_MJS = _LABSUS / "web" / "tphys_parity.cjs"

_FRONT = {
    "LCA_F": [260, 140, 130], "LCA_R": [260, -120, 140], "UCA_F": [350, 110, 340],
    "UCA_R": [350, -100, 350], "LBJ": [640, 10, 150], "UBJ": [590, -15, 410],
    "WC": [710, 0, 280], "TRO": [600, -120, 185], "RACK": [220, -135, 180],
    "STRUT_OUT": [595, 10, 185], "RCK_AX_A": [300, 15, 330], "RCK_AX_B": [300, 70, 328],
    "STRUT_IN": [315, 45, 400], "RCK_DMP": [230, 48, 345], "DMP_BODY": [30, 48, 170],
}
_REAR = {
    "LCA_F": [250, 140, 115], "LCA_R": [250, -130, 125], "UCA_F": [340, 110, 320],
    "UCA_R": [340, -110, 330], "LBJ": [630, 10, 135], "UBJ": [580, -15, 390],
    "WC": [700, 0, 290], "TRO": [590, -120, 170], "RACK": [210, -130, 160],
    "STRUT_OUT": [570, -15, 380], "RCK_AX_A": [340, 25, 290], "RCK_AX_B": [340, 75, 292],
    "STRUT_IN": [370, 45, 255], "RCK_DMP": [305, 60, 270], "DMP_BODY": [25, 62, 310],
}
_ARB0 = {"d": 0.0, "t": 0.0, "dy": 0.0, "dz": 0.0, "G": 0.0}


def _vehicle():
    return {
        "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
        "hcg_mm": 320.0, "hs_mm": 330.0,
        "front": {"points": dict(_FRONT), "arch": "pushrod", "camber_deg": -1.2,
                  "toe_deg": 0.05, "tire_radius": 305.0, "spring_rate": 110.0,
                  "spring_mass_kg": 300.0, "unsprung_kg": 38.0,
                  "motion_ratio": 0.75, "arb": dict(_ARB0)},
        "rear": {"points": dict(_REAR), "arch": "pullrod", "camber_deg": -1.5,
                 "toe_deg": 0.1, "tire_radius": 310.0, "spring_rate": 130.0,
                 "spring_mass_kg": 340.0, "unsprung_kg": 42.0,
                 "motion_ratio": 0.78, "arb": dict(_ARB0)},
    }


def _zero_lut():
    tr = list(range(-90, 91, 10))
    return {"travel": tr, "toe": [0.0] * len(tr), "cam": [0.0] * len(tr)}


def _skidpad(n=64):
    return [{"x": round(30 * math.cos(2 * math.pi * k / n), 4),
             "y": round(30 * math.sin(2 * math.pi * k / n), 4),
             "target_speed": 12.0} for k in range(n)]


def _straight():
    return [{"x": 0.0, "y": 0.0, "target_speed": 15.0},
            {"x": 60.0, "y": 0.0, "target_speed": 15.0}]


def _body(track, **over):
    b = {
        "vehicle": _vehicle(),
        "track": track,
        "dt": 0.01,
        "sim_time": over.pop("sim_time", 25.0),
        "start_speed": over.pop("start_speed", 6.0),
        "lookahead_gain": 0.9,
        "kc_luts": {"front": _zero_lut(), "rear": _zero_lut()},
        "powertrain": {"T_max": 250.0, "P_kw": 80.0, "drive_split_f": 0.0,
                       "brake_split_f": 0.6},
        "aero": {"k_down_f": 0.55, "k_down_r": 0.45, "k_drag": 0.35},
        "tire": {"Fy0": 8000.0, "By": 9.0, "Cy": 1.2, "Ey": -0.5, "Sh": 0.0,
                 "Sv": 0.0, "FzNom": 3500.0, "LS": 0.10, "Cg": 0.5, "Ls": 0.35},
        "iz_kg_m2": round(480.0 * (1.62 * 1.62 + 1.6 * 1.6) / 12.0, 4),
    }
    b.update(over)
    return b


import os

def _autocross():
    pts = [
        [0, 0, 14], [40, 0, 18], [80, 5, 16], [110, 25, 12], [125, 55, 10],
        [115, 85, 11], [95, 115, 13], [70, 140, 9], [40, 145, 9], [15, 130, 12],
        [-15, 105, 15], [-45, 85, 14], [-75, 70, 11], [-95, 45, 9], [-85, 20, 11],
        [-65, 0, 13], [-40, -15, 12], [-15, -15, 11], [0, 0, 14]
    ]
    return [{"x": float(p[0]), "y": float(p[1]), "target_speed": float(p[2])} for p in pts]


def _run_node(body, ctx, case, html_file="dwb-pro-allinone.html"):
    node = shutil.which("node")
    if not node:
        pytest.skip("node 不可用")
    inp = _LABSUS / "web" / f"_parity_{case}_in.json"
    out = _LABSUS / "web" / f"_parity_{case}_out.json"
    inp.write_text(json.dumps({"body": body, "ctx": ctx}), encoding="utf-8")
    env = dict(os.environ)
    env["TPHYS_HTML"] = str(_LABSUS / "web" / html_file)
    try:
        r = subprocess.run([node, str(_MJS), str(inp), str(out)],
                           capture_output=True, text=True, timeout=180,
                           cwd=str(_LABSUS / "web"), env=env)
        assert r.returncode == 0, f"node failed: {r.stderr}"
        return json.loads(out.read_text(encoding="utf-8"))
    finally:
        inp.unlink(missing_ok=True)
        out.unlink(missing_ok=True)


def _ctx(vehicle):
    """与引擎 VehiclePlanar 同源的 rc/kw 上下文（axle_rc_sweep 21 点）。"""
    fv, rv = vehicle.front, vehicle.rear
    swf = axle_rc_sweep(fv)
    swr = axle_rc_sweep(rv)
    travel = [float(x) for x in swf["travel"]]
    rc_f = [55.0 if v is None else float(v) for v in swf["rc_h"]]
    rc_r = [63.0 if v is None else float(v) for v in swr["rc_h"]]
    mrf = fv.motion_ratio or 0.75
    mrr = rv.motion_ratio or 0.78
    kw_f = [float(fv.spring_rate * mrf * mrf)] * len(travel)
    kw_r = [float(rv.spring_rate * mrr * mrr)] * len(travel)
    return {
        "rc": {"travel": travel, "rcF": rc_f, "rcR": rc_r,
               "zrc0_f": float(np.interp(0.0, travel, rc_f)),
               "zrc0_r": float(np.interp(0.0, travel, rc_r)),
               "karb_f": 0.0, "karb_r": 0.0},
        "kw": {"travel": travel, "kwF": kw_f, "kwR": kw_r},
    }


def _parity(case, track, html_file="dwb-pro-allinone.html", **over):
    body = _body(track, **over)
    req = TrackSimRequest(**body)
    py = run_track_sim(req)
    js = _run_node(body, _ctx(req.vehicle), case, html_file=html_file)
    return py, js


def _assert_parity(case, py, js):
    py_s, js_s = py["summary"], js["summary"]
    assert js["status"] == "VALID", f"{case}: JS {js['status']} {js['warnings']}"
    assert js["finished"], f"{case}: JS 未完赛"
    assert py["status"] == "VALID", f"{case}: PY {py['status']} {py['warnings']}"
    assert py["finished"], f"{case}: PY 未完赛"
    for key, rel_tol, abs_tol in [
        ("path_length_m", 0.05, 0.0),
        ("v_max", 0.05, 0.0),
        ("v_end", 0.06, 0.0),
        ("max_ay_g", 0.0, 0.06),
    ]:
        a, b = py_s.get(key), js_s.get(key)
        assert a is not None and b is not None, f"{case}: 缺 {key}"
        rel = abs(a - b) / max(1e-9, abs(a))
        assert rel <= rel_tol or abs(a - b) <= abs_tol, (
            f"{case} {key}: py={a} js={b} (rel={rel:.3f})")


def test_tphys_parity_skidpad():
    """定圆 R=30 稳态：allinone 路径/极速/峰值侧向一致。"""
    py, js = _parity("skidpad", _skidpad())
    _assert_parity("skidpad", py, js)


def test_tphys_parity_straight_line():
    """直线 60m：allinone 加速与速度控制一致。"""
    py, js = _parity("straight", _straight(), sim_time=12.0)
    _assert_parity("straight", py, js)


def test_tphys_parity_fullchassis_skidpad():
    """定圆 R=30 稳态：fullchassis 内置 TPHYS 与 Python 引擎对拍。"""
    py, js = _parity("fc_skidpad", _skidpad(), html_file="dwb-pro-fullchassis.html")
    _assert_parity("fc_skidpad", py, js)


def test_tphys_parity_fsae_autocross():
    """FSAE Autocross 800m 综合赛道：allinone 与 Python 引擎对拍。"""
    py, js = _parity("autocross", _autocross(), sim_time=60.0, start_speed=10.0)
    _assert_parity("autocross", py, js)

