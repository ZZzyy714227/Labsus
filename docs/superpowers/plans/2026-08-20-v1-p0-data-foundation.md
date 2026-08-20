# V1 P0 数据地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实设计文档（`2026-08-16-fsae-chassis-development-tool-v1-design.md`）§14 的 P0 阶段：固定坐标/符号/角度规范、建立手算 benchmark、落地 `ChassisDesign`/`AnalysisCase`/`AnalysisResult` schema 与 JSON 版本化存储、legacy 数据导入、冻结 v2 API 边界。

**Architecture:** 新增 `src/core/` 包（convention / models / store / legacy_import），不改动任何现有求解器与旧 API；新增 `/api/v2/*` 版本化路由，v2 solve 暂时直通现有顺序 bump→steer 求解器并显式标记 `APPROXIMATE`（P1 误差论证前的兼容路径，设计文档 §5.2）。前端迁移不在 P0 范围（localStorage 快照迁移随 P4 工作流落地）。

**Tech Stack:** Python 3.13 / FastAPI 0.136 / Pydantic 2.13 / pytest；存储为 `data/store/` 下 JSON 文件（设计文档 §11.1，V1 不引入 SQLite）。

**关键事实（已用探针核实，写死在本计划中）：**
- 默认前轴静态（右轮）：camber −2.49 / kpi 2.51 / caster 5.005 / toe 0.0 / scrub 19.78 / caster_trail −22.36
- dz=+15 polish：camber −2.174 / kpi 2.174 / caster 5.598 / toe 0.207
- rack=+5mm：toe_R −3.3 / toe_L +3.3（平行转向）
- caster 符号与经典定义一致（主销轴上端后倾为正）；trail 输出符号与经典机械拖距相反（K-3）
- 左右镜像 scrub 不对称（右 19.78 vs 左 17.84）——已登记为 K-1，P2 修复

---

### Task 1: 坐标/符号/角度规范模块 + 锁定测试

**Files:**
- Create: `src/core/__init__.py`
- Create: `src/core/convention.py`
- Test: `tests/test_convention.py`

- [ ] **Step 1: 创建包与规范模块**

`src/core/__init__.py`:

```python
"""V1 core domain: conventions, models, storage (P0 data foundation)."""
```

`src/core/convention.py`:

```python
"""坐标、符号与角度规范 — V1 冻结基线（设计文档 §12）。

本模块是规范的唯一真源；tests/test_convention.py 固定全部条款。
修改规范必须同时修改本模块、测试与设计文档。

坐标系
------
X：车辆前方（+X = 前）；Y：车辆右侧（+Y = 右）；Z：垂直向上。
原点：前轴中心地面。

角度符号（P0 冻结当前求解器行为；工程化统一由 P2 完成）
--------------------------------------------------------
- Camber：负 = 内倾（胎顶朝车辆中心线）。
- Toe：右轮 toe_deg = atan2(-x_axis_y, -x_axis_x)，toe-in 为负（见 K-2）。
  左轮经 fix_left_angles 翻号，使对称工况左右显示同号。
- KPI：正 = 主销轴上端向车内倾斜。
- Caster：正 = 主销轴上端后倾（与经典定义一致）。
- Scrub：右轮 = contact_y - kingpin_ground_y（正 = 接地点在主销接地点外侧）。
- Trail：caster_trail_mm = kingpin_ground_x - contact_x；
  经典机械拖距（正 = 接地点在主销接地点之后）= -caster_trail_mm（见 K-3）。

转向
----
- rack_displacement 正 = 齿条向车辆右侧（+Y）平移。
- 实测：rack=+5mm → 右轮 toe ≈ −3.3°，左轮 toe ≈ +3.3°（两轮平行同向偏转）。

已知规范问题登记（Known Issues）
--------------------------------
- K-1：左右镜像对称性破坏。前轴静态 scrub 右 19.78mm / 左 17.84mm，
  违反设计文档 §13.2（镜像输入差异 ≤ 1e-6）。根因在 compute_contact_patch
  对镜像几何的处理与 fix_left_angles 只翻符号。P2 修复。
- K-2：toe 符号与工程习惯（toe-in 为正）相反。P2 统一并写入方案元数据。
- K-3：caster_trail_mm 符号与经典机械拖距相反。P2 统一。
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class CoordinateConvention:
    """嵌入每个 ChassisDesign 元数据，声明该方案数值所遵循的坐标与符号约定。"""

    x_axis: str = "forward"
    y_axis: str = "right"
    z_axis: str = "up"
    origin: str = "front_axle_center_ground"
    camber_positive: str = "top_out"
    toe_positive: str = "toe_out_right_wheel"          # K-2
    kpi_positive: str = "axis_top_inboard"
    caster_positive: str = "axis_top_rearward"
    scrub_definition: str = "contact_y_minus_kingpin_ground_y_right"
    trail_definition: str = "kingpin_ground_x_minus_contact_x"  # K-3
    rack_positive: str = "rack_toward_vehicle_right"
    spec_revision: str = "v1-p0"


DEFAULT_CONVENTION = CoordinateConvention()

KNOWN_ISSUES = ("K-1", "K-2", "K-3")
```

- [ ] **Step 2: 写锁定测试**

`tests/test_convention.py`:

