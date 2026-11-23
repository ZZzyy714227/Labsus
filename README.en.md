<div align="center">

# LABSUS

**Full-Chassis Suspension Engineering & 15-DOF Dynamics Workbench**
*Kinematics & Compliance · Offline 3D WebGL · Hardpoint Optimizer · Transient Track Simulation*

<p>
  <a href="README.md">简体中文</a> · <b>English</b>
</p>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2563eb.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.11%2B-059669.svg?style=flat-square" alt="Python 3.11+" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-v3%20API-0d9488.svg?style=flat-square" alt="FastAPI v3" /></a>
  <img src="https://img.shields.io/badge/pytest-359%20passed-16a34a.svg?style=flat-square" alt="pytest 359 passed" />
  <img src="https://img.shields.io/badge/Frontend-Zero--Build%20WebGL-ea580c.svg?style=flat-square" alt="Zero-Build WebGL" />
</p>

A lightweight full-chassis suspension engineering platform for **Formula SAE, FIA GT3, and Baja SAE**.<br/>
Powered by a zero-build browser workbench and an optional Python numerical engine — spanning 3D spatial kinematics, K&C compliance, hardpoint optimization, and 15-DOF transient circuit simulation.

<br/>

<img src="LABSUS/assets/labsus_v4_formula_light.png" alt="LABSUS V4 Workbench — Formula SAE" width="100%" />

</div>

> **Engineering Scope**: Layered after OptimumKinematics and ADAMS/Car for internal consistency and tuning sensitivity; **no real-vehicle calibration is claimed**. Degrees of freedom, simplifications, and verification tiers are documented transparently in [`LABSUS/MODEL_SCOPE.md`](LABSUS/MODEL_SCOPE.md), [`LABSUS/VERIFICATION.md`](LABSUS/VERIFICATION.md), and [`LABSUS/INTENTIONAL_DIFFERENCES.md`](LABSUS/INTENTIONAL_DIFFERENCES.md). All source code resides under [`LABSUS/`](LABSUS/).

---

## Visual Tour

<table>
  <tr>
    <td width="50%">
      <img src="LABSUS/assets/labsus_v4_baja_offroad.png" alt="Baja SAE 3D Force Overlay" />
      <br/><sub><b>Baja SAE · X-Ray & 3D Force Overlay</b> — Tubular roll cage, direct long-travel coilovers, two-force link coloring, and contact-patch friction circles.</sub>
    </td>
    <td width="50%">
      <img src="LABSUS/assets/labsus_v4_gt3_dark.png" alt="FIA GT3 Dark Theme" />
      <br/><sub><b>FIA GT3 · Dark Cockpit Theme</b> — Continuous multi-material coupe shell, hollow ARB tuning, and live US Gradient / TLLTD balance diagnostics.</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="LABSUS/assets/labsus_circuit_sim.png" alt="Shanghai International Circuit 15-DOF Stage" />
      <br/><sub><b>Shanghai International Circuit (SIC 5.45 km) · 15-DOF Stage</b> — Pacejka combined-slip tires, autonomous racing-line pilot, and live telemetry HUD.</sub>
    </td>
  </tr>
</table>

---

## Core Capabilities

| Domain | Highlights |
| :--- | :--- |
| **3D WebGL Modeling & Force Overlays** | Offline Three.js r147 solid/X-ray/wireframe rendering across Formula, Baja, GT3, and GT3 Sport with 6 liveries; pixel-accurate 4-viewport sync plus live 3D Roll Center (`ic`), two-force link loads, and friction-circle (`force`) overlays. |
| **Kinematics, K&C & Hardpoint Optimizer** | Closed-form 3D projection ($10^{-13}\,\text{mm}$ residual), separated front Anti-Dive / rear IRS Anti-Squat, hollow ARB (`arb.wall`), modal warp/coupling audit, bushing-derived compliance steer, and a bounded multi-scale **Hardpoint Optimizer** (`22-optimizer.js`) with undo and setup library saving. |
| **Dynamics Benches & 15-DOF Stages** | Quasi-static 3-path TLLTD & $\delta\text{-}a_y$ sweeps; 4-Post RIG (virtual-work equilibrium, ISO 8608 road spectra, 4Q click damper table); Ride, Lateral, and **Longitudinal (75 m launch & Brake-Bias lockup sweep)** benches; SIC circuit, skidpad, and slope stages. |
| **Dual-Core Engine & Calibration Loop** | Zero-build browser core paired with an optional FastAPI v3 backend (`:8001`); Pacejka Tire Fit, K&C bench CSV overlay, bushing calibration overrides, plus left-dock parameter search and inline KPI handbook quick-reference popovers `[?]`. |

---

## Quick Start

**Zero-Dependency Browser Run**

```bash
python -m http.server 8000 --directory LABSUS/web
# Open http://127.0.0.1:8000/dwb-pro-v4.html
```

**Windows One-Click Launcher**

Double-click `LABSUS/start.bat` to launch the Python FastAPI engine (`:8001`) alongside the local no-cache frontend server.

**Python FastAPI Engine (Optional)**

```bash
pip install -r LABSUS/requirements.txt
python LABSUS/engine/server.py   # Interactive API docs: http://127.0.0.1:8001/docs
```

---

## Verification & Quality Gates

