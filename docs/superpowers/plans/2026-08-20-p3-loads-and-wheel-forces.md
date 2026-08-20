# P3 载荷与轮边受力实施计划

> 依据：docs/superpowers/specs/2026-08-20-v1-progress-sync.md 七·P3、设计文档 §8/§15。
> 目标：整车四轮 Fx/Fy/Fz 分配 + 重写 src/metrics/loads.py（二力杆 + 球铰三向反力 + 当前轮边几何 + 当前轮胎三向力），接入 v2 统一结果，解冻 Jacking。

## P3-1 整车载荷分配（新 src/metrics/wheel_loads.py）

- 输入：vehicle 参数 + case loads（ax/ay/az、brake_split_front、drive_split_rear）+ 轴滚转刚度 + RC 高 + 滚转角。
- 静态：Fz_static = W×axle_frac/2。
- 侧向转移（分三部分）：几何（经 RC 高）、弹性（经滚转刚度前后分配 + ARB）、非簧载（unsprung 在轮处转移）。
- 纵向转移：ax×m×h_cg/wheelbase，前轴 +、后轴 −。
- 每轮 Fx：ax>0 制动 → 前轴 brake_split_front；ax<0 加速 → 后轴 drive_split_rear（约定写入 LoadsInput 文档）。
- 每轮 Fy：按该轮 Fz 占轴比例分配轴侧向力。
- 摩擦圆利用率：sqrt(Fx²+Fy²)/(μ_peak×Fz)，μ_peak 默认 1.4（vehicle 参数）。
- 离地警告：Fz ≤ 0。
- 符号约定：Fx 正 = 驱动方向（+X）；Fz 正 = 向上（压向车轮）；ay 正 = 向右。

## P3-2 轮边受力（重写 src/metrics/loads.py）

转向节 FBD，二力杆未知量 f1..f6（张拉为正）：
- UCA 前支杆 CH1→UP1 (d1)、UCA 后支杆 CH2→UP1 (d2)
- LCA 前支杆 CH3→UP2 (d3)、LCA 后支杆 CH4→UP2 (d4)
- 推杆 CH5→UP4 (d5)、横拉杆 FL1→UP3 (d6)
- ARB 连杆垂向力 F_drop（k_arb×φ/sep，作用于 LCA，经球头传递）

6×6 线性系统（力平衡 3 + 绕轮心力矩平衡 3）：
  A = [d1 d2 d3 d4 d5 d6; r1×d1 r1×d2 r2×d3 r2×d4 r4×d5 r3×d6]
  b = [F_tire − F_drop; r_cp×F_tire − r2×F_drop]
输出：支杆轴向力、推杆/横拉杆/防倾杆连杆力、上下球头三向反力、摆臂内侧支点（CH1-CH4）反力、
转向节合力/力矩残差、奇异性报告（rank<6 → SOLVER_FAILED + 说明）。

## P3-3 接入 v2

- solve 增加 loads 层：每轮 {tire_fx_fy_fz, friction_util, off_ground, wheel_end{...}}；
  滚转刚度用 rocker mini-sweep（±5mm）的几何 MR；RC 高用双侧 IC→接地点交点。
- Jacking 解冻：jacking_force = Fy×tan(θ_IC)（真实力），替换 NOT_IMPLEMENTED。
- 状态机延续：每轮 loads 带状态；残差/奇异 → APPROXIMATE/SOLVER_FAILED。

## P3-4 验证

- 手算 benchmark：静态四轮 Fz、单侧侧向转移、纵向转移、摩擦圆、竖直载荷下的支杆力符号。
- 左右独立：非对称载荷输入下左右受力不镜像（禁止镜像受力）。
- 失效奇异：rank deficient 构造 → SOLVER_FAILED。
- 状态机契约测试延续（P2-3）。
