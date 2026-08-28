我叫川陀，使用
# FSAE 悬架分析软件
每次完成一轮修改都要简单的同步开发文档

## 项目概述

Formula Student（大学生方程式）悬架几何分析与可视化工具。核心能力：3D 建模双叉臂悬架 → 拖动轮胎看运动学联动 → 实时计算定位角度 → 迭代调整硬点。

- **悬架拓扑**：前轴双侧双叉臂 + 推杆，每个 A 臂两个独立鱼眼轴承（球铰）
- **坐标系**：X 向前、Y 向右、Z 向上，原点 = 前轴中心地面
- **3D 风格**：纯线框（小球 = 硬点，彩色线段 = 连杆，半透明面片 = 立柱）
- **技术路线**：原生单文件 Web（HTML5 + Canvas 2D，无外部框架）；PySide6 桌面版路线已弃（从未实现）

## 开发哲学

> **先做最小版本可行性验证，再逐步开发下一个功能。**

每个阶段只做一个东西，做到能用、能肉眼验证，确认方向正确后再加下一个。不提前设计过度抽象的结构。

### V1 的"最小可行"定义

一个 HTML + 一个 Python 后端，能：
1. 渲染前轴双侧双叉臂线框
2. 轮跳滑块驱动悬架运动（1-DOF 纯轮跳）
3. 硬点表格可编辑
4. 实时显示 camber 数值
5. 肉眼验证：A 臂绕正确轴线转动、立柱保持刚体、不穿模不反关节

### 技术决策

- **前后端分离**：Python FastAPI（计算引擎）+ 浏览器 Three.js（3D 渲染），REST 通信
- **运动学求解器**：几何迭代法，从轮跳位移出发逐级求解约束
- **初始参数**：自生成一套比例协调的硬点，用户在此基础上改到自己的真实悬架
- **V1 简化**：不做摇臂/减震器，推杆上端固定于车架，推杆长度作为输出
- **原型先走 Web**，因为 Three.js 的 3D 交互（OrbitControls、DragControls）比 Python OpenGL 成熟太多

## 项目结构

```
New_suspension/                          # git 仓库根
├── LABSUS/                              # 项目主体（当前开发主线）
│   ├── web/
│   │   ├── dwb-pro-fullchassis.html     # 完整版前端（约 7500 行，主力入口）
│   │   ├── dwb-pro-allinone.html        # 综合版（内置 TPHYS 赛道物理，零依赖）
│   │   ├── tphys_parity.cjs             # TPHYS↔Python 对拍 runner
│   │   └── serve_nocache.py             # 开发静态服务 (:8921)
│   ├── engine/                          # FastAPI 引擎 (:8001)
│   │   ├── server.py
│   │   ├── src/api  src/solver  src/components  src/tire_mf.py  src/metrics  src/core
│   │   └── tests/                       # pytest（当前 79 项）
│   ├── README.md / README.en.md / LICENSE
│   └── scratch_head_end.txt             # 历史草稿（gitignore）
├── docs/
│   ├── DEVLOG.md                        # 开发日志（含研究/修复/勘误）
│   ├── learning/explainers/             # 讲义（.claude_pdf/ 与 pdf/ 产物已 gitignore）
│   └── superpowers/  research/  bench/
├── CLAUDE.md                            # 项目约定（本文件）
├── Gemini.html                          # 历史草稿（gitignore）
└── src/  dwb-mod/  web/  scratch_*      # 历史旧版/双轨遗留，勿改
```

## 运行方式

方式 A（完整引擎，体验全部 K&C）：

    cd LABSUS/engine
    pip install fastapi uvicorn pydantic numpy scipy
    python server.py          # http://127.0.0.1:8001

打开 LABSUS/web/dwb-pro-fullchassis.html（或 allinone）→ 左上角「连接引擎」。

方式 B（零依赖综合版）：直接双击 LABSUS/web/dwb-pro-allinone.html —— 赛道仿真用内置
JS 物理（TPHYS），无需后端；K&C/整车高级分析仍建议连接引擎。

约定：每完成一轮修改，简单同步 docs/DEVLOG.md。