```python
"""规范锁定测试：黄金值 + 符号行为 + 已知缺陷登记（设计文档 §12/§13.2）。"""
import math

import pytest

from core.convention import DEFAULT_CONVENTION, KNOWN_ISSUES
from hardpoints import DEFAULT_HARDPOINTS, mirror_left
from routes.solve import _solve_axle
from solver.angles import compute_alignment_angles, fix_left_angles


def _static_angles(hp):
    return compute_alignment_angles(hp, hp=hp)


class TestConventionMetadata:
    def test_axes_and_origin(self):
        c = DEFAULT_CONVENTION
        assert (c.x_axis, c.y_axis, c.z_axis) == ("forward", "right", "up")
        assert c.origin == "front_axle_center_ground"

    def test_sign_clauses_frozen(self):
        c = DEFAULT_CONVENTION
        assert c.caster_positive == "axis_top_rearward"
        assert c.kpi_positive == "axis_top_inboard"
        assert c.rack_positive == "rack_toward_vehicle_right"
        assert c.spec_revision == "v1-p0"

    def test_known_issues_registered(self):
        assert KNOWN_ISSUES == ("K-1", "K-2", "K-3")


class TestGoldenValues:
    """默认硬点黄金值（2026-08-20 探针固化；defaults 变化时必须重审）。"""

    def test_front_right_static(self):
        a = _static_angles(DEFAULT_HARDPOINTS)
        assert a["camber_deg"] == pytest.approx(-2.49, abs=0.005)
        assert a["kpi_deg"] == pytest.approx(2.51, abs=0.005)
        assert a["caster_deg"] == pytest.approx(5.005, abs=0.005)
        assert a["toe_deg"] == pytest.approx(0.0, abs=0.005)
        assert a["scrub_radius_mm"] == pytest.approx(19.78, abs=0.01)
        assert a["caster_trail_mm"] == pytest.approx(-22.36, abs=0.01)

    def test_front_right_bump15_polish(self):
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 15.0, 0.0, mirror=False, polish=True)
        a = ax["angles_right"]
        assert a["camber_deg"] == pytest.approx(-2.174, abs=0.005)
        assert a["kpi_deg"] == pytest.approx(2.174, abs=0.005)
        assert a["caster_deg"] == pytest.approx(5.598, abs=0.005)
        assert a["toe_deg"] == pytest.approx(0.207, abs=0.005)

    def test_rack_positive_parallel_steer(self):
        ax = _solve_axle(dict(DEFAULT_HARDPOINTS), 0.0, 5.0, mirror=True)
        angles_left = fix_left_angles(dict(ax["angles_left"]), ax["angles_right"])
        assert ax["angles_right"]["toe_deg"] == pytest.approx(-3.3, abs=0.05)
        assert angles_left["toe_deg"] == pytest.approx(3.3, abs=0.05)


class TestMirrorSymmetry:
    @pytest.mark.xfail(
        strict=True,
        reason="K-1：左右镜像 scrub 不对称（19.78 vs 17.84），P2 修复后必须通过并移除标记",
    )
    def test_scrub_magnitude_symmetric(self):
        a_r = _static_angles(DEFAULT_HARDPOINTS)
        hp_l = mirror_left(DEFAULT_HARDPOINTS)
        a_l = fix_left_angles(_static_angles(hp_l), a_r)
        assert a_r["scrub_radius_mm"] == pytest.approx(-a_l["scrub_radius_mm"], abs=1e-6)
```

- [ ] **Step 3: 运行测试确认通过**

Run: `python -m pytest tests/test_convention.py -v`
Expected: 全部 PASS（xfail 项为 XFAIL，strict 模式下不计失败）

- [ ] **Step 4: 回归确认**

Run: `python -m pytest tests/ -x -q --ignore=tests/e2e`
Expected: 原 205 passed + 新测试全绿，无新增失败

---

### Task 2: 手算 benchmark 测试

**Files:**
- Test: `tests/test_hand_benchmark.py`

- [ ] **Step 1: 写失败/通过的解析 benchmark 测试**

所有期望值均为手算解析值（不依赖求解器输出）。

`tests/test_hand_benchmark.py`:

```python
"""手算 benchmark（设计文档 §13.1 第 2 层）：
用解析可算的合成硬点验证主销/接地几何公式本身。
"""
import math

import pytest

from solver.angles import compute_alignment_angles
from solver.bump import solve_bump
from hardpoints import DEFAULT_HARDPOINTS

BODY_KEYS = ("CH1", "CH2", "CH3", "CH4", "CH5", "FL1")


def _synthetic(up1, up2, up5=(0, 610, 250)):
    """右轮合成硬点：车身点不影响定位角公式，只放合法值。"""
    hp = {
        "CH1": [0, 400, 350], "CH2": [100, 400, 350],
        "CH3": [0, 380, 100], "CH4": [100, 380, 100],
        "CH5": [10, 150, 300], "FL1": [60, 300, 250],
        "UP1": list(up1), "UP2": list(up2), "UP3": [50, 500, 250],
        "UP4": [0, 500, 150], "UP5": list(up5),
        "tire_radius": 100.0, "tire_width": 180.0,
        "tire_spring_rate": 100.0, "corner_weight_n": 1000.0,
    }
    return hp


class TestAnalyticKingpin:
    def test_vertical_kingpin_zero_angles(self):
        """竖直主销：KPI=caster=camber=toe=0；scrub = 610-500 = 110；trail = 0。"""
        a = compute_alignment_angles(_synthetic((0, 500, 400), (0, 500, 100)),
                                     hp=_synthetic((0, 500, 400), (0, 500, 100)))
        assert a["kpi_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["caster_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["camber_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["toe_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["scrub_radius_mm"] == pytest.approx(110.0, abs=1e-6)
        assert a["caster_trail_mm"] == pytest.approx(0.0, abs=1e-6)

    def test_top_rearward_is_positive_caster(self):
        """上端后倾 30mm/300mm：caster = atan2(30, 300) = +5.7106°（经典定义）。
        主销接地点 x = 30 - (400/300)*30 = -10；接地点 x ≈ 0 → trail = -10。"""
        hp = _synthetic((30, 500, 400), (0, 500, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["caster_deg"] == pytest.approx(math.degrees(math.atan2(30, 300)), abs=1e-3)
        assert a["kpi_deg"] == pytest.approx(0.0, abs=1e-9)
        assert a["caster_trail_mm"] == pytest.approx(-10.0, abs=1e-3)

    def test_top_forward_is_negative_caster(self):
        hp = _synthetic((-30, 500, 400), (0, 500, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["caster_deg"] == pytest.approx(-math.degrees(math.atan2(30, 300)), abs=1e-3)
        assert a["caster_trail_mm"] == pytest.approx(10.0, abs=1e-3)

    def test_kpi_axis_top_inboard_positive(self):
        """下端外移 60mm/300mm：KPI = atan2(60, 300) = +11.3099°。"""
        hp = _synthetic((0, 500, 400), (0, 560, 100))
        a = compute_alignment_angles(hp, hp=hp)
        assert a["kpi_deg"] == pytest.approx(math.degrees(math.atan2(60, 300)), abs=1e-3)
        assert a["caster_deg"] == pytest.approx(0.0, abs=1e-9)


class TestResidualThresholds:
    """设计文档 §13.2：polish 区（|dz| ≤ 15mm）刚性残差 ≤ 0.02mm。"""

    @pytest.mark.parametrize("dz", [-15.0, -7.0, 0.0, 7.0, 15.0])
    def test_polish_residual_within_threshold(self, dz):
        r = solve_bump(dict(DEFAULT_HARDPOINTS), dz, polish=True)
        assert r["max_residual"] <= 0.02
```

- [ ] **Step 2: 运行测试确认通过**

Run: `python -m pytest tests/test_hand_benchmark.py -v`
Expected: 全部 PASS（解析值与公式行为一致；若某条失败，说明探针期结论有误，先查公式再改断言）

