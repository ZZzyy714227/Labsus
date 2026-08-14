"""
FSAE suspension configuration data.
Pure data constants — no logic, no computation.
"""

REAR_PREFIX = "R_"
DEFAULT_TUBE_COLOR = "#8899cc"  # fallback color for frame tubes and bodywork faces

# ============================================================
# DESIGN PARAMETERS — drive all hardpoints parametrically
# TRUE-SCALE baseline (2026-08-14 rebuild):
#   wheelbase 1550mm, track 1220/1180mm, 13" tires (OD ~520mm),
#   reference: audit report docs/superpowers/specs/2026-08-14-geometry-audit-report.md §5
# ============================================================

DESIGN_PARAMS = {
    "front": {
        # Wheel position
        "track": 1220.0,             # mm, full track width
        "wheel_center_x": 0.0,       # mm, X position of wheel center (front axle = origin)
        "wheel_center_z": 255.3,     # mm, Z = loaded radius (260 - 700/150)
        "tire_radius": 260.0,        # mm, 13" rim + race tire (OD ~520)
        "tire_width": 180.0,         # mm

        # Kingpin / upright orientation (camber is OUTPUT, not input)
        "caster": 5.0,               # deg
        "kpi": 2.5,                  # deg
        "kingpin_length": 150.0,     # mm, UP1-UP2 distance (ball-joint spacing)
        "wheel_offset_y": 30.0,      # mm, UP5.Y offset from kingpin at wheel center Z

        # UCA chassis points (fixed to frame)
        "uca_front_x": -90.0,        # X of CH1
        "uca_rear_x": 90.0,          # X of CH2
        "uca_front_y": 160.0,        # Y of CH1 (absolute)
        "uca_rear_y": 152.0,         # Y of CH2 (absolute)
        "uca_front_z": 285.0,        # Z of CH1
        "uca_rear_z": 295.0,         # Z of CH2 (rear higher = anti-dive)

        # LCA chassis points
        "lca_front_x": -110.0,
        "lca_rear_x": 110.0,
        "lca_front_y": 128.0,        # Y of CH3
        "lca_rear_y": 122.0,         # Y of CH4
        "lca_front_z": 110.0,
        "lca_rear_z": 115.0,         # rear higher = anti-dive

        # Tie rod (rack behind front axle)
        "tierod_inner_y": 115.0,
        "tierod_inner_z": 200.0,
        "tierod_inner_x": -100.0,

        # Push-rod / rocker (front: pushrod from lower upright up to high rocker)
        "pushrod_upright_ratio": 0.65, # UP4 position along kingpin: 0=upper BJ, 1=lower BJ
        "pushrod_ch5_x": 0.0,
        "pushrod_ch5_y": 135.0,
        "pushrod_ch5_z": 305.0,

        # Tire model
        "tire_spring_rate": 150.0,      # N/mm, vertical stiffness
        "corner_weight_n": 700.0,       # N, static load per wheel (280kg / 4)
    },
    "rear": {
        # Wheel position (rear axle at X = -1550)
        "track": 1180.0,
        "wheel_center_x": -1550.0,
        "wheel_center_z": 255.3,
        "tire_radius": 260.0,
        "tire_width": 180.0,

        "caster": 5.0,
        "kpi": 2.5,
        "kingpin_length": 150.0,
        "wheel_offset_y": 30.0,

        "uca_front_x": -1640.0,
        "uca_rear_x": -1460.0,
        "uca_front_y": 155.0,
        "uca_rear_y": 150.0,
        "uca_front_z": 285.0,
        "uca_rear_z": 295.0,

        "lca_front_x": -1660.0,
        "lca_rear_x": -1440.0,
        "lca_front_y": 125.0,
        "lca_rear_y": 120.0,
        "lca_front_z": 110.0,
        "lca_rear_z": 115.0,

        # Rear toe link (inner point fixed to chassis — no rear steering)
        "tierod_inner_y": 105.0,
        "tierod_inner_z": 200.0,
        "tierod_inner_x": -1560.0,

        # Pull-rod / rocker (rear: pullrod from upper upright down to low rocker)
        "pushrod_upright_ratio": 0.20, # upper upright → rod goes DOWN to low chassis
        "pushrod_ch5_x": -1550.0,
        "pushrod_ch5_y": 125.0,
        "pushrod_ch5_z": 105.0,

        # Tire model
        "tire_spring_rate": 150.0,
        "corner_weight_n": 700.0,
    },
}

