# 🏎️ LABSUS · Suspension Laboratory

**High-Performance Full-Chassis Suspension Analysis Workbench — Kinematics & Compliance / 15-DOF Multi-Body Dynamics / Quasi-Static Handling / Transient Track Simulation**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-brightgreen.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v3%20REST%20API-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests: 100% Passed](https://img.shields.io/badge/pytest-115%20passed-success.svg)]()

> A modern full-chassis suspension engineering workbench tailored for **Formula Student (FSAE), FIA GT3 racing, and Baja off-road vehicles**.
> From double-wishbone/pushrod spatial hardpoint editing and K&C multi-body sweeps, to 4-Post dynamics, quasi-static load transfer, and **15-DOF autonomous circuit simulation**, all within a responsive, instrumented browser environment.
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

## 🌟 Key Features

- **Double Wishbone & Pushrod/Pullrod 3D Geometry**: Front/rear unequal A-arms, uprights, rocker/push-pull rods, coilover dampers, half-shafts with CV boots, ventilated brake discs/calipers, central rack-and-pinion steering, spaceframe chassis.
- **Factory Presets (multi-topology)**:
  - 🏎️ **Formula SAE**: Pushrod architecture, ARB-free high-frequency chassis ($f_n \approx 3.4\,\text{Hz}$);
  - 🏎️ **FIA GT3 Race / 🚗 GT3 Street**: Direct-coilover double wishbones with subframe-mounted anti-roll bars (ARB);
  - 🚜 **Baja SAE**: Direct long-travel off-road coilovers, $R=396\,\text{mm}$ all-terrain tires, $[-90, 100]\,\text{mm}$ wheel travel.
- **Real-Time Kinematics & Compliance (K&C)**:
  - Camber & Camber Gain ($d\gamma/dz$);
  - Toe & Bump Steer ($d\delta/dz$);
  - KPI, Caster, Scrub Radius, Caster Trail;
  - Instant Centers & Roll Center Height ($RCH$) migration curves;
  - Motion Ratio ($MR$), Wheel Rates ($K_w$), Ride Frequency ($f_n$).
- **15-DOF Full-Vehicle Dynamics & Circuit Simulation**:
  - 6-DOF chassis + 4-DOF suspension vertical travel + 4-DOF wheel spin;
  - 1000 Hz sub-stepping numerical integration;
  - Pacejka Magic Formula combined-slip friction circle;
  - AutoPilot with Stanley path tracking and dynamic cornering Traction Control (TCS).
- **Measured-Data Calibration Loop**: Pacejka tire parameter identification from measured curves ($B_y/C_y/E_y/F_{y0}/LS$), K&C rig correlation overlay with RMS deviation, steering-camber gain decomposition (Caster + KPI + residual), and bushing stiffness calibration.
- **One-Click Engineering Assessment**: 12 critical metrics graded with S/A/B/C/D badges, radar charts, and tuning suggestions.
- **Persistence & Engineering Tools**: LocalStorage persistence, JSON export/import, baseline snapshot diff comparison, dual light/dark themes.

---

## 🚀 Quick Start

### Zero-Dependency Browser Run
Open the main entry `LABSUS/web/dwb-pro-v4.html` directly in Chrome/Edge (modular `dwb-pro-fullchassis.html` and single-file `dwb-pro-allinone.html` also available), or serve locally:
```bash
python -m http.server 8000 --directory LABSUS/web
```
Navigate to `http://127.0.0.1:8000/dwb-pro-v4.html`.

### Launch Python FastAPI Backend (Optional)
```bash
pip install -r LABSUS/requirements.txt
python LABSUS/engine/server.py
# Backend runs at http://127.0.0.1:8001 (Docs at http://127.0.0.1:8001/docs)
```

---

## 🧪 Testing

Run from the `LABSUS/` directory:
```bash
cd LABSUS

# Run 115 pytest unit tests
pytest

# Run 163 DOM assertion tests
node web/test/test_dom.js

# Run 40 stage-boot defense checks
node web/test/stage_boot_check.js
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).
