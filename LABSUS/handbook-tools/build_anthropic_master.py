import os
import re
from pathlib import Path

handbook_dir = Path(r'c:\Users\zzy\Desktop\New_suspension\LABSUS\handbook')
output_md = handbook_dir / '全车底盘悬架力学与动力学工程全书.md'

parts_meta = [
    {
        'folder': 'part0-math-and-physics-foundations',
        'is_foundation': True,
        'part_label': '全书前置',
        'title': '全书前置 底盘动力学数学与物理第一性原理基石',
        'loc': '全书知识大厦的数理底座——系统梳理三维空间向量代数、正交群 SO(3)、多元微积分、微分几何、空间力系简化、惯性张量与数值积分算法。',
        'mech': '反对称矩阵算子 [u]× 幂次恒等式、SVD 奇异值分解极值定理、超定方程 Moore-Penrose 伪逆、雅可比矩阵牛顿-拉夫逊求根、力向一点平移定理、机体动坐标系欧拉方程与半隐式保辛欧拉积分。',
        'chapters': [
            ('ch00-1-linear-algebra-and-matrices.md', '三维线性代数与矩阵分析全解', '三维向量代数、反对称算子与正交群构成空间机构多体运动学的通用数学基石。', [('向量代数', '点积投影算子与叉积反对称矩阵 [u]×', '反对称矩阵平方与立方恒等式折叠旋转级数'), ('矩阵与群', 'SO(3) 正交矩阵与 det(R)=+1 手征性约束', '严格杜绝矩阵运算中的反射镜像退化'), ('SVD 与伪逆', '奇异值分解几何图景与正交 Procrustes 极值', 'Moore-Penrose 广义逆与加权最小二乘 WLS')]),
            ('ch00-2-calculus-and-optimization.md', '多元微积分、微分几何与非线性优化', '多元微积分与微分几何连接了几何参数灵敏度、非线性多体求根与极限过弯物理。', [('导数与泰勒展开', '运动学阶梯微分链与小角度近似', '建立操稳二自由度线性化基础'), ('全微分与灵敏度', '多元梯度向量与硬点公差线性传递', '精准识别对定位角最敏感的关键孔位'), ('雅可比与牛顿法', '向量值函数导数矩阵与切空间映射', '牛顿-拉夫逊二次收敛极速求解多体几何'), ('曲线微分几何', '连续曲率 κ 与向心加速度 ay = v^2 κ', '赛道外内外走线抹平曲率提升极限车速')]),
            ('ch00-3-rigid-body-mechanics.md', '理论力学、空间力系与刚体动力学基础', '空间力系简化定理、三维惯性张量与牛顿-欧拉方程构成了全车动力学的物理灵魂。', [('力系平移定理', '接地点外力向轮心平移与附加力偶矩', '半径力臂将侧向力转换为数千牛米倾覆力矩'), ('三维惯性张量', '质量二次体积分与平行轴 Steiner 定理', '车身质量对称性消除 Ixy 与 Iyz 耦合项'), ('欧拉动力学方程', '机体坐标系泊松公式与角动量导数', '陀螺力矩交叉项揭示高速复合过弯侧倾耦合'), ('空间机构自由度', 'Grübler / Kutzbach 空间机构自由度判据', '严格验算空间双横臂悬架恰好具备 2 自由度')]),
            ('ch00-4-numerical-methods.md', '数值分析基础、保形样条与常微分方程积分', '数值积分算法的保辛稳定性与数据拟合的保形性是底盘工程软件不崩溃的底线。', [('显式欧拉发散', '简谐振动机械能放大因子 1+(ωΔt)^2', '证明显式积分能量自发指数爆炸机理'), ('半隐式保辛欧拉', '状态转移矩阵行列式严格恒等于 1.0', '保相空间面积守恒杜绝数值发散'), ('系统刚性与步长', '限位块击穿大刚度与临界步长约束', '1000Hz 微子步消除高频阶跃冲击震荡'), ('单调保形 PCHIP', 'Runge 现象振荡与 Brodlie-Fritsch 调和平均', '确保衬套切线刚度全域非负消除假失稳')])
        ]
    },
    {
        'folder': 'part1-spatial-kinematics',
        'is_foundation': False,
        'part_label': '第一篇',
        'title': '第一篇 空间机构运动学与几何学第一性原理',
        'loc': '底盘工程链条的几何基石——从三维空间向量代数、刚体李代数旋转与 SVD 姿态估计出发，建立空间双横臂与推杆摇臂多体运动学模型。',
        'mech': '三维空间欧拉角姿态解耦、空间铰链圆约束方程、60 轮二分法摇臂求解、非线性信赖域反射 (TRF) 求解器与主销定位角/瞬心/侧倾中心空间投影。',
        'chapters': [
            ('ch01-spatial-vectors-and-poses.md', '空间三维向量与刚体姿态数学基础', '转向节在空间的位姿由空间三维点阵约束完全决定，SVD/Kabsch 算法提供严格正交极值解。', [('空间旋转表示', 'Euler 角奇异与 Rodrigues 闭式解', '指数映射提供无奇异旋转更新'), ('SVD 姿态恢复', 'Procrustes 问题与镜像退化', '行列式符号修正 det(VU^T) 消除镜像退化'), ('转向节姿态角', 'Camber 与 Toe 局部坐标系投影', '反正弦与反正切解析提取定位角')]),
            ('ch02-double-wishbone-topology.md', '双横臂悬架空间拓扑与铰链圆约束', '双横臂悬架具有 2 个独立自由度（轮跳与转向），摆臂端点在空间约束于车身铰链圆上。', [('Grübler 准则', '空间多体自由度数 DOF 计算', '双横臂机构具有恰好 2 个全局自由度'), ('铰链圆方程', '轴向投影与径向半径双重残差', '构造两项二次代数约束严格限制空间位姿'), ('拓扑装配', '硬点输入与转向节刚体绑定', '确定性几何求解保证无伪自由度发散')]),
            ('ch03-rocker-pushrod-mechanics.md', '推杆与空间倾斜摇臂机构力学', '推杆将轮端垂向跳动传递为空间倾斜轴线摇臂的角位移，60 轮二分法保证根连续性。', [('摇臂轴线提取', '三维空间任意倾斜铰链轴向量', 'Rodrigues 空间刚体旋转算子'), ('推杆定长约束', '从动连杆一维非线性求根方程', '60 轮二分法与历史相位锁定'), ('安装运动比 MR', '减振器压缩位移对轮跳导数', 'MR 平方律二级放大轮端刚度')]),
            ('ch04-nonlinear-solvers.md', '非线性运动学求解器：TRF 与 PBD 闭式投影', 'Python 端 TRF 最小二乘与前端 PBD 闭式几何投影实现双端亚毫米级高保真对齐。', [('TRF 求解器', '有界信赖域反射最小二乘', '18 维状态向量内层高精收敛'), ('PBD 闭式投影', 'projLink 与 projHinge 闭式算子', '14 次四元数极分解实时逼近刚体'), ('防御与拦截', 'NaN 逃逸阻断与条件数优化', '残差有限性校验确保无发散解冒充')]),
            ('ch05-spatial-alignment-angles.md', '主销定位几何：Caster, KPI 与瞬心侧倾中心', '空间主销轴线与摆臂瞬心决定了车轮动态定位角演变与整车侧倾中心高度。', [('主销几何族', 'Caster, KPI 与地面交点计算', '三维射线求交提取主销真实接地点'), ('磨地与拖距', 'Scrub Radius 与 Mechanical Trail', '微正磨地传递路感，拖距提供回正力矩'), ('侧倾中心 RC', '正视瞬心与地面力线几何交点', 'RC 高度决定侧倾力臂与瞬态响应速率')])
        ]
    },
    {
        'folder': 'part2-statics-and-compliance',
        'is_foundation': False,
        'part_label': '第二篇',
        'title': '第二篇 静力平衡与 K&C 弹性力学体系',
        'loc': '连接纯刚体几何与全车动力学的弹性力学纽带——建立悬架连杆受力求解、6-DOF 橡胶衬套本构与弹性 K&C 仿真体系。',
        'mech': '6-DOF 载荷平移、5 二力杆空间 Plücker 矩阵伪逆分解、Brodlie-Fritsch 单调保形 PCHIP 样条、两层嵌套求解器与 Anderson-M 历史加速。',
        'chapters': [
            ('ch06-link-forces-and-statics.md', '空间二力杆静力平衡与受力求解', '悬架 5 根二力杆通过 Plücker 空间矩阵伪逆分解平衡轮端 6-DOF 外载荷。', [('载荷平移', '接地外载向轮心主矢与主矩平移', '力矩叉乘项产生额外力偶'), ('5 杆矩阵 A', '6x5 超定 Plücker 矩阵构造', 'Moore-Penrose 伪逆求解最小范数内力'), ('残余力矩', '超静定力矩残差评估准则', '残差 <= 1.0 N·m 判定物理精确平衡')]),
            ('ch07-bushing-constitutive-models.md', '6 自由度各向异性橡胶衬套本构模型', '衬套采用 6 自由度各向异性刚度与单调保形 PCHIP 样条表征大变形硬化。', [('各向异性刚度', '径向、轴向与偏转角刚度解耦', '对角切线刚度雅可比矩阵'), ('PCHIP 样条', 'Brodlie-Fritsch 单调保形斜率', '消除 Runge 振荡与负刚度假象'), ('端点外推', '边界切线线性刚化外推', '保证全域 C^1 阶连续无伪屈服')]),
            ('ch08-nested-compliance-solver.md', '两层嵌套非线性弹性 K&C 求解器', '外层力平衡与内层运动学姿态解耦，块对角解析雅可比与 Anderson 加速提速 30 倍。', [('两层嵌套架构', '外层衬套位移与内层刚体运动学', '单步运动学重解与力平衡'), ('解析雅可比', '块对角衬套切线刚度拼接', '计算开销从 O(6N+1) 降低为 O(1)'), ('Anderson-M', '历史残差最优外推加速', '非线性刚度下 2 步极速收敛')]),
            ('ch09-kandc-sweep-gains.md', 'K&C 试验台架准静态扫掠与增益提取', '4 类标准工况扫掠、权威求导内核 _slope 与 Steer Camber 正交分解。', [('四类标准扫掠', '平行轮跳、反向侧倾、转向与力加载', '覆盖工业台架全部标准测试工况'), ('_slope 内核', '二阶中心差分与局部多项式拟合', '权威求导内核消除数值高频抖动'), ('Steer Camber', 'Caster 线性 + KPI 抛物线分解', '精确量化主销对动态外倾的贡献')])
        ]
    },
    {
        'folder': 'part3-quasi-static-handling',
        'is_foundation': False,
        'part_label': '第三篇',
        'title': '第三篇 准静态操稳与载荷转移控制理论',
        'loc': '车辆操纵稳定性的准静态力学内核——从空间侧倾轴线与载荷转移三路径，揭示整车稳态转向平衡与几何抬升规律。',
        'mech': '空间侧倾力矩平衡、P-Δ 几何负刚度失稳证明、TLLTD 三路径动载分配、轮胎载荷敏感性（Jensen 不等式）抓地力损失证明与不足转向梯度 Kus 支配机制。',
        'chapters': [
            ('ch10-quasi-static-equilibrium.md', '准静态过弯平衡与空间侧倾迭代', '三维空间侧倾轴线倾斜角、重力 P-Δ 几何负刚度失稳与 3 轮闭环迭代收敛。', [('侧倾轴线', '前/后侧倾中心连线与质心力臂', '空间倾斜轴线决定有效侧倾力矩'), ('P-Δ 几何失稳', '重力偏心倾覆力矩与负刚度', 'K_phi > m*g*h_arm 临界稳定判据'), ('闭环迭代', '非线性余弦修正与 3 步快速收敛', '极短时间内完成操稳姿态计算')]),
            ('ch11-tlltd-three-path-transfer.md', '总侧倾载荷转移 (TLLTD) 与三路径动载分解', '非簧载惯性、侧倾中心几何力臂与弹性刚度三路径决定四轮瞬态动载分配。', [('路径 1 惯性', '非簧载质量侧向力直接转移', '瞬时建立无相位滞后'), ('路径 2 几何', '侧倾中心高度反力与几何力臂', 'RC 越高几何转移占比越大'), ('路径 3 弹性', '弹簧与防倾杆扭转力偶分配', 'TLLTD 调校的核心主动旋钮')]),
            ('ch12-us-gradient-and-jacking.md', '不足转向梯度、轮胎载荷敏感性与 Jacking 抬升', '轮胎载荷敏感性 Jensen 损失证明、动态侧偏刚度、Kus 与 Jacking 几何抬升。', [('载荷敏感性', '轮胎凹函数特性与总抓地衰减证明', '载荷转移导致整轴抓地力净损失'), ('US Gradient', '前后轴侧偏刚度与轴荷配比', 'Kus 处于 +0.4~+1.2 黄金稳定视窗'), ('Jacking 抬升', '侧向力正视投影产生的垂向合力', '防止过高 RC 导致悬架顶起与轮距收缩')])
        ]
    },
    {
        'folder': 'part4-advanced-tire-mechanics',
        'is_foundation': False,
        'part_label': '第四篇',
        'title': '第四篇 现代非线性轮胎力学与实测辨识',
        'loc': '全车地面抓地力源泉——深入微观刷子摩擦模型与宏观 Pacejka 魔术公式，完成试验台架多载荷实测数据参数辨识。',
        'mech': 'Fiala 刷子模型第一性原理推导、Pacejka 四主参数物理意义、归一化复合滑移摩擦圆封闭证明、松弛长度指数解与有界 TRF 最小二乘辨识。',
        'chapters': [
            ('ch13-pacejka-magic-formula.md', 'Fiala 刷子模型推导与 Pacejka 魔术公式', '从胎面花纹块微观附着/滑动积分推导出魔术公式 B, C, D, E 参数。', [('Fiala 刷子', '抛物线压力分布与滑移区分离', '积分推导侧偏力立方非线性形态'), ('Pacejka 四参', '刚度 B、形状 C、峰值 D、曲率 E', '宏观三角函数高保真拟合'), ('载荷敏感度', 'LS 参数与非线性峰值力比例尺', '真实反映重载下摩擦系数衰减')]),
            ('ch14-combined-slip-and-relaxation.md', '复合滑移摩擦圆与松弛时延方程', '归一化复合滑移向量、摩擦圆封闭证明与一阶松弛时延 ODE 解析指数解。', [('复合滑移向量', '纵向滑移与侧偏角归一化合成', '各向同性摩擦圆正交力分解'), ('摩擦圆封闭', '合力严格约束在 mu*Fz 内部', '平方和恒等式解析证明'), ('松弛长度 ODE', '一阶时滞微分方程与指数更新', '无条件稳定格式防止高频发散')]),
            ('ch15-tire-parameter-fitting.md', '轮胎试验台架数据 Pacejka 参数拟合', '加权目标泛函、两阶段物理初值提取与有界信赖域反射 (TRF) 非线性优化。', [('加权损失泛函', '各载荷层级峰值无量纲归一化', '均衡大小载荷特征权重'), ('启发式初值', '零位斜率反解 B0 与峰值提取', '彻底避开局部假极小值陷阱'), ('有界 TRF 优化', '投影梯度与仿射缩放边界约束', '实测数据拟合误差 RMS% < 1.5%')])
        ]
    },
    {
        'folder': 'part5-transient-dynamics-15dof',
        'is_foundation': False,
        'part_label': '第五篇',
        'title': '第五篇 15-DOF 全车多体瞬态动力学',
        'loc': '赛道极限全时域高保真物理底座——建立车身 6-DOF + 四轮跳动 4-DOF + 四轮自转 4-DOF 的 15 自由度状态空间方程组。',
        'mech': '非惯性坐标系牛顿-欧拉方程、1000Hz 半隐式欧拉积分、四象限非对称减振器双速 Blow-off 泄压阀、聚氨酯限位块击穿与文丘里地面效应 ge(h) 耦合。',
        'chapters': [
            ('ch16-15dof-state-equations.md', '15 自由度状态空间微分方程组建立', '机体坐标系牛顿-欧拉动力学方程、四轮独立自转与 1000Hz 半隐式欧拉积分。', [('状态向量 S', '15 维刚体位形、线角速度与轮速', '完整描述全车三维空间动态'), ('牛顿-欧拉方程', '计入柯氏与向心加速度的动量方程', '精确表达车身 6 自由度惯性耦合'), ('1000Hz 积分', '微子步半隐式欧拉推进算法', '确保大刚度与路面冲击数值收敛')]),
            ('ch17-nonlinear-dampers-bumpstops.md', '四象限非线性减振器与限位块击穿模型', '压缩/回弹非对称阻尼、双速 Blow-off 泄压阀与微孔聚氨酯缓冲块二次渐进硬化。', [('四象限阻尼', '低速操控斜率与高速泄压斜率', '分段解析方程消除过坎粗暴冲击'), ('Blow-off 阀', 'BLOW=0.38 拐点泄压机制', '保护轮胎贴地率不发生弹跳离地'), ('限位块击穿', '二次非线性渐进刚度模型', '防止大行程压缩发生金属硬托底')]),
            ('ch18-aerodynamics-ground-effect.md', '空气动力学多场耦合：地面效应与 DRS', '速度平方律气动力、姿态耦合离地间隙、文丘里地面效应饱和函数与 DRS 减阻。', [('姿态耦合间隙', '前后轴动态离地间隙 hf, hr 计算', '俯仰与跳动实时改变气动姿态'), ('地面效应 ge(h)', '防失速截断非线性吸力放大因子', '下压力随离地间隙降低剧增'), ('DRS 动态减阻', '尾翼减阻 28% 与下压力削减', '直道极速提升 15~25 km/h')])
        ]
    },
    {
        'folder': 'part6-track-and-autopilot',
        'is_foundation': False,
        'part_label': '第六篇',
        'title': '第六篇 赛道环境、最优赛车线与自动驾驶',
        'loc': '虚拟试验场与极限赛车线控制中枢——将连续赛道微分流形与高动态车速规划、同源 Stanley 跟踪控制器深度融合。',
        'mech': 'Catmull-Rom 闭合连续三次样条、7 点移动加权平滑滤波、外内外四段余弦赛车线、双向斜率硬限幅、同源 Stanley 反馈与逐圈自适应刹车学习。',
        'chapters': [
            ('ch19-circuit-spline-geometry.md', '闭合赛道样条几何学与连续曲率提取', 'Catmull-Rom 三次样条插值、累积弧长参数化、7 点平滑滤波与上海赛道 69 路点。', [('Catmull-Rom', '闭合 C^1 连续样条基矩阵', '严格穿过控制路点并保证平滑切线'), ('7 点加权滤波', '高频曲率毛刺卷积滤波算法', '噪声方差压降 98% 且保留弯心峰值'), ('上海国际赛车场', '69 特征路点完整高精拓扑', '涵盖螺线蜗牛弯与 1.17km 超长大直道')]),
            ('ch20-out-in-out-racing-line.md', '外-内-外平滑赛车线规划与速度剖面', '自动分弯与总转角迟滞滤波、四段余弦横向偏移、双向斜率限幅与 G-G 摩擦圆速度规划。', [('迟滞分弯', '总方向转角 >= 25° 阈值过滤', '彻底消除直道微小起伏假振荡'), ('余弦横向偏移', '外内外四段 C^1 平滑走线剖面', '充分利用赛道宽度与路肩增大半径'), ('双向速度积分', '反向极限刹车与正向动力出弯', '全赛道每一米求解最优极限速度')]),
            ('ch21-autopilot-stanley-learning.md', '曲率前馈 Stanley 控制与刹车自适应学习', '同源基准误差提取、阿克曼几何前馈、Stanley 自适应反馈与逐圈刹车试探学习。', [('三量同源基准', '航向、曲率与横向误差来自赛车线', '根除被拉回中心线的历史缺陷'), ('前馈+Stanley', '阿克曼无滞后前馈与自适应反馈', '兼顾高速跟踪刚度与抗扰平稳性'), ('刹车自适应学习', '逐圈推进刹车点与冲出赛道惩罚', '模拟顶级职业车手逐圈探索物理极限')])
        ]
    },
    {
        'folder': 'part7-proving-ground-and-rig',
        'is_foundation': False,
        'part_label': '第七篇',
        'title': '第七篇 试验场测试工况与 4-Post 台架动力学',
        'loc': '汽车综合试验场极限冲击验证与四柱液压振动台架频域动力学测试体系。',
        'mech': '飞坡抛体着陆冲击动能耗散、ISO 3888-2 双移线麋鹿测试、μ-Split 对开制动、4-Post 液压台架单角 2-DOF 状态空间双峰共振解析与 DLC 贴地率优化。',
        'chapters': [
            ('ch22-proving-ground-scenarios.md', '七大综合试验场场景数学与几何构建', '飞坡抛体与着陆动能耗散、交错减速坎、ISO 3888-2 双移线、对开制动与极限爬坡。', [('七大极限场景', '飞坡、交错坎、麋鹿测试、对开路面', '数学流形精确还原工业试验场工况'), ('飞坡着陆动力学', '抛体空中自由落体与触地动能耗散', '定量计算悬架弹簧吸收与阻尼吸能'), ('对开制动自稳定', '左右附着力差与主销偏航力矩', '负磨地半径产生自动纠偏稳定力矩')]),
            ('ch23-four-post-rig-dynamics.md', '4-Post 液压台架时域激励与振动响应', '五大标准激励信号、单角 2-DOF 状态空间、双峰共振分离、DLC 贴地率与 Flat Ride。', [('五大激励信号', '阶跃、正弦、高斯脉冲、扫频与随机白噪', '纯净受控环境下频域响应测试'), ('2-DOF 状态空间', '车身主模态与车轮跳动模态方程', '解析求解双模态固有圆频率与阻尼比'), ('DLC 贴地率', '车轮动载荷变异系数全局极小化', '兼顾车身姿态控制与轮胎极限附着')])
        ]
    },
    {
        'folder': 'part8-evaluation-and-correlation',
        'is_foundation': False,
        'part_label': '第八篇',
        'title': '第八篇 底盘综合评价体系、实测标定与调校闭环（核心精华）',
        'loc': '全书最高潮与终极工程闭环——建立 19 项黄金 KPI 偏导数图谱、三大台架对标闭环、赛道排障决策树与三大车型全案解剖。',
        'mech': '19 KPI 显式偏导数敏感性导数、三大台架（轮胎/K&C/衬套）对标 SOP、时域四阶段排障决策树、四级调校响应链与 FSAE/GT3/Baja 物理参数全案。',
        'chapters': [
            ('ch24-kpi-sensitivity-derivatives.md', '19 项核心 KPI 灵敏度导数图谱与参数调校杠杆', '看方程·改参数·看变化——19 项黄金 KPI 显式偏导数公式、敏感变量与调校大表。', [('19 项 KPI 图谱', '几何外倾、转向、力臂、弹性、操稳五维', '建立全参数偏导数敏感性矩阵'), ('偏导数敏感分析', '参数变动对赛道动态的定量微分导数', '彻底终结凭感觉调车的玄学时代'), ('工程权衡取舍', '直道制动 vs 弯道外倾、响应 vs 顶升', '阐明各项指标相互制约的客观规律')]),
            ('ch25-rig-correlation-and-calibration.md', '实测台架标定与仿真对标闭环方法论', '未经验证的仿真等于废纸——三大台架实测对标闭环、刚柔公差分离与全流程 SOP。', [('轮胎平带机闭环', '多载荷曲线 TRF 辨识与 15-DOF 回注', '自适应更新全车摩擦圆与 TCS/ABS 阈值'), ('K&C 台架对标', '实测曲线叠画、RMS 判定与刚柔分离', '0 载荷调硬点垫片，受力载荷调衬套柔度'), ('衬套台架标定', '6-DOF 力位移实测与 PCHIP 样条构造', '注入两层嵌套求解器实现数字孪生')]),
            ('ch26-trackside-troubleshooting-matrix.md', '赛道工程师排障决策树与全工况调校矩阵', '将车手主观反馈翻译为力学语言——入弯/弯心/出弯/路肩四时域排障决策树与四级响应链。', [('时域四阶段解耦', '入弯制动、弯心稳态、出弯开油、压路肩', '严禁跨阶段混淆调校破坏全车平衡'), ('四级调校响应链', 'Level 1 即时偏置 -> Level 4 结构重组', '匹配维修区高压快节奏调校时间成本'), ('排障决策矩阵', '全工况推头/甩尾/打手/跳动对策大表', '快速锁定黄金调校参数并提升圈速')]),
            ('ch27-full-chassis-case-studies.md', '三大经典车型从零到赛道调校全案实战解剖', 'FSAE 220kg、GT3 1350kg 双模、Baja 190mm 超长行程三大车型全生命周期开发解剖与 19 KPI 全景大表。', [('Formula SAE', '超轻量化、推杆高安装比、取消防倾杆', '依靠极硬主弹簧控侧倾与 2.65g 极限侧向力'), ('FIA GT3 房车', '大惯量、直连减振支柱、赛道/雨地双模', '快速切换 TLLTD 与四象限阻尼适应全天候'), ('SAE Baja 越野', '190mm 超长行程、高 RC 抗翻滚、飞坡防击穿', '同心圆弧压制 Bump Steer 并经受 3.5m/s 坠落'), ('19 KPI 全景对比', '三大车型全指标横向横向对比大矩阵', '全面印证全书理论力学与调校工程哲学')])
        ]
    }
]