All test suites run from `LABSUS/` using zero-npm Node `vm` sandboxes plus dual JS ↔ Python cross-language parity checks:

```bash
cd LABSUS

# Run every gate in one command (non-zero exit on failure)
python tools/gates/check_all.py           # 40 checks: ruff / pytest / 32 node suites / dual parity / provenance / docs / baselines
python tools/gates/check_all.py --quick   # 5 sub-second checks (ruff / module-roles / provenance / docs / baselines)

# Individual entry points
pytest engine/tests -q                 # 359 passed / 1 skipped (skip = OptimumK rows not entered, explicit)
ruff check engine                      # All checks passed
node web/test/test_dom.js              # 372 assertions: shell structure / dual-entry parity / regressions
node web/test/stage_boot_check.js      # 54 assertions: module order / TDZ / 3 stages x 20 frames
node web/test/tphys_parity.cjs         # JS TPHYS <-> Python transient parity (measured worst 0.51%)
node web/test/kc_parity.cjs            # 4-preset dual-axle K&C / ARB / Modal parity (< 1e-4)
node web/test/physics_audit.js         # Physics audit（60 checks, in CI regression）
```

<details>
<summary><b>Expand Full Project Structure</b></summary>

```text
LABSUS/                           # Engineering root
├── assets/                       # Preview screenshots & media assets
├── web/                          # Native Web frontend
│   ├── index.html                # Auto-redirect landing page
│   ├── dwb-pro-v4.html           # V4 Main Workbench (primary)
│   ├── dwb-pro-fullchassis.html  # Modular full-chassis workbench
│   ├── dwb-pro-allinone.html     # Frozen zero-dependency single-file bundle
│   ├── css/
│   │   ├── fullchassis.css       # Core component & instrument CSS
│   │   └── v4.css                # V4 layout & light/dark theme tokens
│   ├── vendor/
│   │   └── three.min.js          # Three.js r147 offline WebGL kernel
│   ├── js/                       # Core domain modules (loaded in order)
│   │   ├── 01-core.js            # Math library / state / matrix ops
│   │   ├── 02-presets.js         # Vehicle presets (Formula / GT3 / Baja)
│   │   ├── 03-mechanism.js       # Closed-form projection, K&C, static loads & modal audit
│   │   ├── 04-dynamics.js        # Quasi-static load transfer & 4-Post rig dynamics
│   │   ├── 05-scene3d.js         # 4-viewport 3D Canvas rendering engine
│   │   ├── 05b-car3d-webgl.js    # Three.js multi-vehicle 3D modeling & force overlays
│   │   ├── 06-ui-panels.js       # Control panels, calibration UI & KPI handbook hints
│   │   ├── 07-plots.js           # Interactive kinematic characteristic plots
│   │   ├── 08-interact.js        # Persistence & viewport drag interactions
│   │   ├── 09-track.js           # TPHYS closure & track playback
│   │   ├── 10-eval.js            # Engineering report & racing-line planner
│   │   ├── 10b-vehicle-core.js   # 15-DOF vehicle dynamics core & autopilot
│   │   ├── 11-stages.js          # Circuit / skidpad / slope stages & telemetry HUD
│   │   ├── 12-v4-arrange.js      # V4 layout orchestration, parameter search & hero cards
│   │   ├── 13-engine-sound.js    # WebAudio dynamic RPM exhaust synthesizer
│   │   ├── 14-tire-lab.js        # Tire Lab (Magic Formula fitting)
│   │   ├── 15-mpc.js             # Adaptive Model Predictive Control (MPC)
│   │   ├── 16-powertrain.js      # 7-architecture powertrain & torque vectoring
│   │   ├── 17-damper4q.js        # 4-quadrant nonlinear damper table & clicks
│   │   ├── 18-ride-bench.js      # Vertical ride dynamics bench
│   │   ├── 19-compare.js         # A/B 3-layer & setup-library comparison
│   │   ├── 20-lat-bench.js       # Lateral & roll dynamics bench
│   │   ├── 21-car-capability.js  # Vehicle capability envelope table
│   │   ├── 22-optimizer.js       # Bounded multi-scale kinematic hardpoint optimizer
│   │   ├── 23-long-bench.js      # Longitudinal accel & braking / Brake-Bias bench
│   │   └── 24-fsae-arena.js      # Formula Student dynamic arena (75m Accel / Fig-8 Skidpad / Autocross)
│   └── test/                     # 32 regression suites + physics_audit + dual parity
├── engine/                       # Python FastAPI numerical engine
│   ├── server.py                 # FastAPI server entry (:8001)
│   ├── src/                      # Solvers (K&C / Bushing / Pacejka / Transient)
│   ├── data/                     # External data assets (sha256-locked)
│   └── tests/                    # pytest unit test suite (359 passed / 1 skipped)
├── handbook/                     # Suspension engineering reference handbook
├── tools/gates/                  # Unified gate runner (check_all.py / check_baselines.py)
├── scripts/                      # Doc sync & maintenance utilities
├── MODEL_SCOPE.md                # 4-kernel DOF & modeling scope register
├── VERIFICATION.md               # L0–L4 verification evidence matrix
└── INTENTIONAL_DIFFERENCES.md    # Dual-implementation architectural conventions
```

</details>

---

## License

Released under the [MIT License](LICENSE). Issues and pull requests are welcome.
