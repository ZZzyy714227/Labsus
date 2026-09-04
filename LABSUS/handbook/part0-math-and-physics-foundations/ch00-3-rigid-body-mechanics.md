# 基础 3：理论力学、空间力系与刚体动力学基础

---

## 1. 物理图景与工程痛点

在底盘悬架系统与全车动力学中，每一个零部件都遵循严格的牛顿-欧拉力学定律：
1. **力平移时的“凭空力矩”**：当轮胎接地点受到地面提供的侧向力 $F_y$ 和制动力 $F_x$ 时，为什么把这两个力平移到车轮轮心（Hub Center）或转向节质心，会凭空产生巨大的倾覆力矩与转向回正力矩？这依赖**力向一点平移定理**；
2. **转动惯量的三维张量属性**：汽车不仅有整备质量 $m$，还有绕 $X$ 轴（侧倾）、$Y$ 轴（俯仰）、$Z$ 轴（横摆）的转动惯量。为什么高速弯中剧烈侧倾时，车身会产生非预期的俯仰波动？这依赖**三维惯性张量矩阵与牛顿-欧拉方程中的陀螺力矩交叉耦合**；
3. **悬架多体自由度数究竟是多少**：一个空间双横臂悬架包含车身、上下A臂、转向节、拉杆和减振推杆，构件众多、铰链复杂，为什么整套机构恰好只有 2 个独立运动自由度（轮跳与转向）？这依赖**空间机构自由度 Grübler / Kutzbach 准则**。

本章从力学第一性原理出发，系统推导力系简化、惯性张量、平行轴定理、牛顿-欧拉动力学方程与机构自由度，为后续全书各篇章提供坚不可摧的物理力学支撑。

---

## 2. 底层数学力学严密推导

### 2.1 力系简化、力偶与力向一点平移定理

在刚体力学中，力是一个**滑动矢量（Sliding Vector）**，其作用效果不仅取决于大小和方向，还取决于其作用线在空间的位置。

#### (1) 力对点的矩（力矩）
设力 $\boldsymbol{F}$ 作用于空间点 $A$，其相对于参考基准点 $O$ 的位置矢量为 $\boldsymbol{r}_{OA} = \boldsymbol{r}_A - \boldsymbol{r}_O$。力 $\boldsymbol{F}$ 对点 $O$ 的矩（矢量力矩）定义为叉积：
$$\boldsymbol{M}_O = \boldsymbol{r}_{OA} \times \boldsymbol{F} = [\boldsymbol{r}_{OA}]_\times \boldsymbol{F}$$
其模长为：
$$\|\boldsymbol{M}_O\| = \|\boldsymbol{r}_{OA}\| \|\boldsymbol{F}\| \sin\theta = F \cdot d$$
其中 $d$ 为从矩心 $O$ 到力 $\boldsymbol{F}$ 作用线的垂直距离（力臂）。

#### (2) 力偶与力偶矩的自由矢量性
两个大小相等、方向相反且不共线的一对力 $\{\boldsymbol{F}, -\boldsymbol{F}\}$ 构成的系统称为**力偶（Couple）**。
设两力分别作用于点 $A$ 和点 $B$。该力偶对空间任意参考点 $O$ 的合力矩为：
$$\boldsymbol{M} = \boldsymbol{r}_{OA} \times \boldsymbol{F} + \boldsymbol{r}_{OB} \times (-\boldsymbol{F}) = (\boldsymbol{r}_{OA} - \boldsymbol{r}_{OB}) \times \boldsymbol{F} = \boldsymbol{r}_{BA} \times \boldsymbol{F}$$
**力学核心定理**：
力偶对任意点的矩完全相同，且**与参考基准点 $O$ 的位置毫无关系**！因此力偶矩是一个**自由矢量（Free Vector）**，可以在空间任意平行移动而不改变其对刚体的转动外效应。

#### (3) 力向一点平移定理 (Poinsot's Theorem)
**定理 3.1**：
作用在刚体上某点 $A$ 的力 $\boldsymbol{F}$，可以平行移动到刚体上任意指定点 $O$；但为了保证力学外效应严格等效，必须在点 $O$ 处附加一个力偶，该附加力偶的力偶矩等于原力 $\boldsymbol{F}$ 对新作用点 $O$ 的矩：
$$\boldsymbol{M}_{add} = \boldsymbol{r}_{OA} \times \boldsymbol{F}$$