# ============================================================
# FRAME — rules-compliant true-scale steel spaceframe nodes
# (2026-08-14 rebuild; rules refs: ref/chassis_rules.txt 3.11–3.21)
# ============================================================

DEFAULT_FRAME_NODES = {
    # === Suspension rocker mechanisms ===
    # Front pushrod rocker (X=0, YZ plane): pivot/rocker arms from Task 1 kinematics
    "RK_PIVOT_R":        [0.0, 95.0, 270.0],
    "RK_DAMPER_R":       [0.0, 55.0, 205.0],
    "DAMPER_CHASSIS_FR": [0.0, 45.0, 110.0],
    "RK_PIVOT_L":        [0.0, -95.0, 270.0],
    "RK_DAMPER_L":       [0.0, -55.0, 205.0],
    "DAMPER_CHASSIS_FL": [0.0, -45.0, 110.0],
    # Rear pullrod rocker (X=-1550, YZ plane)
    "R_RK_PIVOT_R":        [-1550.0, 95.0, 155.0],
    "R_RK_DAMPER_R":       [-1550.0, 60.0, 200.0],
    "R_DAMPER_CHASSIS_RR": [-1550.0, 40.0, 95.0],
    "R_RK_PIVOT_L":        [-1550.0, -95.0, 155.0],
    "R_RK_DAMPER_L":       [-1550.0, -60.0, 200.0],
    "R_DAMPER_CHASSIS_RL": [-1550.0, -40.0, 95.0],

    # === Front bulkhead (X=+420; rules 3.21: ≥3 members/side back to front hoop) ===
    "FB_TOP_R": [420.0, 200.0, 380.0],
    "FB_TOP_L": [420.0, -200.0, 380.0],
    "FB_MID_R": [420.0, 170.0, 260.0],
    "FB_MID_L": [420.0, -170.0, 260.0],
    "FB_LWR_R": [420.0, 160.0, 130.0],
    "FB_LWR_L": [420.0, -160.0, 130.0],

    # === Front hoop (X=-500, vertical ⇒ rake 0° ≤ 20° per 3.12.6; top Z=800) ===
    "FH_TOP_R":   [-500.0, 170.0, 800.0],
    "FH_TOP_L":   [-500.0, -170.0, 800.0],
    "FH_MID_R":   [-500.0, 215.0, 500.0],
    "FH_MID_L":   [-500.0, -215.0, 500.0],
    "FH_LEG_R":   [-500.0, 235.0, 140.0],
    "FH_LEG_L":   [-500.0, -235.0, 140.0],
    "FH_UPPER_R": [-500.0, 220.0, 310.0],   # junction: hoop × upper SIS member
    "FH_UPPER_L": [-500.0, -220.0, 310.0],
    "FH_BRACE_R": [-500.0, 182.0, 720.0],   # on-hoop brace attach (80mm below top ≤160)
    "FH_BRACE_L": [-500.0, -182.0, 720.0],

    # === Main hoop (X=-750, top Z=1150; legs Y=±235 ⇒ inner 470 ≥ 380 per 3.11.6) ===
    "MH_TOP_R":        [-750.0, 110.0, 1150.0],
    "MH_TOP_L":        [-750.0, -110.0, 1150.0],
    "MH_BEND_R":       [-750.0, 215.0, 700.0],
    "MH_BEND_L":       [-750.0, -215.0, 700.0],
    "MH_LEG_R":        [-750.0, 235.0, 120.0],
    "MH_LEG_L":        [-750.0, -235.0, 120.0],
    "MH_UPPER_R":      [-750.0, 220.0, 310.0],   # junction: hoop × upper SIS member
    "MH_UPPER_L":      [-750.0, -220.0, 310.0],
    "MH_BRACE_R":      [-750.0, 145.0, 1000.0],  # on-hoop brace attach (150 ≤160 below top)
    "MH_BRACE_L":      [-750.0, -145.0, 1000.0],
    "MH_BRACE_END_R":  [-1150.0, 145.0, 320.0],  # brace base on rear upper rail
    "MH_BRACE_END_L":  [-1150.0, -145.0, 320.0],

    # === Rear bulkhead (X=-1580, engine bay closure + wing mount) ===
    "RB_TOP_R": [-1580.0, 170.0, 400.0],
    "RB_TOP_L": [-1580.0, -170.0, 400.0],
    "RB_MID_R": [-1580.0, 160.0, 270.0],
    "RB_MID_L": [-1580.0, -160.0, 270.0],
    "RB_LWR_R": [-1580.0, 150.0, 140.0],
    "RB_LWR_L": [-1580.0, -150.0, 140.0],

    # === Lower side rail midpoint (3-point curve CH3→LWR_MID→R_CH3) ===
    "LWR_MID_R": [-775.0, 160.0, 115.0],
    "LWR_MID_L": [-775.0, -160.0, 115.0],

    # === BODY CONTOUR NODES (panel definition only — not structural) ===
    # Nose cone tip (X=+560)
    "BODY_NOSE_TOP": [560.0, 0.0, 300.0],
    "BODY_NOSE_BOT": [560.0, 0.0, 150.0],
    # Floor panel corners (planar, Z=45)
    "BODY_FLR_FR_R":  [380.0, 170.0, 45.0],
    "BODY_FLR_FR_L":  [380.0, -170.0, 45.0],
    "BODY_FLR_MID_R": [-775.0, 160.0, 45.0],
    "BODY_FLR_MID_L": [-775.0, -160.0, 45.0],
    "BODY_FLR_RR_R":  [-1400.0, 150.0, 45.0],
    "BODY_FLR_RR_L":  [-1400.0, -150.0, 45.0],
    # Sidepod outline (front narrow, rear wide; clear of tires Y≤520)
    "BODY_SP_FR_TR": [-620.0, 330.0, 350.0],
    "BODY_SP_FR_TL": [-620.0, -330.0, 350.0],
    "BODY_SP_FR_BR": [-620.0, 300.0, 120.0],
    "BODY_SP_FR_BL": [-620.0, -300.0, 120.0],
    "BODY_SP_RR_TR": [-1330.0, 370.0, 380.0],
    "BODY_SP_RR_TL": [-1330.0, -370.0, 380.0],
    "BODY_SP_RR_BR": [-1330.0, 340.0, 140.0],
    "BODY_SP_RR_BL": [-1330.0, -340.0, 140.0],
}