---

### Task 3: 核心数据模型（ChassisDesign / AnalysisCase / AnalysisResult）

**Files:**
- Create: `src/core/models.py`
- Test: `tests/test_core_models.py`

- [ ] **Step 1: 写模型测试（先红）**

`tests/test_core_models.py`:

```python
"""核心 schema 测试：版本结构、姿态派生标签、结果状态枚举。"""
import pytest
from pydantic import ValidationError

from core.models import (
    AnalysisCase, AnalysisResult, AxleHardpoints, CaseVersion, ChassisDesign,
    DesignVersion, ResultStatus, WheelTravel,
)


def _axle(y=610.0):
    return AxleHardpoints(
        points={
            "CH1": [0, 400, 350], "CH2": [100, 400, 350],
            "CH3": [0, 380, 100], "CH4": [100, 380, 100],
            "CH5": [10, 150, 300], "FL1": [60, 300, 250],
            "UP1": [0, 500, 400], "UP2": [0, 500, 100],
            "UP3": [50, 500, 250], "UP4": [0, 500, 150],
            "UP5": [0, y, 250],
        },
        tire={"tire_radius": 260.0, "tire_width": 205.0,
              "tire_spring_rate": 150.0, "corner_weight_n": 700.0},
    )


class TestDesignVersion:
    def test_from_right_template_mirrors_left(self):
        dv = DesignVersion.from_right_template(
            version=1, front_right=_axle(), rear_right=_axle(y=590.0),
            vehicle={"mass_kg": 280.0}, name="t")
        assert dv.front_left.points["UP5"][1] == pytest.approx(-610.0)
        assert dv.rear_left.points["UP5"][1] == pytest.approx(-590.0)
        # 镜像只初始化：此后左右是独立实体（字段独立可改）
        dv.front_left.points["UP5"][1] = -600.0
        assert dv.front_right.points["UP5"][1] == pytest.approx(610.0)

    def test_convention_embedded(self):
        dv = DesignVersion.from_right_template(
            version=1, front_right=_axle(), rear_right=_axle(), vehicle={})
        assert dv.convention.y_axis == "right"

    def test_point_keys_validated(self):
        with pytest.raises(ValidationError):
            AxleHardpoints(points={"BAD_KEY": [0, 0, 0]})


class TestCaseVersion:
    def test_derived_pose_labels(self):
        cv = CaseVersion(version=1, travel=WheelTravel(fl=20, fr=-20, rl=20, rr=-20))
        pose = cv.derived_pose(front_track_mm=1220, rear_track_mm=1180, wheelbase_mm=1550)
        assert pose["heave_mm"] == pytest.approx(0.0)
        assert pose["roll_deg"] > 0          # 左侧抬起为正（见 models 文档）
        assert pose["pitch_deg"] == pytest.approx(0.0)

    def test_heave_label(self):
        cv = CaseVersion(version=1, travel=WheelTravel(fl=20, fr=20, rl=20, rr=20))
        pose = cv.derived_pose(1220, 1180, 1550)
        assert pose["heave_mm"] == pytest.approx(20.0)
        assert pose["roll_deg"] == pytest.approx(0.0)
        assert pose["pitch_deg"] == pytest.approx(0.0)


class TestAnalysisResult:
    def test_binds_design_case_and_solver(self):
        r = AnalysisResult(
            result_id="r1", design_id="d1", design_version=2,
            case_id="c1", case_version=1,
            solver="sequential-bump-steer-v1", status=ResultStatus.APPROXIMATE)
        assert r.design_version == 2
        assert r.status == "APPROXIMATE"

    def test_all_statuses_defined(self):
        names = {s.value for s in ResultStatus}
        assert names == {"VALID", "APPROXIMATE", "NOT_APPLICABLE", "NOT_IMPLEMENTED",
                         "SOLVER_FAILED", "EQUILIBRIUM_FAILED", "OUT_OF_RANGE"}


class TestContainerDocs:
    def test_design_latest_tracks_versions(self):
        d = ChassisDesign(design_id="x", versions=[], latest=0)
        assert d.latest == 0
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_core_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.models'`

- [ ] **Step 3: 实现 models.py**

`src/core/models.py`:

