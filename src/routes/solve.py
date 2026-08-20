"""Solve / sweep / optimize endpoints."""


import numpy as np
from fastapi import APIRouter, HTTPException

from api_models import (
    OptimizeFL1Request,
    SolveRequest,
    SweepRequest,
)
from config import (
    CHASSIS_KEYS,
    DEFAULT_FRAME_NODES,
    REAR_PREFIX,
)
from geometry import dist
from hardpoints import (
    DEFAULT_HARDPOINTS,
    DEFAULT_REAR_HARDPOINTS,
    add_prefix,
    mirror_left,
    strip_prefix,
)
from solver.angles import compute_alignment_angles
from solver.bump import solve_bump
from solver.rocker import compute_rocker_kinematics
from solver.steering import solve_steering
from tire import _upright_y_axis, compute_contact_patch

router = APIRouter()

# Sweep curve keys (module-level constants, reused per call)
SWEEP_ANGLE_KEYS = ["camber_deg", "toe_deg", "caster_deg",
                    "kpi_deg", "scrub_radius_mm", "caster_trail_mm"]
SWEEP_ROCKER_KEYS = ["rocker_angle_deg", "damper_travel", "motion_ratio"]


try:
    from scipy.optimize import minimize
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


# ============================================================
# Helpers
# ============================================================

def _merge_chassis(result, hp):
    """Merge chassis points (CH1-CH5) and global params from hardpoints into solver result."""
    merged = dict(result)
    for key in CHASSIS_KEYS:
        if key in hp:
            merged[key] = hp[key]
    for key in ["track_width", "tire_radius", "tire_width",
                "tire_spring_rate", "corner_weight_n"]:
        if key in hp:
            merged[key] = hp[key]
    return merged


def _rear_rocker_frame_nodes():
    """Build rear-specific frame nodes for rocker kinematics."""
    return {
        'RK_PIVOT_R': DEFAULT_FRAME_NODES.get('R_RK_PIVOT_R', [0, 0, 0]),
        'RK_DAMPER_R': DEFAULT_FRAME_NODES.get('R_RK_DAMPER_R', [0, 0, 0]),
        'DAMPER_CHASSIS_FR': DEFAULT_FRAME_NODES.get('R_DAMPER_CHASSIS_RR', [0, 0, 0]),
    }