*证明*：
在目标点 $O$ 处虚构施加一对相互平衡的力偶力 $\{\boldsymbol{F}, -\boldsymbol{F}\}$（大小与原力相同，方向相反）。显然，这不改变原刚体的力学状态。
此时，原作用点 $A$ 的力 $\boldsymbol{F}$ 与点 $O$ 处的力 $-\boldsymbol{F}$ 构成立偶，其力偶矩为 $\boldsymbol{M} = \boldsymbol{r}_{OA} \times \boldsymbol{F}$；而点 $O$ 处剩余一个与原力同向的力 $\boldsymbol{F}$。定理得证。 $\blacksquare$

#### (4) 接地点力向轮毂中心的平移等效（第 6 章物理源头）
设轮胎接地印迹中心为 $P_{contact} = [x_c, y_c, z_c]^T$，车轮轮心坐标为 $P_{hub} = [x_h, y_h, z_h]^T$。地面施加给轮胎的接触力为：
$$\boldsymbol{F}_{contact} = [F_x, F_y, F_z]^T, \quad \boldsymbol{M}_{contact} = [M_x, M_y, M_z]^T$$
根据平移定理，将地面力系整体平移至轮毂中心 $P_{hub}$，合成的轮端 6-DOF 力螺旋（Force Wrench）主矢与主矩为：
$$\boldsymbol{F}_{hub} = \boldsymbol{F}_{contact} = [F_x, F_y, F_z]^T$$
$$\boldsymbol{M}_{hub} = \boldsymbol{M}_{contact} + (\boldsymbol{P}_{contact} - \boldsymbol{P}_{hub}) \times \boldsymbol{F}_{contact}$$
由于轮胎在垂直方向存在有效滚动半径 $R_{eff} \approx z_h - z_c > 0$：
$$(\boldsymbol{P}_{contact} - \boldsymbol{P}_{hub}) \approx [0, 0, -R_{eff}]^T$$
此时叉积展开项为：
$$\begin{bmatrix} 0 \\ 0 \\ -R_{eff} \end{bmatrix} \times \begin{bmatrix} F_x \\ F_y \\ F_z \end{bmatrix} = \begin{bmatrix} R_{eff} F_y \\ -R_{eff} F_x \\ 0 \end{bmatrix}$$
由此可以看清力学本质：
* 侧向力 $F_y$ 经由半径力臂产生巨大的**外倾翻转力矩** $\Delta M_x = R_{eff} F_y$；
* 纵向力 $F_x$ 产生促使车轮旋转的**驱动/制动力矩** $\Delta M_y = -R_{eff} F_x$！

---

### 2.2 质量几何：转动惯量与三维惯性张量矩阵

#### (1) 转动惯量定义与平行轴定理 (Steiner's Theorem)
刚体对指定旋转轴线 $L$ 的转动惯量度量了其抵抗角加速度转动的惯性大小：
$$I_L = \int r_\perp^2 dm$$
其中 $r_\perp$ 为微元质量 $dm$ 到轴线 $L$ 的垂直距离。

**平行轴定理（Steiner 定理）**：
若轴线 $L$ 与通过质心 $CG$ 的平行轴线 $L_{CG}$ 之间的距离为 $d$，则刚体对轴线 $L$ 的转动惯量满足：
$$I_L = I_{CG} + m d^2$$
*物理推论*：质心轴线的转动惯量永远是所有平行轴线中的**全局最小值**；零件质心每偏离转动轴线距离 $d$，转动惯量按距离平方 $m d^2$ 剧烈暴增。

