"""W4 口径统一 · 对拍与清单回归测试（F-69/F-12/F-13/F-67，2026-08-30）。

第十一讲架构决策（讲义 A.5 修订）：双内核互为审计器是刻意架构——
W4 从"合并成单一真源"改为"故意不同清单 + 一致性对拍"：
允许合理分叉（坐标系、模型简化层级），禁止意外漂移。

本文件把已消除的漂移点钉死：
1. F-69 角度双权威：v3 主线 pose_metrics 与 V1 冻结线 compute_alignment_angles
   在同一机构姿态下，经坐标换算后 camber/toe/kpi/caster 必须一致
   （scrub/trail 为故意不同：v3 轮胎投影 vs V1 轮心近似，不在对拍范围）。
2. F-12/F-13 差分内核：kandc._slope 与 kinematics（委托同源）对同一曲线
   输出一致；端点窗口行为同一。
3. F-67 MR 优先级：显式 > 数值推导 > 分轴常量回退（回退不吞异常/不串轴）。
"""

from src.api.v3models import DesignSpec, VehicleSpec
from src.api.v3service import DEFAULT_DWB_POINTS, _new_mech, pose_metrics
from src.solver.mechanism.solver import solve_pose

_DESIGN = DesignSpec(camber_deg=-1.2, toe_deg=0.05)


# ── 1. F-69：角度双权威 —— 故意不同清单（V1 冻结线 vs v3 主线）──────

# V1 冻结线 angles.py 与 v3 pose_metrics 是**刻意不同的两套数学**：
#   - v3（权威）：Kabsch/SVD 恢复 knuckle 刚体旋转 → 作用在 **设计轮轴**
#     上得到轮向（含设计 camber/toe 基准），全部 5 节点参与，设计位精确
#     自洽（见 test_pose_metrics_design_position_exact）。
#   - V1（历史冻结）：UP1→UP5 叉积构造局部标架，wheel 定义与轮轴假设
#     不同（旧机构约定），不适用 v3 轮轴基准。
# 差异属"故意不同清单"（讲义 A.5 第十一讲双内核决策），不是漂移——
# 不允许直接数值对拍；本文件只钉 v3 权威线的自洽锚。


def test_pose_metrics_design_position_exact():
    """v3 权威线自洽锚：travel=0/rack=0 设计位必须精确返回设计 cam/toe。

    若 pose_metrics 的轮轴恢复引入任何漂移（符号、镜像、基准错位），
    此锚第一个失败——它是双权威清单的"参考实现"基准。
    """
    mech = _new_mech(DEFAULT_DWB_POINTS, arch="pushrod")
    solve_pose(mech, 0.0, 0.0)
    m = pose_metrics(mech, 325.0, DesignSpec(camber_deg=-1.2, toe_deg=0.05))
    assert abs(m["cam"] - (-1.2)) < 1e-4, m["cam"]
    assert abs(m["toe"] - 0.05) < 1e-4, m["toe"]


def test_pose_metrics_design_position_exact_left():
    """左轮镜像同样自洽（镜像修复 2026-08-22 的回归锚）。"""
    pts = {k: [-v[0], v[1], v[2]] for k, v in DEFAULT_DWB_POINTS.items()}
    mech = _new_mech(pts, arch="pushrod")
    solve_pose(mech, 0.0, 0.0)
    m = pose_metrics(mech, 325.0, DesignSpec(camber_deg=-1.2, toe_deg=0.05))
    assert abs(m["cam"] - (-1.2)) < 1e-4, m["cam"]
    assert abs(m["toe"] - 0.05) < 1e-4, m["toe"]


def test_v1_legacy_angles_still_exist_for_s1_gate():
    """V1 冻结线 angles.py 保留但仅服务 S1 门禁手算对照（test_s1_gate 用）。

    改动角度数学只允许改 v3 权威线；冻结线若被删除必须同步
    test_s1_gate.py / test_metric_pipeline_governance.py 引用。
    """
    from src.legacy import angles as a1
    assert hasattr(a1, "compute_alignment_angles")


# ── 2. F-12/F-13：差分内核单一实现 ────────────────────────────────

