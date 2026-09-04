# 基础 2：多元微积分、微分几何与非线性优化

---

## 1. 物理图景与工程痛点

在现代底盘设计、动力学建模与赛车调校中，工程问题本质上几乎全部是非线性的：
* 悬架硬点每改变 $1\,\text{mm}$，车轮的外倾角和前束角究竟改变多少度？这依赖**多元全微分与偏导数灵敏度分析**；
* 多连杆机构铰链圆非线性约束方程组 $\boldsymbol{F}(\boldsymbol{x}) = \mathbf{0}$，在三维空间中不存在解析封闭解，必须依靠**雅可比矩阵 (Jacobian) 引导的牛顿-拉夫逊 (Newton-Raphson) 迭代**高速收敛；
* 轮胎试验台架测出的几千组侧偏力散点，如何拟合出魔术公式复杂的非线性三角函数？这依赖**海森矩阵近似的高斯-牛顿 (Gauss-Newton) 与 Levenberg-Marquardt 非线性最小二乘优化**；
* 赛车在赛道上行驶，极限车速由弯道物理半径决定，如何从离散路点中提取出平滑的**连续曲率 $\kappa(s)$ 并根据摩擦圆反算最高车速剖面**？这依赖**微分几何曲线理论**。

如果淡忘了微积分的基本定理、链式法则以及牛顿法的迭代本质，后续章节中繁杂的公式推导将变成枯燥的记忆负担。本章建立严密的微积分、微分几何与非线性优化知识框架，打通从微积分原理到底盘算法落地的思维链路。

---

## 2. 底层数学力学严密推导

### 2.1 导数链、链式法则与泰勒展开

#### (1) 运动学连续导数链
在时域中，质点的运动位姿由时间参数化标量或矢量函数描述。位移、速度、加速度与加加速度（Jerk）构成了连续的阶梯微分链：
* 位移矢量：$\boldsymbol{r}(t) = [x(t), y(t), z(t)]^T$
* 速度矢量：$\boldsymbol{v}(t) = \dot{\boldsymbol{r}}(t) = \frac{d\boldsymbol{r}}{dt} = [\dot{x}(t), \dot{y}(t), \dot{z}(t)]^T$
* 加速度矢量：$\boldsymbol{a}(t) = \ddot{\boldsymbol{r}}(t) = \frac{d^2\boldsymbol{r}}{dt^2} = [\ddot{x}(t), \ddot{y}(t), \ddot{z}(t)]^T$
* 跃度 / 加加速度 (Jerk)：$\boldsymbol{j}(t) = \dddot{\boldsymbol{r}}(t) = \frac{d^3\boldsymbol{r}}{dt^3}$

> **底盘工程直觉**：
> 速度决定空气动力学升阻力（平方律）；加速度决定四轮动态载荷转移量（达朗贝尔惯性力）；跃度 (Jerk) 直接决定车身冲击感与减振器阀系高频冲击响应，是底盘平顺性 (Ride Comfort) 与赛车敏捷性 (Agility) 的关键指标。

#### (2) 复合函数链式法则 (Chain Rule)
若因变量 $y = f(u)$，而中间变量 $u = g(x)$，则复合函数关于自变量 $x$ 的导数为中间各层导数的乘积：
$$\frac{dy}{dx} = \frac{dy}{du} \cdot \frac{du}{dx}$$
对于多元中间变量情形，若 $z = f(u_1, u_2, \dots, u_m)$，且每个 $u_i = g_i(x_1, \dots, x_n)$，则链式法则为全求和形式：
$$\frac{\partial z}{\partial x_j} = \sum_{i=1}^m \frac{\partial z}{\partial u_i} \frac{\partial u_i}{\partial x_j}$$
例如在悬架跳动中，车轮动态外倾角 $\gamma$ 随摆臂转角 $\theta$ 变化，摆臂转角又由轮跳行程 $tr$ 驱动，因此外倾变化增益（Camber Gain）本质上就是链式法则展开：
$$\frac{d\gamma}{d(tr)} = \frac{\partial\gamma}{\partial\theta_{arm}} \frac{\partial\theta_{arm}}{\partial(tr)}$$

