# 🏎️ LABSUS · Suspension Laboratory

**High-Performance Full-Chassis Suspension Analysis Workbench — Kinematics & Compliance / 15-DOF Multi-Body Dynamics / Quasi-Static Handling / Transient Track Simulation**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-brightgreen.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v3%20REST%20API-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests: 100% Passed](https://img.shields.io/badge/pytest-102%20passed-success.svg)]()

> A modern full-chassis suspension engineering workbench tailored for **Formula Student (FSAE), FIA GT3 racing, and Baja off-road vehicles**.
> From double-wishbone/pushrod spatial hardpoint editing and K&C multi-body sweeps, to 4-Post dynamics, quasi-static load transfer, and **15-DOF autonomous circuit simulation**, all within a responsive, instrumented browser environment.

---

## 📸 Screenshots

### 1. Full-Chassis 4-Viewport Geometry & K&C Workbench
![LABSUS Main Workbench UI](assets/labsus_main_ui.png)
*Synchronized Front (X-Z), Plan (X-Y), Side (Y-Z), and Isometric (3D) viewports. Direct 3D hardpoint dragging with real-time camber, toe, KPI, caster, roll center height migration, and TLLTD load transfer breakdowns.*

### 2. Shanghai International Circuit (SIC) 15-DOF Transient Simulation Stage
![LABSUS Circuit Simulation Stage](assets/labsus_circuit_sim.png)
*High-precision 15-DOF multi-body vehicle dynamics, Pacejka combined-slip tire models, AutoPilot curvature-adaptive velocity profiler with cornering Traction Control (TCS), multi-angle follow cameras, and real-time engineering telemetry HUD.*

---

## 🌟 Key Features

- **Double Wishbone & Pushrod/Pullrod 3D Geometry**: Front/rear unequal A-arms, uprights, rocker/push-pull rods, coilover dampers, half-shafts with CV boots, ventilated brake discs/calipers, central rack-and-pinion steering, spaceframe chassis.
- **Factory Presets**:
  - 🏎️ **Formula SAE**: Pushrod architecture, ARB-free high-frequency chassis ($f_n \approx 3.4\,\text{Hz}$);
  - 🏎️ **FIA GT3**: Front/rear double-wishbone with subframe-mounted high-diameter anti-roll bars (ARB);
  - 🚗 **GT3 Sport**: High-performance road-car setup balancing comfort and track stiffness;
  - 🚜 **Baja SAE**: Long-travel direct/semi-trailing off-road suspension.
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
- **One-Click Engineering Assessment**: 12 critical metrics graded with S/A/B/C/D badges, radar charts, and tuning suggestions.
- **Persistence & Engineering Tools**: LocalStorage persistence, JSON export/import, baseline snapshot diff comparison, dual light/dark themes.

---

## 🚀 Quick Start

### Zero-Dependency Browser Run
Open `web/dwb-pro-allinone.html` directly in Chrome/Edge or serve locally:
```bash
python -m http.server 8000 --directory web
```
Navigate to `http://127.0.0.1:8000/`.

### Launch Python FastAPI Backend (Optional)
```bash
pip install -r requirements.txt
python engine/server.py
# Backend runs at http://127.0.0.1:8001 (Docs at http://127.0.0.1:8001/docs)
```

---

## 🧪 Testing

```bash
# Run 102 pytest unit tests
pytest

# Run DOM assertion tests
node web/test/test_dom.js
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).
