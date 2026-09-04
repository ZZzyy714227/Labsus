# 基础 1：三维线性代数与矩阵分析全解

---

## 1. 物理图景与工程痛点

在底盘悬架工程、多刚体运动学与轮胎力学仿真中，几乎所有物理状态、几何约束与外力载荷最终都抽象为高维向量空间中的代数映射。许多读者在接触第 1 章空间姿态旋转（Rodrigues 公式、四元数）、第 6 章悬架 5 杆空间超定静力求解、第 15 章轮胎 Pacejka 参数辨识时，常常感到困惑：
1. **几何概念与代数形式割裂**：知道向量“点乘”和“叉乘”，但不清楚为什么空间旋转可以用一个反对称矩阵 $[\boldsymbol{u}]_\times$ 的平方幂次直接解析展开？为什么叉积的代数恒等式是推导有限角旋转算子的核心基石？
2. **坐标系手征性混淆**：习惯了教科书中的传统右手系，面对现代工程软件或本项目真源 `engine/src/core/convention.py` 采用的左手系（$+X$ 前、$+Y$ 右、$+Z$ 上），行列式展开为什么会自动处理手征性？正交矩阵 $\mathrm{SO}(3)$ 中 $\det(\boldsymbol{R}) = +1$ 与 $\det(\boldsymbol{R}) = -1$（镜像退化）在物理上究竟代表什么灾难性错误？
3. **矩阵病态与求解发散**：面对悬架多连杆空间受力，当方程数大于未知数（超定）或者杆系接近共线时，普通的矩阵求逆为什么会直接发散或崩溃？Moore-Penrose 广义逆、加权最小二乘 (WLS) 与 Tikhonov 岭回归的真实几何图景是什么？

本章从最基础的三维向量定义出发，循序渐进推导点积正交分解、叉积反对称算子 $[\boldsymbol{u}]_\times$ 幂次性质、$\mathrm{SO}(3)$ 正交群、奇异值分解 (SVD) 与极值定理，为全书后续空间多体动力学扫清全部代数障碍。

---

## 2. 底层数学力学严密推导

### 2.1 向量空间与坐标基底表示

设三维欧氏空间为 $\mathbb{R}^3$，任选一组相互正交的单位基底向量 $\{\boldsymbol{e}_1, \boldsymbol{e}_2, \boldsymbol{e}_3\}$（例如车身参考坐标系的纵向、横向与垂向轴）。任意空间物理向量 $\boldsymbol{v}$ 可以唯一表示为各基底分量的线性组合：
$$\boldsymbol{v} = v_x \boldsymbol{e}_1 + v_y \boldsymbol{e}_2 + v_z \boldsymbol{e}_3 = [v_x, v_y, v_z]^T$$

向量的欧几里得范数（长度 / 模长）定义为：
$$\|\boldsymbol{v}\| = \sqrt{v_x^2 + v_y^2 + v_z^2} = \sqrt{\boldsymbol{v}^T \boldsymbol{v}}$$
若 $\|\boldsymbol{v}\| \neq 0$，其单位方向向量为 $\hat{\boldsymbol{v}} = \frac{\boldsymbol{v}}{\|\boldsymbol{v}\|}$。

---

### 2.2 向量点积（数量积 / 内积）与正交投影算子

#### (1) 代数定义与几何性质
两个向量 $\boldsymbol{a} = [a_x, a_y, a_z]^T$ 与 $\boldsymbol{b} = [b_x, b_y, b_z]^T$ 的点积定义为对应坐标分量乘积的代数和：
$$\boldsymbol{a} \cdot \boldsymbol{b} = a_x b_x + a_y b_y + a_z b_z = \boldsymbol{a}^T \boldsymbol{b}$$
根据余弦定理，点积的几何等价形式为：
$$\boldsymbol{a} \cdot \boldsymbol{b} = \|\boldsymbol{a}\| \|\boldsymbol{b}\| \cos\theta$$
其中 $\theta \in [0, \pi]$ 为两向量间的夹角。若 $\boldsymbol{a} \cdot \boldsymbol{b} = 0$ 且两者非零，则称 $\boldsymbol{a}$ 与 $\boldsymbol{b}$ 相互正交（Orthogonal，垂直）。