#### (3) 泰勒级数展开 (Taylor Series) 与小角度线性化
若函数 $f(x)$ 在 $x_0$ 处具有任意阶导数，其邻域内的局部函数值可通过泰勒多项式逼近：
$$f(x_0 + \Delta x) = f(x_0) + f'(x_0)\Delta x + \frac{1}{2!}f''(x_0)(\Delta x)^2 + \dots + \frac{1}{n!}f^{(n)}(x_0)(\Delta x)^n + R_n(x)$$
在机械与动力学小变形工况下，常进行一阶或二阶截断：
* **一阶线性化**：$f(x_0 + \Delta x) \approx f(x_0) + f'(x_0)\Delta x$（割线斜率代替曲线）；
* **经典小角度三角函数近似（弧度制）**：
  $$\sin\theta = \theta - \frac{\theta^3}{6} + O(\theta^5) \approx \theta$$
  $$\cos\theta = 1 - \frac{\theta^2}{2} + O(\theta^4) \approx 1 - \frac{1}{2}\theta^2 \approx 1$$
  $$\tan\theta = \theta + \frac{\theta^3}{3} + O(\theta^5) \approx \theta$$
在侧倾角 $\phi \le 4^\circ \approx 0.07\,\text{rad}$ 的工况下，$\sin\phi \approx \phi$ 的相对误差小于 $0.08\%$，这构成了线性单轨二自由度操稳模型与准静态平衡的理论根基。

---

### 2.2 偏导数、全微分与制造公差灵敏度分析

#### (1) 多元函数偏导数
对于二元及以上函数 $f(x_1, x_2, \dots, x_n)$，对其中某一自变量 $x_i$ 的偏导数定义为：将其余所有变量视为常数时，$f$ 对 $x_i$ 的变化率：
$$\frac{\partial f}{\partial x_i} = \lim_{\Delta x_i \to 0} \frac{f(x_1, \dots, x_i + \Delta x_i, \dots, x_n) - f(x_1, \dots, x_i, \dots, x_n)}{\Delta x_i}$$

#### (2) 全微分 (Total Differential)
当所有自变量同时产生微小变动 $dx_1, dx_2, \dots, dx_n$ 时，函数值的总体改变量可由全微分线性近似：
$$df = \frac{\partial f}{\partial x_1} dx_1 + \frac{\partial f}{\partial x_2} dx_2 + \dots + \frac{\partial f}{\partial x_n} dx_n = \sum_{i=1}^n \frac{\partial f}{\partial x_i} dx_i = (\nabla f)^T d\boldsymbol{x}$$
其中 $\nabla f = \left[\frac{\partial f}{\partial x_1}, \dots, \frac{\partial f}{\partial x_n}\right]^T$ 称为标量函数 $f$ 的**梯度向量（Gradient Vector）**。

#### (3) 底盘工程公差与灵敏度分析
在悬架制造装配中，车身或副车架硬点不可避免存在公差（如 $\Delta x, \Delta y, \Delta z \in [\pm 1\,\text{mm}]$）。若主销后倾角为硬点坐标的多元非线性函数 $\theta_{caster} = g(\boldsymbol{P}_1, \boldsymbol{P}_2, \dots)$，则后倾角的最恶劣公差累积（Worst-case Tolerance）可由全微分的绝对值不等式迅速估算：
$$|\Delta \theta_{caster}| \le \sum_{i=1}^{3N} \left| \frac{\partial g}{\partial P_i} \right| |\Delta P_i|$$
这使得工程师在投产前就能精准识别出对定位角最敏感的关键孔位，从而将其指定为高精度加工基准。

---

### 2.3 雅可比矩阵 (Jacobian Matrix) 与牛顿-拉夫逊迭代

#### (1) 向量值函数的雅可比矩阵
设非线性映射 $\boldsymbol{F}: \mathbb{R}^n \to \mathbb{R}^m$ 将状态向量 $\boldsymbol{x} \in \mathbb{R}^n$ 映射为目标残差向量 $\boldsymbol{y} \in \mathbb{R}^m$：
$$\boldsymbol{y} = \boldsymbol{F}(\boldsymbol{x}) = \begin{bmatrix} F_1(x_1, \dots, x_n) \\ F_2(x_1, \dots, x_n) \\ \vdots \\ F_m(x_1, \dots, x_n) \end{bmatrix}$$
其一阶偏导数构成的 $m \times n$ 阶矩阵称为**雅可比矩阵（Jacobian Matrix）**：
$$\boldsymbol{J}(\boldsymbol{x}) \triangleq \frac{\partial \boldsymbol{F}}{\partial \boldsymbol{x}} = \begin{bmatrix} \frac{\partial F_1}{\partial x_1} & \frac{\partial F_1}{\partial x_2} & \cdots & \frac{\partial F_1}{\partial x_n} \\ \frac{\partial F_2}{\partial x_1} & \frac{\partial F_2}{\partial x_2} & \cdots & \frac{\partial F_2}{\partial x_n} \\ \vdots & \vdots & \ddots & \vdots \\ \frac{\partial F_m}{\partial x_1} & \frac{\partial F_m}{\partial x_2} & \cdots & \frac{\partial F_m}{\partial x_n} \end{bmatrix} \in \mathbb{R}^{m \times n}$$
**微分物理映射关系**：
$$d\boldsymbol{y} \approx \boldsymbol{J}(\boldsymbol{x}) d\boldsymbol{x}$$
雅可比矩阵将自变量微位移切空间 $d\boldsymbol{x}$ 精确映射为残差切空间的变化量 $d\boldsymbol{y}$。

