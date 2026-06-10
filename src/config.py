"""
FSAE suspension configuration data.
Pure data constants — no logic, no computation.
"""

REAR_PREFIX = "R_"

# ============================================================
# DESIGN PARAMETERS — drive all hardpoints parametrically
# ============================================================

DESIGN_PARAMS = {
    "front": {
        # Wheel position
        "track": 750.0,              # mm, full track width
        "wheel_center_x": 5.0,       # mm, X position of wheel center
        "wheel_center_z": 150.0,     # mm, Z position (ride height)
        "tire_radius": 150.0,

        # Kingpin / upright orientation (camber is OUTPUT, not input)
        "caster": 5.18,              # deg (from kingpin X/Y ratio: atan2(-10,-110))
        "kpi": 2.07,                 # deg (from kingpin Y/Z ratio: atan2(4,110))
        "kingpin_length": 112.0,     # mm, UP1-UP2 distance
        "wheel_offset_y": 21.4,      # mm, UP5.Y offset from kingpin at wheel center Z

        # UCA chassis points (fixed to frame)
        "uca_front_x": -60.0,        # X of CH1
        "uca_rear_x": 60.0,          # X of CH2
        "uca_front_y": 202.0,        # Y of CH1 (absolute)
        "uca_rear_y": 165.9,         # Y of CH2 (absolute)
        "uca_front_z": 215.0,        # Z of CH1
        "uca_rear_z": 228.0,         # Z of CH2

        # LCA chassis points
        "lca_front_x": -80.0,
        "lca_rear_x": 80.0,
        "lca_front_y": 191.1,        # Y of CH3
        "lca_rear_y": 151.4,         # Y of CH4
        "lca_front_z": 55.0,
        "lca_rear_z": 60.0,

        # Tie rod
        "tierod_inner_y": 93.8,
        "tierod_inner_z": 116.0,
        "tierod_inner_x": -63.0,

        # Push-rod / rocker
        "pushrod_upright_ratio": 0.65, # UP4 position along kingpin: 0=upper BJ, 1=lower BJ
        "pushrod_ch5_x": 10.0,
        "pushrod_ch5_y": 97.4,
        "pushrod_ch5_z": 245.0,

        # Tire model
        "tire_spring_rate": 150.0,      # N/mm, vertical stiffness
        "corner_weight_n": 350.0,       # N, static load per wheel
    },
    "rear": {
        "track": 720.0,
        "wheel_center_x": -895.0,
        "wheel_center_z": 153.0,
        "tire_radius": 150.0,

        "caster": 6.00,
        "kpi": 1.80,
        "kingpin_length": 112.0,
        "wheel_offset_y": 22.0,

        "uca_front_x": -960.0,
        "uca_rear_x": -840.0,
        "uca_front_y": 204.8,
        "uca_rear_y": 204.8,
        "uca_front_z": 235.0,
        "uca_rear_z": 238.0,

        "lca_front_x": -980.0,
        "lca_rear_x": -820.0,
        "lca_front_y": 144.0,
        "lca_rear_y": 144.0,
        "lca_front_z": 50.0,
        "lca_rear_z": 55.0,

        "tierod_inner_y": 90.0,
        "tierod_inner_z": 116.0,
        "tierod_inner_x": -963.0,

        # Pull-rod / rocker
        "pushrod_upright_ratio": 0.65, # UP4 position along kingpin: 0=upper BJ, 1=lower BJ
        "pushrod_ch5_x": -900.0,
        "pushrod_ch5_y": 120.0,
        "pushrod_ch5_z": 110.0,

        # Tire model
        "tire_spring_rate": 150.0,      # N/mm, vertical stiffness
        "corner_weight_n": 350.0,       # N, static load per wheel
    },
}

# ============================================================
# FRAME — rocker mechanism nodes + connecting tubes
# ============================================================