FRAME_TUBES = [
    # === FRONT BULKHEAD (X=+420; rules 3.21) ===
    ["FB_TOP_R", "FB_TOP_L"],
    ["FB_MID_R", "FB_MID_L"],
    ["FB_LWR_R", "FB_LWR_L"],
    ["FB_TOP_R", "FB_MID_R"],
    ["FB_MID_R", "FB_LWR_R"],
    ["FB_TOP_L", "FB_MID_L"],
    ["FB_MID_L", "FB_LWR_L"],
    ["FB_TOP_R", "FB_LWR_R"],
    ["FB_TOP_L", "FB_LWR_L"],

    # === FRONT BAY RAILS (bulkhead → UCA/LCA mounts) ===
    ["FB_TOP_R", "CH1"],
    ["FB_TOP_L", "CH1_L"],
    ["FB_LWR_R", "CH3"],
    ["FB_LWR_L", "CH3_L"],
    ["CH1", "CH2"],
    ["CH1_L", "CH2_L"],
    ["CH3", "CH4"],
    ["CH3_L", "CH4_L"],

    # === FRONT HOOP — one continuous 5-point curve (rules 3.12) ===
    ["FH_LEG_R", "FH_MID_R", "FH_TOP_R", "FH_MID_L", "FH_LEG_L"],
    ["FH_TOP_R", "FH_TOP_L"],
    ["FH_LEG_R", "FH_LEG_L"],
    ["FH_UPPER_R", "FH_UPPER_L"],
    ["FH_MID_R", "FH_UPPER_R"],       # hoop × upper SIS junction bracket
    ["FH_MID_L", "FH_UPPER_L"],

    # === FRONT HOOP BRACES (3.14) + BULKHEAD SUPPORTS (3.21.2: 3 members/side) ===
    ["FB_TOP_R", "FH_BRACE_R"],
    ["FB_TOP_L", "FH_BRACE_L"],
    ["FB_MID_R", "FH_MID_R"],
    ["FB_MID_L", "FH_MID_L"],
    ["FB_LWR_R", "FH_LEG_R"],
    ["FB_LWR_L", "FH_LEG_L"],

    # === SIDE IMPACT STRUCTURE (3.19): upper/lower + X-diagonals, hoop↔hoop ===
    ["FH_UPPER_R", "MH_UPPER_R"],
    ["FH_UPPER_L", "MH_UPPER_L"],
    ["FH_LEG_R", "MH_LEG_R"],
    ["FH_LEG_L", "MH_LEG_L"],
    ["FH_LEG_R", "MH_UPPER_R"],
    ["FH_LEG_L", "MH_UPPER_L"],
    ["FH_UPPER_R", "MH_LEG_R"],
    ["FH_UPPER_L", "MH_LEG_L"],

    # === MAIN HOOP — one continuous 5-point curve (rules 3.11) ===
    ["MH_LEG_R", "MH_BEND_R", "MH_TOP_R", "MH_BEND_L", "MH_LEG_L"],
    ["MH_TOP_R", "MH_TOP_L"],
    ["MH_LEG_R", "MH_LEG_L"],
    ["MH_UPPER_R", "MH_UPPER_L"],
    ["MH_BEND_R", "MH_UPPER_R"],      # hoop × upper SIS junction bracket
    ["MH_BEND_L", "MH_UPPER_L"],

    # === MAIN HOOP BRACES (3.13) + support pairs back to hoop (3.13.7) ===
    ["MH_BRACE_R", "MH_BRACE_END_R"],
    ["MH_BRACE_L", "MH_BRACE_END_L"],
    ["MH_UPPER_R", "MH_BRACE_END_R"],
    ["MH_UPPER_L", "MH_BRACE_END_L"],
    ["MH_LEG_R", "MH_BRACE_END_R"],
    ["MH_LEG_L", "MH_BRACE_END_L"],

    # === UPPER SIDE RAILS ===
    ["CH2", "FH_UPPER_R"],
    ["CH2_L", "FH_UPPER_L"],
    ["MH_UPPER_R", "R_CH1"],
    ["MH_UPPER_L", "R_CH1_L"],
    ["R_CH1", "R_CH2"],
    ["R_CH1_L", "R_CH2_L"],

    # === LOWER SIDE RAILS (3-point curves CH3→LWR_MID→R_CH3) ===
    ["CH3", "LWR_MID_R", "R_CH3"],
    ["CH3_L", "LWR_MID_L", "R_CH3_L"],
    ["R_CH3", "R_CH4"],
    ["R_CH3_L", "R_CH4_L"],

    # === MAIN HOOP LEGS → LOWER RAILS ===
    ["MH_LEG_R", "LWR_MID_R"],
    ["MH_LEG_L", "LWR_MID_L"],

    # === AXLE CROSS TUBES (UCA/LCA pairs) ===
    ["CH2", "CH2_L"],
    ["CH4", "CH4_L"],
    ["R_CH2", "R_CH2_L"],
    ["R_CH4", "R_CH4_L"],

    # === REAR BULKHEAD (engine bay closure) ===
    ["R_CH2", "RB_TOP_R"],
    ["R_CH2_L", "RB_TOP_L"],
    ["R_CH3", "RB_LWR_R"],
    ["R_CH3_L", "RB_LWR_L"],
    ["RB_TOP_R", "RB_TOP_L"],
    ["RB_MID_R", "RB_MID_L"],
    ["RB_LWR_R", "RB_LWR_L"],
    ["RB_TOP_R", "RB_MID_R"],
    ["RB_MID_R", "RB_LWR_R"],
    ["RB_TOP_L", "RB_MID_L"],
    ["RB_MID_L", "RB_LWR_L"],
    ["RB_TOP_R", "RB_LWR_R"],
    ["RB_TOP_L", "RB_LWR_L"],

    # === ROCKER PIVOT BRACKETS ===
    ["RK_PIVOT_R", "CH1"],
    ["RK_PIVOT_R", "CH2"],
    ["RK_PIVOT_L", "CH1_L"],
    ["RK_PIVOT_L", "CH2_L"],
    ["R_RK_PIVOT_R", "R_CH3"],
    ["R_RK_PIVOT_R", "R_CH4"],
    ["R_RK_PIVOT_L", "R_CH3_L"],
    ["R_RK_PIVOT_L", "R_CH4_L"],

    # === DAMPER CHASSIS BRACKETS ===
    ["DAMPER_CHASSIS_FR", "CH3"],
    ["DAMPER_CHASSIS_FR", "CH4"],
    ["DAMPER_CHASSIS_FL", "CH3_L"],
    ["DAMPER_CHASSIS_FL", "CH4_L"],
    ["R_DAMPER_CHASSIS_RR", "R_CH3"],
    ["R_DAMPER_CHASSIS_RR", "R_CH4"],
    ["R_DAMPER_CHASSIS_RL", "R_CH3_L"],
    ["R_DAMPER_CHASSIS_RL", "R_CH4_L"],

    # === STEERING RACK SUPPORT ===
    ["FL1", "CH3"],
    ["FL1", "CH4"],
    ["FL1", "FL1_L"],
]