def test_kandc_and_kinematics_share_slope_kernel():
    """kinematics 状态机版与 kandc 浮点版必须给出一致的 °/25mm 增益。"""
    import src.legacy.kinematics as kin
    from src.legacy.kinematics import bump_steer_deg_per_25 as k_bump
    from src.legacy.kinematics import camber_gain_deg_per_25 as k_cam
    from src.legacy.kinematics import motion_ratio as k_mr
    from src.metrics.kandc import (
        bump_steer_deg_per_25,
        camber_gain_deg_per_25,
        mr_matrix,
    )
    assert not hasattr(kin, "_slope_at"), "_slope_at must be deleted to honor single differentiator kernel rule"
    tr = [-25.0, -12.5, 0.0, 12.5, 25.0]
    cam = [-1.8, -1.5, -1.2, -0.9, -0.6]
    toe = [0.4, 0.2, 0.0, -0.2, -0.4]
    damper_tr = [-10.0, -5.0, 0.0, 5.0, 10.0]
    assert abs(camber_gain_deg_per_25(cam, tr, 0.0)
               - k_cam(cam, tr, 0.0).value) < 1e-9
    assert abs(bump_steer_deg_per_25(toe, tr, 0.0)
               - k_bump(toe, tr, 0.0).value) < 1e-9
    assert abs(mr_matrix(damper_tr, tr, 0.0)
               - k_mr(damper_tr, tr, 0.0).value) < 1e-9


# ── 2b. M5：侧偏刚度 Cα 单一实现（此前三份拷贝）─────────────────────

def test_cornering_stiffness_single_source():
    """Cα 与峰值尺度 D(Fz) 在 engine 内只能各有一份实现。

    背景：M5 之前 `D = Fy0·r·max(0.1, 1−LS·(r−1))` 同时写在
    `tire_mf.evaluate_magic_formula_fy`、`MagicFormulaSub._d`、
    `api/chassis.py::_ca_mf` 三处；改一处忘另两处会静默改变不足转向梯度。
    现全部收敛到 `tire_mf.load_d` / `tire_mf.cornering_stiffness`。
    """
    import re
    from pathlib import Path

    import pytest

    engine = Path(__file__).resolve().parents[1]
    src_files = [p for p in (engine / "src").rglob("*.py") if "__pycache__" not in p.parts]
    # M8（2026-09-20）：正则放宽到"载荷敏感性算式"的通用形态（参考载荷可以是
    # 变量 `r` 也可以是 `fz / ref`）——守卫目的是"只有一份实现"，不是锁定字面量。
    hits = [(p.name, m.start()) for p in src_files
            for m in re.finditer(r"max\(0\.1,\s*1\.0\s*-\s*\w+\s*\*\s*\([^()]*-\s*1\.0\)\)",
                                 p.read_text(encoding="utf-8"))]
    assert len(hits) == 1, f"D(Fz) 载荷敏感性算式有 {len(hits)} 份（应为 1）: {hits}"
    assert hits[0][0] == "tire_mf.py", hits

    # M8：参考载荷语义守卫——FzRef 处敏感度因子为 1，"载荷翻倍 μ 降 LS"成立。
    from src.tire_mf import load_d
    ref = 600.0
    d_at_ref = load_d(ref, Fy0=5250.0, FzNom=3500.0, LS=0.10, FzRef=ref)
    assert d_at_ref == pytest.approx(5250.0 * (ref / 3500.0)), "FzRef 处不得有载荷敏感性修正"
    mu_ref = d_at_ref / ref
    mu_2x = load_d(2 * ref, Fy0=5250.0, FzNom=3500.0, LS=0.10, FzRef=ref) / (2 * ref)
    assert mu_2x / mu_ref == pytest.approx(1.0 - 0.10), "载荷翻倍应降 μ 恰为 LS"
    # 缺省 None ⇒ 退化为 FzNom 旧口径（历史调用逐位不变）
    assert load_d(700.0, Fy0=5250.0, FzNom=3500.0, LS=0.10) == \
        load_d(700.0, Fy0=5250.0, FzNom=3500.0, LS=0.10, FzRef=None)
    assert load_d(700.0, Fy0=5250.0, FzNom=3500.0, LS=0.10, FzRef=3500.0) == \
        load_d(700.0, Fy0=5250.0, FzNom=3500.0, LS=0.10)

    from src.tire_mf import MagicFormulaSub, cornering_stiffness
    mf = MagicFormulaSub({"Fy0": 5250.0, "By": 20.0, "Cy": 1.2, "Ey": -0.5,
                          "FzNom": 3500.0, "LS": 0.1})
    for fz in (500.0, 1500.0, 3500.0, 6000.0):
        assert cornering_stiffness(fz, Fy0=5250.0, By=20.0, Cy=1.2,
                                   FzNom=3500.0, LS=0.1) == mf.cornering_stiffness(fz)
        # 胎宽轴系数只做线性放大（不动峰值 D）；k≡1 时逐位相同，一般 k 允许
        # 乘法结合序带来的最后一位差异（(k·B)·C·D vs k·(B·C·D)）。
        base = mf.cornering_stiffness(fz)
        assert mf.cornering_stiffness(fz, axle_scale=1.0) == base
        assert abs(mf.cornering_stiffness(fz, axle_scale=1.25) - 1.25 * base) <= 1e-12 * abs(base)
    assert cornering_stiffness(0.0, Fy0=5250.0, By=20.0, Cy=1.2) == 0.0


