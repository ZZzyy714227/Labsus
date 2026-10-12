"""OptimumKinematics 对照基准 —— 结构化脚手架（P4，2026-08-22 升级）。

事实基线（一手验证）：
- 来源 `ref/OptimumKinematics - Help File.pdf`（92 页，pypdf 全文抽取核对）是
  用户手册，**不含双叉臂示例硬点表/期望输出数据集** → 无法录入真实
  OptimumK 数值对照；诚实占位，禁止伪造。
- ⚠️ `ref/` 被根 `.gitignore` 整目录排除 ⇒ **克隆者拿不到该 PDF**，本基准也
  无法在别的机器上重跑。M5（2026-09-20）因此把空占位测试从"静默通过"改为
  **显式 skip**（此前是假绿：`OPTIMUMK_ROWS=[]` 直接 return，看起来测试通过
  却零信息）。
- 本脚手架转而提供：目标行格式 + 当前引擎参考值固化（PRO 基线），
  使未来拿到 OptimumK 数据时可一行式替换 expected 成为黄金测试。

启用方法：把 OptimumK 数据按下面格式填进 `OPTIMUMK_ROWS`（或做同格式
JSON 侧车文件），测试自动从 skip 转为逐行对拍。

OptimumK 行格式（录入目标，一行 = 一个工况点）：
    {"corner": "fr", "travel_mm": 0.0, "rack_mm": 0.0,
     "camber_deg": ..., "toe_deg": ..., "kpi_deg": ...,
     "caster_deg": ..., "scrub_mm": ..., "trail_mm": ..., "source": "..."}
"""
import numpy as np
import pytest

from src.api.v3service import (
    DEFAULT_DWB_POINTS,
    DesignSpec,
    pose_metrics,
    to_engine_points,
)
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
    """**特征化回归锚**：把 v3 定位角管线在 PRO 基线硬点下的输出钉成常量。

    作用不是"证明数值对"（那是 §对拍与解析锚的活），而是**防止无意漂移**：
    任何改动只要动了 v3 定位角数值，这里就会红，逼迫改动者解释差异。
    数值本身来自 `_pro_reference()`（引擎自身），属刻意自证。
    """
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
    """OptimumK 数据录入后逐行对拍；未录入时**显式 skip**（不再假绿）。"""
    if not OPTIMUMK_ROWS:
        pytest.skip("OptimumK 示例数据未录入（源 PDF 在 ref/，且不含硬点表）；"
                    "录入 OPTIMUMK_ROWS 后本测试自动启用")
    for row in OPTIMUMK_ROWS:
        eng = to_engine_points(DEFAULT_DWB_POINTS)
        m = build_mechanism(eng, steer_axis=np.array([-1.0, 0.0, 0.0]))
        solve_pose(m, row["travel_mm"], row["rack_mm"])
        mm = pose_metrics(m, 325.0, DesignSpec())
        assert abs(mm["cam"] - row["camber_deg"]) < 0.05, row
        assert abs(mm["toe"] - row["toe_deg"]) < 0.05, row