```python
"""V1 核心数据模型（设计文档 §3/§4/§10/§11）。

- ChassisDesign：整车底盘方案，append-only 版本列表；左右硬点为独立实例，
  左侧可由右侧模板镜像初始化（§5.1），之后独立编辑。
- AnalysisCase：工况。四轮轮跳 + 齿条位移是唯一几何驱动量；
  heave/roll/pitch 仅为派生标签（§4.1）。
- AnalysisResult：不可变结果，绑定方案版本 + 工况版本 + 求解器（§3.1）。
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator

from core.convention import DEFAULT_CONVENTION, CoordinateConvention

POINT_KEYS = frozenset({"CH1", "CH2", "CH3", "CH4", "CH5",
                        "UP1", "UP2", "UP3", "UP4", "UP5", "FL1"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ResultStatus(str, Enum):
    """结果可信度状态（设计文档 §10）。"""
    VALID = "VALID"
    APPROXIMATE = "APPROXIMATE"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    SOLVER_FAILED = "SOLVER_FAILED"
    EQUILIBRIUM_FAILED = "EQUILIBRIUM_FAILED"
    OUT_OF_RANGE = "OUT_OF_RANGE"


class AxleHardpoints(BaseModel):
    """单轴单侧硬点实例。points 键必须属于 POINT_KEYS（无前缀，轴由字段名区分）。"""
    points: dict[str, list[float]]
    tire: dict[str, float] = Field(default_factory=dict)

    @field_validator("points")
    @classmethod
    def _check_keys(cls, v):
        bad = set(v) - POINT_KEYS
        missing = POINT_KEYS - set(v)
        if bad or missing:
            raise ValueError(f"invalid point keys: bad={sorted(bad)} missing={sorted(missing)}")
        return v

    def mirrored(self) -> "AxleHardpoints":
        return AxleHardpoints(
            points={k: [p[0], -p[1], p[2]] for k, p in self.points.items()},
            tire=dict(self.tire))

    def flat(self) -> dict:
        """还原为旧求解器使用的扁平 hp dict（点 + 轮胎标量）。"""
        out = {k: list(p) for k, p in self.points.items()}
        out.update(self.tire)
        return out


class DesignVersion(BaseModel):
    version: int
    name: str = ""
    notes: str = ""
    created_at: str = Field(default_factory=_now_iso)
    convention: CoordinateConvention = Field(default_factory=lambda: DEFAULT_CONVENTION)
    front_right: AxleHardpoints
    front_left: AxleHardpoints
    rear_right: AxleHardpoints
    rear_left: AxleHardpoints
    vehicle: dict[str, float] = Field(default_factory=dict)

    @staticmethod
    def from_right_template(*, version: int, front_right: AxleHardpoints,
                            rear_right: AxleHardpoints, vehicle: dict[str, float],
                            name: str = "", notes: str = "") -> "DesignVersion":
        """从右侧模板镜像初始化左侧实例（§5.1：镜像仅用于初始化）。"""
        return DesignVersion(
            version=version, name=name, notes=notes,
            front_right=front_right, front_left=front_right.mirrored(),
            rear_right=rear_right, rear_left=rear_right.mirrored(),
            vehicle=vehicle)


class ChassisDesign(BaseModel):
    design_id: str
    versions: list[DesignVersion]
    latest: int


class WheelTravel(BaseModel):
    """四轮轮跳输入（mm，正 = 压缩向上）。V1 唯一几何驱动量。"""
    fl: float = 0.0
    fr: float = 0.0
    rl: float = 0.0
    rr: float = 0.0


class LoadsInput(BaseModel):
    """外部载荷输入（单位 g）。az 为相对设计基准的额外垂向加速度，
    重力基准已含于静态垂向载荷，不重复叠加（§8.1）。"""
    ax_g: float = 0.0
    ay_g: float = 0.0
    az_g: float = 0.0
    brake_split_front: float = 0.5
    drive_split_rear: float = 1.0


class CaseOptions(BaseModel):
    arb_enabled: bool = True
    compute_wheel_forces: bool = True
    friction_check: bool = True


class CaseVersion(BaseModel):
    version: int
    name: str = ""
    description: str = ""
    travel: WheelTravel = Field(default_factory=WheelTravel)
    rack_displacement: float = 0.0
    loads: LoadsInput = Field(default_factory=LoadsInput)
    options: CaseOptions = Field(default_factory=CaseOptions)

    def derived_pose(self, front_track_mm: float, rear_track_mm: float,
                     wheelbase_mm: float) -> dict[str, float]:
        """由四轮轮跳反推的姿态标签（§4.1：不作为独立输入）。
        roll_deg 正 = 车身向右倾（左侧悬架伸长）；
        pitch_deg 正 = 车头下沉（前悬架压缩）。"""
        t = self.travel
        heave = (t.fl + t.fr + t.rl + t.rr) / 4.0
        track_avg = (front_track_mm + rear_track_mm) / 2.0
        roll_deg = math.degrees(math.atan2(((t.fl + t.rl) - (t.fr + t.rr)) / 2.0, track_avg))
        pitch_deg = math.degrees(math.atan2(((t.fl + t.fr) - (t.rl + t.rr)) / 2.0, wheelbase_mm))
        return {"heave_mm": round(heave, 4), "roll_deg": round(roll_deg, 4),
                "pitch_deg": round(pitch_deg, 4)}


class AnalysisCase(BaseModel):
    case_id: str
    versions: list[CaseVersion]
    latest: int


class AnalysisResult(BaseModel):
    """不可变分析结果。绑定方案版本 + 工况版本 + 求解器状态（§3.1）。"""
    result_id: str
    design_id: str
    design_version: int
    case_id: str
    case_version: int
    solver: str
    status: ResultStatus
    created_at: str = Field(default_factory=_now_iso)
    residuals: dict[str, float] = Field(default_factory=dict)
    metrics: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_core_models.py -v`
Expected: 全部 PASS

---

### Task 4: JSON DataStore

**Files:**
- Create: `src/core/store.py`
- Test: `tests/test_store.py`

- [ ] **Step 1: 写测试（先红）**

`tests/test_store.py`:

```python
"""DataStore 测试：版本化 CRUD、原子写、幂等读取（tmp_path 隔离）。"""
import pytest

from core.models import (AnalysisCase, AxleHardpoints, CaseVersion,
                         DesignVersion, ResultStatus, AnalysisResult)
from core.store import DataStore


def _axle():
    pts = {"CH1": [0, 400, 350], "CH2": [100, 400, 350], "CH3": [0, 380, 100],
           "CH4": [100, 380, 100], "CH5": [10, 150, 300], "FL1": [60, 300, 250],
           "UP1": [0, 500, 400], "UP2": [0, 500, 100], "UP3": [50, 500, 250],
           "UP4": [0, 500, 150], "UP5": [0, 610, 250]}
    return AxleHardpoints(points=pts, tire={"tire_radius": 260.0})


def _dv(name="v"):
    return DesignVersion.from_right_template(
        version=0, front_right=_axle(), rear_right=_axle(), vehicle={}, name=name)


@pytest.fixture
def store(tmp_path):
    return DataStore(root=tmp_path / "store")


class TestDesigns:
    def test_create_assigns_version_1(self, store):
        doc = store.create_design(_dv(), design_id="d1")
        assert doc.design_id == "d1"
        assert doc.latest == 1
        assert doc.versions[0].version == 1

    def test_create_duplicate_id_rejected(self, store):
        store.create_design(_dv(), design_id="d1")
        with pytest.raises(ValueError):
            store.create_design(_dv(), design_id="d1")

    def test_add_version_increments(self, store):
        store.create_design(_dv("a"), design_id="d1")
        v2 = store.add_design_version("d1", _dv("b"))
        assert v2.version == 2
        assert store.get_design("d1").name == "b"          # 默认取 latest
        assert store.get_design("d1", version=1).name == "a"

    def test_get_missing_raises(self, store):
        with pytest.raises(KeyError):
            store.get_design("nope")
        with pytest.raises(KeyError):
            store.get_design("nope", version=9)

    def test_list_designs_summary(self, store):
        store.create_design(_dv("a"), design_id="d1")
        summary = store.list_designs()
        assert summary == [{"design_id": "d1", "latest": 1, "name": "a"}]

    def test_persists_across_instances(self, tmp_path):
        s1 = DataStore(root=tmp_path / "store")
        s1.create_design(_dv("a"), design_id="d1")
        s2 = DataStore(root=tmp_path / "store")
        assert s2.get_design("d1").name == "a"


class TestCases:
    def test_case_crud(self, store):
        cv = CaseVersion(version=0, name="static")
        doc = store.create_case(cv, case_id="static")
        assert doc.latest == 1
        assert store.get_case("static").name == "static"
        assert store.list_cases() == [{"case_id": "static", "latest": 1, "name": "static"}]


class TestResults:
    def test_save_and_filter(self, store):
        r = AnalysisResult(result_id="r1", design_id="d1", design_version=1,
                           case_id="static", case_version=1,
                           solver="s", status=ResultStatus.VALID)
        store.save_result(r)
        assert store.list_results(design_id="d1")[0]["result_id"] == "r1"
        assert store.list_results(design_id="other") == []

    def test_save_duplicate_rejected(self, store):
        r = AnalysisResult(result_id="r1", design_id="d1", design_version=1,
                           case_id="c", case_version=1, solver="s",
                           status=ResultStatus.VALID)
        store.save_result(r)
        with pytest.raises(ValueError):
            store.save_result(r)
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_store.py -v`
Expected: FAIL — `No module named 'core.store'`