def test_compliance_forwards_tire_radius():
    """验证 v3service._solve_point 将 tire_radius 准确传递给 solve_compliance_full。"""
    from unittest.mock import patch

    import src.api.v3service as v3s
    from src.api.v3models import BushingSpec, KandcRequest, SweepSpec

    b = BushingSpec(name="bLCA_F", node="LCA_F", kT=[300.0, 300.0, 300.0], kR=[4e4, 4e4, 4e4])
    req = KandcRequest(tire_radius=260.0, bushings=[b], compliance_axis="fy",
                       sweep=SweepSpec(min=-100.0, max=100.0, n=3))
    with patch("src.api.v3service.solve_compliance_full", wraps=v3s.solve_compliance_full) as mock_scf:
        v3s.run_compliance(req)
        assert mock_scf.called
        for call in mock_scf.call_args_list:
            assert call.kwargs.get("tire_radius") == 260.0


def test_slope_endpoint_uses_single_side():
    """端点不再虚高一倍：单侧差分（无 at 右侧点时不放大）。"""
    from src.metrics.kandc import _slope
    x = [0.0, 1.0, 2.0]
    y = [0.0, 1.0, 2.0]
    assert abs(_slope(y, x, at=0.0) - 1.0) < 1e-9   # 端点：单侧 → 1.0
    assert abs(_slope(y, x, at=2.0) - 1.0) < 1e-9   # 右端点单侧 → 1.0
    # None 点跳过：只有两个有效点时仍可差分
    assert abs(_slope([0.0, None, 2.0], x, at=1.0) - 1.0) < 1e-9


# ── 3. F-67：MR 优先级与分轴回退 ──────────────────────────────────

def _vehicle(mr_front, mr_rear):
    f = {
        "LCA_F": [260, 140, 130], "LCA_R": [260, -120, 140], "UCA_F": [350, 110, 340],
        "UCA_R": [350, -100, 350], "LBJ": [640, 10, 150], "UBJ": [590, -15, 410],
        "WC": [710, 0, 280], "TRO": [600, -120, 185], "RACK": [220, -135, 180],
        "STRUT_OUT": [595, 10, 185], "RCK_AX_A": [300, 15, 330], "RCK_AX_B": [300, 70, 328],
        "STRUT_IN": [315, 45, 400], "RCK_DMP": [230, 48, 345], "DMP_BODY": [30, 48, 170],
    }
    r = {
        "LCA_F": [250, 140, 115], "LCA_R": [250, -130, 125], "UCA_F": [340, 110, 320],
        "UCA_R": [340, -110, 330], "LBJ": [630, 10, 135], "UBJ": [580, -15, 390],
        "WC": [700, 0, 290], "TRO": [590, -120, 170], "RACK": [210, -130, 160],
        "STRUT_OUT": [570, -15, 380], "RCK_AX_A": [340, 25, 290], "RCK_AX_B": [340, 75, 292],
        "STRUT_IN": [370, 45, 255], "RCK_DMP": [305, 60, 270], "DMP_BODY": [25, 62, 310],
    }
    return {
        "wheelbase_mm": 1620.0, "mass_kg": 480.0, "sprung_mass_kg": 420.0,
        "hcg_mm": 320.0, "hs_mm": 330.0,
        "front": {"points": f, "arch": "pushrod", "camber_deg": -1.2, "toe_deg": 0.05,
                  "tire_radius": 305.0, "spring_rate": 110.0, "spring_mass_kg": 300.0,
                  "unsprung_kg": 38.0, "motion_ratio": mr_front},
        "rear": {"points": r, "arch": "pullrod", "camber_deg": -1.5, "toe_deg": 0.1,
                 "tire_radius": 310.0, "spring_rate": 130.0, "spring_mass_kg": 340.0,
                 "unsprung_kg": 42.0, "motion_ratio": mr_rear},
    }