#### (2) 空间投影与正交补算子
设 $\boldsymbol{u}$ 为空间已知方向的单位向量（$\|\boldsymbol{u}\| = 1$）。任意向量 $\boldsymbol{v}$ 均可无歧义地分解为**平行于 $\boldsymbol{u}$ 的纵向投影分量** $\boldsymbol{v}_\parallel$ 与**垂直于 $\boldsymbol{u}$ 的横向正交分量** $\boldsymbol{v}_\perp$：
$$\boldsymbol{v} = \boldsymbol{v}_\parallel + \boldsymbol{v}_\perp$$

根据几何投影：
$$\boldsymbol{v}_\parallel = (\|\boldsymbol{v}\| \cos\theta) \boldsymbol{u} = (\boldsymbol{v} \cdot \boldsymbol{u}) \boldsymbol{u} = (\boldsymbol{u}^T \boldsymbol{v}) \boldsymbol{u}$$
利用矩阵乘法的结合律，$(\boldsymbol{u}^T \boldsymbol{v}) \boldsymbol{u} = \boldsymbol{u} (\boldsymbol{u}^T \boldsymbol{v}) = (\boldsymbol{u} \boldsymbol{u}^T) \boldsymbol{v}$。定义**平行投影矩阵** $\boldsymbol{P}_\parallel \in \mathbb{R}^{3 \times 3}$：
$$\boldsymbol{P}_\parallel = \boldsymbol{u} \boldsymbol{u}^T = \begin{bmatrix} u_x^2 & u_x u_y & u_x u_z \\ u_y u_x & u_y^2 & u_y u_z \\ u_z u_x & u_z u_y & u_z^2 \end{bmatrix}$$
相应地，垂直分量为：
$$\boldsymbol{v}_\perp = \boldsymbol{v} - \boldsymbol{v}_\parallel = \boldsymbol{I}\boldsymbol{v} - (\boldsymbol{u}\boldsymbol{u}^T)\boldsymbol{v} = (\boldsymbol{I} - \boldsymbol{u}\boldsymbol{u}^T)\boldsymbol{v}$$
定义**正交垂直投影矩阵** $\boldsymbol{P}_\perp = \boldsymbol{I} - \boldsymbol{u}\boldsymbol{u}^T$。易证两者均为对称幂等矩阵：
$$\boldsymbol{P}_\parallel^2 = \boldsymbol{P}_\parallel, \quad \boldsymbol{P}_\perp^2 = \boldsymbol{P}_\perp, \quad \boldsymbol{P}_\parallel \boldsymbol{P}_\perp = \boldsymbol{0}$$

---

### 2.3 向量叉积（向量积 / 外积）与反对称矩阵算子

#### (1) 行列式定义与手征性
两向量 $\boldsymbol{a}$ 与 $\boldsymbol{b}$ 的叉积产生一个同时垂直于 $\boldsymbol{a}$ 与 $\boldsymbol{b}$ 的新向量 $\boldsymbol{c} = \boldsymbol{a} \times \boldsymbol{b}$。其解析坐标由三阶符号行列式给出：
$$\boldsymbol{a} \times \boldsymbol{b} = \begin{vmatrix} \boldsymbol{e}_1 & \boldsymbol{e}_2 & \boldsymbol{e}_3 \\ a_x & a_y & a_z \\ b_x & b_y & b_z \end{vmatrix} = \begin{bmatrix} a_y b_z - a_z b_y \\ a_z b_x - a_x b_z \\ a_x b_y - a_y b_x \end{bmatrix}$$
模长几何意义为两向量所围成的平行四边形面积：
$$\|\boldsymbol{a} \times \boldsymbol{b}\| = \|\boldsymbol{a}\| \|\boldsymbol{b}\| \sin\theta$$

