# P5 深化：能力边界 2–6 解决计划

## (2) yaw 横摆动力学（linear bicycle model）
- 状态 [β, r]，矩阵 A(V) 依赖 Cαf/Cαr/m/Iz/L/lf/lr
- 特征值 → 固有频率/阻尼比；前向增益（yaw rate gain vs V）
- 临界失稳速度 V_crit（过转向车），稳态一致性：与准静态 K 的 YawRate 公式互校
- 转向阶跃响应解析解（线性定常系统闭式）

## (3) 轮胎联合滑移 + 标定
- 魔改 MF 联合滑移：等效滑移 s=sqrt(κ²+tanα²)→ 摩擦椭圆 Fx²/Fy² 合并（取代纯摩擦圆钳制）
- tire_calibrate：输入 [(Fz,α,Fy),...] 数据点 → least_squares 拟合 mu_y/Cα/Cγ/C/E；输出 + 残差统计

## (4) 防倾杆几何 + 转向回正
- arb_geometry(k_arb)：扭杆直径 d、工作长度 L、臂长 a、G、J=πd⁴/32 → k_arb=G·J/(L·a²) 几何材料刚度
- kingpin/回正力矩：前轮 Σ 绕主销（拖距·Fy + 主销偏移·Fx/Fz），对 ay 输出回正力矩/转向力矩需求
- 车架刚体假设 → 文档明确

## (5) 调平闭环
- ride.settle_offsets：已知预载/弹簧 → 反解四轮 ride 偏移
- v2 solve 接受 baseline_ride 选项：先把四轮 travel 设为调平位形再求解（分析基于整备调平后）

## (6) 操稳载荷闭环
- handling 的 lateral_transfer 由 v2 注入完整 distribute_vehicle_loads（含 RC/滚转刚度/MR），
  K(ay) 曲线基于完整四轮载荷（消除第 6 项近似）

验证：手算 benchmark（椭圆边界、临界速度、ARB 刚度公式、调平回写）、镜像、失效奇异；状态机；DEVLOG。
