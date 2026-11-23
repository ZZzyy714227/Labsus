<div align="center">

# LABSUS

**全车底盘悬架工程分析工作台**
*Kinematics & Compliance · 3D WebGL 实车建模 · 硬点优化器 · 15-DOF 瞬态仿真*

<p>
  <b>简体中文</b> · <a href="README.en.md">English</a>
</p>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2563eb.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.11%2B-059669.svg?style=flat-square" alt="Python 3.11+" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-v3%20API-0d9488.svg?style=flat-square" alt="FastAPI v3" /></a>
  <img src="https://img.shields.io/badge/pytest-359%20passed-16a34a.svg?style=flat-square" alt="pytest 359 passed" />
  <img src="https://img.shields.io/badge/Frontend-Zero--Build%20WebGL-ea580c.svg?style=flat-square" alt="Zero-Build WebGL" />
</p>

面向 **Formula SAE、FIA GT3 与 Baja SAE** 的轻量级底盘悬架仿真与设计平台。<br/>
纯原生零构建前端与 Python 数值引擎双核驱动，从 3D 硬点运动学、K&C 柔度分析到 15-DOF 整车动力学与赛道仿真一站闭环。

<br/>

<img src="LABSUS/assets/labsus_v4_formula_light.png" alt="LABSUS V4 Workbench — Formula SAE" width="100%" />

</div>

> **工程边界**：架构分层参考 OptimumKinematics 与 ADAMS/Car，专注模型内部自洽与设计灵敏度，**不宣称实车标定精度**。所有模型自由度、已知局限与验证证据分级公开登记于 [`LABSUS/MODEL_SCOPE.md`](LABSUS/MODEL_SCOPE.md)、[`LABSUS/VERIFICATION.md`](LABSUS/VERIFICATION.md) 与 [`LABSUS/INTENTIONAL_DIFFERENCES.md`](LABSUS/INTENTIONAL_DIFFERENCES.md)。工程源码均位于 [`LABSUS/`](LABSUS/) 子目录。

---

## 界面一览

<table>
  <tr>
    <td width="50%">
      <img src="LABSUS/assets/labsus_v4_baja_offroad.png" alt="Baja SAE 3D Force Overlay" />
      <br/><sub><b>Baja SAE · 3D 力学叠加与半透模式</b> — 管笼护板、直连大行程减振柱、二力杆拉压着色与胎印摩擦圆。</sub>
    </td>
    <td width="50%">
      <img src="LABSUS/assets/labsus_v4_gt3_dark.png" alt="FIA GT3 Dark Theme" />
      <br/><sub><b>FIA GT3 · 深色驾驶舱主题</b> — 连续多材质轿跑外壳、空心 ARB 与实时 US Gradient / TLLTD 操稳诊断。</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="LABSUS/assets/labsus_circuit_sim.png" alt="Shanghai International Circuit 15-DOF Stage" />
      <br/><sub><b>上海国际赛车场 (SIC 5.45 km) · 15-DOF 瞬态赛道舞台</b> — Pacejka 复合滑移轮胎、自动驾驶循迹与实时遥测 HUD。</sub>
    </td>
  </tr>
</table>

---

## 核心能力

| 模块 | 核心特性 |
| :--- | :--- |
| **全车型 3D WebGL 与力学叠加** | 离线 Three.js r147 渲染覆盖 Formula / Baja / GT3 / GT3 Sport 四预设；实体/半透/线框与 6 涂装切换；四视口正交精准同步，支持 3D 侧倾中心 (`ic`)、二力杆静力拉压着色与接触印迹摩擦圆 (`force`) 实时叠加。 |
| **运动学、K&C 与正向优化** | 闭式几何投影（残差 $10^{-13}\,\text{mm}$）与前 Anti-Dive / 后 IRS Anti-Squat 分离；空心 ARB (`arb.wall`)、四角模态翘曲审计及衬套刚度派生柔度转向；内置多尺度有界 **硬点运动学优化器**（一键压低 Bump Steer 并收敛 Roll Center / Camber Gain，支持零残留还原与方案入库）。 |
| **操稳、台架与 15-DOF 舞台** | 准静态三路径 TLLTD 与 $\delta\text{-}a_y$ 扫掠；4-Post 台架（虚功垂向平衡 + ISO 8608 路面谱 + 四象限表阻尼）；Ride / Lateral / **Longitudinal（75 m 加速与 Brake-Bias 抱死扫掠）** 三维标准台架；SIC 赛道、定圆与爬坡飞坡 15-DOF 瞬态舞台。 |
| **双核架构与实测标定闭环** | 零构建浏览器内核 + 可选 FastAPI 数值后端（`:8001`）；提供轮胎 Pacejka 辨识（Tire Fit）、K&C 台架 CSV 叠画对比、衬套标定覆盖，以及内置参数搜索与 KPI 手册章节速查浮窗 `[?]`。 |

---

## 快速开始

**浏览器直接打开（零依赖）**

```bash
python -m http.server 8000 --directory LABSUS/web
# 打开 http://127.0.0.1:8000/dwb-pro-v4.html
```

**Windows 一键启动（前端 + FastAPI 引擎）**

双击 `LABSUS/start.bat`，自动拉起 `:8001` Python 数值引擎与无缓存前端服务。

**手动启动 Python FastAPI 后端（可选增强）**

```bash
pip install -r LABSUS/requirements.txt
python LABSUS/engine/server.py   # API 文档：http://127.0.0.1:8001/docs
```

---

## 验证与门禁