> **项目左手系约定说明**：
> 若工程坐标系定义满足 $\boldsymbol{e}_1 \times \boldsymbol{e}_2 = -\boldsymbol{e}_3$（如本项目 $+X$ 前、$+Y$ 右、$+Z$ 上，满足 $F \times R = D$，行列式为 $-1$），为消除物理歧义，全书叉积严格遵循代数行列式展开式，保证数学形式与符号在所有算法实现中 100% 封闭一致。

#### (2) 叉积反对称矩阵 $[\boldsymbol{u}]_\times \in \mathfrak{so}(3)$
在代数运算中，将叉乘操作转化为矩阵乘法是动力学线性化的核心手段。对于任意三维向量 $\boldsymbol{u} = [u_x, u_y, u_z]^T$，定义对应的**反对称矩阵（Skew-symmetric Matrix）** $[\boldsymbol{u}]_\times$（李代数 $\mathfrak{so}(3)$ 的元素）：
$$[\boldsymbol{u}]_\times \triangleq \begin{bmatrix} 0 & -u_z & u_y \\ u_z & 0 & -u_x \\ -u_y & u_x & 0 \end{bmatrix}$$
对任意向量 $\boldsymbol{v}$，恒有：
$$[\boldsymbol{u}]_\times \boldsymbol{v} = \boldsymbol{u} \times \boldsymbol{v}$$

#### (3) 核心代数恒等式定理与严格证明
**定理 1.1（反对称性）**：
$$[\boldsymbol{u}]_\times^T = -[\boldsymbol{u}]_\times$$

**定理 1.2（向量三重积展开 / Lagrange 恒等式）**：
对任意向量 $\boldsymbol{a}, \boldsymbol{b}, \boldsymbol{c}$，有：
$$\boldsymbol{a} \times (\boldsymbol{b} \times \boldsymbol{c}) = (\boldsymbol{a} \cdot \boldsymbol{c})\boldsymbol{b} - (\boldsymbol{a} \cdot \boldsymbol{b})\boldsymbol{c}$$
*证明*：直接按坐标代数展开：
$$\begin{aligned}
[\boldsymbol{a} \times (\boldsymbol{b} \times \boldsymbol{c})]_x &= a_y(b_x c_y - b_y c_x) - a_z(b_z c_x - b_x c_z) \\
&= b_x(a_y c_y + a_z c_z) - c_x(a_y b_y + a_z b_z) \\
&= b_x(a_x c_x + a_y c_y + a_z c_z) - c_x(a_x b_x + a_y b_y + a_z b_z) \\
&= (\boldsymbol{a} \cdot \boldsymbol{c})b_x - (\boldsymbol{a} \cdot \boldsymbol{b})c_x \quad \blacksquare
\end{aligned}$$

**定理 1.3（反对称矩阵的平方幂次恒等式）**：
若 $\boldsymbol{u}$ 为单位向量（$\|\boldsymbol{u}\|=1$），则其矩阵平方和立方满足闭式周期循环：
$$[\boldsymbol{u}]_\times^2 = \boldsymbol{u}\boldsymbol{u}^T - \boldsymbol{I}$$
$$[\boldsymbol{u}]_\times^3 = -[\boldsymbol{u}]_\times$$
*证明*：任取向量 $\boldsymbol{v}$，利用定理 1.2 的向量三重积展开：
$$[\boldsymbol{u}]_\times^2 \boldsymbol{v} = \boldsymbol{u} \times (\boldsymbol{u} \times \boldsymbol{v}) = (\boldsymbol{u} \cdot \boldsymbol{v})\boldsymbol{u} - (\boldsymbol{u} \cdot \boldsymbol{u})\boldsymbol{v}$$
因为 $\|\boldsymbol{u}\|^2 = \boldsymbol{u} \cdot \boldsymbol{u} = 1$，上式化为：
$$[\boldsymbol{u}]_\times^2 \boldsymbol{v} = (\boldsymbol{u}\boldsymbol{u}^T)\boldsymbol{v} - \boldsymbol{I}\boldsymbol{v} = (\boldsymbol{u}\boldsymbol{u}^T - \boldsymbol{I})\boldsymbol{v}$$
由于对任意 $\boldsymbol{v}$ 恒成立，立即导出矩阵等式：
$$[\boldsymbol{u}]_\times^2 = \boldsymbol{u}\boldsymbol{u}^T - \boldsymbol{I} \iff \boldsymbol{u}\boldsymbol{u}^T = \boldsymbol{I} + [\boldsymbol{u}]_\times^2$$
两边同乘 $[\boldsymbol{u}]_\times$：
$$[\boldsymbol{u}]_\times^3 = [\boldsymbol{u}]_\times (\boldsymbol{u}\boldsymbol{u}^T - \boldsymbol{I}) = (\boldsymbol{u} \times \boldsymbol{u})\boldsymbol{u}^T - [\boldsymbol{u}]_\times = \boldsymbol{0} - [\boldsymbol{u}]_\times = -[\boldsymbol{u}]_\times \quad \blacksquare$$