# Custom tube colors: {tube_index: "#hexcolor"}
FRAME_TUBE_COLORS = {
    0: "#94a3b8",
}

# Bodywork faces: {face_name: {"loops": [[nodeA, ...]], "color": "#hex", "opacity": 0.3}}
# Bodywork faces: {face_name: {"loops": [[nodeA, ...]], "color": "#hex", "opacity": 1.0}}
# True-scale rebuild 2026-08-14: semantic names, planar loops, real paint colors.
BODYWORK_FACES = {
    # Nose cone (front bulkhead -> nose tip)
    "nose_top":    {"loops": [["FB_TOP_R", "BODY_NOSE_TOP", "FB_TOP_L"]],
                    "color": "#e8e6e1", "opacity": 1.0},
    "nose_right":  {"loops": [["FB_TOP_R", "BODY_NOSE_TOP", "BODY_NOSE_BOT", "FB_LWR_R"]],
                    "color": "#e8e6e1", "opacity": 1.0},
    "nose_left":   {"loops": [["FB_TOP_L", "FB_LWR_L", "BODY_NOSE_BOT", "BODY_NOSE_TOP"]],
                    "color": "#e8e6e1", "opacity": 1.0},
    "nose_bottom": {"loops": [["FB_LWR_R", "BODY_NOSE_BOT", "FB_LWR_L"]],
                    "color": "#1a1a1a", "opacity": 1.0},

    # Cockpit side panels (front hoop -> main hoop)
    "side_right": {"loops": [["FH_UPPER_R", "MH_UPPER_R", "MH_LEG_R", "FH_LEG_R"]],
                   "color": "#d83514", "opacity": 1.0},
    "side_left":  {"loops": [["FH_UPPER_L", "FH_LEG_L", "MH_LEG_L", "MH_UPPER_L"]],
                   "color": "#d83514", "opacity": 1.0},

    # Sidepods (outboard radiator covers)
    "sidepod_outer_r": {"loops": [["BODY_SP_FR_TR", "BODY_SP_RR_TR", "BODY_SP_RR_BR", "BODY_SP_FR_BR"]],
                        "color": "#e8e6e1", "opacity": 1.0},
    "sidepod_outer_l": {"loops": [["BODY_SP_FR_TL", "BODY_SP_FR_BL", "BODY_SP_RR_BL", "BODY_SP_RR_TL"]],
                        "color": "#e8e6e1", "opacity": 1.0},
    "sidepod_deck":   {"loops": [["BODY_SP_FR_TR", "BODY_SP_FR_TL", "BODY_SP_RR_TL", "BODY_SP_RR_TR"]],
                       "color": "#c8c4bd", "opacity": 1.0},
    "sidepod_floor":  {"loops": [["BODY_SP_FR_BR", "BODY_SP_RR_BR", "BODY_SP_RR_BL", "BODY_SP_FR_BL"]],
                       "color": "#1a1a1a", "opacity": 1.0},
    "sidepod_connect_r": {"loops": [["BODY_SP_FR_TR", "BODY_SP_FR_BR", "FH_UPPER_R"]],
                          "color": "#c8c4bd", "opacity": 1.0},
    "sidepod_connect_l": {"loops": [["BODY_SP_FR_TL", "FH_UPPER_L", "BODY_SP_FR_BL"]],
                          "color": "#c8c4bd", "opacity": 1.0},

    # Floor (planar, Z=45)
    "floor": {"loops": [["BODY_FLR_FR_R", "BODY_FLR_MID_R", "BODY_FLR_RR_R",
                         "BODY_FLR_RR_L", "BODY_FLR_MID_L", "BODY_FLR_FR_L"]],
              "color": "#1a1a1a", "opacity": 1.0},

    # Engine cover (main hoop top -> rear bulkhead top)
    "engine_cover": {"loops": [["MH_TOP_R", "RB_TOP_R", "RB_TOP_L", "MH_TOP_L"]],
                     "color": "#e8e6e1", "opacity": 1.0},

    # Firewall (cockpit <-> engine bay, X=-750 plane)
    "firewall": {"loops": [["MH_LEG_R", "MH_UPPER_R", "MH_UPPER_L", "MH_LEG_L"]],
                 "color": "#9aa3ab", "opacity": 1.0},
}