DEFAULT_FRAME_NODES = {
    # Front rocker — right side (all X=10 → YZ plane, normal // X)
    # CH5 at (135,245), pivot at (200,260) → arm ~67mm
    "RK_PIVOT_R": [10.0, 144.2, 260.0],  # Pivot
    "RK_DAMPER_R":      [10.0, 108.2, 200.0],  # Damper (~78mm arm)
    # Front rocker — left side (mirrored Y)
    "RK_PIVOT_L":       [10.0, -144.2, 260.0],
    "RK_DAMPER_L":      [10.0, -108.2, 200.0],

    # Rear pull-rod rocker — right side (all X=-900 → YZ plane)
    "R_RK_PIVOT_R":     [-900.0, 126.0, 160.0],  # Pivot
    "R_RK_DAMPER_R":    [-900.0, 90.0, 190.0],  # Damper (~67mm arm)
    # Rear pull-rod rocker — left side (mirrored Y)
    "R_RK_PIVOT_L":     [-900.0, -126.0, 160.0],
    "R_RK_DAMPER_L":    [-900.0, -90.0, 190.0],

    # === Front Bulkhead (X=300) ===
    "FB_TOP_R": [250.0, 108.2, 200.0],  # Top right (Z lowered 260→220)
    "FB_TOP_L": [250.0, -108.2, 200.0],
    "FB_LWR_R": [280.0, 85.0, 70.0],  # Bottom right (Z lowered 100→70)
    "FB_LWR_L": [280.0, -85.0, 70.0],

    # === Front Hoop (X=-150) ===
    "FH_TOP_R": [-180.0, 93.8, 350.0],  # Top right (Z lowered 450→400)
    "FH_TOP_L": [-180.0, -93.8, 350.0],
    "FH_UPR_R":         [-150.0, 202.6, 177.0],   # Junction on upper rail (Z interpolated)
    "FH_UPR_L":         [-150.0, -202.6, 177.0],

    # === Main Hoop (X=-650) ===
    "MH_TOP_R":         [-650.0, 86.5, 530.0],   # Top right (Z lowered 600→530)
    "MH_TOP_L":         [-650.0, -86.5, 530.0],
    "MH_UPR_R":         [-650.0, 204.8, 185.0],   # Junction on upper rail (Z interpolated)
    "MH_UPR_L":         [-650.0, -204.8, 185.0],

    # === Rear Bulkhead (X=-1100) ===
    "RB_TOP_R": [-1050.0, 194.7, 220.0],  # Top right (Z lowered 260→220)
    "RB_TOP_L": [-1050.0, -194.7, 220.0],
    "RB_LWR_R": [-1100.0, 115.9, 65.0],  # Bottom right (Z lowered 100→65)
    "RB_LWR_L": [-1100.0, -115.9, 65.0],

    # === Damper Chassis Mounts (separately adjustable) ===
    "DAMPER_CHASSIS_FR": [0.0, 108.2, 120.0],
    "DAMPER_CHASSIS_FL":   [0.0, -108.2, 120.0],
    "R_DAMPER_CHASSIS_RR": [-900.0, 80.0, 80.0],
    "R_DAMPER_CHASSIS_RL": [-900.0, -80.0, 80.0],

    # === BODY CONTOUR NODES — intermediate control points for curved bodywork ===

    # Front nose cone (X ~ 350, ahead of front bulkhead FB at X=250-300)
    "BODY_NOSE_TOP": [350.0, 0.0, 130.0],
    "BODY_NOSE_MID_R": [350.0, 40.0, 120.0],
    "BODY_NOSE_MID_L": [350.0, -40.0, 120.0],
    "BODY_NOSE_BOT": [350.0, 0.0, 80.0],

    # Lower rail midpoint (X=-450, between CH3/CH4 ~0 and R_CH3/R_CH4 ~-900)
    "BODY_LWR_MID_R":    [-450.0, 130.0, 50.0],
    "BODY_LWR_MID_L":    [-450.0, -130.0, 50.0],

    # Upper rail intermediates (between FH_UPR at -150 and MH_UPR at -650)
    "BODY_UPR_FWD_R":    [-350.0, 198.0, 185.0],
    "BODY_UPR_FWD_L":    [-350.0, -198.0, 185.0],

    # Engine cover / rear body (X ~ -1000, behind main hoop at -650)
    "BODY_ENG_TOP":      [-1000.0, 0.0, 260.0],
    "BODY_ENG_MID_R":    [-1000.0, 80.0, 200.0],
    "BODY_ENG_MID_L":    [-1000.0, -80.0, 200.0],

    # Roof / cowl (above main hoop, X ~ -500, Z elevated)
    # (removed BODY_COWL_TOP)
}