- [ ] **Step 3: 实现 store.py**

`src/core/store.py`:

```python
"""JSON 版本化存储（设计文档 §11.1）。

结构：
    data/store/chassis_designs/{design_id}.json   # {design_id, versions[], latest}
    data/store/analysis_cases/{case_id}.json      # {case_id, versions[], latest}
    data/store/analysis_results/{result_id}.json  # 单个不可变结果

V1 不引入 SQLite；写入用临时文件 + os.replace 保证原子性。
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from core.models import (AnalysisCase, AnalysisResult, CaseVersion,
                         ChassisDesign, DesignVersion)

DEFAULT_ROOT = Path(__file__).resolve().parents[2] / "data" / "store"

_DESIGNS = "chassis_designs"
_CASES = "analysis_cases"
_RESULTS = "analysis_results"


class DataStore:
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root) if root is not None else DEFAULT_ROOT
        for sub in (_DESIGNS, _CASES, _RESULTS):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    # -- io helpers -------------------------------------------------
    def _write_json(self, path: Path, payload: dict) -> None:
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)

    def _read_json(self, path: Path) -> dict | None:
        if not path.exists():
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    # -- designs ----------------------------------------------------
    def _design_path(self, design_id: str) -> Path:
        return self.root / _DESIGNS / f"{design_id}.json"

    def create_design(self, first_version: DesignVersion,
                      design_id: str) -> ChassisDesign:
        if self._design_path(design_id).exists():
            raise ValueError(f"design '{design_id}' already exists")
        first_version.version = 1
        doc = ChassisDesign(design_id=design_id, versions=[first_version], latest=1)
        self._write_json(self._design_path(design_id), doc.model_dump())
        return doc

    def _load_design(self, design_id: str) -> ChassisDesign:
        raw = self._read_json(self._design_path(design_id))
        if raw is None:
            raise KeyError(f"design '{design_id}' not found")
        return ChassisDesign.model_validate(raw)

    def get_design(self, design_id: str, version: int | None = None) -> DesignVersion:
        doc = self._load_design(design_id)
        want = doc.latest if version is None else version
        for dv in doc.versions:
            if dv.version == want:
                return dv
        raise KeyError(f"design '{design_id}' has no version {want}")

    def add_design_version(self, design_id: str,
                           version: DesignVersion) -> DesignVersion:
        doc = self._load_design(design_id)
        version.version = doc.latest + 1
        doc.versions.append(version)
        doc.latest = version.version
        self._write_json(self._design_path(design_id), doc.model_dump())
        return version

    def list_designs(self) -> list[dict]:
        out = []
        for p in sorted((self.root / _DESIGNS).glob("*.json")):
            raw = self._read_json(p)
            if raw:
                latest = next((v for v in raw["versions"]
                               if v["version"] == raw["latest"]), {})
                out.append({"design_id": raw["design_id"], "latest": raw["latest"],
                            "name": latest.get("name", "")})
        return out

    # -- cases ------------------------------------------------------
    def _case_path(self, case_id: str) -> Path:
        return self.root / _CASES / f"{case_id}.json"

    def create_case(self, first_version: CaseVersion, case_id: str) -> AnalysisCase:
        if self._case_path(case_id).exists():
            raise ValueError(f"case '{case_id}' already exists")
        first_version.version = 1
        doc = AnalysisCase(case_id=case_id, versions=[first_version], latest=1)
        self._write_json(self._case_path(case_id), doc.model_dump())
        return doc

    def _load_case(self, case_id: str) -> AnalysisCase:
        raw = self._read_json(self._case_path(case_id))
        if raw is None:
            raise KeyError(f"case '{case_id}' not found")
        return AnalysisCase.model_validate(raw)

    def get_case(self, case_id: str, version: int | None = None) -> CaseVersion:
        doc = self._load_case(case_id)
        want = doc.latest if version is None else version
        for cv in doc.versions:
            if cv.version == want:
                return cv
        raise KeyError(f"case '{case_id}' has no version {want}")

    def list_cases(self) -> list[dict]:
        out = []
        for p in sorted((self.root / _CASES).glob("*.json")):
            raw = self._read_json(p)
            if raw:
                latest = next((v for v in raw["versions"]
                               if v["version"] == raw["latest"]), {})
                out.append({"case_id": raw["case_id"], "latest": raw["latest"],
                            "name": latest.get("name", "")})
        return out

    # -- results ----------------------------------------------------
    def save_result(self, result: AnalysisResult) -> AnalysisResult:
        path = self.root / _RESULTS / f"{result.result_id}.json"
        if path.exists():
            raise ValueError(f"result '{result.result_id}' already exists")
        self._write_json(path, result.model_dump())
        return result

    def list_results(self, design_id: str | None = None,
                     case_id: str | None = None) -> list[dict]:
        out = []
        for p in sorted((self.root / _RESULTS).glob("*.json")):
            raw = self._read_json(p)
            if not raw:
                continue
            if design_id is not None and raw["design_id"] != design_id:
                continue
            if case_id is not None and raw["case_id"] != case_id:
                continue
            out.append(raw)
        return out
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_store.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 确认 data/store 被 gitignore**

Run: `git check-ignore data/store/chassis_designs 2>$null; echo $LASTEXITCODE`
Expected: exit 0（data/ 已在 .gitignore）。若为 1，在 `.gitignore` 的 data 规则处确认覆盖。

---

### Task 5: legacy 导入 + 预置工况

**Files:**
- Create: `src/core/legacy_import.py`
- Test: `tests/test_legacy_import.py`

- [ ] **Step 1: 写测试（先红）**

`tests/test_legacy_import.py`:

```python
"""legacy 导入与预置工况（设计文档 §11.2/§4.3）。"""
import pytest

