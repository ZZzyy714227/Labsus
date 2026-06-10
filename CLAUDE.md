我叫川陀，使用
# FSAE 悬架分析软件
每次完成一轮修改都要简单的同步开发文档

## 项目概述

Formula Student（大学生方程式）悬架几何分析与可视化工具。核心能力：3D 建模双叉臂悬架 → 拖动轮胎看运动学联动 → 实时计算定位角度 → 迭代调整硬点。

- **悬架拓扑**：前轴双侧双叉臂 + 推杆，每个 A 臂两个独立鱼眼轴承（球铰）
- **坐标系**：X 向前、Y 向右、Z 向上，原点 = 前轴中心地面
- **3D 风格**：纯线框（小球 = 硬点，彩色线段 = 连杆，半透明面片 = 立柱）
- **技术路线**：先 Web+Three.js 原型验证，再 PySide6 桌面版，对比后选一条走到底

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
New_suspension/
├── run.py                # 入口点（添加 src/ 到 path，启动 uvicorn）
│
├── src/                  # Python 后端
│   ├── main.py           # FastAPI 应用 + API 路由
│   ├── config.py         # 设计参数、车架节点、车身覆盖面、空力配置
│   ├── geometry.py       # 纯数学工具（vec3, dist, 投影, 旋转）
│   ├── hardpoints.py     # 硬点派生 + 覆盖读写 + 镜像工具
│   ├── tire.py           # 轮胎模型 + 接地点计算
│   ├── persistence.py    # 源文件 I/O（永久保存写入函数）
│   └── api_models.py     # Pydantic 请求模型
│
├── web/                  # 前端
│   └── index.html        # Three.js + Chart.js 单页应用
│
├── data/                 # 运行时数据（已 gitignore）
│   ├── hardpoint_overrides.json
│   └── defaults_pipe.json
│
├── logs/                 # 运行时日志（已 gitignore）
│   └── server.log
│
├── docs/                 # 项目文档
│   ├── DEVLOG.md
│   ├── PLAN.md
│   ├── AERO_SIDE_DEVICES.md
│   ├── superpowers/
│   └── FSAE赛车CAD模型构造观察报告.docx
│
├── ref/                  # 参考资料
│   ├── chassis_rules.txt
│   ├── OptimumKinematics - Help File.pdf
│   └── 2025中国大学生方程式大赛规则_最终版.pdf
│
├── CLAUDE.md             # 项目约定（本文件）
├── requirements.txt
└── .gitignore
```

## 运行方式

```bash
pip install -r requirements.txt
python run.py
# 浏览器打开 http://localhost:8000
```