> **数学与工程联结**：
> 这组恒等式是全书第 1 章推导任意轴线空间旋转 Rodrigues 公式闭式解的源动力！因为 $[\boldsymbol{u}]_\times^3 = -[\boldsymbol{u}]_\times$，使得矩阵指数 Taylor 展开 $\exp(\theta [\boldsymbol{u}]_\times) = \sum_{k=0}^\infty \frac{\theta^k [\boldsymbol{u}]_\times^k}{k!}$ 的无穷级数能够被完全折叠为正弦与余弦项！

---

### 2.4 矩阵群 $\mathrm{SO}(3)$、正交性与镜像退化

刚体在空间移动时，任意两点间的距离恒定，任意两向量间的夹角保值。这种运动在代数上严格对应**保距保内积的正交变换**。

#### (1) 正交矩阵定义
矩阵 $\boldsymbol{R} \in \mathbb{R}^{3 \times 3}$ 称为正交矩阵（Orthogonal Matrix），当且仅当满足：
$$\boldsymbol{R}^T \boldsymbol{R} = \boldsymbol{R} \boldsymbol{R}^T = \boldsymbol{I} \implies \boldsymbol{R}^{-1} = \boldsymbol{R}^T$$
其列向量 $\boldsymbol{r}_1, \boldsymbol{r}_2, \boldsymbol{r}_3$ 构成一组标准正交基：
$$\boldsymbol{r}_i^T \boldsymbol{r}_j = \delta_{ij} = \begin{cases} 1, & i = j \\ 0, & i \neq j \end{cases}$$

#### (2) 行列式特征与镜像退化
对正交条件两端取行列式：
$$\det(\boldsymbol{R}^T \boldsymbol{R}) = \det(\boldsymbol{R}^T) \det(\boldsymbol{R}) = (\det(\boldsymbol{R}))^2 = \det(\boldsymbol{I}) = 1$$
$$\implies \det(\boldsymbol{R}) = \pm 1$$
* **特殊正交群 $\mathrm{SO}(3)$（刚体纯旋转）**：$\det(\boldsymbol{R}) = +1$。刚体手征性严格保持，刚体上的任意右手系变换后依然为右手系；
* **正交镜像群（Reflection / 镜像退化）**：$\det(\boldsymbol{R}) = -1$。变换包含了空间镜像翻转（如对称平面镜像），物体在物理上相当于被反转了“内脏手征性”。在第 1 章 SVD 姿态估计中，若直接取极值可能会误解出 $\det = -1$ 的镜像解，因此必须通过 $\mathrm{diag}(1, 1, \det(\boldsymbol{V}\boldsymbol{U}^T))$ 强行反转第三轴以保证绝对处于 $\mathrm{SO}(3)$ 中。

---

### 2.5 奇异值分解 (SVD) 与极值最优估计

奇异值分解是现代工程数学中最重要的数据分析工具之一。

