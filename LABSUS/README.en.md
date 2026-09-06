# 🏎️ LABSUS · Suspension Laboratory

**High-Performance Full-Chassis Suspension Analysis Workbench — Kinematics & Compliance / 15-DOF Dynamics / Quasi-Static Handling / Transient Track Simulation**

<p align="left">
  <a href="README.en.md"><b>English</b></a> | <a href="README.md"><b>简体中文</b></a>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-brightgreen.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v3%20REST%20API-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests: 100% Passed](https://img.shields.io/badge/pytest-164%20passed-success.svg)]()
[![Platform: Web & Desktop](https://img.shields.io/badge/Platform-Web%20%7C%20Windows%20%7C%20Linux%20%7C%20macOS-orange.svg)]()

> A modern full-chassis suspension engineering workbench tailored for **Formula Student (FSAE), FIA GT3 racing, and Baja off-road vehicles**.
> From double-wishbone/pushrod spatial hardpoint editing and K&C multi-body sweeps, to 4-Post dynamics, quasi-static load transfer, and **15-DOF autonomous circuit simulation**, all within a responsive, instrumented browser environment. Lightweight proprietary engine deeply benchmarked against OptimumKinematics and ADAMS/Car.
>
> 📁 **All engineering code lives in the [`LABSUS/`](LABSUS/) subdirectory**; all relative paths in this document are rooted there.

---

## 📸 Screenshots

### 1. V4 Workbench — Formula SAE (Light Theme, 4-Viewport Sync)
![LABSUS V4 Workbench · Formula](LABSUS/assets/labsus_v4_formula_light.png)
*Synchronized Front/Plan/Side/Isometric viewports with the Key Results card streaming Camber/Toe/Roll Center/Roll Gradient/US Gradient/TLLTD in real time; direct 3D hardpoint dragging converges in milliseconds (residuals ~$10^{-10}$).*

### 2. SAE Baja Off-Road — Direct Coilover Long-Travel Architecture (Warm Theme)
![LABSUS V4 Workbench · Baja](LABSUS/assets/labsus_v4_baja_offroad.png)
*Externally-mounted upright direct coilovers (DIRECT), $R=396\,\text{mm}$ all-terrain tires and $[-90, 100]\,\text{mm}$ wheel travel; pushrod/direct suspension topology switchable in one click.*

### 3. FIA GT3 Race Mode — Dark Cockpit Theme
![LABSUS V4 Workbench · GT3](LABSUS/assets/labsus_v4_gt3_dark.png)
*GT3 spaceframe bodyshell with subframe-mounted ARBs, race/street suspension modes switchable; multi-tab engineering workflow across Geometry / K&C / Full Vehicle / Circuit.*

### 4. Shanghai International Circuit (SIC) 15-DOF Transient Simulation Stage
![LABSUS Circuit Simulation Stage](LABSUS/assets/labsus_circuit_sim.png)
*High-precision 15-DOF multi-body dynamics, Pacejka combined-slip friction circle, outer-in-out racing line with per-lap adaptive braking-point learning, runoff penalties and lap counting, multi-angle follow cameras, and real-time engineering telemetry HUD.*

---

## 🌟 Core Feature Highlights

### 1. 3D Chassis Modeling & Interactive Visualization
- **Double Wishbone & Pushrod/Pullrod 3D Geometry**: Front/rear unequal A-arms (upper & lower wishbones), uprights, pushrod/pullrod rockers, coilover spring-dampers, half-shafts with CV boots, ventilated brake discs/calipers, EDU electric drive unit, central rack-and-pinion steering, spaceframe tubular chassis (crumple zone + adaptive suspension bay).
- **Synchronized 4-Viewport Interaction**: Front (X-Z), Plan (X-Y), Side (Y-Z), and Isometric (3D) live projections with real-time hardpoint drag-and-drop tuning.
- **Pure Suspension X-Ray & Layer Filtering**: One-click toggle for "Pure Suspension Mode", allowing independent isolation or hiding of chassis frame, powertrain, steering column, and brake master cylinder to focus solely on suspension linkage kinematics.
- **Four Out-of-the-Box Vehicle Presets (Multi-Topology)**:
  - 🏎️ **Formula SAE (Student Formula)**: Pushrod architecture, ARB-free ultra-stiff chassis ($f_n \approx 3.4\,\text{Hz}$);
  - 🏎️ **FIA GT3 Race / 🚗 GT3 Street**: Direct-coilover double wishbones with subframe-mounted anti-roll bars (ARB);
  - 🚜 **Baja SAE (All-Terrain Off-Road)**: Direct long-travel off-road coilovers, $R=396\,\text{mm}$ all-terrain tires, $[-90, 100]\,\text{mm}$ wheel travel.

### 2. Multibody Kinematics & K&C Compliance Solvers
- **High-Precision Multibody Closed-Form Projection Kernel**: Joint geometric vector closed-form projection and nonlinear least-squares convergence (residuals $< 10^{-13}\,\text{mm}$).
- **Full Spectrum Suspension Alignment Parameters**:
  - Camber & Camber Gain ($d\gamma/dz$);
  - Toe & Bump Steer ($d\delta/dz$);
  - Kingpin Inclination (KPI / SAI), Caster Angle, Scrub Radius, Caster Trail;
  - Instantaneous Centers (IC) and dynamic Roll Center Height ($RCH$) migration curves;
  - Damper Motion Ratio ($MR$), Spring/Wheel Rates ($K_s / K_w$), Sprung Mass Natural Frequencies ($f_n$).
- **K&C Bushing Compliance Solvers (Dual-Layer Architecture)**: 6-DOF rubber bushing force balance coupled with secondary mechanism re-solving; calibrated bushing stiffness matrices can be injected directly back into the simulation loop.

### 3. Quasi-Static Handling & Load Transfer
- **TLLTD 3-Path Load Transfer Decomposition**:
  - Elastic roll moment component (main spring + anti-roll bar ARB stiffness distribution);
  - Geometric roll center moment arm component (roll center height and direct axle load transfer);
  - Unsprung mass lateral inertial force component.
- **Quasi-Static Closed-Loop Coupling**: Precise computation of roll angle ($\phi$), full-vehicle roll gradient ($d\phi/dg_y$), dynamic 4-wheel normal loads ($F_z$), and handling balance classification (Understeer / Oversteer / Neutral).
- **Comprehensive Chassis KPIs**:
  - **US Gradient** ($0.2\sim2.0\,^\circ/g$) with front/rear axle slip angle ($\alpha_f/\alpha_r$) decomposition;
  - **Jacking effect**, front axle TLLTD percentage, and roll gradient displayed live on the "Key Results" card with design target corridors;
  - **Understeer characteristic $\delta$-$a_y$ sweep curves**: 2-path decomposition of tire slip and roll steer across $0\to2g$.

### 4. 15-DOF Full-Track Transient Dynamics & AutoPilot Stage
- **15-Degree-of-Freedom Full-Vehicle Multibody Dynamics**:
  - Chassis 6-DOF (longitudinal $u$, lateral $v$, vertical $w$, roll $p$, pitch $q$, yaw $r$);
  - 4-wheel independent vertical travel (4-DOF) + 4-wheel independent rotational spin (4-DOF);
  - 1000 Hz high-frequency sub-stepping numerical integrator, capturing pitch squat/dive, roll, and dynamic wheel load transfer.
- **Pacejka Magic Formula Combined-Slip Tire Model**:
  - Accurate calculation of pure side-slip lateral force ($F_y$), pure longitudinal slip traction/braking force ($F_x$), and combined-slip friction circle adhesion limits.
- **Shanghai International Circuit (SIC 5.45km) Simulation**:
  - 7-point smoothing window for corner curvature extraction, 60-iteration convergent forward-backward tracking speed profile planning;
  - **Realistic Driver Behavior Model**: Out-in-out racing line clipping apex kerbs, adaptive lap-by-lap braking-point exploration, +5s runoff penalty with physical gravel trap handling (never teleports or abruptly resets), lap/penalty/off-track logging;
  - AutoPilot autonomous cruise control (curvature Ackermann feedforward + velocity-adaptive Stanley steering + G-G friction circle longitudinal arbitration) preventing high-power RWD snap-oversteer;
  - 6 dedicated camera views (Chase Cam, Cockpit First-Person, Nose Cone, Wheel Close-Up, Rear Wing Reverse, Heli Top-Down);
  - Real-time telemetry HUD (current corner/straight, speed, lateral G, suggested gear, throttle/brake percentage, yaw rate).

### 5. Engineering Assessment Reports & Utilities
- **One-Click Comprehensive Engineering Report**: 12 core performance metrics graded with S/A/B/C/D badges, radar charts, and specific tuning recommendations.
- **Engineering Data Persistence**: LocalStorage persistence, one-click JSON import/export, and factory reset.
- **Baseline Snapshot Diff**: Save the current chassis as a baseline snapshot and visualize real-time dashed comparison curves while modifying geometry or parameters.

### 6. Measured-Data Calibration Loop (Correlation)
- **Tire Parameter Identification (Tire Fit)**: Import JSON/CSV measured tire curves, multi-stage nonlinear least-squares identification of Pacejka coefficients ($B_y/C_y/E_y/F_{y0}/LS$), normalized residual & RMS reports, one-click injection into simulation;
- **K&C Rig Correlation**: Import bench-tested CSV data, overlay on simulated wheel travel curves (Camber/Toe), and compute travel-window RMS deviations;
- **Steer Camber Gain Decomposition**: Composite curve = Caster term + KPI term + geometric residual quantitative decomposition;
- **Bushing Stiffness Calibration**: Per-hardpoint translational/rotational stiffness overrides driving K&C compliance load case verification.

---

## 🚀 Quick Start

### Method A: Zero-Dependency Browser Run
1. The LABSUS web frontend is built using pure native web technologies with **zero npm build or bundling steps required**.
2. Open the primary entry **`LABSUS/web/dwb-pro-v4.html`** (V4 Modern Workbench) directly in Chrome/Edge, or use the modular `LABSUS/web/dwb-pro-fullchassis.html` / single-file `LABSUS/web/dwb-pro-allinone.html`. Alternatively, serve locally:
   ```bash
   python -m http.server 8000 --directory LABSUS/web
   ```
3. Navigate to `http://127.0.0.1:8000/dwb-pro-v4.html` in your browser.

### Method B: One-Click Windows Launcher
Double-click `LABSUS/start.bat`:
- Launches the Python FastAPI calculation engine on port 8001 (automatically reuses if already active);
- Launches a local no-cache HTTP frontend server and opens your default browser.

### Method C: Python FastAPI Backend Engine (Optional Enhancement)
For full-featured high-performance numerical solving via REST API:
```bash
# 1. Install dependencies
pip install -r LABSUS/requirements.txt

# 2. Launch FastAPI engine server
python LABSUS/engine/server.py
# Server starts at http://127.0.0.1:8001 (Interactive Docs: http://127.0.0.1:8001/docs)
```

---

## 🧪 Testing & Quality Assurance

LABSUS includes a rigorous automated test suite (run from the `LABSUS/` directory):
```bash
cd LABSUS

# 1. Python engine physics assertions / gate checks / TPHYS dual-kernel parity / stress tests (164 passed)
pytest engine/tests -q

# 2. Frontend DOM / state machine assertions (163 passed)
node web/test/test_dom.js

# 3. Stage boot defense checks (40 passed: TDZ, module ordering, stage rendering)
node web/test/stage_boot_check.js

# 4. Dual-kernel physics parity & 15-DOF lap simulation integration (100% passed)
node web/test/tphys_parity.cjs
node web/test/test_lap_15dof.js
```

---

## 📂 Project Structure

```
LABSUS/                           # Engineering Root Directory
├── assets/                       # Screenshots, vehicle models, and UI assets
├── web/                          # Modern Web Frontend
│   ├── index.html                # Root landing page auto-redirect
│   ├── dwb-pro-v4.html           # V4 Main Workbench Entry (Primary)
│   ├── dwb-pro-fullchassis.html  # Modular Workbench (Thin shell + css/ + js/)
│   ├── dwb-pro-allinone.html     # Zero-dependency single-file bundle
│   ├── css/
│   │   └── fullchassis.css       # Modular dark/light instrument CSS design system
│   ├── js/                       # Core frontend domain modules (loaded in order)
│   │   ├── 01-core.js            # Math utilities / state management / matrix ops
│   │   ├── 02-presets.js         # Vehicle presets (Formula / GT3 / Baja)
│   │   ├── 03-mechanism.js       # Multibody closed-form projection & K&C sweeps
│   │   ├── 04-dynamics.js        # Quasi-static load transfer & 4-post solver
│   │   ├── 05-scene3d.js         # 4-viewport 3D Canvas wireframe rendering engine
│   │   ├── 06-ui-panels.js       # Control panels & measured data calibration UI
│   │   ├── 07-plots.js           # Interactive kinematic characteristic plots
│   │   ├── 08-interact.js        # State persistence & viewport interaction
│   │   ├── 09-track.js           # TPHYS physics engine & track playback
│   │   ├── 10-eval.js            # Comprehensive engineering report & racing line planner
│   │   ├── 11-stages.js          # 15-DOF hill-climb / skidpad / SIC track stages
│   │   ├── 12-v4-arrange.js      # V4 UI layout orchestration & key results card
│   │   ├── 13-engine-sound.js    # WebAudio dynamic RPM exhaust acoustic synthesizer
│   │   ├── 14-tire-lab.js        # Tire Laboratory (MF5.2 Brush / Magic Formula fit)
│   │   ├── 15-mpc.js             # Model Predictive Control (MPC) trajectory solver
│   │   └── 16-powertrain.js      # Powertrain & torque vectoring calculations
│   └── test/                     # 16 automated frontend test suites
├── engine/                       # High-Performance Python Numerical Engine
│   ├── server.py                 # FastAPI server entry (:8001)
│   ├── src/                      # Solvers (K&C / Bushing / Pacejka / Tire Fit / Transient)
│   └── tests/                    # pytest unit test suite (164 tests, 100% pass)
├── scripts/                      # Utility and automation scripts
├── requirements.txt              # Python dependencies
├── start.bat                     # Windows one-click startup script
├── INTENTIONAL_DIFFERENCES.md    # Source-of-truth dual-kernel architectural conventions
├── AUDIT_AND_REFACTOR_LOG.md     # Full codebase audit & remediation log
├── LICENSE                       # MIT Open Source License
└── README.md                     # Chinese documentation
```

> Note: `LICENSE` and English documentation `README.en.md` are located at the repository root; `AUDIT_AND_REFACTOR_LOG.md` provides in-depth records of all audit fixes and interface parity alignments.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
Contributions, issues, and pull requests are welcome!