FRAME_TUBES = [
    # === A-ARM PIVOT AXES (frame rail segments at each A-arm pair) ===
    ["CH2", "CH1"],                    # Front upper right
    ["CH2_L", "CH1_L"],                # Front upper left
    ["CH4", "CH3"],                    # Front lower right
    ["CH4_L", "CH3_L"],                # Front lower left
    ["R_CH2", "R_CH1"],                # Rear upper right
    ["R_CH2_L", "R_CH1_L"],            # Rear upper left
    ["R_CH4", "R_CH3"],                # Rear lower right
    ["R_CH4_L", "R_CH3_L"],            # Rear lower left

    # === UPPER SIDE RAILS (2pt straight for short front segment, 3pt curves for mid/rear) ===
    ["CH1", "FH_UPR_R"],                             # Right upper rail: front (straight, short)
    ["FH_UPR_R", "BODY_UPR_FWD_R", "MH_UPR_R"],      # Right upper rail: mid (curved)
    ["CH1_L", "FH_UPR_L"],                           # Left upper rail: front (straight, short)
    ["FH_UPR_L", "BODY_UPR_FWD_L", "MH_UPR_L"],      # Left upper rail: mid (curved)

    # === LOWER SIDE RAILS (3-point CatmullRom curves) ===
    ["CH3", "BODY_LWR_MID_R", "R_CH4"],            # Right lower rail (curved)
    ["CH3_L", "BODY_LWR_MID_L", "R_CH4_L"],        # Left lower rail (curved)

    # === FRONT BULKHEAD ===
    ["FB_TOP_R", "FB_TOP_L"],          # Bulkhead top cross
    ["FB_LWR_R", "FB_LWR_L"],          # Bulkhead bottom cross
    ["FB_TOP_R", "FB_LWR_R"],          # Bulkhead right vertical
    ["FB_TOP_L", "FB_LWR_L"],          # Bulkhead left vertical
    ["FB_TOP_R", "CH2"],               # Upper rail: bulkhead→UCA rear mount (right)
    ["FB_TOP_L", "CH2_L"],             # Upper rail: bulkhead→UCA rear mount (left)
    ["FB_LWR_R", "CH4"],               # Lower rail: bulkhead→LCA rear mount (right)
    ["FB_LWR_L", "CH4_L"],             # Lower rail: bulkhead→LCA rear mount (left)

    # === FRONT CROSS TUBES (lateral: right↔left) ===
    ["CH2", "CH2_L"],                  # Front upper cross
    ["CH4", "CH4_L"],                  # Front lower cross

    # === REAR CROSS TUBES (lateral: right↔left) ===
    ["R_CH2", "R_CH2_L"],              # Rear upper cross
    ["R_CH4", "R_CH4_L"],              # Rear lower cross

    # === REAR BULKHEAD ===
    ["RB_TOP_R", "RB_TOP_L"],          # Bulkhead top cross
    ["RB_LWR_R", "RB_LWR_L"],          # Bulkhead bottom cross
    ["RB_TOP_R", "RB_LWR_R"],          # Bulkhead right vertical
    ["RB_TOP_L", "RB_LWR_L"],          # Bulkhead left vertical
    ["R_CH1", "RB_TOP_R"],             # Upper rail: UCA front→rear bulkhead (right)
    ["R_CH1_L", "RB_TOP_L"],           # Upper rail: UCA front→rear bulkhead (left)
    ["R_CH3", "RB_LWR_R"],             # Lower rail: LCA front→rear bulkhead (right)
    ["R_CH3_L", "RB_LWR_L"],           # Lower rail: LCA front→rear bulkhead (left)

    # === FRONT HOOP ===
    ["FH_TOP_R", "FH_TOP_L"],          # Front hoop top cross tube
    ["FH_TOP_R", "FH_UPR_R"],          # Front hoop right arm
    ["FH_TOP_L", "FH_UPR_L"],          # Front hoop left arm
    ["FH_UPR_R", "FH_UPR_L"],          # Front hoop base cross tube

    # === MAIN HOOP ===
    ["MH_TOP_R", "MH_TOP_L"],          # Main hoop top cross tube
    ["MH_TOP_R", "MH_UPR_R"],          # Main hoop right arm
    ["MH_TOP_L", "MH_UPR_L"],          # Main hoop left arm
    ["MH_UPR_R", "MH_UPR_L"],          # Main hoop base cross tube

    # === FRONT BAY CLOSURE ===
    ["FH_TOP_R", "FB_TOP_R"],          # Top rail: front hoop→front bulkhead (right)
    ["FH_TOP_L", "FB_TOP_L"],          # Top rail: front hoop→front bulkhead (left)

    # === REAR BAY CLOSURE ===
    ["MH_TOP_R", "RB_TOP_R"],          # Top rail: main hoop→rear bulkhead (right)
    ["MH_TOP_L", "RB_TOP_L"],          # Top rail: main hoop→rear bulkhead (left)
    ["MH_UPR_R", "R_CH4"],             # Diagonal: hoop base→rear LCA (right)
    ["MH_UPR_L", "R_CH4_L"],           # Diagonal: hoop base→rear LCA (left)

    # === ROCKER TRIANGLES (right) ===
    ["CH5", "RK_PIVOT_R"],             # Push-rod → rocker pivot arm
    ["RK_PIVOT_R", "RK_DAMPER_R"],     # Rocker pivot → damper arm
    ["RK_DAMPER_R", "CH5"],            # Rocker closing edge
    # Rocker triangles (left)
    ["CH5_L", "RK_PIVOT_L"],
    ["RK_PIVOT_L", "RK_DAMPER_L"],
    ["RK_DAMPER_L", "CH5_L"],

    # === FRONT ROCKER PIVOT BRACKETS (pivot → upper frame rail CH1/CH2) ===
    ["RK_PIVOT_R", "CH1"],               # Pivot to front upper rail (right)
    ["RK_PIVOT_R", "CH2"],               # Pivot to rear upper rail (right)
    ["RK_PIVOT_L", "CH1_L"],             # Pivot to front upper rail (left)
    ["RK_PIVOT_L", "CH2_L"],             # Pivot to rear upper rail (left)

    # === REAR ROCKER TRIANGLES (right) ===
    ["R_CH5", "R_RK_PIVOT_R"],           # Pull-rod → rocker pivot arm
    ["R_RK_PIVOT_R", "R_RK_DAMPER_R"],   # Rocker pivot → damper arm
    ["R_RK_DAMPER_R", "R_CH5"],          # Rocker closing edge
    # Rear rocker triangles (left)
    ["R_CH5_L", "R_RK_PIVOT_L"],
    ["R_RK_PIVOT_L", "R_RK_DAMPER_L"],
    ["R_RK_DAMPER_L", "R_CH5_L"],

    # === REAR ROCKER PIVOT BRACKETS (pivot → lower frame rail R_CH3/R_CH4) ===
    ["R_RK_PIVOT_R", "R_CH3"],           # Pivot to rear lower rail (right)
    ["R_RK_PIVOT_R", "R_CH4"],           # Pivot to rear lower rail (right)
    ["R_RK_PIVOT_L", "R_CH3_L"],         # Pivot to rear lower rail (left)
    ["R_RK_PIVOT_L", "R_CH4_L"],         # Pivot to rear lower rail (left)

    # === DAMPER CHASSIS BRACKETS (mount → nearby frame rails) ===
    ["DAMPER_CHASSIS_FR", "CH3"],           # Front right bracket
    ["DAMPER_CHASSIS_FR", "CH4"],           # Front right bracket
    ["DAMPER_CHASSIS_FL", "CH3_L"],         # Front left bracket
    ["DAMPER_CHASSIS_FL", "CH4_L"],         # Front left bracket
    ["R_DAMPER_CHASSIS_RR", "R_CH3"],       # Rear right bracket
    ["R_DAMPER_CHASSIS_RR", "R_CH4"],       # Rear right bracket
    ["R_DAMPER_CHASSIS_RL", "R_CH3_L"],     # Rear left bracket
    ["R_DAMPER_CHASSIS_RL", "R_CH4_L"],     # Rear left bracket

    ["FB_TOP_L", "CH4_L"],
    ["CH2_L", "CH4_L"],
    ["CH3", "FH_UPR_R"],
    ["CH2", "CH4"],
    ["FH_UPR_L", "CH3_L"],

    # === BODY CONTOUR CURVES (3+ point CatmullRom splines for bodywork definition) ===

    # Front nose cone longitudinal
    ["BODY_NOSE_TOP", "FB_TOP_R"],
    ["BODY_NOSE_TOP", "FB_TOP_L"],
    ["BODY_NOSE_BOT", "FB_LWR_R"],
    ["BODY_NOSE_BOT", "FB_LWR_L"],
    ["BODY_NOSE_MID_R", "FB_TOP_R"],
    ["BODY_NOSE_MID_L", "FB_TOP_L"],

    # Nose cone profile curves
    ["BODY_NOSE_TOP", "BODY_NOSE_MID_R", "BODY_NOSE_BOT"],   # Right nose profile
    ["BODY_NOSE_TOP", "BODY_NOSE_MID_L", "BODY_NOSE_BOT"],   # Left nose profile
    ["BODY_NOSE_MID_R", "BODY_NOSE_MID_L"],                   # Nose mid cross

    # Engine cover / rear body

    # Cowl / roof (removed BODY_COWL_TOP tubes)
    ["MH_UPR_R", "R_CH2"],
    ["R_CH2_L", "MH_UPR_L"],
    ["BODY_ENG_MID_R", "BODY_ENG_TOP"],
    ["BODY_ENG_MID_R", "BODY_ENG_MID_L"],
    ["BODY_ENG_TOP", "BODY_ENG_MID_L"],
]

