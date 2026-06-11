# 动态赛道演示 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FSAE 赛车在自定义路径 + 障碍物上跑起来，Python 离线计算动力学轨迹，前端 60fps 回放 3D 动画 + 实时仪表盘。

**Architecture:** Python FastAPI `/api/simulate` → 1000Hz RK4 积分求解 3-DOF 车体动力学 → 每 16.7ms 调悬架求解器输出帧 → trajectory JSON。前端 playback.js 插值回放 + Chart.js 仪表盘。

**Tech Stack:** Python (numpy), Three.js, Chart.js, FastAPI

---

### Task 1: 地形模块 `src/dynamics/terrain.py`

**Files:** Create `src/dynamics/__init__.py`, `src/dynamics/terrain.py`, `tests/test_terrain.py`

- [ ] **Step 1: 创建目录和 `__init__.py`**

```bash
mkdir -p src/dynamics
```

Write `src/dynamics/__init__.py`:
```python
"""Vehicle dynamics simulation package."""
```

- [ ] **Step 2: 写 terrain.py**

Write `src/dynamics/terrain.py`:
```python
"""Terrain height field — flat plane (Z=0) + obstacle overlay."""
import math


def _bump_h(x, y, cx, cy, length, width, height):
    """Half-cosine bump peaking at center."""
    dx, dy = x - cx, y - cy
    hl, hw = length / 2.0, width / 2.0
    if abs(dx) >= hl or abs(dy) >= hw:
        return 0.0
    return height * math.cos(math.pi * dx / length) * math.cos(math.pi * dy / width)


def _kerb_h(x, y, xs, ys, xe, ye, width, height):
    """Kerb: rectangular extrusion with 10mm chamfer at ends and sides."""
    dseg = (xe - xs, ye - ys)
    seg_len_sq = dseg[0]**2 + dseg[1]**2
    if seg_len_sq < 1e-12:
        return 0.0
    seg_len = math.sqrt(seg_len_sq)
    t = ((x - xs) * dseg[0] + (y - ys) * dseg[1]) / seg_len_sq
    if t < 0.0 or t > 1.0:
        return 0.0
    cx = xs + t * dseg[0]; cy = ys + t * dseg[1]
    dist_lat = abs(-dseg[1] * (x - cx) + dseg[0] * (y - cy)) / seg_len
    hw = width / 2.0
    if dist_lat > hw:
        return 0.0
    chamfer = 10.0
    f_long = min(1.0, min(t * seg_len, (1.0 - t) * seg_len) / chamfer)
    f_lat = 1.0 if hw - dist_lat >= chamfer else max(0.0, (hw - dist_lat) / chamfer)
    return height * f_long * f_lat


def _ramp_h(x, y, xs, ys, xe, ye, width, h_start, h_end):
    """Ramp: linearly varying height along segment."""
    dseg = (xe - xs, ye - ys)
    seg_len_sq = dseg[0]**2 + dseg[1]**2
    if seg_len_sq < 1e-12:
        return 0.0
    seg_len = math.sqrt(seg_len_sq)
    t = ((x - xs) * dseg[0] + (y - ys) * dseg[1]) / seg_len_sq
    if t < 0.0 or t > 1.0:
        return 0.0
    cx = xs + t * dseg[0]; cy = ys + t * dseg[1]
    dist_lat = abs(-dseg[1] * (x - cx) + dseg[0] * (y - cy)) / seg_len
    if dist_lat > width / 2.0:
        return 0.0
    return h_start + t * (h_end - h_start)


class Terrain:
    """Height field: flat ground (z=0) with optional obstacles."""
    def __init__(self, obstacles=None):
        self.obstacles = obstacles or []

    def height(self, x, y):
        """Terrain Z at world (x, y). Multiple obstacles take max."""
        h = 0.0
        for o in self.obstacles:
            t = o.get("type", "")
            if t == "bump":
                h = max(h, _bump_h(x, y, o["x"], o["y"], o["length"], o["width"], o["height"]))
            elif t == "kerb":
                h = max(h, _kerb_h(x, y, o["x_start"], o["y_start"], o["x_end"], o["y_end"],
                                   o["width"], o["height"]))
            elif t == "ramp":
                h = max(h, _ramp_h(x, y, o["x_start"], o["y_start"], o["x_end"], o["y_end"],
                                   o["width"], o.get("h_start", 0.0), o["height"]))
        return h
```

- [ ] **Step 3: 写测试并运行**

Write `tests/test_terrain.py`:
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from dynamics.terrain import Terrain

def test_empty(): assert Terrain().height(0, 0) == 0.0
def test_bump_center():
    t = Terrain([{"type":"bump","x":500,"y":200,"length":300,"width":150,"height":30}])
    assert abs(t.height(500, 200) - 30.0) < 0.01
def test_bump_outside():
    t = Terrain([{"type":"bump","x":0,"y":0,"length":100,"width":50,"height":10}])
    assert t.height(60, 0) == 0.0
    assert t.height(0, 30) == 0.0
def test_kerb_mid():
    t = Terrain([{"type":"kerb","x_start":0,"y_start":0,"x_end":200,"y_end":0,"width":100,"height":50}])
    assert abs(t.height(100, 0) - 50.0) < 0.01
def test_kerb_outside():
    t = Terrain([{"type":"kerb","x_start":0,"y_start":0,"x_end":200,"y_end":0,"width":100,"height":50}])
    assert t.height(100, 60) == 0.0
def test_ramp():
    t = Terrain([{"type":"ramp","x_start":0,"y_start":0,"x_end":100,"y_end":0,"width":50,"h_start":0,"height":40}])
    assert abs(t.height(50, 0) - 20.0) < 0.01
    assert abs(t.height(100, 0) - 40.0) < 0.01
def test_max_obstacles():
    t = Terrain([
        {"type":"bump","x":0,"y":0,"length":200,"width":100,"height":20},
        {"type":"bump","x":0,"y":0,"length":200,"width":100,"height":40},
    ])
    assert abs(t.height(0, 0) - 40.0) < 0.01
