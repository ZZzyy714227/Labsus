"""P3-2 轮边受力 — 转向节 FBD（二力杆 + 球铰三向反力 + 当前轮边几何 + 当前轮胎三向力）。

重写自旧的 3-link 平衡（无横拉杆/无力矩项/无支杆前后分离/无球头反力）。
新模型（设计文档 §8、进展文档 P3 轮边层）：

未知量（6 个二力杆轴向力，张拉为正）：
  f1 UCA 前支杆 (CH1→UP1)   f2 UCA 后支杆 (CH2→UP1)
  f3 LCA 前支杆 (CH3→UP2)   f4 LCA 后支杆 (CH4→UP2)
  f5 推杆      (CH5→UP4)    f6 横拉杆    (FL1→UP3)

6×6 线性系统（转向节力平衡 3 + 绕轮心 UP5 力矩平衡 3）：
  A = [d1 d2 d3 d4 d5 d6 ; r1×d1 r1×d2 r2×d3 r2×d4 r4×d5 r3×d6]
  b = [F_tire − F_drop ; r_cp×F_tire − r2×F_drop]
  r_i = UP_i − UP5（力臂），F_drop = ARB 连杆对 LCA 的垂向力。

输出：支杆轴向力、推杆/横拉杆/防倾杆连杆力、上下球头三向反力、
摆臂内侧支点反力、转向节合力/力矩残差、奇异性报告（rank<6 → SOLVER_FAILED）。

球头反力：F_ubj = −(f1 d1 + f2 d2)；F_lbj = −(f3 d3 + f4 d4 + F_drop)。
"""
from __future__ import annotations

import math

import numpy as np


def _dir(a, b):
    """单位方向：从 a 指向 b（outboard）。退化时返回零向量。"""
    v = np.asarray(b, dtype=float) - np.asarray(a, dtype=float)
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else np.zeros(3)


def arb_droplink_force(k_arb_n_mm_per_rad: float, roll_deg: float,
                       track_mm: float, right_side: bool) -> np.ndarray:
    """ARB 连杆对 LCA 的垂向力（N，Z 向上）。

    F_mag = k_arb·|φ| / 轮距（连杆分离距 ≈ 轮距）。
    车身右倾（φ>0，右侧压缩）时：右侧连杆下压（−Z，增载），左侧上抬（+Z）。
    返回作用于右侧（right_side=True）或左侧 LCA 的力向量。
    """
    phi = math.radians(float(roll_deg))
    if track_mm <= 1e-9 or k_arb_n_mm_per_rad <= 0:
        return np.zeros(3)
    mag = abs(k_arb_n_mm_per_rad) * abs(phi) / track_mm
    sign = math.copysign(1.0, phi)
    z = -sign * mag if right_side else sign * mag
    return np.array([0.0, 0.0, z], dtype=float)


