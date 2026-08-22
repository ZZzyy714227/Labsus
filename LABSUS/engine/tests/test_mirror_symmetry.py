"""P0 镜像修复回归：左右角定位角对称性不变量（r2 研究发现 B 的守卫）。

背景（2026-08-22）：pose_metrics 曾对左角复用右框架公式 ——
1) 设计轮轴未取镜像 → FL scrub 相对 FR 偏差 2·tireR·sin(|camber|)
   （基线几何 = 13.61mm），rc_h 同源偏移 ~0.51mm；
2) kpi/scrub 未按 convention.py"两侧相同"翻号。

本文件以不变量断言堵住该类盲区：镜像几何输入下，六项定位角逐角相等。
另以黄金值钉住右侧输出，防止修复引入右侧漂移。
"""
import pytest
from fastapi.testclient import TestClient

from server import app  # noqa: E402

client = TestClient(app)

FRONT = {
    "LCA_F": [240.0, 180.0, 145.0], "LCA_R": [240.0, -160.0, 155.0],
    "LBJ": [730.0, 10.0, 165.0], "UCA_F": [360.0, 140.0, 380.0],
    "UCA_R": [360.0, -130.0, 390.0], "UBJ": [675.0, -15.0, 455.0],
    "WC": [810.0, 0.0, 320.0], "TRO": [685.0, -145.0, 205.0],
    "RACK": [269.2, -165.0, 198.1],
    "STRUT_OUT": [683.4, 12.0, 205.5],
    "RCK_AX_A": [305.3, 20.0, 366.4], "RCK_AX_B": [306.1, 90.0, 365.0],
    "STRUT_IN": [324.4, 57.9, 445.6], "RCK_DMP": [234.8, 60.0, 385.0],
    "DMP_BODY": [29.3, 60.1, 181.1],
}
REAR = {
    "LCA_F": [230.0, 180.0, 125.0], "LCA_R": [230.0, -170.0, 135.0],
    "LBJ": [720.0, 10.0, 145.0], "UCA_F": [340.0, 140.0, 360.0],
    "UCA_R": [340.0, -140.0, 370.0], "UBJ": [660.0, -15.0, 435.0],
    "WC": [790.0, 0.0, 330.0], "TRO": [670.0, -150.0, 185.0],
    "RACK": [230.0, -160.0, 175.0],
    "STRUT_OUT": [645.0, -15.0, 425.0],
    "RCK_AX_A": [377.0, 30.0, 318.9], "RCK_AX_B": [376.7, 90.0, 320.1],
    "STRUT_IN": [414.7, 55.0, 282.5], "RCK_DMP": [337.8, 75.0, 297.6],
    "DMP_BODY": [18.5, 78.4, 346.4],
}

_ANGLE_KEYS = ("cam", "toe", "kpi", "cast", "scrub", "trail", "rc_h")


def _solve(front=None, rear=None, travel=None):
    body = {
        "vehicle": {
            "wheelbase_mm": 2750.0, "mass_kg": 1420.0, "sprung_mass_kg": 1260.0,
            "hcg_mm": 350.0, "hs_mm": 370.0,
            "front": {"points": front or FRONT, "camber_deg": -1.2,
                      "toe_deg": 0.05, "tire_radius": 325.0,
                      "spring_rate": 110.0, "spring_mass_kg": 330.0,
                      "unsprung_kg": 38.0},
            "rear": {"points": rear or REAR, "camber_deg": -1.5,
                     "toe_deg": 0.1, "tire_radius": 330.0,
                     "spring_rate": 130.0, "spring_mass_kg": 380.0,
                     "unsprung_kg": 42.0},
        },
        "travel": travel or {"fl": 0.0, "fr": 0.0, "rl": 0.0, "rr": 0.0},
        "rack": 0.0,
    }
    r = client.post("/api/v3/chassis/solve", json=body)
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "VALID"
    return b["pose"]


def test_mirror_symmetry_all_angles_design_pose():
    """设计位：镜像几何 → FL==FR、RL==RR 六项定位角逐项相等（不变量）。"""
    pose = _solve()
    for left, right in (("FL", "FR"), ("RL", "RR")):
        for k in _ANGLE_KEYS:
            a, c = pose[left][k], pose[right][k]
            assert a is not None and c is not None, (left, right, k)
            assert abs(a - c) < 1e-6, f"{left}.{k}={a} vs {right}.{k}={c}"


def test_scrub_mirror_gap_regression_13mm():
    """回归钉：修复前 FL/FR scrub 差恰为 13.61mm；现在必须 < 1e-6。"""
    pose = _solve()
    gap_front = abs(pose["FL"]["scrub"] - pose["FR"]["scrub"])
    gap_rear = abs(pose["RL"]["scrub"] - pose["RR"]["scrub"])
    assert gap_front < 1e-6 and gap_rear < 1e-6


@pytest.mark.parametrize("trav", [-30.0, 30.0])
def test_mirror_symmetry_under_travel(trav):
    """轮跳下对称性保持（左右同行程）。"""
    pose = _solve(travel={"fl": trav, "fr": trav, "rl": trav, "rr": trav})
    for left, right in (("FL", "FR"), ("RL", "RR")):
        for k in ("cam", "toe", "kpi", "cast"):
            assert abs(pose[left][k] - pose[right][k]) < 1e-4, (left, right, k)


def test_right_side_golden_unchanged():
    """黄金值：修复不得动右侧数值。

    注：2026-08-22 并发修复（主销-地面交点 t0 符号）将 kg 自 UBJ 上方移回
    地面段：scrub 229.034→54.5784、trail −54.65→24.64，均更贴物理且与
    镜像对称一致；此处同步钉住新值。
    """
    m = _solve()["FR"]
    assert abs(m["cam"] - (-1.2)) < 1e-3
    assert abs(m["scrub"] - 54.5784) < 0.01
    assert abs(m["trail"] - 24.6431) < 0.01
    assert abs(m["rc_h"] - 55.258349) < 0.01


def test_left_kpi_positive_by_convention():
    """convention.py：KPI 正 = 上端向内，两侧相同（左角曾错误输出负值）。"""
    pose = _solve()
    assert pose["FL"]["kpi"] > 0 and pose["FR"]["kpi"] > 0