# Custom tube colors: {tube_index: "#hexcolor"}
FRAME_TUBE_COLORS = {
    0: "#94a3b8",
}

# Bodywork faces: {face_name: {"loops": [[nodeA, ...]], "color": "#hex", "opacity": 0.3}}
BODYWORK_FACES = {

































    "01": {
        "loops": [["R_CH4_L", "MH_UPR_L", "BODY_UPR_FWD_L", "FH_UPR_L", "CH3_L", "BODY_LWR_MID_L"]],
        "color": "#94a3b8",
        "opacity": 0.95
    },


    "02": {
        "loops": [["FH_UPR_R", "CH3", "BODY_LWR_MID_R", "R_CH4", "MH_UPR_R", "BODY_UPR_FWD_R"]],
        "color": "#94a3b8",
        "opacity": 0.95
    },



    "04": {
        "loops": [["BODY_NOSE_BOT", "FB_LWR_L", "FB_TOP_L", "BODY_NOSE_TOP"]],
        "color": "#8b5cf6",
        "opacity": 0.95
    },


    "03": {
        "loops": [["BODY_NOSE_BOT", "FB_LWR_R", "FB_TOP_R", "BODY_NOSE_TOP"]],
        "color": "#8b5cf6",
        "opacity": 0.95
    },


    "05": {
        "loops": [["BODY_NOSE_TOP", "FB_TOP_L", "FH_TOP_L", "FH_TOP_R", "FB_TOP_R"]],
        "color": "#8b5cf6",
        "opacity": 0.95
    },




    "06": {
        "loops": [["FB_LWR_L", "FB_TOP_L", "CH2_L", "CH4_L"]],
        "color": "#8b5cf6",
        "opacity": 0.95
    },


    "07": {
        "loops": [["FB_LWR_R", "CH4", "CH2", "FB_TOP_R"]],
        "color": "#8b5cf6",
        "opacity": 0.95
    },




    "09": {
        "loops": [["FB_TOP_L", "FH_TOP_L", "FH_UPR_L", "CH1_L", "CH2_L"]],
        "color": "#8b5cf6",
        "opacity": 0.65
    },

    "08": {
        "loops": [["FB_TOP_R", "FH_TOP_R", "FH_UPR_R", "CH1", "CH2"]],
        "color": "#8b5cf6",
        "opacity": 0.65
    },



    "10": {
        "loops": [["CH4_L", "CH3_L", "FH_UPR_L", "CH1_L", "CH2_L"]],
        "color": "#f43f5e",
        "opacity": 0.95
    },


    "11": {
        "loops": [["CH4", "CH2", "CH1", "FH_UPR_R", "CH3"]],
        "color": "#ec4899",
        "opacity": 0.95
    },
}

