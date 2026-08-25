# LABSUS - Suspension Laboratory

Open-source FSAE race-chassis analysis workbench: kinematics & compliance, ride dynamics, quasi-static handling and planar transient track simulation - all in a single browser page.

## What it does

- Full-vehicle double-wishbone hardpoint editor with 4 synchronized viewports; drag hardpoints and watch a closed-form projection kernel re-solve live
- 5-system color-coded 3D models (spaceframe, upright/arms, rocker & push-pull rods, half-shafts with CV boots, brake rotors & calipers, EDU powertrain, central FSAE steering, impact-absorbing spaceframe)
- K&C sweeps with a two-level bushing solver (6-DOF bushing force balance + mechanism re-solve)
- 4-Post rig explicit dynamics; quasi-static handling (roll-coupled TLLTD)
- Standalone 80-percent track stage: planar 3-DOF vehicle, 4-wheel Magic Formula tires (friction circle, slip relaxation, camber thrust, load sensitivity), powertrain envelope, aero, pure-pursuit + PI driver; 5 follow cams and live per-wheel friction circles with 12 telemetry readouts
- Hardpoint persistence (auto localStorage), baseline diff curves, dual light/dark themes

## Zero-dependency demo

Open web/dwb-pro-allinone.html in Chrome/Edge - no install, no backend, fully offline. The standalone HTML embeds a JS port (TPHYS) of the Python track physics, numerically matched to the reference engine.

Full engine: python server.py on :8001, then open web/dwb-pro-fullchassis.html and connect.

    pip install fastapi uvicorn pydantic numpy scipy
    python engine/server.py

## API

- POST /api/v3/solve/pose - single-point mechanism solve
- POST /api/v3/kandc/{bump,roll,steer,compliance} - K&C sweep curves
- POST /api/v3/chassis/solve | /chassis/kandc/* - full-vehicle quasi-static
- POST /api/v3/chassis/simulate_track - transient track sim (trace + telemetry)

## Tests

    python -m pytest engine/tests -q     # 75 passing including physics assertions

Targets FSAE / student endurance platforms; honest simulation-grade approximations are annotated in-source. See DEVLOG.md for history.