def _solve_axle(hp_right, wheel_travel, rack_displacement, mirror,
                frame_nodes=None, polish=False, theta_guess=0.0,
                skip_steering=False, prev_up=None):
    """Solve one axle (front or rear). Returns {right, left?, angles_right, ...}.

    prev_up: optional (UP1, UP2) tuple from the previous sweep step's bump
    solution. Passed to solve_bump to warm-start the LS polish and keep
    the solver on the same physical branch across the sweep (prevents
    the 0.3°-2.5° branch-jump discontinuities seen at boundary travel
    values like -15.5mm).
    """
    if frame_nodes is None:
        frame_nodes = DEFAULT_FRAME_NODES

    L_tr_design = float(dist(np.array(hp_right["UP3"]), np.array(hp_right["FL1"])))

    # Step 1: Pure bump (pass prev_up for branch continuation in sweeps)
    result_right = solve_bump(hp_right, wheel_travel, polish=polish, prev_up=prev_up)
    # 在转向求解前捕获 bump 几何残差（steering 结果不携带该字段）
    bump_res = float(result_right.get("max_residual", 0.0))

    # Step 2: Merge chassis points
    merged_right = _merge_chassis(result_right, hp_right)

    # Step 3: Steering solver
    if skip_steering:
        result_right = merged_right
    else:
        result_right = solve_steering(merged_right, rack_displacement,
                                      tie_rod_length=L_tr_design, theta_guess=theta_guess)

    result_right_final = _merge_chassis(result_right, hp_right)
    angles_right = compute_alignment_angles(result_right_final, hp=hp_right)

    cp_right = compute_contact_patch(
        result_right_final["UP5"],
        _upright_y_axis(result_right_final),
        hp_right,
    )

    rocker_right = compute_rocker_kinematics(hp_right, result_right_final, frame_nodes)

    # P2-1 诚实几何残差：bump 残差与横拉杆长度残差的最大值（不伪造 0）。
    tie_res = abs(float(dist(np.asarray(result_right_final["UP3"], dtype=float),
                             np.asarray(result_right_final["FL1"], dtype=float)))
                  - L_tr_design)

    resp = {
        "right": result_right_final,
        "angles_right": angles_right,
        "contact_patch_right": cp_right,
        "steering_theta": result_right.get("steering_theta", 0.0),
        "geometry_residual_mm": round(max(bump_res, tie_res), 6),
    }
    if rocker_right:
        resp["rocker_right"] = rocker_right

    if mirror:
        hp_left = mirror_left(hp_right)
        L_tr_design_left = float(dist(np.array(hp_left["UP3"]), np.array(hp_left["FL1"])))
        result_left = solve_bump(hp_left, wheel_travel, polish=polish)
        bump_res_left = float(result_left.get("max_residual", 0.0))
        merged_left = _merge_chassis(result_left, hp_left)
        result_left = solve_steering(merged_left, rack_displacement,
                                     tie_rod_length=L_tr_design_left, theta_guess=theta_guess)
        result_left_final = _merge_chassis(result_left, hp_left)
        # compute_alignment_angles auto-detects the left side from UP5[1]
        # and returns vehicle-global conventions directly (P2-0: no sign flip).
        angles_left = compute_alignment_angles(result_left_final, hp=hp_left)
        cp_left = compute_contact_patch(
            result_left_final["UP5"],
            _upright_y_axis(result_left_final),
            hp_left,
        )
        tie_res_left = abs(float(dist(np.asarray(result_left_final["UP3"], dtype=float),
                                      np.asarray(result_left_final["FL1"], dtype=float)))
                           - L_tr_design_left)
        resp["left"] = result_left_final
        resp["angles_left"] = angles_left
        resp["contact_patch_left"] = cp_left
        resp["geometry_residual_left_mm"] = round(max(bump_res_left, tie_res_left), 6)

        frame_nodes_left = mirror_left(frame_nodes)
        rocker_left = compute_rocker_kinematics(hp_left, result_left_final, frame_nodes_left)
        if rocker_left:
            resp["rocker_left"] = rocker_left

    return resp


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/api/solve")
async def solve(req: SolveRequest):
    """Solve kinematics for front and rear axles."""
    fR = req.front_travel
    fL = req.front_left_travel if req.front_left_travel is not None else req.front_travel
    rR = req.rear_travel
    rL = req.rear_left_travel if req.rear_left_travel is not None else req.rear_travel
    rack = req.rack_displacement

    fr = _solve_axle(dict(req.front_hardpoints), fR, rack, mirror=False)
    if abs(fL - fR) > 1e-6:
        fl = _solve_axle(dict(req.front_hardpoints), fL, rack, mirror=True)
    else:
        fl = _solve_axle(dict(req.front_hardpoints), fR, rack, mirror=True)

    front = {
        "right": fr.get("right", {}),
        "left": fl.get("left", {}),
        "angles_right": fr["angles_right"],
        "angles_left": fl["angles_left"],
        "contact_patch_right": fr.get("contact_patch_right"),
        "contact_patch_left": fl.get("contact_patch_left"),
        "steering_theta": fr.get("steering_theta", 0.0),
    }
    for k in ["rocker_right", "rocker_left"]:
        if k in fr:
            front[k] = fr[k]
        if k in fl:
            front[k] = fl[k]

    # Rear axle
    rear_hp = strip_prefix(dict(req.rear_hardpoints), REAR_PREFIX)
    rear_frame_nodes = _rear_rocker_frame_nodes()

    rr = _solve_axle(rear_hp, rR, 0.0, mirror=False, frame_nodes=rear_frame_nodes)
    if abs(rL - rR) > 1e-6:
        rl = _solve_axle(rear_hp, rL, 0.0, mirror=True, frame_nodes=rear_frame_nodes)
    else:
        rl = _solve_axle(rear_hp, rR, 0.0, mirror=True, frame_nodes=rear_frame_nodes)

    rear = {"right": {}, "left": {}}
    for side_key in ["right", "left"]:
        if side_key in rr:
            rear[side_key] = add_prefix(rr[side_key], REAR_PREFIX)
    if "left" in rl:
        rear["left"] = add_prefix(rl["left"], REAR_PREFIX)
    rear["angles_right"] = rr["angles_right"]
    rear["angles_left"] = rl["angles_left"]
    rear["contact_patch_right"] = rr.get("contact_patch_right")
    rear["contact_patch_left"] = rl.get("contact_patch_left")
    for k in ["rocker_right", "rocker_left"]:
        if k in rr:
            rear[k] = rr[k]
        if k in rl:
            rear[k] = rl[k]

    return {"front": front, "rear": rear}


# ============================================================
# Branch-jump post-processor
# ============================================================

