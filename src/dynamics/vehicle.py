"""3-DOF vehicle dynamics: heave + roll + pitch, 4 corner spring-dampers."""
import math
import numpy as np

# State indices
IDX_Z = 0    # heave (mm)
IDX_ZD = 1   # heave velocity (mm/s)
IDX_R = 2    # roll (rad)
IDX_RD = 3   # roll rate (rad/s)
IDX_P = 4    # pitch (rad)
IDX_PD = 5   # pitch rate (rad/s)

# Wheel indices
FL, FR, RL, RR = range(4)

G_MM_S2 = 9810.0   # gravity in mm/s²
G_M_S2 = 9.81       # gravity in m/s²


class Vehicle:
    """3-DOF sprung mass with 4 independent corner spring-dampers.

    State vector: [z, zdot, roll, rolldot, pitch, pitchdot]
    Horizontal motion (x, y, yaw) is prescribed by the path.
    """

    def __init__(self, params=None):
        p = params or {}
        self.mass = float(p.get("sprung_mass", 150.0))           # kg
        self.cg_z = float(p.get("cg_height", 280.0))             # mm
        self.Ixx = float(p.get("Ixx", 40.0))                     # kg·m²
        self.Iyy = float(p.get("Iyy", 80.0))                     # kg·m²
        self.k = float(p.get("wheel_rate", 150.0))               # N/mm
        self.c = float(p.get("damper_rate", 3.0))                # N·s/mm
        self.tire_r = float(p.get("tire_radius", 150.0))         # mm
        self.track_f = float(p.get("track_front", 750.0))        # mm
        self.track_r = float(p.get("track_rear", 720.0))         # mm
        self.wb = float(p.get("wheelbase", 900.0))               # mm
        # CG to wheel center vertical offset (body frame, negative = below CG)
        self._dz = -(self.cg_z - self.tire_r)

    def _offsets(self):
        """Body-frame (dx, dy, dz) for FL, FR, RL, RR from CG."""
        htf = self.track_f / 2.0
        htr = self.track_r / 2.0
        hwb = self.wb / 2.0
        return [
            ( hwb, -htf, self._dz),   # FL
            ( hwb,  htf, self._dz),   # FR
            (-hwb, -htr, self._dz),   # RL
            (-hwb,  htr, self._dz),   # RR
        ]

    def compute_derivatives(self, state, body_xy_yaw, terrain):
        """Compute time derivatives of the state vector.

        Args:
            state: [z, zdot, roll, rolldot, pitch, pitchdot]
            body_xy_yaw: (x, y, yaw) — prescribed horizontal pose
            terrain: Terrain instance with height(x, y) method

        Returns:
            dstate: [zdot, zddot, rolldot, rollddot, pitchdot, pitchddot]
        """
        z, zd, roll, rd, pitch, pd = state
        bx, by, yaw = body_xy_yaw
        cy, sy = math.cos(yaw), math.sin(yaw)
        cr, sr = math.cos(roll), math.sin(roll)
        cp, sp = math.cos(pitch), math.sin(pitch)

        offs = self._offsets()
        Fz_total = 0.0
        Mx_total = 0.0
        My_total = 0.0

        for i, (dx, dy, dz) in enumerate(offs):
            # World position of wheel center
            wx = bx + dx * cy - dy * sy
            wy = by + dx * sy + dy * cy
            # Approximate small-angle: wheel center Z in world
            wz = z + dz * cp * cr + dx * sp - dy * sr

            # Terrain height at wheel contact
            gz = terrain.height(wx, wy)

            # Tire compression (mm)
            comp = self.tire_r - wz + gz
            if comp < 0:
                comp = 0.0

            # Spring force (N): k (N/mm) * comp (mm)
            Fs = self.k * comp

            # Compression rate: -wz_dot ≈ -(zd + dx*pd - dy*rd)
            # (small-angle, ignoring higher-order terms from path motion)
            comp_rate = -(zd + dx * pd - dy * rd)
            Fd = self.c * comp_rate

            # Total upward force at this corner (N)
            Fi = Fs + Fd

            Fz_total += Fi                # N, total upward force
            Mx_total += Fi * dy           # N·mm, roll moment
            My_total += -Fi * dx          # N·mm, pitch moment

        # Gravity: m * g (N)
        F_gravity = self.mass * G_M_S2

        # Heave acceleration: (F_total - m*g) / m → m/s² → *1000 for mm/s²
        zdd = (Fz_total - F_gravity) / self.mass * 1000.0

        # Roll acceleration: Mx(N·mm) / 1000 / Ixx(kg·m²) → rad/s²
        rdd = Mx_total / 1000.0 / self.Ixx

        # Pitch acceleration: My(N·mm) / 1000 / Iyy(kg·m²) → rad/s²
        pdd = My_total / 1000.0 / self.Iyy

        return np.array([zd, zdd, rd, rdd, pd, pdd], dtype=float)

    def static_compression(self):
        """Per-corner static compression on flat ground (mm).

        At z = cg_z the springs are unloaded (wheel just touches ground).
        Under load, body settles at z = cg_z - static_compression.
        """
        return self.mass * G_M_S2 / 4.0 / self.k

    def static_z(self):
        """CG height at static equilibrium on flat ground."""
        return self.cg_z - self.static_compression()