#### (1) SVD 矩阵分解定理
任意实数矩阵 $\boldsymbol{A} \in \mathbb{R}^{m \times n}$ 均可分解为三个矩阵的乘积：
$$\boldsymbol{A} = \boldsymbol{U} \boldsymbol{\Sigma} \boldsymbol{V}^T$$
其中：
* $\boldsymbol{U} \in \mathbb{R}^{m \times m}$ 为正交矩阵（列向量为 $\boldsymbol{A}\boldsymbol{A}^T$ 的正交特征向量，称为左奇异向量）；
* $\boldsymbol{V} \in \mathbb{R}^{n \times n}$ 为正交矩阵（列向量为 $\boldsymbol{A}^T\boldsymbol{A}$ 的正交特征向量，称为右奇异向量）；
* $\boldsymbol{\Sigma} \in \mathbb{R}^{m \times n}$ 为对角矩阵，对角线元素 $\sigma_1 \ge \sigma_2 \ge \dots \ge \sigma_p \ge 0$（$p = \min(m, n)$）称为奇异值，对应于变换的主轴伸缩尺度。

#### (2) 矩阵迹 (Trace) 的循环置换性质
方阵 $\boldsymbol{M} \in \mathbb{R}^{n \times n}$ 的迹定义为对角元素之和：
$$\mathrm{tr}(\boldsymbol{M}) = \sum_{i=1}^n M_{ii}$$
**关键定理**：迹具有循环置换不变性（Cyclic Invariance）：
$$\mathrm{tr}(\boldsymbol{A}\boldsymbol{B}) = \mathrm{tr}(\boldsymbol{B}\boldsymbol{A}), \quad \mathrm{tr}(\boldsymbol{A}\boldsymbol{B}\boldsymbol{C}) = \mathrm{tr}(\boldsymbol{C}\boldsymbol{A}\boldsymbol{B}) = \mathrm{tr}(\boldsymbol{B}\boldsymbol{C}\boldsymbol{A})$$
该性质是证明矩阵 Frobenius 范数等价性与最小二乘姿态极值定理的核心推演钥匙。

---

### 2.6 超定方程组、Moore-Penrose 伪逆与加权最小二乘

在底盘工程中，悬架连杆受力求解（第 6 章）往往由 6 个外载荷平衡分量决定 5 根二力杆的轴向力，构成经典的非奇异超定/亚定矩阵系统。

#### (1) 普通最小二乘法 (OLS) 显式求导证明
设超定线性方程组为：
$$\boldsymbol{A} \boldsymbol{x} = \boldsymbol{b}, \quad \boldsymbol{A} \in \mathbb{R}^{m \times n}, \; m > n$$
通常无精确解。定义残差向量 $\boldsymbol{r}(\boldsymbol{x}) = \boldsymbol{A}\boldsymbol{x} - \boldsymbol{b}$，目标是使残差平方范数达到全局最小：
$$S(\boldsymbol{x}) = \|\boldsymbol{r}(\boldsymbol{x})\|^2 = (\boldsymbol{A}\boldsymbol{x} - \boldsymbol{b})^T (\boldsymbol{A}\boldsymbol{x} - \boldsymbol{b}) = \boldsymbol{x}^T \boldsymbol{A}^T \boldsymbol{A} \boldsymbol{x} - 2 \boldsymbol{b}^T \boldsymbol{A} \boldsymbol{x} + \boldsymbol{b}^T \boldsymbol{b}$$
由于 $S(\boldsymbol{x})$ 为关于 $\boldsymbol{x}$ 的严格凸二次型，对未知向量 $\boldsymbol{x}$ 求一阶偏导数向量（梯度）并令其为零：
$$\nabla_{\boldsymbol{x}} S(\boldsymbol{x}) = 2 \boldsymbol{A}^T \boldsymbol{A} \boldsymbol{x} - 2 \boldsymbol{A}^T \boldsymbol{b} = \mathbf{0}$$
整理得出著名的**高斯正规方程组 (Normal Equations)**：
$$\boldsymbol{A}^T \boldsymbol{A} \boldsymbol{x} = \boldsymbol{A}^T \boldsymbol{b}$$
若列向量线性无关，则 $\boldsymbol{A}^T \boldsymbol{A} \in \mathbb{R}^{n \times n}$ 严格对称正定可逆，唯一最优最小二乘解为：
$$\boldsymbol{x}^* = (\boldsymbol{A}^T \boldsymbol{A})^{-1} \boldsymbol{A}^T \boldsymbol{b} \triangleq \boldsymbol{A}^+ \boldsymbol{b}$$
其中 $\boldsymbol{A}^+ = (\boldsymbol{A}^T \boldsymbol{A})^{-1} \boldsymbol{A}^T$ 即为 **Moore-Penrose 广义逆矩阵（伪逆矩阵）**。

