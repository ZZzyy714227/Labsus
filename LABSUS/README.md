# LABSUS · 悬架实验室

**全车底盘高性能悬架分析工作台 —— Kinematics & Compliance / 动力学 / 准静态操稳 / 赛道瞬态仿真**

面向 FSAE 方程式赛车的整车悬架分析平台：从双叉臂硬点编辑、多体运动学与 K&C 扫掠，到 4-Post 台架动力学、准静态载荷转移与平面瞬态赛道仿真，全部在一个浏览器页面里完成。对标 OptimumKinematics / ADAMS 的轻量自研实现。

---

## 两个入口，按需选择

| 文件 | 定位 | 需要 Python 引擎？ |
|---|---|---|
| web/dwb-pro-allinone.html | 综合版单文件：内置 JS 赛道物理引擎（TPHYS），双击即用 | 不需要（赛道仿真内置；K&C 引擎能力为可选增强） |
| web/dwb-pro-fullchassis.html | 完整版：主力开发入口，全功能 + 引擎双模 | 可选（连接引擎获得完整 K&C/整车求解） |

> 浏览器直接打开 HTML 即可运行（无需安装、无需构建、可离线）。推荐 Chrome / Edge。

---

## 功能特性

**底盘建模与渲染**
- 双叉臂悬架 3D 建模：前后上下 A 臂、转向节、摇臂/推拉杆、弹簧减振、半轴/CV 防尘套、制动盘/卡钳、EDU 电驱、中置转向、空间桁架车架（定形防撞区 + 自适应悬架舱）
- 四视口（正视/俯视/侧视/等轴测）联动，视口内直接拖拽硬点，多体闭式投影内核实时求解
- 五大系统默认分色（车架灰/转向蓝金/传动橙/制动红/行驶青），图层独立开关

**分析与求解**
- 机构运动学：scipy least-squares(TRF) 联合收敛 + continuation 热启动（残差可达 1e-13mm 级）
- K&C 两层求解器：衬套 6DOF 力平衡（TRF + Anderson 加速兜底）与机构重解耦合
- 指标层：外倾/前束/KPI/Caster/Scrub/Trail、Ackermann、SVIC/抗俯仰、RC 高度迁移、MR、TLLTD 三路径分解
- 4-Post 台架显式动力学；准静态操稳（三路径 + 侧倾耦合迭代，TLLTD 随 G 单调变化）
- 赛道瞬态仿真（独立 80% 舞台界面）：
  - 平面 3-DOF 车体 + 四轮 MF 轮胎（复合滑移摩擦圆、侧偏松弛、外倾推力、载荷敏感）
  - 恒扭矩-恒功率动力包络、气动下压力/阻力、侧倾/俯仰一阶滞后、纯追踪 + PI 驾驶员
  - 5 个跟随机位（尾部 / 前部 / 斜 45° / 顶视 / 固定机位），实时四轮摩擦圆 + 12 项物理遥测
- 综合评价报告：头栏一键生成，12 项工程指标按基准评级（外倾增益 / bump steer / MR / 轮刚度 / 簧载频率 / 阻尼比 / 侧倾刚度分配），雷达图 + 等级徽章 + 调校建议
- 直线爬坡动力学舞台：15-DOF 整车瞬态（Pacejka 复合滑移轮胎、1000Hz 子步、坡度 / 颠簸 / 空力 / ARB），canvas 投影 3D 渲染 + 环绕相机 + 实时 HUD（车速 / 坡度 / Fz 分配 / squat）
- 轮胎滚动自旋 + 「纯悬架透视」：行驶视觉联动，一键隐藏车架 / 动力总成 / 转向柱 / 主缸只看悬架
- 结果可信度七状态标注（VALID / APPROXIMATE / ...），符号规范单一真源

**交互与工具**
- 硬点永久保存（localStorage 自动写盘）+ 导出/导入 JSON、出厂重置
- 基线快照双线对比、K&C 扫掠曲线、多工况增益表
- 深色/浅色双主题、快捷键（Space 启停等）