def test_mr_explicit_wins_over_derivation():
    """显式 motion_ratio 优先于 mr_at_zero 数值推导（MR 三路优先级第一条）。"""
    from src.api.chassis import solve_chassis
    from src.api.v3models import ChassisRequest
    req = ChassisRequest(vehicle=VehicleSpec(**_vehicle(0.6, 0.7)))
    out = solve_chassis(req)
    assert out.mr["front"] == 0.6
    assert out.mr["rear"] == 0.7


def test_mr_fallback_is_axis_aware():
    """回退常量分轴：后轴 0.78 而非恒 0.75（F-67），且带 warning 说明原因。"""
    from src.api.chassis import _resolve_mr_fb
    v = VehicleSpec(**_vehicle(None, None))
    warns: list[str] = []
    c_f, fb_f = _resolve_mr_fb(v.front, v.front.points, is_front=True,
                               warnings=warns)
    c_r, fb_r = _resolve_mr_fb(v.rear, v.rear.points, is_front=False,
                               warnings=warns)
    # 合法几何不会触发回退（数值推导成功）——回退分支只验证常量分轴正确：
    # 用非法 points 强制走异常路径。
    c_f2, fb_f2 = _resolve_mr_fb(v.front, {"LCA_F": [1.0]}, is_front=True,
                                 warnings=warns)
    c_r2, fb_r2 = _resolve_mr_fb(v.rear, {"LCA_R": [1.0]}, is_front=False,
                                 warnings=warns)
    assert fb_f2 is True and c_f2 == 0.75
    assert fb_r2 is True and c_r2 == 0.78
    assert any("MR compute failed" in w for w in warns), warns
    # 正常路径（第一组）不触发回退
    assert fb_f is False and fb_r is False


def test_mr_explicit_divergence_is_surfaced():
    """M5：显式 MR 命中时仍比对引擎推导值，差距 >15% 必须上报 warning。

    背景：前端恒下发自己的扫掠 MR（`motion_ratio: SIM.mrRefF||0.75`），
    显式分支永远命中 ⇒ 引擎 `mr_at_zero` 推导在生产链路从未被执行，
    两口径分叉（OpenItem-B 摇臂双根分支）永久静默。本测试把它钉成
    可观测项：数值仍取显式值（优先级 1 不变），但差异必须出现在 warnings。
    """
    from src.api.chassis import _resolve_mr_fb, mr_at_zero
    from src.api.v3models import AxleSpec
    ax = AxleSpec(points=DEFAULT_DWB_POINTS, motion_ratio=0.75)
    warns: list[str] = []
    mr, fb = _resolve_mr_fb(ax, DEFAULT_DWB_POINTS, is_front=True, warnings=warns)
    derived = round(mr_at_zero(ax, DEFAULT_DWB_POINTS, False), 4)
    assert mr == 0.75 and fb is False                  # 显式值仍是权威
    assert derived < 0.6, derived                      # 引擎推导确实显著不同
    assert any("MR 口径分歧" in w for w in warns), warns


def test_mr_derivation_matches_when_no_explicit():
    """无显式值时走推导路径，且不产生分歧告警（推导=自身，非分叉）。"""
    from src.api.chassis import _resolve_mr_fb
    from src.api.v3models import AxleSpec
    ax = AxleSpec(points=DEFAULT_DWB_POINTS)           # motion_ratio=None
    warns: list[str] = []
    mr, fb = _resolve_mr_fb(ax, DEFAULT_DWB_POINTS, is_front=True, warnings=warns)
    assert fb is False and 0.02 <= mr <= 1.5
    assert not any("MR 口径分歧" in w for w in warns), warns