#### (2) 牛顿-拉夫逊 (Newton-Raphson) 算法求解非线性方程组
目标：寻找状态向量 $\boldsymbol{x}^*$，使得非线性方程组残差为零：
$$\boldsymbol{F}(\boldsymbol{x}) = \mathbf{0}, \quad \boldsymbol{F}: \mathbb{R}^n \to \mathbb{R}^n$$
设当前迭代步估计值为 $\boldsymbol{x}_k$，在其附近进行一阶多元泰勒展开：
$$\boldsymbol{F}(\boldsymbol{x}_k + \Delta\boldsymbol{x}) \approx \boldsymbol{F}(\boldsymbol{x}_k) + \boldsymbol{J}(\boldsymbol{x}_k) \Delta\boldsymbol{x} = \mathbf{0}$$
当雅可比矩阵非奇异可逆时，解出局部最优搜索步长：
$$\boldsymbol{J}(\boldsymbol{x}_k) \Delta\boldsymbol{x}_k = -\boldsymbol{F}(\boldsymbol{x}_k) \implies \Delta\boldsymbol{x}_k = -[\boldsymbol{J}(\boldsymbol{x}_k)]^{-1} \boldsymbol{F}(\boldsymbol{x}_k)$$
更新状态：
$$\boldsymbol{x}_{k+1} = \boldsymbol{x}_k + \alpha \Delta\boldsymbol{x}_k$$
其中 $\alpha \in (0, 1]$ 为阻尼线搜索因子（防止非线性陡峭时发散）。牛顿法在根邻域具有二次收敛速度（Quadratic Convergence，误差按平方衰减），是全书第 4 章悬架双横臂求解器与第 8 章弹性 K&C 求解器的核心动力。

---

### 2.4 海森矩阵 (Hessian Matrix) 与非线性最小二乘极值优化

在模型参数辨识（如第 15 章轮胎 Pacejka 参数拟合）中，目标是最小化实测数据与理论公式之间的误差平方和：
$$\min_{\boldsymbol{\theta}} S(\boldsymbol{\theta}) = \frac{1}{2} \sum_{i=1}^M r_i(\boldsymbol{\theta})^2 = \frac{1}{2} \|\boldsymbol{r}(\boldsymbol{\theta})\|^2$$
其中 $\boldsymbol{r}(\boldsymbol{\theta}) = [r_1, \dots, r_M]^T \in \mathbb{R}^M$ 为残差向量，$\boldsymbol{\theta} \in \mathbb{R}^N$ 为待优化参数向量。

#### (1) 海森矩阵 (Hessian Matrix) 定义与极小值条件
标量目标函数 $S(\boldsymbol{\theta})$ 的二阶偏导数对称方阵称为海森矩阵：
$$\boldsymbol{H}(\boldsymbol{\theta}) = \nabla^2 S(\boldsymbol{\theta}) = \begin{bmatrix} \frac{\partial^2 S}{\partial \theta_1^2} & \cdots & \frac{\partial^2 S}{\partial \theta_1 \partial \theta_N} \\ \vdots & \ddots & \vdots \\ \frac{\partial^2 S}{\partial \theta_N \partial \theta_1} & \cdots & \frac{\partial^2 S}{\partial \theta_N^2} \end{bmatrix} \in \mathbb{R}^{N \times N}$$
* **一阶必要条件**：驻点处梯度为零，$\nabla S(\boldsymbol{\theta}^*) = \mathbf{0}$；
* **二阶充分条件**：驻点处海森矩阵严格正定，$\boldsymbol{H}(\boldsymbol{\theta}^*) \succ 0$（所有特征值 $\lambda_i > 0$），此时对应孤立局部严格极小值。