#### (2) 加权最小二乘法 (WLS)
当各方程残差物理量纲不同（如力和力矩量纲混合）或置信度不同时，必须引入对称正定权重矩阵 $\boldsymbol{W} \in \mathbb{R}^{m \times m}$。目标泛函为：
$$S_W(\boldsymbol{x}) = (\boldsymbol{A}\boldsymbol{x} - \boldsymbol{b})^T \boldsymbol{W} (\boldsymbol{A}\boldsymbol{x} - \boldsymbol{b})$$
同理求偏导求极值，解得加权正规方程闭式解：
$$\boldsymbol{x}_W^* = (\boldsymbol{A}^T \boldsymbol{W} \boldsymbol{A})^{-1} \boldsymbol{A}^T \boldsymbol{W} \boldsymbol{b}$$

---

### 2.7 矩阵条件数与数值奇异性救赎

#### (1) 条件数 (Condition Number) 定义
矩阵 $\boldsymbol{A}$ 的条件数度量了线性系统解对输入微小扰动的敏感程度：
$$\kappa(\boldsymbol{A}) = \|\boldsymbol{A}\| \|\boldsymbol{A}^{-1}\| = \frac{\sigma_{\max}(\boldsymbol{A})}{\sigma_{\min}(\boldsymbol{A})}$$
* 若 $\kappa(\boldsymbol{A}) \approx 1 \sim 10^2$：矩阵**良态 (Well-conditioned)**，解的精度高且稳定；
* 若 $\kappa(\boldsymbol{A}) > 10^7$：矩阵**病态 (Ill-conditioned)**，微小的输入舍入误差将导致解发生成千上万倍的巨幅漂移；
* 若 $\sigma_{\min} = 0$：矩阵奇异发散，不可逆。

#### (2) Tikhonov 岭回归正则化 (Ridge Regularization)
当摆臂几乎平行或空间二力杆近乎共线时，$\boldsymbol{A}^T \boldsymbol{A}$ 的最小特征值趋近于 0。此时引入正定岭参数 $\lambda > 0$（Tikhonov 因子），将病态逆矩阵修正为：
$$\boldsymbol{x}_{reg} = (\boldsymbol{A}^T \boldsymbol{A} + \lambda \boldsymbol{I})^{-1} \boldsymbol{A}^T \boldsymbol{b}$$
其特征值谱平移使得有效条件数被强制压低：
$$\kappa_{reg} = \frac{\sigma_{\max}^2 + \lambda}{\sigma_{\min}^2 + \lambda} \le \frac{\sigma_{\max}^2 + \lambda}{\lambda} < \infty$$
彻底杜绝了除零发散与浮点溢出，是工业级数值求解器稳健性的最后一道安全防线。

---

## 3. 手把手基础数值算例 (Worked Example)

### 算例背景：空间向量点叉积与正规方程最小二乘求解

**工况参数**：
设某赛车悬架空间转向节上有两个关键受力矢量：
* 推杆力方向单位向量：$\boldsymbol{u} = [0.6, 0.0, 0.8]^T$（验证：$\|\boldsymbol{u}\| = \sqrt{0.36 + 0 + 0.64} = 1.0$）
* 轮心冲击力输入矢量：$\boldsymbol{F} = [1000.0, 500.0, 2000.0]^T\,\text{N}$