# ============================================================
# AERODYNAMIC ELEMENTS — parametric wing/bodywork definitions
# ============================================================

REAR_WING = {
    "enabled": True,
    "reference_point": [-1630.0, 0.0, 1050.0],
    "span": 900.0,
    "elements": [
        {"name": "主翼面", "chord": 300, "angle": 5, "x_offset": 0, "z_offset": 0,
         "camber_pct": 4, "thickness_pct": 6, "span_fraction": 1},
        {"name": "襟翼一", "chord": 220, "angle": 15, "x_offset": 0, "z_offset": -60,
         "camber_pct": 8, "thickness_pct": 5, "span_fraction": 1},
        {"name": "襟翼二", "chord": 140, "angle": 30, "x_offset": 0, "z_offset": -115,
         "camber_pct": 10, "thickness_pct": 4, "span_fraction": 1},
    ],
    "endplate": {
        "overhang_forward": 0.10,
        "overhang_rear": 0.10,
        "height_above": 80,
        "height_below": 120
    },
    "mounts": [
        {"name": "RW_MOUNT_R", "frame_node": "RB_TOP_R", "local_x": 0, "local_y": 120, "local_z": 650},
        {"name": "RW_MOUNT_L", "frame_node": "RB_TOP_L", "local_x": 0, "local_y": -120, "local_z": 650},
    ],
    "color": "#20242a",
    "opacity": 1.0
}