所有测试均在 `LABSUS/` 目录下执行，前端回归采用零 npm 的 Node `vm` 沙箱，并包含 JS ↔ Python 双链路跨语言对拍：

```bash
cd LABSUS

# 一键运行全量门禁（退出码非零即失败）
python tools/gates/check_all.py           # 40 项：ruff / pytest / 32 套 node / 双对拍 / 溯源 / 文档 / 基线
python tools/gates/check_all.py --quick   # 5 项秒级检查（ruff / 角色审计 / 溯源 / 文档 / 基线）

# 独立验证入口
pytest engine/tests -q                 # 359 passed / 1 skipped（skip = OptimumK 未录入，显式）
ruff check engine                      # All checks passed
node web/test/test_dom.js              # 372 断言：薄壳结构 / 双端同构 / 回归守卫
node web/test/stage_boot_check.js      # 54 断言：模块序 / TDZ / 三舞台 20 帧
node web/test/tphys_parity.cjs         # JS TPHYS ↔ Python transient 对拍（实测 worst 0.51%）
node web/test/kc_parity.cjs            # 4 预设双轴 K&C / ARB / Modal 跨语言对拍（< 1e-4）
node web/test/physics_audit.js         # 物理审计（60 项，进 CI 回归）
```

<details>
<summary><b>展开查看完整工程目录结构</b></summary>

```text
LABSUS/                           # 工程代码根
├── assets/                       # 界面预览截图与工程资源
├── web/                          # 原生 Web 前端
│   ├── index.html                # 自动重定向引导页
│   ├── dwb-pro-v4.html           # V4 主工作台入口（推荐）
│   ├── dwb-pro-fullchassis.html  # 模块化全车工作台
│   ├── dwb-pro-allinone.html     # 零依赖冻结单文件快照
│   ├── css/
│   │   ├── fullchassis.css       # 核心组件与仪器台样式
│   │   └── v4.css                # V4 布局编排与双主题令牌
│   ├── vendor/
│   │   └── three.min.js          # Three.js r147 离线 WebGL 渲染内核
│   ├── js/                       # 按文件名序加载的核心域模块
│   │   ├── 01-core.js            # 数学库 / 状态管理 / 矩阵运算
│   │   ├── 02-presets.js         # 车型预设 (Formula / GT3 / Baja)
│   │   ├── 03-mechanism.js       # 闭式几何投影、K&C 扫掠、静力与模态审计
│   │   ├── 04-dynamics.js        # 准静态载荷转移与 4-Post 台架动力学
│   │   ├── 05-scene3d.js         # 四视口 3D Canvas 渲染引擎
│   │   ├── 05b-car3d-webgl.js    # Three.js 全车型 3D 实体建模与力学叠层
│   │   ├── 06-ui-panels.js       # 交互面板、标定工具与 KPI 手册浮窗
│   │   ├── 07-plots.js           # 运动学与特性曲线图
│   │   ├── 08-interact.js        # 持久化与视图拖拽交互
│   │   ├── 09-track.js           # TPHYS 物理闭包与赛道回放
│   │   ├── 10-eval.js            # 综合评价报告与赛车线规划
│   │   ├── 10b-vehicle-core.js   # 15-DOF 车辆物理内核与自动驾驶
│   │   ├── 11-stages.js          # 三大舞台编排、渲染与遥测 HUD
│   │   ├── 12-v4-arrange.js      # V4 布局、参数搜索与结论卡
│   │   ├── 13-engine-sound.js    # WebAudio 动态转速声浪合成器
│   │   ├── 14-tire-lab.js        # 轮胎实验室 (Magic Formula 拟合)
│   │   ├── 15-mpc.js             # 赛道自适应 MPC 控制器
│   │   ├── 16-powertrain.js      # 七架构动力总成与扭矩分配
│   │   ├── 17-damper4q.js        # 四象限非线表阻尼（保形样条 + 挡位）
│   │   ├── 18-ride-bench.js      # 垂向 Ride 动力学测试台
│   │   ├── 19-compare.js         # A/B 三层对比与方案库对比
│   │   ├── 20-lat-bench.js       # 横向与侧倾动力学测试台
│   │   ├── 21-car-capability.js  # 车能力包络表（加减速/过弯极限）
│   │   ├── 22-optimizer.js       # 正向硬点运动学优化器（多尺度有界寻优）
│   │   └── 23-long-bench.js      # 纵向加减速与制动台架（Brake-Bias / 纵倾）
│   └── test/                     # 前端 32 套回归 + physics_audit + 双端对拍
├── engine/                       # Python FastAPI 数值计算引擎
│   ├── server.py                 # FastAPI 入口服务 (:8001)
│   ├── src/                      # 求解器源码 (K&C / 衬套 / Pacejka / 瞬态)
│   ├── data/                     # 外部数据资产（sha256 锁定）
│   └── tests/                    # pytest 单元测试套件 (359 passed / 1 skipped)
├── handbook/                     # 悬架工程设计参考手册
├── tools/gates/                  # 统一门禁运行器 (check_all.py / check_baselines.py)
├── scripts/                      # 文档同步与开发运维脚本
├── MODEL_SCOPE.md                # 四内核自由度与建模边界登记
├── VERIFICATION.md               # L0–L4 验证证据分级清单
└── INTENTIONAL_DIFFERENCES.md    # 双端架构故意差异登记
```

</details>

---

## 开源许可

本项目基于 [MIT License](LICENSE) 开源发布，欢迎 Issue 与 Pull Request。