from core.legacy_import import (LEGACY_DESIGN_ID, build_legacy_design_version,
                                ensure_legacy_import, ensure_preset_cases)
from core.store import DataStore


@pytest.fixture
def store(tmp_path):
    return DataStore(root=tmp_path / "store")


class TestLegacyDesign:
    def test_version_captures_current_hardpoints(self):
        dv = build_legacy_design_version()
        from hardpoints import DEFAULT_HARDPOINTS
        assert dv.front_right.points["UP5"] == pytest.approx(DEFAULT_HARDPOINTS["UP5"])
        assert dv.front_left.points["UP5"][1] == pytest.approx(-DEFAULT_HARDPOINTS["UP5"][1])
        assert dv.vehicle["mass_kg"] == pytest.approx(280.0)

    def test_rear_stored_without_prefix(self):
        dv = build_legacy_design_version()
        assert "UP5" in dv.rear_right.points
        assert not any(k.startswith("R_") for k in dv.rear_right.points)

    def test_ensure_is_idempotent(self, store):
        id1 = ensure_legacy_import(store)
        id2 = ensure_legacy_import(store)
        assert id1 == id2 == LEGACY_DESIGN_ID
        assert store.get_design(LEGACY_DESIGN_ID).latest == 1


class TestPresetCases:
    def test_seeds_all_preset_cases(self, store):
        ids = ensure_preset_cases(store)
        assert "static" in ids and "lat-1p3g" in ids and "bump-steer" in ids
        assert len(ids) >= 12

    def test_idempotent(self, store):
        ensure_preset_cases(store)
        ensure_preset_cases(store)
        assert store.get_case("static").latest == 1

    def test_load_case_values(self, store):
        ensure_preset_cases(store)
        assert store.get_case("lat-1p3g").loads.ay_g == pytest.approx(1.3)
        assert store.get_case("brake-1p2g").loads.ax_g == pytest.approx(1.2)
        assert store.get_case("accel-1p0g").loads.ax_g == pytest.approx(1.0)
        assert store.get_case("pure-steer").rack_displacement == pytest.approx(10.0)
        roll_case = store.get_case("roll-diff")
        assert roll_case.travel.fl == pytest.approx(20.0)
        assert roll_case.travel.fr == pytest.approx(-20.0)
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_legacy_import.py -v`
Expected: FAIL — `No module named 'core.legacy_import'`

- [ ] **Step 3: 实现 legacy_import.py**

`src/core/legacy_import.py`:

```python
"""旧数据导入与预置工况（设计文档 §11.2 / §4.3）。

- 启动时把 DESIGN_PARAMS/DEFAULT_HARDPOINTS/VEHICLE_PARAMS 当前状态
  导入为 `legacy-import` 方案（幂等）。
- 预置 §4.3 工况集（幂等）。
"""
from __future__ import annotations

from config import REAR_PREFIX, VEHICLE_PARAMS
from core.models import (AxleHardpoints, CaseVersion, DesignVersion,
                         LoadsInput, WheelTravel)
from core.store import DataStore
from hardpoints import (DEFAULT_HARDPOINTS, DEFAULT_REAR_HARDPOINTS, strip_prefix)

LEGACY_DESIGN_ID = "legacy-import"


def _split_hp(hp: dict) -> AxleHardpoints:
    """把旧扁平 hp dict 拆成 点集 + 轮胎标量。track_width 等轴级量归 vehicle。"""
    points = {k: list(v) for k, v in hp.items()
              if isinstance(v, list) and len(v) == 3}
    tire = {k: float(v) for k, v in hp.items()
            if k in ("tire_radius", "tire_width", "tire_spring_rate",
                     "corner_weight_n")}
    return AxleHardpoints(points=points, tire=tire)


def build_legacy_design_version() -> DesignVersion:
    front = _split_hp(DEFAULT_HARDPOINTS)
    rear = _split_hp(strip_prefix(DEFAULT_REAR_HARDPOINTS, REAR_PREFIX))
    return DesignVersion.from_right_template(
        version=0, front_right=front, rear_right=rear,
        vehicle={k: float(v) for k, v in VEHICLE_PARAMS.items()},
        name="Legacy import",
        notes="启动时从 DESIGN_PARAMS/DEFAULT_HARDPOINTS/VEHICLE_PARAMS 导入")


def ensure_legacy_import(store: DataStore) -> str:
    if any(d["design_id"] == LEGACY_DESIGN_ID for d in store.list_designs()):
        return LEGACY_DESIGN_ID
    store.create_design(build_legacy_design_version(), design_id=LEGACY_DESIGN_ID)
    return LEGACY_DESIGN_ID


def _cv(name: str, description: str, **kw) -> CaseVersion:
    return CaseVersion(version=0, name=name, description=description, **kw)


_PRESETS: list[tuple[str, CaseVersion]] = [
    ("static", _cv("静态设计位置", "全零几何输入，无外部载荷")),
    ("fl-comp", _cv("前左单轮压缩", travel=WheelTravel(fl=20.0))),
    ("fr-comp", _cv("前右单轮压缩", travel=WheelTravel(fr=20.0))),
    ("rl-comp", _cv("后左单轮压缩", travel=WheelTravel(rl=20.0))),
    ("rr-comp", _cv("后右单轮压缩", travel=WheelTravel(rr=20.0))),
    ("front-twin", _cv("前轴双轮同向跳", travel=WheelTravel(fl=20.0, fr=20.0))),
    ("rear-twin", _cv("后轴双轮同向跳", travel=WheelTravel(rl=20.0, rr=20.0))),
    ("heave-4w", _cv("四轮 heave",
                     travel=WheelTravel(fl=20.0, fr=20.0, rl=20.0, rr=20.0))),
    ("roll-diff", _cv("四轮左右差动轮跳",
                      travel=WheelTravel(fl=20.0, fr=-20.0, rl=20.0, rr=-20.0))),
    ("pure-steer", _cv("纯转向", rack_displacement=10.0)),
    ("bump-steer", _cv("轮跳+转向", travel=WheelTravel(fl=20.0, fr=20.0),
                       rack_displacement=10.0)),
    ("lat-1p3g", _cv("1.3g 纯侧向", loads=LoadsInput(ay_g=1.3))),
    ("brake-1p2g", _cv("1.2g 纯制动", loads=LoadsInput(ax_g=1.2))),
    ("accel-1p0g", _cv("1.0g 纯加速", loads=LoadsInput(ax_g=1.0))),
]