def clean_prose(text):
    text = re.sub(r'`(engine/[^`]+|web/[^`]+)`', r'*\1*', text)
    text = re.sub(r'`(closest_point_on_circle|pose_metrics|rotate_around_axis|calcDamper|_anderson|solve_pose|fit_tire_params|solve_link_forces)`', r'*\1*', text)
    text = re.sub(r'`(np\.[a-zA-Z0-9_]+|Math\.[a-zA-Z0-9_]+)`', r'*\1*', text)
    return text

def process_chapter(ch_path, ch_num, ch_title, ch_anchor, ch_map, is_foundation=False):
    raw = ch_path.read_text(encoding='utf-8')
    lines = raw.splitlines()
    
    out = []
    # Chapter Heading
    if is_foundation:
        out.append(f"## 基础 {ch_num} {ch_title}\n")
    else:
        out.append(f"## 第 {ch_num} 章 {ch_title}\n")
    
    # Anchor Block
    out.append(f"**脉络锚点**：{ch_anchor}\n")
    
    # Navigation Map Table
    out.append("**本章导图**：\n")
    out.append("| 核心课题 | 支配方程 / 关键变量 | 一句话力学结论 |")
    out.append("|---|---|---|")
    for topic, eq_var, concl in ch_map:
        out.append(f"| {topic} | {eq_var} | {concl} |")
    out.append("\n")
    
    body_start = 0
    for idx, l in enumerate(lines):
        if l.startswith('# '):
            body_start = idx + 1
            break
            
    body_lines = lines[body_start:]
    
    for l in body_lines:
        l_str = clean_prose(l)
        
        # Section level (## -> ###)
        m_sec = re.match(r'^##\s*([0-9]+)[\.、\s]*(.*)', l_str)
        if m_sec:
            s_num = m_sec.group(1)
            s_title = m_sec.group(2).strip()
            tag = ""
            if "物理图景" in s_title or "痛点" in s_title:
                tag = "【前置】"
            elif "数学力学" in s_title or "推导" in s_title or "方程" in s_title:
                tag = "【推导】"
            elif "控制变量" in s_title or "灵敏度" in s_title:
                tag = "【对照】"
            elif "代码实现" in s_title or "数值稳定性" in s_title:
                tag = "【查证】"
            elif "算例" in s_title or "Worked Example" in s_title or "数值" in s_title:
                tag = "【演算】"
            elif "实战调校" in s_title or "排障" in s_title or "指南" in s_title:
                tag = "【案例】"
                
            if is_foundation:
                out.append(f"### 0.{ch_num}.{s_num} {s_title} {tag}")
            else:
                out.append(f"### {ch_num}.{s_num} {s_title} {tag}")
            continue
            
        # Subsection level (### -> ####)
        m_sub = re.match(r'^###\s*([0-9]+)\.([0-9]+)[\.、\s]*(.*)', l_str)
        if m_sub:
            s1, s2, st = m_sub.group(1), m_sub.group(2), m_sub.group(3).strip()
            if is_foundation:
                out.append(f"#### 0.{ch_num}.{s1}.{s2} {st}")
            else:
                out.append(f"#### {ch_num}.{s1}.{s2} {st}")
            continue
            
        m_sub4 = re.match(r'^####\s*(.*)', l_str)
        if m_sub4:
            st4 = m_sub4.group(1).strip()
            out.append(f"#### {st4}")
            continue
            
        if "Worked Example" in l_str or "算例背景" in l_str:
            l_str = l_str.replace("Worked Example", "【演算】Worked Example")
            
        out.append(l_str)
        
    return '\n'.join(out)