def _remove_branch_jumps(curve_dict, travel_values):
    """Detect and smooth residual branch-jump discontinuities in sweep curves.

    Uses a local-median deviation detector with multi-pass: a narrow window
    catches isolated spikes first, then a wider window catches adjacent-jump
    clusters that the first pass missed.

    Edge points (within `window` of either end) are not checked, preventing
    false positives on smooth ramps.

    Curves with < 3 points or containing None are skipped.
    """
    angle_keys = [k for k, v in curve_dict.items()
                  if isinstance(v, list) and len(v) >= 3
                  and all(x is not None for x in v)]

    for key in angle_keys:
        ys = list(curve_dict[key])
        n = len(ys)
        if n < 3:
            continue

        # Wide pass first catches multi-point ramps (a run of consecutive
        # wrong values that narrow windows miss — the median stays pulled
        # toward the ramp), then narrow passes catch isolated spikes.
        for win in [4, 1, 2]:
            jumps = _detect_jumps(ys, win)
            if not jumps:
                continue
            ys = _replace_jumps(ys, jumps)

        curve_dict[key] = [round(y, 6) for y in ys]


def _detect_jumps(ys, window):
    """Return set of indices flagged as branch jumps.

    Only checks points that have at least `window` neighbours on each side.
    Flagged if |y_i - local_median| > 0.3°.
    """
    n = len(ys)
    jumps = set()
    for i in range(window, n - window):
        neighbours = []
        for j in range(i - window, i + window + 1):
            if j != i:
                neighbours.append(ys[j])
        neighbours.sort()
        m = len(neighbours)
        if m < 2:
            continue
        median = neighbours[m // 2] if m % 2 else (neighbours[m // 2 - 1] + neighbours[m // 2]) / 2.0
        if abs(ys[i] - median) > 0.3:
            jumps.add(i)
    return jumps


def _replace_jumps(ys, jumps):
    """Replace jump indices with linear interpolation from nearest valid neighbours."""
    n = len(ys)
    result = list(ys)
    for i in sorted(jumps):
        left_idx = i - 1
        while left_idx >= 0 and left_idx in jumps:
            left_idx -= 1
        right_idx = i + 1
        while right_idx < n and right_idx in jumps:
            right_idx += 1

        if left_idx >= 0 and right_idx < n:
            frac = (i - left_idx) / (right_idx - left_idx)
            result[i] = result[left_idx] + frac * (result[right_idx] - result[left_idx])
        elif left_idx >= 0:
            result[i] = result[left_idx]
        elif right_idx < n:
            result[i] = result[right_idx]
    return result


@router.post("/api/sweep")
async def sweep(req: SweepRequest):
    """Sweep wheel travel range and return kinematics curves for both axles."""
    travel_values = np.linspace(req.start, req.end, req.steps).tolist()

    def sweep_axle(hp, travel_vals, rack, frame_nodes=None):
        n = len(travel_vals)
        results = {k: [None] * n for k in SWEEP_ANGLE_KEYS}
        pure_results = {k: [None] * n for k in SWEEP_ANGLE_KEYS}
        rocker_curves = {k: [None] * n for k in SWEEP_ROCKER_KEYS}
        prev_theta = 0.0
        prev_damper = None
        prev_t = None
        prev_up = None

        # Bidirectional continuation: solve from the point nearest dz=0
        # outward. Near 0 the PBD result is exact, so the LS warm-start
        # chain stays on the correct physical branch in both directions.
        order = sorted(range(n), key=lambda i: abs(float(travel_vals[i])))
        for idx in order:
            t = float(travel_vals[idx])
            axle = _solve_axle(dict(hp), t, rack, mirror=False,
                               frame_nodes=frame_nodes, polish=True,
                               theta_guess=prev_theta, prev_up=prev_up)
            prev_theta = axle.get("steering_theta", 0.0)
            angles = axle["angles_right"]
            for k in SWEEP_ANGLE_KEYS:
                results[k][idx] = round(angles.get(k, 0.0), 6)

            axle_bump = _solve_axle(dict(hp), t, 0.0, mirror=False,
                                    frame_nodes=frame_nodes, polish=True,
                                    skip_steering=True, prev_up=prev_up)
            angles_bump = axle_bump["angles_right"]
            for k in SWEEP_ANGLE_KEYS:
                pure_results[k][idx] = round(angles_bump.get(k, 0.0), 6)
            prev_up = (axle_bump["right"]["UP1"], axle_bump["right"]["UP2"])

            rocker = axle.get("rocker_right")
            if rocker:
                rocker_curves["rocker_angle_deg"][idx] = rocker["rocker_angle_deg"]
                rocker_curves["damper_travel"][idx] = rocker["damper_travel"]
                if prev_damper is not None:
                    dt = t - prev_t
                    dd = rocker["damper_travel"] - prev_damper
                    rocker_curves["motion_ratio"][idx] = (
                        round(dd / dt, 4) if abs(dt) > 1e-6 else None)
                prev_damper = rocker["damper_travel"]
                prev_t = t

        results.update(rocker_curves)
        results["pure_bump"] = pure_results
        _remove_branch_jumps(results, travel_vals)
        _remove_branch_jumps(pure_results, travel_vals)
        return results

    front_data = sweep_axle(req.front_hardpoints, travel_values, req.rack_displacement,
                            frame_nodes=DEFAULT_FRAME_NODES)
    rear_hp = strip_prefix(dict(req.rear_hardpoints), REAR_PREFIX)
    rear_frame_nodes = _rear_rocker_frame_nodes()
    rear_data = sweep_axle(rear_hp, travel_values, 0.0, frame_nodes=rear_frame_nodes)

    return {
        "travel": [round(v, 1) for v in travel_values],
        "front": front_data,
        "rear": rear_data,
    }


# ============================================================
# FL1 OPTIMIZER
# ============================================================

def _evaluate_bump_steer(hp, fl1_candidate, travel_vals, rack=0.0):
    """Evaluate total toe change (bump steer) for a given FL1 position."""
    hp_test = dict(hp)
    hp_test["FL1"] = list(fl1_candidate)
    L_tr = float(np.linalg.norm(np.array(hp_test["UP3"]) - fl1_candidate))

    toe_vals = []
    prev_theta = 0.0
    for t in travel_vals:
        bump_result = solve_bump(hp_test, float(t), polish=False)
        merged = _merge_chassis(bump_result, hp_test)
        steer_result = solve_steering(merged, rack, tie_rod_length=L_tr, theta_guess=prev_theta)
        prev_theta = steer_result.get("steering_theta", 0.0)
        final = _merge_chassis(steer_result, hp_test)
        angles = compute_alignment_angles(final, hp=hp_test)
        toe_vals.append(angles.get("toe_deg", 0.0))

    toe_arr = np.array(toe_vals)
    return float(np.sum(toe_arr ** 2)), toe_vals


@router.post("/api/optimize_fl1")
async def optimize_fl1(req: OptimizeFL1Request):
    """Find optimal FL1 (tie-rod inner point) position to minimize bump steer."""
    if not HAS_SCIPY:
        raise HTTPException(status_code=500, detail="scipy not available")

    if req.axle == "front":
        hp = dict(DEFAULT_HARDPOINTS)
    elif req.axle == "rear":
        hp = strip_prefix(dict(DEFAULT_REAR_HARDPOINTS), REAR_PREFIX)
    else:
        raise HTTPException(status_code=400, detail="axle must be 'front' or 'rear'")

    current_fl1 = np.array(hp["FL1"])
    travel_vals = np.linspace(req.travel_start, req.travel_end, req.travel_steps).tolist()

    y_margin = 80.0
    z_margin = 80.0
    bounds = [
        (current_fl1[0] - 5, current_fl1[0] + 5),
        (current_fl1[1] - y_margin, current_fl1[1] + y_margin),
        (current_fl1[2] - z_margin, current_fl1[2] + z_margin),
    ]

    current_score, current_toe = _evaluate_bump_steer(hp, current_fl1, travel_vals)

    best_result = None
    best_score = float('inf')

    def objective(x):
        nonlocal best_result, best_score
        fl1 = np.array(x)
        score, _ = _evaluate_bump_steer(hp, fl1, travel_vals)
        if score < best_score:
            best_score = score
            best_result = fl1.copy()
        return score

    starts = [current_fl1.tolist()]
    for dy in [-40, -20, 0, 20, 40]:
        for dz in [-40, -20, 0, 20, 40]:
            if dy == 0 and dz == 0:
                continue
            starts.append([current_fl1[0], current_fl1[1] + dy, current_fl1[2] + dz])

    for x0 in starts:
        try:
            minimize(objective, x0, method='L-BFGS-B', bounds=bounds,
                     options={'maxiter': 100, 'ftol': 1e-10})
        except Exception:
            continue

    if best_result is None:
        raise HTTPException(status_code=500, detail="Optimization failed")

    opt_score, opt_toe = _evaluate_bump_steer(hp, best_result, travel_vals)

    current_toe_range = max(current_toe) - min(current_toe)
    opt_toe_range = max(opt_toe) - min(opt_toe)

    return {
        "axle": req.axle,
        "current_fl1": current_fl1.tolist(),
        "optimized_fl1": best_result.tolist(),
        "delta_mm": (best_result - current_fl1).tolist(),
        "current_toe_range_deg": round(current_toe_range, 4),
        "optimized_toe_range_deg": round(opt_toe_range, 4),
        "improvement_pct": round((1 - opt_toe_range / max(current_toe_range, 1e-9)) * 100, 1),
        "current_toe_curve": [round(v, 4) for v in current_toe],
        "optimized_toe_curve": [round(v, 4) for v in opt_toe],
        "travel": [round(v, 1) for v in travel_vals],
    }