def ensure_preset_cases(store: DataStore) -> list[str]:
    existing = {c["case_id"] for c in store.list_cases()}
    for case_id, cv in _PRESETS:
        if case_id not in existing:
            store.create_case(cv, case_id=case_id)
    return [case_id for case_id, _ in _PRESETS]
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_legacy_import.py -v`
Expected: 全部 PASS

---

### Task 6: v2 API 路由 + 测试

**Files:**
- Create: `src/routes/v2.py`
- Test: `tests/test_v2_api.py`

- [ ] **Step 1: 写测试（先红）**

`tests/test_v2_api.py`:

```python
"""v2 API 测试（设计文档 §11.3）。使用隔离 DataStore，不触碰真实 data/。"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.store as store_mod
from core.store import DataStore
from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from routes.v2 import router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store_mod, "DEFAULT_ROOT", tmp_path / "store")
    store = DataStore()
    ensure_legacy_import(store)
    ensure_preset_cases(store)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class TestDesigns:
    def test_list_contains_legacy(self, client):
        r = client.get("/api/v2/designs")
        assert r.status_code == 200
        assert any(d["design_id"] == "legacy-import" for d in r.json()["designs"])

    def test_get_design_default_latest(self, client):
        r = client.get("/api/v2/designs/legacy-import")
        assert r.status_code == 200
        body = r.json()
        assert body["version"] == 1
        assert "UP5" in body["front_right"]["points"]

    def test_get_missing_404(self, client):
        assert client.get("/api/v2/designs/nope").status_code == 404

    def test_copy_design(self, client):
        r = client.post("/api/v2/designs",
                        json={"copy_from": "legacy-import", "design_id": "b1",
                              "name": "copy B"})
        assert r.status_code == 200
        assert r.json()["design_id"] == "b1"
        got = client.get("/api/v2/designs/b1").json()
        assert got["name"] == "copy B"

    def test_add_version(self, client):
        base = client.get("/api/v2/designs/legacy-import").json()
        base["notes"] = "edited"
        r = client.post("/api/v2/designs/legacy-import/versions", json=base)
        assert r.status_code == 200
        assert r.json()["version"] == 2
        assert client.get("/api/v2/designs/legacy-import").json()["version"] == 2


class TestCases:
    def test_list_and_get(self, client):
        ids = [c["case_id"] for c in client.get("/api/v2/cases").json()["cases"]]
        assert "static" in ids and "lat-1p3g" in ids
        cv = client.get("/api/v2/cases/lat-1p3g").json()
        assert cv["loads"]["ay_g"] == pytest.approx(1.3)


class TestSolve:
    def test_solve_static_matches_golden(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "legacy-import", "case_id": "static"})
        assert r.status_code == 200
        body = r.json()
        assert body["solver"] == "sequential-bump-steer-v1"
        assert body["status"] == "APPROXIMATE"
        fr = body["metrics"]["front_right"]
        assert fr["camber_deg"] == pytest.approx(-2.49, abs=0.005)
        assert body["design_id"] == "legacy-import"
        assert body["design_version"] == 1
        assert body["case_id"] == "static"

    def test_solve_bump_case_residual_reported(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "legacy-import", "case_id": "fr-comp"})
        body = r.json()
        assert "max_residual" in body["residuals"]
        assert body["metrics"]["front_right"]["camber_deg"] != pytest.approx(-2.49)

    def test_solve_missing_design_404(self, client):
        r = client.post("/api/v2/solve",
                        json={"design_id": "nope", "case_id": "static"})
        assert r.status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_v2_api.py -v`
Expected: FAIL — `No module named 'routes.v2'`

- [ ] **Step 3: 实现 routes/v2.py**

`src/routes/v2.py`:

```python
"""版本化 v2 API（设计文档 §11.3）。

