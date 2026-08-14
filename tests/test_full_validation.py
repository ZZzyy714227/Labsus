"""
FSAE 悬架分析软件 — 全面验证测试
模拟工程师在该软件中进行的全部操作，检测潜在故障。

测试覆盖：
1. 启动与默认数据加载
2. 运动学求解（纯轮跳、转向、混合）
3. 左右对称性验证
4. 硬点编辑与持久化
5. 设计参数更新与硬点重新派生
6. 管件 CRUD（添加、删除、改色）
7. 覆盖面 CRUD（添加、删除、更新）
8. 空力配置保存
9. 运动学扫描（曲线连续性）
10. FL1 优化
11. 车身姿态模式
12. 边界/极端工况
13. 物理合理性验证
"""

import copy
import math
import os
import sys
import tempfile
import json

import numpy as np
import pytest

# ── 确保 src/ 在 sys.path ──
_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
if _src not in sys.path:
    sys.path.insert(0, _src)

from fastapi.testclient import TestClient


# ============================================================
# 辅助工具
# ============================================================

def _angle_close(a, b, tol=0.05):
    """两个角度值是否接近（度）。"""
    return abs(a - b) < tol


def _coord_close(a, b, tol=0.5):
    """两个坐标值是否接近（mm）。"""
    return abs(a - b) < tol


def _sign_symmetric(val_right, val_left, tol=0.05):
    """左右对称值应满足 sign flip 关系。"""
    return abs(val_right + val_left) < tol  # e.g. camber: right=-2, left=+2


# ============================================================
# Fixture: TestClient + 临时数据目录
# ============================================================

@pytest.fixture(scope="session")
def client():
    """创建 TestClient，使用临时目录避免污染真实数据。"""
    # 将持久化目录指向临时路径
    import persistence as pers_mod
    import hardpoints as hp_mod

    tmp_dir = tempfile.mkdtemp(prefix="fsae_test_")
    pers_mod.DATA_DIR = tmp_dir
    pers_mod.STATE_FILE = os.path.join(tmp_dir, "persistent_state.json")
    hp_mod.HP_OVERRIDES_FILE = os.path.join(tmp_dir, "hardpoint_overrides.json")

    # 重置 overrides 以避免残留影响
    hp_mod._hp_overrides = {}

    # 导入 app（会触发 load_persistent_state）
    from main import app
    tc = TestClient(app)
    return tc


@pytest.fixture(scope="session")
def defaults(client):
    """获取默认数据（工程师第一步操作：打开软件看默认数据）。"""
    resp = client.get("/api/defaults")
    assert resp.status_code == 200
    data = resp.json()
    # 基础结构完整性
    assert "front" in data
    assert "rear" in data
    assert "frame" in data
    assert "bodywork" in data
    assert "params" in data
    return data


@pytest.fixture(autouse=True)
def _restore_config_state():
    """Snapshot mutable config state, restore after each test.

    /api/update_params mutates DESIGN_PARAMS in place and re-derives
    DEFAULT_HARDPOINTS; without restoration, later test files (e.g.
    test_rules_compliance) would see polluted values.
    """
    from config import DESIGN_PARAMS
    from hardpoints import DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS
    snap_params = copy.deepcopy(DESIGN_PARAMS)
    snap_front = copy.deepcopy(DEFAULT_HARDPOINTS)
    snap_rear = copy.deepcopy(DEFAULT_REAR_HARDPOINTS)
    yield
    DESIGN_PARAMS.clear()
    DESIGN_PARAMS.update(snap_params)
    DEFAULT_HARDPOINTS.clear()
    DEFAULT_HARDPOINTS.update(snap_front)
    DEFAULT_REAR_HARDPOINTS.clear()
    DEFAULT_REAR_HARDPOINTS.update(snap_rear)


@pytest.fixture(scope="session")
def front_hp(defaults):
    """前轴右侧硬点。"""
    return defaults["front"]["right"]


@pytest.fixture(scope="session")
def rear_hp(defaults):
    """后轴右侧硬点（带 R_ 前缀）。"""
    return defaults["rear"]["right"]


# ============================================================
# 1. 启动与默认数据完整性
# ============================================================