#### (2) 三维空间惯性张量矩阵 (Inertia Tensor)
刚体绕空间任意过基准点的角速度向量 $\boldsymbol{\omega} = [\omega_x, \omega_y, \omega_z]^T$ 旋转时，其角动量矢量（动量矩）$\boldsymbol{H}$ 与角速度呈线性张量关系：
$$\boldsymbol{H} = \boldsymbol{I} \boldsymbol{\omega}$$
其中对称方阵 $\boldsymbol{I} \in \mathbb{R}^{3 \times 3}$ 称为**惯性张量矩阵（Inertia Tensor）**：
$$\boldsymbol{I} = \begin{bmatrix} I_{xx} & -I_{xy} & -I_{xz} \\ -I_{yx} & I_{yy} & -I_{yz} \\ -I_{zx} & -I_{zy} & I_{zz} \end{bmatrix}$$
各矩阵元素定义为全刚体质量体积分：
* **主转动惯量（对角项）**：
  $$I_{xx} = \int (y^2 + z^2) dm \quad (\text{绕 } X \text{ 轴，侧倾惯量 Roll Inertia})$$
  $$I_{yy} = \int (x^2 + z^2) dm \quad (\text{绕 } Y \text{ 轴，俯仰惯量 Pitch Inertia})$$
  $$I_{zz} = \int (x^2 + y^2) dm \quad (\text{绕 } Z \text{ 轴，横摆惯量 Yaw Inertia})$$
* **惯性积（非对角项，度量质量分布的不对称度）**：
  $$I_{xy} = I_{yx} = \int xy dm, \quad I_{yz} = I_{zy} = \int yz dm, \quad I_{xz} = I_{zx} = \int xz dm$$

> **车辆工程对称性法则**：
> 乘用车与赛车车身在几何与结构上关于纵向垂面（$XZ$ 平面）几乎严格左右镜像对称。因此，左右方向积分为奇函数：
> $$I_{xy} \approx 0, \quad I_{yz} \approx 0$$
> 只有质心纵向与垂向不对称项 $I_{xz} \neq 0$（通常量级远小于对角主项）。这极大地简化了整车瞬态动力学方程组。

---

### 2.3 非惯性系导数公式与牛顿-欧拉动力学方程

车辆动力学仿真通常在固连于车身的运动参考坐标系（机体坐标系 Body Frame）下建立。机体坐标系不是惯性系，它随着车身同时发生高速平移与空间角转动。

#### (1) 动坐标系中矢量时间导数的泊松公式 (Poisson Formula)
设机体坐标系相对于惯性参考系的角速度向量为 $\boldsymbol{\omega}$。空间任意物理矢量 $\boldsymbol{A}$（如动量、速度）在惯性系中的绝对时间变化率，与在机体坐标系内部观察到的相对时间变化率之间满足严格的泊松微分关系：
$$\left(\frac{d\boldsymbol{A}}{dt}\right)_{inertial} = \left(\frac{d\boldsymbol{A}}{dt}\right)_{body} + \boldsymbol{\omega} \times \boldsymbol{A}$$

#### (2) 刚体平移动量定理（牛顿方程）
设车辆总质量为 $m$，质心在机体坐标系中的速度为 $\boldsymbol{v} = [u, v, w]^T$。绝对动量为 $\boldsymbol{P} = m\boldsymbol{v}$。由牛顿第二定律：
$$\boldsymbol{F}_{ext} = \left(\frac{d\boldsymbol{P}}{dt}\right)_{inertial} = m \left[ \dot{\boldsymbol{v}} + \boldsymbol{\omega} \times \boldsymbol{v} \right]$$
展开分量形式（其中向心加速度与科里奥利项自然显现）：
$$F_x = m(\dot{u} - v\omega_z + w\omega_y)$$
$$F_y = m(\dot{v} - w\omega_x + u\omega_z)$$
$$F_z = m(\dot{w} - u\omega_y + v\omega_x)$$

#### (3) 刚体定点转动动量矩定理（欧拉方程）
质心动量矩为 $\boldsymbol{H} = \boldsymbol{I}\boldsymbol{\omega}$。由动量矩定理：
$$\boldsymbol{M}_{CG} = \left(\frac{d\boldsymbol{H}}{dt}\right)_{inertial} = \boldsymbol{I} \dot{\boldsymbol{\omega}} + \boldsymbol{\omega} \times (\boldsymbol{I} \boldsymbol{\omega})$$
代入车身主惯性轴条件（$I_{xy} = I_{yz} \approx 0$），展开三轴标量欧拉动力学方程：
$$M_x = I_{xx}\dot{\omega}_x - I_{xz}\dot{\omega}_z + (I_{zz} - I_{yy})\omega_y\omega_z + I_{xz}\omega_x\omega_y$$
$$M_y = I_{yy}\dot{\omega}_y + (I_{xx} - I_{zz})\omega_x\omega_z + I_{xz}(\omega_z^2 - \omega_x^2)$$
$$M_z = I_{zz}\dot{\omega}_z - I_{xz}\dot{\omega}_x + (I_{yy} - I_{xx})\omega_x\omega_y - I_{xz}\omega_y\omega_z$$