---

## 快速开始

### 方式 A：综合版（零依赖）

双击打开 web/dwb-pro-allinone.html → 左侧「赛道仿真大厅」→ 设置参数 → 开始仿真。全部物理在浏览器内计算。

### 方式 B：完整引擎（体验全部 K&C）

    cd engine
    pip install fastapi uvicorn pydantic numpy scipy
    python server.py           # 服务 http://127.0.0.1:8001

打开 web/dwb-pro-fullchassis.html（或 allinone 并勾选「使用引擎」）→ 左上角「连接引擎」。

### 运行测试

    cd engine
    python -m pytest tests/ -q      # 当前 86 项全部通过

---

## 引擎 API（FastAPI · /api/v3）

| 端点 | 说明 |
|---|---|
| GET /api/v3/health · /version | 健康 / 版本检查 |
| POST /api/v3/solve/pose | 单点机构求解（姿态 + 定位角） |
| POST /api/v3/kandc/{bump,roll,steer,compliance} | K&C 四工况扫掠（含衬套弹性） |
| POST /api/v3/chassis/solve | 整车单点（四角姿态 + 准静态载荷转移） |
| POST /api/v3/chassis/kandc/{bump,roll,steer} | 整车扫掠 |
| POST /api/v3/chassis/simulate_track | 赛道瞬态仿真（trace 时序 + 遥测） |

---

## 架构速览

    浏览器单文件前端（硬点/四视口/扫掠/JS 内核/4-Post/quasi/赛道舞台+TPHYS）
                          │ REST /api/v3（可选）
    Python 引擎（参考实现 · 权威数值：机构 TRF 收敛 · K&C 两层 · quasi · transient）

- 引擎与前端对同一物理保持两套实现：engine/src/solver/transient.py 与前端 TPHYS（JS 直译，数值逐位对标）；其余模块由前端 JS 平行实现并持续黄金对拍
- 前端为单文件演进（约 7500 行），所有 UI 与交互均在 dwb-pro-fullchassis.html

## 目录

    LABSUS/
    ├── web/
    │   ├── dwb-pro-fullchassis.html   完整版前端（主力开发入口）
    │   ├── dwb-pro-allinone.html      综合版单文件（内置赛道物理）
    │   └── serve_nocache.py           开发静态服务 (:8921)
    ├── engine/
    │   ├── server.py                  FastAPI 入口 (:8001)
    │   ├── scripts/kandc_run.py       K&C CLI 演示
    │   ├── src/
    │   │   ├── api/                   v3models / v3service / chassis（含赛道 API）
    │   │   ├── solver/
    │   │   │   ├── mechanism/         机构模型 + least-squares 求解器
    │   │   │   ├── transient.py       赛道瞬态物理引擎（S3-1 升级版）
    │   │   │   ├── compliance.py      K&C 两层求解器
    │   │   │   └── forces.py / angles.py / compliance_transform.py
    │   │   ├── components/bushing.py   6DOF 衬套元件
    │   │   ├── tire_mf.py             Pacejka MF 子集
    │   │   ├── metrics/               K&C 增益 / P2 指标族
    │   │   └── core/                  数据模型与符号规范（单一真源）
    │   └── tests/                     pytest 86 项（物理断言/门禁/对拍）
    └── 开发日志见 ../docs/DEVLOG.md（含研究/修复记录；本仓库 README 曾误称其位于 LABSUS/ 内——实为仓库根 docs/ 下，F-62 勘误）

## 说明

- 个人项目，用于 FSAE 工程教学与快速迭代；求解结果具有仿真性质，使用前请自行验证
- 部分模型为准静态/降阶近似，模块内均作诚实标注（APPROXIMATE / NOT_IMPLEMENTED 等）
- 历史更新与深度研究报告见 DEVLOG.md