master = []

# 1. Standalone Cover Block
master.append("""# 车辆工程 · 全车底盘悬架力学与动力学工程全书

> **LABSUS RACING DYNAMICS & SUSPENSION MECHANICS MONOGRAPH**  
> 从空间多体运动学、K&C 弹性力学到 15-DOF 瞬态动力学与赛道调校工程闭环

![方程式赛车全车底盘悬架与多体动力学机构总成透视装配图](cover_illustration_vertical.jpg)

> **著　者**：**山海浪子**  
> **协　同**：LABSUS 赛车动力学与高性能底盘研发工程团队  
> **适用领域**：世界级方程式/GT3 赛车与高性能乘用车底盘悬架力学、多体动力学与赛道实测标定  
> **全书体量**：8 大核心篇章 + 完整数理基础篇 · 31 篇专业章节 · 6,032 行高保真代码级推导  
> **出版版本**：2026 年 9 月合订本 · 车辆工程学习笔记 · 绝密工程典藏

<div style="page-break-after: always; break-after: page;"></div>
""")

# 2. Standalone Comprehensive Table of Contents Block
master.append("""# 全书总目录 (Table of Contents)

---

""")

ch_global_counter = 1
for part in parts_meta:
    master.append(f"### {part['title']}\n\n")
    is_fd = part.get('is_foundation', False)
    sub_c = 1
    for ch_fname, ch_t, _, _ in part['chapters']:
        if is_fd:
            master.append(f"* **基础 {sub_c}**：{ch_t}\n")
            sub_c += 1
        else:
            master.append(f"* **第 {ch_global_counter} 章**：{ch_t}\n")
            ch_global_counter += 1
    master.append("\n")