def solve_upright_forces(hp: dict, result: dict, f_tire: np.ndarray,
                         f_drop: np.ndarray | None = None,
                         contact_patch: list | None = None) -> dict:
    """转向节静力平衡：6 个二力杆轴向力 + 球头反力 + 支点反力 + 残差 + 奇异性。

    hp/result 提供 CH1-CH5/UP1-UP5/FL1 当前坐标；f_tire 为轮胎三向力（作用于转向节）；
    f_drop 为 ARB 连杆对 LCA 的垂向力（无则 None）；contact_patch 为接地中心 [x,y,z]
    （缺省用轮心正下方）。status ∈ VALID / APPROXIMATE / SOLVER_FAILED。
    """
    if f_drop is None:
        f_drop = np.zeros(3)

    pts = {k: np.asarray(result[k], dtype=float) for k in
           ("UP1", "UP2", "UP3", "UP4", "UP5")}
    chs = {k: np.asarray(hp[k], dtype=float) for k in
           ("CH1", "CH2", "CH3", "CH4", "CH5")}
    fl1 = np.asarray(result.get("FL1", hp.get("FL1")), dtype=float)

    d1 = _dir(chs["CH1"], pts["UP1"])   # UCA 前
    d2 = _dir(chs["CH2"], pts["UP1"])   # UCA 后
    d3 = _dir(chs["CH3"], pts["UP2"])   # LCA 前
    d4 = _dir(chs["CH4"], pts["UP2"])   # LCA 后
    d5 = _dir(chs["CH5"], pts["UP4"])   # 推杆
    d6 = _dir(fl1, pts["UP3"])          # 横拉杆（FL1→UP3）
    if any(np.linalg.norm(d) < 1e-12 for d in (d1, d2, d3, d4, d5, d6)):
        return {"status": "SOLVER_FAILED", "explanation": "存在退化支杆方向（零长度）",
                "rank_deficient": True, "member_forces": None,
                "ball_joints": None, "chassis_reactions": None,
                "force_residual_n": None, "moment_residual_nmm": None}

    UP5 = pts["UP5"]
    r1 = pts["UP1"] - UP5
    r2 = pts["UP2"] - UP5
    r3 = pts["UP3"] - UP5
    r4 = pts["UP4"] - UP5
    # 接地点：优先用接触中心，否则轮心正下方
    if contact_patch is not None:
        cp = np.asarray(contact_patch, dtype=float)[:3]
    else:
        cp = np.array([UP5[0], UP5[1], 0.0])
    r_cp = cp - UP5

    f_tire = np.asarray(f_tire, dtype=float).reshape(3)

    # 6×6 系统
    cols = []
    for d, r in ((d1, r1), (d2, r1), (d3, r2), (d4, r2), (d5, r4), (d6, r3)):
        cols.append(np.concatenate([d, np.cross(r, d)]))
    A = np.column_stack(cols)
    b = np.concatenate([f_tire - f_drop,
                        np.cross(r_cp, f_tire) - np.cross(r2, f_drop)])

    rank = int(np.linalg.matrix_rank(A))
    if rank < 6:
        return {"status": "SOLVER_FAILED",
                "explanation": f"刚度矩阵秩亏 rank={rank}<6（二力杆共面/退化）",
                "rank_deficient": True, "member_forces": None,
                "ball_joints": None, "chassis_reactions": None,
                "force_residual_n": None, "moment_residual_nmm": None}

    try:
        f = np.linalg.solve(A, b)
    except np.linalg.LinAlgError as exc:
        return {"status": "SOLVER_FAILED", "explanation": f"求解失败：{exc}",
                "rank_deficient": False, "member_forces": None,
                "ball_joints": None, "chassis_reactions": None,
                "force_residual_n": None, "moment_residual_nmm": None}

    f1, f2, f3, f4, f5, f6 = (float(v) for v in f)

    # 球头反力（力作用于转向节）
    f_ubj = -(f1 * d1 + f2 * d2)
    f_lbj = -(f3 * d3 + f4 * d4 + f_drop)

    # 摆臂内侧支点反力（力作用于摆臂/支杆，= −f_i·d_i）
    reactions = {
        "ch1": (-(f1 * d1)).tolist(), "ch2": (-(f2 * d2)).tolist(),
        "ch3": (-(f3 * d3)).tolist(), "ch4": (-(f4 * d4)).tolist(),
        "ch5": (-(f5 * d5)).tolist(), "fl1": (-(f6 * d6)).tolist(),
    }

    # 残差：转向节力/力矩平衡的数值残差（应≈0，受条件数限制）
    force_res = f_tire + f_ubj + f_lbj - f6 * d6 - f5 * d5
    moment_res = (np.cross(r_cp, f_tire) + np.cross(r1, f_ubj)
                  + np.cross(r2, f_lbj) + np.cross(r3, -f6 * d6)
                  + np.cross(r4, -f5 * d5))
    cond = float(np.linalg.cond(A))
    status = "VALID" if cond < 1e6 else "APPROXIMATE"

    return {
        "status": status,
        "explanation": "upright 6-DOF two-force-member balance",
        "rank_deficient": False,
        "condition_number": round(cond, 1),
        "member_forces": {
            "uca_front_n": round(f1, 3), "uca_rear_n": round(f2, 3),
            "lca_front_n": round(f3, 3), "lca_rear_n": round(f4, 3),
            "pushrod_n": round(f5, 3), "tie_rod_n": round(f6, 3),
        },
        "arb_droplink_n": round(float(np.linalg.norm(f_drop)), 3),
        "ball_joints": {
            "ubj": [round(float(v), 3) for v in f_ubj],
            "lbj": [round(float(v), 3) for v in f_lbj],
        },
        "chassis_reactions": reactions,
        "force_residual_n": round(float(np.linalg.norm(force_res)), 6),
        "moment_residual_nmm": round(float(np.linalg.norm(moment_res)), 6),
    }


def max_abs(forces: dict | None) -> float:
    """兼容辅助：取支杆力最大绝对值（N）；forces 为 None 时返回 inf。"""
    if not forces or forces.get("member_forces") is None:
        return float("inf")
    return max(abs(v) for v in forces["member_forces"].values())


# ---- 兼容包装（旧 analyze 路径过渡用，P4 迁移后移除） ----
def tire_force(static_load_n: float, ax_g: float, ay_g: float):
    """旧签名：F_x=ax·Fz, F_y=ay·Fz（纯制动/纯侧倾情形）。"""
    fz = float(static_load_n)
    return np.array([fz * ax_g, fz * ay_g, fz], dtype=float)


def solve_link_forces(hp, result, f_tire):
    """旧签名 → 新模型。返回含 member_forces 的结构（兼容 max_abs）。"""
    return solve_upright_forces(hp, result, np.asarray(f_tire, dtype=float))