# ============================================================
# AERODYNAMIC ELEMENTS — parametric wing/bodywork definitions
# ============================================================

REAR_WING = {
    "enabled": True,
    "reference_point": [-950, 0, 480],
    "span": 600,
    "elements": [
        {
            "name": "主翼面",
            "chord": 240,
            "angle": 4,
            "x_offset": 0,
            "z_offset": 0,
            "camber_pct": -2,
            "thickness_pct": 4,
            "span_fraction": 1
        },
        {
            "name": "襟翼一",
            "chord": 220,
            "angle": 8,
            "x_offset": 0,
            "z_offset": -50,
            "camber_pct": 8,
            "thickness_pct": 6,
            "span_fraction": 1
        },
        {
            "name": "襟翼二",
            "chord": 150,
            "angle": 18,
            "x_offset": 0,
            "z_offset": -95,
            "camber_pct": 10,
            "thickness_pct": 5,
            "span_fraction": 1
        }
    ],
    "endplate": {
        "overhang_forward": 0.10,
        "overhang_rear": 0.04,
        "height_above": 30,
        "height_below": 40
    },
    "mounts": [
        {
            "name": "RW_MOUNT_R",
            "frame_node": "RB_TOP_R",
            "local_x": 0,
            "local_y": 180,
            "local_z": 0
        },
        {
            "name": "RW_MOUNT_L",
            "frame_node": "RB_TOP_L",
            "local_x": 0,
            "local_y": -180,
            "local_z": 0
        }
    ],
    "color": "#60a5fa",
    "opacity": 0.45
}