# Front wing — single element, positive camber (sky-facing)
FRONT_WING = {
    "enabled": True,
    "reference_point": [480.0, 0.0, 120.0],
    "span": 1000.0,
    "elements": [
        {"name": "主翼面", "chord": 320, "angle": 3, "x_offset": 0, "z_offset": 0,
         "camber_pct": 4, "thickness_pct": 5, "span_fraction": 1},
        {"name": "襟翼", "chord": 160, "angle": 15, "x_offset": 0, "z_offset": -50,
         "camber_pct": 6, "thickness_pct": 5, "span_fraction": 1},
    ],
    "endplate": {
        "overhang_forward": 0.08,
        "overhang_rear": 0.08,
        "height_above": 60,
        "height_below": 80
    },
    "mounts": [
        {"name": "FW_MOUNT_R", "frame_node": "FB_LWR_R", "local_x": 60, "local_y": 150, "local_z": -10},
        {"name": "FW_MOUNT_L", "frame_node": "FB_LWR_L", "local_x": 60, "local_y": -150, "local_z": -10},
    ],
    "color": "#20242a",
    "opacity": 1.0
}

# ============================================================
# UNDERTRAY — parametric floor panel
# ============================================================

UNDERTRAY_CONFIG = {
    "enabled": True,
    "front_x": 400.0,
    "rear_x": -1400.0,
    "ground_clearance": 30.0,
    "half_width": 380.0,
    "venturi_depth": 25.0,
    "venturi_start_ratio": 0.3,
    "venturi_end_ratio": 0.6,
    "edge_flipups": [
        {"name": "FLIPUP_R", "side": "right", "start_ratio": 0.55, "length": 500, "height": 60, "angle": 35},
        {"name": "FLIPUP_L", "side": "left", "start_ratio": 0.55, "length": 500, "height": 60, "angle": 35},
    ],
    "strakes": [
        {"name": "STRAKE_R1", "side": "right", "y_ratio": 0.85, "start_ratio": 0.35, "length": 600, "height": 30, "angle": 50},
        {"name": "STRAKE_R2", "side": "right", "y_ratio": 0.45, "start_ratio": 0.4, "length": 550, "height": 25, "angle": 45},
        {"name": "STRAKE_L1", "side": "left", "y_ratio": 0.85, "start_ratio": 0.35, "length": 600, "height": 30, "angle": 50},
        {"name": "STRAKE_L2", "side": "left", "y_ratio": 0.45, "start_ratio": 0.4, "length": 550, "height": 25, "angle": 45},
    ],
    "mounts": [
        {"name": "UT_MOUNT_FR", "frame_node": "FB_LWR_R", "local_y": 80},
        {"name": "UT_MOUNT_FL", "frame_node": "FB_LWR_L", "local_y": -80},
        {"name": "UT_MOUNT_RR", "frame_node": "RB_LWR_R", "local_y": 80},
        {"name": "UT_MOUNT_RL", "frame_node": "RB_LWR_L", "local_y": -80},
    ],
    "color": "#20242a",
    "opacity": 1.0
}

