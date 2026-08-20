# P5 轮胎模型 + 稳态转向 + 整车调平实施计划

> 依据：Docs 进展文档 P5 缺失项、设计文档 §6.2/§8；目标把「几何+静力引擎」升为「整车底盘分析工具」。

## P5-1 简化魔毯方程轮胎模型（src/metrics/tire_model.py）

魔改 Pacejka Magic Formula（纯度偏高，忽略温度/气压/压平）：
    y = D·sin(C·arctan(B·x − E·(B·x − arctan(B·x))))
    Fy = y, x = α(deg)；D = μy·Fz；B = Cα_ref·(Fz/Fz_ref)^n / (C·D)（保证 B·C·D = Cα 拐点刚度）
外倾：ΔFy = −Cγ·γ（clamp 至 D）；Fx 同构 x=κ，D=μx·Fz，B = Cκ/(C·D)。
摩擦圆/椭圆：外力平方和 ≤ μFz 校验。
参数（config.VEHICLE_PARAMS，FSAE 22.5" 半热熔合理默认）：
    tire_mu_peak_y=1.4, tire_mu_peak_x=1.5, tire_calpha=350 N/deg @ tire_fz_ref=1000N,
    tire_cgamma=60 N/deg, tire_alpha_exp=0.8, tire_mf_c=1.3, tire_mf_e=0.0
手算验证：BCD=Cα；Fy(0)=0；饱和=D；Cγ 线性项。

## P5-2 稳态转向动力学（src/metrics/handling.py + v2 端点）

两轮自行车模型（含载荷敏感）：
    α_f/α_r 由四轮 Fz（P3 载荷含转移）→ 轴 Cα → 反解 α（单调 MF 二分）
    understeer gradient K = (α_f − α_r)/a_y  （>0 不足转向）
    转向角 δ = wheelbase/radius + K·a_y；侧偏角平衡；K(a_y) 曲线（载荷敏感）
    a_y 扫掠 0..1.3g 生成 K vs ay 曲线
手算：中性转向（Cα·Fz 前=后 → K≈0）、欠/过转向符号。

## P5-3 整车调平（src/metrics/ride.py + v2 端点）

四轮静载（axle_frac+unsprung）+ 每角 wheel rate（k_spring·MR²，几何 MR）+ 防倾杆预载 0
→ 求 ride height（轮跳偏移）与每角弹簧预载，满足 F_spring,i = Fz,i；
heave/roll/pitch 刚体自由度；调平自洽校验（弹簧力总和=整车静载）。
输出：静态轮跳偏移、每角预载、roll/pitch 姿态、弹簧力 vs 静载残差。

## 验证

每指标手算/镜像/失效奇异；状态机延续（P2-3）；单点 <150ms；随 solve/sweep 平滑集成；DEVLOG 同步。
