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
- K-4：polish 残差在 dz ∉ [-3, +10]mm 区间超标（负行程侧最差：-10mm ≈ 0.10mm、
  -15mm ≈ 0.19mm；分支锚定软项的妥协残差，且负/正行程不对称），
  未达 §13.2 全区间 ≤0.02mm 目标；tests/test_hand_benchmark.py 已锁定基线。
  属 P1 求解器议程（与顺序/统一解误差基准一并处理）。
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

KNOWN_ISSUES = ("K-1", "K-2", "K-3", "K-4")