> **陀螺力矩物理图景**：
> 式中交叉项 $(I_{zz} - I_{yy})\omega_y\omega_z$ 即为著名的**陀螺力矩（Gyroscopic Moment）**！当车辆在高速弯中发生横摆（$\omega_z \neq 0$）同时压过路肩产生俯仰（$\omega_y \neq 0$）时，即使外侧悬架没有施加任何侧倾外力矩，车身也会自发爆发出侧向翻滚力矩！这是第 16 章 15-DOF 瞬态动力学仿真中必须完整计入的非线性物理项。

---

### 2.4 空间机构自由度与 Grübler / Kutzbach 准则

悬架机构由多个构件通过不同类型的运动副连接而成。如何定量判定一个空间机构具有多少个独立自由度？

#### (1) Kutzbach 空间自由度计算公式
对空间多体运动链，自由度数（Degrees of Freedom, DOF）由 **Kutzbach 准则**唯一确定：
$$\mathrm{DOF} = 6(N - 1) - \sum_{i=1}^j (6 - f_i)$$
其中：
* $N$：包含参考机架（车身）在内的系统总构件数；
* $j$：机构中的运动副（铰链、滑块等）总数；
* $f_i$：第 $i$ 个运动副所允许的相对自由度数（约束数 $c_i = 6 - f_i$）。

#### (2) 空间悬架常用运动副分类表

| 运动副名称 | 符号 | 允许相对运动自由度 ($f_i$) | 限制自由度数 ($c_i = 6 - f_i$) | 悬架实际工程对应零部件 |
|---|---|---|---|---|
| **球铰副 (Spherical)** | $S$ | $3$ (3轴转动) | $3$ (限制 3 轴平移) | 转向节上/下球头点、拉杆球头 |
| **转动副 (Revolute)** | $R$ | $1$ (单轴转动) | $5$ (限制 3 平移 + 2 转动) | A臂与副车架连接轴、摇臂转轴 |
| **柱面副 (Cylindrical)** | $C$ | $2$ (1转动 + 1轴向移动) | $4$ (限制 2 平移 + 2 转动) | 减振器活塞与外筒伸缩导向 |
| **空间二力杆 (Link)** | $L$ | $5$ (两端球铰+绕自身自转) | $1$ (仅限制两端点标量欧氏距离) | 悬架 5 根独立推杆/多连杆 |

#### (3) 经典双横臂悬架自由度严格代数验算
考虑前桥空间双横臂悬架系统（上A臂、下A臂、转向节、转向拉杆、减振推杆及摇臂）：
* 构件总数 $N = 5$（车身 1、上臂 2、下臂 3、转向节 4、转向拉杆 5）；
* 上A臂通过转动副 $R$ 连接车身（$c_1 = 5$），外端通过球铰 $S$ 连接转向节（$c_2 = 3$）；
* 下A臂通过转动副 $R$ 连接车身（$c_3 = 5$），外端通过球铰 $S$ 连接转向节（$c_4 = 3$）；
* 转向拉杆两端均为球铰 $S$（两端球铰引入 $3+3=6$ 个约束，加上杆件自转虚自由度，净约束数为 5）；
代入 Kutzbach 准则计算：
$$\mathrm{DOF} = 6(5 - 1) - (5 + 3 + 5 + 3 + 6) + 1_{\text{自转虚自由度}} = 24 - 22 = 2$$
**计算结论**：
双横臂悬架恰好具备严格的 **2 个独立运动自由度**：
1. **车轮上下跳动自由度 (Wheel Travel $tr$)**；
2. **车轮转向角偏转自由度 (Steering Angle $\delta$)**。
只要给定跳动行程与转向齿条位移，转向节在三维空间中的位置与姿态便被 100% 确定，不存在任何发散的未定自由度！

---

## 3. 手把手基础数值算例 (Worked Example)

