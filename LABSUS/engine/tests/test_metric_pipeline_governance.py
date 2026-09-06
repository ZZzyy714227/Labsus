"""P3 指标管线治理守卫（r2 发现 D 落地）。

实测（2026-08-22）：solver/angles.py 与 api/v3service.pose_metrics 分属
**两个坐标系代**：
- angles.py：V1 车辆全局系（X=前向 / Y=右 / Z=上），P2-0 符号约定；
  将 v3 DWB 系（X=外侧 / Y=前向）机构坐标喂入会得到视角废值
  （实测 cam -10.8° / toe +88.2° / kpi ±175°）。
- pose_metrics：v3/前端同款数学（Kabsch 姿态估计 + 侧别泛化），
  /api/v3 全部端点的唯一指标来源。

治理规则：v3 系指标只允许走 pose_metrics；angles.py 仅服务 legacy/S1-gate
测试的旧坐标管道（其 KEY 名 camber_deg/toe_deg/kpi_deg/caster_deg 不同）。
本文件守卫：
1. v3 指标与 legacy 管线输出**必须显著不同**（防止有人把 v3 悄悄切回
   angles.py —— 若二者意外相等则说明坐标系合并发生，需要重新审视）；
2. v3 管线黄金值保持（与 test_mirror_symmetry 交叉承担）。
"""
import numpy as np

from src.solver.mechanism.models import build_mechanism
from src.solver.mechanism.pose import solve_to_angles
from src.solver.mechanism.solver import solve_pose
from src.api.v3service import (pose_metrics, DesignSpec, DEFAULT_DWB_POINTS,
                               to_engine_points)

_PT = DEFAULT_DWB_POINTS


def _legacy_and_v3(travel: float):
    eng = to_engine_points(_PT)
    m = build_mechanism(eng, steer_axis=np.array([-1.0, 0.0, 0.0]),
                        rocker_axis=(np.asarray(_PT["RCK_AX_B"], float)
                                     - np.asarray(_PT["RCK_AX_A"], float)))
    solve_pose(m, travel, 0.0)
    a = solve_to_angles(m, travel, 0.0, hp=_PT)
    mm = pose_metrics(m, 325.0, DesignSpec())
    return a, mm


def test_legacy_pipeline_not_equal_v3_markers():
    """坐标系代差的显式守卫：legacy 输出必须是'废值形态'（≠ v3）。

    若某次重构把 v3 切回 angles.py，此测试会立即失败并暴露坐标系回归。
    """
    a, mm = _legacy_and_v3(0.0)
    # legacy 废值特征：toe≈±88°（X/Y 交换产物）、kpi≈±175°
    assert abs(abs(a["toe_deg"]) - 88.24) < 0.5
    assert abs(abs(a["kpi_deg"]) - 175.07) < 0.5
    # v3 正常值
    assert abs(mm["toe"] - 0.05) < 0.02
    assert abs(mm["kpi"] - 10.7389) < 0.02


def test_v3_pipeline_golden_under_travel():
    """v3 管线黄金值（与 mirror 测试交叉钉住）。"""
    for t, cam_exp, toe_exp in ((-20.0, -0.5272, -0.2382),
                                (20.0, -1.9407, 0.3180)):
        a, mm = _legacy_and_v3(t)
        assert abs(mm["cam"] - cam_exp) < 1e-3, (t, mm["cam"], cam_exp)
        assert abs(mm["toe"] - toe_exp) < 1e-3, (t, mm["toe"], toe_exp)


def test_legacy_frame_documented_incompatibility():
    """legacy 管线对 v3 机构输入的废值是'特性'（坐标系不同），非 bug：
    断言其 camber 与 v3 显著不同，避免未来有人'好心'改成一致而误伤框架。
    """
    a, mm = _legacy_and_v3(0.0)
    assert abs(a["camber_deg"] - mm["cam"]) > 5.0
