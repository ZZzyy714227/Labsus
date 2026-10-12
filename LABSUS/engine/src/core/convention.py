"""坐标、符号与角度规范 — V1 冻结基线（设计文档 §12，P2-0 更新）。

本模块是 **V1 冻结线** 的内部真源（v3 主线的真源在 `src/api/v3models.py`
的 DWB_KEYS 与坐标注释，见 INTENTIONAL_DIFFERENCES.md「坐标系双血脉」）。
V1 冻结线当前仅被已弃用的 `src/core/models.py` 引用，无独立测试文件；
其条款由 tests/test_s1_gate.py 的手算对照与 tests/test_w4_consistency.py
的层间换算锚间接看守。修改约定必须同步本模块 + 设计文档 +
INTENTIONAL_DIFFERENCES.md。

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
- K-4（已关闭，2026-08-22 起）：旧"顺序解 + polish 分支锚定"在负行程侧残差超标
  （-10mm ≈ 0.10mm、-15mm ≈ 0.19mm），未达 §13.2 全区间 ≤0.02mm 目标。该实现已
  整体退役——现行 `src/solver/mechanism/solver.py` 改用 scipy least_squares(TRF)
  联合收敛，实测（2026-09-20）±80mm 全行程最差 1.14e-13mm、0 点超 0.02mm 门禁，
  由 tests/test_s1_gate.py G1 看守。本条仅作历史记录，勿据此判断现行求解器精度。
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class CoordinateConvention:
    """嵌入每个 ChassisDesign 元数据，声明该方案数值所遵循的坐标与符号约定。"""

    x_axis: str = "forward"
    y_axis: str = "right"
    z_axis: str = "up"
    origin: str = "front_axle_center_ground"
    camber_positive: str = "top_out"                   # 正 = 顶端外倾（负 = 内倾）
    toe_positive: str = "toe_in_positive"              # 正 = Toe-in（P2-0）
    kpi_positive: str = "axis_top_inboard"
    caster_positive: str = "axis_top_rearward"         # 经典（P2-0）
    scrub_definition: str = "contact_outboard_of_kingpin_positive"  # P2-0
    trail_definition: str = "kingpin_ground_ahead_of_contact_positive"  # 经典（P2-0）
    rack_positive: str = "rack_toward_vehicle_right"
    spec_revision: str = "v1-p2-0"


DEFAULT_CONVENTION = CoordinateConvention()

# 已知规范问题登记真源在模块 docstring（K-1..K-4，全部已关闭）。
# 旧版此处有 KNOWN_ISSUES=("K-4",) 常量：无任何消费方，且 K-4 已关闭，
# 保留会误导读者以为仍有未关闭项 —— 2026-09-20 删除。
