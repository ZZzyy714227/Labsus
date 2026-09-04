# 《全车底盘悬架力学与动力学工程全书》
## —— 从空间多体运动学、K&C 弹性力学到 15-DOF 瞬态动力学与赛道调校闭环

> **著**：LABSUS 悬架实验室工程计算组  
> **适用对象**：FSAE / 汽车动力学研发工程师 / 赛车调校底盘工程师 / 车辆工程专业高年级与研究生  
> **配套工程代码**：[LABSUS 现代悬架工程分析工作台](file:///c:/Users/zzy/Desktop/New_suspension/LABSUS)

---

## 📖 前言与全书导读

在赛车工程与汽车底盘研发领域，悬架系统是连接轮胎与车身、决定车辆操纵稳定性、乘坐舒适性与赛道圈速的最核心物理载体。然而，长久以来，该领域的工程知识往往割裂在两个极端：要么是停留在二自由度单轨模型或高度抽象分析力学的纯理论教科书，要么是不透明、无法得知内部数值解算过程的商业 CAE 仿真黑盒。

本书旨在打破理论推导与工程落地之间的壁垒。全书以“**物理第一性原理推导 $\to$ 非线性数值求解器算法 $\to$ 代码级落地 $\to$ 参数灵敏度导数杠杆 $\to$ 台架实测标定与赛道调校闭环**”为主线，彻底公开每一个公式的推导过程、每一行核心代码的数值稳定性技巧，以及赛道工程师面对入弯推头、弯心甩尾时“看方程、改参数、看变化”的调校哲学。

---

## 🧭 全局坐标系与符号系统约定

为了保证全书在多体运动学、静力学、准静态操稳与 15-DOF 瞬态动力学推导中的严密性与无歧义性，全书统一遵循如下物理约定：

### 1. 车辆与空间悬架坐标系 (Vehicle & Suspension Frame)
本书采用与项目规范真源 `engine/src/core/convention.py` 一致的**笛卡尔直角坐标系（X 前、Y 右、Z 上）**。须如实声明：该基底满足 forward×right=down，行列式为 $-1$，**数学上是左手系**（部分教科书口径把 Z 取向下以回到右手系）。因此全书的叉积与旋转一律按**行列式代数展开**定义，各角正方向以物理语言钉死为：航向角 $\psi$ 正 = 车头向右偏；俯仰角 $\theta$ 正 = 抬头；侧倾角 $\phi$ 正 = 右侧下沉（弯中向外侧倾姿态）。角速度取 $p=\dot\phi$、$q=\dot\theta$、$r=\dot\psi$。与经典右手系教材（ISO 的 X前/Y左/Z上）比对任何公式时，注意相应分量与旋转项差一个符号。
> **代码迁移状态**：`convention.py` 与 `solver/angles.py` 已按本约定实现；`v3service.py`、`mechanism/models.py` 及前端 `02-presets.js`、硬点表头等**仍按旧分量顺序书写（第一分量 = 横向）**，对照代码复算时须将数组前两个分量互换。
* **$+X$ 轴**：指向车身**正前方**（Forward，前进方向 / 纵向）；
* **$+Y$ 轴**：指向车身**右侧 / 外侧**（对左侧悬架采用镜像变换 $Y \to -Y$）；
* **$+Z$ 轴**：指向**正上方**（Upward，垂直地面向上）。

```
        +Z (Up 向上)
         |
         |   +X (Forward 向前)
         |  /
         | /
         |/
         +--------------> +Y (Right / Outboard 向右/向外)
```

### 2. 悬架运动与定位角符号约定
* **轮跳行程 (Wheel Travel $tr$)**：以设计静止状态为零点，$tr > 0$ 表示车轮向上跳动（Jounce / Bump 压缩），$tr < 0$ 表示车轮向下伸张（Rebound / Droop）；
* **外倾角 (Camber Angle $\gamma$)**：车轮上端向车身内侧倾斜定义为**负外倾 (Negative Camber)**，两侧车轮统一以顶端内倾为负；
* **前束角 (Toe Angle $\delta_{toe}$)**：车轮前端向车身内侧偏转定义为**前束 (Toe-in，正值)**，向外偏转定义为**负前束 (Toe-out，负值)**；
* **主销内倾角 (KPI / SAI $\theta_{kpi}$)**：主销轴线上端向车身内侧倾斜为正；
* **主销后倾角 (Caster $\theta_{caster}$)**：主销轴线上端向车身正后方倾斜为正；
* **磨地半径 (Scrub Radius $r_{scrub}$)**：主销接地交点位于轮胎接地中心内侧（接地中心在外）定义为**正磨地半径**；
* **主销拖距 (Caster Trail $t_{trail}$)**：主销接地交点位于轮胎接地中心前方定义为**正拖距**。

---

## 📚 全书总目录 (Table of Contents)

### [全书前置：底盘动力学数学与物理第一性原理基础篇](./part0-math-and-physics-foundations/)
* [基础 1：三维线性代数与矩阵分析全解](./part0-math-and-physics-foundations/ch00-1-linear-algebra-and-matrices.md)
* [基础 2：多元微积分、微分几何与非线性优化](./part0-math-and-physics-foundations/ch00-2-calculus-and-optimization.md)
* [基础 3：理论力学、空间力系与刚体动力学基础](./part0-math-and-physics-foundations/ch00-3-rigid-body-mechanics.md)
* [基础 4：数值分析基础、保形样条与常微分方程积分](./part0-math-and-physics-foundations/ch00-4-numerical-methods.md)

### [第一篇：空间机构运动学与几何学第一性原理](./part1-spatial-kinematics/)
* [第 1 章 空间三维向量与刚体姿态数学基础](./part1-spatial-kinematics/ch01-spatial-vectors-and-poses.md)
* [第 2 章 双横臂悬架空间拓扑与运动学约束方程](./part1-spatial-kinematics/ch02-double-wishbone-topology.md)
* [第 3 章 推拉杆摇臂三维轴线与拓扑连续性](./part1-spatial-kinematics/ch03-rocker-pushrod-mechanics.md)
* [第 4 章 非线性运动学方程组与双端求解器内核](./part1-spatial-kinematics/ch04-nonlinear-solvers.md)
* [第 5 章 悬架空间定位角与瞬心侧倾中心几何推导](./part1-spatial-kinematics/ch05-spatial-alignment-angles.md)

### [第二篇：静力平衡与 K&C 弹性力学体系](./part2-statics-and-compliance/)
* [第 6 章 空间二力杆汇交与球铰静力平衡层](./part2-statics-and-compliance/ch06-link-forces-and-statics.md)
* [第 7 章 6-DOF 橡胶衬套非线性本构模型](./part2-statics-and-compliance/ch07-bushing-constitutive-models.md)
* [第 8 章 K&C 两层嵌套力平衡求解器与解析雅可比](./part2-statics-and-compliance/ch08-nested-compliance-solver.md)
* [第 9 章 工业级 K&C 扫掠特性与增益指标体系](./part2-statics-and-compliance/ch09-kandc-sweep-gains.md)

### [第三篇：准静态操稳与载荷转移控制理论](./part3-quasi-static-handling/)
* [第 10 章 准静态整车平衡与 3 轮侧倾闭环迭代](./part3-quasi-static-handling/ch10-quasi-static-equilibrium.md)
* [第 11 章 TLLTD 三路径载荷转移完整力学推导](./part3-quasi-static-handling/ch11-tlltd-three-path-transfer.md)
* [第 12 章 操稳第一 KPI——稳态不足转向梯度与 Jacking](./part3-quasi-static-handling/ch12-us-gradient-and-jacking.md)

### [第四篇：现代非线性轮胎力学与实测辨识](./part4-advanced-tire-mechanics/)
* [第 13 章 刷子模型到 Pacejka 魔术公式演进](./part4-advanced-tire-mechanics/ch13-pacejka-magic-formula.md)
* [第 14 章 复合滑移摩擦圆与动态松弛长度时延](./part4-advanced-tire-mechanics/ch14-combined-slip-and-relaxation.md)
* [第 15 章 实测轮胎数据 TRF 最小二乘辨识算法](./part4-advanced-tire-mechanics/ch15-tire-parameter-fitting.md)

### [第五篇：15-DOF 全车多体瞬态动力学](./part5-transient-dynamics-15dof/)
* [第 16 章 15 自由度状态空间微分方程组建立](./part5-transient-dynamics-15dof/ch16-15dof-state-equations.md)
* [第 17 章 四象限非线性减振器与限位块击穿模型](./part5-transient-dynamics-15dof/ch17-nonlinear-dampers-bumpstops.md)
* [第 18 章 空气动力学多场耦合：地面效应与 DRS](./part5-transient-dynamics-15dof/ch18-aerodynamics-ground-effect.md)

### [第六篇：赛道环境、最优赛车线与自动驾驶](./part6-track-and-autopilot/)
* [第 19 章 闭合赛道样条几何学与连续曲率提取](./part6-track-and-autopilot/ch19-circuit-spline-geometry.md)
* [第 20 章 外-内-外平滑赛车线规划与速度剖面](./part6-track-and-autopilot/ch20-out-in-out-racing-line.md)
* [第 21 章 曲率前馈 Stanley 控制与刹车自适应学习](./part6-track-and-autopilot/ch21-autopilot-stanley-learning.md)

### [第七篇：试验场测试工况与 4-Post 台架动力学](./part7-proving-ground-and-rig/)
* [第 22 章 七大综合试验场场景数学与几何构建](./part7-proving-ground-and-rig/ch22-proving-ground-scenarios.md)
* [第 23 章 4-Post 液压台架时域激励与振动响应](./part7-proving-ground-and-rig/ch23-four-post-rig-dynamics.md)

### [第八篇：底盘综合评价体系、实测标定与调校闭环（核心精华）](./part8-evaluation-and-correlation/)
* [第 24 章 19 项核心 KPI 灵敏度导数图谱与参数调校杠杆](./part8-evaluation-and-correlation/ch24-kpi-sensitivity-derivatives.md)
* [第 25 章 实测台架标定与仿真对标闭环方法论](./part8-evaluation-and-correlation/ch25-rig-correlation-and-calibration.md)
* [第 26 章 赛道工程师排障决策树与全工况调校矩阵](./part8-evaluation-and-correlation/ch26-trackside-troubleshooting-matrix.md)
* [第 27 章 三大经典车型从零到赛道调校全案实战解剖](./part8-evaluation-and-correlation/ch27-full-chassis-case-studies.md)

---

## 🛠️ 如何使用本书

每一章节末尾均提供配套的源码索引，读者可以直接在 LABSUS 工程中对照运行：
* **Python 求解器调试**：在根目录下运行 `pytest` 或调用 `engine/server.py`；
* **Web 端实时多体与赛道仿真**：直接双击 `start.bat` 或在浏览器中打开 `web/dwb-pro-v4.html`。