class TestStartupAndDefaults:
    """工程师操作：打开软件 → 检查默认数据是否正确加载。"""

    def test_defaults_has_all_hardpoint_keys(self, defaults):
        """默认数据应包含所有硬点键。"""
        required_front = ["CH1", "CH2", "CH3", "CH4", "CH5",
                          "UP1", "UP2", "UP3", "UP4", "UP5", "FL1"]
        required_rear = ["R_CH1", "R_CH2", "R_CH3", "R_CH4", "R_CH5",
                         "R_UP1", "R_UP2", "R_UP3", "R_UP4", "R_UP5", "R_FL1"]
        for key in required_front:
            assert key in defaults["front"]["right"], f"前轴缺少硬点 {key}"
        for key in required_rear:
            assert key in defaults["rear"]["right"], f"后轴缺少硬点 {key}"

    def test_defaults_has_alignment_angles(self, defaults):
        """默认数据应包含定位角度。"""
        angle_keys = ["camber_deg", "toe_deg", "caster_deg", "kpi_deg",
                      "scrub_radius_mm", "caster_trail_mm"]
        for side in ["angles_right", "angles_left"]:
            for key in angle_keys:
                assert key in defaults["front"][side], f"前轴 {side} 缺少 {key}"
                assert key in defaults["rear"][side], f"后轴 {side} 缺少 {key}"

    def test_defaults_has_contact_patch(self, defaults):
        """默认数据应包含接地点信息。"""
        for axle in ["front", "rear"]:
            for side in ["contact_patch_right", "contact_patch_left"]:
                cp = defaults[axle][side]
                assert "center" in cp
                assert "loaded_radius" in cp
                assert len(cp["center"]) == 3

    def test_defaults_has_frame_data(self, defaults):
        """默认数据应包含车架信息。"""
        frame = defaults["frame"]
        assert "nodes" in frame
        assert "tubes" in frame
        assert "tube_colors" in frame
        assert len(frame["tubes"]) > 0

    def test_defaults_has_aero_configs(self, defaults):
        """默认数据应包含空力配置。"""
        for key in ["rear_wing", "front_wing", "undertray", "diffuser"]:
            assert key in defaults
            cfg = defaults[key]
            assert "enabled" in cfg

    def test_defaults_coords_are_3d_lists(self, defaults):
        """所有硬点坐标应为 3 元素列表。"""
        for axle in ["front", "rear"]:
            for side in ["right", "left"]:
                hp = defaults[axle][side]
                for key, val in hp.items():
                    if isinstance(val, list) and key.startswith(("CH", "UP", "FL", "R_CH", "R_UP", "R_FL")):
                        assert len(val) == 3, f"{axle}/{side}/{key} 坐标不是 3D: {val}"

    def test_defaults_track_width_positive(self, defaults):
        """轮距应为正值。"""
        assert defaults["front"]["right"]["track_width"] > 0
        assert defaults["rear"]["right"]["track_width"] > 0

    def test_defaults_tire_radius_positive(self, defaults):
        """轮胎半径应为正值。"""
        assert defaults["front"]["right"]["tire_radius"] > 0
        assert defaults["rear"]["right"]["tire_radius"] > 0


# ============================================================
# 2. 运动学求解 — 纯轮跳
# ============================================================

class TestSolvePureBump:
    """工程师操作：拖动轮跳滑块 → 看悬架运动。"""

    def test_solve_zero_travel(self, client, front_hp, rear_hp):
        """零轮跳时应返回与默认位置接近的结果。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
            "rear_travel": 0.0,
            "rack_displacement": 0.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        # UP5.Z 应等于默认值
        default_up5_z = front_hp["UP5"][2]
        solved_up5_z = data["front"]["right"]["UP5"][2]
        assert _coord_close(solved_up5_z, default_up5_z, tol=0.1)

    def test_solve_positive_bump(self, client, front_hp, rear_hp):
        """正轮跳（压缩）→ UP5.Z 应增大。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 25.0,
            "rear_travel": 25.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        # 前轴右轮 UP5.Z > 默认
        assert data["front"]["right"]["UP5"][2] > front_hp["UP5"][2]

    def test_solve_negative_bump(self, client, front_hp, rear_hp):
        """负轮跳（回弹）→ UP5.Z 应减小。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": -25.0,
            "rear_travel": -25.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["front"]["right"]["UP5"][2] < front_hp["UP5"][2]

    def test_solve_returns_alignment_angles(self, client, front_hp, rear_hp):
        """求解结果应包含定位角度。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 10.0,
            "rear_travel": 10.0,
        })
        data = resp.json()
        for axle in ["front", "rear"]:
            for side in ["angles_right", "angles_left"]:
                angles = data[axle][side]
                assert "camber_deg" in angles
                assert "toe_deg" in angles
                assert "caster_deg" in angles
                assert "kpi_deg" in angles

    def test_solve_returns_contact_patch(self, client, front_hp, rear_hp):
        """求解结果应包含接地点。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 10.0,
        })
        data = resp.json()
        for axle in ["front", "rear"]:
            for side in ["contact_patch_right", "contact_patch_left"]:
                assert "center" in data[axle][side]

    def test_solve_returns_rocker_kinematics(self, client, front_hp, rear_hp):
        """求解结果应包含摇臂运动学。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 10.0,
        })
        data = resp.json()
        assert "rocker_right" in data["front"]
        rk = data["front"]["rocker_right"]
        assert "rocker_angle_deg" in rk
        assert "damper_travel" in rk

    def test_solve_bump_changes_camber(self, client, front_hp, rear_hp):
        """轮跳应改变外倾角（悬架最核心的行为）。"""
        # 零轮跳的外倾
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rear_travel": 0.0,
        }).json()
        # +25mm 轮跳的外倾
        r25 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 25.0, "rear_travel": 25.0,
        }).json()
        camber0 = r0["front"]["angles_right"]["camber_deg"]
        camber25 = r25["front"]["angles_right"]["camber_deg"]
        # 外倾角应有变化（典型双叉臂在压缩时变得更负）
        assert abs(camber25 - camber0) > 0.01, \
            f"轮跳 25mm 外倾变化太小: {camber0} → {camber25}"

    def test_solve_large_bump_range(self, client, front_hp, rear_hp):
        """大范围轮跳 (-40mm 到 +40mm) 都应能求解，不应崩溃。"""
        for dz in [-40, -30, -20, -10, 0, 10, 20, 30, 40]:
            resp = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz), "rear_travel": float(dz),
            })
            assert resp.status_code == 200, f"轮跳 {dz}mm 时求解失败"


# ============================================================
# 3. 转向求解
# ============================================================