### 算例背景：赛车接地外力向轮心平移的 6-DOF 力螺旋计算

**工程已知参数**：
某 GT3 赛车以 $120\,\text{km/h}$ 进入高速右弯并轻踩制动，右前轮接地印迹中心受力如下：
* 轮胎接地中心相对轮心的位置向量：
  $$\boldsymbol{r}_{hub \to contact} = [0.010, \; 0.020, \; -0.320]^T\,\text{m}$$
  （轮心前方 $10\,\text{mm}$，外侧偏置 $20\,\text{mm}$，垂直滚动半径 $320\,\text{mm}$）
* 地面外力矢量：
  $$\boldsymbol{F}_{contact} = [-3000.0, \; 6500.0, \; 8000.0]^T\,\text{N}$$
  （制动力 $3000\,\text{N}$，外侧向心侧向力 $6500\,\text{N}$，垂向支撑力 $8000\,\text{N}$）
* 地面自回正力矩：
  $$\boldsymbol{M}_{contact} = [0.0, \; 0.0, \; -180.0]^T\,\text{N}\cdot\text{m}$$

### 步骤 1：主矢平移
根据力向一点平移定理，轮毂中心处的主矢力与接地点完全相同：
$$\boldsymbol{F}_{hub} = \boldsymbol{F}_{contact} = [-3000.0, \; 6500.0, \; 8000.0]^T\,\text{N}$$

### 步骤 2：计算附加力偶矩 $\boldsymbol{r} \times \boldsymbol{F}$
应用叉乘公式计算附加力矩 $\boldsymbol{M}_{add} = \boldsymbol{r}_{hub \to contact} \times \boldsymbol{F}_{contact}$：
$$\begin{aligned}
M_{add, x} &= y F_z - z F_y = (0.020)(8000.0) - (-0.320)(6500.0) = 160.0 - (-2080.0) = 2240.0\,\text{N}\cdot\text{m} \\
M_{add, y} &= z F_x - x F_z = (-0.320)(-3000.0) - (0.010)(8000.0) = 960.0 - 80.0 = 880.0\,\text{N}\cdot\text{m} \\
M_{add, z} &= x F_y - y F_x = (0.010)(6500.0) - (0.020)(-3000.0) = 65.0 - (-60.0) = 125.0\,\text{N}\cdot\text{m}
\end{aligned}$$

### 步骤 3：合成轮心总力螺旋主矩
$$\boldsymbol{M}_{hub} = \boldsymbol{M}_{contact} + \boldsymbol{M}_{add} = \begin{bmatrix} 0.0 \\ 0.0 \\ -180.0 \end{bmatrix} + \begin{bmatrix} 2240.0 \\ 880.0 \\ 125.0 \end{bmatrix} = \begin{bmatrix} 2240.0 \\ 880.0 \\ -55.0 \end{bmatrix}\,\text{N}\cdot\text{m}$$

**力学结论核对**：
* 侧向力产生的翻滚力矩高达 $2240.0\,\text{N}\cdot\text{m}$，该力矩由上/下摆臂球头分担，产生巨大的内/外侧拉压反力；
* 转向轴方向总力矩为 $-55.0\,\text{N}\cdot\text{m}$，直接传递给转向拉杆，决定了赛车手在方向盘上感知到的真实回正路感。

---

## 4. 本章小结

1. **力向一点平移必然伴随附加力矩**：轮胎接地点力系平移至轮心时，垂直力臂 $R_{eff}$ 将侧向力转换为数千牛米级的倾覆力矩，这是全书第 6 章建立 5 杆空间平衡矩阵方程 $\boldsymbol{A}\boldsymbol{f} = -\boldsymbol{F}_{hub}$ 的物理来源。
2. **欧拉动力学方程与陀螺力矩**：非惯性系下动量矩时间导数派生出交叉项 $\boldsymbol{\omega} \times (\boldsymbol{I}\boldsymbol{\omega})$，表明高速复合过弯时车身姿态存在强非线性惯性耦合。
3. **Kutzbach 准则确保构型确定性**：空间悬架机构必须满足 $\mathrm{DOF}=2$，保证了车轮跳动与转向位姿的唯一确定解，彻底消除多体发散的伪自由度。