#### (2) 高斯-牛顿法 (Gauss-Newton) 与 Levenberg-Marquardt (LM) 演化
对残差向量计算雅可比矩阵 $\boldsymbol{J}_r = \frac{\partial \boldsymbol{r}}{\partial \boldsymbol{\theta}} \in \mathbb{R}^{M \times N}$。利用链式法则求梯度与海森矩阵：
$$\nabla S(\boldsymbol{\theta}) = \boldsymbol{J}_r^T \boldsymbol{r}(\boldsymbol{\theta})$$
$$\boldsymbol{H}(\boldsymbol{\theta}) = \boldsymbol{J}_r^T \boldsymbol{J}_r + \sum_{i=1}^M r_i(\boldsymbol{\theta}) \nabla^2 r_i(\boldsymbol{\theta})$$
在残差较小或接近线性时，二阶求导项 $\sum r_i \nabla^2 r_i \approx \mathbf{0}$ 可以忽略，导出高斯-牛顿近似：
$$\boldsymbol{H}_{GN} = \boldsymbol{J}_r^T \boldsymbol{J}_r$$
**Levenberg-Marquardt (LM) 阻尼优化**：
当 $\boldsymbol{J}_r^T \boldsymbol{J}_r$ 接近奇异时，高斯-牛顿法容易发散。LM 算法在对角线加入正定阻尼因子 $\lambda \ge 0$：
$$(\boldsymbol{J}_r^T \boldsymbol{J}_r + \lambda \boldsymbol{I}) \Delta\boldsymbol{\theta} = -\boldsymbol{J}_r^T \boldsymbol{r}(\boldsymbol{\theta})$$
* 当 $\lambda \to 0$ 时，平滑退化为收敛极快的高斯-牛顿法；
* 当 $\lambda \gg 1$ 时，退化为鲁棒的最速下降法（Gradient Descent）。

---

### 2.5 平面曲线微分几何与赛车线曲率

在第 19、20 章赛道赛车线规划与自动驾驶航向跟踪中，连续赛道微分流形是所有轨迹控制算法的基础。

#### (1) 参数化曲线与弧长参数 $s$
设平面赛道中心线或赛车线在笛卡尔坐标系中的参数方程为：
$$\boldsymbol{r}(t) = \begin{bmatrix} x(t) \\ y(t) \end{bmatrix}, \quad t \in [0, T]$$
微元弧长满足勾股定理：
$$ds = \sqrt{dx^2 + dy^2} = \sqrt{\dot{x}(t)^2 + \dot{y}(t)^2} dt \implies \frac{ds}{dt} = \|\dot{\boldsymbol{r}}(t)\|$$
以累积弧长 $s$ 作为自然参数（Natural Parameterization），沿线单位切向量为：
$$\boldsymbol{t}(s) = \frac{d\boldsymbol{r}}{ds} = \begin{bmatrix} \cos\psi(s) \\ \sin\psi(s) \end{bmatrix}, \quad \|\boldsymbol{t}(s)\| = 1$$
其中 $\psi(s)$ 为切线航向角（Heading Angle）。

#### (2) 曲率 $\kappa$ 与曲率半径 $\rho$ 的严密推导
曲率 $\kappa$ 度量了切向量沿弧长方向的旋转变化速率（Frenet-Serret 公式）：
$$\frac{d\boldsymbol{t}}{ds} = \kappa(s) \boldsymbol{n}(s)$$
其中 $\boldsymbol{n}(s) \perp \boldsymbol{t}(s)$ 为向心单位主法向量。
根据几何关系 $\kappa(s) = \frac{d\psi}{ds}$。若曲线由任意通用参数 $t$ 给出，应用链式法则：
$$\kappa(t) = \frac{|\dot{x}\ddot{y} - \dot{y}\ddot{x}|}{(\dot{x}^2 + \dot{y}^2)^{3/2}}$$
曲率半径定义为曲率的倒数：
$$\rho(t) = \frac{1}{\kappa(t)}$$

