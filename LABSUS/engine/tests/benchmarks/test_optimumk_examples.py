"""OptimumKinematics 对照基准 —— 结构化脚手架（P4，2026-08-22 升级）。

事实基线（一手验证）：
- 来源 ref/OptimumKinematics - Help File.pdf（92 页，pypdf 全文抽取核对）是
  用户手册，**不含双叉臂示例硬点表/期望输出数据集** → 无法录入真实
  OptimumK 数值对照；诚实占位，禁止伪造。
- 本脚手架转而提供：目标行格式 + 当前引擎参考值固化（PRO 基线），
  使未来拿到 OptimumK 数据时可一行式替换 expected 成为黄金测试。

OptimumK 行格式（录入目标，一行 = 一个工况点）：
    {"corner": "fr", "travel_mm": 0.0, "rack_mm": 0.0,
     "camber_deg": ..., "toe_deg": ..., "kpi_deg": ...,
     "caster_deg": ..., "scrub_mm": ..., "trail_mm": ..., "source": "..."}
"""
import numpy as np

from src.api.v3service import (pose_metrics, DesignSpec, DEFAULT_DWB_POINTS,
                               to_engine_points)
from src.solver.mechanism.models import build_mechanism
from src.solver.mechanism.solver import solve_pose

# 引擎当前参考值（PRO 基线，pytest 固化；OptimumK 录入后改填 expected）
REFERENCE = {
    "travel_mm": 0.0, "rack_mm": 0.0,
    "camber_deg": -1.2, "toe_deg": 0.05,
    "kpi_deg": 10.7389, "caster_deg": 4.9271,
    "scrub_mm": 54.5784, "trail_mm": 24.6431,
    "rc_h_mm": 55.2583,
}


def _pro_reference() -> dict:
    eng = to_engine_points(DEFAULT_DWB_POINTS)
    m = build_mechanism(eng, steer_axis=np.array([-1.0, 0.0, 0.0]),
                        rocker_axis=(np.asarray(DEFAULT_DWB_POINTS["RCK_AX_B"], float)
                                     - np.asarray(DEFAULT_DWB_POINTS["RCK_AX_A"], float)))
    solve_pose(m, 0.0, 0.0)
    mm = pose_metrics(m, 325.0, DesignSpec())
    return {
        "travel_mm": 0.0, "rack_mm": 0.0,
        "camber_deg": round(float(mm["cam"]), 4),
        "toe_deg": round(float(mm["toe"]), 4),
        "kpi_deg": round(float(mm["kpi"]), 4),
        "caster_deg": round(float(mm["cast"]), 4),
        "scrub_mm": round(float(mm["scrub"]), 4),
        "trail_mm": round(float(mm["trail"]), 4),
        "rc_h_mm": round(float(mm["rc_h"]), 4),
    }


def test_pro_baseline_reference_pinned():
    """引擎自身参考值固化（OptimumK 录入前的内部黄金）。"""
    got = _pro_reference()
    for k, v in REFERENCE.items():
        assert abs(got[k] - v) < 1e-3, (k, got[k], v)


# ── OptimumK 录入点（未来替换体）──────────────────────────────────────
OPTIMUMK_ROWS: list[dict] = []
# 例：
# OPTIMUMK_ROWS.append({
#     "corner": "fr", "travel_mm": 0.0, "rack_mm": 0.0,
#     "camber_deg": ..., "toe_deg": ..., "kpi_deg": ...,
#     "caster_deg": ..., "scrub_mm": ..., "trail_mm": ...,
#     "source": "ref/OptimumKinematics - Help File.pdf <章节>",
# })


def test_optimumk_rows_match_engine():
    """OptimumK 数据录入后逐行对拍（当前为空列表 → 占位通过）。"""
    if not OPTIMUMK_ROWS:
        return
    for row in OPTIMUMK_ROWS:
        eng = to_engine_points(DEFAULT_DWB_POINTS)
        m = build_mechanism(eng, steer_axis=np.array([-1.0, 0.0, 0.0]))
        solve_pose(m, row["travel_mm"], row["rack_mm"])
        mm = pose_metrics(m, 325.0, DesignSpec())
        assert abs(mm["cam"] - row["camber_deg"]) < 0.05, row
        assert abs(mm["toe"] - row["toe_deg"]) < 0.05, row