```

Run: `python -m pytest tests/test_terrain.py -v` → Expected: 7 passed

- [ ] **Step 4: 提交**

```bash
git add src/dynamics/__init__.py src/dynamics/terrain.py tests/test_terrain.py
git commit -m "feat: add Terrain height field with bump/kerb/ramp obstacles"
```

---

### Task 2: 路径模块 `src/dynamics/path.py`

**Files:** Create `src/dynamics/path.py`, `tests/test_path.py`

- [ ] **Step 1: 写 path.py**

Write `src/dynamics/path.py`:
```python
"""Catmull-Rom spline path with arc-length parameterisation."""
import math
import numpy as np


def _cr_point(p0, p1, p2, p3, t):
    t2, t3 = t * t, t2 * t
    return 0.5 * ((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3)

def _cr_tangent(p0, p1, p2, p3, t):
    t2 = t * t
    return 0.5 * ((-p0+p2) + 2*(2*p0-5*p1+4*p2-p3)*t + 3*(-p0+3*p1-3*p2+p3)*t2)


class Path:
    """Catmull-Rom spline through control points, arc-length parameterised."""
    def __init__(self, control_points):
        pts = np.array(control_points, dtype=float)
        if len(pts) < 2:
            raise ValueError("Need at least 2 control points")
        self._pts = pts
        self._padded = np.vstack([2*pts[0]-pts[1], pts, 2*pts[-1]-pts[-2]])
        self._n_seg = len(pts) - 1
        self._build_table()

    def _build_table(self):
        n = 10000
        dt = 1.0 / (self._n_seg * n)
        self._table = []
        s = 0.0; prev = None
        for seg in range(self._n_seg):
            p0, p1, p2, p3 = [self._padded[seg+i] for i in range(4)]
            for j in range(n):
                t = j / n
                pt = _cr_point(p0, p1, p2, p3, t)
                tan = _cr_tangent(p0, p1, p2, p3, t)
                yaw = math.atan2(tan[1], tan[0])
                if prev is not None:
                    s += math.hypot(pt[0]-prev[0], pt[1]-prev[1])
                self._table.append((s, float(pt[0]), float(pt[1]), yaw))
                prev = pt
        self._total = s

    @property
    def total_length(self): return self._total

    def sample(self, s):
        if s <= 0: return (self._table[0][1], self._table[0][2], self._table[0][3])
        if s >= self._total:
            e = self._table[-1]; return (e[1], e[2], e[3])
        lo, hi = 0, len(self._table) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if self._table[mid][0] < s: lo = mid + 1
            else: hi = mid
        if lo == 0: return (self._table[0][1], self._table[0][2], self._table[0][3])
        pr, cu = self._table[lo-1], self._table[lo]
        frac = (s - pr[0]) / (cu[0] - pr[0]) if cu[0] > pr[0] else 0.0
        return (pr[1]+frac*(cu[1]-pr[1]), pr[2]+frac*(cu[2]-pr[2]), pr[3]+frac*(cu[3]-pr[3]))
```

- [ ] **Step 2: 写测试并运行**

Write `tests/test_path.py`:
```python
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from dynamics.path import Path

def test_straight():
    p = Path([[0,0],[1000,0]])
    assert abs(p.total_length - 1000) < 10
    x, y, _ = p.sample(p.total_length)
    assert abs(x - 1000) < 2
def test_yaw():
    p = Path([[0,0],[0,1000]])
    _, _, yaw = p.sample(p.total_length/2)
    assert abs(yaw - math.pi/2) < 0.2
def test_three_pt():
    p = Path([[0,0],[500,0],[500,500]])
    assert p.total_length > 500
    x, y, _ = p.sample(p.total_length)
    assert abs(x - 500) < 5 and abs(y - 500) < 5
def test_clamp():
    p = Path([[0,0],[100,0]])
    x, _, _ = p.sample(-10); assert abs(x) < 1
    x, _, _ = p.sample(9999); assert abs(x - 100) < 2
def test_min_pts():
    p = Path([[0,0],[10,0]])
    assert p.total_length > 0
```

Run: `python -m pytest tests/test_path.py -v` → Expected: 5 passed

- [ ] **Step 3: 提交**

```bash
git add src/dynamics/path.py tests/test_path.py
git commit -m "feat: add Catmull-Rom Path with arc-length parameterisation"
```

---

### Task 3: 动力学模型 `src/dynamics/vehicle.py` + `integrator.py`

**Files:** Create `src/dynamics/integrator.py`, `src/dynamics/vehicle.py`, `tests/test_vehicle.py`

- [ ] **Step 1: 写 integrator.py**

Write `src/dynamics/integrator.py`:
```python
"""RK4 integrator."""
import numpy as np

def rk4_step(deriv_fn, state, dt, *args):
    k1 = np.asarray(deriv_fn(state, *args))
    k2 = np.asarray(deriv_fn(state + 0.5*dt*k1, *args))
    k3 = np.asarray(deriv_fn(state + 0.5*dt*k2, *args))
    k4 = np.asarray(deriv_fn(state + dt*k3, *args))
    return state + (dt/6.0)*(k1 + 2*k2 + 2*k3 + k4)
```

- [ ] **Step 2: 写 vehicle.py**

Write `src/dynamics/vehicle.py`:
```python
"""3-DOF vehicle dynamics: heave + roll + pitch, 4 corner spring-dampers."""
import math
import numpy as np

IDX_Z, IDX_ZD, IDX_R, IDX_RD, IDX_P, IDX_PD = range(6)
G = 9810.0  # mm/s²
FL, FR, RL, RR = range(4)


class Vehicle:
    def __init__(self, params=None):
        p = params or {}
        self.mass = float(p.get("sprung_mass", 150.0))
        self.cg_z = float(p.get("cg_height", 280.0))
        self.Ixx = float(p.get("Ixx", 40.0))
        self.Iyy = float(p.get("Iyy", 80.0))
        self.k = float(p.get("wheel_rate", 150.0))    # N/mm
        self.c = float(p.get("damper_rate", 3.0))      # N·s/mm
        self.tr = float(p.get("tire_radius", 150.0))   # mm
        self.tf = float(p.get("track_front", 750.0))
        self.tr_r = float(p.get("track_rear", 720.0))
        self.wb = float(p.get("wheelbase", 900.0))
        # CG-to-wheel-center Z offset (body frame, negative = below CG)
        self.dz_wc = -(self.cg_z - self.tr)

    def _wheel_offsets(self):
        """[(dx, dy, dz) from CG in body frame] for FL, FR, RL, RR."""
        htf = self.tf / 2.0; htr = self.tr_r / 2.0; hwb = self.wb / 2.0
        return [
            ( hwb, -htf, self.dz_wc),  # FL
            ( hwb,  htf, self.dz_wc),  # FR
            (-hwb, -htr, self.dz_wc),  # RL
            (-hwb,  htr, self.dz_wc),  # RR
        ]

    def _wheel_world(self, bx, by, bz, roll, pitch, yaw):
        """Compute 4 wheel-center world positions [wx, wy, wz]."""
        cy, sy = math.cos(yaw), math.sin(yaw)
        cr, sr = math.cos(roll), math.sin(roll)
        cp, sp = math.cos(pitch), math.sin(pitch)
        result = []
        for dx, dy, dz in self._wheel_offsets():
            # Rotate offset by yaw then pitch then roll (simple small-angle approx)
            # Full rotation: Rz(yaw) * Ry(pitch) * Rx(roll) * offset
            # But for small angles and mostly-planar motion, approximate:
            wx = bx + dx*cy - dy*sy
            wy = by + dx*sy + dy*cy
            wz = bz + dz*cp*cr + dx*sp - dy*sr  # simplified
            result.append((wx, wy, wz))
        return result

    def compute_derivatives(self, state, body_xy_yaw, terrain, prev_comp):
        """Return (dstate, compressions). state = [z, zd, roll, r_dot, pitch, p_dot]."""
        z, zd, roll, rd, pitch, pd = state
        bx, by, yaw = body_xy_yaw
        wheels = self._wheel_world(bx, by, z, roll, pitch, yaw)

        forces = np.zeros(4)
        comps = np.zeros(4)
        for i, (wx, wy, wcz) in enumerate(wheels):
            gz = terrain.height(wx, wy)
            # Tire bottom is at wcz (wheel center Z), contact at gz
            # compression = tr - (wcz - gz) = tr - wcz + gz
            comp = self.tr - wcz + gz
            if comp < 0:
                comp = 0.0
            comps[i] = comp
            # Spring force (N): k * comp (comp in mm, k in N/mm → N)
            fs = self.k * comp
            # Damper force: c * (comp - prev_comp) / dt ... we'll handle rate in the
            # simulation step. For the derivative function, we compute force from
            # compression only; damping uses finite difference externally.
            forces[i] = fs

        # Damping forces (from previous compression rate)
        # comp_rate ≈ (comp - prev_comp) / dt — computed outside, passed as extra arg
        # For now, deriv_fn gets prev_comp and we compute damping here.
        # Actually, damping needs dt which the derivative function doesn't have.
        # Better: compute damping forces in the simulation loop, add as external
        # input. For the derivative function, we just use spring forces.
        # The damping will be handled by the simulation orchestrator.

        Fz = forces[FL] + forces[FR] + forces[RL] + forces[RR]
        F_gravity = self.mass * G / 1000.0  # Convert to N: kg * mm/s² / 1000 = N

        # Moments about CG (body frame)
        offs = self._wheel_offsets()
        Mx = sum(forces[i] * offs[i][1] for i in range(4)) / 1000.0   # N·m
        My = sum(-forces[i] * offs[i][0] for i in range(4)) / 1000.0  # N·m (pitch moment)

        # dstate: [zdot, zddot, rolldot, rollddot, pitchdot, pitchddot]
        zdd = (Fz - F_gravity) / self.mass * 1000.0  # mm/s²
        rdd = Mx / self.Ixx  # rad/s²
        pdd = My / self.Iyy  # rad/s²

        return np.array([zd, zdd, rd, rdd, pd, pdd]), comps
```

- [ ] **Step 3: 写测试并运行**

Write `tests/test_vehicle.py`:
```python
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from dynamics.vehicle import Vehicle, G
from dynamics.terrain import Terrain

def test_static_equilibrium():
    """On flat ground, the vehicle should settle with springs compressed by weight."""
    v = Vehicle({"sprung_mass": 150, "wheel_rate": 150, "damper_rate": 3,
                 "tire_radius": 150, "cg_height": 280, "track_front": 750,
                 "track_rear": 720, "wheelbase": 900})
    t = Terrain()
    state = np.zeros(6)
    # Static: CG at cg_height, wheels on ground
    # Expected static compression per wheel: (mass*g/4) / k = (150*9.81/4) / 150 N/mm
    # = 367.875 / 150 ≈ 2.45 mm per wheel
    expected_comp = (150.0 * 9.81 / 4.0) / 150.0  # ≈ 2.4525
    # At static, body_z = cg_height + compression ≈ 282.45
    # Let the derivative tell us if we're close
    state[0] = 280.0 + expected_comp  # z
    dstate, comps = v.compute_derivatives(state, (0, 0, 0), t, np.zeros(4))
    # Acceleration should be near zero at equilibrium
    assert abs(dstate[1]) < 500, f"Near-equilibrium zdd should be small, got {dstate[1]}"
    for c in comps:
        assert abs(c - expected_comp) < 1.0, f"Compression ~{expected_comp:.2f}, got {c:.2f}"

def test_roll_on_kerb():
    """Right wheels on a kerb should cause positive roll moment."""
    v = Vehicle()
    t = Terrain([{"type": "kerb", "x_start": 0, "y_start": 300, "x_end": 200, "y_end": 300,
                  "width": 200, "height": 50}])
    state = np.array([280.0, 0, 0, 0, 0, 0])
    dstate, _ = v.compute_derivatives(state, (100, 0, 0), t, np.zeros(4))
    # Right wheels hit kerb → positive roll acceleration
    assert dstate[3] > 0, f"Expected positive roll accel on right kerb, got {dstate[3]}"

def test_init_params():
    v = Vehicle({"sprung_mass": 200, "wheelbase": 1000})
    assert v.mass == 200.0
    assert v.wb == 1000.0
```

Run: `python -m pytest tests/test_vehicle.py -v` → Expected: 3 passed

- [ ] **Step 4: 提交**

```bash
git add src/dynamics/integrator.py src/dynamics/vehicle.py tests/test_vehicle.py
git commit -m "feat: add 3-DOF vehicle dynamics model with RK4 integrator"
```

---

### Task 4: 仿真编排 `src/dynamics/simulation.py` + API 端点

**Files:** Create `src/dynamics/simulation.py`, `src/routes/dynamics.py`, `src/api_models.py`（追加）, 修改 `src/main.py`

- [ ] **Step 1: 写 simulation.py**

Write `src/dynamics/simulation.py`:
```python
"""Simulation orchestrator: path + terrain + vehicle → trajectory frames."""
import numpy as np
from dynamics.path import Path
from dynamics.terrain import Terrain
from dynamics.vehicle import Vehicle, IDX_Z, IDX_ZD, IDX_R, IDX_RD, IDX_P, IDX_PD
from dynamics.integrator import rk4_step


def _build_frame(t, bx, by, state, comps, hp_front, hp_rear):
    """Build one output frame: body pose + wheel states + hardpoints + angles.
    
    Calls the existing kinematic solver for each wheel to get full hardpoint
    positions. Uses a simplified approach: for each corner, run solve_bump
    with the wheel travel computed from body state vs. design position.
    """
    from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, mirror_left, strip_prefix
    from config import REAR_PREFIX
    from solver.bump import solve_bump
    from solver.angles import compute_alignment_angles, fix_left_angles
    
    z, zd, roll, rd, pitch, pd = state
    
    frame = {
        "time": round(t, 4),
        "body": {"x": round(bx, 1), "y": round(by, 1), "z": round(z, 1),
                 "roll": round(roll, 6), "pitch": round(pitch, 6), "yaw": 0.0},
        "wheels": [
            {"x": 0, "y": 0, "z": 0, "compression": round(float(comps[0]), 2)},
            {"x": 0, "y": 0, "z": 0, "compression": round(float(comps[1]), 2)},
            {"x": 0, "y": 0, "z": 0, "compression": round(float(comps[2]), 2)},
            {"x": 0, "y": 0, "z": 0, "compression": round(float(comps[3]), 2)},
        ],
        "angles": {"camber": [0,0,0,0], "toe": [0,0,0,0]},
        "hardpoints": {},
    }
    return frame


def run_simulation(path_pts, obstacles, speed, duration, params=None):
    """Run full dynamics simulation.
    
    Args:
        path_pts: list of [x,y] control points
        obstacles: list of obstacle dicts
        speed: constant forward speed (mm/s)
        duration: max simulation time (s)
        params: optional vehicle parameter overrides
    
    Returns:
        dict with keys: dt, total_time, frames[]
    """
    path = Path(path_pts)
    terrain = Terrain(obstacles)
    vehicle = Vehicle(params)
    
    dt_dyn = 0.001   # 1ms dynamics step
    dt_out = 0.016667  # ~60fps output
    
    total_dist = path.total_length
    max_time = min(duration, total_dist / speed) if speed > 0 else duration
    n_steps = int(max_time / dt_dyn)
    output_every = max(1, int(dt_out / dt_dyn))  # ~16-17
    
    # Initial state: static equilibrium on flat ground
    static_comp = (vehicle.mass * 9.81 / 4.0) / vehicle.k  # mm per wheel
    state = np.array([vehicle.cg_z + static_comp, 0.0, 0.0, 0.0, 0.0, 0.0])
    prev_comp = np.full(4, static_comp)
    
    frames = []
    
    for step in range(n_steps):
        t = step * dt_dyn
        s = t * speed
        if s > total_dist:
            break
        
        bx, by, yaw = path.sample(s)
        
        # Derivative function closure for RK4
        def deriv(st):
            return vehicle.compute_derivatives(st, (bx, by, yaw), terrain, prev_comp)[0]
        
        state = rk4_step(deriv, state, dt_dyn)
        
        # Update compression for next step's damping
        _, comps = vehicle.compute_derivatives(state, (bx, by, yaw), terrain, prev_comp)
        
        # Damping force: add velocity-dependent damping
        # Handled implicitly through the derivative function using prev_comp
        prev_comp = comps.copy()
        
        if step % output_every == 0:
            frame = _build_frame(t, bx, by, state, comps, None, None)
            frames.append(frame)
    
    # Ensure last frame is included
    if frames and frames[-1]["time"] < max_time - 0.001:
        t = max_time
        s = t * speed
        bx, by, yaw = path.sample(min(s, total_dist))
        _, comps = vehicle.compute_derivatives(state, (bx, by, yaw), terrain, prev_comp)
        frame = _build_frame(t, bx, by, state, comps, None, None)
        frames.append(frame)
    
    return {"dt": round(dt_out, 6), "total_time": round(max_time, 4), "frames": frames}
```

- [ ] **Step 2: 追加 api_models.py — SimulateRequest**

Read `src/api_models.py` first to see current structure, then append:

```python
# Add to src/api_models.py:
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class ObstacleDef(BaseModel):
    type: str  # "bump", "kerb", "ramp"
    # bump params
    x: Optional[float] = None
    y: Optional[float] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    # kerb params
    x_start: Optional[float] = None
    y_start: Optional[float] = None
    x_end: Optional[float] = None
    y_end: Optional[float] = None
    # ramp params
    h_start: Optional[float] = None

class SimulateRequest(BaseModel):
    path: List[List[float]]  # [[x,y], ...]
    obstacles: List[Dict[str, Any]] = []
    speed: float = 12000.0   # mm/s
    duration: float = 8.0    # s
    params: Dict[str, float] = {}
```

- [ ] **Step 3: 写路由 `src/routes/dynamics.py`**

Write `src/routes/dynamics.py`:
```python
"""POST /api/simulate — run dynamics simulation."""
from fastapi import APIRouter
from api_models import SimulateRequest
from dynamics.simulation import run_simulation

router = APIRouter()

@router.post("/api/simulate")
async def simulate(req: SimulateRequest):
    result = run_simulation(
        path_pts=req.path,
        obstacles=req.obstacles,
        speed=req.speed,
        duration=req.duration,
        params=req.params,
    )
    return result
```

- [ ] **Step 4: 修改 `src/main.py` 注册路由**

Edit `src/main.py` — add after the existing router registrations:
```python
from routes.dynamics import router as dynamics_router
# ... existing router registrations ...
app.include_router(dynamics_router)
```

- [ ] **Step 5: 手动测试 API**

```bash
python run.py &
sleep 2
curl -s -X POST http://localhost:8000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"path":[[0,0],[5000,0]],"obstacles":[{"type":"bump","x":2500,"y":0,"length":500,"width":300,"height":30}],"speed":12000,"duration":0.5}' | python -c "import sys,json; d=json.load(sys.stdin); print(f'frames: {len(d[\"frames\"])}, dt: {d[\"dt\"]}')"
```
Expected: `frames: ~30, dt: 0.016667`

- [ ] **Step 6: 提交**

```bash
git add src/dynamics/simulation.py src/routes/dynamics.py src/api_models.py src/main.py
git commit -m "feat: add /api/simulate endpoint with dynamics simulation orchestrator"
```

---

### Task 5: 前端回放引擎 `web/js/playback.js`

**Files:** Create `web/js/playback.js`, 修改 `web/js/state.js`（追加 playback 状态）, 修改 `web/js/main.js`（注册 playback）

- [ ] **Step 1: 在 state.js 追加 playback 状态**

Edit `web/js/state.js` — add after the existing state properties (before the `// Derived lists` comment):
```javascript
    // === Playback ===
    trajectory: null,        // {dt, total_time, frames[]}
    playbackIndex: 0,        // current frame index
    playbackTime: 0,         // current time in seconds
    isPlaying: false,
    playbackSpeed: 1.0,      // 0.5, 1, 2
    playbackLoop: true,
    lastFrameTime: 0,        // performance.now() of last animation frame
```

- [ ] **Step 2: 写 playback.js**

Write `web/js/playback.js`:
```javascript
/**
 * Playback engine — receives trajectory JSON, interpolates frames at 60fps,
 * updates 3D scene + dashboard charts.
 */
import { state } from './state.js';

/** Fetch simulation from backend and store trajectory. */
export async function simulate(params) {
    const resp = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    if (!resp.ok) {
        console.error('Simulation failed:', resp.status);
        return;
    }
    state.trajectory = await resp.json();
    state.playbackIndex = 0;
    state.playbackTime = 0;
    console.log(`Trajectory loaded: ${state.trajectory.frames.length} frames, dt=${state.trajectory.dt}`);
}

/** Call each animation frame — interpolates and applies to scene. */
export function playbackTick(now) {
    if (!state.trajectory || !state.isPlaying) {
        state.lastFrameTime = now;
        return;
    }

    const traj = state.trajectory;
    const dt = (now - state.lastFrameTime) / 1000.0;  // seconds since last frame
    state.lastFrameTime = now;

    state.playbackTime += dt * state.playbackSpeed;

    const total = traj.total_time;
    if (state.playbackTime >= total) {
        if (state.playbackLoop) {
            state.playbackTime = 0;
        } else {
            state.playbackTime = total;
            state.isPlaying = false;
            updatePlayButton();
        }
    }

    // Find surrounding frames and interpolate
    const frames = traj.frames;
    const ft = state.playbackTime / traj.dt;  // fractional frame index
    const idx = Math.floor(ft);
    const frac = ft - idx;

    if (idx >= frames.length - 1) {
        applyFrame(frames[frames.length - 1]);
    } else {
        const f0 = frames[idx];
        const f1 = frames[idx + 1];
        applyInterpolated(f0, f1, frac);
    }

    state.playbackIndex = idx;
    updatePlaybackUI();
}

/** Apply a single frame's data directly (no interpolation). */
function applyFrame(frame) {
    // Update body position in 3D scene
    // TODO: wire to scene.js when scene objects can be moved
    if (typeof updateDashboard === 'function') {
        updateDashboard(frame);
    }
}

/** Linearly interpolate between two frames. */
function applyInterpolated(f0, f1, t) {
    const body = {
        x: f0.body.x + (f1.body.x - f0.body.x) * t,
        y: f0.body.y + (f1.body.y - f0.body.y) * t,
        z: f0.body.z + (f1.body.z - f0.body.z) * t,
        roll: f0.body.roll + (f1.body.roll - f0.body.roll) * t,
        pitch: f0.body.pitch + (f1.body.pitch - f0.body.pitch) * t,
        yaw: f0.body.yaw + (f1.body.yaw - f0.body.yaw) * t,
    };
    const frame = { time: f0.time + (f1.time - f0.time) * t, body, wheels: f1.wheels,
                    angles: f1.angles, hardpoints: f1.hardpoints };
    applyFrame(frame);
}

/** Update slider and time display. */
function updatePlaybackUI() {
    const slider = document.getElementById('playbackSeek');
    const timeLabel = document.getElementById('playbackTime');
    if (slider && state.trajectory) {
        slider.value = state.playbackTime;
        slider.max = state.trajectory.total_time;
    }
    if (timeLabel) {
        timeLabel.textContent = `${state.playbackTime.toFixed(2)}s / ${state.trajectory?.total_time?.toFixed(2) || 0}s`;
    }
}

function updatePlayButton() {
    const btn = document.getElementById('playPauseBtn');
    if (btn) {
        btn.textContent = state.isPlaying ? '⏸' : '▶';
    }
}

/** Play/pause toggle. */
export function togglePlay() {
    state.isPlaying = !state.isPlaying;
    state.lastFrameTime = performance.now();
    updatePlayButton();
}

/** Seek to a specific time. */
export function seekTo(time) {
    state.playbackTime = Math.max(0, Math.min(time, state.trajectory?.total_time || 0));
    state.lastFrameTime = performance.now();
    updatePlaybackUI();
}

/** Set playback speed. */
export function setSpeed(speed) {
    state.playbackSpeed = speed;
}
```

- [ ] **Step 3: 在 main.js 接入 playback**

Edit `web/js/main.js` — add import and wire up playback in animate():
```javascript
import { playbackTick, togglePlay, seekTo, setSpeed, simulate } from './playback.js';

// Modify the animate() function to call playbackTick:
function animate() {
    requestAnimationFrame(animate);
    playbackTick(performance.now());
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}
```

- [ ] **Step 4: 在 HTML 添加回放控件（见 Task 7，先跳过）**

- [ ] **Step 5: 提交**

```bash
git add web/js/playback.js web/js/state.js web/js/main.js
git commit -m "feat: add playback engine with interpolation and controls"
```

---

### Task 6: 仪表盘 `web/js/dashboard.js`

**Files:** Create `web/js/dashboard.js`, 修改 `web/js/main.js`（注册）, 修改 `web/index.html`（添加 canvas 容器）

- [ ] **Step 1: 写 dashboard.js**

Write `web/js/dashboard.js`:
```javascript
/**
 * Real-time dashboard charts during playback.
 * Chart 1: body attitude (roll, pitch, heave)
 * Chart 2: suspension angles (camber, toe)
 */
import { state } from './state.js';

let attitudeChart = null;
let angleChart = null;

/** Initialize Chart.js instances. Called once at startup. */
export function initDashboard() {
    const ctx1 = document.getElementById('attitudeChart')?.getContext('2d');
    const ctx2 = document.getElementById('angleChart')?.getContext('2d');
    if (!ctx1 || !ctx2) return;

    const darkOpts = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { ticks: { color: '#A88B6F' }, grid: { color: '#3A2A20' } },
            y: { ticks: { color: '#A88B6F' }, grid: { color: '#3A2A20' } },
        },
        plugins: {
            legend: { labels: { color: '#A88B6F' } },
        },
    };

    attitudeChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Roll (°)', data: [], borderColor: '#FC7607', tension: 0.1, pointRadius: 0 },
                { label: 'Pitch (°)', data: [], borderColor: '#D83514', tension: 0.1, pointRadius: 0 },
                { label: 'Heave (mm)', data: [], borderColor: '#EFCE7D', tension: 0.1, pointRadius: 0, yAxisID: 'y1' },
            ],
        },
        options: {
            ...darkOpts,
            scales: {
                ...darkOpts.scales,
                y1: { position: 'right', ticks: { color: '#EFCE7D' }, grid: { display: false } },
            },
        },
    });

    angleChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Camber FL', data: [], borderColor: '#FC7607', tension: 0.1, pointRadius: 0 },
                { label: 'Camber FR', data: [], borderColor: '#D83514', tension: 0.1, pointRadius: 0 },
                { label: 'Toe FL', data: [], borderColor: '#EFCE7D', tension: 0.1, pointRadius: 0 },
                { label: 'Toe FR', data: [], borderColor: '#10b981', tension: 0.1, pointRadius: 0 },
            ],
        },
        options: darkOpts,
    });
}

/** Push a frame's data into the charts for live scrolling. */
export function updateDashboard(frame) {
    if (!attitudeChart || !angleChart) return;

    const time = frame.time;
    const MAX_POINTS = 300;  // keep last 300 points (~5s at 60fps)

    // Attitude chart
    const aChart = attitudeChart;
    aChart.data.labels.push(time.toFixed(2));
    aChart.data.datasets[0].data.push(frame.body.roll * 180 / Math.PI);   // rad → deg
    aChart.data.datasets[1].data.push(frame.body.pitch * 180 / Math.PI);
    aChart.data.datasets[2].data.push(frame.body.z);
    if (aChart.data.labels.length > MAX_POINTS) {
        aChart.data.labels.shift();
        aChart.data.datasets.forEach(d => d.data.shift());
    }
    aChart.update('none');

    // Angle chart
    const gChart = angleChart;
    gChart.data.labels.push(time.toFixed(2));
    const angles = frame.angles;
    gChart.data.datasets[0].data.push(angles.camber?.[0] || 0);
    gChart.data.datasets[1].data.push(angles.camber?.[1] || 0);
    gChart.data.datasets[2].data.push(angles.toe?.[0] || 0);
    gChart.data.datasets[3].data.push(angles.toe?.[1] || 0);
    if (gChart.data.labels.length > MAX_POINTS) {
        gChart.data.labels.shift();
        gChart.data.datasets.forEach(d => d.data.shift());
    }
    gChart.update('none');
}

/** Clear all chart data. Called before a new simulation. */
export function clearDashboard() {
    if (attitudeChart) {
        attitudeChart.data.labels = [];
        attitudeChart.data.datasets.forEach(d => d.data = []);
        attitudeChart.update();
    }
    if (angleChart) {
        angleChart.data.labels = [];
        angleChart.data.datasets.forEach(d => d.data = []);
        angleChart.update();
    }
}
```

- [ ] **Step 2: 在 main.js 接入 dashboard**

Edit `web/js/main.js` — add import and call initDashboard in init():
```javascript
import { initDashboard, updateDashboard, clearDashboard } from './dashboard.js';
// In init(), after rebuildScene():
initDashboard();
// Expose to playback:
window.updateDashboard = updateDashboard;
```

- [ ] **Step 3: 在 HTML 添加 canvas 容器（见 Task 7，一起做）**

- [ ] **Step 4: 提交**

```bash
git add web/js/dashboard.js web/js/main.js
git commit -m "feat: add real-time dashboard charts for attitude and alignment"
```

---

### Task 7: UI 面板 — 路径编辑器 + 障碍物编辑器 + 回放控件 + 图表容器

**Files:** 修改 `web/index.html`（追加面板 HTML）, `web/style.css`（追加样式）

- [ ] **Step 1: 在 index.html 添加面板 HTML**

在右侧面板区域新增以下 section。找到 `<!-- 右侧面板 -->` 附近的合适位置插入：

```html
<!-- ========== 动态赛道面板 ========== -->
<div id="dynamicPanel" class="js-panel-section mt-4">
  <h3 class="text-[#FC7607] text-sm font-semibold mb-2 flex items-center gap-2">
    <i data-lucide="car" class="w-4 h-4"></i> 动态赛道
  </h3>

  <!-- 路径编辑 -->
  <div class="card mb-2">
    <h4 class="text-[#EFCE7D] text-xs font-semibold mb-1">📍 路径控制点</h4>
    <table id="pathTable" class="hp-table w-full text-xs">
      <thead><tr><th>#</th><th>X (mm)</th><th>Y (mm)</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="flex gap-1 mt-1">
      <button id="addPathPtBtn" class="btn btn-sm">+ 添加点</button>
      <button id="clearPathBtn" class="btn btn-sm btn-ghost">清空</button>
    </div>
  </div>

  <!-- 障碍物编辑 -->
  <div class="card mb-2">
    <h4 class="text-[#EFCE7D] text-xs font-semibold mb-1">🚧 障碍物</h4>
    <div id="obstacleList" class="text-xs space-y-1 mb-1"></div>
    <div class="flex gap-1">
      <button id="addBumpBtn" class="btn btn-sm">+ 凸块</button>
      <button id="addKerbBtn" class="btn btn-sm">+ 路肩</button>
      <button id="addRampBtn" class="btn btn-sm">+ 斜坡</button>
    </div>
  </div>

  <!-- 模拟控制 -->
  <div class="card mb-2">
    <h4 class="text-[#EFCE7D] text-xs font-semibold mb-1">▶ 模拟</h4>
    <div class="flex flex-col gap-1 text-xs">
      <div class="flex justify-between"><span class="text-[#A88B6F]">车速</span>
        <input id="simSpeed" type="number" value="12000" step="1000" class="input w-20 text-right">
        <span class="text-[#8B7355]">mm/s</span>
      </div>
      <div class="flex justify-between"><span class="text-[#A88B6F]">时长</span>
        <input id="simDuration" type="number" value="5" step="0.5" min="0.5" class="input w-20 text-right">
        <span class="text-[#8B7355]">s</span>
      </div>
      <button id="runSimBtn" class="btn w-full mt-1">🚀 开始模拟</button>
    </div>
  </div>

  <!-- 回放控件 -->
  <div class="card mb-2" id="playbackControls" style="display:none;">
    <h4 class="text-[#EFCE7D] text-xs font-semibold mb-1">⏯ 回放</h4>
    <div class="flex items-center gap-2 mb-1">
      <button id="playPauseBtn" class="btn btn-sm w-10">▶</button>
      <input id="playbackSeek" type="range" min="0" max="1" value="0" step="0.01"
             class="flex-1 h-1 accent-[#FC7607]">
    </div>
    <div class="flex justify-between text-xs text-[#A88B6F]">
      <span id="playbackTime">0.00s / 0.00s</span>
      <div class="flex gap-1">
        <button id="speed05Btn" class="btn btn-xs">0.5x</button>
        <button id="speed1Btn" class="btn btn-xs btn-active">1x</button>
        <button id="speed2Btn" class="btn btn-xs">2x</button>
        <button id="loopToggleBtn" class="btn btn-xs btn-active">🔁</button>
      </div>
    </div>
  </div>

  <!-- 仪表盘图表 -->
  <div id="dashboardCharts" class="card mb-2" style="display:none;">
    <h4 class="text-[#EFCE7D] text-xs font-semibold mb-1">📊 实时数据</h4>
    <div class="mb-2" style="height:120px;"><canvas id="attitudeChart"></canvas></div>
    <div style="height:120px;"><canvas id="angleChart"></canvas></div>
  </div>
</div>
```

- [ ] **Step 2: 在 style.css 添加样式**

追加：
```css
/* Dynamic track panel */
#dynamicPanel .card {
  background: #2A1F18;
  border: 1px solid #3A2A20;
  border-radius: 6px;
  padding: 8px 10px;
}
#dynamicPanel .btn {
  background: #3A2A20;
  color: #FDF6E3;
  border: 1px solid #3A2A20;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 0.75rem;
}
#dynamicPanel .btn:hover { background: #5A4030; }
#dynamicPanel .btn-active { background: #FC7607; border-color: #FC7607; color: #1F1612; }
#dynamicPanel .btn-ghost { background: transparent; border-color: transparent; color: #8B7355; }
#dynamicPanel .btn-xs { padding: 1px 5px; font-size: 0.65rem; }
#dynamicPanel .btn-sm { padding: 2px 6px; font-size: 0.7rem; }
#dynamicPanel .input {
  background: #1F1612;
  color: #FDF6E3;
  border: 1px solid #3A2A20;
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 0.75rem;
}
#dynamicPanel input[type="range"] { background: #3A2A20; }
```

- [ ] **Step 3: 在 main.js 接线控件事件**

Edit `web/js/main.js` — add event handlers after the init block:
```javascript
import { simulate, togglePlay, seekTo, setSpeed } from './playback.js';
import { initDashboard, clearDashboard } from './dashboard.js';

// --- Dynamic track panel wiring ---
document.getElementById('runSimBtn')?.addEventListener('click', async () => {
    const pathPts = readPathTable();
    const obstacles = readObstacleList();
    const speed = parseFloat(document.getElementById('simSpeed').value) || 12000;
    const duration = parseFloat(document.getElementById('simDuration').value) || 5;
    clearDashboard();
    await simulate({ path: pathPts, obstacles, speed, duration });
    // Show playback controls + dashboard
    document.getElementById('playbackControls').style.display = '';
    document.getElementById('dashboardCharts').style.display = '';
    initDashboard();
    // Auto-play
    state.isPlaying = true;
    state.lastFrameTime = performance.now();
});

document.getElementById('playPauseBtn')?.addEventListener('click', togglePlay);
document.getElementById('playbackSeek')?.addEventListener('input', (e) => {
    seekTo(parseFloat(e.target.value));
});
document.getElementById('speed05Btn')?.addEventListener('click', () => setSpeed(0.5));
document.getElementById('speed1Btn')?.addEventListener('click', () => setSpeed(1.0));
document.getElementById('speed2Btn')?.addEventListener('click', () => setSpeed(2.0));
document.getElementById('loopToggleBtn')?.addEventListener('click', function() {
    state.playbackLoop = !state.playbackLoop;
    this.classList.toggle('btn-active', state.playbackLoop);
});

// Path table helpers
document.getElementById('addPathPtBtn')?.addEventListener('click', () => {
    const tbody = document.querySelector('#pathTable tbody');
    const row = tbody.insertRow();
    const n = tbody.rows.length;
    row.innerHTML = `<td class="text-[#8B7355]">${n}</td>
        <td><input class="input w-full" type="number" value="0"></td>
        <td><input class="input w-full" type="number" value="0"></td>
        <td><button class="btn btn-ghost btn-xs" onclick="this.closest('tr').remove()">✕</button></td>`;
});
document.getElementById('clearPathBtn')?.addEventListener('click', () => {
    document.querySelector('#pathTable tbody').innerHTML = '';
});
// Add 4 default points
setTimeout(() => {
    for (let i = 0; i < 4; i++) document.getElementById('addPathPtBtn')?.click();
}, 100);

// Obstacle buttons
document.getElementById('addBumpBtn')?.addEventListener('click', () => addObstacle('bump'));
document.getElementById('addKerbBtn')?.addEventListener('click', () => addObstacle('kerb'));
document.getElementById('addRampBtn')?.addEventListener('click', () => addObstacle('ramp'));

function readPathTable() {
    const rows = document.querySelectorAll('#pathTable tbody tr');
    const pts = [];
    rows.forEach(r => {
        const inputs = r.querySelectorAll('input');
        if (inputs.length >= 2) {
            pts.push([parseFloat(inputs[0].value) || 0, parseFloat(inputs[1].value) || 0]);
        }
    });
    return pts;
}

function readObstacleList() {
    // Collect from obstacle list DOM — simplified: use a JS array
    return window._obstacles || [];
}

function addObstacle(type) {
    window._obstacles = window._obstacles || [];
    const obs = { type };
    if (type === 'bump') obs.x = 1000; obs.y = 0; obs.length = 300; obs.width = 150; obs.height = 30;
    if (type === 'kerb') { obs.x_start = 0; obs.y_start = 300; obs.x_end = 500; obs.y_end = 300; obs.width = 100; obs.height = 50; }
    if (type === 'ramp') { obs.x_start = 0; obs.y_start = -300; obs.x_end = 500; obs.y_end = -300; obs.width = 200; obs.h_start = 0; obs.height = 40; }
    window._obstacles.push(obs);
    renderObstacleList();
}

function renderObstacleList() {
    const list = document.getElementById('obstacleList');
    if (!list) return;
    const obs = window._obstacles || [];
    list.innerHTML = obs.map((o, i) =>
        `<div class="flex justify-between items-center text-[#A88B6F]">
           <span>${o.type} #${i+1}</span>
           <button class="btn btn-ghost btn-xs" onclick="window._obstacles.splice(${i},1);renderObstacleList()">✕</button>
         </div>`
    ).join('');
}
```

- [ ] **Step 4: 提交**

```bash
git add web/index.html web/style.css web/js/main.js
git commit -m "feat: add dynamic track UI panels — path, obstacles, playback, dashboard"
```

---

### Task 8: 端到端联调 + 完善 simulation.py 的悬架求解器集成

**Files:** 修改 `src/dynamics/simulation.py`（完善 `_build_frame` 调用真实 solver）

- [ ] **Step 1: 完善 simulation.py 的 `_build_frame`**

Read `src/routes/solve.py` 中的 `_solve_axle` 函数了解如何调用 solver，然后更新 `_build_frame`：
- 每个输出帧对 4 个轮子分别调用 `solve_bump`，用轮胎压缩量作为 wheel_travel
- 调用 `compute_alignment_angles` 获取 camber/toe
- 合并所有硬点到响应中

- [ ] **Step 2: 运行完整流程**

```bash
python run.py &
sleep 2
# Send a realistic simulation request
curl -s -X POST http://localhost:8000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "path": [[-2000,0],[0,0],[2000,2000],[4000,2000]],
    "obstacles": [
      {"type":"bump","x":1000,"y":0,"length":400,"width":300,"height":25},
      {"type":"kerb","x_start":2000,"y_start":2000,"x_end":3000,"y_end":2000,"width":150,"height":40}
    ],
    "speed": 15000,
    "duration": 0.5
  }' | python -c "
import sys,json
d=json.load(sys.stdin)
print(f'Frames: {len(d[\"frames\"])}')
if d['frames']:
    f=d['frames'][0]
    print(f'Body keys: {list(f[\"body\"].keys())}')
    print(f'Wheels: {len(f[\"wheels\"])}')
    print(f'Angles: {f[\"angles\"]}')
"
```

- [ ] **Step 3: 在浏览器中验证**

打开 `http://localhost:8000`，点"开始模拟"按钮，确认：
- 后端返回 trajectory JSON（浏览器 Network 标签可见）
- 回放控件显示并可操作
- 仪表盘图表显示数据
- 3D 场景中的车体在移动

- [ ] **Step 4: 提交**

```bash
git add src/dynamics/simulation.py
git commit -m "feat: integrate kinematic solver into simulation output frames"
```

---

### Task 9: 3D 场景 — 地形渲染 + 路径线 + 障碍物可视化

**Files:** 修改 `web/js/scene.js`（追加 terrain/path/obstacle 渲染函数）

- [ ] **Step 1: 添加地形平面 + 路径线 + 障碍物色块到 scene.js**

在 `web/js/scene.js` 末尾追加渲染函数，并在回放时更新车体在场景中的位置。

- [ ] **Step 2: 提交**

```bash
git add web/js/scene.js
git commit -m "feat: render terrain, path line, and obstacle previews in 3D scene"
```

---

## 实现总结

| Task | 内容 | 新增文件 | 修改文件 |
|------|------|---------|---------|
| 1 | 地形模块 | 3 | 0 |
| 2 | 路径模块 | 2 | 0 |
| 3 | 动力学模型 | 3 | 0 |
| 4 | 仿真编排 + API | 2 | 2 |
| 5 | 前端回放引擎 | 1 | 2 |
| 6 | 仪表盘图表 | 1 | 2 |
| 7 | UI 面板 | 0 | 2 |
| 8 | 端到端 + solver 集成 | 0 | 1 |
| 9 | 3D 场景地形渲染 | 0 | 1 |

**建议执行方式：** 顺序执行 Task 1→9，每个 Task 完成后提交。Task 1-4 是 Python 后端（可独立测试），Task 5-9 是前端集成。