### 步骤 1：求解沿推杆方向的轴向力标量与分量
根据点积投影算子：
$$F_\parallel = \boldsymbol{F} \cdot \boldsymbol{u} = (1000.0)(0.6) + (500.0)(0.0) + (2000.0)(0.8) = 600.0 + 0.0 + 1600.0 = 2200.0\,\text{N}$$
沿推杆轴线的主动推力向量为：
$$\boldsymbol{F}_\parallel = F_\parallel \boldsymbol{u} = 2200.0 \times [0.6, 0.0, 0.8]^T = [1320.0, 0.0, 1760.0]^T\,\text{N}$$

### 步骤 2：求解垂直于推杆的侧向弯剪力分量
$$\boldsymbol{F}_\perp = \boldsymbol{F} - \boldsymbol{F}_\parallel = [1000.0 - 1320.0, \; 500.0 - 0.0, \; 2000.0 - 1760.0]^T = [-320.0, \; 500.0, \; 240.0]^T\,\text{N}$$
**正交性校核**：
$$\boldsymbol{F}_\perp \cdot \boldsymbol{u} = (-320.0)(0.6) + (500.0)(0.0) + (240.0)(0.8) = -192.0 + 0.0 + 192.0 = 0.0\,\text{N}$$
严格满足完全正交分解！

### 步骤 3：构造反对称矩阵 $[\boldsymbol{u}]_\times$ 并计算叉乘
根据公式构造矩阵：
$$[\boldsymbol{u}]_\times = \begin{bmatrix} 0 & -0.8 & 0.0 \\ 0.8 & 0 & -0.6 \\ 0.0 & 0.6 & 0 \end{bmatrix}$$
计算 $\boldsymbol{u} \times \boldsymbol{F}$：
$$\boldsymbol{u} \times \boldsymbol{F} = [\boldsymbol{u}]_\times \boldsymbol{F} = \begin{bmatrix} 0 & -0.8 & 0 \\ 0.8 & 0 & -0.6 \\ 0 & 0.6 & 0 \end{bmatrix} \begin{bmatrix} 1000.0 \\ 500.0 \\ 2000.0 \end{bmatrix} = \begin{bmatrix} -400.0 \\ 800.0 - 1200.0 \\ 300.0 \end{bmatrix} = \begin{bmatrix} -400.0 \\ -400.0 \\ 300.0 \end{bmatrix}\,\text{N}$$

---

## 4. 本章小结

1. **内积是标量投影，外积是反对称变换**：点积的投影矩阵 $\boldsymbol{u}\boldsymbol{u}^T$ 与垂直补矩阵 $\boldsymbol{I} - \boldsymbol{u}\boldsymbol{u}^T$ 实现了力与位移的正交解耦；反对称矩阵 $[\boldsymbol{u}]_\times$ 及其平方恒等式 $[\boldsymbol{u}]_\times^2 = \boldsymbol{u}\boldsymbol{u}^T - \boldsymbol{I}$ 是三维旋转解析展开的根本来源。
2. **正交群与镜像区分**：$\mathrm{SO}(3)$ 矩阵满足 $\boldsymbol{R}^T\boldsymbol{R} = \boldsymbol{I}$ 且 $\det(\boldsymbol{R}) = +1$。在任何多体算法中，一旦检测到行列式为负，表明发生了镜像反转，必须执行反射符号修正。
3. **最小二乘与数值稳健性**：超定系统正规方程 $\boldsymbol{A}^T\boldsymbol{A}\boldsymbol{x} = \boldsymbol{A}^T\boldsymbol{b}$ 的本质是投影到列空间，当遇到连杆共线或近共线奇异（条件数过大）时，Tikhonov 岭正则化项 $\lambda\boldsymbol{I}$ 是保证工程软件绝对不崩溃的核心钥匙。