master.append("""<div style="page-break-after: always; break-after: page;"></div>\n\n""")

# 3. Global Norms
readme_path = handbook_dir / 'README.md'
if readme_path.exists():
    rm_text = readme_path.read_text(encoding='utf-8')
    master.append("## 全局坐标系与符号系统约定\n")
    rm_lines = rm_text.splitlines()
    filtered = []
    capture = False
    for line in rm_lines:
        if "全局坐标系与符号系统约定" in line:
            capture = True
            continue
        if capture and line.startswith("## 📚 全书总目录"):
            break
        if capture:
            if line.startswith('### '):
                filtered.append('### ' + line[4:])
            elif line.startswith('## '):
                filtered.append('### ' + line[3:])
            else:
                filtered.append(line)
    master.append('\n'.join(filtered))
    master.append('\n\n---\n\n')

# 4. Process all Parts & Chapters
for part in parts_meta:
    master.append(f"# {part['title']}\n\n")
    master.append(f"> **在全书的位置**：{part['loc']}  \n"
                  f"> **核心力学机制**：{part['mech']}\n\n")
    master.append("---\n\n")
    
    is_fd = part.get('is_foundation', False)
    ch_counter = 1
    p_folder = handbook_dir / part['folder']
    for ch_fname, ch_t, ch_anc, ch_m in part['chapters']:
        ch_p = p_folder / ch_fname
        if ch_p.exists():
            formatted_ch = process_chapter(ch_p, ch_counter, ch_t, ch_anc, ch_m, is_foundation=is_fd)
            master.append(formatted_ch)
            master.append('\n\n---\n\n')
            ch_counter += 1

final_md = '\n'.join(master)
output_md.write_text(final_md, encoding='utf-8')
print(f"Successfully generated Master Anthropic-styled Handbook Markdown: {output_md}")