旧 /api/* 端点原样保留为兼容包装；新分析入口只接受明确的
design_id/version + case_id，不再接受"全局当前硬点"。

v2 solve 当前直通顺序 bump→steer 求解器，显式标记 APPROXIMATE；
是否升级为统一约束解由 P1 误差基准决定（§5.2）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from core.models import DesignVersion, ResultStatus
from core.store import DataStore
from routes.solve import _solve_axle
from solver.angles import fix_left_angles

router = APIRouter(prefix="/api/v2")

SOLVER_NAME = "sequential-bump-steer-v1"
RESIDUAL_WARN_TOL = 0.02  # mm，设计文档 §13.2


def get_store() -> DataStore:
    return DataStore()


def _ensure_seeded(store: DataStore) -> None:
    ensure_legacy_import(store)
    ensure_preset_cases(store)


# ---------- designs ----------

class CopyDesignRequest(BaseModel):
    copy_from: str
    design_id: str
    name: str = ""
    copy_version: int | None = None


@router.get("/designs")
def list_designs():
    store = get_store()
    _ensure_seeded(store)
    return {"designs": store.list_designs()}


@router.get("/designs/{design_id}")
def get_design(design_id: str, version: int | None = None):
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(design_id, version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return dv.model_dump()


@router.post("/designs")
def copy_design(req: CopyDesignRequest):
    store = get_store()
    _ensure_seeded(store)
    try:
        src = store.get_design(req.copy_from, req.copy_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    new = src.model_copy(deep=True)
    new.name = req.name or new.name
    new.notes = f"copied from {req.copy_from} v{src.version}"
    try:
        doc = store.create_design(new, design_id=req.design_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"design_id": doc.design_id, "version": doc.latest}


@router.post("/designs/{design_id}/versions")
def add_version(design_id: str, version: DesignVersion):
    store = get_store()
    try:
        dv = store.add_design_version(design_id, version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return dv.model_dump()


# ---------- cases ----------

@router.get("/cases")
def list_cases():
    store = get_store()
    _ensure_seeded(store)
    return {"cases": store.list_cases()}


@router.get("/cases/{case_id}")
def get_case(case_id: str, version: int | None = None):
    store = get_store()
    _ensure_seeded(store)
    try:
        cv = store.get_case(case_id, version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return cv.model_dump()


# ---------- solve ----------

class SolveV2Request(BaseModel):
    design_id: str
    case_id: str
    design_version: int | None = None
    case_version: int | None = None


def _corner(hp_flat: dict, track_mm: float) -> dict:
    hp = dict(hp_flat)
    hp.setdefault("track_width", track_mm)
    return hp


@router.post("/solve")
def solve_v2(req: SolveV2Request):
    store = get_store()
    _ensure_seeded(store)
    try:
        dv = store.get_design(req.design_id, req.design_version)
        cv = store.get_case(req.case_id, req.case_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    veh = dv.vehicle
    t = cv.travel
    warnings: list[str] = []
    residuals: dict[str, float] = {}
    metrics: dict[str, dict] = {}

    corners = [
        ("front_right", dv.front_right, t.fr, veh.get("front_track_mm", 0.0)),
        ("front_left", dv.front_left, t.fl, veh.get("front_track_mm", 0.0)),
        ("rear_right", dv.rear_right, t.rr, veh.get("rear_track_mm", 0.0)),
        ("rear_left", dv.rear_left, t.rl, veh.get("rear_track_mm", 0.0)),
    ]
    for name, axle_hp, travel, track in corners:
        hp = _corner(axle_hp.flat(), track)
        ax = _solve_axle(hp, travel, cv.rack_displacement, mirror=False)
        angles = dict(ax["angles_right"])
        residual = float(ax["right"].get("max_residual", 0.0))
        residuals[name] = round(residual, 6)
        if residual > RESIDUAL_WARN_TOL:
            warnings.append(f"{name}: 几何残差 {residual:.4f}mm 超过阈值 "
                            f"{RESIDUAL_WARN_TOL}mm（§13.2 警告状态）")
        metrics[name] = {k: angles.get(k) for k in
                         ("camber_deg", "toe_deg", "caster_deg", "kpi_deg",
                          "scrub_radius_mm", "caster_trail_mm")}
        metrics[name]["contact_patch"] = ax.get("contact_patch_right")

    # 左轮报告值翻号对齐右轮符号（现状显示约定，K-2 待 P2 统一）
    for left, right in (("front_left", "front_right"), ("rear_left", "rear_right")):
        metrics[left] = {**fix_left_angles(metrics[left], metrics[right]),
                         "contact_patch": metrics[left]["contact_patch"]}

    return {
        "design_id": req.design_id, "design_version": dv.version,
        "case_id": req.case_id, "case_version": cv.version,
        "solver": SOLVER_NAME,
        "status": ResultStatus.APPROXIMATE.value,
        "residuals": residuals,
        "metrics": metrics,
        "pose_labels": cv.derived_pose(veh.get("front_track_mm", 1200.0),
                                       veh.get("rear_track_mm", 1200.0),
                                       veh.get("wheelbase_mm", 1550.0)),
        "warnings": warnings,
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_v2_api.py -v`
Expected: 全部 PASS

注意：`fix_left_angles` 需要 angles dict 含全部键；若某键缺失导致 KeyError，在 `_corner` 结果上补齐默认值后再调用。

---

### Task 7: main.py 接线 + 全量回归 + 文档同步

**Files:**
- Modify: `src/main.py`
- Modify: `docs/DEVLOG.md`

- [ ] **Step 1: 接线启动逻辑**

`src/main.py` 修改（在 router 注册区与启动加载区）：

```python
from core.legacy_import import ensure_legacy_import, ensure_preset_cases
from core.store import DataStore
from routes.v2 import router as v2_router

# ... 现有 include_router 之后：
app.include_router(v2_router)

# load_persistent_state() 之后：
_store = DataStore()
ensure_legacy_import(_store)
ensure_preset_cases(_store)
```

- [ ] **Step 2: 全量回归**

Run: `python -m pytest tests/ -q --ignore=tests/e2e`
Expected: 原 205+3xfail 基线不回归，P0 新测试全绿

Run: `python -m ruff check src/core src/routes/v2.py tests/test_convention.py tests/test_hand_benchmark.py tests/test_core_models.py tests/test_store.py tests/test_legacy_import.py tests/test_v2_api.py`
Expected: 无错误（如有 I001 import 排序提示，`ruff check --fix` 修复）

- [ ] **Step 3: 冒烟验证服务启动与 legacy 导入**

Run: 启动 `python run.py`（后台），然后：
`curl http://127.0.0.1:8000/api/v2/designs` → 包含 `legacy-import`
`curl http://127.0.0.1:8000/api/v2/cases` → 14 个预置工况
`curl -X POST http://127.0.0.1:8000/api/v2/solve -H "Content-Type: application/json" -d "{\"design_id\":\"legacy-import\",\"case_id\":\"static\"}"` → front_right camber ≈ −2.49
Expected: 三个请求均 200 且数值与黄金值一致；验证后停止服务。

- [ ] **Step 4: 同步 DEVLOG**

在 `docs/DEVLOG.md` 顶部追加 P0 完成记录：规范冻结（含 K-1/K-2/K-3 登记）、手算 benchmark、schema、DataStore、legacy 导入、v2 API 边界、测试结果数、遗留事项（P1 误差基准）。

- [ ] **Step 5: 提交（需用户确认后执行）**

```bash
git add src/core src/routes/v2.py tests/test_convention.py tests/test_hand_benchmark.py tests/test_core_models.py tests/test_store.py tests/test_legacy_import.py tests/test_v2_api.py src/main.py docs/DEVLOG.md docs/superpowers
git commit -m "feat(core): V1 P0 data foundation — convention freeze, benchmarks, design/case/result schema, JSON store, v2 API boundary"
```

---

## Self-Review

**Spec coverage（设计文档 §14 P0 清单）：**
- 固定坐标/符号/角度规范 → Task 1 ✓（含 K-1/K-2/K-3 登记与 §13.2 镜像对称性 xfail 哨兵）
- 建立手算 benchmark → Task 2 ✓（解析主销几何 + 残差阈值）
- 建立 ChassisDesign/AnalysisCase/AnalysisResult schema → Task 3 ✓
- 设计 JSON 存储和旧数据导入 → Task 4/5 ✓
- 迁移现有 localStorage 快照语义 → **不在 P0 代码范围**：目标语义（结果绑定方案版本+工况版本）已由 AnalysisResult schema 定义；前端快照的实际切换随 P4 A/B 对比落地。此处有意收窄，避免 P0 触碰冻结范围外的前端。
- 固定 API 版本边界 → Task 6/7 ✓（/api/v2 前缀 + 旧接口零改动 + solve 直通标 APPROXIMATE）

**Placeholder scan:** 无 TBD/占位；所有代码完整。

**Type consistency:** `AxleHardpoints.flat()` / `DesignVersion.from_right_template` / `DataStore.*` 签名在 Task 3/4/5/6 间一致；`fix_left_angles(dict, dict)` 与现有 `src/solver/angles.py` 签名一致。

**已知风险：**
- `fix_left_angles` 依赖右轮 angles 作参照（现有签名），v2 solve 已按此传参。
- v2 solve 对左轮使用与右轮相同的 rack 位移符号（与现状 `/api/solve` 行为一致），真实的单齿条刚体耦合属统一求解器范畴（P1）。