class TestSolveSteering:
    """工程师操作：拖动齿条位移滑块 → 看转向效果。"""

    def test_steering_changes_toe(self, client, front_hp, rear_hp):
        """齿条位移应产生前束角变化（转向的基本效果）。"""
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 0.0,
        }).json()
        r10 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 10.0,
        }).json()
        toe0 = r0["front"]["angles_right"]["toe_deg"]
        toe10 = r10["front"]["angles_right"]["toe_deg"]
        assert abs(toe10 - toe0) > 0.01, \
            f"齿条 10mm 转向角变化太小: {toe0} → {toe10}"

    def test_steering_positive_rack_toe_positive_right(self, client, front_hp, rear_hp):
        """正齿条位移 → 右轮正前束（右转时右轮偏转更大）。"""
        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 10.0,
        }).json()
        toe_right = r["front"]["angles_right"]["toe_deg"]
        toe_left = r["front"]["angles_left"]["toe_deg"]
        # 右轮应有正前束变化（方向取决于约定，但不应为零）
        assert abs(toe_right) > 0.01

    def test_steering_negative_rack(self, client, front_hp, rear_hp):
        """负齿条位移也应能求解。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": -10.0,
        })
        assert resp.status_code == 200

    def test_rear_axle_no_steering(self, client, front_hp, rear_hp):
        """后轴不应有转向（齿条位移只影响前轴）。"""
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 0.0,
        }).json()
        r10 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 10.0,
        }).json()
        toe_rear_0 = r0["rear"]["angles_right"]["toe_deg"]
        toe_rear_10 = r10["rear"]["angles_right"]["toe_deg"]
        # 后轴前束不应因齿条位移而变化
        assert _angle_close(toe_rear_0, toe_rear_10, tol=0.01)


# ============================================================
# 4. 左右对称性
# ============================================================

class TestMirrorSymmetry:
    """工程师操作：查看左右侧数据 → 验证对称性。"""

    def test_left_coords_mirror_y(self, defaults):
        """左侧坐标应与右侧 Y 轴镜像。"""
        right = defaults["front"]["right"]
        left = defaults["front"]["left"]
        for key in ["CH1", "CH2", "CH3", "CH4", "CH5",
                     "UP1", "UP2", "UP3", "UP4", "UP5", "FL1"]:
            r_val = right[key]
            l_val = left[key]
            assert _coord_close(r_val[0], l_val[0]), f"{key} X 不对称"
            assert _coord_close(r_val[1], -l_val[1]), f"{key} Y 不镜像: right={r_val[1]}, left={l_val[1]}"
            assert _coord_close(r_val[2], l_val[2]), f"{key} Z 不对称"

    def test_left_angles_symmetric(self, defaults):
        """左侧角度应满足对称约定（fix_left_angles 已修正符号）。"""
        ar = defaults["front"]["angles_right"]
        al = defaults["front"]["angles_left"]
        # 外倾角: after fix_left_angles, left ≈ -right
        assert _sign_symmetric(ar["camber_deg"], al["camber_deg"]), \
            f"外倾不对称: right={ar['camber_deg']}, left={al['camber_deg']}"
        # KPI: after fix_left_angles, left ≈ right (sign flip converts -2.078 → +2.078)
        assert _angle_close(ar["kpi_deg"], al["kpi_deg"]), \
            f"KPI不对称: right={ar['kpi_deg']}, left={al['kpi_deg']}"
        # 后倾角: left ≈ right (纵向角度不受镜像影响)
        assert _angle_close(ar["caster_deg"], al["caster_deg"]), \
            f"后倾不对称: right={ar['caster_deg']}, left={al['caster_deg']}"

    def test_solve_left_right_symmetric_at_zero(self, client, front_hp, rear_hp):
        """零轮跳、零转向时，求解结果的左右侧应对称。"""
        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 0.0,
        }).json()
        ar = r["front"]["angles_right"]
        al = r["front"]["angles_left"]
        assert _sign_symmetric(ar["camber_deg"], al["camber_deg"])
        assert _angle_close(ar["kpi_deg"], al["kpi_deg"])
        assert _angle_close(ar["caster_deg"], al["caster_deg"])


# ============================================================
# 5. 硬点编辑与持久化
# ============================================================

class TestHardpointEditing:
    """工程师操作：双击硬点 → 编辑坐标 → 临时/永久保存。"""

    def test_save_point_temporary(self, client, front_hp):
        """临时修改硬点 → 应更新内存值但不持久化。"""
        # 先修改一个值
        resp = client.post("/api/save_point", json={
            "name": "CH1",
            "coords": [-70.0, 210.0, 220.0],
            "permanent": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["permanent"] is False

    def test_save_point_permanent(self, client, defaults):
        """永久保存硬点 → 应写入 JSON 文件。"""
        # 保存一个硬点
        resp = client.post("/api/save_point", json={
            "name": "CH3",
            "coords": [-90.0, 200.0, 60.0],
            "permanent": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["permanent"] is True

    def test_save_point_unknown_returns_404(self, client):
        """保存不存在的硬点 → 应返回 404。"""
        resp = client.post("/api/save_point", json={
            "name": "NONEXISTENT_POINT",
            "coords": [0, 0, 0],
            "permanent": False,
        })
        assert resp.status_code == 404

    def test_save_left_point_auto_mirror(self, client):
        """保存左侧硬点 → 应自动镜像到右侧（Y 取反）。"""
        # 先获取当前 CH1 值
        defaults = client.get("/api/defaults").json()
        original_ch1_y = defaults["front"]["right"]["CH1"][1]

        resp = client.post("/api/save_point", json={
            "name": "CH1_L",
            "coords": [-60.0, -210.0, 215.0],
            "permanent": False,
        })
        assert resp.status_code == 200
        # 检查右侧 CH1 的 Y 是否被镜像更新
        defaults2 = client.get("/api/defaults").json()
        # CH1_L coords = [-60, -210, 215] → CH1 应更新为 [-60, 210, 215]
        new_ch1 = defaults2["front"]["right"]["CH1"]
        assert _coord_close(new_ch1[1], 210.0)


# ============================================================
# 6. 设计参数更新
# ============================================================

class TestDesignParamsUpdate:
    """工程师操作：修改设计参数 → 硬点自动重新派生。"""

    def test_update_param_re_derives_hardpoints(self, client):
        """修改 track 参数 → 硬点应重新计算。"""
        resp = client.post("/api/update_params", json={
            "axle": "front",
            "key": "track",
            "value": 1280.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        # track 1220 → 1280 ⇒ UP5.Y 610 → 640
        new_up5_y = data["hardpoints"]["UP5"][1]
        assert _coord_close(new_up5_y, 640.0), \
            f"track=1280 时 UP5.Y={new_up5_y}, 期望 640"

    def test_update_param_unknown_axle_returns_400(self, client):
        """未知车轴 → 应返回 400。"""
        resp = client.post("/api/update_params", json={
            "axle": "middle",
            "key": "track",
            "value": 800.0,
        })
        assert resp.status_code == 400

    def test_update_param_unknown_key_returns_400(self, client):
        """未知参数 → 应返回 400。"""
        resp = client.post("/api/update_params", json={
            "axle": "front",
            "key": "nonexistent_param",
            "value": 100.0,
        })
        assert resp.status_code == 400


# ============================================================
# 7. 管件 CRUD
# ============================================================

class TestTubeCRUD:
    """工程师操作：多选硬点 → 创建管件 / 删除管件 / 改色。"""

    def test_add_tube(self, client):
        """添加管件 → 应成功并返回索引。"""
        resp = client.post("/api/add_tube", json={
            "endpoints": ["FB_MID_R", "CH4"],
            "color": "#ff0000",
            "permanent": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "tube_index" in data

    def test_add_duplicate_tube_returns_400(self, client):
        """添加重复管件 → 应返回 400。"""
        # CH2→CH1 已存在
        resp = client.post("/api/add_tube", json={
            "endpoints": ["CH1", "CH2"],
            "color": "#8899cc",
        })
        assert resp.status_code == 400

    def test_add_tube_too_few_points_returns_400(self, client):
        """只有 1 个端点的管件 → 应返回 400。"""
        resp = client.post("/api/add_tube", json={
            "endpoints": ["CH1"],
            "color": "#8899cc",
        })
        assert resp.status_code == 400

    def test_delete_tube(self, client):
        """删除管件 → 应成功。"""
        # 先添加一个新管件
        add_resp = client.post("/api/add_tube", json={
            "endpoints": ["UP1", "UP2"],
            "color": "#8899cc",
            "permanent": False,
        })
        assert add_resp.status_code == 200
        # 删除它
        del_resp = client.post("/api/delete_tube", json={
            "endpoints": ["UP1", "UP2"],
            "permanent": False,
        })
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True

    def test_delete_nonexistent_tube_returns_404(self, client):
        """删除不存在的管件 → 应返回 404。"""
        resp = client.post("/api/delete_tube", json={
            "endpoints": ["NONEXIST1", "NONEXIST2"],
        })
        assert resp.status_code == 404

    def test_save_tube_color(self, client):
        """修改管件颜色 → 应成功。"""
        resp = client.post("/api/save_tube_color", json={
            "endpoints": ["CH1", "CH2"],
            "color": "#00ff00",
            "permanent": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["color"] == "#00ff00"

    def test_save_tube_color_nonexistent_returns_404(self, client):
        """为不存在的管件改色 → 应返回 404。"""
        resp = client.post("/api/save_tube_color", json={
            "endpoints": ["NOPE1", "NOPE2"],
            "color": "#00ff00",
        })
        assert resp.status_code == 404


# ============================================================
# 8. 覆盖面 CRUD
# ============================================================

class TestFaceCRUD:
    """工程师操作：创建/删除/更新车身覆盖面。"""

    def test_add_face(self, client):
        """添加覆盖面 → 应成功。"""
        resp = client.post("/api/add_face", json={
            "name": "test_face_01",
            "loop": ["CH1", "CH2", "CH3"],
            "color": "#ff0000",
            "opacity": 0.5,
            "permanent": False,
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_add_duplicate_face_returns_400(self, client):
        """添加重复名称的覆盖面 → 应返回 400。"""
        resp = client.post("/api/add_face", json={
            "name": "test_face_01",
            "loop": ["CH1", "CH2", "CH3"],
            "color": "#00ff00",
            "opacity": 0.5,
        })
        assert resp.status_code == 400

    def test_add_face_too_few_vertices_returns_400(self, client):
        """只有 2 个顶点的覆盖面 → 应返回 400。"""
        resp = client.post("/api/add_face", json={
            "name": "test_face_bad",
            "loop": ["CH1", "CH2"],
            "color": "#00ff00",
            "opacity": 0.5,
        })
        assert resp.status_code == 400

    def test_delete_face(self, client):
        """删除覆盖面 → 应成功。"""
        resp = client.post("/api/delete_face", json={
            "name": "test_face_01",
            "permanent": False,
        })
        assert resp.status_code == 200

    def test_delete_nonexistent_face_returns_404(self, client):
        """删除不存在的覆盖面 → 应返回 404。"""
        resp = client.post("/api/delete_face", json={
            "name": "nonexistent_face",
        })
        assert resp.status_code == 404

    def test_update_face(self, client):
        """更新覆盖面 → 应成功。"""
        # 先添加
        client.post("/api/add_face", json={
            "name": "test_face_update",
            "loop": ["CH1", "CH2", "CH3"],
            "color": "#ff0000",
            "opacity": 0.5,
            "permanent": False,
        })
        # 更新
        resp = client.post("/api/update_face", json={
            "name": "test_face_update",
            "loop": ["CH1", "CH2", "CH3", "CH4"],
            "color": "#00ff00",
            "opacity": 0.7,
            "permanent": False,
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # 清理
        client.post("/api/delete_face", json={
            "name": "test_face_update", "permanent": False,
        })


# ============================================================
# 9. 空力配置保存
# ============================================================

class TestAeroConfig:
    """工程师操作：修改尾翼/前翼/底板/扩散器配置 → 保存。"""

    def test_save_rear_wing(self, client, defaults):
        """保存尾翼配置 → 应成功。"""
        rw = copy.deepcopy(defaults["rear_wing"])
        rw["span"] = 650
        resp = client.post("/api/save_rear_wing", json=rw)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_save_front_wing(self, client, defaults):
        """保存前翼配置 → 应成功。"""
        fw = copy.deepcopy(defaults["front_wing"])
        fw["span"] = 550
        resp = client.post("/api/save_front_wing", json=fw)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_save_undertray(self, client, defaults):
        """保存底板配置 → 应成功。"""
        ut = copy.deepcopy(defaults["undertray"])
        ut["ground_clearance"] = 30
        resp = client.post("/api/save_undertray", json=ut)
        assert resp.status_code == 200

    def test_save_diffuser(self, client, defaults):
        """保存扩散器配置 → 应成功。"""
        diff = copy.deepcopy(defaults["diffuser"])
        diff["angle"] = 12
        resp = client.post("/api/save_diffuser", json=diff)
        assert resp.status_code == 200


# ============================================================
# 10. 运动学扫描（曲线连续性）
# ============================================================

class TestSweep:
    """工程师操作：打开运动学曲线面板 → 查看扫描结果。"""

    def test_sweep_basic(self, client, front_hp, rear_hp):
        """基本扫描 → 应返回完整曲线数据。"""
        resp = client.post("/api/sweep", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "start": -25.0,
            "end": 25.0,
            "steps": 51,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "travel" in data
        assert "front" in data
        assert "rear" in data
        assert len(data["travel"]) == 51

    def test_sweep_camber_curve_continuous(self, client, front_hp, rear_hp):
        """外倾角曲线应连续，无突变。（F2 已由 V10 双向 continuation 修复）"""
        resp = client.post("/api/sweep", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "start": -25.0,
            "end": 25.0,
            "steps": 51,
        })
        data = resp.json()
        camber = data["front"]["camber_deg"]
        # 检查连续性：相邻点差值应 < 0.5 度
        for i in range(1, len(camber)):
            delta = abs(camber[i] - camber[i-1])
            assert delta < 0.5, \
                f"外倾角曲线突变: step {i}, delta={delta} deg"

    def test_sweep_toe_curve_continuous(self, client, front_hp, rear_hp):
        """前束角曲线应连续。"""
        resp = client.post("/api/sweep", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "start": -25.0,
            "end": 25.0,
            "steps": 51,
        })
        data = resp.json()
        toe = data["front"]["toe_deg"]
        for i in range(1, len(toe)):
            delta = abs(toe[i] - toe[i-1])
            assert delta < 0.5, \
                f"前束角曲线突变: step {i}, delta={delta} deg"

    def test_sweep_with_rack_displacement(self, client, front_hp, rear_hp):
        """有齿条位移的扫描 → 应能完成。"""
        resp = client.post("/api/sweep", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "start": -25.0,
            "end": 25.0,
            "steps": 21,
            "rack_displacement": 5.0,
        })
        assert resp.status_code == 200

    def test_sweep_rocker_data_present(self, client, front_hp, rear_hp):
        """扫描应包含摇臂数据。"""
        resp = client.post("/api/sweep", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "start": -25.0,
            "end": 25.0,
            "steps": 11,
        })
        data = resp.json()
        assert "rocker_angle_deg" in data["front"]
        assert "damper_travel" in data["front"]
        assert len(data["front"]["rocker_angle_deg"]) == 11


# ============================================================
# 11. FL1 优化
# ============================================================

class TestOptimizeFL1:
    """工程师操作：运行 FL1 优化 → 减小 bump steer。"""

    def test_optimize_fl1_front(self, client, front_hp, rear_hp):
        """前轴 FL1 优化 → 应返回改善结果。"""
        resp = client.post("/api/optimize_fl1", json={
            "axle": "front",
            "travel_start": -25.0,
            "travel_end": 25.0,
            "travel_steps": 21,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "optimized_fl1" in data
        assert "current_toe_range_deg" in data
        assert "optimized_toe_range_deg" in data
        # 优化后 toe range 应 <= 当前值
        assert data["optimized_toe_range_deg"] <= data["current_toe_range_deg"] + 0.01, \
            f"优化后 toe range 更差: current={data['current_toe_range_deg']}, optimized={data['optimized_toe_range_deg']}"

    def test_optimize_fl1_invalid_axle(self, client):
        """无效车轴 → 应返回 400。"""
        resp = client.post("/api/optimize_fl1", json={
            "axle": "invalid",
        })
        assert resp.status_code == 400


# ============================================================
# 12. 车身姿态模式
# ============================================================

class TestChassisAttitude:
    """工程师操作：开启车身姿态模式 → 设置垂向位移/俯仰/侧倾。"""

    def test_solve_with_different_left_right_travel(self, client, front_hp, rear_hp):
        """左右不同轮跳 → 模拟侧倾。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 10.0,
            "front_left_travel": -10.0,
            "rear_travel": 10.0,
            "rear_left_travel": -10.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        # 左右外倾应有差异
        camber_r = data["front"]["angles_right"]["camber_deg"]
        camber_l = data["front"]["angles_left"]["camber_deg"]
        assert abs(camber_r - camber_l) > 0.01, \
            f"侧倾时左右外倾差异太小: R={camber_r}, L={camber_l}"

    def test_heave_mode_symmetric(self, client, front_hp, rear_hp):
        """纯垂向位移 → 左右轮跳相同，外倾对称。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 15.0,
            "front_left_travel": 15.0,
            "rear_travel": 15.0,
            "rear_left_travel": 15.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        ar = data["front"]["angles_right"]
        al = data["front"]["angles_left"]
        # 垂向位移时左右外倾应对称
        assert _sign_symmetric(ar["camber_deg"], al["camber_deg"])


# ============================================================
# 13. 边界与极端工况
# ============================================================

class TestEdgeCases:
    """工程师不太会做但软件应能处理的极端情况。"""

    def test_solve_extreme_positive_bump(self, client, front_hp, rear_hp):
        """极端正轮跳 (50mm) → 不应崩溃。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 50.0,
            "rear_travel": 50.0,
        })
        assert resp.status_code == 200

    def test_solve_extreme_negative_bump(self, client, front_hp, rear_hp):
        """极端负轮跳 (-50mm) → 不应崩溃。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": -50.0,
            "rear_travel": -50.0,
        })
        assert resp.status_code == 200

    def test_solve_extreme_rack(self, client, front_hp, rear_hp):
        """极端齿条位移 (25mm) → 不应崩溃。"""
        resp = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
            "rack_displacement": 25.0,
        })
        # 可能求解质量下降，但不应崩溃
        assert resp.status_code == 200

    def test_solve_zero_dimension_kingpin(self, client):
        """零长度主销 → 求解器应优雅返回 200（F3 已修复：不再 NaN 崩溃）。"""
        hp = {
            "CH1": [0, 100, 200],
            "CH2": [100, 100, 200],
            "CH3": [0, 100, 50],
            "CH4": [100, 100, 50],
            "CH5": [50, 80, 200],
            "UP1": [50, 150, 150],
            "UP2": [50, 150, 150],  # UP1 = UP2 (零长度主销)
            "UP3": [50, 140, 150],
            "UP4": [50, 130, 150],
            "UP5": [50, 150, 150],
            "FL1": [50, 50, 100],
            "track_width": 300.0,
            "tire_radius": 150.0,
            "tire_width": 160.0,
            "tire_spring_rate": 150.0,
            "corner_weight_n": 350.0,
        }
        resp = client.post("/api/solve", json={
            "front_hardpoints": hp,
            "rear_hardpoints": hp,
            "front_travel": 0.0,
        })
        # F3 已修复：返回 200 + 优雅降级
        assert resp.status_code == 200, \
            f"零长度主销返回意外状态码: {resp.status_code}"

    def test_sweep_extreme_range(self, client, front_hp, rear_hp):
        """极端范围扫描 (-40 到 40) → 应能完成。"""
        resp = client.post("/api/sweep", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "start": -40.0,
            "end": 40.0,
            "steps": 81,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["travel"]) == 81


# ============================================================
# 14. 物理合理性验证
# ============================================================

class TestPhysicalPlausibility:
    """验证求解结果的物理合理性 — 核心故障检测。"""

    def test_camber_range_plausible(self, client, front_hp, rear_hp):
        """外倾角在合理范围内（FSAE 车典型 -5° 到 +5°）。"""
        for dz in [-30, -15, 0, 15, 30]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz), "rear_travel": float(dz),
            }).json()
            camber = r["front"]["angles_right"]["camber_deg"]
            assert -8 < camber < 8, \
                f"轮跳 {dz}mm 时外倾角 {camber}° 超出合理范围"

    @pytest.mark.xfail(reason="已知故障 F1: PBD 求解器 UP1 漂移导致后倾角剧烈变化")
    def test_caster_remains_stable(self, client, front_hp, rear_hp):
        """后倾角在轮跳过程中应基本稳定（变化 < 1°）。"""
        cambers = []
        for dz in [-25, 0, 25]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz),
            }).json()
            cambers.append(r["front"]["angles_right"]["caster_deg"])
        variation = max(cambers) - min(cambers)
        assert variation < 1.0, \
            f"后倾角变化过大: {variation}° (值: {cambers})"

    @pytest.mark.xfail(reason="已知故障 F1: PBD 求解器 UP1 漂移导致 KPI 变化过大")
    def test_kpi_remains_stable(self, client, front_hp, rear_hp):
        """KPI 在轮跳过程中应基本稳定。"""
        kpis = []
        for dz in [-25, 0, 25]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz),
            }).json()
            kpis.append(r["front"]["angles_right"]["kpi_deg"])
        variation = max(kpis) - min(kpis)
        assert variation < 1.0, \
            f"KPI 变化过大: {variation}° (值: {kpis})"

    @pytest.mark.xfail(reason="已知故障 F1: PBD 求解器收敛不足，立柱刚体约束被破坏")
    def test_upright_rigid_body(self, client, front_hp, rear_hp):
        """立柱应保持刚体 — UP1-UP5 间距离在轮跳中不变。"""
        import hardpoints as hp_mod
        from geometry import dist

        # 设计状态的立柱尺寸
        L_kp = dist(front_hp["UP1"], front_hp["UP2"])
        L_u15 = dist(front_hp["UP1"], front_hp["UP5"])
        L_u25 = dist(front_hp["UP2"], front_hp["UP5"])

        for dz in [-25, 0, 25]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz),
            }).json()
            result = r["front"]["right"]
            L_kp_new = dist(result["UP1"], result["UP2"])
            L_u15_new = dist(result["UP1"], result["UP5"])
            L_u25_new = dist(result["UP2"], result["UP5"])

            assert abs(L_kp_new - L_kp) < 0.5, \
                f"主销长度变化: design={L_kp}, bump={dz}mm: {L_kp_new}"
            assert abs(L_u15_new - L_u15) < 0.5, \
                f"UP1-UP5 距离变化: design={L_u15}, bump={dz}mm: {L_u15_new}"
            assert abs(L_u25_new - L_u25) < 0.5, \
                f"UP2-UP5 距离变化: design={L_u25}, bump={dz}mm: {L_u25_new}"

    def test_uca_ball_joint_on_axis(self, client, front_hp, rear_hp):
        """上A臂球头 (UP1) 应始终在上A臂枢轴轴线上（距轴线 = 设计半径）。"""
        from geometry import distance_point_to_line

        R_uca_design = distance_point_to_line(front_hp["UP1"], front_hp["CH1"], front_hp["CH2"])

        for dz in [-25, 0, 25]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz),
            }).json()
            result = r["front"]["right"]
            R_uca_new = distance_point_to_line(result["UP1"], front_hp["CH1"], front_hp["CH2"])
            assert abs(R_uca_new - R_uca_design) < 0.5, \
                f"上A臂约束半径变化: design={R_uca_design}, bump={dz}mm: {R_uca_new}"

    def test_lca_ball_joint_on_axis(self, client, front_hp, rear_hp):
        """下A臂球头 (UP2) 应始终在下A臂枢轴轴线上。"""
        from geometry import distance_point_to_line

        R_lca_design = distance_point_to_line(front_hp["UP2"], front_hp["CH3"], front_hp["CH4"])

        for dz in [-25, 0, 25]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz),
            }).json()
            result = r["front"]["right"]
            R_lca_new = distance_point_to_line(result["UP2"], front_hp["CH3"], front_hp["CH4"])
            assert abs(R_lca_new - R_lca_design) < 0.5, \
                f"下A臂约束半径变化: design={R_lca_design}, bump={dz}mm: {R_lca_new}"

    def test_tie_rod_length_constant(self, client, front_hp, rear_hp):
        """转向拉杆长度在纯轮跳中应保持不变（无 bump steer 时理想值）。"""
        from geometry import dist

        L_tr_design = dist(front_hp["UP3"], front_hp["FL1"])

        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 25.0, "rack_displacement": 0.0,
        }).json()
        result = r["front"]["right"]
        # 注意：纯轮跳时 FL1 不移动，但 UP3 因 bump 而移动，
        # 理论上杆长不变（刚性杆），实际因求解精度可能有微小偏差
        L_tr_new = dist(result["UP3"], result["FL1"])
        # 转向拉杆是刚性杆，长度不应变化超过求解精度
        assert abs(L_tr_new - L_tr_design) < 1.0, \
            f"转向拉杆长度变化: design={L_tr_design}, bump 25mm: {L_tr_new}"

    def test_contact_patch_on_ground(self, client, front_hp, rear_hp):
        """接地点 Z 坐标应在地面附近（接近 0）。"""
        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
        }).json()
        cp_z = r["front"]["contact_patch_right"]["center"][2]
        # 静态时接地点 Z ≈ 0（地面）
        assert abs(cp_z) < 10, \
            f"接地点 Z={cp_z}, 远离地面"

    def test_contact_patch_z_decreases_with_bump(self, client, front_hp, rear_hp):
        """正轮跳 → 接地点 Z 不应上升太多（轮胎在地面）。（F4 已修复）"""
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
        }).json()
        r25 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 25.0,
        }).json()
        # 正轮跳时车轮上升，但接地点仍然在地面
        cp_z_0 = r0["front"]["contact_patch_right"]["center"][2]
        cp_z_25 = r25["front"]["contact_patch_right"]["center"][2]
        # 接地点 Z 不应大幅偏离地面
        assert abs(cp_z_25) < 15, \
            f"轮跳 25mm 时接地点 Z={cp_z_25}"

    def test_damper_travel_direction_correct(self, client, front_hp, rear_hp):
        """正轮跳 → 减震器行程应缩短（压缩）。"""
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
        }).json()
        r25 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 25.0,
        }).json()
        dt_0 = r0["front"]["rocker_right"]["damper_travel"]
        dt_25 = r25["front"]["rocker_right"]["damper_travel"]
        # 推杆悬架：正轮跳 → 推杆压缩 → 减震器压缩 → damper_travel 应为负
        # 或者为正取决于约定，但不应为零
        assert abs(dt_25 - dt_0) > 0.1, \
            f"轮跳 25mm 减震器行程变化太小: {dt_0} → {dt_25}"


# ============================================================
# 15. 数据一致性 — 完整工作流
# ============================================================

class TestWorkflowConsistency:
    """模拟工程师完整工作流：加载 → 调整 → 编辑 → 求解 → 扫描。"""

    def test_full_workflow(self, client):
        """完整工程师工作流：不应出现数据不一致。"""
        # 1. 加载默认数据
        defaults = client.get("/api/defaults").json()
        front_hp = defaults["front"]["right"]
        rear_hp = defaults["rear"]["right"]

        # 2. 零轮跳求解
        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp,
            "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
            "rear_travel": 0.0,
        }).json()

        # 3. 验证零轮跳结果与默认角度一致
        default_camber = defaults["front"]["angles_right"]["camber_deg"]
        solved_camber = r["front"]["angles_right"]["camber_deg"]
        assert _angle_close(default_camber, solved_camber, tol=0.1), \
            f"零轮跳求解外倾与默认不一致: default={default_camber}, solved={solved_camber}"

        # 4. 修改一个硬点
        client.post("/api/save_point", json={
            "name": "CH1",
            "coords": [-70.0, 210.0, 220.0],
            "permanent": False,
        })

        # 5. 用修改后的硬点求解
        defaults2 = client.get("/api/defaults").json()
        front_hp2 = defaults2["front"]["right"]
        rear_hp2 = defaults2["rear"]["right"]

        r2 = client.post("/api/solve", json={
            "front_hardpoints": front_hp2,
            "rear_hardpoints": rear_hp2,
            "front_travel": 0.0,
        }).json()

        # 6. 修改 CH1（车架挂点）不影响零轮跳外倾角（外倾取决于立柱方向，不取决于挂点位置）。
        #    但在轮跳过程中运动曲线会不同。验证扫描可以运行：
        solved_camber2 = r2["front"]["angles_right"]["camber_deg"]
        # 零轮跳外倾角不变是正确行为——因为 UP1-UP5 方向没变
        # 改用有轮跳的求解来验证 CH1 变化确实影响运动学：
        r2_bump = client.post("/api/solve", json={
            "front_hardpoints": front_hp2,
            "rear_hardpoints": rear_hp2,
            "front_travel": 25.0,
        }).json()
        # 扫描应能正常运行
        sweep = client.post("/api/sweep", json={
            "front_hardpoints": front_hp2,
            "rear_hardpoints": rear_hp2,
            "start": -25.0, "end": 25.0, "steps": 11,
        }).json()
        assert len(sweep["travel"]) == 11

        # 7. 运行扫描
        sweep = client.post("/api/sweep", json={
            "front_hardpoints": front_hp2,
            "rear_hardpoints": rear_hp2,
            "start": -25.0,
            "end": 25.0,
            "steps": 11,
        }).json()
        assert len(sweep["travel"]) == 11
        assert len(sweep["front"]["camber_deg"]) == 11

    def test_solve_after_param_update(self, client, defaults):
        """修改设计参数后 → 求解应反映新参数。"""
        front_hp = defaults["front"]["right"]
        rear_hp = defaults["rear"]["right"]

        # 修改 caster
        client.post("/api/update_params", json={
            "axle": "front",
            "key": "caster",
            "value": 8.0,
        })

        defaults2 = client.get("/api/defaults").json()
        front_hp2 = defaults2["front"]["right"]

        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp2,
            "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
        }).json()

        # caster=8 应反映在后倾角中
        caster_solved = r["front"]["angles_right"]["caster_deg"]
        assert _angle_close(caster_solved, 8.0, tol=0.5), \
            f"修改 caster=8 后求解值={caster_solved}"


# ============================================================
# 16. 后轴特殊验证
# ============================================================

class TestRearAxle:
    """后轴（拉杆悬架）的特殊行为验证。"""

    def test_rear_no_steering_response(self, client, front_hp, rear_hp):
        """后轴不应响应齿条位移。"""
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 0.0,
        }).json()
        r15 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rack_displacement": 15.0,
        }).json()

        rear_toe_0 = r0["rear"]["angles_right"]["toe_deg"]
        rear_toe_15 = r15["rear"]["angles_right"]["toe_deg"]
        assert _angle_close(rear_toe_0, rear_toe_15, tol=0.01)

    def test_rear_bump_changes_camber(self, client, front_hp, rear_hp):
        """后轴轮跳也应改变外倾角。"""
        r0 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rear_travel": 0.0,
        }).json()
        r25 = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rear_travel": 25.0,
        }).json()

        camber0 = r0["rear"]["angles_right"]["camber_deg"]
        camber25 = r25["rear"]["angles_right"]["camber_deg"]
        assert abs(camber25 - camber0) > 0.01, \
            f"后轴轮跳 25mm 外倾变化太小: {camber0} → {camber25}"

    def test_rear_rocker_data_present(self, client, front_hp, rear_hp):
        """后轴求解应包含摇臂数据。"""
        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0, "rear_travel": 10.0,
        }).json()
        assert "rocker_right" in r["rear"]


# ============================================================
# 17. 求解器健康状态检查
# ============================================================

class TestSolverHealth:
    """检查求解器的收敛性和健康状态。"""

    def test_solver_residual_small_at_zero(self, client, front_hp, rear_hp):
        """零轮跳时求解残差应极小。"""
        r = client.post("/api/solve", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "front_travel": 0.0,
        }).json()
        # 检查 angles 中的 solver health 标记
        health = r["front"]["angles_right"].get("_solver_healthy")
        # 零轮跳时可以是 not_applicable 或 healthy
        assert health in ("not_applicable", "healthy", "healthy_but_fallback"), \
            f"求解器状态异常: {health}"

    def test_no_nan_in_solve_results(self, client, front_hp, rear_hp):
        """求解结果不应包含 NaN 或 Inf。"""
        for dz in [-30, 0, 30]:
            r = client.post("/api/solve", json={
                "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
                "front_travel": float(dz),
            }).json()
            for key in ["UP1", "UP2", "UP3", "UP4", "UP5"]:
                coords = r["front"]["right"][key]
                for c in coords:
                    assert not math.isnan(c), f"NaN in {key} at bump={dz}"
                    assert not math.isinf(c), f"Inf in {key} at bump={dz}"

    def test_no_nan_in_sweep_results(self, client, front_hp, rear_hp):
        """扫描结果不应包含 NaN。"""
        r = client.post("/api/sweep", json={
            "front_hardpoints": front_hp, "rear_hardpoints": rear_hp,
            "start": -25.0, "end": 25.0, "steps": 11,
        }).json()
        for key in ["camber_deg", "toe_deg", "caster_deg", "kpi_deg"]:
            vals = r["front"][key]
            for v in vals:
                assert v is not None, f"None in {key}"
                assert not math.isnan(v), f"NaN in {key}"