#### (3) 物理力学联结：极限摩擦圆过弯速度
质点沿曲率半径为 $\rho$ 的弯道以切向车速 $v$ 行驶时，向心加速度为：
$$a_y = v^2 \kappa = \frac{v^2}{\rho}$$
设路面横向附着系数为 $\mu$，重力加速度为 $g$。若忽略倾角与空气动力学下压力，轮胎极限抓地力为 $F_{y,\max} = \mu m g$。由牛顿第二定律：
$$m a_y \le \mu m g \implies v^2 \kappa \le \mu g \implies v \le \sqrt{\frac{\mu g}{\kappa}} = \sqrt{\mu g \rho}$$
**工程结论**：
弯道曲率 $\kappa$ 越小（半径 $\rho$ 越大），允许通过的极限车速越高！这就是为什么专业赛车手在入弯时必须走“外-内-外”（Out-In-Out）赛车线——其唯一物理目的就是**尽可能抹平拐点曲率、将局部转弯半径 $\rho$ 最大化**！

---

## 3. 手把手基础数值算例 (Worked Example)

### 算例背景：利用牛顿-拉夫逊法求解非线性连杆构型

**待解物理模型**：
某悬架推杆一端连接摆臂，另一端连接空间摇臂。摇臂绕固定轴转动角度为 $\theta$。机构空间几何闭合距离方程建立为非线性标量求根方程：
$$F(\theta) = 2.0 \cos\theta + 3.0 \sin(2\theta) - 1.5 = 0$$
已知初始猜测角 $\theta_0 = 0.2\,\text{rad}$，容差设为 $|F(\theta_k)| < 10^{-6}$。

### 步骤 1：解析求解一阶导数（一维雅可比）
$$F'(\theta) = \frac{dF}{d\theta} = -2.0 \sin\theta + 6.0 \cos(2\theta)$$

### 步骤 2：第 1 步牛顿迭代
代入初值 $\theta_0 = 0.2\,\text{rad}$：
$$\cos(0.2) = 0.98007, \quad \sin(0.4) = 0.38942$$
$$F(\theta_0) = 2.0(0.98007) + 3.0(0.38942) - 1.5 = 1.96014 + 1.16826 - 1.5 = 1.62840$$
导数值：
$$\sin(0.2) = 0.19867, \quad \cos(0.4) = 0.92106$$
$$F'(\theta_0) = -2.0(0.19867) + 6.0(0.92106) = -0.39734 + 5.52636 = 5.12902$$
更新步长：
$$\Delta\theta_0 = -\frac{F(\theta_0)}{F'(\theta_0)} = -\frac{1.62840}{5.12902} = -0.31749\,\text{rad}$$
新估计值：
$$\theta_1 = \theta_0 + \Delta\theta_0 = 0.2 - 0.31749 = -0.11749\,\text{rad}$$

### 步骤 3：第 2 步牛顿迭代
计算残差：
$$\cos(-0.11749) = 0.99311, \quad \sin(-0.23498) = -0.23283$$
$$F(\theta_1) = 2.0(0.99311) + 3.0(-0.23283) - 1.5 = 1.98622 - 0.69849 - 1.5 = -0.21227$$
计算导数：
$$\sin(-0.11749) = -0.11722, \quad \cos(-0.23498) = 0.97252$$
$$F'(\theta_1) = -2.0(-0.11722) + 6.0(0.97252) = 0.23444 + 5.83512 = 6.06956$$
更新步长：
$$\Delta\theta_1 = -\frac{-0.21227}{6.06956} = +0.03497\,\text{rad}$$
$$\theta_2 = -0.11749 + 0.03497 = -0.08252\,\text{rad}$$

### 步骤 4：收敛性与二次收敛验证
仅需再迭代 2 次，$\theta_4 = -0.08151\,\text{rad}$，此时残差 $|F(\theta_4)| = 2.4 \times 10^{-7} < 10^{-6}$，完全收敛！

---

## 4. 本章小结

1. **一阶泰勒展开与线性化**：小角度三角函数近似是操稳稳态模型简化的基石；全微分 $df = (\nabla f)^T d\boldsymbol{x}$ 将多元非线性映射线性化，用于分析悬架硬点公差灵敏度。
2. **雅可比矩阵是切空间坐标变换**：牛顿-拉夫逊法利用 $\boldsymbol{J}^{-1}$ 实现误差的反向投影修正，是空间多体机构运动学方程实时求解的第一利器。
3. **曲率主导赛道极限**：由微分几何推导出的向心加速度公式 $a_y = v^2 \kappa$ 揭示了最优赛车线规划的本质——平滑曲率峰值以换取最大出弯车速。