# Front wing — single element, positive camber (sky-facing)
FRONT_WING = {
    "enabled": True,
    "reference_point": [200, 0, 40],
    "span": 600,
    "elements": [
        {
            "name": "主翼面",
            "chord": 240,
            "angle": 3,
            "x_offset": 0,
            "z_offset": 0,
            "camber_pct": 3,
            "thickness_pct": 5,
            "span_fraction": 1
        }
    ],
    "endplate": {
        "overhang_forward": 0.12,
        "overhang_rear": 0.08,
        "height_above": 50,
        "height_below": 40
    },
    "mounts": [
        {
            "name": "FW_MOUNT_R",
            "frame_node": "CH2",
            "local_x": 240,
            "local_y": 200,
            "local_z": -5
        },
        {
            "name": "FW_MOUNT_L",
            "frame_node": "CH2",
            "local_x": 240,
            "local_y": -200,
            "local_z": -5
        }
    ],
    "color": "#34d399",
    "opacity": 0.5
}

# Chassis points are fixed (don't move during kinematics)
CHASSIS_KEYS = {"CH1", "CH2", "CH3", "CH4", "CH5"}

# Upright points move as a rigid body
UPRIGHT_KEYS = {"UP1", "UP2", "UP3", "UP4", "UP5"}

# Float points have their own constraints
FLOAT_KEYS = {"FL1"}