# ============================================================
# DIFFUSER — parametric rear diffuser
# ============================================================

DIFFUSER_CONFIG = {
    "enabled": True,
    "start_x": -1400.0,
    "length": 320.0,
    "angle": 12.0,
    "channels": 5,
    "strake_height": 60,
    "strake_angle": 75,
    "exit_half_width": 380.0,
    "exit_overhang": 30,
    "mounts": [
        {"name": "DIFF_MOUNT_R", "frame_node": "RB_LWR_R", "local_y": 80, "local_x": -20},
        {"name": "DIFF_MOUNT_L", "frame_node": "RB_LWR_L", "local_y": -80, "local_x": -20},
    ],
    "color": "#20242a",
    "opacity": 1.0
}

# ============================================================
# CABIN / FURNITURE — schematic part placement (non-kinematic)
# ============================================================

CABIN = {
    "steering_wheel": {"center": [-430.0, 0.0, 560.0], "radius": 140.0, "rim_thickness": 25.0},
    "seat": {"base": [-620.0, 0.0, 45.0], "width": 380.0, "back_height": 500.0, "back_angle_deg": 30.0},
    "headrest": {"center": [-730.0, 0.0, 950.0], "width": 260.0, "height": 220.0},
    "engine": {"center": [-1150.0, 0.0, 330.0], "size": [500.0, 380.0, 320.0]},
    "restrictor": {"center": [-1280.0, 0.0, 560.0], "diameter": 20.0, "throat_length": 60.0},
    "exhaust": {"port_center": [-1240.0, 150.0, 380.0], "pipe_diameter": 45.0},
    "firewall": {"x": -750.0},
}

# Chassis points are fixed (don't move during kinematics)
CHASSIS_KEYS = {"CH1", "CH2", "CH3", "CH4", "CH5"}

# Upright points move as a rigid body
UPRIGHT_KEYS = {"UP1", "UP2", "UP3", "UP4", "UP5"}

# Float points have their own constraints
FLOAT_KEYS = {"FL1"}

# ============================================================
# Vehicle parameters (inputs to attitude/dynamics/load metrics)
# ============================================================
VEHICLE_PARAMS = {
    "mass_kg": 280.0,
    "front_axle_frac": 0.50,
    "rear_axle_frac": 0.50,
    "cg_height_mm": 300.0,
    "wheelbase_mm": 1550.0,        # true scale (was 900.0)
    "front_track_mm": 1220.0,      # true scale (was 840.0)
    "rear_track_mm": 1180.0,       # true scale (was 690.0)
    # Springs chosen for ride freq ~2.3/2.7 Hz at mr_f/mr_r = 0.7/0.6 (analyze defaults),
    # 60kg sprung mass per corner: k_wheel = k × mr² ≈ 12.7/16.9 N/mm
    "k_spring_f": 26.0,            # N/mm
    "k_spring_r": 47.0,            # N/mm
    # c = ζ × 2√(k_wheel·m) / mr² at ζ=0.7 per corner
    "c_damper_f": 2500.0,          # N·s/m
    "c_damper_r": 3900.0,          # N·s/m
    # ARB sized for roll gradient ~1.0 deg/g with true track (≈350-380 N·m/deg)
    "k_arb_f": 2.0e7,              # N·mm/rad
    "k_arb_r": 2.2e7,              # N·mm/rad
    "ax_brake": 1.2,               # g
    "ax_accel": 1.0,               # g
    "ay_corner": 1.3,              # g
    "unsprung_kg": 20.0,
}
