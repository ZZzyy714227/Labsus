"""坐标、符号与角度规范 — V1 冻结基线（设计文档 §12，P2-0 更新）。

本模块是规范的唯一真源；tests/test_convention.py 固定全部条款。
修改规范必须同时修改本模块、测试与设计文档。

坐标系
------
X：车辆前方（+X = 前）；Y：车辆右侧（+Y = 右）；Z：垂直向上。
原点：前轴中心地面。

角度符号（P2-0 冻结，左右两侧统一车辆全局约定）
------------------------------------------------
- Camber：负 = 内倾（胎顶朝车辆中心线），两侧相同。
  公式：camber = -atan2(spin_z, hypot(spin_x, spin_y))。
- Toe：正 = Toe-in（轮前指向车辆中心线），两侧相同。
  公式：toe = -side · atan2(fwd_y, fwd_x)，fwd 为轮面前向水平迹线（+X 方向）。
  side = +1 右轮 / -1 左轮（按轮心 Y 判别）。注：平行转向时两侧 toe 异号
  （内轮 toe-in、外轮 toe-out），这是物理正确行为，不再做显示对齐。
- KPI/SAI：正 = 主销轴上端向车内倾斜，两侧相同。
  公式：kpi = side · atan2(kp_vec[1], -kp_vec[2])。
- Caster：正 = 主销轴上端后倾（经典定义），两侧相同。
  公式：caster = atan2(kp_vec[0], -kp_vec[2])。
- Scrub：正 = 接地印迹在主销接地点外侧（正拖距/正主销偏距），两侧相同。
  公式：scrub = side · (contact_y - kingpin_ground_y)。
- Trail：正 = 主销接地点在接地印迹前方（经典机械拖距），两侧相同。
  公式：caster_trail_mm = kingpin_ground_x - contact_x。

禁止以 fix_left_angles、toe<90° 等后处理特判作为规范（设计文档 §12）。
compute_alignment_angles 已按侧别直接输出车辆全局约定，无需翻号。

转向
----
- rack_displacement 正 = 齿条向车辆右侧（+Y）平移。
- 实测：rack=+5mm → 右轮 toe ≈ +3.3°（toe-in），左轮 toe ≈ -3.3°（toe-out），
  两轮前向同指 -Y，为平行同向偏转。

已知规范问题登记（Known Issues）
--------------------------------
- K-1（P2-0 已修复）：左右镜像 Scrub 不对称，根因是 compute_contact_patch 的
  旧坐标系 "X=up" 外倾公式与同向横向偏移；已改为轮面投影，镜像对称。
- K-2（P2-0 已修复）：toe 符号已统一为 toe-in 为正，并写入方案元数据。
- K-3（P2-0 已修复）：caster 公式与 derive_hardpoints 主销倾角符号已统一为
  经典定义（正 = 轴上端后倾）；caster_trail_mm 即经典机械拖距。
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
    camber_positive: str = "top_in"                    # 负 = 内倾
    toe_positive: str = "toe_in_positive"              # 正 = Toe-in（P2-0）
    kpi_positive: str = "axis_top_inboard"
    caster_positive: str = "axis_top_rearward"         # 经典（P2-0）
    scrub_definition: str = "contact_outboard_of_kingpin_positive"  # P2-0
    trail_definition: str = "kingpin_ground_ahead_of_contact_positive"  # 经典（P2-0）
    rack_positive: str = "rack_toward_vehicle_right"
    spec_revision: str = "v1-p2-0"


DEFAULT_CONVENTION = CoordinateConvention()

KNOWN_ISSUES = ("K-4",)
