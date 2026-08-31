# 🏎️ LABSUS · 悬架实验室 (Suspension Lab)

**全车底盘高性能悬架分析工作台 —— Kinematics & Compliance / 15-DOF 动力学 / 准静态操稳 / 赛道瞬态仿真**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-brightgreen.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v3%20REST%20API-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests: 100% Passed](https://img.shields.io/badge/pytest-102%20passed-success.svg)]()
[![Platform: Web & Desktop](https://img.shields.io/badge/Platform-Web%20%7C%20Windows%20%7C%20Linux%20%7C%20macOS-orange.svg)]()

> 面向 **FSAE 方程式赛车、GT3 房车赛车及全地形越野车** 的现代化全车底盘悬架工程分析平台。
> 从双叉臂/推拉杆空间硬点编辑、多体运动学与 K&C 扫掠，到 4-Post 台架动力学、准静态载荷转移与 **15-DOF 全赛道自动驾驶瞬态仿真**，全部在一个精美现代的交互式仪器台中完成。轻量级自研实现，深度对标 OptimumKinematics 与 ADAMS/Car。

---

## 📸 界面预览 (Screenshots)

### 1. 全车底盘多视口几何与 K&C 交互工作台
![LABSUS 全车底盘悬架分析台](assets/labsus_main_ui.png)
*正视、俯视、侧视、等轴测四视口实时联动，直接拖拽 3D 空间硬点，实时反馈外倾角、前束角、主销参数、侧倾中心高度迁移及准静态载荷转移 (TLLTD)。*

### 2. 上海国际赛车场 (SIC) 15-DOF 实时瞬态赛道仿真舞台
![LABSUS 赛道瞬态仿真舞台](assets/labsus_circuit_sim.png)
*高精度 15-DOF 整车多体动力学、Pacejka 复合滑移轮胎摩擦圆、AutoPilot 路径曲率自适应速度规划与弯中牵引力控制 (TCS)、多机位跟踪与实时工程遥测 HUD。*

---

## 🌟 核心功能特性

### 1. 底盘建模与三维可视化
- **双叉臂与推拉杆摇臂 3D 几何建模**：前后不等长双横臂（上下 A 臂）、转向节、摇臂/推杆/拉杆、弹簧减振器、半轴与 CV 防尘套、通风制动盘与卡钳、EDU 电驱总成、齿轮齿条中置转向、空间桁架管架车架（吸能防撞区 + 自适应悬架舱）。
- **四视口联动交互**：正视 (X-Z)、俯视 (X-Y)、侧视 (Y-Z)、等轴测 (3D) 实时投影，支持在视图中直接拖拽硬点微调。
- **纯悬架透视与图层过滤**：一键切换「纯悬架透视模式」，可独立隐藏/显示车架、动力总成、转向柱与制动主缸，专注悬架杆系拓扑。
- **四大车型出厂预设**：
  - 🏎️ **Formula SAE (大学生方程式赛车)**：前后推杆架构，无防倾杆极简高刚度底盘 ($f_n \approx 3.4\,\text{Hz}$)；
  - 🏎️ **FIA GT3 (专业房车赛车)**：前后独立悬架 + 副车架刚性衬套挂载的大口径前/后横向稳定杆 (ARB)；
  - 🚗 **GT3 Sport (高性能公路跑车)**：兼顾日常平顺性与赛道支撑的复合刚度与阻尼曲线；
  - 🚜 **Baja SAE (巴哈全地形越野车)**：超大长行程前直接驱动/后半拖曳臂越野架构。

### 2. 机构运动学与 K&C 弹性解算 (Kinematics & Compliance)
- **高精度多体闭式投影内核**：纯几何向量闭式迭代与非线性最小二乘联合收敛（残差达 $10^{-13}\,\text{mm}$ 级）。
- **全套悬架定位参数实时解算**：
  - 车轮外倾角 (Camber) & 外倾增益 (Camber Gain)；
  - 车轮前束角 (Toe) & 颠簸转向 (Bump Steer)；
  - 主销内倾角 (KPI / SAI)、主销后倾角 (Caster)、主销接地偏置距 (Scrub Radius)、主销后拖距 (Caster Trail)；
  - 瞬时中心 (IC)、侧倾中心高度 (Roll Center Height) 动态迁移轨迹；
  - 减振器运动比 (Motion Ratio)、弹簧/轮端刚度 ($K_s / K_w$)、簧载固有频率 ($f_n$)。
- **K&C 衬套弹性求解（两层架构）**：支持 6-DOF 橡胶衬套力平衡方程与机构二次重解耦合。

### 3. 准静态操稳与载荷转移 (Quasi-Static Handling)
- **TLLTD 三路径载荷转移分解**：
  - 弹性侧倾力矩分量（主弹簧 + 横向稳定杆 ARB 刚度分配）；
  - 几何侧倾中心力臂分量（侧倾中心高度与轴荷传递）；
  - 非簧载质量侧向惯性力分量。
- **准静态闭环耦合迭代**：准确计算侧倾角 ($\phi$)、整车侧倾梯度 ($d\phi/dg_y$)、四轮接地动载荷分布 ($F_z$) 与操稳偏向判定 (Understeer / Oversteer / Neutral)。

### 4. 15-DOF 全赛道瞬态动力学与 AutoPilot 巡航舞台
- **15 自由度整车多体动力学**：
  - 车身 6-DOF（纵向 $u$、侧向 $v$、垂向 $w$、侧倾 $p$、俯仰 $q$、横摆 $r$）；
  - 四轮独立垂向跳动 4-DOF 与四轮独立自转角速度 4-DOF；
  - 1000Hz 高频子步积分器，精确捕捉车身点头（Pitch）、侧倾（Roll）与轮荷动态转移。
- **Pacejka Magic Formula 复合滑移轮胎模型**：
  - 精确计算非线性纯侧滑偏角力 ($F_y$)、纯纵向滑移率驱动/制动力 ($F_x$) 以及摩擦圆复合滑移附着极限。
- **上海国际赛车场 (SIC 5.45km) 全赛道瞬态仿真**：
  - 7 点平滑窗口提取弯道曲率，60 轮收敛的正反向循迹制动/加速极限速度剖面规划；
  - AutoPilot 自动驾驶巡航控制（Stanley 航向/横向跟踪 + 弯中牵引力控制 TCS），防止大马力后驱打转；
  - 6 个专业视口跟随机位（追尾跟踪、驾驶舱第一人称视角、悬架鼻锥、车轮特写、尾翼后视、直升机航拍、沙盘俯瞰）；
  - 实时遥测 HUD（当前直道/弯道、车速、侧向 G 值、推荐档位、油门/制动百分比、横摆角速度）。

### 5. 综合评价报告与工程工具
- **一键生成综合工程评价报告**：12 项核心指标按赛事基准自动给出评级徽章（S/A/B/C/D）、雷达图及调校建议。
- **工程数据持久化**：支持硬点参数本地自动暂存 (localStorage)、一键导入/导出 JSON 配置文件、出厂默认重置。
- **基线快照双线对比 (Baseline Snapshot)**：支持保存当前底盘状态为基线，在修改硬点或参数时进行实时虚线 Diff 对比。

---

## 🚀 快速开始

### 方式 A：零依赖极速启动（纯前端单文件）
1. 本项目网页端为纯原生技术栈开发，**无需任何 npm 构建或环境配置**。
2. 浏览器直接双击打开 `web/dwb-pro-allinone.html` 或通过本地 HTTP 服务器运行：
   ```bash
   python -m http.server 8000 --directory web
   ```
3. 浏览器访问 `http://127.0.0.1:8000/` 即可开始使用。

### 方式 B：双击脚本启动（Windows 一键运行）
双击根目录下的 `start.bat`：
- 自动拉起 Python FastAPI 计算引擎（端口 8001，已在运行则自动复用）；
- 自动启动无缓存前端服务器并打开浏览器进入工作台。

### 方式 C：启动 Python FastAPI 计算引擎（可选增强）
如果你需要运行完整的 Python 高性能数值求解后端：
```bash
# 1. 安装 Python 依赖
pip install -r requirements.txt

# 2. 启动 FastAPI 引擎服务
python engine/server.py
# 服务启动于 http://127.0.0.1:8001 (API 文档: http://127.0.0.1:8001/docs)
```

---

## 🧪 测试与质量保证

项目包含严苛的自动化测试套件：
```bash
# 1. 运行 Python 后端动力学与 K&C 全量测试（102 项全部通过）
pytest

# 2. 运行前端 DOM 结构断言测试（136 项全部通过）
node web/test/test_dom.js

# 3. 运行多车型赛道 6500 步全单圈仿真测试
node scratch/test_full_suite.js
```

---

## 📂 项目结构说明

```
LABSUS/
├── assets/                       # 项目预览截图与工程图表资源
│   ├── labsus_main_ui.png        # 主工作台界面截图
│   └── labsus_circuit_sim.png    # 赛道仿真舞台截图
├── web/                          # 现代 Web 前端工程目录
│   ├── dwb-pro-fullchassis.html  # 主工作台入口页面
│   ├── dwb-pro-allinone.html     # 零依赖综合交付单文件
│   ├── css/
│   │   └── fullchassis.css       # 模块化现代工程仪器台 CSS 设计系统
│   ├── js/                       # 前端核心功能域模块 (按序加载)
│   │   ├── 01-core.js            # 核心数据模型与状态管理
│   │   ├── 02-presets.js         # 车型预设 (Formula/Baja/GT3)
│   │   ├── 03-mechanism.js       # 多体闭式几何投影内核与 K&C 扫掠
│   │   ├── 04-dynamics.js        # 准静态载荷转移与 4-Post 台架解算
│   │   ├── 05-scene3d.js         # 四视口 3D Canvas 线框渲染引擎
│   │   ├── 06-ui-panels.js       # 左右交互面板与参数绑定
│   │   ├── 07-plots.js           # 运动学特性交互式曲线图
│   │   ├── 08-interact.js        # 鼠标 3D 硬点拖拽与快捷键交互
│   │   ├── 09-track.js           # 赛道地图与路面激励生成
│   │   ├── 10-eval.js            # 综合工程评价报告与赛道速度规划
│   │   └── 11-stages.js          # 15-DOF 爬坡/定圆/上海赛道瞬态仿真舞台
│   └── test/                     # 前端 DOM 与加载防线测试
├── engine/                       # Python 高性能数值计算引擎
│   ├── server.py                 # FastAPI 入口服务 (:8001)
│   ├── src/                      # 求解器核心源码 (TRF 优化/K&C/衬套/Pacejka 轮胎)
│   └── tests/                    # pytest 单元测试套件 (102 项)
├── requirements.txt              # Python 依赖清单
├── start.bat                     # Windows 一键启动脚本
├── LICENSE                       # MIT 开源许可证
└── README.md                     # 项目中文文档
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布。
欢迎提交 Issue 与 Pull Request 共同完善！
